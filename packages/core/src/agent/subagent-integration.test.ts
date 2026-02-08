import { createOutboundMessage } from "@featherbot/bus";
import { describe, expect, it, vi } from "vitest";
import type { FeatherBotConfig } from "../config/schema.js";
import { FeatherBotConfigSchema } from "../config/schema.js";
import type { GenerateOptions, GenerateResult, LLMProvider } from "../provider/types.js";
import type { SubagentState } from "./subagent-types.js";
import { SubagentManager } from "./subagent.js";

const EMPTY_USAGE = { promptTokens: 10, completionTokens: 5, totalTokens: 15 };

function makeResult(overrides?: Partial<GenerateResult>): GenerateResult {
	return {
		text: "Task done",
		toolCalls: [],
		toolResults: [],
		usage: EMPTY_USAGE,
		finishReason: "stop",
		...overrides,
	};
}

function makeMockProvider(
	generateFn?: (options: GenerateOptions) => Promise<GenerateResult>,
): LLMProvider {
	return {
		generate: generateFn ?? (async () => makeResult()),
		stream: async () => {
			throw new Error("stream not implemented");
		},
	};
}

function makeConfig(overrides?: Partial<FeatherBotConfig>): FeatherBotConfig {
	const base = FeatherBotConfigSchema.parse({});
	return { ...base, ...overrides };
}

interface MockBusMessage {
	channel: string;
	chatId: string;
	content: string;
}

function createMockBus() {
	const published: MockBusMessage[] = [];

	const onComplete = async (state: SubagentState) => {
		const content =
			state.status === "completed"
				? `Background task completed:\nTask: ${state.task}\nResult: ${state.result}`
				: `Background task failed:\nTask: ${state.task}\nError: ${state.error}`;
		const outbound = createOutboundMessage({
			channel: state.originChannel,
			chatId: state.originChatId,
			content,
			replyTo: null,
			media: [],
			metadata: {},
			inReplyToMessageId: null,
		});
		published.push({
			channel: outbound.channel,
			chatId: outbound.chatId,
			content: outbound.content,
		});
	};

	return { published, onComplete };
}

describe("Sub-agent Integration", () => {
	it("spawn -> sub-agent runs -> completes -> result delivered to bus", async () => {
		const { published, onComplete } = createMockBus();
		const provider = makeMockProvider(async () => makeResult({ text: "Research complete" }));
		const manager = new SubagentManager(provider, makeConfig(), onComplete);

		manager.spawn({
			task: "research AI trends",
			originChannel: "telegram",
			originChatId: "42",
		});

		await vi.waitFor(() => {
			expect(published.length).toBe(1);
		});

		expect(published[0]?.channel).toBe("telegram");
		expect(published[0]?.chatId).toBe("42");
		expect(published[0]?.content).toContain("Background task completed:");
		expect(published[0]?.content).toContain("Task: research AI trends");
		expect(published[0]?.content).toContain("Result: Research complete");
	});

	it("spawn -> sub-agent errors -> failure message delivered to bus", async () => {
		const { published, onComplete } = createMockBus();
		const provider = makeMockProvider(async () => {
			throw new Error("API rate limited");
		});
		const manager = new SubagentManager(provider, makeConfig(), onComplete);

		manager.spawn({
			task: "failing task",
			originChannel: "whatsapp",
			originChatId: "99",
		});

		await vi.waitFor(() => {
			expect(published.length).toBe(1);
		});

		expect(published[0]?.channel).toBe("whatsapp");
		expect(published[0]?.chatId).toBe("99");
		expect(published[0]?.content).toContain("Background task failed:");
		expect(published[0]?.content).toContain("Task: failing task");
		expect(published[0]?.content).toContain("Error: API rate limited");
	});

	it("spawn -> sub-agent times out -> timeout message delivered to bus", async () => {
		vi.useFakeTimers();

		const { published, onComplete } = createMockBus();
		const provider = makeMockProvider(
			() => new Promise(() => {}), // Never resolves
		);
		const config = makeConfig({
			subagent: { maxIterations: 15, timeoutMs: 500 },
		});
		const manager = new SubagentManager(provider, config, onComplete);

		manager.spawn({
			task: "slow task",
			originChannel: "terminal",
			originChatId: "1",
		});

		await vi.advanceTimersByTimeAsync(600);

		await vi.waitFor(() => {
			expect(published.length).toBe(1);
		});

		expect(published[0]?.channel).toBe("terminal");
		expect(published[0]?.chatId).toBe("1");
		expect(published[0]?.content).toContain("Background task failed:");
		expect(published[0]?.content).toContain("Task: slow task");
		expect(published[0]?.content).toContain("Error: Sub-agent timed out");

		vi.useRealTimers();
	});
});
