import type Database from "better-sqlite3";
import type { SessionKey } from "../types.js";

export interface SessionRecord {
	id: string;
	channel: string;
	chatId: string;
	createdAt: string;
	updatedAt: string;
}

interface SessionRow {
	id: string;
	channel: string;
	chat_id: string;
	created_at: string;
	updated_at: string;
}

function parseSessionKey(sessionKey: SessionKey): { channel: string; chatId: string } {
	const idx = sessionKey.indexOf(":");
	return {
		channel: sessionKey.slice(0, idx),
		chatId: sessionKey.slice(idx + 1),
	};
}

function rowToRecord(row: SessionRow): SessionRecord {
	return {
		id: row.id,
		channel: row.channel,
		chatId: row.chat_id,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

export class SessionStore {
	private readonly stmtGet: Database.Statement;
	private readonly stmtInsert: Database.Statement;
	private readonly stmtTouch: Database.Statement;
	private readonly stmtList: Database.Statement;
	private readonly stmtDelete: Database.Statement;

	constructor(db: Database.Database) {
		this.stmtGet = db.prepare("SELECT * FROM sessions WHERE id = ?");
		this.stmtInsert = db.prepare(
			"INSERT OR IGNORE INTO sessions (id, channel, chat_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
		);
		this.stmtTouch = db.prepare("UPDATE sessions SET updated_at = ? WHERE id = ?");
		this.stmtList = db.prepare("SELECT * FROM sessions ORDER BY updated_at DESC");
		this.stmtDelete = db.prepare("DELETE FROM sessions WHERE id = ?");
	}

	getOrCreate(sessionKey: SessionKey): SessionRecord {
		const { channel, chatId } = parseSessionKey(sessionKey);
		const now = new Date().toISOString();
		this.stmtInsert.run(sessionKey, channel, chatId, now, now);
		const row = this.stmtGet.get(sessionKey) as SessionRow;
		return rowToRecord(row);
	}

	get(sessionKey: SessionKey): SessionRecord | null {
		const row = this.stmtGet.get(sessionKey) as SessionRow | undefined;
		if (row === undefined) {
			return null;
		}
		return rowToRecord(row);
	}

	touch(sessionKey: SessionKey): void {
		const now = new Date().toISOString();
		this.stmtTouch.run(now, sessionKey);
	}

	list(): SessionRecord[] {
		const rows = this.stmtList.all() as SessionRow[];
		return rows.map(rowToRecord);
	}

	delete(sessionKey: SessionKey): void {
		this.stmtDelete.run(sessionKey);
	}
}
