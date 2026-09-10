/**
 * Generates the basic content for a new PocketBase migration file.
 *
 * @param upQueries - String containing the JavaScript code for the 'up' migration. Defaults to comments.
 * @param downQueries - String containing the JavaScript code for the 'down' migration (rollback). Defaults to comments.
 * @returns A string containing the full migration file content.
 */
export function generateMigrationTemplate(
    upQueries: string = '  // add up queries...\n',
    downQueries: string = '  // add down queries...\n'
): string {
    // Ensure indentation is correct within the template literal
    const upIndented = upQueries.split('\n').map(line => `  ${line}`).join('\n').trimEnd();
    const downIndented = downQueries.split('\n').map(line => `  ${line}`).join('\n').trimEnd();

    return `/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
${upIndented}
}, (app) => {
${downIndented}
});
`;
}

// --- PocketBase v0.33+ id validation ---
// The server rejects ids containing ./\|"'`<>:?*%$ and Windows reserved names.
// See https://github.com/pocketbase/pocketbase/blob/master/tools/typesystem/validators.go (v0.33.0 changelog).
const FORBIDDEN_ID_CHARS_RE = /[./\\|"'`<>:?*%$]/;
const WINDOWS_RESERVED_IDS = ['con', 'prn', 'aux', 'nul', 'com1', 'com2', 'com3', 'com4', 'com5', 'com6', 'com7', 'com8', 'com9', 'lpt1', 'lpt2', 'lpt3', 'lpt4', 'lpt5', 'lpt6', 'lpt7', 'lpt8', 'lpt9'];

/**
 * Validates a collection id against the PocketBase >= v0.33 rules.
 * @param id - The candidate collection id.
 * @throws If the id is empty or contains characters rejected by the server.
 */
export function validateCollectionId(id: string): void {
    if (!id || typeof id !== 'string') {
        throw new Error("Collection definition must include a non-empty 'id' string.");
    }
    if (FORBIDDEN_ID_CHARS_RE.test(id)) {
        throw new Error(`Invalid collection id "${id}": PocketBase >= v0.33 forbids the characters . / \\ | " ' \` < > : ? * % $ in ids.`);
    }
    if (WINDOWS_RESERVED_IDS.includes(id.toLowerCase())) {
        throw new Error(`Invalid collection id "${id}": Windows reserved names are not allowed by PocketBase >= v0.33.`);
    }
}

/**
 * Machine-readable metadata embedded by the MCP in the migration files it
 * generates. It allows apply/revert to execute the migration through the
 * REST API (pb.collections.*) instead of trying to evaluate the server-side
 * JSVM body with a REST client. Files without this marker are treated as
 * manual JSVM migrations (to be applied with `./pocketbase migrate up`).
 */
const META_MARKER = '// mcp-migration-meta:';

/**
 * Builds the metadata comment line embedded in generated migration files.
 * @param meta - Structured description of the migration operations.
 * @returns The marker comment line.
 */
export function generateMigrationMeta(meta: Record<string, any>): string {
    return `${META_MARKER} ${JSON.stringify(meta)}`;
}

/**
 * Parses the MCP migration metadata marker out of a migration file content.
 * @param content - Full content of the migration file.
 * @returns The parsed metadata object, or null when the file has no marker.
 */
export function parseMigrationMeta(content: string): Record<string, any> | null {
    for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (trimmed.startsWith(META_MARKER)) {
            try {
                return JSON.parse(trimmed.slice(META_MARKER.length).trim());
            } catch {
                return null;
            }
        }
    }
    return null;
}

/**
 * Generates the 'up' query string for creating a new collection.
 *
 * @param collectionDefinition - An object representing the collection schema.
 * @returns A string containing the JavaScript code to create the collection.
 */
export function generateCreateCollectionQuery(collectionDefinition: Record<string, any>): string {
    // Basic validation
    if (!collectionDefinition.name || !collectionDefinition.id) {
        throw new Error("Collection definition must include 'name' and 'id'.");
    }
    validateCollectionId(collectionDefinition.id);
    // Ensure fields is an array
    if (!Array.isArray(collectionDefinition.fields)) {
         collectionDefinition.fields = [];
    }

    // Process fields to flatten options
    const processedFields = collectionDefinition.fields.map((field: Record<string, any>) => {
        let processedField = { ...field };
        if (processedField.options && typeof processedField.options === 'object') {
            // Merge options properties into the main object
            Object.entries(processedField.options).forEach(([key, value]) => {
                processedField[key] = value;
            });
            // Remove the options property
            delete processedField.options;
        }
        return processedField;
    });

    // Create a properly formatted JavaScript object string with commas
    const jsObject = `{
    id: "${collectionDefinition.id}",
    name: "${collectionDefinition.name}",
    type: "${collectionDefinition.type || 'base'}",
    system: ${collectionDefinition.system || false},
    fields: ${formatArrayAsJs(processedFields || [])},
    indexes: ${formatArrayAsJs(collectionDefinition.indexes || [])},
    listRule: ${formatValueAsJs(collectionDefinition.listRule)},
    viewRule: ${formatValueAsJs(collectionDefinition.viewRule)},
    createRule: ${formatValueAsJs(collectionDefinition.createRule)},
    updateRule: ${formatValueAsJs(collectionDefinition.updateRule)},
    deleteRule: ${formatValueAsJs(collectionDefinition.deleteRule)}
  }`;

    return `
  const collection = new Collection(${jsObject});

  return app.save(collection);
`;
}

/**
 * Generates the 'down' query string for deleting a collection.
 *
 * @param collectionNameOrId - The name or ID of the collection to delete.
 * @returns A string containing the JavaScript code to delete the collection.
 */
export function generateDeleteCollectionQuery(collectionNameOrId: string): string {
    return `
  const collection = app.findCollectionByNameOrId("${collectionNameOrId}");

  return app.delete(collection);
`;
}

/**
 * Maps a PocketBase field `type` to its JSVM constructor class name.
 * The v0.40.x JSVM runner rejects plain objects passed to
 * `collection.fields.add()` ("could not convert [object Object] to
 * core.Field"); the generated migrations must build a Field instance.
 * Class names verified against the runner's types.d.ts (v0.39.11/v0.40.3)
 * and executed successfully with `migrate up/down` on both binaries.
 * Generic `Field` is the validated fallback (it discriminates by the
 * `type` key present in the definition).
 */
const FIELD_CLASS_BY_TYPE: Record<string, string> = {
    text: 'TextField',
    number: 'NumberField',
    bool: 'BoolField',
    email: 'EmailField',
    url: 'URLField',
    editor: 'EditorField',
    password: 'PasswordField',
    date: 'DateField',
    autodate: 'AutodateField',
    select: 'SelectField',
    file: 'FileField',
    relation: 'RelationField',
    json: 'JSONField',
    geoPoint: 'GeoPointField',
};

/**
 * Returns the JSVM constructor name for a field definition.
 * @param fieldType - The field `type` string (e.g. "text").
 */
function fieldClassName(fieldType: string): string {
    return FIELD_CLASS_BY_TYPE[fieldType] ?? 'Field';
}

/**
 * Generates the 'up' query string for adding a field to an existing collection.
 *
 * @param collectionNameOrId - The name or ID of the collection to update.
 * @param fieldDefinition - An object representing the field schema.
 * @returns A string containing the JavaScript code to add the field.
 */
export function generateAddFieldQuery(collectionNameOrId: string, fieldDefinition: Record<string, any>): string {
    // Basic validation
    if (!fieldDefinition.name || !fieldDefinition.type) {
        throw new Error("Field definition must include 'name' and 'type'.");
    }

    // Flatten the options object if it exists
    let flattenedFieldDef = { ...fieldDefinition };
    if (flattenedFieldDef.options && typeof flattenedFieldDef.options === 'object') {
        // Merge options properties into the main object
        Object.entries(flattenedFieldDef.options).forEach(([key, value]) => {
            flattenedFieldDef[key] = value;
        });
        // Remove the options property
        delete flattenedFieldDef.options;
    }

    // Create a field definition object with all properties at the same level
    const fieldProps = Object.entries(flattenedFieldDef)
        .map(([key, value]) => `    ${key}: ${formatValueAsJs(value)}`)
        .join(',\n');

    // BUG-5: the v0.40.x JSVM runner rejects plain objects in fields.add —
    // emit a typed Field constructor instance instead (validated on v0.39.11
    // and v0.40.3 with the official `migrate up/down` runner).
    const fieldClass = fieldClassName(String(fieldDefinition.type));

    return `
  const collection = app.findCollectionByNameOrId("${collectionNameOrId}");

  // Add ${fieldDefinition.name} field
  collection.fields.add(new ${fieldClass}({
${fieldProps}
  }));

  return app.save(collection);
`;
}

/**
 * Generates the 'down' query string for removing a field from an existing collection.
 *
 * @param collectionNameOrId - The name or ID of the collection to update.
 * @param fieldName - The name of the field to remove.
 * @returns A string containing the JavaScript code to remove the field.
 */
export function generateRemoveFieldQuery(collectionNameOrId: string, fieldName: string): string {
    return `
  const collection = app.findCollectionByNameOrId("${collectionNameOrId}");

  // Remove field
  collection.fields.removeByName("${fieldName}");

  return app.save(collection);
`;
}

/**
 * Helper function to format a value as JavaScript code.
 * 
 * @param value - The value to format
 * @returns A string containing the formatted JavaScript value
 */
function formatValueAsJs(value: any): string {
    if (value === null) {
        return 'null';
    } else if (value === undefined) {
        return 'null'; // Use null for undefined in PocketBase migrations
    } else if (typeof value === 'string') {
        return `"${value}"`;
    } else if (typeof value === 'object' && Array.isArray(value)) {
        return formatArrayAsJs(value);
    } else if (typeof value === 'object') {
        return formatObjectAsJs(value);
    } else {
        return String(value);
    }
}

/**
 * Helper function to format an array as JavaScript code.
 * 
 * @param arr - The array to format
 * @returns A string containing the formatted JavaScript array
 */
function formatArrayAsJs(arr: any[]): string {
    if (arr.length === 0) {
        return '[]';
    }
    
    const items = arr.map(item => {
        const formatted = formatValueAsJs(item);
        // If the formatted item is multiline, add indentation
        if (formatted.includes('\n')) {
            return formatted.split('\n').map((line, i) => 
                i === 0 ? line : `    ${line}`
            ).join('\n');
        }
        return formatted;
    }).join(',\n    ');
    
    return `[
    ${items}
  ]`;
}

/**
 * Helper function to format an object as JavaScript code.
 * 
 * @param obj - The object to format
 * @returns A string containing the formatted JavaScript object
 */
function formatObjectAsJs(obj: Record<string, any>): string {
    const props = Object.entries(obj)
        .map(([key, value]) => `    ${key}: ${formatValueAsJs(value)}`)
        .join(',\n');
    
    return `{
${props}
  }`;
}
