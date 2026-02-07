import type { MessageBus } from "@featherbot/bus";

export interface ChannelOptions {
	bus: MessageBus;
	allowFrom?: string[];
}

export type ChannelStatus = "stopped" | "starting" | "running" | "error";
