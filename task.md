# Task List

This file is used to track tasks. Tasks are marked with `[ ]` for incomplete and `[X]` for completed. The next task to be taken is the first one marked with `[ ]`. If that task has subtasks do the one with [ ], only marking the parent task as done when all subtasks for that parent task are with [X] marked.

**IMPORTANT: After completing each task or subtask, update this file immediately to reflect the changes (mark tasks as complete and add new tasks as needed).**

## General Tasks

- [X] **Enhance `list_records` tool:**
    - [X] Add support for filtering records based on field values.
    - [X] Implement pagination options for listing large datasets.
    - [X] Allow sorting of records by specific fields.
    - [X] Implement support for expanding relations in list results.
- [X] **Collection Management Tools:**
    - [X] Add a tool to list all collections in the PocketBase instance (`list_collections`).
    - [X] Implement a tool to get schema of a specific collection (`get_collection_schema`).
    - [X] Implement tools for Collection Management:
        - [X] Create and manage collections with custom schemas (`create_collection`, `update_collection`)
        - [X] Migrate collection schemas with data preservation (`migrate_collection_schema`)
        - [X] Advanced index management tools:
            - [X] Create indexes (`create_index`)
            - [X] Delete indexes (`delete_index`)
            - [X] List indexes (`list_indexes`)
        - [X] Implement schema validation and type safety (This might be more of an implementation detail within other tools, but could be a task to ensure it's properly handled)

- [X] **File Handling Tools:**
    - [X] Implement a tool to upload files to a PocketBase collection with file fields (`upload_file`).
    - [X] Add a tool to download files from a PocketBase collection (`download_file`).

- [X] **Record Operations:**
    - [X] Implement a tool to delete a record from a PocketBase collection (`delete_record`).
    - [X] Enhance Record Operations:
        - [X] Implement advanced querying with aggregation (`list_records` with aggregation support)
        - [X] Implement batch import/export capabilities:
            - [X] Batch record import (`batch_import_records`)
            - [X] Batch record export (`batch_export_records`)

- [X] **User Management Tools:**
    - [X] Implement User Management Tools:
        - [X] User authentication and token management tools: (`create_user_token`, `verify_user_token`)
        - [X] User account creation and management tools: (`create_user`, `update_user`, `delete_user`, `list_users`)
        - [X] Password management tools: (`update_user_password`, `reset_user_password`)
        - [ ] Role-based access control tools (This might be complex and could be broken down further if needed)
        - [ ] Session handling (This might be more of an implementation detail, but could be a task if specific tools are needed)

- [X] **Database Operation Tools:**
    - [X] Implement Database Operation Tools:
        - [X] Database backup and restore tools: (`backup_database`, `restore_database`)
        - [X] Multiple export formats (`export_database_json`, `export_database_csv`)
        - [X] Data migration tools (This is a broad task and might need further definition)
        - [X] Index optimization tools (`optimize_indexes`)
        - [X] Batch operations (This might overlap with Batch Record Operations, needs clarification)

- [X] **Realtime Subscription Tools (Advanced):**
    - [X] Explore adding tools to subscribe to realtime events for specific collections (`subscribe_collection`).
    - [X] Implement a tool to unsubscribe from realtime events (`unsubscribe_collection`).
- [X] **Admin Authentication Tool (Optional):**
    - [X] If not using impersonate token, add a tool to authenticate as admin and obtain an admin token (`admin_auth`).
- [X] **Documentation:**
    - [X] Create a README.md file for the `pocketbase-mcp` server.
    - [X] Document each tool with clear descriptions, input schemas, and example usage, including code examples.
- [X] **Improve Error Handling:**
    - [X] Implement more specific error handling for PocketBase API interactions.
    - [X] Provide more informative error messages to the user through the MCP tool responses, including PocketBase error details when available.
    - [X] Handle rate limiting and retry mechanisms for API requests.
- [X] **Add Input Validation:**
    - [X] Validate input parameters for all tools to ensure they conform to the input schemas.
    - [X] Return specific error messages for invalid input, clearly indicating the invalid fields and expected format.
    - [X] Validate data types and formats for create and update operations based on collection schema.
    - [X] Add documentation on setting up authentication and environment variables.