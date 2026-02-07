import type Database from "better-sqlite3";
import type { ConversationHistory } from "../agent/types.js";
import type { LLMMessage } from "../provider/types.js";

export class SqliteHistory implements ConversationHistory {
	private readonly maxMessages: number;
	private readonly stmtInsert: Database.Statement;
	private readonly stmtSelect: Database.Statement;
	private readonly stmtClear: Database.Statement;
	private readonly stmtCount: Database.Statement;
	private readonly stmtCountNonSystem: Database.Statement;
	private readonly stmtDeleteOldest: Database.Statement;

	constructor(
		db: Database.Database,
		private readonly sessionId: string,
		options?: { maxMessages?: number },
	) {
		this.maxMessages = options?.maxMessages ?? 50;

		this.stmtInsert = db.prepare(
			"INSERT INTO messages (session_id, role, content, tool_call_id, created_at) VALUES (?, ?, ?, ?, ?)",
		);
		this.stmtSelect = db.prepare(
			"SELECT role, content, tool_call_id FROM messages WHERE session_id = ? ORDER BY created_at ASC, id ASC",
		);
		this.stmtClear = db.prepare("DELETE FROM messages WHERE session_id = ?");
		this.stmtCount = db.prepare("SELECT COUNT(*) as count FROM messages WHERE session_id = ?");
		this.stmtCountNonSystem = db.prepare(
			"SELECT COUNT(*) as count FROM messages WHERE session_id = ? AND role != 'system'",
		);
		this.stmtDeleteOldest = db.prepare(
			"DELETE FROM messages WHERE id IN (SELECT id FROM messages WHERE session_id = ? AND role != 'system' ORDER BY created_at ASC, id ASC LIMIT ?)",
		);
	}

	add(message: LLMMessage): void {
		const now = new Date().toISOString();
		this.stmtInsert.run(
			this.sessionId,
			message.role,
			message.content,
			message.toolCallId ?? null,
			now,
		);
		this.trim();
	}

	getMessages(): LLMMessage[] {
		const rows = this.stmtSelect.all(this.sessionId) as {
			role: string;
			content: string;
			tool_call_id: string | null;
		}[];
		return rows.map((row) => {
			const msg: LLMMessage = {
				role: row.role as LLMMessage["role"],
				content: row.content,
			};
			if (row.tool_call_id !== null) {
				msg.toolCallId = row.tool_call_id;
			}
			return msg;
		});
	}

	clear(): void {
		this.stmtClear.run(this.sessionId);
	}

	get length(): number {
		const row = this.stmtCount.get(this.sessionId) as { count: number };
		return row.count;
	}

	private trim(): void {
		const total = this.length;
		if (total <= this.maxMessages) {
			return;
		}

		const nonSystemRow = this.stmtCountNonSystem.get(this.sessionId) as { count: number };
		const systemCount = total - nonSystemRow.count;
		const available = this.maxMessages - systemCount;
		const excess = nonSystemRow.count - available;

		if (excess > 0) {
			this.stmtDeleteOldest.run(this.sessionId, excess);
		}
	}
}
