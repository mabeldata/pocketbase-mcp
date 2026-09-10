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

// --- PR-3 additive tool argument types (PocketBase v0.37–v0.40 endpoints) ---

// Logs (truncate — v0.40.0)
export interface TruncateLogsArgs {
  confirm: boolean;
}

// SQL console (v0.39.0)
export interface RunSqlArgs {
  query: string;
}

// Collection meta (v0.37+)
export interface GetCollectionScaffoldsArgs {
  [option: string]: any; // SDK CommonOptions passthrough (e.g. fields)
}

export interface DryRunViewQueryArgs {
  query: string;
}

// Backups
export interface ListBackupsArgs {
  [option: string]: any; // SDK CommonOptions passthrough (e.g. fields)
}

export interface CreateBackupArgs {
  name?: string;
}

export interface RestoreBackupArgs {
  key: string;
  confirm: boolean;
}

// Settings
export interface GetSettingsArgs {
  [option: string]: any; // SDK CommonOptions passthrough (e.g. fields)
}

export interface UpdateSettingsArgs {
  data: Record<string, any>;
}

// Batch records (transactional /api/batch)
export interface BatchRecordRequest {
  collection: string;
  action: 'create' | 'update' | 'upsert' | 'delete';
  id?: string;
  data?: Record<string, any>;
}

export interface BatchRecordsArgs {
  requests: BatchRecordRequest[];
}

// Record delete
export interface DeleteRecordArgs {
  collection: string;
  id: string;
}

