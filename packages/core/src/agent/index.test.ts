import { describe, expect, it } from "vitest";
import { FeatherBotConfigSchema } from "../config/schema.js";
import { createAgentLoop } from "./index.js";

function parseConfig(overrides?: Record<string, unknown>) {
	return FeatherBotConfigSchema.parse({
		session: { dbPath: "" },
		...overrides,
	});
}

describe("createAgentLoop", () => {
	it("creates an AgentLoop from default config without throwing", () => {
		const config = parseConfig();
		const agent = createAgentLoop(config);

		expect(agent).toBeDefined();
		expect(typeof agent.processMessage).toBe("function");
		expect(typeof agent.processDirect).toBe("function");
	});

	it("creates an AgentLoop with custom system prompt", () => {
		const config = parseConfig();
		const agent = createAgentLoop(config, { systemPrompt: "You are a test bot." });

		expect(agent).toBeDefined();
		expect(typeof agent.processDirect).toBe("function");
	});

	it("creates an AgentLoop with onStepFinish callback", () => {
		const config = parseConfig();
		const events: unknown[] = [];
		const agent = createAgentLoop(config, {
			onStepFinish: (event) => events.push(event),
		});

		expect(agent).toBeDefined();
		expect(typeof agent.processMessage).toBe("function");
	});

	it("creates an AgentLoop from config with custom agent defaults", () => {
		const config = parseConfig({
			agents: {
				defaults: {
					model: "openai/gpt-4o",
					temperature: 0.3,
					maxTokens: 4096,
					maxToolIterations: 10,
				},
			},
		});
		const agent = createAgentLoop(config);

		expect(agent).toBeDefined();
		expect(typeof agent.processDirect).toBe("function");
	});
});
