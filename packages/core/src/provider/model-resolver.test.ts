import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { describe, expect, it, vi } from "vitest";
import type { ProviderConfig } from "../config/schema.js";
import { parseModelString, resolveModel } from "./model-resolver.js";

vi.mock("@ai-sdk/anthropic", () => {
	const mockModel = { modelId: "mock-anthropic", provider: "anthropic" };
	const mockProvider = vi.fn(() => mockModel);
	return {
		createAnthropic: vi.fn(() => mockProvider),
	};
});

vi.mock("@ai-sdk/openai", () => {
	const mockModel = { modelId: "mock-openai", provider: "openai" };
	const mockProvider = vi.fn(() => mockModel);
	return {
		createOpenAI: vi.fn(() => mockProvider),
	};
});

const mockedCreateAnthropic = vi.mocked(createAnthropic);
const mockedCreateOpenAI = vi.mocked(createOpenAI);

const configWithKeys: ProviderConfig = {
	anthropic: { apiKey: "sk-ant-test" },
	openai: { apiKey: "sk-openai-test" },
	openrouter: { apiKey: "sk-or-test" },
};

const configNoKeys: ProviderConfig = {
	anthropic: { apiKey: "" },
	openai: { apiKey: "" },
	openrouter: { apiKey: "" },
};

describe("parseModelString", () => {
	it("parses explicit anthropic/ prefix", () => {
		const result = parseModelString("anthropic/claude-sonnet-4-5-20250929");
		expect(result).toEqual({
			providerName: "anthropic",
			modelId: "claude-sonnet-4-5-20250929",
		});
	});

	it("parses explicit openai/ prefix", () => {
		const result = parseModelString("openai/gpt-4o");
		expect(result).toEqual({ providerName: "openai", modelId: "gpt-4o" });
	});

	it("parses explicit openrouter/ prefix", () => {
		const result = parseModelString("openrouter/deepseek/deepseek-r1");
		expect(result).toEqual({
			providerName: "openrouter",
			modelId: "deepseek/deepseek-r1",
		});
	});

	it("sends unknown prefix to openrouter with full string as modelId", () => {
		const result = parseModelString("deepseek/deepseek-r1");
		expect(result).toEqual({
			providerName: "openrouter",
			modelId: "deepseek/deepseek-r1",
		});
	});

	it("keyword matches claude to anthropic", () => {
		const result = parseModelString("claude-sonnet-4-5-20250929");
		expect(result).toEqual({
			providerName: "anthropic",
			modelId: "claude-sonnet-4-5-20250929",
		});
	});

	it("keyword matches gpt to openai", () => {
		const result = parseModelString("gpt-4o");
		expect(result).toEqual({ providerName: "openai", modelId: "gpt-4o" });
	});

	it("keyword matches o1 to openai", () => {
		const result = parseModelString("o1-2024-12-17");
		expect(result).toEqual({
			providerName: "openai",
			modelId: "o1-2024-12-17",
		});
	});

	it("keyword matches o3 to openai", () => {
		const result = parseModelString("o3-mini");
		expect(result).toEqual({ providerName: "openai", modelId: "o3-mini" });
	});

	it("falls back to openrouter for unknown models", () => {
		const result = parseModelString("mistral-large-latest");
		expect(result).toEqual({
			providerName: "openrouter",
			modelId: "mistral-large-latest",
		});
	});
});

describe("resolveModel", () => {
	it("resolves anthropic model with API key", () => {
		mockedCreateAnthropic.mockClear();
		const model = resolveModel("anthropic/claude-sonnet-4-5-20250929", configWithKeys);
		expect(mockedCreateAnthropic).toHaveBeenCalledWith({
			apiKey: "sk-ant-test",
		});
		expect(model).toBeDefined();
	});

	it("resolves openai model with API key", () => {
		mockedCreateOpenAI.mockClear();
		const model = resolveModel("openai/gpt-4o", configWithKeys);
		expect(mockedCreateOpenAI).toHaveBeenCalledWith({
			apiKey: "sk-openai-test",
		});
		expect(model).toBeDefined();
	});

	it("resolves openrouter model with custom baseURL", () => {
		mockedCreateOpenAI.mockClear();
		const model = resolveModel("mistral-large-latest", configWithKeys);
		expect(mockedCreateOpenAI).toHaveBeenCalledWith({
			apiKey: "sk-or-test",
			baseURL: "https://openrouter.ai/api/v1",
			name: "openrouter",
		});
		expect(model).toBeDefined();
	});

	it("throws on missing API key for anthropic", () => {
		expect(() => resolveModel("anthropic/claude-sonnet-4-5-20250929", configNoKeys)).toThrowError(
			/No API key configured for provider "anthropic"/,
		);
	});

	it("throws on missing API key for openrouter", () => {
		expect(() => resolveModel("mistral-large-latest", configNoKeys)).toThrowError(
			/No API key configured for provider "openrouter"/,
		);
	});
});
