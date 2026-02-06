import { describe, expect, it } from "vitest";
import { FeatherBotConfigSchema } from "../config/schema.js";
import { createProvider } from "./index.js";

describe("createProvider", () => {
	it("creates a valid LLMProvider from default config", () => {
		const config = FeatherBotConfigSchema.parse({});
		const provider = createProvider(config);

		expect(provider).toBeDefined();
		expect(typeof provider.generate).toBe("function");
		expect(typeof provider.stream).toBe("function");
	});

	it("creates a provider from config with custom defaults", () => {
		const config = FeatherBotConfigSchema.parse({
			agents: {
				defaults: {
					model: "openai/gpt-4o",
					temperature: 0.5,
					maxTokens: 4096,
				},
			},
			providers: {
				anthropic: { apiKey: "sk-ant-test" },
				openai: { apiKey: "sk-openai-test" },
				openrouter: { apiKey: "sk-or-test" },
			},
		});
		const provider = createProvider(config);

		expect(provider).toBeDefined();
		expect(typeof provider.generate).toBe("function");
		expect(typeof provider.stream).toBe("function");
	});
});
