import PocketBase from 'pocketbase';
import { invalidParamsError } from './error-handler.js';

/**
 * Validates that required parameters are present
 */
export function validateRequiredParams(params: any, required: string[]): void {
    for (const field of required) {
        if (params[field] === undefined || params[field] === null) {
            throw invalidParamsError(`Missing required parameter: ${field}`);
        }
    }
}

/**
 * Validates parameter types
 */
export function validateParamType(value: any, expectedType: string, paramName: string): void {
    const actualType = typeof value;
    
    if (expectedType === 'array' && !Array.isArray(value)) {
        throw invalidParamsError(`Parameter '${paramName}' must be an array, got ${actualType}`);
    }
    
    if (expectedType !== 'array' && actualType !== expectedType) {
        throw invalidParamsError(`Parameter '${paramName}' must be of type ${expectedType}, got ${actualType}`);
    }
}

/**
 * Validates a value against a schema field definition
 */
export function validateFieldValue(value: any, fieldDef: any): { valid: boolean; error?: string } {
    if (fieldDef.required && (value === undefined || value === null || value === '')) {
        return { valid: false, error: `Field '${fieldDef.name}' is required` };
    }

    if (value === undefined || value === null) {
        return { valid: true }; // Optional field with no value
    }

    // Type validation
    switch (fieldDef.type) {
        case 'text':
        case 'email':
        case 'url':
        case 'editor':
            if (typeof value !== 'string') {
                return { valid: false, error: `Field '${fieldDef.name}' must be a string` };
            }
            if (fieldDef.min !== undefined && value.length < fieldDef.min) {
                return { valid: false, error: `Field '${fieldDef.name}' must be at least ${fieldDef.min} characters` };
            }
            if (fieldDef.max !== undefined && value.length > fieldDef.max) {
                return { valid: false, error: `Field '${fieldDef.name}' must be at most ${fieldDef.max} characters` };
            }
            if (fieldDef.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
                return { valid: false, error: `Field '${fieldDef.name}' must be a valid email address` };
            }
            if (fieldDef.type === 'url' && !/^https?:\/\/.+/.test(value)) {
                return { valid: false, error: `Field '${fieldDef.name}' must be a valid URL` };
            }
            break;

        case 'number':
            if (typeof value !== 'number' || isNaN(value)) {
                return { valid: false, error: `Field '${fieldDef.name}' must be a number` };
            }
            if (fieldDef.min !== undefined && value < fieldDef.min) {
                return { valid: false, error: `Field '${fieldDef.name}' must be at least ${fieldDef.min}` };
            }
            if (fieldDef.max !== undefined && value > fieldDef.max) {
                return { valid: false, error: `Field '${fieldDef.name}' must be at most ${fieldDef.max}` };
            }
            break;

        case 'bool':
            if (typeof value !== 'boolean') {
                return { valid: false, error: `Field '${fieldDef.name}' must be a boolean` };
            }
            break;

        case 'date':
            if (!(value instanceof Date) && typeof value !== 'string') {
                return { valid: false, error: `Field '${fieldDef.name}' must be a date or date string` };
            }
            break;

        case 'select':
            if (fieldDef.options && fieldDef.options.values) {
                const validValues = Object.values(fieldDef.options.values);
                if (!validValues.includes(value)) {
                    return { valid: false, error: `Field '${fieldDef.name}' must be one of: ${validValues.join(', ')}` };
                }
            }
            break;

        case 'file':
            // File validation is handled separately during upload
            break;

        case 'relation':
            // Relation validation is handled by PocketBase
            break;

        case 'json':
            // JSON fields can contain any valid JSON
            try {
                if (typeof value === 'string') {
                    JSON.parse(value);
                }
            } catch {
                return { valid: false, error: `Field '${fieldDef.name}' must be valid JSON` };
            }
            break;
    }

    return { valid: true };
}

/**
 * Validates record data against a collection schema
 */
export async function validateRecordData(
    pb: PocketBase,
    collection: string,
    data: any,
    isUpdate: boolean = false
): Promise<{ valid: boolean; errors: string[] }> {
    try {
        // Get collection schema
        const collectionSchema = await pb.collections.getOne(collection);
        const fields = collectionSchema.fields || [];
        const errors: string[] = [];

        // Validate each field in the data
        for (const fieldDef of fields) {
            // Skip system fields for updates
            if (isUpdate && fieldDef.system) {
                continue;
            }

            const value = data[fieldDef.name];
            const validation = validateFieldValue(value, fieldDef);
            
            if (!validation.valid && validation.error) {
                errors.push(validation.error);
            }
        }

        // Check for unknown fields (optional, can be disabled)
        const knownFields = new Set(fields.map((f: any) => f.name));
        for (const key in data) {
            if (!knownFields.has(key) && !key.startsWith('@')) {
                // Allow unknown fields but log a warning (PocketBase will handle this)
            }
        }

        return {
            valid: errors.length === 0,
            errors
        };
    } catch (error: any) {
        // If collection doesn't exist or other error, return validation error
        return {
            valid: false,
            errors: [`Failed to validate against collection schema: ${error?.message || String(error)}`]
        };
    }
}

/**
 * Validates a collection name format
 */
export function validateCollectionName(name: string): { valid: boolean; error?: string } {
    if (!name || typeof name !== 'string') {
        return { valid: false, error: 'Collection name must be a non-empty string' };
    }
    
    // Collection names should be lowercase, alphanumeric with underscores
    if (!/^[a-z0-9_]+$/.test(name)) {
        return { valid: false, error: 'Collection name must contain only lowercase letters, numbers, and underscores' };
    }

    if (name.length < 1 || name.length > 50) {
        return { valid: false, error: 'Collection name must be between 1 and 50 characters' };
    }

    return { valid: true };
}
