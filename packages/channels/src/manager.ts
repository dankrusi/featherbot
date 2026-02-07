import type { BusEventHandler, MessageBus, OutboundMessageEvent } from "@featherbot/bus";
import type { BaseChannel } from "./base.js";

export interface ChannelManagerOptions {
	bus: MessageBus;
	logger?: {
		warn: (msg: string, meta?: Record<string, unknown>) => void;
	};
}

export class ChannelManager {
	private readonly bus: MessageBus;
	private readonly logger?: ChannelManagerOptions["logger"];
	private readonly channels = new Map<string, BaseChannel>();
	private outboundHandler: BusEventHandler<OutboundMessageEvent> | undefined;

	constructor(options: ChannelManagerOptions) {
		this.bus = options.bus;
		this.logger = options.logger;
	}

	register(channel: BaseChannel): void {
		if (this.channels.has(channel.name)) {
			throw new Error(`Channel "${channel.name}" is already registered`);
		}
		this.channels.set(channel.name, channel);
	}

	getChannel(name: string): BaseChannel | undefined {
		return this.channels.get(name);
	}

	getChannels(): BaseChannel[] {
		return [...this.channels.values()];
	}

	async startAll(): Promise<void> {
		this.outboundHandler = async (event: OutboundMessageEvent) => {
			const channel = this.channels.get(event.message.channel);
			if (channel === undefined) {
				this.logger?.warn("No channel found for outbound message", {
					channel: event.message.channel,
				});
				return;
			}
			await channel.send(event.message);
		};
		this.bus.subscribe("message:outbound", this.outboundHandler);

		const results = await Promise.allSettled([...this.channels.values()].map((ch) => ch.start()));
		for (const result of results) {
			if (result.status === "rejected") {
				this.logger?.warn("Channel failed to start", {
					error: result.reason instanceof Error ? result.reason.message : String(result.reason),
				});
			}
		}
	}

	async stopAll(): Promise<void> {
		if (this.outboundHandler !== undefined) {
			this.bus.unsubscribe("message:outbound", this.outboundHandler);
			this.outboundHandler = undefined;
		}

		const results = await Promise.allSettled([...this.channels.values()].map((ch) => ch.stop()));
		for (const result of results) {
			if (result.status === "rejected") {
				this.logger?.warn("Channel failed to stop", {
					error: result.reason instanceof Error ? result.reason.message : String(result.reason),
				});
			}
		}
	}
}
