import PocketBase from 'pocketbase';
import {
    ToolResult, ToolInfo,
    UploadFileArgs, DownloadFileArgs
} from '../types/index.js';
import { invalidParamsError } from '../server/error-handler.js';
import { z } from 'zod'; // For input validation

// Node.js built-in modules for potential future use (like saving downloaded files server-side if needed)
// import fs from 'fs/promises';
// import path from 'path';

// Define tool information
const fileToolInfo: ToolInfo[] = [
    {
        name: 'upload_file',
        description: 'Upload a file (provided as content string) to a PocketBase collection record field.',
        inputSchema: z.object({
            collection: z.string().describe('The name or ID of the collection.'),
            recordId: z.string().describe('The ID of the record to attach the file to.'),
            fileField: z.string().describe('The name of the file field in the collection schema.'),
            fileContent: z.string().describe('The raw content of the file as a string.'),
            fileName: z.string().describe('The desired name for the uploaded file (e.g., "report.txt").')
        }),
    },
    {
        name: 'download_file',
        description: 'Get the URL to download a file from a PocketBase collection record field.',
        inputSchema: z.object({
            collection: z.string().describe('The name or ID of the collection.'),
            recordId: z.string().describe('The ID of the record containing the file.'),
            fileField: z.string().describe('The name of the file field.')
        })
    }
];

export function listFileTools(): ToolInfo[] {
    return fileToolInfo;
}

// Handle calls for file-related tools
export async function handleFileToolCall(name: string, args: any, pb: PocketBase): Promise<ToolResult> {
    switch (name) {
        case 'upload_file':
            return uploadFile(args as UploadFileArgs, pb);
        case 'download_file':
            return downloadFile(args as DownloadFileArgs, pb);
        default:
            throw new Error(`Unknown file tool: ${name}`);
    }
}

// --- Individual Tool Implementations ---

async function uploadFile(args: UploadFileArgs, pb: PocketBase): Promise<ToolResult> {
    if (!args.collection || !args.recordId || !args.fileField || !args.fileContent || !args.fileName) {
        throw invalidParamsError("Missing required arguments: collection, recordId, fileField, fileContent, fileName");
    }

    // Create a Blob from the file content string
    // Note: Encoding might be an issue depending on the file type. Assuming UTF-8 for now.
    const blob = new Blob([args.fileContent]);

    // Create a FormData object and append the file
    const formData = new FormData();
    formData.append(args.fileField, blob, args.fileName);

    // Update the record with the file
    const record = await pb.collection(args.collection).update(args.recordId, formData);

    return {
        content: [{ type: 'text', text: `File '${args.fileName}' uploaded successfully to record ${args.recordId}. Updated record:\n${JSON.stringify(record, null, 2)}` }],
    };
}

async function downloadFile(args: DownloadFileArgs, pb: PocketBase): Promise<ToolResult> {
    if (!args.collection || !args.recordId || !args.fileField) {
        throw invalidParamsError("Missing required arguments: collection, recordId, fileField");
    }

    // Fetch the record to get the filename associated with the file field
    const record = await pb.collection(args.collection).getOne(args.recordId, {
        // Optionally specify fields to fetch only the necessary data
        // fields: `${args.fileField}`
    });

    // Ensure the file field exists and has a value
    const fileName = record[args.fileField];
    if (!fileName || typeof fileName !== 'string') {
         throw invalidParamsError(`File field '${args.fileField}' not found or empty on record ${args.recordId}`);
    }

    // Get the file URL using the filename from the record
    const fileUrl = pb.files.getUrl(record, fileName); // Use pb.files.getUrl

    // Return the URL to the client
    return {
        content: [{ type: 'text', text: `Download URL for ${fileName}: ${fileUrl}` }],
    };
}
