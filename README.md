# PocketBase MCP Server

[![smithery badge](https://smithery.ai/badge/@mabeldata/pocketbase-mcp)](https://smithery.ai/server/@mabeldata/pocketbase-mcp)
[![Maintained_By Mabel Data](https://img.shields.io/badge/Maintained_By-MabelData-purple)](https://github.com/mabeldata/pocketbase-mcp/blob/main/LICENSE)

This is an MCP server that interacts with a PocketBase instance. It allows you to fetch, list, create, update, and manage records and files in your PocketBase collections.

## Installation

### Installing via Smithery

To install PocketBase MCP Server for Claude Desktop automatically via [Smithery](https://smithery.ai/server/@mabeldata/pocketbase-mcp):

```bash
npx -y @smithery/cli install @mabeldata/pocketbase-mcp --client claude
```

1.  **Clone the repository (if you haven't already):**
    ```bash
    git clone <repository_url>
    cd pocketbase-mcp
    ```
2.  **Install dependencies:**
    ```bash
    npm install
    ```
3.  **Build the server:**
    ```bash
    npm run build
    ```
    This compiles the TypeScript code to JavaScript in the `build/` directory and makes the entry point executable.

## Configuration

This server requires the following environment variables to be set:

-   `POCKETBASE_API_URL`: The URL of your PocketBase instance (e.g., `http://127.0.0.1:8090`). Defaults to `http://127.0.0.1:8090` if not set.
-   `POCKETBASE_ADMIN_TOKEN`: An admin authentication token for your PocketBase instance. **This is required.** You can generate this from your PocketBase admin UI, see [API KEYS](https://pocketbase.io/docs/authentication/#api-keys).

These variables need to be configured when adding the server to Cline (see Cline Installation section).

## Available Tools

The server provides the following tools, organized by category:

### Record Management

-   **fetch_record**: Fetch a single record from a PocketBase collection by ID.
    -   *Input Schema*:
        ```json
        {
          "type": "object",
          "properties": {
            "collection": {
              "type": "string",
              "description": "The name of the PocketBase collection."
            },
            "id": {
              "type": "string",
              "description": "The ID of the record to fetch."
            }
          },
          "required": [
            "collection",
            "id"
          ]
        }
        ```

-   **list_records**: List records from a PocketBase collection. Supports pagination, filtering, sorting, and expanding relations.
    -   *Input Schema*:
        ```json
        {
          "type": "object",
          "properties": {
            "collection": {
              "type": "string",
              "description": "The name of the PocketBase collection."
            },
            "page": {
              "type": "number",
              "description": "Page number (defaults to 1).",
              "minimum": 1
            },
            "perPage": {
              "type": "number",
              "description": "Items per page (defaults to 25).",
              "minimum": 1,
              "maximum": 100
            },
            "filter": {
              "type": "string",
              "description": "Filter string for the PocketBase query."
            },
            "sort": {
              "type": "string",
              "description": "Sort string for the PocketBase query (e.g., \\"fieldName,-otherFieldName\\")."
            },
            "expand": {
              "type": "string",
              "description": "Expand string for the PocketBase query (e.g., \\"relation1,relation2.subRelation\\")."
            }
          },
          "required": [
            "collection"
          ]
        }
        ```

-   **create_record**: Create a new record in a PocketBase collection.
    -   *Input Schema*:
        ```json
        {
          "type": "object",
          "properties": {
            "collection": {
              "type": "string",
              "description": "The name of the PocketBase collection."
            },
            "data": {
              "type": "object",
              "description": "The data for the new record.",
              "additionalProperties": true
            }
          },
          "required": [
            "collection",
            "data"
          ]
        }
        ```

-   **update_record**: Update an existing record in a PocketBase collection.
    -   *Input Schema*:
        ```json
        {
          "type": "object",
          "properties": {
            "collection": {
              "type": "string",
              "description": "The name of the PocketBase collection."
            },
            "id": {
              "type": "string",
              "description": "The ID of the record to update."
            },
            "data": {
              "type": "object",
              "description": "The data to update.",
              "additionalProperties": true
            }
          },
          "required": [
            "collection",
            "id",
            "data"
          ]
        }
        ```

-   **get_collection_schema**: Get the schema of a PocketBase collection.
    -   *Input Schema*:
        ```json
        {
          "type": "object",
          "properties": {
            "collection": {
              "type": "string",
              "description": "The name of the PocketBase collection."
            }
          },
          "required": [
            "collection"
          ]
        }
        ```

-   **upload_file**: Upload a file to a specific field in a PocketBase collection record.
    -   *Input Schema*:
        ```json
        {
          "type": "object",
          "properties": {
            "collection": {
              "type": "string",
              "description": "The name of the PocketBase collection."
            },
            "recordId": {
              "type": "string",
              "description": "The ID of the record to upload the file to."
            },
            "fileField": {
              "type": "string",
              "description": "The name of the file field in the PocketBase collection."
            },
            "fileContent": {
              "type": "string",
              "description": "The content of the file to upload."
            },
            "fileName": {
              "type": "string",
              "description": "The name of the file."
            }
          },
          "required": [
            "collection",
            "recordId",
            "fileField",
            "fileContent",
            "fileName"
          ]
        }
        ```

-   **list_collections**: List all collections in the PocketBase instance.
    -   *Input Schema*:
        ```json
        {
          "type": "object",
          "properties": {},
          "additionalProperties": false
        }
        ```

-   **download_file**: Get the download URL for a file stored in a PocketBase collection record.
    -   *Input Schema*:
        ```json
        {
          "type": "object",
          "properties": {
            "collection": {
              "type": "string",
              "description": "The name of the PocketBase collection."
            },
            "recordId": {
              "type": "string",
              "description": "The ID of the record to download the file from."
            },
            "fileField": {
              "type": "string",
              "description": "The name of the file field in the PocketBase collection."
            },
            "downloadPath": {
              "type": "string",
              "description": "The path where the downloaded file should be saved (Note: This tool currently returns the URL, download must be handled separately)."
            }
          },
          "required": [
            "collection",
            "recordId",
            "fileField",
            "downloadPath"
          ]
        }
        ```
        *Note: This tool returns the file URL. The actual download needs to be performed by the client using this URL.*

### Collection Management

-   **list_collections**: List all collections in the PocketBase instance.
    -   *Input Schema*:
        ```json
        {
          "type": "object",
          "properties": {},
          "additionalProperties": false
        }
        ```

-   **get_collection_schema**: Get the schema of a PocketBase collection.
    -   *Input Schema*:
        ```json
        {
          "type": "object",
          "properties": {
            "collection": {
              "type": "string",
              "description": "The name of the PocketBase collection."
            }
          },
          "required": [
            "collection"
          ]
        }
        ```

### Log Management

> **Note:** The Logs API requires admin authentication and may not be available in all PocketBase instances or configurations. These tools interact with the PocketBase Logs API as documented at https://pocketbase.io/docs/api-logs/.

-   **list_logs**: List API request logs from PocketBase with filtering, sorting, and pagination.
    -   *Input Schema*:
        ```json
        {
          "type": "object",
          "properties": {
            "page": {
              "type": "number",
              "description": "Page number (defaults to 1).",
              "minimum": 1
            },
            "perPage": {
              "type": "number",
              "description": "Items per page (defaults to 30, max 500).",
              "minimum": 1,
              "maximum": 500
            },
            "filter": {
              "type": "string",
              "description": "PocketBase filter string (e.g., \"method='GET'\")."
            }
          },
          "required": []
        }
        ```

-   **get_log**: Get a single API request log by ID.
    -   *Input Schema*:
        ```json
        {
          "type": "object",
          "properties": {
            "id": {
              "type": "string",
              "description": "The ID of the log to fetch."
            }
          },
          "required": [
            "id"
          ]
        }
        ```

-   **get_logs_stats**: Get API request logs statistics with optional filtering.
    -   *Input Schema*:
        ```json
        {
          "type": "object",
          "properties": {
            "filter": {
              "type": "string",
              "description": "PocketBase filter string (e.g., \"method='GET'\")."
            }
          },
          "required": []
        }
        ```

### Cron Job Management

> **Note:** The Cron Jobs API requires admin authentication and may not be available in all PocketBase instances or configurations. These tools interact with the PocketBase Cron Jobs API.

-   **list_cron_jobs**: Returns list with all registered app level cron jobs.
    -   *Input Schema*:
        ```json
        {
          "type": "object",
          "properties": {
            "fields": {
              "type": "string",
              "description": "Comma separated string of the fields to return in the JSON response (by default returns all fields). Ex.:?fields=*,expand.relField.name"
            }
          }
        }
        ```

-   **run_cron_job**: Triggers a single cron job by its id.
    -   *Input Schema*:
        ```json
        {
          "type": "object",
          "properties": {
            "jobId": {
              "type": "string",
              "description": "The identifier of the cron job to run."
            }
          },
          "required": [
            "jobId"
          ]
        }
        ```

### Migration Management

-   **set_migrations_directory**: Set the directory where migration files will be created and read from.
    -   *Input Schema*:
        ```json
        {
          "type": "object",
          "properties": {
            "customPath": { 
              "type": "string", 
              "description": "Custom path for migrations. If not provided, defaults to 'pb_migrations' in the current working directory." 
            }
          }
        }
        ```

-   **create_migration**: Create a new, empty PocketBase migration file with a timestamped name.
    -   *Input Schema*:
        ```json
        {
          "type": "object",
          "properties": {
            "description": { 
              "type": "string", 
              "description": "A brief description for the migration filename (e.g., 'add_user_email_index')." 
            }
          },
          "required": ["description"]
        }
        ```

-   **create_collection_migration**: Create a migration file specifically for creating a new PocketBase collection.
    -   *Input Schema*:
        ```json
        {
          "type": "object",
          "properties": {
            "description": { 
              "type": "string", 
              "description": "Optional description override for the filename." 
            },
            "collectionDefinition": {
              "type": "object",
              "description": "The full schema definition for the new collection (including name, id, fields, rules, etc.).",
              "additionalProperties": true
            }
          },
          "required": ["collectionDefinition"]
        }
        ```

-   **add_field_migration**: Create a migration file for adding a field to an existing collection.
    -   *Input Schema*:
        ```json
        {
          "type": "object",
          "properties": {
            "collectionNameOrId": { 
              "type": "string", 
              "description": "The name or ID of the collection to update." 
            },
            "fieldDefinition": {
              "type": "object",
              "description": "The schema definition for the new field.",
              "additionalProperties": true
            },
            "description": { 
              "type": "string", 
              "description": "Optional description override for the filename." 
            }
          },
          "required": ["collectionNameOrId", "fieldDefinition"]
        }
        ```

-   **list_migrations**: List all migration files found in the PocketBase migrations directory.
    -   *Input Schema*:
        ```json
        {
          "type": "object",
          "properties": {},
          "additionalProperties": false
        }
        ```

-   **apply_migration**: Apply a specific migration file.
    -   *Input Schema*:
        ```json
        {
          "type": "object",
          "properties": {
            "migrationFile": { 
              "type": "string", 
              "description": "Name of the migration file to apply." 
            }
          },
          "required": ["migrationFile"]
        }
        ```

-   **revert_migration**: Revert a specific migration file.
    -   *Input Schema*:
        ```json
        {
          "type": "object",
          "properties": {
            "migrationFile": { 
              "type": "string", 
              "description": "Name of the migration file to revert." 
            }
          },
          "required": ["migrationFile"]
        }
        ```

-   **apply_all_migrations**: Apply all pending migrations.
    -   *Input Schema*:
        ```json
        {
          "type": "object",
          "properties": {
            "appliedMigrations": { 
              "type": "array", 
              "items": { "type": "string" },
              "description": "Array of already applied migration filenames." 
            }
          }
        }
        ```

-   **revert_to_migration**: Revert migrations up to a specific target.
    -   *Input Schema*:
        ```json
        {
          "type": "object",
          "properties": {
            "targetMigration": { 
              "type": "string", 
              "description": "Name of the migration to revert to (exclusive). Use empty string to revert all." 
            },
            "appliedMigrations": { 
              "type": "array", 
              "items": { "type": "string" },
              "description": "Array of already applied migration filenames." 
            }
          },
          "required": ["targetMigration"]
        }
        ```

## Migration System

The PocketBase MCP Server includes a comprehensive migration system for managing database schema changes. This system allows you to:

1. Create migration files with timestamped names
2. Generate migrations for common operations (creating collections, adding fields)
3. Apply and revert migrations individually or in batches
4. Track which migrations have been applied

### Migration File Format

Migration files are JavaScript files with a timestamp prefix and descriptive name:

```javascript
// 1744005374_update_transactions_add_debt_link.js
/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  // Up migration code here
  return app.save();
}, (app) => {
  // Down migration code here
  return app.save();
});
```

Each migration has an "up" function for applying changes and a "down" function for reverting them.

### Usage Examples

**Setting a custom migrations directory:**
```javascript
await setMigrationsDirectory("./my_migrations");
```

**Creating a basic migration:**
```javascript
await createNewMigration("add_user_email_index");
```

**Creating a collection migration:**
```javascript
await createCollectionMigration({
  id: "users",
  name: "users",
  fields: [
    { name: "email", type: "email", required: true }
  ]
});
```

**Adding a field to a collection:**
```javascript
await createAddFieldMigration("users", {
  name: "address",
  type: "text"
});
```

**Applying migrations:**
```javascript
// Apply a specific migration
await applyMigration("1744005374_update_transactions_add_debt_link.js", pocketbaseInstance);

// Apply all pending migrations
await applyAllMigrations(pocketbaseInstance);
```

**Reverting migrations:**
```javascript
// Revert a specific migration
await revertMigration("1744005374_update_transactions_add_debt_link.js", pocketbaseInstance);

// Revert to a specific point (exclusive)
await revertToMigration("1743958155_update_transactions_add_relation_to_itself.js", pocketbaseInstance);

// Revert all migrations
await revertToMigration("", pocketbaseInstance);
```

## Cline Installation

To use this server with Cline, you need to add it to your MCP settings file (`cline_mcp_settings.json`).

1.  **Locate your Cline MCP settings file:**
    *   Typically found at `~/.config/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json` on Linux/macOS.
    *   Or `~/Library/Application Support/Claude/claude_desktop_config.json` if using the Claude desktop app on macOS.

2.  **Edit the file and add the following configuration under the `mcpServers` key.** Replace `/path/to/pocketbase-mcp` with the actual absolute path to this project directory on your system. Also, replace `<YOUR_POCKETBASE_API_URL>` and `<YOUR_POCKETBASE_ADMIN_TOKEN>` with your actual PocketBase URL and admin token.

    ```json
    {
      "mcpServers": {
        // ... other servers might be listed here ...

        "pocketbase-mcp": {
          "command": "node",
          "args": ["/path/to/pocketbase-mcp/build/index.js"],
          "env": {
            "POCKETBASE_API_URL": "<YOUR_POCKETBASE_API_URL>", // e.g., "http://127.0.0.1:8090"
            "POCKETBASE_ADMIN_TOKEN": "<YOUR_POCKETBASE_ADMIN_TOKEN>"
          },
          "disabled": false, // Ensure it's enabled
          "autoApprove": [
            "fetch_record",
            "list_collections",
            "get_collection_schema",
            "list_logs",
            "get_log",
            "get_logs_stats",
            "list_cron_jobs",
            "run_cron_job"
          ] // Suggested auto-approve settings
        }

        // ... other servers might be listed here ...
      }
    }
    ```

3.  **Save the settings file.** Cline should automatically detect the changes and connect to the server. You can then use the tools listed above.

## Dependencies

-   `@modelcontextprotocol/sdk`
-   `pocketbase`
-   `typescript`
-   `ts-node` (dev dependency)
-   `@types/node` (dev dependency)
