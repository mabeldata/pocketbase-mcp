import PocketBase from 'pocketbase';
import {
    ToolResult, ToolInfo,
    ListLogsArgs, GetLogArgs, GetLogsStatsArgs, TruncateLogsArgs
} from '../types/index.js';
import { invalidParamsError } from '../server/error-handler.js';

// Define tool information for registration
const logToolInfo: ToolInfo[] = [
    {
        name: 'list_logs',
        description: 'List API request logs from PocketBase with filtering, sorting, and pagination.',
        inputSchema: {
            type: 'object',
            properties: {
                page: { type: 'number', description: 'Page number (defaults to 1).', minimum: 1 },
                perPage: { type: 'number', description: 'Items per page (defaults to 30, max 500).', minimum: 1, maximum: 500 },
                filter: { type: 'string', description: 'PocketBase filter string (e.g., "method=\'GET\'").' },
                sort: { type: 'string', description: 'PocketBase sort string (e.g., "-created,url").' }
            },
            required: [],
        },
    },
    {
        name: 'get_log',
        description: 'Get a single API request log by ID.',
        inputSchema: {
            type: 'object',
            properties: {
                id: { type: 'string', description: 'The ID of the log to fetch.' },
            },
            required: ['id'],
        },
    },
    {
        name: 'get_logs_stats',
        description: 'Get API request logs statistics with optional filtering.',
        inputSchema: {
            type: 'object',
            properties: {
                filter: { type: 'string', description: 'PocketBase filter string (e.g., "method=\'GET\'").' },
            },
            required: [],
        },
    },
    {
        name: 'truncate_logs',
        description: 'Delete ALL API request logs from the PocketBase instance (server >= v0.40). DESTRUCTIVE and irreversible. Requires confirm=true.',
        inputSchema: {
            type: 'object',
            properties: {
                confirm: { type: 'boolean', description: 'Must be explicitly true to delete all logs.' },
            },
            required: ['confirm'],
        },
    },
];

export function listLogTools(): ToolInfo[] {
    return logToolInfo;
}

// Handle calls for log-related tools
export async function handleLogToolCall(name: string, args: any, pb: PocketBase): Promise<ToolResult> {
    switch (name) {
        case 'list_logs':
            return listLogs(args as ListLogsArgs, pb);
        case 'get_log':
            return getLog(args as GetLogArgs, pb);
        case 'get_logs_stats':
            return getLogsStats(args as GetLogsStatsArgs, pb);
        case 'truncate_logs':
            return truncateLogs(args as TruncateLogsArgs, pb);
        default:
            // This case should ideally not be reached due to routing in index.ts
            throw new Error(`Unknown log tool: ${name}`);
    }
}

// --- Individual Tool Implementations ---

async function listLogs(args: ListLogsArgs, pb: PocketBase): Promise<ToolResult> {
    // MCP clients may omit `arguments` entirely when the schema has no
    // required properties — normalize to {} so defaults apply (ROB-1).
    const { page = 1, perPage = 30, filter, sort } = args ?? {};
    // Make the API request to list logs
    const result = await pb.logs.getList(
            page,
            perPage,
            {
             filter,
             sort
            });
    
    return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
}

async function getLog(args: GetLogArgs, pb: PocketBase): Promise<ToolResult> {
    if (!args?.id) {
        throw invalidParamsError("Missing required argument: id");
    }
    
    // Make the API request to get a single log
    const result = await pb.logs.getOne(args.id)
    
    return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
}

async function getLogsStats(args: GetLogsStatsArgs, pb: PocketBase): Promise<ToolResult> {
    // See ROB-1 note in listLogs: `arguments` may be undefined.
    const { filter } = args ?? {};
    
    try {
        // Make the API request to get logs statistics
        const result = await pb.logs.getStats({ 
            filter
         });
        
        return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
    } catch (error) {
        // If there's an error, return a more descriptive error
        if (error instanceof Error) {
            return {
                content: [{ type: 'text', text: `Error fetching log stats: ${error.message}` }],
                isError: true
            };
        }
        throw error;
    }
}

async function truncateLogs(args: TruncateLogsArgs, pb: PocketBase): Promise<ToolResult> {
    // Destructive operation (DELETE /api/logs, server >= v0.40): refuse
    // unless explicitly confirmed, same convention as restore_backup.
    if (args?.confirm !== true) {
        throw invalidParamsError(
            "truncate_logs deletes ALL API logs and is irreversible. " +
            "Re-run with confirm=true to proceed."
        );
    }
    const result = await pb.logs.truncate();
    return {
        content: [{ type: 'text', text: JSON.stringify({ truncated: result }, null, 2) }],
    };
}
