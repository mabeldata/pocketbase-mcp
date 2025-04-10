import { CallToolRequest } from '@modelcontextprotocol/sdk/types.js';
import PocketBase from 'pocketbase';
import { ToolResult, ToolInfo } from '../types/index.js'; // Import ToolInfo
import { invalidParamsError, methodNotFoundError } from '../server/error-handler.js';

// Import tool handlers (to be created)
import { listRecordTools, handleRecordToolCall } from './record-tools.js';
import { listCollectionTools, handleCollectionToolCall } from './collection-tools.js';
import { listFileTools, handleFileToolCall } from './file-tools.js';
import { listMigrationTools, handleMigrationToolCall } from './migration-tools.js'; // Uncommented
import { listLogTools, handleLogToolCall } from './log-tools.js'; // Import log tools
import { listCronTools, handleCronToolCall } from './cron-tools.js'; // Import cron tools

// Combine all tool definitions
export function registerTools(): { tools: ToolInfo[] } { // Use ToolInfo[]
    const tools: ToolInfo[] = [ // Use ToolInfo[]
        ...listRecordTools(),
        ...listCollectionTools(),
        ...listFileTools(),
        ...listMigrationTools(), // Uncommented
        ...listLogTools(), // Add log tools
        ...listCronTools(), // Add cron tools
    ];
    return { tools };
}

// Route tool calls to the appropriate handler
export async function handleToolCall(params: CallToolRequest['params'], pb: PocketBase): Promise<ToolResult> {
    const { name, arguments: args } = params;

    // Basic validation
    if (!name || typeof name !== 'string') {
        throw invalidParamsError("Tool name is missing or invalid.");
    }
    // Allow null/undefined args for tools that don't require them (like list_collections)
    // Validation should happen within specific tool handlers if args are required.
    // if (args === undefined || args === null) {
    //     throw invalidParamsError("Tool arguments are missing.");
    // }

    // Route based on tool name prefix or category (adjust logic as needed)
    // Ensure args is treated as 'any' or validated properly before passing
    const toolArgs = args as any;

    if (name === 'fetch_record' || name === 'list_records' || name === 'create_record' || name === 'update_record') {
        return handleRecordToolCall(name, toolArgs, pb);
    } else if (name === 'get_collection_schema' || name === 'list_collections') {
        return handleCollectionToolCall(name, toolArgs, pb);
    } else if (name === 'upload_file' || name === 'download_file') {
        return handleFileToolCall(name, toolArgs, pb);
    } else if (name === 'create_migration' || name === 'create_collection_migration' || name === 'add_field_migration' || name === 'list_migrations') {
        return handleMigrationToolCall(name, toolArgs, pb);
    } else if (name === 'list_logs' || name === 'get_log' || name === 'get_logs_stats') {
        return handleLogToolCall(name, toolArgs, pb);
    } else if (name === 'list_cron_jobs' || name === 'run_cron_job') {
        return handleCronToolCall(name, toolArgs, pb);
    } else {
        throw methodNotFoundError(name);
    }
}
