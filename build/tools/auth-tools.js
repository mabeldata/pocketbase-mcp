import { invalidParamsError } from '../server/error-handler.js';
// Define tool information
const authToolInfo = [
    {
        name: 'admin_auth',
        description: 'Authenticate as an admin and obtain an admin token. Can be used to verify or refresh admin authentication.',
        inputSchema: {
            type: 'object',
            properties: {
                email: { type: 'string', description: 'Admin email address (optional if token is already set).' },
                password: { type: 'string', description: 'Admin password (optional if token is already set).' },
            },
            required: [],
        },
    },
];
export function listAuthTools() {
    return authToolInfo;
}
// Handle calls for auth-related tools
export async function handleAuthToolCall(name, args, pb) {
    switch (name) {
        case 'admin_auth':
            return adminAuth(args, pb);
        default:
            throw new Error(`Unknown auth tool: ${name}`);
    }
}
// --- Individual Tool Implementations ---
async function adminAuth(args, pb) {
    // Check if already authenticated
    const currentAuth = pb.authStore.token;
    if (currentAuth && !args.email && !args.password) {
        // Already authenticated, return current token info
        const authData = pb.authStore.model;
        return {
            content: [{ type: 'text', text: JSON.stringify({
                        authenticated: true,
                        token: currentAuth,
                        admin: authData ? { id: authData.id, email: authData.email } : null,
                        message: 'Already authenticated with existing token'
                    }, null, 2) }],
        };
    }
    // Need to authenticate with credentials
    if (!args.email || !args.password) {
        throw invalidParamsError("Email and password are required for authentication");
    }
    try {
        // Authenticate as admin
        const authData = await pb.admins.authWithPassword(args.email, args.password);
        return {
            content: [{ type: 'text', text: JSON.stringify({
                        authenticated: true,
                        token: pb.authStore.token,
                        admin: {
                            id: authData.record.id,
                            email: authData.record.email
                        },
                        message: 'Successfully authenticated as admin'
                    }, null, 2) }],
        };
    }
    catch (error) {
        throw invalidParamsError(`Authentication failed: ${error?.message || String(error)}`);
    }
}
