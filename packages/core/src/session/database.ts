import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import Database from "better-sqlite3";

function resolveHome(path: string): string {
	return path.startsWith("~") ? join(homedir(), path.slice(1)) : path;
}

function getSchemaVersion(db: Database.Database): number {
	const tableExists = db
		.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='_meta'")
		.get();
	if (!tableExists) return 0;

	const row = db.prepare("SELECT schema_version FROM _meta").get() as
		| { schema_version: number }
		| undefined;
	return row?.schema_version ?? 0;
}

function migrate(db: Database.Database): void {
	const version = getSchemaVersion(db);

	if (version < 1) {
		db.exec(`
			CREATE TABLE IF NOT EXISTS sessions (
				id TEXT PRIMARY KEY,
				channel TEXT NOT NULL,
				chat_id TEXT NOT NULL,
				created_at TEXT NOT NULL,
				updated_at TEXT NOT NULL
			);

			CREATE TABLE IF NOT EXISTS messages (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
				role TEXT NOT NULL,
				content TEXT NOT NULL,
				tool_call_id TEXT,
				created_at TEXT NOT NULL
			);

			CREATE INDEX IF NOT EXISTS idx_messages_session_created
			ON messages(session_id, created_at);

			UPDATE _meta SET schema_version = 1;
		`);
	}

	// Future migrations:
	// if (version < 2) { db.exec(`ALTER TABLE ...`); db.exec(`UPDATE _meta SET schema_version = 2`); }
}

export function initDatabase(dbPath: string): Database.Database {
	const resolved = resolveHome(dbPath);
	mkdirSync(dirname(resolved), { recursive: true });
	const db = new Database(resolved);

	db.pragma("journal_mode = WAL");
	db.pragma("foreign_keys = ON");

	db.exec(`
		CREATE TABLE IF NOT EXISTS _meta (
			schema_version INTEGER NOT NULL
		);

		INSERT INTO _meta (schema_version)
		SELECT 0
		WHERE NOT EXISTS (SELECT 1 FROM _meta);
	`);

	const runMigrations = db.transaction(() => {
		migrate(db);
	});
	runMigrations();

	return db;
}
