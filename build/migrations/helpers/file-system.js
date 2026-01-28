import fs from 'fs/promises';
import path from 'path';
// Define the migrations directory with configuration capability
let MIGRATIONS_DIR;
/**
 * Sets the directory where migration files will be created and read from.
 * @param customPath Optional custom path for migrations. If not provided, defaults to 'pb_migrations' in the current working directory.
 * @returns The resolved absolute path to the migrations directory.
 */
export function setMigrationsDirectory(customPath) {
    if (customPath) {
        // Use custom path if provided
        // Check if the path is absolute or relative
        if (path.isAbsolute(customPath)) {
            MIGRATIONS_DIR = customPath;
        }
        else {
            // For relative paths, resolve from the current working directory
            MIGRATIONS_DIR = path.resolve(process.cwd(), customPath);
        }
    }
    else {
        // Default to pb_migrations in the project directory
        MIGRATIONS_DIR = path.resolve(process.cwd(), 'pb_migrations');
    }
    return MIGRATIONS_DIR;
}
// Initialize with default
setMigrationsDirectory();
/**
 * Creates a new migration file with the given content.
 * Ensures the migrations directory exists.
 *
 * @param filename The name of the migration file (e.g., "1678886400_create_posts.js").
 * @param content The content to write to the file.
 * @returns The full path to the created file.
 * @throws If file creation fails.
 */
export async function createMigrationFile(filename, content) {
    try {
        // Ensure the filename is safe (basic check)
        if (!filename.match(/^[\w.-]+$/)) {
            throw new Error(`Invalid migration filename: ${filename}. Only alphanumeric characters, underscores, hyphens, and dots are allowed.`);
        }
        // Ensure filename ends with .js
        if (!filename.endsWith('.js')) {
            filename += '.js';
        }
        // Ensure the migrations directory exists
        await fs.mkdir(MIGRATIONS_DIR, { recursive: true });
        const filePath = path.join(MIGRATIONS_DIR, filename);
        // Check if file already exists to prevent accidental overwrite
        try {
            await fs.access(filePath, fs.constants.F_OK);
            // If access doesn't throw, file exists
            throw new Error(`Migration file already exists: ${filePath}`);
        }
        catch (accessError) {
            // If error is specifically ENOENT, file doesn't exist, which is good
            if (accessError.code !== 'ENOENT') {
                throw accessError; // Re-throw other access errors
            }
            // File does not exist, proceed to write
        }
        await fs.writeFile(filePath, content, 'utf-8');
        console.log(`Migration file created: ${filePath}`); // Log success
        return filePath;
    }
    catch (error) {
        console.error(`Error creating migration file ${filename}:`, error);
        throw new Error(`Failed to create migration file: ${error.message}`);
    }
}
/**
 * Lists all migration files in the migrations directory.
 *
 * @returns A promise that resolves to an array of migration filenames.
 */
export async function listMigrationFiles() {
    try {
        await fs.access(MIGRATIONS_DIR, fs.constants.R_OK); // Check if directory exists and is readable
        const files = await fs.readdir(MIGRATIONS_DIR);
        // Filter for .js files and sort chronologically based on timestamp prefix
        return files
            .filter(file => file.endsWith('.js') && /^\d+_/.test(file))
            .sort((a, b) => {
            const tsA = parseInt(a.split('_')[0], 10);
            const tsB = b.split('_')[0] ? parseInt(b.split('_')[0], 10) : 0; // Handle potential malformed names
            return tsA - tsB;
        });
    }
    catch (error) {
        if (error.code === 'ENOENT') {
            // Migrations directory doesn't exist, return empty list
            return [];
        }
        console.error('Error listing migration files:', error);
        throw new Error(`Failed to list migration files: ${error.message}`);
    }
}
