/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*
 * This index script runs `render-api-documentation.js` using the version configurations described
 * in data/versions.json.
 */

const chalk = require("chalk");
const path = require("path");
const versions = require("../data/versions.json");
const { renderApiDocumentation } = require("./render-api-documentation");

const docVersions = versions.params.previousVersions.concat(versions.params.currentVersion);

Promise.all(
	docVersions.map(async (version) => {
		const apiReportsDirectoryPath = path.resolve(
			__dirname,
			"..",
			"..",
			`_api-extractor-temp-${version}`,
			"doc-models",
		);

		const apiDocsDirectoryPath = path.resolve(
			__dirname,
			"..",
			"content",
			"docs",
			"api",
			version,
		);

		const uriRootDirectoryPath = `docs/api/${version}`;

		await renderApiDocumentation(
			apiReportsDirectoryPath,
			apiDocsDirectoryPath,
			uriRootDirectoryPath,
			version,
		);

		console.log(chalk.green(`(${version}) API docs written!`));
	}),
).then(
	() => {
		console.log(chalk.green("All API docs written!"));
		process.exit(0);
	},
	(error) => {
		console.error(chalk.red("API docs generation failed due to one or more errors:"));
		console.error(error);
		process.exit(1);
	},
);
