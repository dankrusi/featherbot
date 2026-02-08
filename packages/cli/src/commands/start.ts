import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { checkStartupConfig, loadConfig } from "@featherbot/core";
import type { Command } from "commander";
import { runRepl } from "./agent.js";
import { runGateway } from "./gateway.js";
import { runOnboard } from "./onboard.js";

export async function runStart(): Promise<void> {
	const configPath = resolve(homedir(), ".featherbot", "config.json");

	if (!existsSync(configPath)) {
		console.log("No config found. Let's set up FeatherBot first.\n");
		await runOnboard();
	}

	const config = loadConfig();

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

	const hasChannels = config.channels.telegram.enabled || config.channels.whatsapp.enabled;

	if (hasChannels) {
		await runGateway();
	} else {
		await runRepl();
	}
}

export function registerStart(cmd: Command): void {
	cmd
		.command("start")
		.description("Start the agent (auto-selects REPL or gateway)")
		.action(async () => {
			await runStart();
		});
}
