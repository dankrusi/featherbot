import { existsSync } from "node:fs";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createHistory, createSessionStore } from "./index.js";

describe("session factories", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await realpath(await mkdtemp(join(tmpdir(), "featherbot-sess-idx-")));
	});

	afterEach(async () => {
		await rm(tempDir, { recursive: true, force: true });
	});

	it("createSessionStore returns a working SessionStore", () => {
		const dbPath = join(tempDir, "test.db");
		const store = createSessionStore(dbPath);

		const record = store.getOrCreate("telegram:123");
		expect(record.id).toBe("telegram:123");
		expect(record.channel).toBe("telegram");

		const fetched = store.get("telegram:123");
		expect(fetched).not.toBeNull();
	});

	it("createHistory returns a working SqliteHistory", () => {
		const dbPath = join(tempDir, "test.db");
		// createSessionStore first to seed the session row
		const store = createSessionStore(dbPath);
		store.getOrCreate("telegram:123");

		const history = createHistory(dbPath, "telegram:123");
		history.add({ role: "user", content: "hello" });
		expect(history.length).toBe(1);
		expect(history.getMessages()[0]?.content).toBe("hello");
	});

	it("factory creates database file at specified path", () => {
		const dbPath = join(tempDir, "new.db");
		expect(existsSync(dbPath)).toBe(false);

		createSessionStore(dbPath);
		expect(existsSync(dbPath)).toBe(true);
	});
});
