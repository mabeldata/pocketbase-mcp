import { invalidParamsError } from '../server/error-handler.js';
// Define tool information for registration
const logToolInfo = [
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
];
export function listLogTools() {
    return logToolInfo;
}
// Handle calls for log-related tools
export async function handleLogToolCall(name, args, pb) {
    switch (name) {
        case 'list_logs':
            return listLogs(args, pb);
        case 'get_log':
            return getLog(args, pb);
        case 'get_logs_stats':
            return getLogsStats(args, pb);
        default:
            // This case should ideally not be reached due to routing in index.ts
            throw new Error(`Unknown log tool: ${name}`);
    }
}
// --- Individual Tool Implementations ---
async function listLogs(args, pb) {
    const { page = 1, perPage = 30, filter, sort } = args;
    // Make the API request to list logs
    const result = await pb.logs.getList(page, perPage, {
        filter
    });
    return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
}
async function getLog(args, pb) {
    if (!args.id) {
        throw invalidParamsError("Missing required argument: id");
    }
    // Make the API request to get a single log
    const result = await pb.logs.getOne(args.id);
    return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
}
async function getLogsStats(args, pb) {
    const { filter } = args;
    try {
        // Make the API request to get logs statistics
        const result = await pb.logs.getStats({
            filter
        });
        return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
    }
    catch (error) {
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
