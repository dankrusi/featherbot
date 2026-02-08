import { z } from "zod";
import type { SubagentManager } from "../agent/subagent.js";
import type { Tool } from "./types.js";

export interface SpawnToolOriginContext {
	channel: string;
	chatId: string;
}

export class SpawnTool implements Tool {
	readonly name = "spawn";
	readonly description =
		"Spawn a background sub-agent to handle a task asynchronously. The sub-agent has access to exec, read_file, write_file, edit_file, and list_dir tools. Results are delivered back to the originating channel when complete.";
	readonly parameters = z.object({
		task: z.string().describe("The task description for the sub-agent to execute"),
	});

	private readonly manager: SubagentManager;
	private readonly originContext: SpawnToolOriginContext;

	constructor(manager: SubagentManager, originContext: SpawnToolOriginContext) {
		this.manager = manager;
		this.originContext = originContext;
	}

	async execute(params: Record<string, unknown>): Promise<string> {
		const p = params as z.infer<typeof this.parameters>;
		try {
			const id = this.manager.spawn({
				task: p.task,
				originChannel: this.originContext.channel,
				originChatId: this.originContext.chatId,
			});
			return `Sub-agent spawned successfully. Task ID: ${id}\nTask: ${p.task}\nResults will be delivered when complete.`;
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			return `Error spawning sub-agent: ${message}`;
		}
	}
}

export class SubagentStatusTool implements Tool {
	readonly name = "subagent_status";
	readonly description =
		"Check the status of background sub-agents. Provide an ID to check a specific sub-agent, or omit to list all active sub-agents.";
	readonly parameters = z.object({
		id: z.string().optional().describe("Specific sub-agent task ID to check"),
	});

	private readonly manager: SubagentManager;

	constructor(manager: SubagentManager) {
		this.manager = manager;
	}

	async execute(params: Record<string, unknown>): Promise<string> {
		const p = params as z.infer<typeof this.parameters>;

		if (p.id !== undefined) {
			const state = this.manager.getState(p.id);
			if (state === undefined) {
				return `No sub-agent found with ID: ${p.id}`;
			}
			let result = `Sub-agent ${state.id}:\n  Task: ${state.task}\n  Status: ${state.status}\n  Started: ${state.startedAt.toISOString()}`;
			if (state.completedAt !== undefined) {
				result += `\n  Completed: ${state.completedAt.toISOString()}`;
			}
			if (state.result !== undefined) {
				result += `\n  Result: ${state.result}`;
			}
			if (state.error !== undefined) {
				result += `\n  Error: ${state.error}`;
			}
			return result;
		}

		const active = this.manager.listActive();
		if (active.length === 0) {
			return "No active sub-agents.";
		}

		const lines: string[] = [];
		for (const state of active) {
			lines.push(
				`- ${state.id}: ${state.task} (${state.status}, started ${state.startedAt.toISOString()})`,
			);
		}
		return `Active sub-agents:\n${lines.join("\n")}`;
	}
}
