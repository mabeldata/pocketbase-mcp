#!/usr/bin/env node
import { PocketBaseServer } from './server/pocketbase-server.js';
// Create and run the server instance
const server = new PocketBaseServer();
server.run().catch(error => {
    console.error('Failed to start PocketBase MCP server:', error);
    process.exit(1);
});
