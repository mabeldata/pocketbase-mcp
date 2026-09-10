import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { ClientResponseError } from 'pocketbase';
import { ToolError } from '../types/tool-types.js'; // Import directly from tool-types

/**
 * Formats an error into the standard MCP ToolError structure.
 *
 * PocketBase API errors (ClientResponseError) are enriched with the HTTP
 * status and the per-field validation errors returned by the server
 * (`response.data`), so the consuming LLM gets actionable detail. The
 * underlying cause (SDK >= 0.26.1) is appended when available.
 *
 * @param error The error object or message.
 * @param defaultCode The default ErrorCode to use if the error is not an McpError.
 * @returns A ToolError object.
 */
export function formatError(error: unknown, defaultCode: ErrorCode = ErrorCode.InternalError): ToolError {
  console.error('[MCP Server Error]', error); // Log the full error internally (stderr; stdout is the JSON-RPC channel)

  let message: string;
  let code: ErrorCode;

  if (error instanceof McpError) {
    message = error.message;
    code = error.code;
  } else if (error instanceof ClientResponseError) {
    code = defaultCode;
    const parts: string[] = [];
    if (error.status) {
      parts.push(`HTTP ${error.status}`);
    }
    parts.push(error.message || 'PocketBase API request failed');

    // Per-field validation errors, e.g. { name: { code: "validation_required", message: "..." } }
    const data = error.response?.data;
    if (data && typeof data === 'object') {
      const fieldErrors = Object.entries(data)
        .filter(([, v]) => v && typeof v === 'object' && typeof (v as any).message === 'string')
        .map(([field, v]) => `${field}: ${(v as any).message}`);
      if (fieldErrors.length > 0) {
        parts.push(`field errors -> ${fieldErrors.join('; ')}`);
      }
    }

    // Underlying transport error (ClientResponseError.originalError, exposed as
    // .cause at runtime since JS SDK 0.26.1)
    const causeMessage = (error.originalError as any)?.message;
    if (causeMessage && causeMessage !== error.message) {
      parts.push(`cause: ${causeMessage}`);
    }

    message = parts.join(' | ');
  } else if (error instanceof Error) {
    message = error.message;
    code = defaultCode;
  } else {
    message = 'An unknown error occurred';
    code = ErrorCode.InternalError; // Use InternalError as fallback
  }

  return {
    content: [{
      type: 'text',
      text: `Error (${ErrorCode[code]}): ${message}`, // Include error code name for clarity
    }],
    isError: true,
  };
}

/**
 * Creates a standard McpError for invalid parameters.
 * @param message The specific error message.
 * @returns An McpError object.
 */
export function invalidParamsError(message: string): McpError {
    return new McpError(ErrorCode.InvalidParams, message);
}

/**
 * Creates a standard McpError for method not found.
 * @param toolName The name of the tool that was not found.
 * @returns An McpError object.
 */
export function methodNotFoundError(toolName: string): McpError {
    return new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${toolName}`);
}
