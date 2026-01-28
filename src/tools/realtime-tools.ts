import PocketBase from 'pocketbase';
import {
    ToolResult, ToolInfo,
    SubscribeCollectionArgs, UnsubscribeCollectionArgs
} from '../types/index.js';
import { invalidParamsError } from '../server/error-handler.js';
import { validateRequiredParams } from '../server/validation.js';

// Store active subscriptions
const subscriptions = new Map<string, any>();

// Define tool information
const realtimeToolInfo: ToolInfo[] = [
    {
        name: 'subscribe_collection',
        description: 'Subscribe to realtime events for a specific collection. Returns subscription information.',
        inputSchema: {
            type: 'object',
            properties: {
                collection: { type: 'string', description: 'The name or ID of the collection to subscribe to.' },
                eventTypes: { type: 'array', items: { type: 'string', enum: ['create', 'update', 'delete'] }, description: 'Array of event types to subscribe to (default: all).' },
            },
            required: ['collection'],
        },
    },
    {
        name: 'unsubscribe_collection',
        description: 'Unsubscribe from realtime events for a collection.',
        inputSchema: {
            type: 'object',
            properties: {
                subscriptionId: { type: 'string', description: 'The subscription ID returned from subscribe_collection.' },
            },
            required: ['subscriptionId'],
        },
    },
];

export function listRealtimeTools(): ToolInfo[] {
    return realtimeToolInfo;
}

// Handle calls for realtime-related tools
export async function handleRealtimeToolCall(name: string, args: any, pb: PocketBase): Promise<ToolResult> {
    switch (name) {
        case 'subscribe_collection':
            return subscribeCollection(args as SubscribeCollectionArgs, pb);
        case 'unsubscribe_collection':
            return unsubscribeCollection(args as UnsubscribeCollectionArgs, pb);
        default:
            throw new Error(`Unknown realtime tool: ${name}`);
    }
}

// --- Individual Tool Implementations ---

async function subscribeCollection(args: SubscribeCollectionArgs, pb: PocketBase): Promise<ToolResult> {
    validateRequiredParams(args, ['collection']);
    
    const eventTypes = args.eventTypes || ['create', 'update', 'delete'];
    const subscriptionId = `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Note: PocketBase realtime subscriptions use WebSockets
    // Since MCP runs over stdio, we can't maintain persistent WebSocket connections
    // This implementation provides subscription metadata and instructions
    // Actual realtime functionality would require a different architecture
    
    const subscription = {
        id: subscriptionId,
        collection: args.collection,
        eventTypes: eventTypes,
        status: 'registered',
        note: 'Realtime subscriptions require WebSocket connections. Use PocketBase SDK directly in your application for realtime functionality.'
    };
    
    subscriptions.set(subscriptionId, subscription);
    
    return {
        content: [{ type: 'text', text: JSON.stringify(subscription, null, 2) }],
    };
}

async function unsubscribeCollection(args: UnsubscribeCollectionArgs, pb: PocketBase): Promise<ToolResult> {
    validateRequiredParams(args, ['subscriptionId']);
    
    const subscription = subscriptions.get(args.subscriptionId);
    if (!subscription) {
        throw invalidParamsError(`Subscription not found: ${args.subscriptionId}`);
    }
    
    subscriptions.delete(args.subscriptionId);
    
    return {
        content: [{ type: 'text', text: `Unsubscribed from collection ${subscription.collection}. Subscription ID: ${args.subscriptionId}` }],
    };
}
