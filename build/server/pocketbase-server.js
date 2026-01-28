import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema,
// CallToolResponse // Remove this import
 } from '@modelcontextprotocol/sdk/types.js';
import PocketBase from 'pocketbase';
import { registerTools, handleToolCall } from '../tools/index.js'; // To be created
import { formatError } from './error-handler.js';
const API_URL = process.env.POCKETBASE_API_URL || 'http://127.0.0.1:8090';
const ADMIN_TOKEN = process.env.POCKETBASE_ADMIN_TOKEN;
if (!ADMIN_TOKEN) {
    // This should ideally be handled more gracefully, maybe prevent server start
    console.error('FATAL: POCKETBASE_ADMIN_TOKEN environment variable is required');
    process.exit(1); // Exit if token is missing
}
export class PocketBaseServer {
    constructor() {
        this.server = new Server({
            name: 'pocketbase-mcp',
            version: '0.1.1', // Increment version
        }, {
            capabilities: {
                tools: {}, // Tools are registered dynamically
            },
        });
        this.pb = new PocketBase(API_URL);
        // Disable auto-refresh attempts
        this.pb.autoCancellation(false);
        // Authenticate as admin
        // We can assert ADMIN_TOKEN is defined here because the check above exits if it's not.
        this.pb.authStore.save(ADMIN_TOKEN, null);
        // Verify authentication (optional but recommended)
        this.setupRequestHandlers();
        this.setupErrorHandling();
    }
    setupRequestHandlers() {
        // List Tools: Delegate to the tools module
        this.server.setRequestHandler(ListToolsRequestSchema, async () => {
            return registerTools(); // Let the tools module provide the list
        });
        // Call Tool: Delegate to the tools module
        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            try {
                // Pass the PocketBase instance to the handler
                const result = await handleToolCall(request.params, this.pb);
                return result; // Cast result to any
            }
            catch (error) {
                // Use the centralized error handler
                return formatError(error); // Cast error result to any
            }
        });
    }
    setupErrorHandling() {
        // Log MCP errors
        this.server.onerror = (error) => {
            console.error('[MCP Framework Error]', error);
        };
        // Graceful shutdown
        process.on('SIGINT', async () => {
            console.log('SIGINT received, shutting down PocketBase MCP server...');
            await this.server.close();
            console.log('Server closed.');
            process.exit(0);
        });
        process.on('SIGTERM', async () => {
            console.log('SIGTERM received, shutting down PocketBase MCP server...');
            await this.server.close();
            console.log('Server closed.');
            process.exit(0);
        });
    }
    async run() {
        const transport = new StdioServerTransport();
        try {
            await this.server.connect(transport);
            console.error('PocketBase MCP server running on stdio');
        }
        catch (error) {
            console.error('Failed to connect PocketBase MCP server:', error);
            process.exit(1);
        }
    }
}
