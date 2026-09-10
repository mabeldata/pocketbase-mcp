import PocketBase from 'pocketbase';
import {
    ToolResult, ToolInfo,
    RunSqlArgs
} from '../types/index.js';
import { invalidParamsError } from '../server/error-handler.js';

/**
 * SQL tool (PocketBase server >= v0.39.0, endpoint POST /api/sql).
 *
 * SECURITY GATE: this tool executes ARBITRARY SQL against the PocketBase
 * instance with superuser privileges. It is therefore DISABLED BY DEFAULT
 * and only runs when the server process has POCKETBASE_ENABLE_SQL=true in
 * its environment. When the gate is closed the tool returns a descriptive
 * error and never touches the network. See README "SQL Execution" for the
 * full risk discussion.
 */

// Env gate read AT CALL TIME (not module load) so tests can flip it and
// operators can change it per-process without rebuilding.
const SQL_GATE_ENV = 'POCKETBASE_ENABLE_SQL';

export function isSqlEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
    return env[SQL_GATE_ENV] === 'true';
}

// Define tool information for registration
const sqlToolInfo: ToolInfo[] = [
    {
        name: 'run_sql',
        description: 'Execute a raw SQL query against the PocketBase instance (server >= v0.39). DANGEROUS: requires the server process to be started with POCKETBASE_ENABLE_SQL=true; returns an error otherwise. Use read-only queries when possible.',
        inputSchema: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'The SQL statement to execute (single statement).' },
            },
            required: ['query'],
        },
    },
];

export function listSqlTools(): ToolInfo[] {
    return sqlToolInfo;
}

// Handle calls for sql-related tools
export async function handleSqlToolCall(name: string, args: any, pb: PocketBase): Promise<ToolResult> {
    switch (name) {
        case 'run_sql':
            return runSql(args as RunSqlArgs, pb);
        default:
            // This case should ideally not be reached due to routing in index.ts
            throw new Error(`Unknown sql tool: ${name}`);
    }
}

// --- Individual Tool Implementations ---

async function runSql(args: RunSqlArgs, pb: PocketBase): Promise<ToolResult> {
    // Gate FIRST: a blocked call must not even validate beyond the basics,
    // and must never hit the network.
    if (!isSqlEnabled()) {
        return {
            content: [{
                type: 'text',
                text:
                    `run_sql is disabled: set the environment variable ${SQL_GATE_ENV}=true ` +
                    `on the pocketbase-mcp process to enable raw SQL execution. ` +
                    `This tool runs arbitrary SQL with superuser privileges — only enable ` +
                    `it on instances you fully trust (see README "SQL Execution").`,
            }],
            isError: true,
        };
    }

    if (!args?.query || typeof args.query !== 'string') {
        throw invalidParamsError("Missing required argument: query");
    }

    const result = await pb.sql.run(args.query);
    return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
}
