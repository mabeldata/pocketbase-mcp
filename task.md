# Task List

This file is used to track tasks. Tasks are marked with `[ ]` for incomplete and `[X]` for completed. The next task to be taken is the first one marked with `[ ]`. If that task has subtasks do the one with [ ], only marking the parent task as done when all subtasks for that parent task are with [X] marked.

**IMPORTANT: After completing each task or subtask, update this file immediately to reflect the changes (mark tasks as complete and add new tasks as needed).**

## General Tasks

- [X] **Enhance `list_records` tool:**
    - [X] Add support for filtering records based on field values.
    - [X] Implement pagination options for listing large datasets.
    - [X] Allow sorting of records by specific fields.
    - [X] Implement support for expanding relations in list results.
- [ ] **Collection Management Tools:**
    - [X] Add a tool to list all collections in the PocketBase instance (`list_collections`).
    - [X] Implement a tool to get schema of a specific collection (`get_collection_schema`).
    - [X] Implement tools for Collection Management:
        - [ ] Create and manage collections with custom schemas (`create_collection`, `update_collection`)
        - [ ] Migrate collection schemas with data preservation (`migrate_collection_schema`)
        - [ ] Advanced index management tools:
            - [ ] Create indexes (`create_index`)
            - [ ] Delete indexes (`delete_index`)
            - [ ] List indexes (`list_indexes`)
        - [ ] Implement schema validation and type safety (This might be more of an implementation detail within other tools, but could be a task to ensure it's properly handled)
        - [X] Expose collection meta endpoints (`get_collection_scaffolds`, `dry_run_view_query`) — PR-3, server >= v0.37

- [ ] **File Handling Tools:**
    - [ ] Implement a tool to upload files to a PocketBase collection with file fields (`upload_file`).
    - [ ] Add a tool to download files from a PocketBase collection (`download_file`).

- [ ] **Record Operations:**
    - [X] Implement a tool to delete a record from a PocketBase collection (`delete_record`).
    - [ ] Enhance Record Operations:
        - [ ] Implement advanced querying with aggregation (`list_records` with aggregation support)
        - [ ] Implement batch import/export capabilities:
            - [X] Batch record operations with transactional semantics (`batch_records` via /api/batch) — PR-3
            - [ ] Batch record export (`batch_export_records`)

- [ ] **User Management Tools:**
    - [ ] Implement User Management Tools:
        - [ ] User authentication and token management tools: (`create_user_token`, `verify_user_token`)
        - [ ] User account creation and management tools: (`create_user`, `update_user`, `delete_user`, `list_users`)
        - [ ] Password management tools: (`update_user_password`, `reset_user_password`)
        - [ ] Role-based access control tools (This might be complex and could be broken down further if needed)
        - [ ] Session handling (This might be more of an implementation detail, but could be a task if specific tools are needed)

- [ ] **Database Operation Tools:**
    - [ ] Implement Database Operation Tools:
        - [X] Database backup and restore tools: (`list_backups`, `create_backup`, `restore_backup`) + app settings (`get_settings`, `update_settings`) — PR-3
        - [ ] Multiple export formats (`export_database_json`, `export_database_csv`)
        - [ ] Data migration tools (This is a broad task and might need further definition)
        - [ ] Index optimization tools (`optimize_indexes`)
        - [ ] Batch operations (covered transactionally by `batch_records` — PR-3)

- [ ] **Realtime Subscription Tools (Advanced):**
    - [ ] Explore adding tools to subscribe to realtime events for specific collections (`subscribe_collection`).
    - [ ] Implement a tool to unsubscribe from realtime events (`unsubscribe_collection`).
- [ ] **Admin Authentication Tool (Optional):**
    - [ ] If not using impersonate token, add a tool to authenticate as admin and obtain an admin token (`admin_auth`).
- [ ] **Documentation:**
    - [ ] Create a README.md file for the `pocketbase-mcp` server.
    - [ ] Document each tool with clear descriptions, input schemas, and example usage, including code examples.
- [ ] **Improve Error Handling:**
    - [ ] Implement more specific error handling for PocketBase API interactions.
    - [ ] Provide more informative error messages to the user through the MCP tool responses, including PocketBase error details when available.
    - [ ] Handle rate limiting and retry mechanisms for API requests.
- [ ] **Add Input Validation:**
    - [ ] Validate input parameters for all tools to ensure they conform to the input schemas.
    - [ ] Return specific error messages for invalid input, clearly indicating the invalid fields and expected format.
    - [ ] Validate data types and formats for create and update operations based on collection schema.
    - [ ] Add documentation on setting up authentication and environment variables.