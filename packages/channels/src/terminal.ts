import * as readline from "node:readline/promises";
import { createInboundMessage } from "@featherbot/bus";
import type { OutboundMessage } from "@featherbot/bus";
import { BaseChannel } from "./base.js";
import type { ChannelOptions } from "./types.js";

const EXIT_COMMANDS = new Set(["exit", "quit", "/quit"]);

export interface TerminalChannelOptions extends ChannelOptions {
	input?: NodeJS.ReadableStream;
	output?: NodeJS.WritableStream;
	onStop?: () => void;
}

export class TerminalChannel extends BaseChannel {
	readonly name = "terminal";

	private rl: readline.Interface | undefined;
	private running = false;
	private readonly input: NodeJS.ReadableStream;
	private readonly output: NodeJS.WritableStream;
	private readonly onStop?: () => void;

	constructor(options: TerminalChannelOptions) {
		super(options);
		this.input = options.input ?? process.stdin;
		this.output = options.output ?? process.stdout;
		this.onStop = options.onStop;
	}

	async start(): Promise<void> {
		this.running = true;
		this.rl = readline.createInterface({
			input: this.input,
			output: this.output,
		});

		this.rl.on("close", () => {
			this.running = false;
			this.onStop?.();
		});

		this.promptLoop();
	}

	async stop(): Promise<void> {
		this.running = false;
		if (this.rl !== undefined) {
			this.rl.close();
			this.rl = undefined;
		}
	}

	async send(message: OutboundMessage): Promise<void> {
		this.write(`bot> ${message.content}\n`);
	}

	private promptLoop(): void {
		if (!this.running || this.rl === undefined) {
			return;
		}
		this.rl
			.question("you> ")
			.then(async (line) => {
				const trimmed = line.trim();

				if (EXIT_COMMANDS.has(trimmed)) {
					await this.stop();
					return;
				}

				if (trimmed === "") {
					this.promptLoop();
					return;
				}

				this.write("Thinking...\n");

				const inbound = createInboundMessage({
					channel: "terminal",
					senderId: "terminal:local",
					chatId: "terminal:default",
					content: trimmed,
					media: [],
					metadata: {},
				});
				await this.publishInbound(inbound);

				this.promptLoop();
			})
			.catch(() => {
				// readline closed or errored — stop gracefully
				this.running = false;
			});
	}

	private write(text: string): void {
		this.output.write(text);
	}
}
