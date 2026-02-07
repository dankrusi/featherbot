import type { SessionKey } from "../types.js";
import { initDatabase } from "./database.js";
import { SessionStore } from "./session-store.js";
import { SqliteHistory } from "./sqlite-history.js";

export function createSessionStore(dbPath: string): SessionStore {
	const db = initDatabase(dbPath);
	return new SessionStore(db);
}

export function createHistory(
	dbPath: string,
	sessionKey: SessionKey,
	options?: { maxMessages?: number },
): SqliteHistory {
	const db = initDatabase(dbPath);
	return new SqliteHistory(db, sessionKey, options);
}

export { initDatabase } from "./database.js";
export { SessionStore } from "./session-store.js";
export type { SessionRecord } from "./session-store.js";
export { SqliteHistory } from "./sqlite-history.js";
