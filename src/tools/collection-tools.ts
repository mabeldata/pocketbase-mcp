import PocketBase from 'pocketbase';
import {
    ToolResult, ToolInfo,
    GetCollectionSchemaArgs, ListCollectionsArgs
} from '../types/index.js';
import { invalidParamsError } from '../server/error-handler.js';
import { z } from 'zod';

// Define tool information
const collectionToolInfo: ToolInfo[] = [
    {
        name: 'get_collection_schema',
        description: 'Get the schema (fields, rules, etc.) of a PocketBase collection.',
        inputSchema: z.object({
            collection: z.string().describe('The name or ID of the PocketBase collection.'),
        }),
    },
    {
        name: 'list_collections',
        description: 'List all collections in the PocketBase instance.',
        inputSchema: z.object({}).describe('No arguments needed'),
    },
];

export function listCollectionTools(): ToolInfo[] {
    return collectionToolInfo;
}

// Handle calls for collection-related tools
export async function handleCollectionToolCall(name: string, args: any, pb: PocketBase): Promise<ToolResult> {
    switch (name) {
        case 'get_collection_schema':
            return getCollectionSchema(args as GetCollectionSchemaArgs, pb);
        case 'list_collections':
            // No args expected for list_collections, but pass anyway for consistency
            return listCollections(args as ListCollectionsArgs, pb);
        default:
            throw new Error(`Unknown collection tool: ${name}`);
    }
}

// --- Individual Tool Implementations ---

async function getCollectionSchema(args: GetCollectionSchemaArgs, pb: PocketBase): Promise<ToolResult> {
    if (!args.collection) {
        throw invalidParamsError("Missing required argument: collection");
    }
    const schema = await pb.collections.getOne(args.collection);
    return {
        content: [{ type: 'text', text: JSON.stringify(schema, null, 2) }],
    };
}

async function listCollections(args: ListCollectionsArgs, pb: PocketBase): Promise<ToolResult> {
    // Args are ignored for this tool
    const result = await pb.collections.getFullList({ sort: '-created' });
    return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
}
