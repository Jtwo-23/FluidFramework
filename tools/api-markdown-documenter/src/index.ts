/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Contains a programatic API for generating {@link https://en.wikipedia.org/wiki/Markdown | Markdown} documentation
 * from an API report generated by {@link https://api-extractor.com/ | API-Extractor}.
 *
 * @remarks Akin to {@link https://github.com/microsoft/rushstack/tree/main/apps/api-documenter | API-Documenter} and
 * is heavily based upon it, but is designed to be more extensible and to be be used programatically.
 *
 * @packageDocumentation
 */

// TODOs:
// - bundle helper libraries as module (namespace) exports?

export {
	type ApiItemTransformationConfiguration,
	type ApiItemTransformationOptions,
	type DefaultDocumentationSuiteOptions,
	type DocumentationSuiteOptions,
	type DocumentBoundaries,
	// TODO: remove this once utility APIs can be called with partial configs.
	getApiItemTransformationConfigurationWithDefaults,
	type HierarchyBoundaries,
	type TransformApiItemWithChildren,
	type TransformApiItemWithoutChildren,
	transformApiModel,
	transformTsdocNode,
} from "./api-item-transforms";

// We want to make sure the entirety of this domain is accessible.
// eslint-disable-next-line no-restricted-syntax
export * from "./documentation-domain";

export {
	DocumentWriter,
	type HtmlRenderContext,
	type HtmlRenderers,
	type HtmlRenderConfiguration,
	type MarkdownRenderContext,
	type MarkdownRenderers,
	type MarkdownRenderConfiguration,
} from "./renderers";
export type { ConfigurationBase } from "./ConfigurationBase";
export type { FileSystemConfiguration } from "./FileSystemConfiguration";
export type { Heading } from "./Heading";
export type { Link, UrlTarget } from "./Link";
export { loadModel } from "./LoadModel";
export {
	defaultConsoleLogger,
	type LoggingFunction,
	type Logger,
	verboseConsoleLogger,
} from "./Logging";
export {
	type ApiFunctionLike,
	type ApiMemberKind,
	type ApiModifier,
	type ApiModuleLike,
	type ApiSignatureLike,
} from "./utilities";

// #region Scoped exports

// This pattern is required to scope the utilities in a way that API-Extractor supports.
/* eslint-disable unicorn/prefer-export-from */

// Export `ApiItem`-related utilities
import * as ApiItemUtilities from "./ApiItemUtilitiesModule";

// Export layout-related utilities (for use in writing custom transformations)
import * as LayoutUtilities from "./LayoutUtilitiesModule";

// Export renderers
import * as HtmlRenderer from "./HtmlRendererModule";
import * as MarkdownRenderer from "./MarkdownRendererModule";

export {
	/**
	 * Utilities for use with `ApiItem`s.
	 *
	 * @remarks
	 *
	 * These are intended to be useful when injecting custom `ApiItem` transformation behaviors via {@link ApiItemTransformationConfiguration}.
	 *
	 * @public
	 */
	ApiItemUtilities,
	/**
	 * Utilities related to generating {@link DocumentationNode} content for {@link @microsoft/api-extractor-model#ApiItem}s.
	 *
	 * @remarks
	 *
	 * These are intended to be useful when injecting custom `ApiItem` transformation behaviors via {@link ApiItemTransformationConfiguration}.
	 *
	 * @public
	 */
	LayoutUtilities,
	/**
	 * Functionality for rendering {@link DocumentationNode}s as HTML.
	 *
	 * @alpha
	 */
	HtmlRenderer,
	/**
	 * Functionality for rendering {@link DocumentationNode}s as Markdown.
	 *
	 * @public
	 */
	MarkdownRenderer,
};

/* eslint-enable unicorn/prefer-export-from */

// #endregion

// #region Convenience re-exports

// Convenience re-exports
export {
	type ApiItem,
	ApiItemKind,
	type ApiModel,
	type ApiPackage,
	ReleaseTag,
} from "@microsoft/api-extractor-model";
export { NewlineKind } from "@rushstack/node-core-library";
