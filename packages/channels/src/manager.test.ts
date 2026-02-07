import { MessageBus } from "@featherbot/bus";
import type { OutboundMessage } from "@featherbot/bus";
import { afterEach, describe, expect, it, vi } from "vitest";
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
}

describe("ChannelManager", () => {
	let bus: MessageBus;

	afterEach(() => {
		bus.close();
	});

	it("registers a channel", () => {
		bus = new MessageBus();
		const manager = new ChannelManager({ bus });
		const channel = new MockChannel("test", { bus });

		manager.register(channel);

		expect(manager.getChannel("test")).toBe(channel);
		expect(manager.getChannels()).toEqual([channel]);
	});

	it("throws on duplicate registration", () => {
		bus = new MessageBus();
		const manager = new ChannelManager({ bus });
		const ch1 = new MockChannel("test", { bus });
		const ch2 = new MockChannel("test", { bus });

		manager.register(ch1);

		expect(() => manager.register(ch2)).toThrow('Channel "test" is already registered');
	});

	it("returns undefined for unknown channel name", () => {
		bus = new MessageBus();
		const manager = new ChannelManager({ bus });

		expect(manager.getChannel("unknown")).toBeUndefined();
	});

	it("startAll starts all channels in parallel", async () => {
		bus = new MessageBus();
		const manager = new ChannelManager({ bus });
		const ch1 = new MockChannel("a", { bus });
		const ch2 = new MockChannel("b", { bus });

		manager.register(ch1);
		manager.register(ch2);

		await manager.startAll();

		expect(ch1.startFn).toHaveBeenCalledOnce();
		expect(ch2.startFn).toHaveBeenCalledOnce();
	});

	it("startAll logs warning when a channel fails to start", async () => {
		bus = new MessageBus();
		const warnFn = vi.fn();
		const manager = new ChannelManager({ bus, logger: { warn: warnFn } });
		const ch = new MockChannel("failing", { bus });
		ch.startFn.mockRejectedValue(new Error("connect failed"));

		manager.register(ch);
		await manager.startAll();

		expect(warnFn).toHaveBeenCalledWith("Channel failed to start", {
			error: "connect failed",
		});
	});

	it("stopAll stops all channels and unsubscribes outbound handler", async () => {
		bus = new MessageBus();
		const manager = new ChannelManager({ bus });
		const ch = new MockChannel("test", { bus });

		manager.register(ch);
		await manager.startAll();
		await manager.stopAll();

		expect(ch.stopFn).toHaveBeenCalledOnce();

		// After stopAll, outbound messages should not be routed
		ch.sendFn.mockClear();
		const outbound: OutboundMessage = {
			channel: "test",
			chatId: "chat-1",
			content: "hello",
			replyTo: null,
			media: [],
			metadata: {},
			messageId: "msg-1",
			inReplyToMessageId: null,
		};
		await bus.publish({
			type: "message:outbound",
			message: outbound,
			timestamp: new Date(),
		});
		expect(ch.sendFn).not.toHaveBeenCalled();
	});

	it("routes outbound messages to matching channel", async () => {
		bus = new MessageBus();
		const manager = new ChannelManager({ bus });
		const ch = new MockChannel("telegram", { bus });

		manager.register(ch);
		await manager.startAll();

		const outbound: OutboundMessage = {
			channel: "telegram",
			chatId: "chat-1",
			content: "hello",
			replyTo: null,
			media: [],
			metadata: {},
			messageId: "msg-1",
			inReplyToMessageId: null,
		};
		await bus.publish({
			type: "message:outbound",
			message: outbound,
			timestamp: new Date(),
		});

		expect(ch.sendFn).toHaveBeenCalledOnce();
		expect(ch.sendFn.mock.calls[0]?.[0]).toBe(outbound);
	});

	it("logs warning for unknown channel in outbound message", async () => {
		bus = new MessageBus();
		const warnFn = vi.fn();
		const manager = new ChannelManager({ bus, logger: { warn: warnFn } });

		await manager.startAll();

		const outbound: OutboundMessage = {
			channel: "nonexistent",
			chatId: "chat-1",
			content: "hello",
			replyTo: null,
			media: [],
			metadata: {},
			messageId: "msg-1",
			inReplyToMessageId: null,
		};
		await bus.publish({
			type: "message:outbound",
			message: outbound,
			timestamp: new Date(),
		});

		expect(warnFn).toHaveBeenCalledWith("No channel found for outbound message", {
			channel: "nonexistent",
		});
	});
});
