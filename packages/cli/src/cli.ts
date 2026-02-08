import { Command } from "commander";
import { registerAgent } from "./commands/agent.js";
import { registerGateway } from "./commands/gateway.js";
import { registerOnboard } from "./commands/onboard.js";
import { registerStart, runStart } from "./commands/start.js";
import { registerStatus } from "./commands/status.js";
import { registerWhatsApp } from "./commands/whatsapp.js";
import { VERSION } from "./index.js";

export const program = new Command();

program.name("featherbot").version(VERSION).description("FeatherBot — personal AI agent");

registerOnboard(program);
registerAgent(program);
registerStatus(program);
registerGateway(program);
registerWhatsApp(program);
registerStart(program);

// Default action: bare `featherbot` with no subcommand runs start
program.action(async () => {
	await runStart();
});
