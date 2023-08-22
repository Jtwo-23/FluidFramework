/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IEvent } from "@fluidframework/common-definitions";
import { IClient, IConnected } from "@fluidframework/protocol-definitions";

/**
 * Connection details of a client
 */
export interface IConnectedClient {
	/**
	 *
	 */
	connection: IConnected;

	/**
	 *
	 */
	details: IClient;

	/**
	 * Client protocol versions of standard semver types.
	 */
	connectVersions: string[];
}

/**
 * Identifies a collaboration session for a particular document in a particular instance (tenant) of a Fluid Service.
 */
export interface IRoom {
	/**
	 * ID of instance of an ordering service that the application will interact with
	 */
	tenantId: string;

	/**
	 * ID of the document (typically known as container ID within Fluid Framework)
	 */
	documentId: string;
}

/**
 * Payload of the event emitted when the broadcastSignal endpoint is called.
 */
export interface IBroadcastSignalEventPayload {
	/**
	 * The room the signal is sent to.
	 */
	signalRoom: IRoom;
	/**
	 * Content of the runtime signal introduced from the broadcast-signal endpoint.
	 */
	signalContent: string;
}

/**
 * Events emitted during Fluid clients collaboration session
 */
export interface ICollaborationSessionEvents extends IEvent {
	/**
	 * Emitted when the broadcastSignal endpoint is called by an external
	 * server to communicate with all Fluid clients in a session via signal
	 */
	(
		event: "broadcastSignal",
		listener: (broadcastSignal: IBroadcastSignalEventPayload) => void,
	): void;
}
