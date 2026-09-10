import PocketBase from 'pocketbase';
import {
    ToolResult, ToolInfo,
    ListBackupsArgs, CreateBackupArgs, RestoreBackupArgs
} from '../types/index.js';
import { invalidParamsError } from '../server/error-handler.js';

/**
 * Backup tools over pb.backups.* (PocketBase server >= v0.22; the JS SDK
 * surface used here is stable through 0.28.x).
 *
 * restore_backup replaces the ENTIRE instance data directory and is
 * therefore gated behind an explicit `confirm: true` parameter (same
 * convention as truncate_logs).
 */

// Define tool information for registration
const backupToolInfo: ToolInfo[] = [
    {
        name: 'list_backups',
        description: 'List all backup files available on the PocketBase instance (name, size, last modified).',
        inputSchema: {
            type: 'object',
            properties: {},
            additionalProperties: false,
        },
    },
    {
        name: 'create_backup',
        description: 'Create a new database+storage backup on the PocketBase instance. The operation is queued by the server and may take a moment to appear in list_backups.',
        inputSchema: {
            type: 'object',
            properties: {
                name: {
                    type: 'string',
                    description: 'Optional backup filename; when provided it MUST end in ".zip" and contain only letters, digits, "_" and "-" (e.g., "pre_deploy.zip"). If omitted the server generates "pb_backup_<timestamp>.zip".',
                },
            },
            required: [],
        },
    },
    {
        name: 'restore_backup',
        description: 'Restore the PocketBase instance from an existing backup file. DESTRUCTIVE: replaces all current data. Requires confirm=true.',
        inputSchema: {
            type: 'object',
            properties: {
                key: { type: 'string', description: 'The backup file key/name as returned by list_backups (e.g., "pb_data_20260910_112233.zip").' },
                confirm: { type: 'boolean', description: 'Must be explicitly true to perform the restore.' },
            },
            required: ['key', 'confirm'],
        },
    },
];

export function listBackupTools(): ToolInfo[] {
    return backupToolInfo;
}

// Handle calls for backup-related tools
export async function handleBackupToolCall(name: string, args: any, pb: PocketBase): Promise<ToolResult> {
    switch (name) {
        case 'list_backups':
            return listBackups(args as ListBackupsArgs, pb);
        case 'create_backup':
            return createBackup(args as CreateBackupArgs, pb);
        case 'restore_backup':
            return restoreBackup(args as RestoreBackupArgs, pb);
        default:
            // This case should ideally not be reached due to routing in index.ts
            throw new Error(`Unknown backup tool: ${name}`);
    }
}

// --- Individual Tool Implementations ---

async function listBackups(args: ListBackupsArgs, pb: PocketBase): Promise<ToolResult> {
    // MCP clients may omit `arguments` entirely — normalize to {} (ROB-1).
    const result = await pb.backups.getFullList(args ?? {});
    return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
}

async function createBackup(args: CreateBackupArgs, pb: PocketBase): Promise<ToolResult> {
    const { name } = args ?? {};
    // SDK: create(basename) — empty/undefined name lets the server autogenerate.
    const result = await pb.backups.create(name ?? '');
    return {
        content: [{ type: 'text', text: JSON.stringify({ queued: result, name: name || '(server-generated timestamp)' }, null, 2) }],
    };
}

async function restoreBackup(args: RestoreBackupArgs, pb: PocketBase): Promise<ToolResult> {
    if (!args?.key) {
        throw invalidParamsError("Missing required argument: key");
    }
    // Destructive operation: refuse unless explicitly confirmed.
    if (args.confirm !== true) {
        throw invalidParamsError(
            "restore_backup is destructive (it replaces ALL instance data). " +
            "Re-run with confirm=true to proceed."
        );
    }
    const result = await pb.backups.restore(args.key);
    return {
        content: [{ type: 'text', text: JSON.stringify({ restored: result, key: args.key }, null, 2) }],
    };
}
