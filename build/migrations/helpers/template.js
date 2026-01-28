/**
 * Generates the basic content for a new PocketBase migration file.
 *
 * @param upQueries - String containing the JavaScript code for the 'up' migration. Defaults to comments.
 * @param downQueries - String containing the JavaScript code for the 'down' migration (rollback). Defaults to comments.
 * @returns A string containing the full migration file content.
 */
export function generateMigrationTemplate(upQueries = '  // add up queries...\n', downQueries = '  // add down queries...\n') {
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
/**
 * Generates the 'up' query string for creating a new collection.
 *
 * @param collectionDefinition - An object representing the collection schema.
 * @returns A string containing the JavaScript code to create the collection.
 */
export function generateCreateCollectionQuery(collectionDefinition) {
    // Basic validation
    if (!collectionDefinition.name || !collectionDefinition.id) {
        throw new Error("Collection definition must include 'name' and 'id'.");
    }
    // Ensure fields is an array
    if (!Array.isArray(collectionDefinition.fields)) {
        collectionDefinition.fields = [];
    }
    // Process fields to flatten options
    const processedFields = collectionDefinition.fields.map((field) => {
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
export function generateDeleteCollectionQuery(collectionNameOrId) {
    return `
  const collection = app.findCollectionByNameOrId("${collectionNameOrId}");

  return app.delete(collection);
`;
}
/**
 * Generates the 'up' query string for adding a field to an existing collection.
 *
 * @param collectionNameOrId - The name or ID of the collection to update.
 * @param fieldDefinition - An object representing the field schema.
 * @returns A string containing the JavaScript code to add the field.
 */
export function generateAddFieldQuery(collectionNameOrId, fieldDefinition) {
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
    return `
  const collection = app.findCollectionByNameOrId("${collectionNameOrId}");

  // Add ${fieldDefinition.name} field
  collection.fields.add({
${fieldProps}
  });

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
export function generateRemoveFieldQuery(collectionNameOrId, fieldName) {
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
function formatValueAsJs(value) {
    if (value === null) {
        return 'null';
    }
    else if (value === undefined) {
        return 'null'; // Use null for undefined in PocketBase migrations
    }
    else if (typeof value === 'string') {
        return `"${value}"`;
    }
    else if (typeof value === 'object' && Array.isArray(value)) {
        return formatArrayAsJs(value);
    }
    else if (typeof value === 'object') {
        return formatObjectAsJs(value);
    }
    else {
        return String(value);
    }
}
/**
 * Helper function to format an array as JavaScript code.
 *
 * @param arr - The array to format
 * @returns A string containing the formatted JavaScript array
 */
function formatArrayAsJs(arr) {
    if (arr.length === 0) {
        return '[]';
    }
    const items = arr.map(item => {
        const formatted = formatValueAsJs(item);
        // If the formatted item is multiline, add indentation
        if (formatted.includes('\n')) {
            return formatted.split('\n').map((line, i) => i === 0 ? line : `    ${line}`).join('\n');
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
function formatObjectAsJs(obj) {
    const props = Object.entries(obj)
        .map(([key, value]) => `    ${key}: ${formatValueAsJs(value)}`)
        .join(',\n');
    return `{
${props}
  }`;
}
