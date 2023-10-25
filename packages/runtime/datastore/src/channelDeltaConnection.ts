/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { IDeltaConnection, IDeltaHandler } from "@fluidframework/datastore-definitions";
import { DataProcessingError } from "@fluidframework/telemetry-utils";
import { IFluidHandle } from "@fluidframework/core-interfaces";

export class ChannelDeltaConnection implements IDeltaConnection {
	private _handler: IDeltaHandler | undefined;

	private get handler(): IDeltaHandler {
		assert(!!this._handler, 0x177 /* "Missing delta handler" */);
		return this._handler;
	}
	public get connected(): boolean {
		return this._connected;
	}

	constructor(
		private _connected: boolean,
		private readonly submitFn: (
			content: any,
			localOpMetadata: unknown,
			rootMetadata: unknown,
		) => void,
		public readonly dirty: () => void,
		public readonly addedGCOutboundReference: (
			srcHandle: IFluidHandle,
			outboundHandle: IFluidHandle,
		) => void,
	) {}

	/** @deprecated Use submit2 instead */
	public submit(messageContent: any, localOpMetadata: unknown): void {
		this.submitFn(messageContent, localOpMetadata, /* rootMetadata */ undefined);
	}

	public submit2(data: {
		messageContent: unknown;
		localOpMetadata: unknown;
		rootMetadata: unknown;
	}): void {
		this.submitFn(data.messageContent, data.localOpMetadata, data.rootMetadata);
	}

	public attach(handler: IDeltaHandler) {
		assert(this._handler === undefined, 0x178 /* "Missing delta handler on attach" */);
		this._handler = handler;
	}

	public setConnectionState(connected: boolean) {
		this._connected = connected;
		this.handler.setConnectionState(connected);
	}

	public process(message: ISequencedDocumentMessage, local: boolean, localOpMetadata: unknown) {
		try {
			// catches as data processing error whether or not they come from async pending queues
			this.handler.process(message, local, localOpMetadata);
		} catch (error) {
			throw DataProcessingError.wrapIfUnrecognized(
				error,
				"channelDeltaConnectionFailedToProcessMessage",
				message,
			);
		}
	}

	public reSubmit(content: any, localOpMetadata: unknown) {
		this.handler.reSubmit(content, localOpMetadata);
	}

	public rollback(content: any, localOpMetadata: unknown) {
		if (this.handler.rollback === undefined) {
			throw new Error("Handler doesn't support rollback");
		}
		this.handler.rollback(content, localOpMetadata);
	}

	public applyStashedOp(content: any): unknown {
		return this.handler.applyStashedOp(content);
	}
}
