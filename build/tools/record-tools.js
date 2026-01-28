import { invalidParamsError } from '../server/error-handler.js';
import { validateRequiredParams, validateRecordData } from '../server/validation.js';
// Define tool information for registration
const recordToolInfo = [
    {
        name: 'fetch_record',
        description: 'Fetch a single record from a PocketBase collection by ID.',
        inputSchema: {
            type: 'object',
            properties: {
                collection: { type: 'string', description: 'The name or ID of the PocketBase collection.' },
                id: { type: 'string', description: 'The ID of the record to fetch.' },
            },
            required: ['collection', 'id'],
        },
    },
    {
        name: 'list_records',
        description: 'List records from a PocketBase collection. Supports filtering, sorting, pagination, expansion, and aggregation.',
        inputSchema: {
            type: 'object',
            properties: {
                collection: { type: 'string', description: 'The name or ID of the PocketBase collection.' },
                page: { type: 'number', description: 'Page number (defaults to 1).', minimum: 1 },
                perPage: { type: 'number', description: 'Items per page (defaults to 30, max 500).', minimum: 1, maximum: 500 },
                filter: { type: 'string', description: 'PocketBase filter string (e.g., "status=\'active\'").' },
                sort: { type: 'string', description: 'PocketBase sort string (e.g., "-created,name").' },
                expand: { type: 'string', description: 'PocketBase expand string (e.g., "user,tags.name").' },
                aggregate: { type: 'string', description: 'Aggregation query (e.g., "count", "sum(field)", "avg(field)").' }
            },
            required: ['collection'],
        },
    },
    {
        name: 'create_record',
        description: 'Create a new record in a PocketBase collection.',
        inputSchema: {
            type: 'object',
            properties: {
                collection: { type: 'string', description: 'The name or ID of the PocketBase collection.' },
                data: { type: 'object', description: 'The data for the new record (key-value pairs).', additionalProperties: true },
            },
            required: ['collection', 'data'],
        },
    },
    {
        name: 'update_record',
        description: 'Update an existing record in a PocketBase collection by ID.',
        inputSchema: {
            type: 'object',
            properties: {
                collection: { type: 'string', description: 'The name or ID of the PocketBase collection.' },
                id: { type: 'string', description: 'The ID of the record to update.' },
                data: { type: 'object', description: 'The data fields to update (key-value pairs).', additionalProperties: true },
            },
            required: ['collection', 'id', 'data'],
        },
    },
    {
        name: 'delete_record',
        description: 'Delete a record from a PocketBase collection by ID.',
        inputSchema: {
            type: 'object',
            properties: {
                collection: { type: 'string', description: 'The name or ID of the PocketBase collection.' },
                id: { type: 'string', description: 'The ID of the record to delete.' },
            },
            required: ['collection', 'id'],
        },
    },
    {
        name: 'batch_import_records',
        description: 'Import multiple records into a PocketBase collection in a single operation.',
        inputSchema: {
            type: 'object',
            properties: {
                collection: { type: 'string', description: 'The name or ID of the PocketBase collection.' },
                records: { type: 'array', items: { type: 'object', additionalProperties: true }, description: 'Array of record objects to import.' },
                skipDuplicates: { type: 'boolean', description: 'Skip duplicate records if true (default: false).' },
            },
            required: ['collection', 'records'],
        },
    },
    {
        name: 'batch_export_records',
        description: 'Export records from a PocketBase collection in JSON or CSV format.',
        inputSchema: {
            type: 'object',
            properties: {
                collection: { type: 'string', description: 'The name or ID of the PocketBase collection.' },
                filter: { type: 'string', description: 'PocketBase filter string to filter records.' },
                format: { type: 'string', enum: ['json', 'csv'], description: 'Export format (default: "json").' },
                fields: { type: 'array', items: { type: 'string' }, description: 'Specific fields to export (default: all fields).' },
            },
            required: ['collection'],
        },
    },
];
export function listRecordTools() {
    return recordToolInfo;
}
// Handle calls for record-related tools
export async function handleRecordToolCall(name, args, pb) {
    switch (name) {
        case 'fetch_record':
            return fetchRecord(args, pb);
        case 'list_records':
            return listRecords(args, pb);
        case 'create_record':
            return createRecord(args, pb);
        case 'update_record':
            return updateRecord(args, pb);
        case 'delete_record':
            return deleteRecord(args, pb);
        case 'batch_import_records':
            return batchImportRecords(args, pb);
        case 'batch_export_records':
            return batchExportRecords(args, pb);
        default:
            // This case should ideally not be reached due to routing in index.ts
            throw new Error(`Unknown record tool: ${name}`);
    }
}
// --- Individual Tool Implementations ---
async function fetchRecord(args, pb) {
    if (!args.collection || !args.id) {
        throw invalidParamsError("Missing required arguments: collection, id");
    }
    const record = await pb.collection(args.collection).getOne(args.id);
    return {
        content: [{ type: 'text', text: JSON.stringify(record, null, 2) }],
    };
}
async function listRecords(args, pb) {
    if (!args.collection) {
        throw invalidParamsError("Missing required argument: collection");
    }
    const { collection, page = 1, perPage = 30, filter, sort, expand, aggregate } = args;
    // If aggregation is requested, we need to handle it differently
    // Note: PocketBase doesn't have built-in aggregation in the SDK,
    // so we'll fetch all records and perform aggregation client-side if needed
    if (aggregate) {
        // For aggregation, fetch all matching records first
        const allRecords = await pb.collection(collection).getFullList({
            filter,
            sort,
            expand
        });
        // Perform aggregation based on the aggregate string
        let aggregatedResult = {};
        if (aggregate === 'count') {
            aggregatedResult = { count: allRecords.length };
        }
        else if (aggregate.startsWith('sum(') && aggregate.endsWith(')')) {
            const field = aggregate.slice(4, -1);
            const sum = allRecords.reduce((acc, record) => {
                const value = record[field];
                return acc + (typeof value === 'number' ? value : 0);
            }, 0);
            aggregatedResult = { sum: { [field]: sum } };
        }
        else if (aggregate.startsWith('avg(') && aggregate.endsWith(')')) {
            const field = aggregate.slice(4, -1);
            const sum = allRecords.reduce((acc, record) => {
                const value = record[field];
                return acc + (typeof value === 'number' ? value : 0);
            }, 0);
            aggregatedResult = { avg: { [field]: allRecords.length > 0 ? sum / allRecords.length : 0 } };
        }
        else {
            aggregatedResult = { error: 'Unsupported aggregation type', supported: ['count', 'sum(field)', 'avg(field)'] };
        }
        return {
            content: [{ type: 'text', text: JSON.stringify({ aggregate, result: aggregatedResult, totalRecords: allRecords.length }, null, 2) }],
        };
    }
    // Normal listing without aggregation
    const result = await pb.collection(collection).getList(page, perPage, {
        filter,
        sort,
        expand
    });
    return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
}
async function createRecord(args, pb) {
    validateRequiredParams(args, ['collection', 'data']);
    // Validate record data against collection schema
    const validation = await validateRecordData(pb, args.collection, args.data, false);
    if (!validation.valid) {
        throw invalidParamsError(`Validation failed: ${validation.errors.join('; ')}`);
    }
    const record = await pb.collection(args.collection).create(args.data);
    return {
        content: [{ type: 'text', text: JSON.stringify(record, null, 2) }],
    };
}
async function updateRecord(args, pb) {
    validateRequiredParams(args, ['collection', 'id', 'data']);
    // Validate record data against collection schema
    const validation = await validateRecordData(pb, args.collection, args.data, true);
    if (!validation.valid) {
        throw invalidParamsError(`Validation failed: ${validation.errors.join('; ')}`);
    }
    const record = await pb.collection(args.collection).update(args.id, args.data);
    return {
        content: [{ type: 'text', text: JSON.stringify(record, null, 2) }],
    };
}
async function deleteRecord(args, pb) {
    if (!args.collection || !args.id) {
        throw invalidParamsError("Missing required arguments: collection, id");
    }
    await pb.collection(args.collection).delete(args.id);
    return {
        content: [{ type: 'text', text: `Record ${args.id} deleted successfully from collection ${args.collection}.` }],
    };
}
async function batchImportRecords(args, pb) {
    if (!args.collection || !args.records || !Array.isArray(args.records)) {
        throw invalidParamsError("Missing required arguments: collection, records (must be an array)");
    }
    const results = {
        success: [],
        errors: [],
        total: args.records.length,
        imported: 0,
        failed: 0
    };
    for (const recordData of args.records) {
        try {
            const record = await pb.collection(args.collection).create(recordData);
            results.success.push(record);
            results.imported++;
        }
        catch (error) {
            // Check if it's a duplicate error and skipDuplicates is true
            if (args.skipDuplicates && error?.status === 400 && error?.data) {
                results.errors.push({ record: recordData, error: 'Duplicate skipped' });
                results.failed++;
            }
            else {
                results.errors.push({ record: recordData, error: error?.message || String(error) });
                results.failed++;
            }
        }
    }
    return {
        content: [{ type: 'text', text: JSON.stringify(results, null, 2) }],
    };
}
async function batchExportRecords(args, pb) {
    if (!args.collection) {
        throw invalidParamsError("Missing required argument: collection");
    }
    const format = args.format || 'json';
    const fields = args.fields;
    // Fetch all records matching the filter
    const records = await pb.collection(args.collection).getFullList({
        filter: args.filter,
        sort: '-created'
    });
    if (format === 'csv') {
        // Convert to CSV
        if (records.length === 0) {
            return {
                content: [{ type: 'text', text: 'No records found to export.' }],
            };
        }
        // Determine fields to export
        const exportFields = fields || Object.keys(records[0]);
        // Create CSV header
        const csvRows = [exportFields.join(',')];
        // Add data rows
        for (const record of records) {
            const row = exportFields.map((field) => {
                const value = record[field];
                // Handle values that might contain commas or quotes
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
        return {
            content: [{ type: 'text', text: csvRows.join('\n') }],
        };
    }
    else {
        // JSON format
        let exportData = records;
        // Filter fields if specified
        if (fields && fields.length > 0) {
            exportData = records.map(record => {
                const filtered = {};
                fields.forEach((field) => {
                    if (record.hasOwnProperty(field)) {
                        filtered[field] = record[field];
                    }
                });
                return filtered;
            });
        }
        return {
            content: [{ type: 'text', text: JSON.stringify(exportData, null, 2) }],
        };
    }
}
