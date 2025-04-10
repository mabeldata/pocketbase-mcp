import { McpError } from '@modelcontextprotocol/sdk/types.js';

export interface ToolError {
  content: [{
    type: 'text',
    text: string
  }],
  isError: true
}

export interface ToolSuccess {
  content: [{
    type: 'text',
    text: string
  }],
  isError?: false
}

export type ToolResult = ToolSuccess | ToolError;

// Interface for describing a tool to the MCP client
export interface ToolInfo {
    name: string;
    description: string;
    inputSchema: Record<string, any>; // Use a generic object for schema for now
}

// Define specific argument types for each tool
export interface FetchRecordArgs {
  collection: string;
  id: string;
}

export interface ListRecordsArgs {
  collection: string;
  page?: number;
  perPage?: number;
  filter?: string;
  sort?: string;
  expand?: string;
}

export interface CreateRecordArgs {
  collection: string;
  data: any;
}

export interface UpdateRecordArgs {
  collection: string;
  id: string;
  data: any;
}

export interface GetCollectionSchemaArgs {
  collection: string;
}

export interface UploadFileArgs {
  collection: string;
  recordId: string;
  fileField: string;
  fileContent: string;
  fileName: string;
}

export interface DownloadFileArgs {
  collection: string;
  recordId: string;
  fileField: string;
  downloadPath: string;
}

export interface ListCollectionsArgs {} // No arguments

// Log API tool argument types
export interface ListLogsArgs {
  page?: number;
  perPage?: number;
  filter?: string;
  sort?: string;
}

export interface GetLogArgs {
  id: string;
}

export interface GetLogsStatsArgs {
  filter?: string;
}

// Add types for new migration tools later


// Cron API types
export interface ListCronJobsArgs {
  fields?: string;
}

export interface RunCronJobArgs {
  jobId: string;
}

