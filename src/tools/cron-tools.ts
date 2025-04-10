import PocketBase from 'pocketbase';

import {
    ToolResult, ToolInfo,
    ListCronJobsArgs, RunCronJobArgs
} from '../types/index.js'
import { invalidParamsError } from '../server/error-handler.js';


//Define tool information for registration
const cronToolInfo: ToolInfo[] = [
    {
        name: 'list_cron_jobs',
        description: 'Returns list with all registered app level cron jobs.',
        inputSchema: {
            type: 'object',
            properties: {
                fields: { type: 'string', description: 'Comma separated string of the fields to return in the JSON response (by default returns all fields). Ex.:?fields=*,expand.relField.name' }
            }
        }
    },
    {
        name: 'run_cron_job',
        description: 'Triggers a single cron job by its id.',
        inputSchema: {
            type: 'object',
            properties: {
                jobId: { type: 'string', description: 'The identifier of the cron job to run.' }
            },
            required: ['jobId']
        }
    }
];

export function listCronTools(): ToolInfo[] {
    return cronToolInfo;
}

// Handle calls for cron-related tools
export async function handleCronToolCall(name: string, args: any, pb: PocketBase): Promise<ToolResult> {
    switch (name) {
        case 'list_cron_jobs':
            return listCronJobs(args as ListCronJobsArgs, pb);
        case 'run_cron_job':
            return runCronJob(args as RunCronJobArgs, pb);
        default:
            // This case should ideally not be reached due to routing in index.ts
            throw new Error(`Unknown cron tool: ${name}`);

    }
}

// --- Individual Tool Implementations ---

async function listCronJobs(args: ListCronJobsArgs, pb: PocketBase): Promise<ToolResult> {
    const { fields } = args;

    try {
        const result = await pb.crons.getFullList({
            fields
        });

        return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],

        };
    } catch (error) {
        // If there's an error, return a more descriptive error
        if (error instanceof Error) {
            return {
                content: [{ type: 'text', text: `Error fetching cron list: ${error.message}` }],
                isError: true
            };
        }
        throw error;
    }
}

async function runCronJob(args: RunCronJobArgs, pb: PocketBase): Promise<ToolResult> {
    if (!args.jobId) {
        throw invalidParamsError("Missing required argument: jobId");
    }
    
    // Make the API request to get a single log
    const result = await pb.crons.run(args.jobId)
    
    return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
}