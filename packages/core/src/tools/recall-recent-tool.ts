import { z } from "zod";
import type { MemoryStore } from "../memory/types.js";
import type { Tool } from "./types.js";

export interface RecallRecentToolOptions {
	memoryStore: MemoryStore;
}

export class RecallRecentTool implements Tool {
	readonly name = "recall_recent";
	readonly description =
		"Retrieve daily notes from recent days. Use this to recall what happened in past sessions without bloating the main context.";
	readonly parameters = z.object({
		days: z
			.number()
			.int()
			.min(1)
			.max(30)
			.optional()
			.describe("Number of past days to retrieve (default 7, max 30)"),
	});

	private readonly memoryStore: MemoryStore;

	constructor(options: RecallRecentToolOptions) {
		this.memoryStore = options.memoryStore;
	}

	async execute(params: Record<string, unknown>): Promise<string> {
		const days = (params.days as number | undefined) ?? 7;
		const content = await this.memoryStore.getRecentMemories(days);
		if (!content.trim()) {
			return `No daily notes found in the last ${days} day(s).`;
		}
		return content;
	}
}
