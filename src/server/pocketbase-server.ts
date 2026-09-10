import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
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
  private server: Server;
  private pb: PocketBase;

  constructor() {
    this.server = new Server(
      {
        name: 'pocketbase-mcp',
        version: '1.1.0', // Bumped with the PocketBase v0.40 compatibility refactor
      },
      {
        capabilities: {
          tools: {}, // Tools are registered dynamically
        },
      }
    );

    this.pb = new PocketBase(API_URL);
    // Disable auto-cancellation of pending requests
    this.pb.autoCancellation(false);
    
    // Authenticate as superuser with a fixed API token.
    // NOTE: since PocketBase v0.38 a superuser IP whitelist can be enabled in
    // Settings; when active, requests from IPs outside the whitelist are
    // rejected with 403 (see README troubleshooting).
    // We can assert ADMIN_TOKEN is defined here because the check above exits if it's not.
    this.pb.authStore.save(ADMIN_TOKEN!, null);
    this.setupRequestHandlers();
    this.setupErrorHandling();
  }

  private setupRequestHandlers() {
    // List Tools: Delegate to the tools module
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
        return registerTools(); // Let the tools module provide the list
    });

    // Call Tool: Delegate to the tools module
    this.server.setRequestHandler(CallToolRequestSchema, async (request): Promise<any> => { // Cast return Promise to any
      try {
        // Pass the PocketBase instance to the handler
        const result = await handleToolCall(request.params, this.pb);
        return result as any; // Cast result to any
      } catch (error: unknown) {
        // Use the centralized error handler
        return formatError(error) as any; // Cast error result to any
      }
    });
  }

  private setupErrorHandling() {
     // Log MCP errors
    this.server.onerror = (error: Error) => {
        console.error('[MCP Framework Error]', error);
    };

    // Graceful shutdown
    process.on('SIGINT', async () => {
      console.error('SIGINT received, shutting down PocketBase MCP server...');
      await this.server.close();
      console.error('Server closed.');
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
        console.error('SIGTERM received, shutting down PocketBase MCP server...');
        await this.server.close();
        console.error('Server closed.');
        process.exit(0);
    });
  }

  async run() {
    const transport = new StdioServerTransport();

    // Verify the PocketBase instance is reachable before serving requests.
    // A failure here is logged to stderr (with an actionable hint) but does
    // not prevent startup: the stdio server must still answer tools/list even
    // if the PocketBase instance is temporarily down.
    try {
      await this.pb.health.check();
    } catch (error) {
      console.error(
        `WARNING: PocketBase health check failed for ${API_URL}. ` +
        `Tools will return errors until the instance is reachable. ` +
        `Common causes: instance down, wrong POCKETBASE_API_URL, or superuser IP whitelist (PocketBase >= v0.38).`,
        error
      );
    }

    try {
        await this.server.connect(transport);
        console.error('PocketBase MCP server running on stdio');
    } catch (error) {
        console.error('Failed to connect PocketBase MCP server:', error);
        process.exit(1);
    }
  }
}
