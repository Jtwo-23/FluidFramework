/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDocument } from "./document";
import { ISequencedOperationMessage } from "./messages";
import { INode } from "./orderer";

/**
 * Interface to abstract the backend database
 */
export interface IDatabaseManager {
    /**
     * Retrieves the node collection
     */
    getNodeCollection(): Promise<ICollection<INode>>;

    /**
     * Retrieves the document collection
     */
    getDocumentCollection(): Promise<ICollection<IDocument>>;

    /**
     * Retrieves the delta collection
     */
    getDeltaCollection(tenantId: string, documentId: string): Promise<ICollection<ISequencedOperationMessage>>;

    /**
     * Scribe deltas collection
     */
    getScribeDeltaCollection(tenantId: string, documentId: string): Promise<ICollection<ISequencedOperationMessage>>;
}

/**
 * Abstract away IDocument collection logics and 
 */
export interface IDocumentRepository {
    /**
     * Retrieves a document from the database
     */
    readDocument(filter: any): Promise<IDocument>;

    /**
     * Updates documents in the database
     */
    updateDocument(filter: any, update: any, option?: any): Promise<void>;

    /**
     * Find and create a document in the database by following option behavior
     */
    findAndCreateDocument(filter: any, value: any, option?: any): Promise<{ value: IDocument; existing: boolean; }>;

    /**
     * Find and update a document in the database by following option behavior
     */
    findAndUpdateDocument(filter: any, value: any, option?: any): Promise<{ value: IDocument; existing: boolean; }>;

    createDocument(document: IDocument): Promise<any>;
}

/**
 * Interface for a database of values that have type T.
 * In some implementations, T should have a member "_id" which is a string used
 * when adding or finding value in the database.
 */
export interface ICollection<T> {
    /**
     * Executes an aggregration framework pipeline against the collection
     *
     * @param pipeline - array containing the aggregation framework commands for the execution
     * @param options - optional settings
     * @returns - cursor you can use to iterate over aggregated results
     */
    aggregate(pipeline: any, options?: any): any;
    /**
     * Finds queries in the database
     *
     * @param query - data we want to find
     * @param sort - object with property we use to sort on, whose value is 0 for descending order and 1 for ascending
     * @param limit - optional. if set, limits the number of documents/records the cursor will return.
     * Our mongo layer internally used 2000 by default.
     * @param skip - optional. If set, defines the number of documents to skip in the results set.
     * @returns - sorted results of query
     */
    find(query: any, sort: any, limit?: number, skip?: number): Promise<T[]>;

    /**
     * Finds one query in the database
     *
     * @param query - data we want to find
     * @returns - value of the query in the database
     */
    findOne(query: any): Promise<T>;

    /**
     * @returns - all values in the database
     */
    findAll(): Promise<T[]>;

    /**
     * Finds query in the database and returns its value.
     * Insert the value if query was not found.
     *
     * @param query - data we want to find
     * @param value - data to insert to the database if we cannot find query
     * @param option - optional. If set, provide customized options to the implementations
     */
    findOrCreate(query: any, value: T, option?: any): Promise<{ value: T; existing: boolean; }>;

    /**
     * Finds query in the database and replace its value.
     * Do nothing if query was not found.
     *
     * @param query - data we want to find
     * @param value - data to update to the database
     * @param option - optional. If set, provide customized options to the implementations
     */
    findAndUpdate(query: any, value: T, option?: any): Promise<{
        value: T;
        existing: boolean;
    }>;

    /**
     * Finds the query in the database. If it exists, update the value to set.
     * Throws if query cannot be found.
     *
     * @param filter - data we want to find
     * @param set - new values to change to
     * @param addToSet - an operator that insert a value to array unless the value already exists;
     * @param option - optional. If set, provide customized options to the implementations
     * only used in mongodb.ts
     */
    update(filter: any, set: any, addToSet: any, option?: any): Promise<void>;

    /**
     * Finds the query in the database. If it exists, update all the values to set.
     * Throws if query cannot be found.
     *
     * @param filter - data we want to find
     * @param set - new values to change to
     * @param addToSet - an operator that insert a value to array unless the value already exists;
     * only used in mongodb.ts
     * @param option - optional. If set, provide customized options to the implementations
     */
    updateMany(filter: any, set: any, addToSet: any, option?: any): Promise<void>;

    /**
     * Finds the value that satisfies query. If it exists, update the value to new set.
     * Otherwise inserts the set to the datbase.
     *
     * @param filter - data we want to find
     * @param set - new values to change to
     * @param addToSet - an operator that insert a value to array unless the value already exists;
     * only used in mongodb.ts
     * @param option - optional. If set, provide customized options to the implementations
     */
    upsert(filter: any, set: any, addToSet: any, option?: any): Promise<void>;

    /**
     * Inserts an entry into the database.
     * Throws if it would overwrite an existing entry
     *
     * @param value - data to insert to the database
     */
    insertOne(value: T): Promise<any>;

    /**
     * Insert multiple values in the database
     *
     * @param values - data to insert to the database
     * @param ordered - unused
     */
    insertMany(values: T[], ordered: boolean): Promise<void>;

    deleteOne(filter: any): Promise<any>;

    deleteMany(filter: any): Promise<any>;

    distinct(key: any, query: any): Promise<any>;

    createIndex(index: any, unique: boolean): Promise<void>;

    createTTLIndex?(index: any, mongoExpireAfterSeconds?: number): Promise<void>;
}

export interface IRetryable {
    retryEnabled: boolean;
}

export function isRetryEnabled<T>(collection: ICollection<T>): boolean {
    return (collection as unknown as IRetryable).retryEnabled === true;
}

export type IDbEvents = "close" | "reconnect" | "error" | "reconnectFailed";

export interface IDb {
    close(): Promise<void>;

    on(event: IDbEvents, listener: (...args: any[]) => void);

    collection<T>(name: string): ICollection<T>;

    /**
     * Removes a collection or view from the database.
     * The method also removes any indexes associated with the dropped collection.
     */
    dropCollection?(name: string): Promise<boolean>;
}

export interface IDbFactory {
    connect(global: boolean): Promise<IDb>;
}
