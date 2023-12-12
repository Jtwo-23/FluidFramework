/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { type SharedTreeShim, SharedTreeShimFactory } from "@fluid-experimental/tree";
import {
	type ITree,
	type TreeView,
	TreeFactory,
	SchemaFactory,
	TreeConfiguration,
} from "@fluid-experimental/tree2";
import { stringToBuffer } from "@fluid-internal/client-utils";
import { describeCompat } from "@fluid-private/test-version-utils";
import {
	ContainerRuntimeFactoryWithDefaultDataStore,
	DataObject,
	DataObjectFactory,
} from "@fluidframework/aqueduct";
import {
	type ContainerRuntime,
	type IContainerRuntimeOptions,
} from "@fluidframework/container-runtime";
import { type IFluidHandle } from "@fluidframework/core-interfaces";
import { type IChannel } from "@fluidframework/datastore-definitions";
import { waitForContainerConnection, type ITestObjectProvider } from "@fluidframework/test-utils";

const newSharedTreeFactory = new TreeFactory({});
const builder = new SchemaFactory("test");
// For now this is the schema of the view.root
class HandleType extends builder.object("handleObj", {
	handle: builder.optional(builder.handle),
}) {}

function getNewTreeView(tree: ITree): TreeView<HandleType> {
	return tree.schematize(
		new TreeConfiguration(HandleType, () => ({
			handle: undefined,
		})),
	);
}
// A Test Data Object that exposes some basic functionality.
class TestDataObject extends DataObject {
	private channel?: IChannel;
	// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
	public get _root() {
		return this.root;
	}

	public get containerRuntime(): ContainerRuntime {
		return this.context.containerRuntime as ContainerRuntime;
	}

	public async createBlob(content: string): Promise<IFluidHandle<ArrayBufferLike>> {
		const buffer = stringToBuffer(content, "utf8");
		return this.runtime.uploadBlob(buffer);
	}

	// The object starts with a LegacySharedTree
	public async initializingFirstTime(props?: unknown): Promise<void> {
		const tree = this.runtime.createChannel("tree", newSharedTreeFactory.type);

		this.root.set("tree", tree.handle);
		this.channel = tree;
	}

	// Makes it so we can get the tree stored as "tree"
	public async hasInitialized(): Promise<void> {
		// We are using runtime.getChannel here instead of fetching the handle
		// TODO: handle tests
		const tree = await this.runtime.getChannel("tree");
		this.channel = tree;
	}

	// Allows us to get the SharedObject with whatever type we want
	public getTree<T>(): T {
		assert(this.channel !== undefined, "Channel should be defined");
		return this.channel as T;
	}
}

class ChildDataObject extends DataObject {
	// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
	public get _root() {
		return this.root;
	}
}

describeCompat("Storing handles detached", "NoCompat", (getTestObjectProvider) => {
	// Allow us to control summaries
	const runtimeOptions: IContainerRuntimeOptions = {
		summaryOptions: {
			summaryConfigOverrides: {
				state: "disabled",
			},
		},
	};

	const sharedTreeShimFactory = new SharedTreeShimFactory(newSharedTreeFactory);
	const dataObjectFactory2 = new DataObjectFactory(
		"TestDataObject",
		TestDataObject,
		[sharedTreeShimFactory], // Use the migrationShimFactory instead of the LegacySharedTreeFactory
		{},
	);
	const childObjectFactory = new DataObjectFactory("ChildDataObject", ChildDataObject, [], {});

	// The 2nd runtime factory, V2 of the code
	const runtimeFactory2 = new ContainerRuntimeFactoryWithDefaultDataStore({
		defaultFactory: dataObjectFactory2,
		registryEntries: [dataObjectFactory2.registryEntry, childObjectFactory.registryEntry],
		runtimeOptions,
	});

	let provider: ITestObjectProvider;

	beforeEach(async () => {
		provider = getTestObjectProvider();
	});

	it.skip("Detached handles", async () => {
		const loader = provider.createLoader([[provider.defaultCodeDetails, runtimeFactory2]]);

		const container1 = await loader.createDetachedContainer(provider.defaultCodeDetails);
		const testObj1 = (await container1.getEntryPoint()) as TestDataObject;
		const shim1 = testObj1.getTree<SharedTreeShim>();
		const tree1 = shim1.currentTree;
		const node1 = getNewTreeView(tree1).root;

		const childObject1 = await childObjectFactory.createInstance(testObj1.containerRuntime);
		node1.handle = childObject1.handle;

		const request = provider.driver.createCreateNewRequest(provider.documentId);
		await container1.attach(request);
		await waitForContainerConnection(container1);

		await provider.ensureSynchronized();

		const container2 = await provider.loadContainer(runtimeFactory2);
		const testObj2 = (await container2.getEntryPoint()) as TestDataObject;
		const shim2 = testObj2.getTree<SharedTreeShim>();
		const tree2 = shim2.currentTree;
		const node2 = getNewTreeView(tree2).root;

		const handle1 = node1.handle;
		const handle2 = node2.handle;
		assert(handle1 !== undefined, "handle1 should be defined");
		assert(handle2 !== undefined, "handle2 should be defined");
		const obj1 = (await handle1.get()) as TestDataObject;
		const obj2 = (await handle2.get()) as TestDataObject;
		obj1._root.set("foo", "bar");
		await provider.ensureSynchronized();
		assert(obj1._root.get("foo") === "bar", "expected obj1 to be live and sync");
		assert(obj2._root.get("foo") === "bar", "expected obj2 to be live and sync");
	});
});
