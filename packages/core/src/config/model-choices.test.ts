import { describe, expect, it } from "vitest";
import { MODEL_CHOICES } from "./model-choices.js";

describe("MODEL_CHOICES", () => {
	it("anthropic default is Claude Sonnet 4.5 with correct model ID", () => {
		const first = MODEL_CHOICES.anthropic[0];
		expect(first).toEqual({
			id: "anthropic/claude-sonnet-4-5-20250929",
			label: "Claude Sonnet 4.5",
			description: "Best balance of speed and intelligence (default)",
		});
	});

	it("openai default is GPT-4o with correct model ID", () => {
		const first = MODEL_CHOICES.openai[0];
		expect(first).toEqual({
			id: "openai/gpt-4o",
			label: "GPT-4o",
			description: "Most capable OpenAI model (default)",
		});
	});

	it("openrouter default routes through correct provider prefix", () => {
		const first = MODEL_CHOICES.openrouter[0];
		expect(first?.id).toBe("openrouter/anthropic/claude-sonnet-4.5");
	});

	it("all model IDs use provider/model format matching their provider key", () => {
		for (const [provider, choices] of Object.entries(MODEL_CHOICES)) {
			for (const choice of choices) {
				expect(choice.id).toMatch(new RegExp(`^${provider}/`));
			}
		}
	});

	it("no duplicate model IDs across all providers", () => {
		const allIds = Object.values(MODEL_CHOICES)
			.flat()
			.map((c) => c.id);
		expect(new Set(allIds).size).toBe(allIds.length);
	});

	it("each provider has at least 2 choices for selection UI", () => {
		for (const [provider, choices] of Object.entries(MODEL_CHOICES)) {
			expect(choices.length, `${provider} should have >= 2 choices`).toBeGreaterThanOrEqual(2);
		}
	});
});
