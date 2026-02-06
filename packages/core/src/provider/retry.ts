export interface RetryOptions {
	maxRetries?: number;
	baseDelayMs?: number;
	maxDelayMs?: number;
}

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BASE_DELAY_MS = 1000;
const DEFAULT_MAX_DELAY_MS = 30000;

const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);
const RETRYABLE_ERROR_CODES = new Set(["ECONNRESET", "ETIMEDOUT"]);

export function isRetryable(error: unknown): boolean {
	if (!(error instanceof Error)) return false;

	const err = error as Error & { status?: number; statusCode?: number; code?: string };
	const status = err.status ?? err.statusCode;
	if (status !== undefined) {
		return RETRYABLE_STATUS_CODES.has(status);
	}

	if (err.code !== undefined) {
		return RETRYABLE_ERROR_CODES.has(err.code);
	}

	return false;
}

export function computeDelay(attempt: number, baseDelayMs: number, maxDelayMs: number): number {
	const exponential = Math.min(baseDelayMs * 2 ** attempt, maxDelayMs);
	const jitter = exponential * 0.25 * (2 * Math.random() - 1);
	return Math.max(0, exponential + jitter);
}

export async function withRetry<T>(fn: () => Promise<T> | T, options?: RetryOptions): Promise<T> {
	const maxRetries = options?.maxRetries ?? DEFAULT_MAX_RETRIES;
	const baseDelayMs = options?.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
	const maxDelayMs = options?.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;

	let lastError: unknown;

	for (let attempt = 0; attempt <= maxRetries; attempt++) {
		try {
			return await fn();
		} catch (error) {
			lastError = error;
			if (!isRetryable(error) || attempt === maxRetries) {
				throw error;
			}
			const delay = computeDelay(attempt, baseDelayMs, maxDelayMs);
			await new Promise((resolve) => setTimeout(resolve, delay));
		}
	}

	throw lastError;
}
