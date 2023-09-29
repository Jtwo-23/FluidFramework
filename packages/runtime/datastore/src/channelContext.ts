/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	DataCorruptionError,
	ITelemetryLoggerExt,
	tagCodeArtifacts,
} from "@fluidframework/telemetry-utils";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import {
	IChannel,
	IChannelAttributes,
	IChannelFactory,
	IFluidDataStoreRuntime,
} from "@fluidframework/datastore-definitions";
import { IDocumentStorageService } from "@fluidframework/driver-definitions";
import { ISequencedDocumentMessage, ISnapshotTree } from "@fluidframework/protocol-definitions";
import {
	IGarbageCollectionData,
	IExperimentalIncrementalSummaryContext,
	ISummarizeResult,
	ISummaryTreeWithStats,
	ITelemetryContext,
	IFluidDataStoreContext,
} from "@fluidframework/runtime-definitions";
import { addBlobToSummary } from "@fluidframework/runtime-utils";
import { readAndParse } from "@fluidframework/driver-utils";
import { ChannelStorageService } from "./channelStorageService";
import { ChannelDeltaConnection } from "./channelDeltaConnection";
import { ISharedObjectRegistry } from "./dataStoreRuntime";

export const attributesBlobKey = ".attributes";

export interface IChannelContext {
	getChannel(): Promise<IChannel>;

	setConnectionState(connected: boolean, clientId?: string);

	processOp(message: ISequencedDocumentMessage, local: boolean, localOpMetadata?: unknown): void;

	summarize(
		fullTree?: boolean,
		trackState?: boolean,
		telemetryContext?: ITelemetryContext,
	): Promise<ISummarizeResult>;

	reSubmit(content: any, localOpMetadata: unknown): void;

	applyStashedOp(content: any): unknown;

	rollback(message: any, localOpMetadata: unknown): void;

	/**
	 * Returns the data used for garbage collection. This includes a list of GC nodes that represent this context
	 * including any of its children. Each node has a set of outbound routes to other GC nodes in the document.
	 * @param fullGC - true to bypass optimizations and force full generation of GC data.
	 */
	getGCData(fullGC?: boolean): Promise<IGarbageCollectionData>;

	/**
	 * After GC has run, called to notify this context of routes that are used in it. These are used for the following:
	 * 1. To identify if this context is being referenced in the document or not.
	 * 2. To identify if this context or any of its children's used routes changed since last summary.
	 * 3. They are added to the summary generated by this context.
	 */
	updateUsedRoutes(usedRoutes: string[]): void;
}

export interface ChannelServiceEndpoints {
	deltaConnection: ChannelDeltaConnection;
	objectStorage: ChannelStorageService;
}

export function createChannelServiceEndpoints(
	connected: boolean,
	submitFn: (content: any, localOpMetadata: unknown, rootMetadata?: unknown) => void,
	dirtyFn: () => void,
	addedGCOutboundReferenceFn: (srcHandle: IFluidHandle, outboundHandle: IFluidHandle) => void,
	storageService: IDocumentStorageService,
	logger: ITelemetryLoggerExt,
	tree?: ISnapshotTree,
	extraBlobs?: Map<string, ArrayBufferLike>,
): ChannelServiceEndpoints {
	const deltaConnection = new ChannelDeltaConnection(
		connected,
		(message, localOpMetadata, rootMetadata) =>
			submitFn(message, localOpMetadata, rootMetadata),
		dirtyFn,
		addedGCOutboundReferenceFn,
	);
	const objectStorage = new ChannelStorageService(tree, storageService, logger, extraBlobs);

	return {
		deltaConnection,
		objectStorage,
	};
}

export function summarizeChannel(
	channel: IChannel,
	fullTree: boolean = false,
	trackState: boolean = false,
	telemetryContext?: ITelemetryContext,
): ISummaryTreeWithStats {
	const summarizeResult = channel.getAttachSummary(fullTree, trackState, telemetryContext);

	// Add the channel attributes to the returned result.
	addBlobToSummary(summarizeResult, attributesBlobKey, JSON.stringify(channel.attributes));
	return summarizeResult;
}

export async function summarizeChannelAsync(
	channel: IChannel,
	fullTree: boolean = false,
	trackState: boolean = false,
	telemetryContext?: ITelemetryContext,
	incrementalSummaryContext?: IExperimentalIncrementalSummaryContext,
): Promise<ISummaryTreeWithStats> {
	const summarizeResult = await channel.summarize(
		fullTree,
		trackState,
		telemetryContext,
		incrementalSummaryContext,
	);

	// Add the channel attributes to the returned result.
	addBlobToSummary(summarizeResult, attributesBlobKey, JSON.stringify(channel.attributes));
	return summarizeResult;
}

export async function loadChannelFactoryAndAttributes(
	dataStoreContext: IFluidDataStoreContext,
	services: ChannelServiceEndpoints,
	channelId: string,
	registry: ISharedObjectRegistry,
	attachMessageType?: string,
): Promise<{ factory: IChannelFactory; attributes: IChannelAttributes }> {
	let attributes: IChannelAttributes | undefined;
	if (await services.objectStorage.contains(attributesBlobKey)) {
		attributes = await readAndParse<IChannelAttributes | undefined>(
			services.objectStorage,
			attributesBlobKey,
		);
	}

	// This is a backward compatibility case where the attach message doesn't include attributes. They must
	// include attach message type.
	// Since old attach messages will not have attributes, we need to keep this as long as we support old attach
	// messages.
	const channelFactoryType = attributes ? attributes.type : attachMessageType;
	if (channelFactoryType === undefined) {
		throw new DataCorruptionError(
			"channelTypeNotAvailable",
			tagCodeArtifacts({
				channelId,
				dataStoreId: dataStoreContext.id,
				dataStorePackagePath: dataStoreContext.packagePath.join("/"),
				channelFactoryType,
			}),
		);
	}
	const factory = registry.get(channelFactoryType);
	if (factory === undefined) {
		throw new DataCorruptionError(
			"channelFactoryNotRegisteredForGivenType",
			tagCodeArtifacts({
				channelId,
				dataStoreId: dataStoreContext.id,
				dataStorePackagePath: dataStoreContext.packagePath.join("/"),
				channelFactoryType,
			}),
		);
	}
	// This is a backward compatibility case where the attach message doesn't include attributes. Get the attributes
	// from the factory.
	attributes = attributes ?? factory.attributes;
	return { factory, attributes };
}

export async function loadChannel(
	dataStoreRuntime: IFluidDataStoreRuntime,
	attributes: IChannelAttributes,
	factory: IChannelFactory,
	services: ChannelServiceEndpoints,
	logger: ITelemetryLoggerExt,
	channelId: string,
): Promise<IChannel> {
	// Compare snapshot version to collaborative object version
	if (
		attributes.snapshotFormatVersion !== undefined &&
		attributes.snapshotFormatVersion !== factory.attributes.snapshotFormatVersion
	) {
		logger.sendTelemetryEvent({
			eventName: "ChannelAttributesVersionMismatch",
			...tagCodeArtifacts({
				channelType: attributes.type,
				channelSnapshotVersion: `${attributes.snapshotFormatVersion}@${attributes.packageVersion}`,
				channelCodeVersion: `${factory.attributes.snapshotFormatVersion}@${factory.attributes.packageVersion}`,
			}),
		});
	}

	return factory.load(dataStoreRuntime, channelId, services, attributes);
}
