import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { MessageBus } from "@featherbot/bus";
import { BusAdapter, ChannelManager, TerminalChannel } from "@featherbot/channels";
import {
	checkStartupConfig,
	createAgentLoop,
	createMemoryStore,
	createSkillsLoader,
	loadConfig,
} from "@featherbot/core";
import type { Command } from "commander";

function resolveHome(path: string): string {
	return path.startsWith("~") ? join(homedir(), path.slice(1)) : resolve(path);
}

function validateOrExit(config: ReturnType<typeof loadConfig>): void {
	const check = checkStartupConfig(config);
	for (const warning of check.warnings) {
		console.warn(`Warning: ${warning}`);
	}
	if (!check.ready) {
		for (const error of check.errors) {
			console.error(`Error: ${error}`);
		}
		process.exit(1);
	}
}

function createConfiguredLoop(config: ReturnType<typeof loadConfig>) {
	const workspace = resolveHome(config.agents.defaults.workspace);
	const memoryStore = createMemoryStore(workspace);
	const skillsLoader = createSkillsLoader({ workspacePath: workspace });
	return createAgentLoop(config, {
		workspacePath: workspace,
		memoryStore,
		skillsLoader,
	});
}

export async function runSingleShot(message: string): Promise<void> {
	const config = loadConfig();
	validateOrExit(config);
	const agentLoop = createConfiguredLoop(config);
	const result = await agentLoop.processDirect(message, {
		sessionKey: "cli:direct",
	});
	process.stdout.write(result.text);
}

export async function runRepl(): Promise<void> {
	const config = loadConfig();
	validateOrExit(config);
	const agentLoop = createConfiguredLoop(config);
	const bus = new MessageBus();
	const adapter = new BusAdapter({ bus, agentLoop });
	const channelManager = new ChannelManager({ bus });
	const terminal = new TerminalChannel({
		bus,
		onStop: () => {
			adapter.stop();
			bus.close();
			process.exit(0);
		},
	});

	channelManager.register(terminal);
	adapter.start();

	const model = config.agents.defaults.model;
	console.log(`\nFeatherBot (${model})`);
	console.log("Type 'exit' to quit.\n");

	await channelManager.startAll();

	const shutdown = () => {
		channelManager.stopAll().then(() => {
			adapter.stop();
			bus.close();
			process.exit(0);
		});
	};
	process.on("SIGINT", shutdown);
}

export function registerAgent(cmd: Command): void {
	cmd
		.command("agent")
		.description("Chat with the agent (REPL or single-shot)")
		.option("-m, --message <message>", "Send a single message and exit")
		.action(async (opts: { message?: string }) => {
			if (opts.message !== undefined) {
				try {
					await runSingleShot(opts.message);
				} catch (err) {
					const errorText = err instanceof Error ? err.message : String(err);
					process.stderr.write(`Error: ${errorText}\n`);
					process.exit(1);
				}
			} else {
				await runRepl();
			}
		});
}
