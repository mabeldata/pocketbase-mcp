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
  aggregate?: string; // Aggregation query
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

export interface DeleteRecordArgs {
  collection: string;
  id: string;
}

export interface BatchImportRecordsArgs {
  collection: string;
  records: any[];
  skipDuplicates?: boolean;
}

export interface BatchExportRecordsArgs {
  collection: string;
  filter?: string;
  format?: 'json' | 'csv';
  fields?: string[];
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

// Collection management tool argument types
export interface CreateCollectionArgs {
  name: string;
  type?: 'base' | 'auth' | 'view';
  fields?: any[];
  indexes?: string[];
  system?: boolean;
  listRule?: string | null;
  viewRule?: string | null;
  createRule?: string | null;
  updateRule?: string | null;
  deleteRule?: string | null;
  viewQuery?: string; // For view collections
  // Auth collection options
  manageRule?: string | null;
  authRule?: string | null;
  passwordAuth?: {
    enabled?: boolean;
    identityFields: string[];
  };
  [key: string]: any; // Allow other collection properties
}

export interface UpdateCollectionArgs {
  collection: string;
  name?: string;
  fields?: any[];
  indexes?: string[];
  system?: boolean;
  listRule?: string | null;
  viewRule?: string | null;
  createRule?: string | null;
  updateRule?: string | null;
  deleteRule?: string | null;
  viewQuery?: string;
  manageRule?: string | null;
  authRule?: string | null;
  passwordAuth?: {
    enabled?: boolean;
    identityFields?: string[];
  };
  [key: string]: any;
}

export interface MigrateCollectionSchemaArgs {
  collection: string;
  newSchema: any; // Partial schema with changes
  migrationStrategy?: 'preserve' | 'replace';
}

export interface CreateIndexArgs {
  collection: string;
  fields: string[]; // Array of field names for composite index
  unique?: boolean;
}

export interface DeleteIndexArgs {
  collection: string;
  indexName: string;
}

export interface ListIndexesArgs {
  collection: string;
}

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

// User management tool argument types
export interface CreateUserTokenArgs {
  userId: string;
  expiration?: number;
}

export interface VerifyUserTokenArgs {
  token: string;
}

export interface CreateUserArgs {
  email: string;
  password: string;
  passwordConfirm: string;
  data?: any;
}

export interface UpdateUserArgs {
  userId: string;
  data: any;
}

export interface DeleteUserArgs {
  userId: string;
}

export interface ListUsersArgs {
  page?: number;
  perPage?: number;
  filter?: string;
  sort?: string;
}

export interface UpdateUserPasswordArgs {
  userId: string;
  newPassword: string;
  oldPassword?: string;
}

export interface ResetUserPasswordArgs {
  email: string;
}

// Database operation tool argument types
export interface BackupDatabaseArgs {
  backupPath?: string;
}

export interface RestoreDatabaseArgs {
  backupData?: any;
  backupPath?: string;
}

export interface ExportDatabaseJsonArgs {
  outputPath?: string;
  collections?: string[];
}

export interface ExportDatabaseCsvArgs {
  outputPath?: string;
  collections?: string[];
}

export interface OptimizeIndexesArgs {
  collection?: string;
}

// Realtime subscription tool argument types
export interface SubscribeCollectionArgs {
  collection: string;
  eventTypes?: ('create' | 'update' | 'delete')[];
}

export interface UnsubscribeCollectionArgs {
  subscriptionId: string;
}

// Admin authentication tool argument types
export interface AdminAuthArgs {
  email?: string;
  password?: string;
}

