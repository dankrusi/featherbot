import { describe, expect, it, vi } from "vitest";
import { Gateway } from "./gateway.js";
import type { GatewayOptions } from "./types.js";

function createMockOptions(overrides?: Partial<GatewayOptions>): GatewayOptions {
	return {
		bus: { close: vi.fn() },
		adapter: { start: vi.fn(), stop: vi.fn() },
		channelManager: {
			startAll: vi.fn().mockResolvedValue(undefined),
			stopAll: vi.fn().mockResolvedValue(undefined),
			getChannels: vi.fn().mockReturnValue([]),
		},
		...overrides,
	};
}

describe("Gateway", () => {
	describe("start", () => {
		it("calls services in correct order: adapter → channels → cron → heartbeat", async () => {
			const order: string[] = [];
			const opts = createMockOptions({
				adapter: {
					start: vi.fn(() => order.push("adapter")),
					stop: vi.fn(),
				},
				channelManager: {
					startAll: vi.fn(async () => {
						order.push("channels");
					}),
					stopAll: vi.fn().mockResolvedValue(undefined),
					getChannels: vi.fn().mockReturnValue([]),
				},
				cronService: {
					start: vi.fn(() => order.push("cron")),
					stop: vi.fn(),
				},
				heartbeatService: {
					start: vi.fn(() => order.push("heartbeat")),
					stop: vi.fn(),
				},
			});

			const gw = new Gateway(opts);
			await gw.start();

			expect(order).toEqual(["adapter", "channels", "cron", "heartbeat"]);
		});

		it("is idempotent — second call is no-op", async () => {
			const opts = createMockOptions();
			const gw = new Gateway(opts);

			await gw.start();
			await gw.start();

			expect(opts.adapter.start).toHaveBeenCalledTimes(1);
			expect(opts.channelManager.startAll).toHaveBeenCalledTimes(1);
		});
	});

	describe("stop", () => {
		it("calls services in reverse order: heartbeat → cron → channels → adapter → bus", async () => {
			const order: string[] = [];
			const opts = createMockOptions({
				bus: { close: vi.fn(() => order.push("bus")) },
				adapter: {
					start: vi.fn(),
					stop: vi.fn(() => order.push("adapter")),
				},
				channelManager: {
					startAll: vi.fn().mockResolvedValue(undefined),
					stopAll: vi.fn(async () => {
						order.push("channels");
					}),
					getChannels: vi.fn().mockReturnValue([]),
				},
				cronService: {
					start: vi.fn(),
					stop: vi.fn(() => order.push("cron")),
				},
				heartbeatService: {
					start: vi.fn(),
					stop: vi.fn(() => order.push("heartbeat")),
				},
			});

			const gw = new Gateway(opts);
			await gw.start();
			await gw.stop();

			expect(order).toEqual(["heartbeat", "cron", "channels", "adapter", "bus"]);
		});

		it("is idempotent — second call is no-op", async () => {
			const opts = createMockOptions();
			const gw = new Gateway(opts);

			await gw.start();
			await gw.stop();
			await gw.stop();

			expect(opts.bus.close).toHaveBeenCalledTimes(1);
			expect(opts.adapter.stop).toHaveBeenCalledTimes(1);
		});

		it("is safe to call before start", async () => {
			const opts = createMockOptions();
			const gw = new Gateway(opts);

			await gw.stop();

			expect(opts.bus.close).not.toHaveBeenCalled();
			expect(opts.adapter.stop).not.toHaveBeenCalled();
		});
	});

	describe("optional services", () => {
		it("starts without cron or heartbeat", async () => {
			const opts = createMockOptions();
			const gw = new Gateway(opts);

			await gw.start();

			expect(opts.adapter.start).toHaveBeenCalled();
			expect(opts.channelManager.startAll).toHaveBeenCalled();
		});

		it("stops without cron or heartbeat", async () => {
			const opts = createMockOptions();
			const gw = new Gateway(opts);

			await gw.start();
			await gw.stop();

			expect(opts.adapter.stop).toHaveBeenCalled();
			expect(opts.bus.close).toHaveBeenCalled();
		});
	});

	describe("isRunning", () => {
		it("is false before start", () => {
			const gw = new Gateway(createMockOptions());
			expect(gw.isRunning).toBe(false);
		});

		it("is true after start", async () => {
			const gw = new Gateway(createMockOptions());
			await gw.start();
			expect(gw.isRunning).toBe(true);
		});

		it("is false after stop", async () => {
			const gw = new Gateway(createMockOptions());
			await gw.start();
			await gw.stop();
			expect(gw.isRunning).toBe(false);
		});
	});

	describe("getActiveChannels", () => {
		it("returns channel names from channelManager", () => {
			const opts = createMockOptions({
				channelManager: {
					startAll: vi.fn().mockResolvedValue(undefined),
					stopAll: vi.fn().mockResolvedValue(undefined),
					getChannels: vi.fn().mockReturnValue([{ name: "terminal" }, { name: "telegram" }]),
				},
			});
			const gw = new Gateway(opts);
			expect(gw.getActiveChannels()).toEqual(["terminal", "telegram"]);
		});

		it("returns empty array when no channels registered", () => {
			const gw = new Gateway(createMockOptions());
			expect(gw.getActiveChannels()).toEqual([]);
		});
	});
});
