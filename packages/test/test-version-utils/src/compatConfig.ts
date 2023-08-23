/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { assert } from "@fluidframework/common-utils";
import { Lazy } from "@fluidframework/core-utils";
import { fromInternalScheme, isInternalVersionScheme } from "@fluid-tools/version-tools";
import {
	CompatKind,
	compatKind,
	compatVersions,
	driver,
	r11sEndpointName,
	tenantIndex,
	reinstall,
} from "../compatOptions.cjs";
import { ensurePackageInstalled } from "./testApi.js";
import { pkgVersion } from "./packageVersion.js";
import { baseVersion } from "./baseVersion.js";

/*
 * Generate configuration combinations for a particular compat version
 * NOTE: Please update this packages README.md if the default versions and config combination changes
 */
interface CompatConfig {
	name: string;
	kind: CompatKind;
	compatVersion: number | string;
	loader?: string | number;
	driver?: string | number;
	containerRuntime?: string | number;
	dataRuntime?: string | number;
}

const defaultCompatVersions = {
	// N and N - 1
	currentVersionDeltas: [0, -1],
	// we are currently supporting 1.3.4 long-term
	ltsVersions: ["^1.3.4"],
};

function genConfig(compatVersion: number | string): CompatConfig[] {
	if (compatVersion === 0) {
		return [
			{
				// include the base version if it is not the same as the package version and it is not the test build
				name: `Non-Compat${baseVersion !== pkgVersion ? ` v${baseVersion}` : ""}`,
				kind: CompatKind.None,
				compatVersion: 0,
			},
		];
	}

	const allOld = {
		loader: compatVersion,
		driver: compatVersion,
		containerRuntime: compatVersion,
		dataRuntime: compatVersion,
	};

	const compatVersionStr =
		typeof compatVersion === "string" ? compatVersion : `N${compatVersion}`;
	return [
		{
			name: `compat ${compatVersionStr} - old loader`,
			kind: CompatKind.Loader,
			compatVersion,
			loader: compatVersion,
		},
		{
			name: `compat ${compatVersionStr} - new loader`,
			kind: CompatKind.NewLoader,
			compatVersion,
			...allOld,
			loader: undefined,
		},
		{
			name: `compat ${compatVersionStr} - old driver`,
			kind: CompatKind.Driver,
			compatVersion,
			driver: compatVersion,
		},
		{
			name: `compat ${compatVersionStr} - new driver`,
			kind: CompatKind.NewDriver,
			compatVersion,
			...allOld,
			driver: undefined,
		},
		{
			name: `compat ${compatVersionStr} - old container runtime`,
			kind: CompatKind.ContainerRuntime,
			compatVersion,
			containerRuntime: compatVersion,
		},
		{
			name: `compat ${compatVersionStr} - new container runtime`,
			kind: CompatKind.NewContainerRuntime,
			compatVersion,
			...allOld,
			containerRuntime: undefined,
		},
		{
			name: `compat ${compatVersionStr} - old data runtime`,
			kind: CompatKind.DataRuntime,
			compatVersion,
			dataRuntime: compatVersion,
		},
		{
			name: `compat ${compatVersionStr} - new data runtime`,
			kind: CompatKind.NewDataRuntime,
			compatVersion,
			...allOld,
			dataRuntime: undefined,
		},
	];
}

const genLTSConfig = (compatVersion: number | string): CompatConfig[] => {
	return [
		{
			name: `compat LTS ${compatVersion} - old loader`,
			kind: CompatKind.Loader,
			compatVersion,
			loader: compatVersion,
		},
		{
			name: `compat LTS ${compatVersion} - old loader + old driver`,
			kind: CompatKind.LoaderDriver,
			compatVersion,
			driver: compatVersion,
			loader: compatVersion,
		},
	];
};

const genBackCompatConfig = (compatVersion: number): CompatConfig[] => {
	return [
		{
			name: `compat back N${compatVersion} - older loader`,
			kind: CompatKind.Loader,
			compatVersion,
			loader: compatVersion,
		},
		{
			name: `compat back N${compatVersion} - older loader + older driver`,
			kind: CompatKind.LoaderDriver,
			compatVersion,
			driver: compatVersion,
			loader: compatVersion,
		},
	];
};

const genFullBackCompatConfig = (): CompatConfig[] => {
	const _configList: CompatConfig[] = [];
	// This will need to be updated once we move beyond 2.0.0-internal.x.y.z
	// Extract the major version of the package published, in this case it's the x in 2.0.0-internal.x.y.z.
	// This first if statement turns the internal version to x.y.z
	let version: string = pkgVersion;
	// This grabs the code version to find the backwards compatible options.
	const codeVersion = process.env.SETVERSION_CODEVERSION;
	if (codeVersion !== undefined && isInternalVersionScheme(codeVersion, true, true)) {
		version = codeVersion;
	}

	const [, semverInternal] = fromInternalScheme(version, true, true);

	assert(semverInternal !== undefined, "Unexpected pkg version");
	// Get the major version from x.y.z. Note: sometimes it's x.y.z.a as we append build version to the package version
	const greatestMajor = semverInternal.major;
	// This makes the assumption N and N-1 scenarios are already fully tested thus skipping 0 and -1.
	// This loop goes as far back as 2.0.0.internal.1.y.z.
	// The idea is to generate all the versions from -2 -> - (major - 1) the current major version (i.e 2.0.0-internal.9.y.z would be -8)
	// This means as the number of majors increase the number of versions we support - this may be updated in the future.
	for (let i = 2; i < greatestMajor; i++) {
		_configList.push(...genBackCompatConfig(-i));
	}
	return _configList;
};

export interface CompatVersion {
	base: string;
	delta: number;
}

export interface CompatVersionConfig {
	name: string;
	createWith: CompatVersion;
	loadWith: CompatVersion;
}

export const getMajorCompatConfig = (): CompatVersionConfig[] => {
	const allDefaultDeltaVersions = defaultCompatVersions.currentVersionDeltas.map((delta) => ({
		base: pkgVersion,
		// temporary: using delta*10 to differentiate delta for major version instead of delta for internal version
		delta: delta * 10,
	}));

	return allDefaultDeltaVersions
		.map((createVersion) =>
			allDefaultDeltaVersions.map((loadVersion) => ({
				name: `Major compat \
create with [${createVersion.base} ${createVersion.delta === 0 ? "" : createVersion.delta}], \
load with [${loadVersion.base} ${loadVersion.delta === 0 ? "" : loadVersion.delta}]`,
				createWith: createVersion,
				loadWith: loadVersion,
			})),
		)
		.reduce((a, b) => a.concat(b))
		.filter((config) => config.createWith !== config.loadWith);
};

export const configList = new Lazy<readonly CompatConfig[]>(() => {
	// set it in the env for parallel workers
	if (compatKind) {
		process.env.fluid__test__compatKind = JSON.stringify(compatKind);
	}
	if (compatVersions) {
		process.env.fluid__test__compatVersion = JSON.stringify(compatVersions);
	}
	process.env.fluid__test__driver = driver;
	process.env.fluid__test__r11sEndpointName = r11sEndpointName;
	process.env.fluid__test__tenantIndex = tenantIndex.toString();
	process.env.fluid__test__baseVersion = baseVersion;

	let _configList: CompatConfig[] = [];
	if (!compatVersions || compatVersions.length === 0) {
		defaultCompatVersions.currentVersionDeltas.forEach((value) => {
			_configList.push(...genConfig(value));
		});
		if (process.env.fluid__test__backCompat === "FULL") {
			_configList.push(...genFullBackCompatConfig());
		}
		defaultCompatVersions.ltsVersions.forEach((value) => {
			_configList.push(...genLTSConfig(value));
		});
	} else {
		compatVersions.forEach((value) => {
			if (value === "LTS") {
				defaultCompatVersions.ltsVersions.forEach((lts) => {
					_configList.push(...genLTSConfig(lts));
				});
			} else if (value === "FULL") {
				_configList.push(...genFullBackCompatConfig());
			} else {
				const num = parseInt(value, 10);
				if (num.toString() === value) {
					_configList.push(...genConfig(num));
				} else {
					_configList.push(...genConfig(value));
				}
			}
		});
	}

	if (compatKind !== undefined) {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		_configList = _configList.filter((value) => compatKind!.includes(value.kind));
	}
	return _configList;
});

/**
 * Mocha start up to ensure legacy versions are installed
 * @privateRemarks
 * This isn't currently used in a global setup hook due to https://github.com/mochajs/mocha/issues/4508.
 * Instead, we ensure that all requested compatibility versions are loaded at `describeCompat` module import time by
 * leveraging top-level await.
 *
 * This makes compatibility layer APIs (e.g. DDSes, data object, etc.) available at mocha suite creation time rather than
 * hook/test execution time, which is convenient for test authors: this sort of code can be used
 * ```ts
 * describeCompat("my suite", (getTestObjectProvider, apis) => {
 *     class MyDataObject extends apis.dataRuntime.DataObject {
 *         // ...
 *     }
 * });
 * ```
 *
 * instead of code like this:
 *
 * ```ts
 * describeCompat("my suite", (getTestObjectProvider, getApis) => {
 *
 *     const makeDataObjectClass = (apis: CompatApis) => class MyDataObject extends apis.dataRuntime.DataObject {
 *         // ...
 *     }
 *
 *     before(() => {
 *         // `getApis` can only be invoked from inside a hook or test
 *         const MyDataObject = makeDataObjectClass(getApis())
 *     });
 * });
 * ```
 *
 * If the linked github issue is ever fixed, this can be once again used as a global setup fixture.
 */
export async function mochaGlobalSetup() {
	const versions = new Set(configList.value.map((value) => value.compatVersion));
	if (versions.size === 0) {
		return;
	}

	// Make sure we wait for all before returning, even if one of them has error.
	const installP = Array.from(versions.values()).map(async (value) =>
		ensurePackageInstalled(baseVersion, value, reinstall),
	);

	let error: unknown;
	for (const p of installP) {
		try {
			await p;
		} catch (e) {
			error = e;
		}
	}
	if (error) {
		// eslint-disable-next-line @typescript-eslint/no-throw-literal -- Rethrows caught value
		throw error;
	}
}
