import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { ToolError } from '../types/tool-types.js'; // Import directly from tool-types

/**
 * Detects if an error is a PocketBase API error
 */
function isPocketBaseError(error: any): boolean {
  return error?.status !== undefined && 
         error?.data !== undefined && 
         (error?.response !== undefined || error?.url !== undefined);
}

/**
 * Extracts detailed error information from PocketBase errors
 */
function extractPocketBaseErrorDetails(error: any): { message: string; details?: any } {
  const status = error?.status || error?.response?.status;
  const data = error?.data || error?.response?.data;
  
  let message = error?.message || 'PocketBase API error';
  const details: any = { status };
  
  if (data) {
    if (typeof data === 'string') {
      message = data;
    } else if (data.message) {
      message = data.message;
    }
    
    // Include validation errors if present
    if (data.data && typeof data.data === 'object') {
      details.validationErrors = data.data;
      const fieldErrors = Object.entries(data.data)
        .map(([field, error]: [string, any]) => `${field}: ${error?.message || String(error)}`)
        .join('; ');
      if (fieldErrors) {
        message += ` (${fieldErrors})`;
      }
    }
  }
  
  // Map HTTP status codes to more descriptive messages
  switch (status) {
    case 400:
      message = `Bad Request: ${message}`;
      break;
    case 401:
      message = `Unauthorized: ${message}. Please check your authentication token.`;
      break;
    case 403:
      message = `Forbidden: ${message}. You may not have permission to perform this action.`;
      break;
    case 404:
      message = `Not Found: ${message}. The requested resource does not exist.`;
      break;
    case 429:
      message = `Rate Limit Exceeded: ${message}. Please try again later.`;
      break;
    case 500:
      message = `Server Error: ${message}. The PocketBase server encountered an error.`;
      break;
  }
  
  return { message, details };
}

/**
 * Formats an error into the standard MCP ToolError structure.
 * @param error The error object or message.
 * @param defaultCode The default ErrorCode to use if the error is not an McpError.
 * @returns A ToolError object.
 */
export function formatError(error: unknown, defaultCode: ErrorCode = ErrorCode.InternalError): ToolError {
  console.error('[MCP Server Error]', error); // Log the full error internally

  let message: string;
  let code: ErrorCode;
  let details: any = null;

  if (error instanceof McpError) {
    message = error.message;
    code = error.code;
  } else if (isPocketBaseError(error)) {
    // Handle PocketBase-specific errors
    const pbError = extractPocketBaseErrorDetails(error);
    message = pbError.message;
    details = pbError.details;
    
    // Map PocketBase status codes to MCP error codes
    const status = details?.status;
    if (status === 400) {
      code = ErrorCode.InvalidParams;
    } else if (status === 401 || status === 403) {
      code = ErrorCode.InvalidRequest;
    } else if (status === 404) {
      code = ErrorCode.InvalidParams;
    } else if (status === 429) {
      code = ErrorCode.InternalError; // Rate limiting
    } else {
      code = ErrorCode.InternalError;
    }
  } else if (error instanceof Error) {
    message = error.message;
    code = defaultCode;
  } else {
    message = 'An unknown error occurred';
    code = ErrorCode.InternalError;
  }

  // Build error text with details
  let errorText = `Error (${ErrorCode[code]}): ${message}`;
  if (details && Object.keys(details).length > 0) {
    errorText += `\n\nDetails: ${JSON.stringify(details, null, 2)}`;
  }

  return {
    content: [{
      type: 'text',
      text: errorText,
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
