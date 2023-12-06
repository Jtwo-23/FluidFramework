/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const chalk = require("chalk");
const yaml = require('js-yaml');
const fs   = require('fs');
const { renderApiDocumentation } = require("./render-api-documentation");

const renderMultiVersion = process.argv[2];

let versions;

try {
	versions = yaml.load(fs.readFileSync('./data/versions.yaml', 'utf8'));
  } catch (e) {
	console.log(e);
}

docVersions = renderMultiVersion ? versions.params.previousVersions : versions.params.currentVersion;

docVersions.forEach(version => {
	renderApiDocumentation(version).then(
		() => {
			console.log(chalk.green("API docs written!"));
			process.exit(0);
		},
		(error) => {
			console.error("API docs could not be written due to an error:", error);
			process.exit(1);
		},
	);
});