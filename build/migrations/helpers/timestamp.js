/**
 * Generates a Unix timestamp string (seconds since epoch).
 * @returns A string representing the current Unix timestamp.
 */
export function generateTimestamp() {
    return Math.floor(Date.now() / 1000).toString();
}
