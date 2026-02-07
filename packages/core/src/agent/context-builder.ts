import { readFile } from "node:fs/promises";
import { platform } from "node:os";
import { join } from "node:path";
import type { MemoryStore } from "../memory/types.js";

export interface SessionContext {
	channelName?: string;
	chatId?: string;
}

export interface ContextBuilderOptions {
	workspacePath: string;
	bootstrapFiles: string[];
	agentName: string;
	memoryStore?: MemoryStore;
}

export interface ContextBuilderResult {
	systemPrompt: string;
}

export class ContextBuilder {
	readonly workspacePath: string;
	readonly bootstrapFiles: string[];
	readonly agentName: string;
	readonly memoryStore?: MemoryStore;

	constructor(options: ContextBuilderOptions) {
		this.workspacePath = options.workspacePath;
		this.bootstrapFiles = options.bootstrapFiles;
		this.agentName = options.agentName;
		this.memoryStore = options.memoryStore;
	}

	async build(sessionContext?: SessionContext): Promise<ContextBuilderResult> {
		const sections: string[] = [];
		sections.push(this.buildIdentityBlock());

		const bootstrapSections = await this.loadBootstrapFiles();
		for (const section of bootstrapSections) {
			sections.push(section);
		}

		const memorySection = await this.buildMemorySection();
		if (memorySection) {
			sections.push(memorySection);
		}

		const sessionSection = this.buildSessionSection(sessionContext);
		if (sessionSection) {
			sections.push(sessionSection);
		}

		return { systemPrompt: sections.join("\n\n") };
	}

	private buildIdentityBlock(): string {
		const lines = [
			"## Identity",
			`Name: ${this.agentName}`,
			`Timestamp: ${new Date().toISOString()}`,
			`Node.js: ${process.version}`,
			`Platform: ${platform()}`,
			`Workspace: ${this.workspacePath}`,
		];
		return lines.join("\n");
	}

	private async buildMemorySection(): Promise<string | null> {
		if (this.memoryStore === undefined) {
			return null;
		}
		const context = await this.memoryStore.getMemoryContext();
		const trimmed = context.trim();
		if (!trimmed) {
			return null;
		}
		return `## Memory\n${trimmed}`;
	}

	private buildSessionSection(sessionContext?: SessionContext): string | null {
		if (sessionContext === undefined) {
			return null;
		}
		const lines: string[] = [];
		if (sessionContext.channelName) {
			lines.push(`Channel: ${sessionContext.channelName}`);
		}
		if (sessionContext.chatId) {
			lines.push(`Chat ID: ${sessionContext.chatId}`);
		}
		if (lines.length === 0) {
			return null;
		}
		return `## Session\n${lines.join("\n")}`;
	}

	private async loadBootstrapFiles(): Promise<string[]> {
		const sections: string[] = [];
		for (const filename of this.bootstrapFiles) {
			const filePath = join(this.workspacePath, filename);
			const content = (await this.readFileSafe(filePath)).trim();
			if (content) {
				sections.push(`## ${filename}\n${content}`);
			}
		}
		return sections;
	}

	private async readFileSafe(filePath: string): Promise<string> {
		try {
			return await readFile(filePath, "utf-8");
		} catch (err: unknown) {
			if (err !== null && typeof err === "object" && "code" in err && err.code === "ENOENT") {
				return "";
			}
			throw err;
		}
	}
}
