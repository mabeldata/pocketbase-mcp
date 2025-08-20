import PocketBase from 'pocketbase';
import {
    ToolResult, ToolInfo,
    FetchRecordArgs, ListRecordsArgs, CreateRecordArgs, UpdateRecordArgs, DeleteRecordArgs
} from '../types/index.js';
import { invalidParamsError } from '../server/error-handler.js';

// Define tool information for registration
const recordToolInfo: ToolInfo[] = [
    {
        name: 'fetch_record',
        description: 'Fetch a single record from a PocketBase collection by ID.',
        inputSchema: {
            type: 'object',
            properties: {
                collection: { type: 'string', description: 'The name or ID of the PocketBase collection.' },
                id: { type: 'string', description: 'The ID of the record to fetch.' },
            },
            required: ['collection', 'id'],
        },
    },
    {
        name: 'list_records',
        description: 'List records from a PocketBase collection. Supports filtering, sorting, pagination, and expansion.',
        inputSchema: {
            type: 'object',
            properties: {
                collection: { type: 'string', description: 'The name or ID of the PocketBase collection.' },
                page: { type: 'number', description: 'Page number (defaults to 1).', minimum: 1 },
                perPage: { type: 'number', description: 'Items per page (defaults to 30, max 500).', minimum: 1, maximum: 500 },
                filter: { type: 'string', description: 'PocketBase filter string (e.g., "status=\'active\'").' },
                sort: { type: 'string', description: 'PocketBase sort string (e.g., "-created,name").' },
                expand: { type: 'string', description: 'PocketBase expand string (e.g., "user,tags.name").' }
            },
            required: ['collection'],
        },
    },
    {
        name: 'create_record',
        description: 'Create a new record in a PocketBase collection.',
        inputSchema: {
            type: 'object',
            properties: {
                collection: { type: 'string', description: 'The name or ID of the PocketBase collection.' },
                data: { type: 'object', description: 'The data for the new record (key-value pairs).', additionalProperties: true },
            },
            required: ['collection', 'data'],
        },
    },
    {
        name: 'update_record',
        description: 'Update an existing record in a PocketBase collection by ID.',
        inputSchema: {
            type: 'object',
            properties: {
                collection: { type: 'string', description: 'The name or ID of the PocketBase collection.' },
                id: { type: 'string', description: 'The ID of the record to update.' },
                data: { type: 'object', description: 'The data fields to update (key-value pairs).', additionalProperties: true },
            },
            required: ['collection', 'id', 'data'],
        },
    },
    {
        name: 'delete_record',
        description: 'Delete a record from a PocketBase collection by ID.',
        inputSchema: {
            type: 'object',
            properties: {
                collection: { type: 'string', description: 'The name or ID of the PocketBase collection.' },
                id: { type: 'string', description: 'The ID of the record to delete.' },
            },
            required: ['collection', 'id'],
        },
    },
];

export function listRecordTools(): ToolInfo[] {
    return recordToolInfo;
}

// Handle calls for record-related tools
export async function handleRecordToolCall(name: string, args: any, pb: PocketBase): Promise<ToolResult> {
    switch (name) {
        case 'fetch_record':
            return fetchRecord(args as FetchRecordArgs, pb);
        case 'list_records':
            return listRecords(args as ListRecordsArgs, pb);
        case 'create_record':
            return createRecord(args as CreateRecordArgs, pb);
        case 'update_record':
            return updateRecord(args as UpdateRecordArgs, pb);
        case 'delete_record':
            return deleteRecord(args as DeleteRecordArgs, pb);
        default:
            // This case should ideally not be reached due to routing in index.ts
            throw new Error(`Unknown record tool: ${name}`);
    }
}

// --- Individual Tool Implementations ---

async function fetchRecord(args: FetchRecordArgs, pb: PocketBase): Promise<ToolResult> {
    if (!args.collection || !args.id) {
        throw invalidParamsError("Missing required arguments: collection, id");
    }
    const record = await pb.collection(args.collection).getOne(args.id);
    return {
        content: [{ type: 'text', text: JSON.stringify(record, null, 2) }],
    };
}

async function listRecords(args: ListRecordsArgs, pb: PocketBase): Promise<ToolResult> {
    if (!args.collection) {
        throw invalidParamsError("Missing required argument: collection");
    }
    const { collection, page = 1, perPage = 30, filter, sort, expand } = args;
    const result = await pb.collection(collection).getList(page, perPage, {
        filter,
        sort,
        expand
    });
    return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
}

async function createRecord(args: CreateRecordArgs, pb: PocketBase): Promise<ToolResult> {
    if (!args.collection || !args.data) {
        throw invalidParamsError("Missing required arguments: collection, data");
    }
    const record = await pb.collection(args.collection).create(args.data);
    return {
        content: [{ type: 'text', text: JSON.stringify(record, null, 2) }],
    };
}

async function updateRecord(args: UpdateRecordArgs, pb: PocketBase): Promise<ToolResult> {
    if (!args.collection || !args.id || !args.data) {
        throw invalidParamsError("Missing required arguments: collection, id, data");
    }
    const record = await pb.collection(args.collection).update(args.id, args.data);
    return {
        content: [{ type: 'text', text: JSON.stringify(record, null, 2) }],
    };
}

async function deleteRecord(args: DeleteRecordArgs, pb: PocketBase): Promise<ToolResult> {
    if (!args.collection || !args.id) {
        throw invalidParamsError("Missing required arguments: collection, id");
    }
    await pb.collection(args.collection).delete(args.id);
    return {
        content: [{ type: 'text', text: `Record ${args.id} deleted successfully from collection ${args.collection}.` }],
    };
}
