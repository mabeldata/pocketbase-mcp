/**
 * Rate limiter and retry mechanism for PocketBase API calls
 */

interface RetryOptions {
  maxRetries?: number;
  baseDelay?: number;
  maxDelay?: number;
  retryableStatuses?: number[];
}

const DEFAULT_RETRY_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  baseDelay: 1000, // 1 second
  maxDelay: 10000, // 10 seconds
  retryableStatuses: [429, 500, 502, 503, 504] // Rate limit and server errors
};

/**
 * Checks if an error is retryable based on status code
 */
function isRetryableError(error: any, retryableStatuses: number[]): boolean {
  const status = error?.status || error?.response?.status;
  return status !== undefined && retryableStatuses.includes(status);
}

/**
 * Calculates delay for exponential backoff
 */
function calculateDelay(attempt: number, baseDelay: number, maxDelay: number): number {
  const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
  // Add jitter to prevent thundering herd
  const jitter = Math.random() * 0.3 * delay; // Up to 30% jitter
  return delay + jitter;
}

/**
 * Sleeps for the specified number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Executes a function with retry logic and exponential backoff
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let lastError: any;
  
  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
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
  private requests: Map<string, number[]> = new Map();
  private windowMs: number;
  private maxRequests: number;
  
  constructor(windowMs: number = 60000, maxRequests: number = 100) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
  }
  
  /**
   * Checks if a request is allowed and records it
   */
  isAllowed(key: string = 'default'): boolean {
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
  getRemaining(key: string = 'default'): number {
    const now = Date.now();
    const requests = this.requests.get(key) || [];
    const validRequests = requests.filter(timestamp => now - timestamp < this.windowMs);
    return Math.max(0, this.maxRequests - validRequests.length);
  }
  
  /**
   * Resets the rate limiter for a specific key
   */
  reset(key: string = 'default'): void {
    this.requests.delete(key);
  }
}

// Global rate limiter instance
export const globalRateLimiter = new RateLimiter(60000, 100); // 100 requests per minute
