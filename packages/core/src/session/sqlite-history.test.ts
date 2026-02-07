import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { initDatabase } from "./database.js";
import { SqliteHistory } from "./sqlite-history.js";

function seedSession(db: Database.Database, sessionId: string): void {
	db.prepare(
		"INSERT OR IGNORE INTO sessions (id, channel, chat_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
	).run(sessionId, "test", "123", new Date().toISOString(), new Date().toISOString());
}

describe("SqliteHistory", () => {
	let tempDir: string;
	let dbPath: string;
	let db: Database.Database;

	beforeEach(async () => {
		tempDir = await realpath(await mkdtemp(join(tmpdir(), "featherbot-hist-")));
		dbPath = join(tempDir, "test.db");
		db = initDatabase(dbPath);
		seedSession(db, "test:123");
	});

	afterEach(async () => {
		db.close();
		await rm(tempDir, { recursive: true, force: true });
	});

	it("add inserts a message and increments length", () => {
		const history = new SqliteHistory(db, "test:123");
		expect(history.length).toBe(0);

		history.add({ role: "user", content: "hello" });
		expect(history.length).toBe(1);

		history.add({ role: "assistant", content: "hi there" });
		expect(history.length).toBe(2);
	});

	it("getMessages returns messages in chronological order", () => {
		const history = new SqliteHistory(db, "test:123");
		history.add({ role: "user", content: "first" });
		history.add({ role: "assistant", content: "second" });
		history.add({ role: "user", content: "third" });

		const messages = history.getMessages();
		expect(messages).toHaveLength(3);
		expect(messages[0]?.content).toBe("first");
		expect(messages[1]?.content).toBe("second");
		expect(messages[2]?.content).toBe("third");
	});

	it("getMessages returns correct LLMMessage shape", () => {
		const history = new SqliteHistory(db, "test:123");
		history.add({ role: "user", content: "hello" });
		history.add({ role: "tool", content: "result", toolCallId: "call_123" });

		const messages = history.getMessages();
		expect(messages[0]).toEqual({ role: "user", content: "hello" });
		expect(messages[1]).toEqual({ role: "tool", content: "result", toolCallId: "call_123" });
	});

	it("getMessages omits toolCallId when null", () => {
		const history = new SqliteHistory(db, "test:123");
		history.add({ role: "user", content: "hello" });

		const messages = history.getMessages();
		expect(messages[0]).toEqual({ role: "user", content: "hello" });
		expect("toolCallId" in (messages[0] ?? {})).toBe(false);
	});

	it("clear removes all messages", () => {
		const history = new SqliteHistory(db, "test:123");
		history.add({ role: "user", content: "hello" });
		history.add({ role: "assistant", content: "hi" });
		expect(history.length).toBe(2);

		history.clear();
		expect(history.length).toBe(0);
		expect(history.getMessages()).toEqual([]);
	});

	it("trimming preserves system messages and drops oldest non-system", () => {
		const history = new SqliteHistory(db, "test:123", { maxMessages: 5 });

		history.add({ role: "system", content: "system prompt" });
		history.add({ role: "user", content: "msg1" });
		history.add({ role: "assistant", content: "msg2" });
		history.add({ role: "user", content: "msg3" });
		history.add({ role: "assistant", content: "msg4" });
		// At 5, no trim yet
		expect(history.length).toBe(5);

		// Adding 6th triggers trim
		history.add({ role: "user", content: "msg5" });
		expect(history.length).toBe(5);

		const messages = history.getMessages();
		// System message preserved
		expect(messages[0]?.role).toBe("system");
		expect(messages[0]?.content).toBe("system prompt");
		// Oldest non-system (msg1) was dropped
		expect(messages[1]?.content).toBe("msg2");
		expect(messages[4]?.content).toBe("msg5");
	});

	it("respects maxMessages configuration", () => {
		const history = new SqliteHistory(db, "test:123", { maxMessages: 3 });

		for (let i = 0; i < 10; i++) {
			history.add({ role: "user", content: `msg${i}` });
		}

		expect(history.length).toBe(3);
		const messages = history.getMessages();
		expect(messages[0]?.content).toBe("msg7");
		expect(messages[1]?.content).toBe("msg8");
		expect(messages[2]?.content).toBe("msg9");
	});

	it("messages survive database close and reopen", () => {
		const history = new SqliteHistory(db, "test:123");
		history.add({ role: "user", content: "persistent message" });
		history.add({ role: "assistant", content: "persistent reply" });
		db.close();

		const db2 = initDatabase(dbPath);
		const history2 = new SqliteHistory(db2, "test:123");
		expect(history2.length).toBe(2);

		const messages = history2.getMessages();
		expect(messages[0]?.content).toBe("persistent message");
		expect(messages[1]?.content).toBe("persistent reply");
		db2.close();

		// Reopen for afterEach cleanup
		db = initDatabase(dbPath);
	});

	it("isolates messages between sessions", () => {
		seedSession(db, "other:456");
		const h1 = new SqliteHistory(db, "test:123");
		const h2 = new SqliteHistory(db, "other:456");

		h1.add({ role: "user", content: "session 1" });
		h2.add({ role: "user", content: "session 2" });

		expect(h1.length).toBe(1);
		expect(h2.length).toBe(1);
		expect(h1.getMessages()[0]?.content).toBe("session 1");
		expect(h2.getMessages()[0]?.content).toBe("session 2");
	});
});
