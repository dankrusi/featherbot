import { readFileSync } from "node:fs";

export interface HeartbeatServiceOptions {
	intervalMs: number;
	heartbeatFilePath: string;
	onTick: (content: string) => Promise<void>;
}

export class HeartbeatService {
	private readonly intervalMs: number;
	private readonly heartbeatFilePath: string;
	private readonly onTick: (content: string) => Promise<void>;
	private timer: ReturnType<typeof setInterval> | null = null;
	private processing = false;

	constructor(options: HeartbeatServiceOptions) {
		this.intervalMs = options.intervalMs;
		this.heartbeatFilePath = options.heartbeatFilePath;
		this.onTick = options.onTick;
	}

	start(): void {
		this.timer = setInterval(() => {
			this.tick();
		}, this.intervalMs);
	}

	stop(): void {
		if (this.timer !== null) {
			clearInterval(this.timer);
			this.timer = null;
		}
	}

	private tick(): void {
		if (this.processing) {
			return;
		}

		let content: string;
		try {
			content = readFileSync(this.heartbeatFilePath, "utf-8");
		} catch {
			return;
		}

		if (content.trim() === "") {
			return;
		}

		this.processing = true;
		this.onTick(content)
			.catch(() => {})
			.finally(() => {
				this.processing = false;
			});
	}
}
