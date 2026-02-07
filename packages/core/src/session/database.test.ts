import { existsSync } from "node:fs";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { initDatabase } from "./database.js";

describe("initDatabase", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await realpath(await mkdtemp(join(tmpdir(), "featherbot-db-")));
	});

	afterEach(async () => {
		await rm(tempDir, { recursive: true, force: true });
	});

	it("creates database file on disk", () => {
		const dbPath = join(tempDir, "test.db");
		const db = initDatabase(dbPath);
		expect(existsSync(dbPath)).toBe(true);
		db.close();
	});

	it("creates all required tables", () => {
		const dbPath = join(tempDir, "test.db");
		const db = initDatabase(dbPath);

		const tables = db
			.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
			.all() as { name: string }[];
		const tableNames = tables.map((t) => t.name);

		expect(tableNames).toContain("_meta");
		expect(tableNames).toContain("sessions");
		expect(tableNames).toContain("messages");
		db.close();
	});

	it("sets schema version to 1", () => {
		const dbPath = join(tempDir, "test.db");
		const db = initDatabase(dbPath);

		const row = db.prepare("SELECT schema_version FROM _meta").get() as {
			schema_version: number;
		};
		expect(row.schema_version).toBe(1);
		db.close();
	});

	it("is idempotent — calling init twice does not error or duplicate data", () => {
		const dbPath = join(tempDir, "test.db");
		const db1 = initDatabase(dbPath);
		db1.close();

		const db2 = initDatabase(dbPath);
		const rows = db2.prepare("SELECT schema_version FROM _meta").all() as {
			schema_version: number;
		}[];
		expect(rows).toHaveLength(1);
		const row = rows[0];
		expect(row).toBeDefined();
		expect(row?.schema_version).toBe(1);
		db2.close();
	});

	it("enables WAL mode", () => {
		const dbPath = join(tempDir, "test.db");
		const db = initDatabase(dbPath);

		const row = db.prepare("PRAGMA journal_mode").get() as {
			journal_mode: string;
		};
		expect(row.journal_mode).toBe("wal");
		db.close();
	});

	it("enables foreign keys", () => {
		const dbPath = join(tempDir, "test.db");
		const db = initDatabase(dbPath);

		const row = db.prepare("PRAGMA foreign_keys").get() as {
			foreign_keys: number;
		};
		expect(row.foreign_keys).toBe(1);
		db.close();
	});

	it("creates index on messages(session_id, created_at)", () => {
		const dbPath = join(tempDir, "test.db");
		const db = initDatabase(dbPath);

		const indexes = db
			.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='messages'")
			.all() as { name: string }[];
		const indexNames = indexes.map((i) => i.name);

		expect(indexNames).toContain("idx_messages_session_created");
		db.close();
	});
});
