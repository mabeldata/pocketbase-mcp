import PocketBase from 'pocketbase';
import {
    ToolResult, ToolInfo,
    GetCollectionScaffoldsArgs, DryRunViewQueryArgs, BatchRecordsArgs
} from '../types/index.js';
import { invalidParamsError } from '../server/error-handler.js';

/**
 * Admin/meta + batch tools exposed by the JS SDK 0.27/0.28:
 * - get_collection_scaffolds → pb.collections.getScaffolds() (server >= v0.37)
 * - dry_run_view_query      → pb.collections.dryRunViewQuery() (server >= v0.37)
 * - batch_records           → pb.createBatch() → POST /api/batch (server >= v0.23)
 *
 * batch_records mirrors the SDK SubBatchService verbs (create/update/upsert/
 * delete) and builds the raw BatchRequest list the /api/batch endpoint
 * accepts, which keeps the JSON tool arguments transportable without FormData
 * (file attachments are not supported in this tool — use upload_file per
 * record). The server executes the batch transactionally by default: any
 * failing request rolls the whole batch back.
 */

// Define tool information for registration
const adminToolInfo: ToolInfo[] = [
    {
        name: 'get_collection_scaffolds',
        description: 'Get example collection schema payloads (scaffolds) from the PocketBase instance (server >= v0.37) — an object keyed by collection type (base, auth, view) with ready-to-edit templates for building new collections.',
        inputSchema: {
            type: 'object',
            properties: {},
            additionalProperties: false,
        },
    },
    {
        name: 'dry_run_view_query',
        description: 'Validate a VIEW collection query without saving the collection (server >= v0.37). Returns the resulting field definitions and a sample of rows, or a validation error.',
        inputSchema: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'The SQL SELECT statement backing the view collection.' },
            },
            required: ['query'],
        },
    },
    {
        name: 'batch_records',
        description: 'Execute multiple record create/update/upsert/delete operations in a single transactional batch request (PocketBase >= v0.23). If any operation fails, the whole batch is rolled back by the server. NOTE: on PocketBase >= v0.39 the server disables batch by default — enable it via update_settings with { "batch": { "enabled": true } } or the call fails with 403 "Batch requests are not allowed".',
        inputSchema: {
            type: 'object',
            properties: {
                requests: {
                    type: 'array',
                    description: 'Ordered list of record operations to execute in one transaction.',
                    items: {
                        type: 'object',
                        properties: {
                            collection: { type: 'string', description: 'Collection name or ID this operation targets.' },
                            action: { type: 'string', enum: ['create', 'update', 'upsert', 'delete'], description: 'The record operation.' },
                            id: { type: 'string', description: 'Record ID (required for update/delete; optional hint for upsert).' },
                            data: { type: 'object', description: 'Record payload (for create/update/upsert).', additionalProperties: true },
                        },
                        required: ['collection', 'action'],
                    },
                },
            },
            required: ['requests'],
        },
    },
];

export function listAdminTools(): ToolInfo[] {
    return adminToolInfo;
}

// Handle calls for admin/meta/batch tools
export async function handleAdminToolCall(name: string, args: any, pb: PocketBase): Promise<ToolResult> {
    switch (name) {
        case 'get_collection_scaffolds':
            return getCollectionScaffolds(args as GetCollectionScaffoldsArgs, pb);
        case 'dry_run_view_query':
            return dryRunViewQuery(args as DryRunViewQueryArgs, pb);
        case 'batch_records':
            return batchRecords(args as BatchRecordsArgs, pb);
        default:
            // This case should ideally not be reached due to routing in index.ts
            throw new Error(`Unknown admin tool: ${name}`);
    }
}

// --- Individual Tool Implementations ---

async function getCollectionScaffolds(args: GetCollectionScaffoldsArgs, pb: PocketBase): Promise<ToolResult> {
    // MCP clients may omit `arguments` entirely — normalize to {} (ROB-1).
    const result = await pb.collections.getScaffolds(args ?? {});
    return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
}

async function dryRunViewQuery(args: DryRunViewQueryArgs, pb: PocketBase): Promise<ToolResult> {
    if (!args?.query || typeof args.query !== 'string') {
        throw invalidParamsError("Missing required argument: query");
    }
    const result = await pb.collections.dryRunViewQuery(args.query);
    return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
}

async function batchRecords(args: BatchRecordsArgs, pb: PocketBase): Promise<ToolResult> {
    if (!Array.isArray(args?.requests) || args.requests.length === 0) {
        throw invalidParamsError("Missing required argument: requests (non-empty array of {collection, action, id?, data?})");
    }

    const batch = pb.createBatch();
    for (let i = 0; i < args.requests.length; i++) {
        const req = args.requests[i];
        if (!req?.collection || !req?.action) {
            throw invalidParamsError(`requests[${i}]: missing required field collection/action`);
        }
        switch (req.action) {
            case 'create':
                batch.collection(req.collection).create(req.data ?? {});
                break;
            case 'update':
                if (!req.id) {
                    throw invalidParamsError(`requests[${i}]: action "update" requires id`);
                }
                batch.collection(req.collection).update(req.id, req.data ?? {});
                break;
            case 'upsert':
                // upsert: update when a valid existing id is present in the
                // body, otherwise create — pass id through data so the server
                // resolves it (SDK semantics: bodyParams.id decides).
                batch.collection(req.collection).upsert(
                    req.id ? { ...(req.data ?? {}), id: req.id } : (req.data ?? {})
                );
                break;
            case 'delete':
                if (!req.id) {
                    throw invalidParamsError(`requests[${i}]: action "delete" requires id`);
                }
                batch.collection(req.collection).delete(req.id);
                break;
            default:
                throw invalidParamsError(
                    `requests[${i}]: unknown action "${req.action}" (expected create|update|upsert|delete)`
                );
        }
    }

    const results = await batch.send();
    return {
        content: [{
            type: 'text',
            text: JSON.stringify({
                executed: results.length,
                // server returns {status, body} per request, in submission order
                results,
            }, null, 2),
        }],
    };
}
