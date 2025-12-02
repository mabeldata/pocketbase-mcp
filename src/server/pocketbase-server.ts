import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import PocketBase from 'pocketbase';
import {registerTools, handleToolCall} from '../tools/index.js'; // To be created
import {formatError} from './error-handler.js';
import {
  StreamableHTTPServerTransport
} from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from 'express';
import cors from 'cors';

const API_URL = process.env.POCKETBASE_API_URL || 'http://127.0.0.1:8090';
const ADMIN_TOKEN = process.env.POCKETBASE_ADMIN_TOKEN;

if (!ADMIN_TOKEN) {
  // This should ideally be handled more gracefully, maybe prevent server start
  console.error('FATAL: POCKETBASE_ADMIN_TOKEN environment variable is required');
  process.exit(1); // Exit if token is missing
}

export class PocketBaseServer {
  private server: McpServer;
  private pb: PocketBase;

  constructor() {
    this.server = new McpServer(
      {
        name: 'pocketbase-mcp',
        version: '0.1.2', // Increment version
      }
    );

    this.pb = new PocketBase(API_URL);
    // Disable auto-refresh attempts
    this.pb.autoCancellation(false);

    // Authenticate as admin
    // We can assert ADMIN_TOKEN is defined here because the check above exits if it's not.
    this.pb.authStore.save(ADMIN_TOKEN!, null);
    // Verify authentication (optional but recommended)
    this.setupRequestHandlers();
    this.setupErrorHandling();
  }

  private setupRequestHandlers() {
    // List Tools: Delegate to the tools module
    let register = registerTools();

    register.tools.forEach(tool => {
      this.server.registerTool(tool.name, tool,
        async (param: any, extra: any) => {
          try {
            // Pass the PocketBase instance to the handler
            const result = await handleToolCall({
              name: tool.name,
              arguments: param
            }, this.pb);
            return result as any; // Cast result to any
          } catch (error: unknown) {
            // Use the centralized error handler
            return formatError(error) as any; // Cast error result to any
          }
        })
    })
  }

  private setupErrorHandling() {
    // Log MCP errors
    this.server.server.onerror = (error: Error) => {
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

  async runStdio() {
    const transport = new StdioServerTransport();
    try {
      await this.server.connect(transport);
      console.error('PocketBase MCP server running on stdio');
    } catch (error) {
      console.error('Failed to connect PocketBase MCP server:', error);
      process.exit(1);
    }
  }

  async runHttp() {
    const app = express();
    app.use(express.json());
    app.use(
      cors({
        origin: '*', // Configure appropriately for production, for example:
        // origin: ['https://your-remote-domain.com', 'https://your-other-remote-domain.com'],
        exposedHeaders: ['Mcp-Session-Id'],
        allowedHeaders: ['Content-Type', 'mcp-session-id']
      })
    );
    app.post('/mcp', async (req: any, res: any) => {
      try {
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
          enableJsonResponse: true
        });

        res.on('close', () => {
          transport.close();
        });

        await this.server.connect(transport);
        await transport.handleRequest(req, res, req.body).catch((err: Error) => {
          console.log(err)
        });
      } catch (error) {
        console.error('Error handling MCP request:', error);
        if (!res.headersSent) {
          res.status(500).json({
            jsonrpc: '2.0',
            error: {
              code: -32603,
              message: 'Internal server error'
            },
            id: null
          });
        }
      }
    });


    // Reusable handler for GET and DELETE requests
    const handleSessionRequest = async (req: express.Request, res: express.Response) => {
    };

    // Handle GET requests for server-to-client notifications via SSE
    app.get('/mcp', handleSessionRequest);

    // Handle DELETE requests for session termination
    app.delete('/mcp', handleSessionRequest);

    const port = parseInt(process.env.POCKETBASE_PORT || '3000');
    app.listen(port, () => {
      console.log(`MCP Server running on http://localhost:${port}/mcp`);
    }).on('error', (error: any) => {
      console.error('Server error:', error);
      process.exit(1);
    });
  }
}