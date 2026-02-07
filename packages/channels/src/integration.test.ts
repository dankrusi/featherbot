import { MessageBus, createInboundMessage } from "@featherbot/bus";
import type { InboundMessage, OutboundMessage } from "@featherbot/bus";
import type { AgentLoopResult } from "@featherbot/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentProcessor } from "./adapter.js";
import { BusAdapter } from "./adapter.js";
import { BaseChannel } from "./base.js";
import { ChannelManager } from "./manager.js";
import type { ChannelOptions } from "./types.js";

class MockChannel extends BaseChannel {
	readonly name: string;
	readonly startFn = vi.fn<() => Promise<void>>();
	readonly stopFn = vi.fn<() => Promise<void>>();
	readonly sendFn = vi.fn<(msg: OutboundMessage) => Promise<void>>();

	constructor(name: string, options: ChannelOptions) {
		super(options);
		this.name = name;
	}

	async start(): Promise<void> {
		await this.startFn();
	}

	async stop(): Promise<void> {
		await this.stopFn();
	}

	async send(message: OutboundMessage): Promise<void> {
		await this.sendFn(message);
	}

	async simulateInbound(content: string): Promise<void> {
		const message = createInboundMessage({
			channel: this.name,
			senderId: "test:user",
			chatId: "test:chat",
			content,
			media: [],
			metadata: {},
		});
		await this.publishInbound(message);
	}
}

function makeMockAgent(result: Partial<AgentLoopResult> = {}): AgentProcessor {
	return {
		processMessage: vi
			.fn<(inbound: InboundMessage) => Promise<AgentLoopResult>>()
			.mockResolvedValue({
				text: result.text ?? "mock response",
				usage: result.usage ?? { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
				steps: result.steps ?? 1,
				finishReason: result.finishReason ?? "stop",
				toolCalls: result.toolCalls ?? [],
				toolResults: result.toolResults ?? [],
			}),
	};
}

describe("E2E Integration: Channel → Bus → AgentLoop → Bus → Channel", () => {
	let bus: MessageBus;

	afterEach(() => {
		bus.close();
	});

	it("routes inbound message through agent and delivers outbound to channel", async () => {
		bus = new MessageBus();
		const agent = makeMockAgent({ text: "Hello from agent!" });
		const channel = new MockChannel("test-channel", { bus });
		const adapter = new BusAdapter({ bus, agentLoop: agent });
		const manager = new ChannelManager({ bus });

		manager.register(channel);
		await manager.startAll();
		adapter.start();

		await channel.simulateInbound("Hello bot");

		expect(agent.processMessage).toHaveBeenCalledOnce();
		const call = (agent.processMessage as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as
			| InboundMessage
			| undefined;
		expect(call?.content).toBe("Hello bot");
		expect(call?.channel).toBe("test-channel");

		expect(channel.sendFn).toHaveBeenCalledOnce();
		const outbound = channel.sendFn.mock.calls[0]?.[0];
		expect(outbound?.content).toBe("Hello from agent!");
		expect(outbound?.channel).toBe("test-channel");
		expect(outbound?.chatId).toBe("test:chat");

		adapter.stop();
		await manager.stopAll();
	});

	it("delivers fallback error message to channel when agent throws", async () => {
		bus = new MessageBus();
		const agent: AgentProcessor = {
			processMessage: vi.fn().mockRejectedValue(new Error("LLM crashed")),
		};
		const channel = new MockChannel("test-channel", { bus });
		const adapter = new BusAdapter({ bus, agentLoop: agent });
		const manager = new ChannelManager({ bus });

		manager.register(channel);
		await manager.startAll();
		adapter.start();

		await channel.simulateInbound("Hello bot");

		expect(agent.processMessage).toHaveBeenCalledOnce();

		expect(channel.sendFn).toHaveBeenCalledOnce();
		const outbound = channel.sendFn.mock.calls[0]?.[0];
		expect(outbound?.content).toBe("Error: LLM crashed");
		expect(outbound?.channel).toBe("test-channel");
		expect(outbound?.metadata).toEqual({ error: true });

		adapter.stop();
		await manager.stopAll();
	});
});
