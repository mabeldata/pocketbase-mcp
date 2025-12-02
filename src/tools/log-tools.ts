import PocketBase from 'pocketbase';
import {
    ToolResult, ToolInfo,
    ListLogsArgs, GetLogArgs, GetLogsStatsArgs
} from '../types/index.js';
import { invalidParamsError } from '../server/error-handler.js';
import { z } from 'zod';

// Define tool information for registration
const logToolInfo: ToolInfo[] = [
    {
        name: 'list_logs',
        description: 'List API request logs from PocketBase with filtering, sorting, and pagination.',
        inputSchema: z.object({
            page: z.number().int().min(1).optional().describe('Page number (defaults to 1).'),
            perPage: z.number().int().min(1).max(500).optional().describe('Items per page (defaults to 30, max 500).'),
            filter: z.string().optional().describe('PocketBase filter string (e.g., "method=\'GET\'").'),
            sort: z.string().optional().describe('PocketBase sort string (e.g., "-created,url").'),
        }),
    },
    {
        name: 'get_log',
        description: 'Get a single API request log by ID.',
        inputSchema: z.object({
            id: z.string().describe('The ID of the log to fetch.'),
        }),
    },
    {
        name: 'get_logs_stats',
        description: 'Get API request logs statistics with optional filtering.',
        inputSchema: z.object({
            filter: z.string().optional().describe('PocketBase filter string (e.g., "method=\'GET\'").'),
        }),
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
        default:
            // This case should ideally not be reached due to routing in index.ts
            throw new Error(`Unknown log tool: ${name}`);
    }
}

// --- Individual Tool Implementations ---

async function listLogs(args: ListLogsArgs, pb: PocketBase): Promise<ToolResult> {
    const { page = 1, perPage = 30, filter, sort } = args;
    // Make the API request to list logs
    const result = await pb.logs.getList(
            page,
            perPage,
            {
             filter
            });
    
    return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
}

async function getLog(args: GetLogArgs, pb: PocketBase): Promise<ToolResult> {
    if (!args.id) {
        throw invalidParamsError("Missing required argument: id");
    }
    
    // Make the API request to get a single log
    const result = await pb.logs.getOne(args.id)
    
    return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
}

async function getLogsStats(args: GetLogsStatsArgs, pb: PocketBase): Promise<ToolResult> {
    const { filter } = args;
    
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
