/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { IDeltaConnection, IDeltaHandler } from "@fluidframework/datastore-definitions";
import { DataProcessingError } from "@fluidframework/telemetry-utils";
import { IFluidHandle } from "@fluidframework/core-interfaces";

const stashedOpMetadataMark = Symbol();

type StashedOpMetadata = { contents: any; metadata: unknown }[] &
	Record<typeof stashedOpMetadataMark, typeof stashedOpMetadataMark>;

function createStashedOpMetadata(): StashedOpMetadata {
	const arr = [];
	Object.defineProperty(arr, stashedOpMetadataMark, {
		value: stashedOpMetadataMark,
		writable: false,
		enumerable: true,
	});
	return arr as any as StashedOpMetadata;
}

function isStashedOpMetadata(md: unknown): md is StashedOpMetadata {
	return (
		Array.isArray(md) &&
		stashedOpMetadataMark in md &&
		md[stashedOpMetadataMark] === stashedOpMetadataMark
	);
}

function processWithStashedOpMetadataHandling(
	content: any,
	localOpMetaData: unknown,
	func: (contents: any, metadata: unknown) => void,
) {
	if (isStashedOpMetadata(localOpMetaData)) {
		localOpMetaData.forEach(({ contents, metadata }) => func(contents, metadata));
	} else {
		func(content, localOpMetaData);
	}
}

export class ChannelDeltaConnection implements IDeltaConnection {
	private _handler: IDeltaHandler | undefined;
	private stashedOpMd: StashedOpMetadata | undefined;

	private get handler(): IDeltaHandler {
		assert(!!this._handler, 0x177 /* "Missing delta handler" */);
		return this._handler;
	}
	public get connected(): boolean {
		return this._connected;
	}

	constructor(
		private _connected: boolean,
		private readonly submitFn: (content: any, localOpMetadata: unknown) => void,
		public readonly dirty: () => void,
		/** @deprecated There is no replacement for this, its functionality is no longer needed at this layer. */
		public readonly addedGCOutboundReference: (
			srcHandle: IFluidHandle,
			outboundHandle: IFluidHandle,
		) => void,
	) {}

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
			processWithStashedOpMetadataHandling(
				message.contents,
				localOpMetadata,
				(contents, metadata) =>
					this.handler.process({ ...message, contents }, local, metadata),
			);
		} catch (error) {
			throw DataProcessingError.wrapIfUnrecognized(
				error,
				"channelDeltaConnectionFailedToProcessMessage",
				message,
			);
		}
	}

	public reSubmit(content: any, localOpMetadata: unknown) {
		processWithStashedOpMetadataHandling(
			content,
			localOpMetadata,
			this.handler.reSubmit.bind(this.handler),
		);
	}

	public rollback(content: any, localOpMetadata: unknown) {
		if (this.handler.rollback === undefined) {
			throw new Error("Handler doesn't support rollback");
		}
		processWithStashedOpMetadataHandling(
			content,
			localOpMetadata,
			this.handler.rollback.bind(this.handler),
		);
	}

	public applyStashedOp(content: any): unknown {
		try {
			this.stashedOpMd = createStashedOpMetadata();
			const md = this.handler.applyStashedOp(content);
			if (md !== undefined) {
				// temporary assert while we migrate dds to the new pattern
				// after migration we will always return stashedOpMd
				assert(
					(this.stashedOpMd?.length ?? 0) === 0,
					"stashedOpMd should be empty if metadata returned. this means ops were submitted and local op metadata was returned. this will cause a corruption",
				);
				return md;
			}
			return this.stashedOpMd;
		} finally {
			this.stashedOpMd = undefined;
		}
	}

	public submit(contents: any, metadata: unknown): void {
		if (this.stashedOpMd !== undefined) {
			this.stashedOpMd.push({ contents, metadata });
		} else {
			this.submitFn(contents, metadata);
		}
	}
}
