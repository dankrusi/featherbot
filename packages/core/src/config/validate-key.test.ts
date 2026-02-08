import { describe, expect, it } from "vitest";
import { detectProvider, validateApiKeyFormat } from "./validate-key.js";

describe("detectProvider", () => {
	it("detects anthropic from sk-ant- prefix", () => {
		expect(detectProvider("sk-ant-abc123")).toEqual({ provider: "anthropic" });
	});

	it("detects openrouter from sk-or- prefix", () => {
		expect(detectProvider("sk-or-abc123")).toEqual({ provider: "openrouter" });
	});

	it("detects openai from sk- prefix", () => {
		expect(detectProvider("sk-abc123")).toEqual({ provider: "openai" });
	});

	it("returns null for unrecognized prefix", () => {
		expect(detectProvider("unknown-key")).toEqual({ provider: null });
	});

	it("trims whitespace before matching", () => {
		expect(detectProvider("  sk-ant-abc123  ")).toEqual({ provider: "anthropic" });
	});

	it("prioritizes sk-ant- over sk-", () => {
		// sk-ant- should match anthropic, not openai's sk-
		expect(detectProvider("sk-ant-test")).toEqual({ provider: "anthropic" });
	});

	it("prioritizes sk-or- over sk-", () => {
		expect(detectProvider("sk-or-test")).toEqual({ provider: "openrouter" });
	});
});

describe("validateApiKeyFormat", () => {
	it("returns valid for anthropic key with correct prefix", () => {
		expect(validateApiKeyFormat("anthropic", "sk-ant-abc123")).toEqual({
			valid: true,
		});
	});

	it("returns invalid for empty key", () => {
		const result = validateApiKeyFormat("anthropic", "");
		expect(result.valid).toBe(false);
		expect(result.error).toContain("empty");
	});

	it("returns invalid for anthropic key with wrong prefix", () => {
		const result = validateApiKeyFormat("anthropic", "sk-openai-key");
		expect(result.valid).toBe(false);
		expect(result.error).toContain("anthropic");
	});

	it("returns valid for openai key with sk- prefix", () => {
		expect(validateApiKeyFormat("openai", "sk-abc123")).toEqual({
			valid: true,
		});
	});

	it("returns invalid for openai key without sk- prefix", () => {
		const result = validateApiKeyFormat("openai", "not-an-openai-key");
		expect(result.valid).toBe(false);
		expect(result.error).toContain("openai");
	});

	it("returns valid for openrouter key with sk-or- prefix", () => {
		expect(validateApiKeyFormat("openrouter", "sk-or-abc123")).toEqual({
			valid: true,
		});
	});

	it("trims whitespace before validating", () => {
		expect(validateApiKeyFormat("anthropic", "  sk-ant-abc  ")).toEqual({
			valid: true,
		});
	});
});
