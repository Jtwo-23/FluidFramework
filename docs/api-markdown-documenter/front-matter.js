/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const {
	createDocumentWriter,
	getLinkForApiItem,
	getUnscopedPackageName,
	renderNodeAsMarkdown,
	transformTsdocNode,
} = require("@fluid-tools/api-markdown-documenter");
const { ApiItemKind } = require("@microsoft/api-extractor-model");
const os = require("os");

const generatedContentNotice =
	"[//]: # (Do not edit this file. It is automatically generated by @fluidtools/api-markdown-documenter.)";

/**
 * Creates Hugo front-matter for the given API item.
 * This will be appended to the top of the generated API documents.
 *
 * @param {ApiItem} apiItem - The root API item of the document being rendered.
 * @param {MarkdownDocumenterConfiguration} config - See
 * {@link @fluid-tools/api-markdown-documenter#MarkdownDocumenterConfiguration}.
 *
 * @returns The JSON-formatted Hugo front-matter as a `string`.
 */
function createHugoFrontMatter(apiItem, config, customRenderers) {
	function extractSummary() {
		const summaryParagraph = transformTsdocNode(
			apiItem.tsdocComment.summarySection,
			apiItem,
			config,
		);

		if (!summaryParagraph) {
			return "";
		}

		const documentWriter = createDocumentWriter();
		renderNodeAsMarkdown(summaryParagraph, documentWriter, {
			customRenderers,
		});
		return documentWriter.getText().replace(/"/g, "'").trim();
	}

	const frontMatter = {};
	frontMatter.title = apiItem.displayName.replace(/"/g, "").replace(/!/g, "");
	let apiMembers = apiItem.members;
	switch (apiItem.kind) {
		case ApiItemKind.Model:
			frontMatter.title = "Package Reference";
			break;
		case ApiItemKind.Class:
			if (apiItem.tsdocComment) {
				frontMatter.summary = extractSummary();
			}
			frontMatter.title += " Class";
			break;
		case ApiItemKind.Interface:
			frontMatter.title += " Interface";
			if (apiItem.tsdocComment) {
				frontMatter.summary = extractSummary();
			}
			break;
		case ApiItemKind.Package:
			frontMatter.title += " Package";
			apiMembers = apiItem.entryPoints[0].members;
			if (apiItem.tsdocComment) {
				frontMatter.summary = extractSummary();
			}
			break;
		case ApiItemKind.Namespace:
			frontMatter.title += " Namespace";
			apiMembers = apiItem.members;
			if (apiItem.tsdocComment) {
				frontMatter.summary = extractSummary();
			}
			break;
		default:
			break;
	}

	frontMatter.kind = apiItem.kind;

	frontMatter.members = new Map();
	apiMembers.forEach((element) => {
		if (element.displayName === "") {
			return;
		}
		if (!frontMatter.members[element.kind]) {
			frontMatter.members[element.kind] = {};
		}
		const link = getLinkForApiItem(element, config);
		frontMatter.members[element.kind][element.displayName] = link.target;
	});

	const associatedPackage = apiItem.getAssociatedPackage();
	if (associatedPackage) {
		frontMatter.package = associatedPackage.name.replace(/"/g, "").replace(/!/g, "");
		frontMatter.unscopedPackageName = getUnscopedPackageName(associatedPackage);
	} else {
		frontMatter.package = "undefined";
	}

	const hugoFrontMatter = JSON.stringify(frontMatter, undefined, 2).trim();

	// Also add comment noting that the contents are generated and should not be manually edited.
	return [hugoFrontMatter, generatedContentNotice].join(`${os.EOL}${os.EOL}`).trim();
}

module.exports = {
	createHugoFrontMatter,
};
