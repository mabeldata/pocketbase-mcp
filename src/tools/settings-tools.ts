import PocketBase from 'pocketbase';
import {
    ToolResult, ToolInfo,
    GetSettingsArgs, UpdateSettingsArgs
} from '../types/index.js';
import { invalidParamsError } from '../server/error-handler.js';

/**
 * Settings tools over pb.settings.* (superuser-only API).
 *
 * get_settings returns the FULL settings payload including secrets: the
 * values of SMTP/SPF, S3 storage secrets, OAuth2 client secrets and app
 * tokens appear as the masked placeholder string "******" on PocketBase
 * servers >= v0.22 (the server never sends plaintext secrets back), so the
 * output is safe to hand to an LLM but not usable to round-trip those
 * fields — update_settings must receive the REAL new values, and omitted
 * fields keep their stored values (PATCH semantics).
 */

// Define tool information for registration
const settingsToolInfo: ToolInfo[] = [
    {
        name: 'get_settings',
        description: 'Fetch all PocketBase app settings (meta, logs, smtp, email templates, external stores, etc.). Secret fields are returned masked by the server.',
        inputSchema: {
            type: 'object',
            properties: {},
            additionalProperties: false,
        },
    },
    {
        name: 'update_settings',
        description: 'Bulk-update PocketBase app settings with a partial payload (PATCH semantics: only the provided keys change). Provide real values for secret fields — the masked "******" placeholder from get_settings is not accepted by the server.',
        inputSchema: {
            type: 'object',
            properties: {
                data: {
                    type: 'object',
                    description: 'Partial settings payload, e.g. { "logs": { "maxDays": 14 } } or { "meta": { "appName": "My App" } }.',
                    additionalProperties: true,
                },
            },
            required: ['data'],
        },
    },
];

export function listSettingsTools(): ToolInfo[] {
    return settingsToolInfo;
}

// Handle calls for settings-related tools
export async function handleSettingsToolCall(name: string, args: any, pb: PocketBase): Promise<ToolResult> {
    switch (name) {
        case 'get_settings':
            return getSettings(args as GetSettingsArgs, pb);
        case 'update_settings':
            return updateSettings(args as UpdateSettingsArgs, pb);
        default:
            // This case should ideally not be reached due to routing in index.ts
            throw new Error(`Unknown settings tool: ${name}`);
    }
}

// --- Individual Tool Implementations ---

async function getSettings(args: GetSettingsArgs, pb: PocketBase): Promise<ToolResult> {
    // MCP clients may omit `arguments` entirely — normalize to {} (ROB-1).
    const result = await pb.settings.getAll(args ?? {});
    return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
}

async function updateSettings(args: UpdateSettingsArgs, pb: PocketBase): Promise<ToolResult> {
    if (!args?.data || typeof args.data !== 'object' || Array.isArray(args.data)) {
        throw invalidParamsError("Missing required argument: data (object with the settings to change)");
    }
    const result = await pb.settings.update(args.data);
    return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
}
