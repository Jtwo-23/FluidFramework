/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { serializeError } from "serialize-error";
import { Deferred } from "@fluidframework/common-utils";
import {
	ICache,
	IClientManager,
	IDocumentStorage,
	IOrdererManager,
	IRunner,
	ITenantManager,
	IThrottler,
	IThrottleAndUsageStorageManager,
	IWebServer,
	IWebServerFactory,
	ITokenRevocationManager,
	IWebSocketTracker,
	IRevokedTokenChecker,
} from "@fluidframework/server-services-core";
import { Provider } from "nconf";
import * as winston from "winston";
import { createMetricClient } from "@fluidframework/server-services";
import { LumberEventName, Lumberjack } from "@fluidframework/server-services-telemetry";
import { configureWebSocketServices } from "@fluidframework/server-lambdas";
import * as app from "./app";

export class NexusRunner implements IRunner {
	private server: IWebServer;
	private runningDeferred: Deferred<void>;
	private stopped: boolean = false;
	private readonly runnerMetric = Lumberjack.newLumberMetric(LumberEventName.NexusRunner);

	constructor(
		private readonly serverFactory: IWebServerFactory,
		private readonly config: Provider,
		private readonly port: string | number,
		private readonly orderManager: IOrdererManager,
		private readonly tenantManager: ITenantManager,
		private readonly socketConnectTenantThrottler: IThrottler,
		private readonly socketConnectClusterThrottler: IThrottler,
		private readonly socketSubmitOpThrottler: IThrottler,
		private readonly socketSubmitSignalThrottler: IThrottler,
		private readonly storage: IDocumentStorage,
		private readonly clientManager: IClientManager,
		private readonly metricClientConfig: any,
		private readonly throttleAndUsageStorageManager?: IThrottleAndUsageStorageManager,
		private readonly verifyMaxMessageSize?: boolean,
		private readonly redisCache?: ICache,
		private readonly socketTracker?: IWebSocketTracker,
		private readonly tokenRevocationManager?: ITokenRevocationManager,
		private readonly revokedTokenChecker?: IRevokedTokenChecker,
	) {}

	// eslint-disable-next-line @typescript-eslint/promise-function-async
	public start(): Promise<void> {
		this.runningDeferred = new Deferred<void>();

		// Create the HTTP server and attach nexus to it
		const nexus = app.create(this.config);
		nexus.set("port", this.port);

		this.server = this.serverFactory.create(nexus);

		const httpServer = this.server.httpServer;

		const maxNumberOfClientsPerDocument = this.config.get(
			"nexus:maxNumberOfClientsPerDocument",
		);
		const numberOfMessagesPerTrace = this.config.get("nexus:numberOfMessagesPerTrace");
		const maxTokenLifetimeSec = this.config.get("auth:maxTokenLifetimeSec");
		const isTokenExpiryEnabled = this.config.get("auth:enableTokenExpiration");
		const isClientConnectivityCountingEnabled = this.config.get(
			"usage:clientConnectivityCountingEnabled",
		);
		const isSignalUsageCountingEnabled = this.config.get("usage:signalUsageCountingEnabled");

		// Register all the socket.io stuff
		configureWebSocketServices(
			this.server.webSocketServer,
			this.orderManager,
			this.tenantManager,
			this.storage,
			this.clientManager,
			createMetricClient(this.metricClientConfig),
			winston,
			maxNumberOfClientsPerDocument,
			numberOfMessagesPerTrace,
			maxTokenLifetimeSec,
			isTokenExpiryEnabled,
			isClientConnectivityCountingEnabled,
			isSignalUsageCountingEnabled,
			this.redisCache,
			this.socketConnectTenantThrottler,
			this.socketConnectClusterThrottler,
			this.socketSubmitOpThrottler,
			this.socketSubmitSignalThrottler,
			this.throttleAndUsageStorageManager,
			this.verifyMaxMessageSize,
			this.socketTracker,
			this.revokedTokenChecker,
		);

		// Listen on provided port, on all network interfaces.
		httpServer.listen(this.port);
		httpServer.on("error", (error) => this.onError(error));
		httpServer.on("listening", () => this.onListening());
		httpServer.on("upgrade", (req, socket, initialMsgBuffer) => {
		    Lumberjack.info(`WS: Upgraded http request connections: ${socket.server._connections}`);
		    socket.on("close", (hadError: boolean) => {
			Lumberjack.error(
			    `WS: socket closed. ${socket.server._connections}`,
			    { hadError: hadError.toString() }
			);
		    });
		    socket.on("error", (error) => {
			Lumberjack.error(
			    "WS: error",
			    {
				bytesRead: socket.bytesRead,
				bytesWritten: socket.bytesWritten,
				error: error.toString(),
			    },
			    error,
			);
		    });
		});

		// Start token manager
		if (this.tokenRevocationManager) {
			this.tokenRevocationManager.start().catch((error) => {
				// Prevent service crash if token revocation manager fails to start
				Lumberjack.error("Failed to start token revocation manager.", undefined, error);
			});
		}

		this.stopped = false;

		return this.runningDeferred.promise;
	}

	public async stop(caller?: string, uncaughtException?: any): Promise<void> {
		if (this.stopped) {
			return;
		}
		this.stopped = true;

		try {
			// Close the underlying server and then resolve the runner once closed
			await this.server.close();
			if (caller === "uncaughtException") {
				this.runningDeferred?.reject({
					uncaughtException: serializeError(uncaughtException),
				}); // reject the promise so that the runService exits the process with exit(1)
			} else {
				this.runningDeferred?.resolve();
			}
			this.runningDeferred = undefined;
			if (!this.runnerMetric.isCompleted()) {
				this.runnerMetric.success("Nexus runner stopped");
			}
		} catch (error) {
			if (!this.runnerMetric.isCompleted()) {
				this.runnerMetric.error("Nexus runner encountered an error during stop", error);
			}
			if (caller === "sigterm") {
				this.runningDeferred?.resolve();
			} else {
				// uncaughtException
				this.runningDeferred?.reject({
					forceKill: true,
					uncaughtException: serializeError(uncaughtException),
					runnerStopException: serializeError(error),
				});
			}
			this.runningDeferred = undefined;
			throw error;
		}
	}

	/**
	 * Event listener for HTTP server "error" event.
	 */
	private onError(error) {
		if (!this.runnerMetric.isCompleted()) {
			this.runnerMetric.error("Nexus runner encountered an error in http server", error);
		}
		if (error.syscall !== "listen") {
			throw error;
		}

		const bind = typeof this.port === "string" ? `Pipe ${this.port}` : `Port ${this.port}`;

		// Handle specific listen errors with friendly messages
		switch (error.code) {
			case "EACCES":
				this.runningDeferred?.reject(`${bind} requires elevated privileges`);
				this.runningDeferred = undefined;
				break;
			case "EADDRINUSE":
				this.runningDeferred?.reject(`${bind} is already in use`);
				this.runningDeferred = undefined;
				break;
			default:
				throw error;
		}
	}

	/**
	 * Event listener for HTTP server "listening" event.
	 */
	private onListening() {
		const addr = this.server.httpServer.address();
		const bind = typeof addr === "string" ? `pipe ${addr}` : `port ${addr.port}`;
		winston.info(`Listening on ${bind}`);
		Lumberjack.info(`Listening on ${bind}`);
	}
}
