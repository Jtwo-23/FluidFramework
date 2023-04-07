/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// TODOs:
// - Better documentation terminology WRT "inbound" vs "outbound" events.
//   - Since the types and utilities are re-used between the packages, these should be documented in
//     explicit terms of the debugger to/from external consumer.

/**
 * This directory contains types and utilities for use in window-based messaging, used
 * by the Fluid Client Debugger.
 */

export { devtoolsMessageSource } from "./Constants";
export {
	AudienceSummary,
	CloseContainer,
	ConnectContainer,
	ContainerStateChange,
	ContainerStateHistory,
	DataVisualization,
	DisconnectContainer,
	GetAudienceSummary,
	GetContainerState,
	GetDataVisualization,
	GetRootDataVisualizations,
	RootDataVisualizations,
} from "./container-devtools-messages";
export { ContainerList, GetContainerList } from "./devtools-messages";
export { ISourcedDebuggerMessage, IDebuggerMessage } from "./Messages";
export { IMessageRelay, IMessageRelayEvents } from "./MessageRelay";
export { GetTelemetryHistory, TelemetryEvent, TelemetryHistory } from "./telemetry-messages";
export {
	handleIncomingMessage,
	handleIncomingWindowMessage,
	InboundHandlers,
	isDebuggerMessage,
	MessageLoggingOptions,
	postMessagesToWindow,
} from "./Utilities";
