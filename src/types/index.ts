// Explicitly export needed types
export type { 
  ToolResult, 
  ToolInfo, 
  FetchRecordArgs, 
  ListRecordsArgs, 
  CreateRecordArgs, 
  UpdateRecordArgs, 
  GetCollectionSchemaArgs, 
  UploadFileArgs, 
  DownloadFileArgs, 
  ListCollectionsArgs,
  // Log API types
  ListLogsArgs,
  GetLogArgs,
  GetLogsStatsArgs,
  // Cron API types
  ListCronJobsArgs,
  RunCronJobArgs,
  // PR-3 additive tool types (logs truncate, sql, meta, backups, settings, batch, delete)
  TruncateLogsArgs,
  RunSqlArgs,
  GetCollectionScaffoldsArgs,
  DryRunViewQueryArgs,
  ListBackupsArgs,
  CreateBackupArgs,
  RestoreBackupArgs,
  GetSettingsArgs,
  UpdateSettingsArgs,
  BatchRecordRequest,
  BatchRecordsArgs,
  DeleteRecordArgs
} from './tool-types.js';
export * from './pocketbase-types.js'; // Keep wildcard export for potentially generated types
export * from './migration-types.js'; // Keep wildcard export for now
