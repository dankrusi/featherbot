import Database from "better-sqlite3";

export function initDatabase(dbPath: string): Database.Database {
	const db = new Database(dbPath);

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
