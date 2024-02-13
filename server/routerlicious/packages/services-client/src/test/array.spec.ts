/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
	convertSortedNumberArrayToRanges,
	dedupeSortedArray,
	mergeArrays,
	mergeKArrays,
} from "../array";

describe("convertToRanges", () => {
	it("Should return empty array if input is empty", () => {
		const SNs: number[] = [];
		const ranges = convertSortedNumberArrayToRanges(SNs);
		assert.strictEqual(JSON.stringify(ranges), JSON.stringify([]));
	});

	it("Should return single tuple if just one element", () => {
		const SNs: number[] = [1];
		const ranges = convertSortedNumberArrayToRanges(SNs);
		assert.strictEqual(JSON.stringify(ranges), JSON.stringify([[1, 1]]));
	});

	it("Should return single tuple if just three consequence element", () => {
		const SNs: number[] = [1, 2, 3];
		const ranges = convertSortedNumberArrayToRanges(SNs);
		assert.strictEqual(JSON.stringify(ranges), JSON.stringify([[1, 3]]));
	});

	it("Should return two tuples if just three consequence element and one element", () => {
		const SNs: number[] = [1, 2, 3, 5];
		const ranges = convertSortedNumberArrayToRanges(SNs);
		assert.strictEqual(
			JSON.stringify(ranges),
			JSON.stringify([
				[1, 3],
				[5, 5],
			]),
		);
	});

	it("Should return two tuples if just three consequence element and two consequence element", () => {
		const SNs: number[] = [1, 2, 3, 5, 6];
		const ranges = convertSortedNumberArrayToRanges(SNs);
		assert.strictEqual(
			JSON.stringify(ranges),
			JSON.stringify([
				[1, 3],
				[5, 6],
			]),
		);
	});

	it("Should return three tuples if just three consequence element and two consequence element", () => {
		const SNs: number[] = [1, 3, 5];
		const ranges = convertSortedNumberArrayToRanges(SNs);
		assert.strictEqual(
			JSON.stringify(ranges),
			JSON.stringify([
				[1, 1],
				[3, 3],
				[5, 5],
			]),
		);
	});

	it("Should return one tuple for one consequence big array", () => {
		const SNs: number[] = Array.from(Array(1000).keys());
		const ranges = convertSortedNumberArrayToRanges(SNs);
		assert.strictEqual(JSON.stringify(ranges), JSON.stringify([[0, 999]]));
	});
});

describe("mergeArrays", () => {
	it("Should return an merged sorted array from two sorted arrays", () => {
		const arr1 = [1, 3, 5, 7, 9];
		const arr2 = [2, 4, 6, 8, 10];
		const result = mergeArrays(arr1, arr2, (a) => a);
		assert.strictEqual(JSON.stringify(result), JSON.stringify([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]));
	});

	it("Should return an merged sorted array from two sorted arrays based on selector", () => {
		const arr1 = [1, 3, 5, 7, 9];
		const arr2 = [2, 4, 6, 8, 10];
		const result = mergeArrays(arr1, arr2, (_) => 1);
		assert.strictEqual(JSON.stringify(result), JSON.stringify([1, 3, 5, 7, 9, 2, 4, 6, 8, 10]));
	});
});

describe("mergeKArray", () => {
	it("Should return an merged sorted array from sorted arrays asc", () => {
		const input = [[1, 3], [2, 4, 6], [0, 9], [7, 8], [5], []];
		const ascComparator = (a: number, b: number) => (a - b < 0 ? -1 : a === b ? 0 : 1);
		const result = mergeKArrays(input, ascComparator);
		assert.strictEqual(JSON.stringify(result), JSON.stringify([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]));
	});

	it("Should return an merged sorted array from sorted arrays desc", () => {
		const input = [[3, 1], [6, 4, 2], [9, 0], [8, 7], [5], []];
		const descComparator = (a: number, b: number) => (a - b > 0 ? -1 : a === b ? 0 : 1);
		const result = mergeKArrays(input, descComparator);
		assert.strictEqual(JSON.stringify(result), JSON.stringify([9, 8, 7, 6, 5, 4, 3, 2, 1, 0]));
	});
});

describe("dedupeSortedArray", () => {
	it("Should return an deduped sorted array", () => {
		const input = [1, 2, 2, 3, 3, 3, 4, 5, 5, 6];
		const result = dedupeSortedArray(input, (a) => a);
		assert.strictEqual(JSON.stringify(result), JSON.stringify([1, 2, 3, 4, 5, 6]));
	});

	it("Should return an deduped sorted array based on selector", () => {
		const input = [1, 2, 2, 3, 3, 3, 4, 5, 5, 6];
		const result = dedupeSortedArray(input, (_) => 6);
		assert.strictEqual(JSON.stringify(result), JSON.stringify([1]));
	});
});
