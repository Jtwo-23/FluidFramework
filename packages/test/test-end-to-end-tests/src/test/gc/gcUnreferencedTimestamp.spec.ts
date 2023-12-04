/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { stringToBuffer } from "@fluid-internal/client-utils";
import { IContainer } from "@fluidframework/container-definitions";
import { ISummaryTree, SummaryType } from "@fluidframework/protocol-definitions";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import { SharedMap } from "@fluidframework/map";
import { gcTreeKey } from "@fluidframework/runtime-definitions";
import {
	ITestObjectProvider,
	createSummarizer,
	summarizeNow,
	waitForContainerConnection,
} from "@fluidframework/test-utils";
import {
	describeCompat,
	ITestDataObject,
	TestDataObjectType,
} from "@fluid-private/test-version-utils";
import { defaultGCConfig } from "./gcTestConfigs.js";
import { getGCStateFromSummary } from "./gcTestSummaryUtils.js";

/**
 * Validates that the unreferenced timestamp is correctly set in the GC summary tree. Also, the timestamp is removed
 * when an unreferenced node becomes referenced again.
 */
describeCompat("GC unreferenced timestamp", "NoCompat", (getTestObjectProvider) => {
	let provider: ITestObjectProvider;
	let mainContainer: IContainer;
	let containerRuntime: IContainerRuntime;
	let dataStoreA: ITestDataObject;

	/**
	 * Submits a summary and returns the unreferenced timestamp for all the nodes in the container. If a node is
	 * referenced, the unreferenced timestamp is undefined.
	 * @returns a map of nodePath to its unreferenced timestamp.
	 */
	async function getUnreferencedTimestamps(summaryTree: ISummaryTree) {
		const gcState = getGCStateFromSummary(summaryTree);
		assert(gcState !== undefined, "GC tree is not available in the summary");

		const nodeTimestamps: Map<string, number | undefined> = new Map();
		for (const [nodePath, nodeData] of Object.entries(gcState.gcNodes)) {
			nodeTimestamps.set(nodePath.slice(1), nodeData.unreferencedTimestampMs);
		}

		return nodeTimestamps;
	}

	beforeEach(async function () {
		provider = getTestObjectProvider({ syncSummarizer: true });
		// These tests validate the GC state in summary generated by the container runtime. They do not care
		// about the snapshot that is downloaded from the server. So, it doesn't need to run against real services.
		if (provider.driver.type !== "local") {
			this.skip();
		}

		mainContainer = await provider.makeTestContainer(defaultGCConfig);
		dataStoreA = (await mainContainer.getEntryPoint()) as ITestDataObject;
		containerRuntime = dataStoreA._context.containerRuntime as IContainerRuntime;
		await waitForContainerConnection(mainContainer);
	});

	async function createNewDataStore() {
		const newDataStore = await containerRuntime.createDataStore(TestDataObjectType);
		return (await newDataStore.entryPoint.get()) as ITestDataObject;
	}

	describe("unreferenced timestamp in summary", () => {
		it("adds / removes unreferenced timestamp for data stores correctly", async () => {
			const { summarizer } = await createSummarizer(provider, mainContainer);

			// Create a new data store and mark it as referenced by storing its handle in a referenced DDS.
			const dataStoreB = await createNewDataStore();
			dataStoreA._root.set("dataStoreB", dataStoreB.handle);

			// Validate that the new data store does not have unreferenced timestamp.
			await provider.ensureSynchronized();
			const summaryResult1 = await summarizeNow(summarizer);
			const timestamps1 = await getUnreferencedTimestamps(summaryResult1.summaryTree);
			const dsBTimestamp1 = timestamps1.get(dataStoreB._context.id);
			assert(
				dsBTimestamp1 === undefined,
				`new data store should not have unreferenced timestamp`,
			);

			// Mark the data store as unreferenced by deleting its handle from the DDS and validate that it now has an
			// unreferenced timestamp.
			dataStoreA._root.delete("dataStoreB");

			await provider.ensureSynchronized();
			const summaryResult2 = await summarizeNow(summarizer);
			const timestamps2 = await getUnreferencedTimestamps(summaryResult2.summaryTree);
			const dsBTimestamp2 = timestamps2.get(dataStoreB._context.id);
			assert(dsBTimestamp2 !== undefined, `data store should have unreferenced timestamp`);

			// Perform some operations and generate another summary. The GC state does not have changed so we should
			// get a handle for it.
			dataStoreA._root.set("key", "value");
			await provider.ensureSynchronized();
			const summaryResult3 = await summarizeNow(summarizer);
			assert.strictEqual(
				summaryResult3.summaryTree.tree[gcTreeKey].type,
				SummaryType.Handle,
				"GC state should be a handle",
			);

			// Mark the data store as referenced again and validate that the unreferenced timestamp is removed.
			dataStoreA._root.set("dataStoreB", dataStoreB.handle);

			// Validate that the data store does not have unreferenced timestamp after being referenced.
			await provider.ensureSynchronized();
			const summaryResult4 = await summarizeNow(summarizer);
			const timestamps3 = await getUnreferencedTimestamps(summaryResult4.summaryTree);
			const dsBTimestamp3 = timestamps3.get(dataStoreB._context.id);
			assert(
				dsBTimestamp3 === undefined,
				`data store should not have unreferenced timestamp anymore`,
			);
		});

		it("adds / removes unreferenced timestamp for attachment blobs correctly", async () => {
			const { summarizer } = await createSummarizer(provider, mainContainer);

			// Upload an attachment blob and mark it as referenced by storing its handle in a referenced DDS.
			const blob1Contents = "Blob contents 1";
			const blob1Handle = await dataStoreA._context.uploadBlob(
				stringToBuffer(blob1Contents, "utf-8"),
			);
			const blob1NodePath = blob1Handle.absolutePath.slice(1);
			dataStoreA._root.set("blob1", blob1Handle);

			// Validate that the new blob does not have unreferenced timestamp.
			await provider.ensureSynchronized();
			const summaryResult1 = await summarizeNow(summarizer);
			const timestamps1 = await getUnreferencedTimestamps(summaryResult1.summaryTree);
			const blob1Timestamp1 = timestamps1.get(blob1NodePath);
			assert(blob1Timestamp1 === undefined, `blob1 should not have unreferenced timestamp`);

			// Mark the blob as unreferenced by deleting its handle from the DDS and validate that it now has an
			// unreferenced timestamp.
			dataStoreA._root.delete("blob1");

			await provider.ensureSynchronized();
			const summaryResult2 = await summarizeNow(summarizer);
			const timestamps2 = await getUnreferencedTimestamps(summaryResult2.summaryTree);
			const blob1Timestamp2 = timestamps2.get(blob1NodePath);
			assert(blob1Timestamp2 !== undefined, `blob1 should have unreferenced timestamp`);

			// Perform some operations and generate another summary. The GC state does not have changed so we should
			// get a handle for it.
			dataStoreA._root.set("key", "value");
			await provider.ensureSynchronized();
			const summaryResult3 = await summarizeNow(summarizer);
			assert.strictEqual(
				summaryResult3.summaryTree.tree[gcTreeKey].type,
				SummaryType.Handle,
				"GC state should be a handle",
			);

			// Mark the blob as referenced again and validate that the unreferenced timestamp is removed.
			dataStoreA._root.set("blob1", blob1Handle);
			// Validate that the blob does not have unreferenced timestamp after being referenced.
			await provider.ensureSynchronized();
			const summaryResult4 = await summarizeNow(summarizer);
			const timestamps3 = await getUnreferencedTimestamps(summaryResult4.summaryTree);
			const blob1Timestamp3 = timestamps3.get(blob1NodePath);
			assert(
				blob1Timestamp3 === undefined,
				`blob1 should not have unreferenced timestamp anymore`,
			);
		});

		it("uses unreferenced timestamp from previous summary correctly", async () => {
			const { summarizer: summarizer1 } = await createSummarizer(provider, mainContainer);

			// Create a new data store and mark it as referenced by storing its handle in a referenced DDS.
			const dataStoreB = await createNewDataStore();
			dataStoreA._root.set("dataStoreB", dataStoreB.handle);

			// Upload an attachment blob and mark it as referenced by storing its handle in a referenced DDS.
			const blob1Contents = "Blob contents 1";
			const blob1Handle = await dataStoreA._context.uploadBlob(
				stringToBuffer(blob1Contents, "utf-8"),
			);
			const blob1NodePath = blob1Handle.absolutePath.slice(1);
			dataStoreA._root.set("blob1", blob1Handle);

			// Validate that the new data store and blob do not have unreferenced timestamp.
			await provider.ensureSynchronized();
			const summaryResult1 = await summarizeNow(summarizer1);
			const timestamps1 = await getUnreferencedTimestamps(summaryResult1.summaryTree);
			const dsBTimestamp1 = timestamps1.get(dataStoreB._context.id);
			assert(
				dsBTimestamp1 === undefined,
				`new data store should not have unreferenced timestamp`,
			);
			const blob1Timestamp1 = timestamps1.get(blob1NodePath);
			assert(blob1Timestamp1 === undefined, `blob1 should not have unreferenced timestamp`);

			// Mark the data store and blob as unreferenced by deleting their handle from the DDS, and validate that
			// they have unreferenced timestamp.
			dataStoreA._root.delete("dataStoreB");
			dataStoreA._root.delete("blob1");
			await provider.ensureSynchronized();
			const summaryResult2 = await summarizeNow(summarizer1);
			const timestamps2 = await getUnreferencedTimestamps(summaryResult2.summaryTree);
			const dsBTimestamp2 = timestamps2.get(dataStoreB._context.id);
			assert(dsBTimestamp2 !== undefined, `data store should have unreferenced timestamp`);
			const blob1Timestamp2 = timestamps2.get(blob1NodePath);
			assert(blob1Timestamp2 !== undefined, `blob1 should have unreferenced timestamp`);

			// Load a new summarizer from the last summary. Validate that the GC state has not changed and we get a
			// handle for it.
			summarizer1.close();
			const { summarizer: summarizer2 } = await createSummarizer(
				provider,
				mainContainer,
				undefined,
				summaryResult2.summaryVersion,
			);

			await provider.ensureSynchronized();
			const summaryResult3 = await summarizeNow(summarizer2);
			assert.strictEqual(
				summaryResult3.summaryTree.tree[gcTreeKey].type,
				SummaryType.Handle,
				"GC state should be a handle",
			);
		});
	});

	/*
	 * These tests validate scenarios where nodes that are referenced between summaries have their unreferenced
	 * timestamp updated. These scenarios fall into the following categories:
	 * 1. Nodes transition from unreferenced -> referenced -> unreferenced between 2 summaries - In these scenarios
	 *    when GC runs, it should detect that the node was referenced and update its unreferenced timestamp.
	 * 2. Unreferenced nodes are referenced from other unreferenced nodes - In this case, even though the node remains
	 *    unreferenced, its unreferenced timestamp should be updated.
	 *
	 * In these tests, V = nodes and E = edges between nodes. Root nodes that are always referenced are marked as *.
	 * The nodes are data stores / DDSes represented by alphabets A, B, C and so on.
	 */
	describe("References between summaries", () => {
		describe("Nodes transitioning from unreferenced -> referenced -> unreferenced", () => {
			/*
			 * Validates that we can detect references that were added and then removed.
			 * 1. Summary 1 at t1. V = [A*, B]. E = []. B has unreferenced time t1.
			 * 2. Op adds reference from A to B. E = [A -> B].
			 * 3. Op removes reference from A to B. E = [].
			 * 4. Summary 2 at t2. V = [A*, B]. E = []. B has unreferenced time t2.
			 * Validates that the unreferenced time for B is t2 which is > t1.
			 */
			it(`Scenario 1 - Reference added and then removed`, async () => {
				const { summarizer } = await createSummarizer(provider, mainContainer);

				// Create data store B and mark it as referenced by storing its handle in A.
				const dataStoreB = await createNewDataStore();
				dataStoreA._root.set("dataStoreB", dataStoreB.handle);

				// Remove the reference to B which marks is as unreferenced.
				dataStoreA._root.delete("dataStoreB");

				// 1. Get summary 1 and validate that B has unreferenced timestamp. E = [].
				await provider.ensureSynchronized();
				const summaryResult1 = await summarizeNow(summarizer);
				const timestamps1 = await getUnreferencedTimestamps(summaryResult1.summaryTree);
				const dsBTime1 = timestamps1.get(dataStoreB._context.id);
				assert(dsBTime1 !== undefined, `B should have unreferenced timestamp`);

				// 2. Add referenced from A to B. E = [A -> B].
				dataStoreA._root.set("dataStoreB", dataStoreB.handle);

				// 3. Remove reference from A to B. E = [].
				dataStoreA._root.delete("dataStoreB");

				// 4. Get summary 2 and validate B's unreferenced timestamp updated. E = [].
				await provider.ensureSynchronized();
				const summaryResult2 = await summarizeNow(summarizer);
				const timestamps2 = await getUnreferencedTimestamps(summaryResult2.summaryTree);
				const dsBTime2 = timestamps2.get(dataStoreB._context.id);
				assert(
					dsBTime2 !== undefined && dsBTime2 > dsBTime1,
					`B's timestamp should have updated`,
				);
			});

			/*
			 * Validates that we can detect references that were added transitively and then removed.
			 * 1. Summary 1 at t1. V = [A*, B, C]. E = [B -> C]. B and C have unreferenced time t1.
			 * 2. Op adds reference from A to B. E = [A -> B, B -> C].
			 * 3. Op removes reference from B to C. E = [A -> B].
			 * 4. Op removes reference from A to B. E = [].
			 * 5. Summary 2 at t2. V = [A*, B, C]. E = []. B and C have unreferenced time t2.
			 * Validates that the unreferenced time for B and C is t2 which is > t1.
			 */
			it(`Scenario 2 - Reference transitively added and removed`, async () => {
				const { summarizer } = await createSummarizer(provider, mainContainer);

				// Create data stores B and C and mark them referenced as follows by storing their handles as follows:
				// dataStoreA -> dataStoreB -> dataStoreC
				const dataStoreB = await createNewDataStore();
				const dataStoreC = await createNewDataStore();
				dataStoreB._root.set("dataStoreC", dataStoreC.handle);
				dataStoreA._root.set("dataStoreB", dataStoreB.handle);

				// Remove the reference to B which marks both B and C as unreferenced.
				dataStoreA._root.delete("dataStoreB");

				// 1. Get summary 1 and validate that both B and C have unreferenced timestamps. E = [B -> C].
				await provider.ensureSynchronized();
				const summaryResult1 = await summarizeNow(summarizer);
				const timestamps1 = await getUnreferencedTimestamps(summaryResult1.summaryTree);
				const dsBTime1 = timestamps1.get(dataStoreB._context.id);
				const dsCTime1 = timestamps1.get(dataStoreC._context.id);
				assert(dsBTime1 !== undefined, `B should have unreferenced timestamp`);
				assert(dsCTime1 !== undefined, `C should have unreferenced timestamp`);

				// 2. Add reference from A to B. E = [A -> B, B -> C].
				dataStoreA._root.set("dataStoreB", dataStoreB.handle);

				// 3. Remove reference from B to C. E = [A -> B].
				dataStoreB._root.delete("dataStoreC");

				// 4. Remove reference from A to B. E = [].
				dataStoreA._root.delete("dataStoreB");

				// 5. Get summary 2 and validate that both B and C's unreferenced timestamps updated. E = [].
				await provider.ensureSynchronized();
				const summaryResult2 = await summarizeNow(summarizer);
				const timestamps2 = await getUnreferencedTimestamps(summaryResult2.summaryTree);
				const dsBTime2 = timestamps2.get(dataStoreB._context.id);
				const dsCTime2 = timestamps2.get(dataStoreC._context.id);
				assert(
					dsBTime2 !== undefined && dsBTime2 > dsBTime1,
					`B's timestamp should have updated`,
				);
				assert(
					dsCTime2 !== undefined && dsCTime2 > dsCTime1,
					`C's timestamp should have updated`,
				);
			});

			/*
			 * Validates that we can detect chain of references in which the first reference was added and then removed.
			 * 1. Summary 1 at t1. V = [A*, B, C, D]. E = [B -> C, C -> D]. B, C and D have unreferenced time t1.
			 * 2. Op adds reference from A to B. E = [A -> B, B -> C, C -> D].
			 * 3. Op removes reference from A to B. E = [B -> C, C -> D].
			 * 4. Summary 2 at t2. V = [A*, B, C, D]. E = [B -> C, C -> D]. B, C and D have unreferenced time t2.
			 * Validates that the unreferenced time for B, C and D is t2 which is > t1.
			 */
			it(`Scenario 3 - Reference added through chain of references and removed`, async () => {
				const { summarizer } = await createSummarizer(provider, mainContainer);

				// Create data stores B, C and D and mark them referenced as follows by storing their handles as follows:
				// dataStoreA -> dataStoreB -> dataStoreC -> dataStoreD
				const dataStoreB = await createNewDataStore();
				const dataStoreC = await createNewDataStore();
				const dataStoreD = await createNewDataStore();
				dataStoreB._root.set("dataStoreC", dataStoreC.handle);
				dataStoreC._root.set("dataStoreD", dataStoreD.handle);
				dataStoreA._root.set("dataStoreB", dataStoreB.handle);

				// Remove the reference to B which marks B, C and D as unreferenced.
				dataStoreA._root.delete("dataStoreB");

				// 1. Get summary 1 and validate that B, C and D have unreferenced timestamps. E = [B -> C, C -> D].
				await provider.ensureSynchronized();
				const summaryResult1 = await summarizeNow(summarizer);
				const timestamps1 = await getUnreferencedTimestamps(summaryResult1.summaryTree);
				const dsBTime1 = timestamps1.get(dataStoreB._context.id);
				const dsCTime1 = timestamps1.get(dataStoreC._context.id);
				const dsDTime1 = timestamps1.get(dataStoreD._context.id);
				assert(dsBTime1 !== undefined, `B should have unreferenced timestamp`);
				assert(dsCTime1 !== undefined, `C should have unreferenced timestamp`);
				assert(dsDTime1 !== undefined, `D should have unreferenced timestamp`);

				// 2. Add reference from A to B. E = [A -> B, B -> C, C -> D].
				dataStoreA._root.set("dataStoreB", dataStoreB.handle);

				// 3. Remove reference from A to B. E = [B -> C, C -> D].
				dataStoreA._root.delete("dataStoreB");

				// 4. Get summary 2 and validate that B, C and D's unreferenced timestamps updated. E = [B -> C, C -> D].
				await provider.ensureSynchronized();
				const summaryResult2 = await summarizeNow(summarizer);
				const timestamps2 = await getUnreferencedTimestamps(summaryResult2.summaryTree);
				const dsBTime2 = timestamps2.get(dataStoreB._context.id);
				const dsCTime2 = timestamps2.get(dataStoreC._context.id);
				const dsDTime2 = timestamps2.get(dataStoreD._context.id);
				assert(
					dsBTime2 !== undefined && dsBTime2 > dsBTime1,
					`B's timestamp should have updated`,
				);
				assert(
					dsCTime2 !== undefined && dsCTime2 > dsCTime1,
					`C's timestamp should have updated`,
				);
				assert(
					dsDTime2 !== undefined && dsDTime2 > dsDTime1,
					`D's timestamp should have updated`,
				);
			});

			/*
			 * Validates that we can detect references that were added and removed via new data stores.
			 * 1. Summary 1 at t1. V = [A*, C]. E = []. C has unreferenced time t1.
			 * 2. Data store B is created. E = [].
			 * 3. Op adds reference from A to B. E = [A -> B].
			 * 4. Op adds reference from B to C. E = [A -> B, B -> C].
			 * 5. Op removes reference from B to C. E = [A -> B].
			 * 6. Summary 2 at t2. V = [A*, B, C]. E = [A -> B]. C has unreferenced time t2.
			 * Validates that the unreferenced time for C is t2 which is > t1.
			 */
			it(`Scenario 4 - Reference added and removed via new nodes`, async () => {
				const { summarizer } = await createSummarizer(provider, mainContainer);

				// Create data store C and mark it referenced by storing its handle in data store A.
				const dataStoreC = await createNewDataStore();
				dataStoreA._root.set("dataStoreC", dataStoreC.handle);

				// Remove the reference to C to make it unreferenced.
				dataStoreA._root.delete("dataStoreC");

				// 1. Get summary 1 and validate that C is has unreferenced timestamp. E = [].
				await provider.ensureSynchronized();
				const summaryResult1 = await summarizeNow(summarizer);
				const timestamps1 = await getUnreferencedTimestamps(summaryResult1.summaryTree);
				const dsCTime1 = timestamps1.get(dataStoreC._context.id);
				assert(dsCTime1 !== undefined, `C should have unreferenced timestamp`);

				// 2. Create data store B. E = [].
				const dataStoreB = await createNewDataStore();

				// 3. Add reference from A to B. E = [A -> B].
				dataStoreA._root.set("dataStoreB", dataStoreB.handle);

				// 4. Add reference from B to C. E = [A -> B, B -> C].
				dataStoreB._root.set("dataStoreC", dataStoreC.handle);

				// 5. Remove reference from B to C. E = [A -> B].
				dataStoreB._root.delete("dataStoreC");

				// 6. Get summary 2 and validate that C's unreferenced timestamps updated. E = [A -> B].
				await provider.ensureSynchronized();
				const summaryResult2 = await summarizeNow(summarizer);
				const timestamps2 = await getUnreferencedTimestamps(summaryResult2.summaryTree);
				const dsCTime2 = timestamps2.get(dataStoreC._context.id);
				assert(
					dsCTime2 !== undefined && dsCTime2 > dsCTime1,
					`C's timestamp should have updated`,
				);
			});

			/*
			 * Validates that we can detect references that were added and removed via new aliased data stores.
			 * 1. Summary 1 at t1. V = [A*, C]. E = []. C has unreferenced time t1.
			 * 2. Root data store B is created. E = [].
			 * 3. Op adds reference from A to B. E = [A -> B].
			 * 4. Op adds reference from B to C. E = [A -> B, B -> C].
			 * 5. Op removes reference from B to C. E = [A -> B].
			 * 6. Summary 2 at t2. V = [A*, B, C]. E = [A -> B]. C has unreferenced time t2.
			 * Validates that the unreferenced time for C is t2 which is > t1.
			 *
			 * The difference from the previous tests is that the new data stores is a root data store. So, this validates
			 * that we can detect new root data stores and outbound references from them.
			 */
			it(`Scenario 5 - Reference added via new root nodes and removed`, async () => {
				const { summarizer } = await createSummarizer(provider, mainContainer);

				// Create data store C and mark it referenced by storing its handle in data store A.
				const dataStoreC = await createNewDataStore();
				dataStoreA._root.set("dataStoreC", dataStoreC.handle);

				// Remove the reference to C to make it unreferenced.
				dataStoreA._root.delete("dataStoreC");

				// 1. Get summary 1 and validate that C is has unreferenced timestamp. E = [].
				await provider.ensureSynchronized();
				const summaryResult1 = await summarizeNow(summarizer);
				const timestamps1 = await getUnreferencedTimestamps(summaryResult1.summaryTree);
				const dsCTime1 = timestamps1.get(dataStoreC._context.id);
				assert(dsCTime1 !== undefined, `C should have unreferenced timestamp`);

				// 2. Create data store B. E = [].
				const dataStore = await containerRuntime.createDataStore(TestDataObjectType);
				await dataStore.trySetAlias("dataStoreA");
				const dataStoreB = (await dataStore.entryPoint.get()) as ITestDataObject;

				// 4. Add reference from B to C. E = [A -> B, B -> C].
				dataStoreB._root.set("dataStoreC", dataStoreC.handle);

				// 5. Remove reference from B to C. E = [A -> B].
				dataStoreB._root.delete("dataStoreC");

				// 6. Get summary 2 and validate that C's unreferenced timestamps updated. E = [A -> B].
				await provider.ensureSynchronized();
				const summaryResult2 = await summarizeNow(summarizer);
				const timestamps2 = await getUnreferencedTimestamps(summaryResult2.summaryTree);
				const dsCTime2 = timestamps2.get(dataStoreC._context.id);
				assert(
					dsCTime2 !== undefined && dsCTime2 > dsCTime1,
					`C's timestamp should have updated`,
				);
			});

			/*
			 * Validates that we can detect references that were added via new data stores before they are referenced
			 * themselves, and then the reference from the new data store is removed.
			 * 1. Summary 1 at t1. V = [A*, C]. E = []. C has unreferenced time t1.
			 * 2. Data store B is created. E = [].
			 * 3. Add reference from B to C. E = [].
			 * 4. Op adds reference from A to B. E = [A -> B, B -> C].
			 * 5. Op removes reference from B to C. E = [A -> B].
			 * 6. Summary 2 at t2. V = [A*, B, C]. E = [A -> B]. C has unreferenced time t2.
			 * Validates that the unreferenced time for C is t2 which is > t1.
			 *
			 * The difference from previous test case is that the reference from B to C is added before B is referenced and
			 * observed by summarizer. So, the summarizer does not see this reference directly but only when B is realized.
			 */
			it(`Scenario 6 - Reference added via new unreferenced nodes and removed`, async () => {
				const { summarizer } = await createSummarizer(provider, mainContainer);

				// Create data store C and mark it referenced by storing its handle in data store A.
				const dataStoreC = await createNewDataStore();
				dataStoreA._root.set("dataStoreC", dataStoreC.handle);

				// Remove the reference to C to make it unreferenced.
				dataStoreA._root.delete("dataStoreC");

				// 1. Get summary 1 and validate that C is has unreferenced timestamp. E = [].
				await provider.ensureSynchronized();
				const summaryResult1 = await summarizeNow(summarizer);
				const timestamps1 = await getUnreferencedTimestamps(summaryResult1.summaryTree);
				const dsCTime1 = timestamps1.get(dataStoreC._context.id);
				assert(dsCTime1 !== undefined, `C should have unreferenced timestamp`);

				// 2. Create data store B. E = [].
				const dataStoreB = await createNewDataStore();

				// 3. Add reference from B to C. E = [].
				dataStoreB._root.set("dataStoreC", dataStoreC.handle);

				// 4. Add reference from A to B. E = [A -> B, B -> C].
				dataStoreA._root.set("dataStoreB", dataStoreB.handle);

				// 5. Remove reference from B to C. E = [A -> B].
				dataStoreB._root.delete("dataStoreC");

				// 6. Get summary 2 and validate that C's unreferenced timestamps updated. E = [A -> B].
				await provider.ensureSynchronized();
				const summaryResult2 = await summarizeNow(summarizer);
				const timestamps2 = await getUnreferencedTimestamps(summaryResult2.summaryTree);
				const dsCTime2 = timestamps2.get(dataStoreC._context.id);
				assert(
					dsCTime2 !== undefined && dsCTime2 > dsCTime1,
					`C's timestamp should have updated`,
				);
			});

			/*
			 * Validates that we can detect references that were added transitively via new data stores before they are
			 * references themselves, and then the reference from the new data store is removed.
			 * 1. Summary 1 at t1. V = [A*, D]. E = []. D has unreferenced time t1.
			 * 2. Data stores B and C are created. E = [].
			 * 3. Add reference from B to C. E = [].
			 * 4. Add reference from C to D. E = [].
			 * 5. Op adds reference from A to B. E = [A -> B, B -> C, C -> D].
			 * 6. Op removes reference from C to D. E = [A -> B, B -> C].
			 * 7. Summary 2 at t2. V = [A*, B, C]. E = [A -> B, B -> C]. D has unreferenced time t2.
			 * Validates that the unreferenced time for D is t2 which is > t1.
			 *
			 * This difference from the previous test case is that there is another level of indirection here that
			 * references the node which was unreferenced in previous summary.
			 */
			it(`Scenario 7 - Reference added transitively via new nodes and removed`, async () => {
				const { summarizer } = await createSummarizer(provider, mainContainer);

				// Create data store D and mark it referenced by storing its handle in data store A.
				const dataStoreD = await createNewDataStore();
				dataStoreA._root.set("dataStoreD", dataStoreD.handle);

				// Remove the reference to D which marks it as unreferenced.
				dataStoreA._root.delete("dataStoreD");

				// 1. Get summary 1 and validate that D is has unreferenced timestamp. E = [].
				await provider.ensureSynchronized();
				const summaryResult1 = await summarizeNow(summarizer);
				const timestamps1 = await getUnreferencedTimestamps(summaryResult1.summaryTree);
				const dsDTime1 = timestamps1.get(dataStoreD._context.id);
				assert(dsDTime1 !== undefined, `D should have unreferenced timestamp`);

				// 2. Create data stores B and C. E = [].
				const dataStoreB = await createNewDataStore();
				const dataStoreC = await createNewDataStore();

				// 3. Add reference from B to C. E = [].
				dataStoreB._root.set("dataStoreC", dataStoreC.handle);

				// 4. Add reference from C to D. E = [].
				dataStoreC._root.set("dataStoreD", dataStoreD.handle);

				// 5. Add reference from A to B. E = [A -> B, B -> C, C -> D].
				dataStoreA._root.set("dataStoreB", dataStoreB.handle);

				// 6. Remove reference from C to D. E = [A -> B, B -> C].
				dataStoreC._root.delete("dataStoreD");

				// 7. Get summary 2 and validate that D's unreferenced timestamps updated. E = [A -> B, B -> C].
				await provider.ensureSynchronized();
				const summaryResult2 = await summarizeNow(summarizer);
				const timestamps2 = await getUnreferencedTimestamps(summaryResult2.summaryTree);
				const dsDTime2 = timestamps2.get(dataStoreD._context.id);
				assert(
					dsDTime2 !== undefined && dsDTime2 > dsDTime1,
					`D's timestamp should have updated`,
				);
			});

			/*
			 * Validates that DDSes are referenced even though we don't detect their referenced between summaries. Once we
			 * do GC at DDS level, this test will fail - https://github.com/microsoft/FluidFramework/issues/8470.
			 * 1. Summary 1 at t1. V = [A*]. E = [].
			 * 2. DDS B is created. No reference is added to it.
			 * 3. Summary 2 at t2. V = [A*, B]. E = []. B is still referenced.
			 */
			it(`Scenario 8 - Reference to DDS not added`, async () => {
				const { summarizer } = await createSummarizer(provider, mainContainer);

				// 1. Get summary 1 and validate that A is referenced. E = [].
				await provider.ensureSynchronized();
				const summaryResult1 = await summarizeNow(summarizer);
				const timestamps1 = await getUnreferencedTimestamps(summaryResult1.summaryTree);
				assert(
					timestamps1.get(dataStoreA._context.id) === undefined,
					"A should be referenced",
				);

				// 2. Create a DDS B and don't mark it as referenced (by adding its handle in another DDS).
				const ddsB = SharedMap.create(dataStoreA._runtime);
				ddsB.bindToContext();

				// 3. Get summary 2 and validate that B still does not have unreferenced timestamp. E = [].
				await provider.ensureSynchronized();
				const summaryResult2 = await summarizeNow(summarizer);
				const timestamps2 = await getUnreferencedTimestamps(summaryResult2.summaryTree);
				const ddsBUrl = `/${dataStoreA._context.id}/${ddsB.id}`;
				const ddsBTime1 = timestamps2.get(ddsBUrl.slice(1));
				assert(
					ddsBTime1 === undefined,
					`B should not have unreferenced timestamp since we do not have GC at DDS level yet`,
				);
			});
		});

		describe("References to unreferenced nodes from another unreferenced node", () => {
			/*
			 * Validates that we can detect references that are added from an unreferenced node to another.
			 * 1. Summary 1 at t1. V = [A*, B, C]. E = []. B and C have unreferenced time t1.
			 * 2. Op adds reference from B to C. E = [B -> C].
			 * 3. Summary 2 at t2. V = [A*, B, C]. E = [B -> C]. C has unreferenced time t2.
			 * Validates that the unreferenced time for C is t2 which is > t1.
			 */
			it(`Scenario 1 - Reference added to unreferenced node`, async () => {
				const { summarizer } = await createSummarizer(provider, mainContainer);

				// Create data stores B and C and mark them referenced as follows by storing their handles as follows:
				// dataStoreA -> dataStoreB -> dataStoreC.
				const dataStoreB = await createNewDataStore();
				const dataStoreC = await createNewDataStore();
				dataStoreB._root.set("dataStoreC", dataStoreC.handle);
				dataStoreA._root.set("dataStoreB", dataStoreB.handle);

				// Remove the reference from A to B and B to C which marks both B and C as unreferenced.
				dataStoreA._root.delete("dataStoreB");
				dataStoreB._root.delete("dataStoreC");

				// 1. Get summary 1 and validate that both B and C have unreferenced timestamps. E = [B -> C].
				await provider.ensureSynchronized();
				const summaryResult1 = await summarizeNow(summarizer);
				const timestamps1 = await getUnreferencedTimestamps(summaryResult1.summaryTree);
				const dsBTime1 = timestamps1.get(dataStoreB._context.id);
				const dsCTime1 = timestamps1.get(dataStoreC._context.id);
				assert(dsBTime1 !== undefined, `B should have unreferenced timestamp`);
				assert(dsCTime1 !== undefined, `C should have unreferenced timestamp`);

				// 2. Add reference from B to C. E = [B -> C].
				dataStoreB._root.set("dataStoreC", dataStoreC.handle);

				// 3. Get summary 2 and validate that C's unreferenced timestamp has updated. E = [B -> C].
				await provider.ensureSynchronized();
				const summaryResult2 = await summarizeNow(summarizer);
				const timestamps2 = await getUnreferencedTimestamps(summaryResult2.summaryTree);
				const dsBTime2 = timestamps2.get(dataStoreB._context.id);
				const dsCTime2 = timestamps2.get(dataStoreC._context.id);
				assert(dsBTime2 === dsBTime1, `B's timestamp should be the same`);

				// The following assert is currently not true due to a bug. Will be updated when the bug is fixed.
				assert(
					dsCTime2 !== undefined && dsCTime2 > dsCTime1,
					`C's timestamp should have updated`,
				);
			});

			/*
			 * Validates that we can detect references that are added from an unreferenced node to a list of
			 * unreferenced nodes, i.e., nodes with references to each other but are overall unreferenced.
			 * 1. Summary 1 at t1. V = [A*, B, C, D]. E = [C -> D]. B, C and D have unreferenced time t1.
			 * 2. Op adds reference from B to C. E = [B -> C, C -> D].
			 * 3. Summary 2 at t2. V = [A*, B, C]. E = [B -> C, C -> D]. C and D have unreferenced time t2.
			 * Validates that the unreferenced time for C and D is t2 which is > t1.
			 */
			it(`Scenario 2 - Reference added to a list of unreferenced nodes`, async () => {
				const { summarizer } = await createSummarizer(provider, mainContainer);

				// Create data stores B, C and D mark them referenced as follows by storing their handles as follows:
				// dataStoreA -> dataStoreB -> dataStoreC -> dataStoreD.
				const dataStoreB = await createNewDataStore();
				const dataStoreC = await createNewDataStore();
				const dataStoreD = await createNewDataStore();
				dataStoreC._root.set("dataStoreD", dataStoreD.handle);
				dataStoreB._root.set("dataStoreC", dataStoreC.handle);
				dataStoreA._root.set("dataStoreB", dataStoreB.handle);

				// Remove the reference from A to B and B to C which marks B, C and D as unreferenced.
				dataStoreA._root.delete("dataStoreB");
				dataStoreB._root.delete("dataStoreC");

				// 1. Get summary 1 and validate that B, C and D have unreferenced timestamps. E = [C -> D].
				await provider.ensureSynchronized();
				const summaryResult1 = await summarizeNow(summarizer);
				const timestamps1 = await getUnreferencedTimestamps(summaryResult1.summaryTree);
				const dsBTime1 = timestamps1.get(dataStoreB._context.id);
				const dsCTime1 = timestamps1.get(dataStoreC._context.id);
				const dsDTime1 = timestamps1.get(dataStoreD._context.id);
				assert(dsBTime1 !== undefined, `B should have unreferenced timestamp`);
				assert(dsCTime1 !== undefined, `C should have unreferenced timestamp`);
				assert(dsDTime1 !== undefined, `D should have unreferenced timestamp`);

				// 2. Add reference from B to C. E = [B -> C, C -> D].
				dataStoreB._root.set("dataStoreC", dataStoreC.handle);

				// 3. Get summary 2 and validate that C and D's unreferenced timestamps updated. E = [B -> C, C -> D].
				await provider.ensureSynchronized();
				const summaryResult2 = await summarizeNow(summarizer);
				const timestamps2 = await getUnreferencedTimestamps(summaryResult2.summaryTree);
				const dsBTime2 = timestamps2.get(dataStoreB._context.id);
				const dsCTime2 = timestamps2.get(dataStoreC._context.id);
				const dsDTime2 = timestamps2.get(dataStoreD._context.id);
				assert(dsBTime2 === dsBTime1, `B's timestamp should be the same`);

				// The following asserts are currently not true due to a bug. Will be updated when the bug is fixed.
				assert(
					dsCTime2 !== undefined && dsCTime2 > dsCTime1,
					`C's timestamp should have updated`,
				);
				assert(
					dsDTime2 !== undefined && dsDTime2 > dsDTime1,
					`D's timestamp should have updated`,
				);
			});

			/*
			 * Validates that we can detect references that are added from an unreferenced node to a list of
			 * unreferenced nodes, i.e., nodes with references to each other but are overall unreferenced. Then
			 * a reference between the list is removed
			 * 1. Summary 1 at t1. V = [A*, B, C, D]. E = [C -> D]. B, C and D have unreferenced time t1.
			 * 2. Op adds reference from B to C. E = [B -> C, C -> D].
			 * 3. Op removes reference from C to D. E = [B -> C].
			 * 4. Summary 2 at t2. V = [A*, B, C]. E = [B -> C]. C and D have unreferenced time t2.
			 * Validates that the unreferenced time for C and D is t2 which is > t1.
			 */
			it(`Scenario 3 - Reference added to a list of unreferenced nodes and a reference is removed`, async () => {
				const { summarizer } = await createSummarizer(provider, mainContainer);

				// Create data stores B, C and D mark them referenced as follows by storing their handles as follows:
				// dataStoreA -> dataStoreB -> dataStoreC -> dataStoreD.
				const dataStoreB = await createNewDataStore();
				const dataStoreC = await createNewDataStore();
				const dataStoreD = await createNewDataStore();
				dataStoreC._root.set("dataStoreD", dataStoreD.handle);
				dataStoreB._root.set("dataStoreC", dataStoreC.handle);
				dataStoreA._root.set("dataStoreB", dataStoreB.handle);

				// Remove the reference from A to B and B to C which marks B, C and D as unreferenced.
				dataStoreA._root.delete("dataStoreB");
				dataStoreB._root.delete("dataStoreC");

				// 1. Get summary 1 and validate that B, C and D have unreferenced timestamps. E = [B -> C, C -> D].
				await provider.ensureSynchronized();
				const summaryResult1 = await summarizeNow(summarizer);
				const timestamps1 = await getUnreferencedTimestamps(summaryResult1.summaryTree);
				const dsBTime1 = timestamps1.get(dataStoreB._context.id);
				const dsCTime1 = timestamps1.get(dataStoreC._context.id);
				const dsDTime1 = timestamps1.get(dataStoreD._context.id);
				assert(dsBTime1 !== undefined, `B should have unreferenced timestamp`);
				assert(dsCTime1 !== undefined, `C should have unreferenced timestamp`);
				assert(dsDTime1 !== undefined, `D should have unreferenced timestamp`);

				// 2. Add reference from B to C. E = [B -> C].
				dataStoreB._root.set("dataStoreC", dataStoreC.handle);

				// 3. Remove reference from C to D. E = [B -> C].
				dataStoreC._root.delete("dataStoreD");

				// 4. Get summary 2 and validate that C and D's unreferenced timestamps updated. E = [B -> C].
				await provider.ensureSynchronized();
				const summaryResult2 = await summarizeNow(summarizer);
				const timestamps2 = await getUnreferencedTimestamps(summaryResult2.summaryTree);
				const dsBTime2 = timestamps2.get(dataStoreB._context.id);
				const dsCTime2 = timestamps2.get(dataStoreC._context.id);
				const dsDTime2 = timestamps2.get(dataStoreD._context.id);
				assert(dsBTime2 === dsBTime1, `B's timestamp should be the same`);

				// The following asserts are currently not true due to a bug. Will be updated when the bug is fixed.
				assert(
					dsCTime2 !== undefined && dsCTime2 > dsCTime1,
					`C's timestamp should have updated`,
				);
				assert(
					dsDTime2 !== undefined && dsDTime2 > dsDTime1,
					`D's timestamp should have updated`,
				);
			});
		});
	});
});
