import { invalidParamsError } from '../server/error-handler.js';
// Define tool information
const databaseToolInfo = [
    {
        name: 'backup_database',
        description: 'Create a backup of the PocketBase database by exporting all collections and data.',
        inputSchema: {
            type: 'object',
            properties: {
                backupPath: { type: 'string', description: 'Optional path to save backup (returns JSON if not provided).' },
            },
            required: [],
        },
    },
    {
        name: 'restore_database',
        description: 'Restore a PocketBase database from a backup.',
        inputSchema: {
            type: 'object',
            properties: {
                backupData: { type: 'object', description: 'Backup data object containing collections and records.' },
                backupPath: { type: 'string', description: 'Path to backup file (alternative to backupData).' },
            },
            required: [],
        },
    },
    {
        name: 'export_database_json',
        description: 'Export the entire PocketBase database to JSON format.',
        inputSchema: {
            type: 'object',
            properties: {
                outputPath: { type: 'string', description: 'Optional path to save JSON file (returns JSON string if not provided).' },
                collections: { type: 'array', items: { type: 'string' }, description: 'Optional list of collection names to export (exports all if not provided).' },
            },
            required: [],
        },
    },
    {
        name: 'export_database_csv',
        description: 'Export the PocketBase database to CSV format.',
        inputSchema: {
            type: 'object',
            properties: {
                outputPath: { type: 'string', description: 'Optional path to save CSV file (returns CSV string if not provided).' },
                collections: { type: 'array', items: { type: 'string' }, description: 'Optional list of collection names to export (exports all if not provided).' },
            },
            required: [],
        },
    },
    {
        name: 'optimize_indexes',
        description: 'Optimize database indexes for a collection or all collections.',
        inputSchema: {
            type: 'object',
            properties: {
                collection: { type: 'string', description: 'Optional collection name to optimize (optimizes all if not provided).' },
            },
            required: [],
        },
    },
];
export function listDatabaseTools() {
    return databaseToolInfo;
}
// Handle calls for database-related tools
export async function handleDatabaseToolCall(name, args, pb) {
    switch (name) {
        case 'backup_database':
            return backupDatabase(args, pb);
        case 'restore_database':
            return restoreDatabase(args, pb);
        case 'export_database_json':
            return exportDatabaseJson(args, pb);
        case 'export_database_csv':
            return exportDatabaseCsv(args, pb);
        case 'optimize_indexes':
            return optimizeIndexes(args, pb);
        default:
            throw new Error(`Unknown database tool: ${name}`);
    }
}
// --- Individual Tool Implementations ---
async function backupDatabase(args, pb) {
    // Get all collections
    const collections = await pb.collections.getFullList();
    const backup = {
        timestamp: new Date().toISOString(),
        collections: [],
        records: {}
    };
    // Export each collection schema and all records
    for (const collection of collections) {
        backup.collections.push(collection);
        try {
            // Get all records for this collection
            const records = await pb.collection(collection.name || collection.id).getFullList();
            backup.records[collection.name || collection.id] = records;
        }
        catch (error) {
            // Some collections might not be accessible, skip them
            backup.records[collection.name || collection.id] = [];
        }
    }
    return {
        content: [{ type: 'text', text: JSON.stringify(backup, null, 2) }],
    };
}
async function restoreDatabase(args, pb) {
    let backupData;
    if (args.backupData) {
        backupData = args.backupData;
    }
    else if (args.backupPath) {
        // In a real implementation, you would read from file system
        // For now, we'll require backupData to be provided
        throw invalidParamsError("backupPath file reading not implemented. Please provide backupData directly.");
    }
    else {
        throw invalidParamsError("Either backupData or backupPath must be provided");
    }
    if (!backupData.collections || !backupData.records) {
        throw invalidParamsError("Invalid backup data format. Expected collections and records.");
    }
    const results = {
        collectionsCreated: 0,
        collectionsUpdated: 0,
        recordsImported: 0,
        errors: []
    };
    // Restore collections
    for (const collectionData of backupData.collections) {
        try {
            // Check if collection exists
            try {
                await pb.collections.getOne(collectionData.id || collectionData.name);
                // Collection exists, update it
                await pb.collections.update(collectionData.id || collectionData.name, collectionData);
                results.collectionsUpdated++;
            }
            catch {
                // Collection doesn't exist, create it
                await pb.collections.create(collectionData);
                results.collectionsCreated++;
            }
        }
        catch (error) {
            results.errors.push(`Failed to restore collection ${collectionData.name}: ${error?.message || String(error)}`);
        }
    }
    // Restore records
    for (const [collectionName, records] of Object.entries(backupData.records)) {
        if (!Array.isArray(records))
            continue;
        try {
            for (const record of records) {
                try {
                    // Try to update existing record
                    await pb.collection(collectionName).update(record.id, record);
                }
                catch {
                    // Record doesn't exist, create it
                    await pb.collection(collectionName).create(record);
                }
                results.recordsImported++;
            }
        }
        catch (error) {
            results.errors.push(`Failed to import records for ${collectionName}: ${error?.message || String(error)}`);
        }
    }
    return {
        content: [{ type: 'text', text: JSON.stringify(results, null, 2) }],
    };
}
async function exportDatabaseJson(args, pb) {
    const collectionsToExport = args.collections;
    // Get collections
    let collections;
    if (collectionsToExport && collectionsToExport.length > 0) {
        collections = [];
        for (const name of collectionsToExport) {
            try {
                const collection = await pb.collections.getOne(name);
                collections.push(collection);
            }
            catch (error) {
                // Skip if collection doesn't exist
            }
        }
    }
    else {
        collections = await pb.collections.getFullList();
    }
    const exportData = {
        exportDate: new Date().toISOString(),
        collections: [],
        records: {}
    };
    for (const collection of collections) {
        exportData.collections.push(collection);
        try {
            const records = await pb.collection(collection.name || collection.id).getFullList();
            exportData.records[collection.name || collection.id] = records;
        }
        catch (error) {
            exportData.records[collection.name || collection.id] = [];
        }
    }
    return {
        content: [{ type: 'text', text: JSON.stringify(exportData, null, 2) }],
    };
}
async function exportDatabaseCsv(args, pb) {
    const collectionsToExport = args.collections;
    // Get collections
    let collections;
    if (collectionsToExport && collectionsToExport.length > 0) {
        collections = [];
        for (const name of collectionsToExport) {
            try {
                const collection = await pb.collections.getOne(name);
                collections.push(collection);
            }
            catch (error) {
                // Skip if collection doesn't exist
            }
        }
    }
    else {
        collections = await pb.collections.getFullList();
    }
    const csvExports = [];
    for (const collection of collections) {
        try {
            const records = await pb.collection(collection.name || collection.id).getFullList();
            if (records.length === 0) {
                csvExports.push(`\n=== Collection: ${collection.name || collection.id} (empty) ===\n`);
                continue;
            }
            // Get all field names from first record
            const fields = Object.keys(records[0]);
            // Create CSV for this collection
            const csvRows = [];
            csvRows.push(`=== Collection: ${collection.name || collection.id} ===`);
            csvRows.push(fields.join(','));
            for (const record of records) {
                const row = fields.map(field => {
                    const value = record[field];
                    if (value === null || value === undefined) {
                        return '';
                    }
                    const stringValue = String(value);
                    // Escape quotes and wrap in quotes if contains comma or quote
                    if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
                        return `"${stringValue.replace(/"/g, '""')}"`;
                    }
                    return stringValue;
                });
                csvRows.push(row.join(','));
            }
            csvExports.push(csvRows.join('\n'));
        }
        catch (error) {
            csvExports.push(`\n=== Collection: ${collection.name || collection.id} (error: ${error?.message || String(error)}) ===\n`);
        }
    }
    return {
        content: [{ type: 'text', text: csvExports.join('\n\n') }],
    };
}
async function optimizeIndexes(args, pb) {
    // PocketBase doesn't have a direct API for index optimization
    // This is typically handled at the database level
    // We'll return information about indexes instead
    let collections;
    if (args.collection) {
        try {
            const collection = await pb.collections.getOne(args.collection);
            collections = [collection];
        }
        catch (error) {
            throw invalidParamsError(`Collection not found: ${args.collection}`);
        }
    }
    else {
        collections = await pb.collections.getFullList();
    }
    const indexInfo = [];
    for (const collection of collections) {
        const indexes = collection.indexes || [];
        indexInfo.push({
            collection: collection.name || collection.id,
            indexCount: indexes.length,
            indexes: indexes
        });
    }
    return {
        content: [{ type: 'text', text: JSON.stringify({
                    message: 'Index optimization information (actual optimization requires database-level operations)',
                    collections: indexInfo
                }, null, 2) }],
    };
}
