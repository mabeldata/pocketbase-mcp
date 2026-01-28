import { invalidParamsError, methodNotFoundError } from '../server/error-handler.js';
// Import tool handlers (to be created)
import { listRecordTools, handleRecordToolCall } from './record-tools.js';
import { listCollectionTools, handleCollectionToolCall } from './collection-tools.js';
import { listFileTools, handleFileToolCall } from './file-tools.js';
import { listMigrationTools, handleMigrationToolCall } from './migration-tools.js'; // Uncommented
import { listLogTools, handleLogToolCall } from './log-tools.js'; // Import log tools
import { listCronTools, handleCronToolCall } from './cron-tools.js'; // Import cron tools
import { listUserTools, handleUserToolCall } from './user-tools.js';
import { listDatabaseTools, handleDatabaseToolCall } from './database-tools.js';
import { listRealtimeTools, handleRealtimeToolCall } from './realtime-tools.js';
import { listAuthTools, handleAuthToolCall } from './auth-tools.js';
// Combine all tool definitions
export function registerTools() {
    const tools = [
        ...listRecordTools(),
        ...listCollectionTools(),
        ...listFileTools(),
        ...listMigrationTools(), // Uncommented
        ...listLogTools(), // Add log tools
        ...listCronTools(), // Add cron tools
        ...listUserTools(), // Add user tools
        ...listDatabaseTools(), // Add database tools
        ...listRealtimeTools(), // Add realtime tools
        ...listAuthTools(), // Add auth tools
    ];
    return { tools };
}
// Route tool calls to the appropriate handler
export async function handleToolCall(params, pb) {
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
    const toolArgs = args;
    if (name === 'fetch_record' || name === 'list_records' || name === 'create_record' ||
        name === 'update_record' || name === 'delete_record' || name === 'batch_import_records' ||
        name === 'batch_export_records') {
        return handleRecordToolCall(name, toolArgs, pb);
    }
    else if (name === 'get_collection_schema' || name === 'list_collections' ||
        name === 'create_collection' || name === 'update_collection' ||
        name === 'migrate_collection_schema' || name === 'create_index' ||
        name === 'delete_index' || name === 'list_indexes') {
        return handleCollectionToolCall(name, toolArgs, pb);
    }
    else if (name === 'upload_file' || name === 'download_file') {
        return handleFileToolCall(name, toolArgs, pb);
    }
    else if (name === 'create_migration' || name === 'create_collection_migration' || name === 'add_field_migration' || name === 'list_migrations') {
        return handleMigrationToolCall(name, toolArgs, pb);
    }
    else if (name === 'list_logs' || name === 'get_log' || name === 'get_logs_stats') {
        return handleLogToolCall(name, toolArgs, pb);
    }
    else if (name === 'list_cron_jobs' || name === 'run_cron_job') {
        return handleCronToolCall(name, toolArgs, pb);
    }
    else if (name === 'create_user_token' || name === 'verify_user_token' ||
        name === 'create_user' || name === 'update_user' || name === 'delete_user' ||
        name === 'list_users' || name === 'update_user_password' || name === 'reset_user_password') {
        return handleUserToolCall(name, toolArgs, pb);
    }
    else if (name === 'backup_database' || name === 'restore_database' ||
        name === 'export_database_json' || name === 'export_database_csv' ||
        name === 'optimize_indexes') {
        return handleDatabaseToolCall(name, toolArgs, pb);
    }
    else if (name === 'subscribe_collection' || name === 'unsubscribe_collection') {
        return handleRealtimeToolCall(name, toolArgs, pb);
    }
    else if (name === 'admin_auth') {
        return handleAuthToolCall(name, toolArgs, pb);
    }
    else {
        throw methodNotFoundError(name);
    }
}
