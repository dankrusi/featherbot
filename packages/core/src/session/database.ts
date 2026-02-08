import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import Database from "better-sqlite3";

function resolveHome(path: string): string {
	return path.startsWith("~") ? join(homedir(), path.slice(1)) : path;
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
		SELECT 1
		WHERE NOT EXISTS (SELECT 1 FROM _meta);

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
	`);

	return db;
}
