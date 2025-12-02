import PocketBase from 'pocketbase';
import { ToolResult, ToolInfo } from '../types/index.js';
import { invalidParamsError } from '../server/error-handler.js';
import { 
    createNewMigration, 
    createCollectionMigration, 
    createAddFieldMigration, 
    listMigrations,
    setMigrationsDirectory,
    applyMigration,
    revertMigration,
    applyAllMigrations,
    revertToMigration
} from '../migrations/index.js';
import { z } from 'zod'; // For input validation

// Define argument types for migration tools
interface CreateMigrationArgs {
    description: string;
}

interface CreateCollectionMigrationArgs {
    description?: string;
    collectionDefinition: Record<string, any>;
}

interface AddFieldMigrationArgs {
    collectionNameOrId: string;
    fieldDefinition: Record<string, any>;
    description?: string;
}

interface ListMigrationsArgs {} // No arguments

interface SetMigrationsDirectoryArgs {
    customPath?: string;
}

interface ApplyMigrationArgs {
    migrationFile: string;
}

interface RevertMigrationArgs {
    migrationFile: string;
}

interface ApplyAllMigrationsArgs {
    appliedMigrations?: string[];
}

interface RevertToMigrationArgs {
    targetMigration: string;
    appliedMigrations?: string[];
}

// Define tool information
const migrationToolInfo: ToolInfo[] = [
    {
        name: 'set_migrations_directory',
        description: 'Set the directory where migration files will be created and read from.',
        inputSchema: z.object({
            customPath: z.string().optional().describe('Custom path for migrations. If not provided, defaults to "pb_migrations" in the current working directory.'),
        }),
    },
    {
        name: 'create_migration',
        description: 'Create a new, empty PocketBase migration file with a timestamped name.',
        inputSchema: z.object({
            description: z.string().describe('A brief description for the migration filename (e.g., "add_user_email_index").'),
        }),
    },
    {
        name: 'create_collection_migration',
        description: 'Create a migration file specifically for creating a new PocketBase collection.',
        inputSchema: z.object({
            description: z.string().optional().describe('Optional description override for the filename.'),
            collectionDefinition: z.object({
                name: z.string(),
                id: z.string(),
            }).catchall(z.any()).describe('The full schema definition for the new collection (including name, id, fields, rules, etc.).'),
        }),
    },
    {
        name: 'add_field_migration',
        description: 'Create a migration file for adding a field to an existing collection.',
        inputSchema: z.object({
            collectionNameOrId: z.string().describe('The name or ID of the collection to update.'),
            fieldDefinition: z.object({
                name: z.string(),
                type: z.string(),
            }).catchall(z.any()).describe('The schema definition for the new field.'),
            description: z.string().optional().describe('Optional description override for the filename.'),
        }),
    },
    {
        name: 'list_migrations',
        description: 'List all migration files found in the PocketBase migrations directory.',
        inputSchema: z.object({}),
    },
    {
        name: 'apply_migration',
        description: 'Apply a specific migration file.',
        inputSchema: z.object({
            migrationFile: z.string().describe('Name of the migration file to apply.'),
        }),
    },
    {
        name: 'revert_migration',
        description: 'Revert a specific migration file.',
        inputSchema: z.object({
            migrationFile: z.string().describe('Name of the migration file to revert.'),
        }),
    },
    {
        name: 'apply_all_migrations',
        description: 'Apply all pending migrations.',
        inputSchema: z.object({
            appliedMigrations: z.array(z.string()).optional().describe('Array of already applied migration filenames.'),
        }),
    },
    {
        name: 'revert_to_migration',
        description: 'Revert migrations up to a specific target.',
        inputSchema: z.object({
            targetMigration: z.string().describe('Name of the migration to revert to (exclusive). Use empty string to revert all.'),
            appliedMigrations: z.array(z.string()).optional().describe('Array of already applied migration filenames.'),
        }),
    },
];
export function listMigrationTools(): ToolInfo[] {
    return migrationToolInfo;
}

// Handle calls for migration-related tools
export async function handleMigrationToolCall(name: string, args: any, pb: PocketBase): Promise<ToolResult> {
    switch (name) {
        case 'set_migrations_directory':
            return handleSetMigrationsDirectory(args as SetMigrationsDirectoryArgs);
        case 'create_migration':
            return handleCreateMigration(args as CreateMigrationArgs);
        case 'create_collection_migration':
            return handleCreateCollectionMigration(args as CreateCollectionMigrationArgs);
        case 'add_field_migration':
            return handleAddFieldMigration(args as AddFieldMigrationArgs);
        case 'list_migrations':
            return handleListMigrations(args as ListMigrationsArgs);
        case 'apply_migration':
            return handleApplyMigration(args as ApplyMigrationArgs, pb);
        case 'revert_migration':
            return handleRevertMigration(args as RevertMigrationArgs, pb);
        case 'apply_all_migrations':
            return handleApplyAllMigrations(args as ApplyAllMigrationsArgs, pb);
        case 'revert_to_migration':
            return handleRevertToMigration(args as RevertToMigrationArgs, pb);
        default:
            throw new Error(`Unknown migration tool: ${name}`);
    }
}

// --- Individual Tool Implementations ---

async function handleCreateMigration(args: CreateMigrationArgs): Promise<ToolResult> {
    if (!args.description) {
        throw invalidParamsError("Missing required argument: description");
    }
    const filePath = await createNewMigration(args.description);
    return {
        content: [{ type: 'text', text: `Created new migration file: ${filePath}` }],
    };
}

async function handleCreateCollectionMigration(args: CreateCollectionMigrationArgs): Promise<ToolResult> {
    if (!args.collectionDefinition) {
        throw invalidParamsError("Missing required argument: collectionDefinition");
    }
     if (!args.collectionDefinition.name || !args.collectionDefinition.id) {
        throw invalidParamsError("collectionDefinition must include 'name' and 'id' properties.");
    }
    const filePath = await createCollectionMigration(args.collectionDefinition, args.description);
    return {
        content: [{ type: 'text', text: `Created collection migration file: ${filePath}` }],
    };
}

async function handleAddFieldMigration(args: AddFieldMigrationArgs): Promise<ToolResult> {
    if (!args.collectionNameOrId) {
        throw invalidParamsError("Missing required argument: collectionNameOrId");
    }
    if (!args.fieldDefinition) {
        throw invalidParamsError("Missing required argument: fieldDefinition");
    }
    if (!args.fieldDefinition.name || !args.fieldDefinition.type) {
        throw invalidParamsError("fieldDefinition must include 'name' and 'type' properties.");
    }
    
    const filePath = await createAddFieldMigration(args.collectionNameOrId, args.fieldDefinition, args.description);
    return {
        content: [{ type: 'text', text: `Created field migration file: ${filePath}` }],
    };
}

async function handleListMigrations(args: ListMigrationsArgs): Promise<ToolResult> {
    const files = await listMigrations();
    if (files.length === 0) {
        return { content: [{ type: 'text', text: 'No migration files found.' }] };
    }
    return {
        content: [{ type: 'text', text: `Found migration files:\n${files.join('\n')}` }],
    };
}

async function handleSetMigrationsDirectory(args: SetMigrationsDirectoryArgs): Promise<ToolResult> {
    const path = setMigrationsDirectory(args.customPath);
    return {
        content: [{ type: 'text', text: `Migration directory set to: ${path}` }],
    };
}

async function handleApplyMigration(args: ApplyMigrationArgs, pb: PocketBase): Promise<ToolResult> {
    if (!args.migrationFile) {
        throw invalidParamsError("Missing required argument: migrationFile");
    }
    
    try {
        // Use the current migrations directory
        const result = await applyMigration(args.migrationFile, pb);
        return {
            content: [{ type: 'text', text: result }],
        };
    } catch (error: any) {
        throw new Error(`Failed to apply migration: ${error.message}`);
    }
}

async function handleRevertMigration(args: RevertMigrationArgs, pb: PocketBase): Promise<ToolResult> {
    if (!args.migrationFile) {
        throw invalidParamsError("Missing required argument: migrationFile");
    }
    
    try {
        const result = await revertMigration(args.migrationFile, pb);
        return {
            content: [{ type: 'text', text: result }],
        };
    } catch (error: any) {
        throw new Error(`Failed to revert migration: ${error.message}`);
    }
}

async function handleApplyAllMigrations(args: ApplyAllMigrationsArgs, pb: PocketBase): Promise<ToolResult> {
    try {
        const appliedMigrations = args.appliedMigrations || [];
        const result = await applyAllMigrations(pb, appliedMigrations);
        
        if (result.length === 0) {
            return {
                content: [{ type: 'text', text: 'No new migrations to apply.' }],
            };
        }
        
        return {
            content: [{ type: 'text', text: `Applied migrations:\n${result.join('\n')}` }],
        };
    } catch (error: any) {
        throw new Error(`Failed to apply migrations: ${error.message}`);
    }
}

async function handleRevertToMigration(args: RevertToMigrationArgs, pb: PocketBase): Promise<ToolResult> {
    if (args.targetMigration === undefined) {
        throw invalidParamsError("Missing required argument: targetMigration");
    }
    
    try {
        const appliedMigrations = args.appliedMigrations || [];
        const result = await revertToMigration(args.targetMigration, pb, appliedMigrations);
        
        if (result.length === 0) {
            return {
                content: [{ type: 'text', text: 'No migrations to revert.' }],
            };
        }
        
        return {
            content: [{ type: 'text', text: `Reverted migrations:\n${result.join('\n')}` }],
        };
    } catch (error: any) {
        throw new Error(`Failed to revert migrations: ${error.message}`);
    }
}
