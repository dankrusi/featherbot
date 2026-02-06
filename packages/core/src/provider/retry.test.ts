import { describe, expect, it, vi } from "vitest";
import { computeDelay, isRetryable, withRetry } from "./retry.js";

describe("isRetryable", () => {
	it("returns true for HTTP 429", () => {
		const error = Object.assign(new Error("Rate limit"), { status: 429 });
		expect(isRetryable(error)).toBe(true);
	});

	it("returns true for HTTP 500", () => {
		const error = Object.assign(new Error("Internal server error"), { status: 500 });
		expect(isRetryable(error)).toBe(true);
	});

	it("returns true for HTTP 502", () => {
		const error = Object.assign(new Error("Bad gateway"), { status: 502 });
		expect(isRetryable(error)).toBe(true);
	});

	it("returns true for HTTP 503", () => {
		const error = Object.assign(new Error("Service unavailable"), { status: 503 });
		expect(isRetryable(error)).toBe(true);
	});

	it("returns true for HTTP 504", () => {
		const error = Object.assign(new Error("Gateway timeout"), { status: 504 });
		expect(isRetryable(error)).toBe(true);
	});

	it("returns true for statusCode property", () => {
		const error = Object.assign(new Error("Rate limit"), { statusCode: 429 });
		expect(isRetryable(error)).toBe(true);
	});

	it("returns false for HTTP 400", () => {
		const error = Object.assign(new Error("Bad request"), { status: 400 });
		expect(isRetryable(error)).toBe(false);
	});

	it("returns false for HTTP 401", () => {
		const error = Object.assign(new Error("Unauthorized"), { status: 401 });
		expect(isRetryable(error)).toBe(false);
	});

	it("returns false for HTTP 403", () => {
		const error = Object.assign(new Error("Forbidden"), { status: 403 });
		expect(isRetryable(error)).toBe(false);
	});

	it("returns false for HTTP 404", () => {
		const error = Object.assign(new Error("Not found"), { status: 404 });
		expect(isRetryable(error)).toBe(false);
	});

	it("returns true for ECONNRESET", () => {
		const error = Object.assign(new Error("Connection reset"), { code: "ECONNRESET" });
		expect(isRetryable(error)).toBe(true);
	});

	it("returns true for ETIMEDOUT", () => {
		const error = Object.assign(new Error("Timed out"), { code: "ETIMEDOUT" });
		expect(isRetryable(error)).toBe(true);
	});

	it("returns false for unknown error codes", () => {
		const error = Object.assign(new Error("Connection refused"), { code: "ECONNREFUSED" });
		expect(isRetryable(error)).toBe(false);
	});

	it("returns false for plain Error without status or code", () => {
		expect(isRetryable(new Error("Something failed"))).toBe(false);
	});

	it("returns false for non-Error values", () => {
		expect(isRetryable("string error")).toBe(false);
		expect(isRetryable(42)).toBe(false);
		expect(isRetryable(null)).toBe(false);
	});
});

describe("computeDelay", () => {
	it("increases exponentially with attempt number", () => {
		const delays = [0, 1, 2, 3].map((attempt) => {
			const base = 1000;
			const expected = Math.min(base * 2 ** attempt, 30000);
			const actual = computeDelay(attempt, base, 30000);
			// With ±25% jitter, actual should be within [0.75 * expected, 1.25 * expected]
			expect(actual).toBeGreaterThanOrEqual(expected * 0.75);
			expect(actual).toBeLessThanOrEqual(expected * 1.25);
			return expected;
		});
		// Base delays: 1000, 2000, 4000, 8000
		expect(delays).toEqual([1000, 2000, 4000, 8000]);
	});

	it("caps at maxDelayMs", () => {
		const delay = computeDelay(20, 1000, 5000);
		// Without jitter: min(1000 * 2^20, 5000) = 5000
		// With ±25% jitter: [3750, 6250]
		expect(delay).toBeGreaterThanOrEqual(3750);
		expect(delay).toBeLessThanOrEqual(6250);
	});
});

describe("withRetry", () => {
	it("returns result on first successful attempt", async () => {
		const fn = vi.fn().mockResolvedValue("success");
		const result = await withRetry(fn);
		expect(result).toBe("success");
		expect(fn).toHaveBeenCalledTimes(1);
	});

	it("retries on transient error and succeeds", async () => {
		const error429 = Object.assign(new Error("Rate limit"), { status: 429 });
		const fn = vi.fn().mockRejectedValueOnce(error429).mockResolvedValueOnce("recovered");
		const result = await withRetry(fn, { baseDelayMs: 1, maxDelayMs: 10 });
		expect(result).toBe("recovered");
		expect(fn).toHaveBeenCalledTimes(2);
	});

	it("gives up after maxRetries", async () => {
		const error500 = Object.assign(new Error("Server error"), { status: 500 });
		const fn = vi.fn().mockRejectedValue(error500);
		await expect(withRetry(fn, { maxRetries: 2, baseDelayMs: 1, maxDelayMs: 10 })).rejects.toThrow(
			"Server error",
		);
		expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
	});

	it("throws immediately for non-retryable errors", async () => {
		const error401 = Object.assign(new Error("Unauthorized"), { status: 401 });
		const fn = vi.fn().mockRejectedValue(error401);
		await expect(withRetry(fn, { baseDelayMs: 1 })).rejects.toThrow("Unauthorized");
		expect(fn).toHaveBeenCalledTimes(1);
	});

	it("retries network errors", async () => {
		const networkError = Object.assign(new Error("Connection reset"), { code: "ECONNRESET" });
		const fn = vi.fn().mockRejectedValueOnce(networkError).mockResolvedValueOnce("recovered");
		const result = await withRetry(fn, { baseDelayMs: 1, maxDelayMs: 10 });
		expect(result).toBe("recovered");
		expect(fn).toHaveBeenCalledTimes(2);
	});

	it("works with synchronous functions", async () => {
		const fn = vi.fn().mockReturnValue("sync-result");
		const result = await withRetry(fn);
		expect(result).toBe("sync-result");
		expect(fn).toHaveBeenCalledTimes(1);
	});

	it("retries synchronous throwing functions", async () => {
		const error502 = Object.assign(new Error("Bad gateway"), { status: 502 });
		let calls = 0;
		const fn = vi.fn().mockImplementation(() => {
			calls++;
			if (calls < 3) throw error502;
			return "recovered";
		});
		const result = await withRetry(fn, { baseDelayMs: 1, maxDelayMs: 10 });
		expect(result).toBe("recovered");
		expect(fn).toHaveBeenCalledTimes(3);
	});
});
