import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SessionKey } from "../types.js";
import { initDatabase } from "./database.js";
import { SessionStore } from "./session-store.js";

describe("SessionStore", () => {
	let tempDir: string;
	let store: SessionStore;
	let db: ReturnType<typeof initDatabase>;

	beforeEach(async () => {
		tempDir = await realpath(await mkdtemp(join(tmpdir(), "featherbot-session-")));
		db = initDatabase(join(tempDir, "test.db"));
		store = new SessionStore(db);
	});

	afterEach(async () => {
		db.close();
		await rm(tempDir, { recursive: true, force: true });
	});

	describe("getOrCreate", () => {
		it("creates a new session", () => {
			const key: SessionKey = "telegram:12345";
			const record = store.getOrCreate(key);

			expect(record.id).toBe("telegram:12345");
			expect(record.channel).toBe("telegram");
			expect(record.chatId).toBe("12345");
			expect(record.createdAt).toBeTruthy();
			expect(record.updatedAt).toBeTruthy();
		});

		it("returns existing session on second call", () => {
			const key: SessionKey = "telegram:12345";
			const first = store.getOrCreate(key);
			const second = store.getOrCreate(key);

			expect(second.id).toBe(first.id);
			expect(second.createdAt).toBe(first.createdAt);
		});
	});

	describe("get", () => {
		it("returns null for missing session", () => {
			const result = store.get("nonexistent:key");
			expect(result).toBeNull();
		});

		it("returns existing session", () => {
			store.getOrCreate("telegram:12345");
			const result = store.get("telegram:12345");

			expect(result).not.toBeNull();
			expect(result?.channel).toBe("telegram");
			expect(result?.chatId).toBe("12345");
		});
	});

	describe("touch", () => {
		it("updates the updated_at timestamp", async () => {
			const key: SessionKey = "telegram:12345";
			const original = store.getOrCreate(key);

			// Small delay to ensure timestamp differs
			await new Promise((resolve) => setTimeout(resolve, 10));

			store.touch(key);
			const updated = store.get(key);

			expect(updated).not.toBeNull();
			expect(updated?.createdAt).toBe(original.createdAt);
			expect(updated?.updatedAt).not.toBe(original.updatedAt);
		});
	});

	describe("list", () => {
		it("returns sessions ordered by updated_at DESC", async () => {
			store.getOrCreate("telegram:aaa");
			await new Promise((resolve) => setTimeout(resolve, 10));
			store.getOrCreate("whatsapp:bbb");
			await new Promise((resolve) => setTimeout(resolve, 10));
			store.getOrCreate("discord:ccc");

			const sessions = store.list();
			expect(sessions).toHaveLength(3);
			expect(sessions[0]?.id).toBe("discord:ccc");
			expect(sessions[1]?.id).toBe("whatsapp:bbb");
			expect(sessions[2]?.id).toBe("telegram:aaa");
		});

		it("returns empty array when no sessions", () => {
			const sessions = store.list();
			expect(sessions).toHaveLength(0);
		});
	});

	describe("delete", () => {
		it("removes session", () => {
			store.getOrCreate("telegram:12345");
			store.delete("telegram:12345");

			expect(store.get("telegram:12345")).toBeNull();
		});

		it("cascades to messages", () => {
			const key: SessionKey = "telegram:12345";
			store.getOrCreate(key);

			// Insert a message directly
			db.prepare(
				"INSERT INTO messages (session_id, role, content, created_at) VALUES (?, ?, ?, ?)",
			).run(key, "user", "hello", new Date().toISOString());

			const before = db
				.prepare("SELECT COUNT(*) as count FROM messages WHERE session_id = ?")
				.get(key) as {
				count: number;
			};
			expect(before.count).toBe(1);

			store.delete(key);

			const after = db
				.prepare("SELECT COUNT(*) as count FROM messages WHERE session_id = ?")
				.get(key) as {
				count: number;
			};
			expect(after.count).toBe(0);
		});
	});

	describe("parseSessionKey", () => {
		it("handles colons in chatId", () => {
			const key: SessionKey = "whatsapp:123:456";
			const record = store.getOrCreate(key);

			expect(record.channel).toBe("whatsapp");
			expect(record.chatId).toBe("123:456");
		});
	});
});
