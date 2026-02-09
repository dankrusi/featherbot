import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FileMemoryStore } from "../memory/file-store.js";
import { RecallRecentTool } from "./recall-recent-tool.js";

describe("RecallRecentTool", () => {
	let tempDir: string;
	let tool: RecallRecentTool;

	function dateStr(daysAgo: number): string {
		const d = new Date();
		d.setDate(d.getDate() - daysAgo);
		return d.toISOString().slice(0, 10);
	}

	beforeEach(async () => {
		tempDir = await realpath(await mkdtemp(join(tmpdir(), "recall-test-")));
		await mkdir(join(tempDir, "memory"), { recursive: true });
		const store = new FileMemoryStore(tempDir);
		tool = new RecallRecentTool({ memoryStore: store });
	});

	afterEach(async () => {
		await rm(tempDir, { recursive: true });
	});

	it("has correct name and description", () => {
		expect(tool.name).toBe("recall_recent");
		expect(tool.description).toContain("daily notes");
	});

	it("returns message when no daily notes exist", async () => {
		const result = await tool.execute({});
		expect(result).toContain("No daily notes found");
	});

	it("returns recent daily notes", async () => {
		await writeFile(join(tempDir, "memory", `${dateStr(0)}.md`), "today's stuff");
		await writeFile(join(tempDir, "memory", `${dateStr(1)}.md`), "yesterday's stuff");

		const result = await tool.execute({ days: 3 });
		expect(result).toContain("today's stuff");
		expect(result).toContain("yesterday's stuff");
	});

	it("defaults to 7 days when no days param", async () => {
		await writeFile(join(tempDir, "memory", `${dateStr(6)}.md`), "six days ago");
		const result = await tool.execute({});
		expect(result).toContain("six days ago");
	});

	it("respects days parameter", async () => {
		await writeFile(join(tempDir, "memory", `${dateStr(0)}.md`), "today");
		await writeFile(join(tempDir, "memory", `${dateStr(3)}.md`), "three days ago");

		const result = await tool.execute({ days: 2 });
		expect(result).toContain("today");
		expect(result).not.toContain("three days ago");
	});
});
