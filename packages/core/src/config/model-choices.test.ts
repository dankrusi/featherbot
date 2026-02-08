import { describe, expect, it } from "vitest";
import { MODEL_CHOICES } from "./model-choices.js";

describe("MODEL_CHOICES", () => {
	it("has entries for all three providers", () => {
		expect(MODEL_CHOICES).toHaveProperty("anthropic");
		expect(MODEL_CHOICES).toHaveProperty("openai");
		expect(MODEL_CHOICES).toHaveProperty("openrouter");
	});

	it("each provider has at least one model choice", () => {
		for (const provider of ["anthropic", "openai", "openrouter"] as const) {
			expect(MODEL_CHOICES[provider].length).toBeGreaterThanOrEqual(1);
		}
	});

	it("each choice has id, label, and description", () => {
		for (const provider of ["anthropic", "openai", "openrouter"] as const) {
			for (const choice of MODEL_CHOICES[provider]) {
				expect(choice.id).toBeTruthy();
				expect(choice.label).toBeTruthy();
				expect(choice.description).toBeTruthy();
			}
		}
	});

	it("anthropic default is Claude Sonnet 4.5", () => {
		const first = MODEL_CHOICES.anthropic[0];
		expect(first?.label).toContain("Claude Sonnet");
		expect(first?.id).toContain("claude-sonnet");
	});

	it("openai default is GPT-4o", () => {
		const first = MODEL_CHOICES.openai[0];
		expect(first?.label).toContain("GPT-4o");
		expect(first?.id).toContain("gpt-4o");
	});

	it("model IDs use provider/model format", () => {
		for (const provider of ["anthropic", "openai"] as const) {
			for (const choice of MODEL_CHOICES[provider]) {
				expect(choice.id).toContain("/");
			}
		}
	});
});
