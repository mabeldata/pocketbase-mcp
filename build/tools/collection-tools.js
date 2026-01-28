import { invalidParamsError } from '../server/error-handler.js';
import { validateRequiredParams, validateCollectionName } from '../server/validation.js';
// Define tool information
const collectionToolInfo = [
    {
        name: 'get_collection_schema',
        description: 'Get the schema (fields, rules, etc.) of a PocketBase collection.',
        inputSchema: {
            type: 'object',
            properties: {
                collection: { type: 'string', description: 'The name or ID of the PocketBase collection.' },
            },
            required: ['collection'],
        },
    },
    {
        name: 'list_collections',
        description: 'List all collections in the PocketBase instance.',
        inputSchema: {
            type: 'object',
            properties: {}, // No arguments needed
            additionalProperties: false,
        },
    },
    {
        name: 'create_collection',
        description: 'Create a new collection with a custom schema.',
        inputSchema: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'Unique collection name (used as table name).' },
                type: { type: 'string', enum: ['base', 'auth', 'view'], description: 'Collection type (default: "base").' },
                fields: { type: 'array', description: 'Array of field definitions.' },
                indexes: { type: 'array', items: { type: 'string' }, description: 'Array of SQL index definitions.' },
                system: { type: 'boolean', description: 'Mark collection as system collection.' },
                listRule: { type: 'string', description: 'API rule for listing records.' },
                viewRule: { type: 'string', description: 'API rule for viewing records.' },
                createRule: { type: 'string', description: 'API rule for creating records.' },
                updateRule: { type: 'string', description: 'API rule for updating records.' },
                deleteRule: { type: 'string', description: 'API rule for deleting records.' },
            },
            required: ['name'],
        },
    },
    {
        name: 'update_collection',
        description: 'Update an existing collection schema.',
        inputSchema: {
            type: 'object',
            properties: {
                collection: { type: 'string', description: 'The name or ID of the collection to update.' },
                name: { type: 'string', description: 'New collection name.' },
                fields: { type: 'array', description: 'Updated array of field definitions.' },
                indexes: { type: 'array', items: { type: 'string' }, description: 'Updated array of SQL index definitions.' },
                listRule: { type: 'string', description: 'API rule for listing records.' },
                viewRule: { type: 'string', description: 'API rule for viewing records.' },
                createRule: { type: 'string', description: 'API rule for creating records.' },
                updateRule: { type: 'string', description: 'API rule for updating records.' },
                deleteRule: { type: 'string', description: 'API rule for deleting records.' },
            },
            required: ['collection'],
        },
    },
    {
        name: 'migrate_collection_schema',
        description: 'Migrate a collection schema while preserving data.',
        inputSchema: {
            type: 'object',
            properties: {
                collection: { type: 'string', description: 'The name or ID of the collection to migrate.' },
                newSchema: { type: 'object', description: 'New schema definition with changes.' },
                migrationStrategy: { type: 'string', enum: ['preserve', 'replace'], description: 'Migration strategy (default: "preserve").' },
            },
            required: ['collection', 'newSchema'],
        },
    },
    {
        name: 'create_index',
        description: 'Create an index on a collection.',
        inputSchema: {
            type: 'object',
            properties: {
                collection: { type: 'string', description: 'The name or ID of the collection.' },
                fields: { type: 'array', items: { type: 'string' }, description: 'Array of field names for the index.' },
                unique: { type: 'boolean', description: 'Whether the index should be unique.' },
            },
            required: ['collection', 'fields'],
        },
    },
    {
        name: 'delete_index',
        description: 'Delete an index from a collection.',
        inputSchema: {
            type: 'object',
            properties: {
                collection: { type: 'string', description: 'The name or ID of the collection.' },
                indexName: { type: 'string', description: 'Name of the index to delete (SQL index name).' },
            },
            required: ['collection', 'indexName'],
        },
    },
    {
        name: 'list_indexes',
        description: 'List all indexes for a collection.',
        inputSchema: {
            type: 'object',
            properties: {
                collection: { type: 'string', description: 'The name or ID of the collection.' },
            },
            required: ['collection'],
        },
    },
];
export function listCollectionTools() {
    return collectionToolInfo;
}
// Handle calls for collection-related tools
export async function handleCollectionToolCall(name, args, pb) {
    switch (name) {
        case 'get_collection_schema':
            return getCollectionSchema(args, pb);
        case 'list_collections':
            return listCollections(args, pb);
        case 'create_collection':
            return createCollection(args, pb);
        case 'update_collection':
            return updateCollection(args, pb);
        case 'migrate_collection_schema':
            return migrateCollectionSchema(args, pb);
        case 'create_index':
            return createIndex(args, pb);
        case 'delete_index':
            return deleteIndex(args, pb);
        case 'list_indexes':
            return listIndexes(args, pb);
        default:
            throw new Error(`Unknown collection tool: ${name}`);
    }
}
// --- Individual Tool Implementations ---
async function getCollectionSchema(args, pb) {
    if (!args.collection) {
        throw invalidParamsError("Missing required argument: collection");
    }
    const schema = await pb.collections.getOne(args.collection);
    return {
        content: [{ type: 'text', text: JSON.stringify(schema, null, 2) }],
    };
}
async function listCollections(args, pb) {
    // Args are ignored for this tool
    const result = await pb.collections.getFullList({ sort: '-created' });
    return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
}
async function createCollection(args, pb) {
    validateRequiredParams(args, ['name']);
    // Validate collection name format
    const nameValidation = validateCollectionName(args.name);
    if (!nameValidation.valid) {
        throw invalidParamsError(nameValidation.error || 'Invalid collection name');
    }
    const collectionData = {
        name: args.name,
        type: args.type || 'base',
    };
    if (args.fields)
        collectionData.fields = args.fields;
    if (args.indexes)
        collectionData.indexes = args.indexes;
    if (args.system !== undefined)
        collectionData.system = args.system;
    if (args.listRule !== undefined)
        collectionData.listRule = args.listRule;
    if (args.viewRule !== undefined)
        collectionData.viewRule = args.viewRule;
    if (args.createRule !== undefined)
        collectionData.createRule = args.createRule;
    if (args.updateRule !== undefined)
        collectionData.updateRule = args.updateRule;
    if (args.deleteRule !== undefined)
        collectionData.deleteRule = args.deleteRule;
    if (args.viewQuery)
        collectionData.viewQuery = args.viewQuery;
    if (args.manageRule !== undefined)
        collectionData.manageRule = args.manageRule;
    if (args.authRule !== undefined)
        collectionData.authRule = args.authRule;
    if (args.passwordAuth)
        collectionData.passwordAuth = args.passwordAuth;
    const collection = await pb.collections.create(collectionData);
    return {
        content: [{ type: 'text', text: JSON.stringify(collection, null, 2) }],
    };
}
async function updateCollection(args, pb) {
    if (!args.collection) {
        throw invalidParamsError("Missing required argument: collection");
    }
    const updateData = {};
    if (args.name)
        updateData.name = args.name;
    if (args.fields)
        updateData.fields = args.fields;
    if (args.indexes)
        updateData.indexes = args.indexes;
    if (args.system !== undefined)
        updateData.system = args.system;
    if (args.listRule !== undefined)
        updateData.listRule = args.listRule;
    if (args.viewRule !== undefined)
        updateData.viewRule = args.viewRule;
    if (args.createRule !== undefined)
        updateData.createRule = args.createRule;
    if (args.updateRule !== undefined)
        updateData.updateRule = args.updateRule;
    if (args.deleteRule !== undefined)
        updateData.deleteRule = args.deleteRule;
    if (args.viewQuery)
        updateData.viewQuery = args.viewQuery;
    if (args.manageRule !== undefined)
        updateData.manageRule = args.manageRule;
    if (args.authRule !== undefined)
        updateData.authRule = args.authRule;
    if (args.passwordAuth)
        updateData.passwordAuth = args.passwordAuth;
    const collection = await pb.collections.update(args.collection, updateData);
    return {
        content: [{ type: 'text', text: JSON.stringify(collection, null, 2) }],
    };
}
async function migrateCollectionSchema(args, pb) {
    if (!args.collection || !args.newSchema) {
        throw invalidParamsError("Missing required arguments: collection, newSchema");
    }
    // Get current collection schema
    const currentCollection = await pb.collections.getOne(args.collection);
    const strategy = args.migrationStrategy || 'preserve';
    // Merge new schema with existing, preserving existing fields/data
    const mergedSchema = { ...currentCollection };
    if (strategy === 'preserve') {
        // Preserve existing fields and merge new ones
        if (args.newSchema.fields) {
            const existingFields = currentCollection.fields || [];
            const newFields = args.newSchema.fields;
            // Merge: keep existing, add new, update matching by name
            const fieldMap = new Map(existingFields.map((f) => [f.name, f]));
            newFields.forEach((newField) => {
                fieldMap.set(newField.name, newField);
            });
            mergedSchema.fields = Array.from(fieldMap.values());
        }
        // Merge other properties
        Object.keys(args.newSchema).forEach(key => {
            if (key !== 'fields') {
                mergedSchema[key] = args.newSchema[key];
            }
        });
    }
    else {
        // Replace strategy: use new schema directly
        Object.assign(mergedSchema, args.newSchema);
    }
    const collection = await pb.collections.update(args.collection, mergedSchema);
    return {
        content: [{ type: 'text', text: `Collection schema migrated successfully (strategy: ${strategy}).\n${JSON.stringify(collection, null, 2)}` }],
    };
}
async function createIndex(args, pb) {
    if (!args.collection || !args.fields || args.fields.length === 0) {
        throw invalidParamsError("Missing required arguments: collection, fields");
    }
    // Get current collection
    const collection = await pb.collections.getOne(args.collection);
    const currentIndexes = collection.indexes || [];
    // Generate SQL index statement
    const fieldsStr = args.fields.map(f => `\`${f}\``).join(', ');
    const uniqueStr = args.unique ? 'UNIQUE ' : '';
    const indexName = `idx_${args.fields.join('_')}_${collection.id}`;
    const indexSql = `CREATE ${uniqueStr}INDEX \`${indexName}\` ON \`${collection.name}\` (${fieldsStr})`;
    // Check if index already exists
    if (currentIndexes.includes(indexSql)) {
        return {
            content: [{ type: 'text', text: `Index already exists: ${indexName}\n${JSON.stringify(collection, null, 2)}` }],
        };
    }
    // Add index to collection
    const updatedIndexes = [...currentIndexes, indexSql];
    const updatedCollection = await pb.collections.update(args.collection, {
        indexes: updatedIndexes
    });
    return {
        content: [{ type: 'text', text: `Index created successfully: ${indexName}\n${JSON.stringify(updatedCollection, null, 2)}` }],
    };
}
async function deleteIndex(args, pb) {
    if (!args.collection || !args.indexName) {
        throw invalidParamsError("Missing required arguments: collection, indexName");
    }
    // Get current collection
    const collection = await pb.collections.getOne(args.collection);
    const currentIndexes = collection.indexes || [];
    // Find and remove index by name (index SQL contains the name)
    const updatedIndexes = currentIndexes.filter((idx) => {
        return !idx.includes(`\`${args.indexName}\``);
    });
    if (updatedIndexes.length === currentIndexes.length) {
        return {
            content: [{ type: 'text', text: `Index not found: ${args.indexName}\n${JSON.stringify(collection, null, 2)}` }],
        };
    }
    const updatedCollection = await pb.collections.update(args.collection, {
        indexes: updatedIndexes
    });
    return {
        content: [{ type: 'text', text: `Index deleted successfully: ${args.indexName}\n${JSON.stringify(updatedCollection, null, 2)}` }],
    };
}
async function listIndexes(args, pb) {
    if (!args.collection) {
        throw invalidParamsError("Missing required argument: collection");
    }
    const collection = await pb.collections.getOne(args.collection);
    const indexes = collection.indexes || [];
    return {
        content: [{ type: 'text', text: JSON.stringify({ collection: args.collection, indexes }, null, 2) }],
    };
}
