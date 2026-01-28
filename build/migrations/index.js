// Main export for migration functionalities
// import * as generators from './generators/index.js'; // Import generators later
import * as helpers from './helpers/index.js';
import * as execution from './execution.js';
// --- Configuration ---
/**
 * Sets the directory where migration files will be created and read from.
 * @param customPath Optional custom path for migrations. If not provided, defaults to 'pb_migrations' in the current working directory.
 * @returns The resolved absolute path to the migrations directory.
 */
export function setMigrationsDirectory(customPath) {
    return helpers.setMigrationsDirectory(customPath);
}
// --- Core Migration Management Functions ---
/**
 * Creates a new, empty migration file with a timestamp and description.
 * @param description A brief description of the migration (e.g., "create_users_table").
 * @returns The full path to the created migration file.
 */
export async function createNewMigration(description) {
    const timestamp = helpers.generateTimestamp();
    // Sanitize description for filename
    const sanitizedDescription = description
        .toLowerCase()
        .replace(/[^a-z0-9_]+/g, '_') // Replace non-alphanumeric/underscore with underscore
        .replace(/^_+|_+$/g, ''); // Trim leading/trailing underscores
    if (!sanitizedDescription) {
        throw new Error("Migration description cannot be empty or only contain invalid characters.");
    }
    const filename = `${timestamp}_${sanitizedDescription}.js`;
    const content = helpers.generateMigrationTemplate(); // Generate basic template
    return helpers.createMigrationFile(filename, content);
}
/**
 * Creates a migration file specifically for creating a new collection.
 * @param collectionDefinition The schema definition for the new collection.
 * @param description Optional description override. If not provided, generated from collection name.
 * @returns The full path to the created migration file.
 */
export async function createCollectionMigration(collectionDefinition, description) {
    const timestamp = helpers.generateTimestamp();
    const collectionName = collectionDefinition.name;
    if (!collectionName || typeof collectionName !== 'string') {
        throw new Error("Collection definition must have a 'name' property.");
    }
    const collectionId = collectionDefinition.id;
    if (!collectionId || typeof collectionId !== 'string') {
        throw new Error("Collection definition must have an 'id' property.");
    }
    const desc = description || `create_${collectionName}_collection`;
    const sanitizedDescription = desc
        .toLowerCase()
        .replace(/[^a-z0-9_]+/g, '_')
        .replace(/^_+|_+$/g, '');
    const filename = `${timestamp}_${sanitizedDescription}.js`;
    // Generate specific up/down queries
    const upQuery = helpers.generateCreateCollectionQuery(collectionDefinition);
    const downQuery = helpers.generateDeleteCollectionQuery(collectionId); // Use ID for down query
    const content = helpers.generateMigrationTemplate(upQuery, downQuery);
    return helpers.createMigrationFile(filename, content);
}
/**
 * Creates a migration file for adding a field to an existing collection.
 * @param collectionNameOrId The name or ID of the collection to update.
 * @param fieldDefinition The schema definition for the new field.
 * @param description Optional description override. If not provided, generated from collection and field names.
 * @returns The full path to the created migration file.
 */
export async function createAddFieldMigration(collectionNameOrId, fieldDefinition, description) {
    const timestamp = helpers.generateTimestamp();
    if (!fieldDefinition.name || !fieldDefinition.type) {
        throw new Error("Field definition must include 'name' and 'type' properties.");
    }
    const fieldName = fieldDefinition.name;
    const desc = description || `update_${collectionNameOrId}_add_${fieldName}`;
    const sanitizedDescription = desc
        .toLowerCase()
        .replace(/[^a-z0-9_]+/g, '_')
        .replace(/^_+|_+$/g, '');
    const filename = `${timestamp}_${sanitizedDescription}.js`;
    // Generate specific up/down queries
    const upQuery = helpers.generateAddFieldQuery(collectionNameOrId, fieldDefinition);
    const downQuery = helpers.generateRemoveFieldQuery(collectionNameOrId, fieldName);
    const content = helpers.generateMigrationTemplate(upQuery, downQuery);
    return helpers.createMigrationFile(filename, content);
}
/**
 * Lists all migration files found in the migration directory.
 * @returns An array of migration filenames, sorted chronologically.
 */
export async function listMigrations() {
    return helpers.listMigrationFiles();
}
// --- Migration Execution Functions ---
/**
 * Applies a specific migration
 * @param migrationFile Name of the migration file to apply
 * @param pb PocketBase instance
 * @returns Result message
 */
export async function applyMigration(migrationFile, pb, customPath) {
    // If customPath is provided, set the migrations directory
    const migrationsDir = customPath
        ? helpers.setMigrationsDirectory(customPath)
        : helpers.setMigrationsDirectory(); // Use current directory
    return execution.applyMigration(migrationFile, pb, migrationsDir);
}
/**
 * Reverts a specific migration
 * @param migrationFile Name of the migration file to revert
 * @param pb PocketBase instance
 * @param customPath Optional custom path for migrations
 * @returns Result message
 */
export async function revertMigration(migrationFile, pb, customPath) {
    // If customPath is provided, set the migrations directory
    const migrationsDir = customPath
        ? helpers.setMigrationsDirectory(customPath)
        : helpers.setMigrationsDirectory(); // Use current directory
    return execution.revertMigration(migrationFile, pb, migrationsDir);
}
/**
 * Applies all pending migrations
 * @param pb PocketBase instance
 * @param appliedMigrations Array of already applied migration filenames
 * @param customPath Optional custom path for migrations
 * @returns Array of applied migration filenames
 */
export async function applyAllMigrations(pb, appliedMigrations = [], customPath) {
    // If customPath is provided, set the migrations directory
    const migrationsDir = customPath
        ? helpers.setMigrationsDirectory(customPath)
        : helpers.setMigrationsDirectory(); // Use current directory
    return execution.applyAllMigrations(pb, migrationsDir, appliedMigrations);
}
/**
 * Reverts migrations up to a specific target
 * @param targetMigration Name of the migration to revert to (exclusive)
 * @param pb PocketBase instance
 * @param appliedMigrations Array of already applied migration filenames
 * @param customPath Optional custom path for migrations
 * @returns Array of reverted migration filenames
 */
export async function revertToMigration(targetMigration, pb, appliedMigrations = [], customPath) {
    // If customPath is provided, set the migrations directory
    const migrationsDir = customPath
        ? helpers.setMigrationsDirectory(customPath)
        : helpers.setMigrationsDirectory(); // Use current directory
    return execution.revertToMigration(targetMigration, pb, migrationsDir, appliedMigrations);
}
// export { generators, helpers }; // Export submodules if needed directly
