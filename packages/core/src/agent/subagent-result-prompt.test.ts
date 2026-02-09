import { describe, expect, it } from "vitest";
import { buildSubagentResultPrompt } from "./subagent-result-prompt.js";
import type { SubagentState } from "./subagent-types.js";

describe("buildSubagentResultPrompt", () => {
	it("generates a summarization prompt for completed tasks", () => {
		const state: SubagentState = {
			id: "test-id",
			task: "Research the best credit cards for travel rewards",
			status: "completed",
			result: "Top 3 cards: Chase Sapphire Reserve, Amex Gold, Capital One Venture X",
			startedAt: new Date("2026-02-09T10:00:00Z"),
			completedAt: new Date("2026-02-09T10:01:00Z"),
			originChannel: "telegram",
			originChatId: "12345",
		};

		const prompt = buildSubagentResultPrompt(state);

		expect(prompt).toContain("background task you spawned has completed");
		expect(prompt).toContain("Research the best credit cards for travel rewards");
		expect(prompt).toContain("Top 3 cards: Chase Sapphire Reserve");
		expect(prompt).toContain("conversational");
		expect(prompt).toContain("Reference the original task naturally");
	});

	it("generates an error prompt for failed tasks", () => {
		const state: SubagentState = {
			id: "test-id",
			task: "Fetch weather data from API",
			status: "failed",
			error: "Network timeout after 30s",
			startedAt: new Date("2026-02-09T10:00:00Z"),
			completedAt: new Date("2026-02-09T10:00:30Z"),
			originChannel: "whatsapp",
			originChatId: "67890",
		};

		const prompt = buildSubagentResultPrompt(state);

		expect(prompt).toContain("background task you spawned has failed");
		expect(prompt).toContain("Fetch weather data from API");
		expect(prompt).toContain("Network timeout after 30s");
		expect(prompt).toContain("retry or suggest an alternative");
	});

	it("handles completed task with no result", () => {
		const state: SubagentState = {
			id: "test-id",
			task: "Clean up temp files",
			status: "completed",
			startedAt: new Date("2026-02-09T10:00:00Z"),
			completedAt: new Date("2026-02-09T10:00:05Z"),
			originChannel: "terminal",
			originChatId: "cli",
		};

		const prompt = buildSubagentResultPrompt(state);

		expect(prompt).toContain("(no result)");
		expect(prompt).toContain("Clean up temp files");
	});

	it("handles failed task with no error message", () => {
		const state: SubagentState = {
			id: "test-id",
			task: "Process data",
			status: "failed",
			startedAt: new Date("2026-02-09T10:00:00Z"),
			completedAt: new Date("2026-02-09T10:00:10Z"),
			originChannel: "telegram",
			originChatId: "12345",
		};

		const prompt = buildSubagentResultPrompt(state);

		expect(prompt).toContain("(unknown error)");
		expect(prompt).toContain("Process data");
	});

	it("does not mention sub-agent in instructions", () => {
		const completedState: SubagentState = {
			id: "test-id",
			task: "Do something",
			status: "completed",
			result: "Done",
			startedAt: new Date(),
			originChannel: "telegram",
			originChatId: "123",
		};

		const failedState: SubagentState = {
			...completedState,
			status: "failed",
			error: "Oops",
			result: undefined,
		};

		const completedPrompt = buildSubagentResultPrompt(completedState);
		const failedPrompt = buildSubagentResultPrompt(failedState);

		expect(completedPrompt).toContain("Do NOT mention");
		expect(failedPrompt).toContain("Do NOT mention");
	});
});
