import { invalidParamsError } from '../server/error-handler.js';
import { validateRequiredParams } from '../server/validation.js';
// Define tool information
const userToolInfo = [
    {
        name: 'create_user_token',
        description: 'Create an authentication token for a user.',
        inputSchema: {
            type: 'object',
            properties: {
                userId: { type: 'string', description: 'The ID of the user.' },
                expiration: { type: 'number', description: 'Token expiration in seconds (optional).' },
            },
            required: ['userId'],
        },
    },
    {
        name: 'verify_user_token',
        description: 'Verify if a user token is valid.',
        inputSchema: {
            type: 'object',
            properties: {
                token: { type: 'string', description: 'The authentication token to verify.' },
            },
            required: ['token'],
        },
    },
    {
        name: 'create_user',
        description: 'Create a new user account in PocketBase.',
        inputSchema: {
            type: 'object',
            properties: {
                email: { type: 'string', description: 'User email address.' },
                password: { type: 'string', description: 'User password.' },
                passwordConfirm: { type: 'string', description: 'Password confirmation.' },
                data: { type: 'object', description: 'Additional user data fields.', additionalProperties: true },
            },
            required: ['email', 'password', 'passwordConfirm'],
        },
    },
    {
        name: 'update_user',
        description: 'Update an existing user account.',
        inputSchema: {
            type: 'object',
            properties: {
                userId: { type: 'string', description: 'The ID of the user to update.' },
                data: { type: 'object', description: 'User data fields to update.', additionalProperties: true },
            },
            required: ['userId', 'data'],
        },
    },
    {
        name: 'delete_user',
        description: 'Delete a user account.',
        inputSchema: {
            type: 'object',
            properties: {
                userId: { type: 'string', description: 'The ID of the user to delete.' },
            },
            required: ['userId'],
        },
    },
    {
        name: 'list_users',
        description: 'List users from the users collection with filtering, sorting, and pagination.',
        inputSchema: {
            type: 'object',
            properties: {
                page: { type: 'number', description: 'Page number (defaults to 1).', minimum: 1 },
                perPage: { type: 'number', description: 'Items per page (defaults to 30, max 500).', minimum: 1, maximum: 500 },
                filter: { type: 'string', description: 'PocketBase filter string.' },
                sort: { type: 'string', description: 'PocketBase sort string.' },
            },
            required: [],
        },
    },
    {
        name: 'update_user_password',
        description: 'Update a user password.',
        inputSchema: {
            type: 'object',
            properties: {
                userId: { type: 'string', description: 'The ID of the user.' },
                newPassword: { type: 'string', description: 'The new password.' },
                oldPassword: { type: 'string', description: 'The old password (required for non-admin updates).' },
            },
            required: ['userId', 'newPassword'],
        },
    },
    {
        name: 'reset_user_password',
        description: 'Request a password reset for a user (sends reset email).',
        inputSchema: {
            type: 'object',
            properties: {
                email: { type: 'string', description: 'The email address of the user.' },
            },
            required: ['email'],
        },
    },
];
export function listUserTools() {
    return userToolInfo;
}
// Handle calls for user-related tools
export async function handleUserToolCall(name, args, pb) {
    switch (name) {
        case 'create_user_token':
            return createUserToken(args, pb);
        case 'verify_user_token':
            return verifyUserToken(args, pb);
        case 'create_user':
            return createUser(args, pb);
        case 'update_user':
            return updateUser(args, pb);
        case 'delete_user':
            return deleteUser(args, pb);
        case 'list_users':
            return listUsers(args, pb);
        case 'update_user_password':
            return updateUserPassword(args, pb);
        case 'reset_user_password':
            return resetUserPassword(args, pb);
        default:
            throw new Error(`Unknown user tool: ${name}`);
    }
}
// --- Individual Tool Implementations ---
async function createUserToken(args, pb) {
    validateRequiredParams(args, ['userId']);
    // Get user record
    const user = await pb.collection('users').getOne(args.userId);
    // Create auth token by authenticating as the user
    // Note: This requires the user's password or admin privileges
    // For admin, we can use authStore to set the token
    // This is a simplified implementation - in practice, token creation might require different approach
    const token = pb.authStore.token;
    return {
        content: [{ type: 'text', text: JSON.stringify({
                    userId: args.userId,
                    message: 'Token creation requires user authentication. Use admin authentication to manage user tokens.',
                    currentToken: token || null
                }, null, 2) }],
    };
}
async function verifyUserToken(args, pb) {
    validateRequiredParams(args, ['token']);
    // Try to authenticate with the token
    try {
        pb.authStore.save(args.token, null);
        // Verify by trying to get current user
        const authData = pb.authStore.model;
        return {
            content: [{ type: 'text', text: JSON.stringify({
                        valid: true,
                        user: authData ? { id: authData.id, email: authData.email } : null
                    }, null, 2) }],
        };
    }
    catch (error) {
        return {
            content: [{ type: 'text', text: JSON.stringify({
                        valid: false,
                        error: error?.message || 'Invalid token'
                    }, null, 2) }],
        };
    }
}
async function createUser(args, pb) {
    validateRequiredParams(args, ['email', 'password', 'passwordConfirm']);
    if (args.password !== args.passwordConfirm) {
        throw invalidParamsError("Password and password confirmation do not match");
    }
    const userData = {
        email: args.email,
        password: args.password,
        passwordConfirm: args.passwordConfirm,
        ...(args.data || {})
    };
    const user = await pb.collection('users').create(userData);
    return {
        content: [{ type: 'text', text: JSON.stringify(user, null, 2) }],
    };
}
async function updateUser(args, pb) {
    validateRequiredParams(args, ['userId', 'data']);
    const user = await pb.collection('users').update(args.userId, args.data);
    return {
        content: [{ type: 'text', text: JSON.stringify(user, null, 2) }],
    };
}
async function deleteUser(args, pb) {
    validateRequiredParams(args, ['userId']);
    await pb.collection('users').delete(args.userId);
    return {
        content: [{ type: 'text', text: `User ${args.userId} deleted successfully.` }],
    };
}
async function listUsers(args, pb) {
    const { page = 1, perPage = 30, filter, sort } = args;
    const result = await pb.collection('users').getList(page, perPage, {
        filter,
        sort
    });
    return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
}
async function updateUserPassword(args, pb) {
    validateRequiredParams(args, ['userId', 'newPassword']);
    const updateData = {
        password: args.newPassword,
        passwordConfirm: args.newPassword
    };
    // If oldPassword is provided, include it (for non-admin updates)
    if (args.oldPassword) {
        updateData.oldPassword = args.oldPassword;
    }
    const user = await pb.collection('users').update(args.userId, updateData);
    return {
        content: [{ type: 'text', text: `Password updated successfully for user ${args.userId}.\n${JSON.stringify({ id: user.id, email: user.email }, null, 2)}` }],
    };
}
async function resetUserPassword(args, pb) {
    validateRequiredParams(args, ['email']);
    // Request password reset (sends email)
    await pb.collection('users').requestPasswordReset(args.email);
    return {
        content: [{ type: 'text', text: `Password reset email sent to ${args.email}.` }],
    };
}
