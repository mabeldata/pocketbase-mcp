/**
 * Rate limiter and retry mechanism for PocketBase API calls
 */
const DEFAULT_RETRY_OPTIONS = {
    maxRetries: 3,
    baseDelay: 1000, // 1 second
    maxDelay: 10000, // 10 seconds
    retryableStatuses: [429, 500, 502, 503, 504] // Rate limit and server errors
};
/**
 * Checks if an error is retryable based on status code
 */
function isRetryableError(error, retryableStatuses) {
    const status = error?.status || error?.response?.status;
    return status !== undefined && retryableStatuses.includes(status);
}
/**
 * Calculates delay for exponential backoff
 */
function calculateDelay(attempt, baseDelay, maxDelay) {
    const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
    // Add jitter to prevent thundering herd
    const jitter = Math.random() * 0.3 * delay; // Up to 30% jitter
    return delay + jitter;
}
/**
 * Sleeps for the specified number of milliseconds
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
/**
 * Executes a function with retry logic and exponential backoff
 */
export async function withRetry(fn, options = {}) {
    const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
    let lastError;
    for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
        try {
            return await fn();
        }
        catch (error) {
            lastError = error;
            // Check if error is retryable
            if (!isRetryableError(error, opts.retryableStatuses)) {
                throw error; // Don't retry non-retryable errors
            }
            // If this was the last attempt, throw the error
            if (attempt === opts.maxRetries) {
                throw error;
            }
            // Calculate delay and wait before retrying
            const delay = calculateDelay(attempt, opts.baseDelay, opts.maxDelay);
            console.warn(`[Rate Limiter] Retry attempt ${attempt + 1}/${opts.maxRetries} after ${delay}ms delay`);
            await sleep(delay);
        }
    }
    throw lastError;
}
/**
 * Rate limiter class for tracking request rates
 */
export class RateLimiter {
    constructor(windowMs = 60000, maxRequests = 100) {
        this.requests = new Map();
        this.windowMs = windowMs;
        this.maxRequests = maxRequests;
    }
    /**
     * Checks if a request is allowed and records it
     */
    isAllowed(key = 'default') {
        const now = Date.now();
        const requests = this.requests.get(key) || [];
        // Remove requests outside the time window
        const validRequests = requests.filter(timestamp => now - timestamp < this.windowMs);
        if (validRequests.length >= this.maxRequests) {
            return false;
        }
        // Add current request
        validRequests.push(now);
        this.requests.set(key, validRequests);
        return true;
    }
    /**
     * Gets the number of requests remaining in the current window
     */
    getRemaining(key = 'default') {
        const now = Date.now();
        const requests = this.requests.get(key) || [];
        const validRequests = requests.filter(timestamp => now - timestamp < this.windowMs);
        return Math.max(0, this.maxRequests - validRequests.length);
    }
    /**
     * Resets the rate limiter for a specific key
     */
    reset(key = 'default') {
        this.requests.delete(key);
    }
}
// Global rate limiter instance
export const globalRateLimiter = new RateLimiter(60000, 100); // 100 requests per minute
