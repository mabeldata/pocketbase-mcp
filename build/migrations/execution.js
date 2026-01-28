import fs from 'fs/promises';
import path from 'path';
import { listMigrationFiles } from './helpers/file-system.js';
/**
 * Loads a migration file and returns its up and down functions
 * @param migrationPath Full path to the migration file
 * @returns Object containing up and down functions
 */
async function loadMigrationFile(migrationPath) {
    try {
        // Read the file content
        const content = await fs.readFile(migrationPath, 'utf-8');
        // Extract the up and down functions using regex
        const migrateMatch = content.match(/migrate\(\s*\(\s*app\s*\)\s*=>\s*\{([\s\S]*?)}\s*,\s*\(\s*app\s*\)\s*=>\s*\{([\s\S]*?)}\s*\)/);
        if (!migrateMatch || migrateMatch.length < 3) {
            throw new Error(`Invalid migration format in file: ${migrationPath}`);
        }
        const upBody = migrateMatch[1].trim();
        const downBody = migrateMatch[2].trim();
        // Create the up and down functions
        const up = new Function('app', `${upBody}`);
        const down = new Function('app', `${downBody}`);
        return {
            up: async (app) => await up(app),
            down: async (app) => await down(app)
        };
    }
    catch (error) {
        console.error(`Error loading migration file ${migrationPath}:`, error);
        throw new Error(`Failed to load migration file: ${error.message}`);
    }
}
/**
 * Applies a specific migration
 * @param migrationFile Name of the migration file to apply
 * @param pb PocketBase instance
 * @param migrationsDir Directory containing migration files
 * @returns Result message
 */
export async function applyMigration(migrationFile, pb, migrationsDir) {
    try {
        const migrationPath = path.join(migrationsDir, migrationFile);
        // Check if file exists
        await fs.access(migrationPath, fs.constants.R_OK);
        // Load the migration
        const migration = await loadMigrationFile(migrationPath);
        // Execute the up function
        await migration.up(pb);
        return `Successfully applied migration: ${migrationFile}`;
    }
    catch (error) {
        console.error(`Error applying migration ${migrationFile}:`, error);
        throw new Error(`Failed to apply migration: ${error.message}`);
    }
}
/**
 * Reverts a specific migration
 * @param migrationFile Name of the migration file to revert
 * @param pb PocketBase instance
 * @param migrationsDir Directory containing migration files
 * @returns Result message
 */
export async function revertMigration(migrationFile, pb, migrationsDir) {
    try {
        const migrationPath = path.join(migrationsDir, migrationFile);
        // Check if file exists
        await fs.access(migrationPath, fs.constants.R_OK);
        // Load the migration
        const migration = await loadMigrationFile(migrationPath);
        // Execute the down function
        await migration.down(pb);
        return `Successfully reverted migration: ${migrationFile}`;
    }
    catch (error) {
        console.error(`Error reverting migration ${migrationFile}:`, error);
        throw new Error(`Failed to revert migration: ${error.message}`);
    }
}
/**
 * Applies all pending migrations
 * @param pb PocketBase instance
 * @param migrationsDir Directory containing migration files
 * @param appliedMigrations Array of already applied migration filenames
 * @returns Array of applied migration filenames
 */
export async function applyAllMigrations(pb, migrationsDir, appliedMigrations = []) {
    try {
        // Get all migration files
        const allMigrations = await listMigrationFiles();
        // Filter out already applied migrations
        const pendingMigrations = allMigrations.filter(migration => !appliedMigrations.includes(migration));
        if (pendingMigrations.length === 0) {
            return [];
        }
        const newlyApplied = [];
        // Apply each pending migration
        for (const migration of pendingMigrations) {
            await applyMigration(migration, pb, migrationsDir);
            newlyApplied.push(migration);
        }
        return newlyApplied;
    }
    catch (error) {
        console.error('Error applying all migrations:', error);
        throw new Error(`Failed to apply all migrations: ${error.message}`);
    }
}
/**
 * Reverts migrations up to a specific target
 * @param targetMigration Name of the migration to revert to (exclusive)
 * @param pb PocketBase instance
 * @param migrationsDir Directory containing migration files
 * @param appliedMigrations Array of already applied migration filenames
 * @returns Array of reverted migration filenames
 */
export async function revertToMigration(targetMigration, pb, migrationsDir, appliedMigrations = []) {
    try {
        // If no migrations have been applied, nothing to revert
        if (appliedMigrations.length === 0) {
            return [];
        }
        // Sort applied migrations in reverse chronological order
        const sortedMigrations = [...appliedMigrations].sort((a, b) => {
            const tsA = parseInt(a.split('_')[0], 10);
            const tsB = parseInt(b.split('_')[0], 10);
            return tsB - tsA; // Descending order
        });
        const targetIndex = sortedMigrations.indexOf(targetMigration);
        if (targetIndex === -1 && targetMigration !== '') {
            throw new Error(`Target migration not found: ${targetMigration}`);
        }
        // Determine which migrations to revert
        const migrationsToRevert = targetMigration === ''
            ? sortedMigrations // Revert all if target is empty
            : sortedMigrations.slice(0, targetIndex);
        const reverted = [];
        // Revert each migration
        for (const migration of migrationsToRevert) {
            await revertMigration(migration, pb, migrationsDir);
            reverted.push(migration);
        }
        return reverted;
    }
    catch (error) {
        console.error('Error reverting migrations:', error);
        throw new Error(`Failed to revert migrations: ${error.message}`);
    }
}
