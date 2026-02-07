import { PassThrough } from "node:stream";
import { MessageBus } from "@featherbot/bus";
import type { InboundMessageEvent } from "@featherbot/bus";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TerminalChannel } from "./terminal.js";

function createStreams() {
	const input = new PassThrough();
	const output = new PassThrough();
	output.setEncoding("utf8");
	return { input, output };
}

function readOutput(output: PassThrough): string {
	const chunks: string[] = [];
	for (;;) {
		const chunk = output.read() as string | null;
		if (chunk === null) {
			break;
		}
		chunks.push(chunk);
	}
	return chunks.join("");
}

async function tick(ms = 20): Promise<void> {
	await new Promise((r) => setTimeout(r, ms));
}

describe("TerminalChannel", () => {
	let bus: MessageBus;

	afterEach(() => {
		bus.close();
	});

	it("has name 'terminal'", () => {
		bus = new MessageBus();
		const { input, output } = createStreams();
		const channel = new TerminalChannel({ bus, input, output });
		expect(channel.name).toBe("terminal");
	});

	it("send() writes content prefixed with 'bot> '", async () => {
		bus = new MessageBus();
		const { input, output } = createStreams();
		const channel = new TerminalChannel({ bus, input, output });

		await channel.send({
			channel: "terminal",
			chatId: "terminal:default",
			content: "Hello!",
			replyTo: null,
			media: [],
			metadata: {},
			messageId: "msg-1",
			inReplyToMessageId: null,
		});

		const written = readOutput(output);
		expect(written).toContain("bot> Hello!");
	});

	it("publishes inbound message on user input", async () => {
		bus = new MessageBus();
		const { input, output } = createStreams();
		const channel = new TerminalChannel({ bus, input, output });

		const inboundEvents: InboundMessageEvent[] = [];
		bus.subscribe("message:inbound", (event) => {
			inboundEvents.push(event);
		});

		await channel.start();
		await tick();

		input.write("Hello agent\n");
		await tick();

		expect(inboundEvents).toHaveLength(1);
		expect(inboundEvents[0]?.message.content).toBe("Hello agent");
		expect(inboundEvents[0]?.message.channel).toBe("terminal");
		expect(inboundEvents[0]?.message.senderId).toBe("terminal:local");
		expect(inboundEvents[0]?.message.chatId).toBe("terminal:default");

		await channel.stop();
	});

	it("prints 'Thinking...' after user input", async () => {
		bus = new MessageBus();
		const { input, output } = createStreams();
		const channel = new TerminalChannel({ bus, input, output });

		await channel.start();
		await tick();

		input.write("Hi\n");
		await tick();

		const written = readOutput(output);
		expect(written).toContain("Thinking...");

		await channel.stop();
	});

	it("ignores empty input lines", async () => {
		bus = new MessageBus();
		const { input, output } = createStreams();
		const channel = new TerminalChannel({ bus, input, output });

		const inboundEvents: InboundMessageEvent[] = [];
		bus.subscribe("message:inbound", (event) => {
			inboundEvents.push(event);
		});

		await channel.start();
		await tick();

		input.write("\n");
		await tick();
		input.write("   \n");
		await tick();

		expect(inboundEvents).toHaveLength(0);

		await channel.stop();
	});

	it("stops on exit command", async () => {
		bus = new MessageBus();
		const { input, output } = createStreams();
		const onStop = vi.fn();
		const channel = new TerminalChannel({ bus, input, output, onStop });

		await channel.start();
		await tick();

		input.write("exit\n");
		await tick();

		expect(onStop).toHaveBeenCalled();
	});

	it("stops on quit command", async () => {
		bus = new MessageBus();
		const { input, output } = createStreams();
		const onStop = vi.fn();
		const channel = new TerminalChannel({ bus, input, output, onStop });

		await channel.start();
		await tick();

		input.write("/quit\n");
		await tick();

		expect(onStop).toHaveBeenCalled();
	});

	it("stop() closes readline", async () => {
		bus = new MessageBus();
		const { input, output } = createStreams();
		const channel = new TerminalChannel({ bus, input, output });

		await channel.start();
		await tick();

		await channel.stop();

		// After stop, writing should not produce inbound events
		const inboundEvents: InboundMessageEvent[] = [];
		bus.subscribe("message:inbound", (event) => {
			inboundEvents.push(event);
		});

		input.write("Hello\n");
		await tick();

		expect(inboundEvents).toHaveLength(0);
	});
});
