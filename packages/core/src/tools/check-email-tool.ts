import { z } from "zod";
import type { Tool } from "./types.js";

export interface CheckEmailToolOptions {
	host: string;
	port: number;
	auth: { user: string; pass: string };
	tls?: boolean;
	mailbox?: string;
}

export class CheckEmailTool implements Tool {
	readonly name = "check_email";
	readonly description =
		"Check for unread emails in the inbox. Returns a summary of unread messages including sender, subject, date, and a preview of the body.";
	readonly parameters = z.object({
		limit: z
			.number()
			.int()
			.min(1)
			.max(20)
			.optional()
			.describe("Maximum number of unread emails to return (default 10)"),
	});

	private readonly imapConfig: CheckEmailToolOptions;

	constructor(options: CheckEmailToolOptions) {
		this.imapConfig = options;
	}

	async execute(params: Record<string, unknown>): Promise<string> {
		const { limit } = params as { limit?: number };
		const maxResults = limit ?? 10;

		if (!this.imapConfig.host) {
			return "Error: No IMAP host configured. Set channels.email.imap.host in config.";
		}

		try {
			const { ImapFlow } = await import("imapflow");
			const client = new ImapFlow({
				host: this.imapConfig.host,
				port: this.imapConfig.port,
				secure: this.imapConfig.tls ?? true,
				auth: {
					user: this.imapConfig.auth.user,
					pass: this.imapConfig.auth.pass,
				},
				logger: false,
			});

			await client.connect();
			const lock = await client.getMailboxLock(this.imapConfig.mailbox ?? "INBOX");

			try {
				const messages: string[] = [];
				let count = 0;

				const fetched = client.fetch({ seen: false }, { envelope: true, source: true });

				for await (const msg of fetched) {
					if (count >= maxResults) break;

					const envelope = msg.envelope;
					if (!envelope) continue;

					const from = envelope.from?.[0];
					const fromStr = from?.name
						? `${from.name} <${from.address}>`
						: (from?.address ?? "unknown");
					const subject = envelope.subject ?? "(no subject)";
					const date = envelope.date
						? envelope.date.toISOString().slice(0, 16).replace("T", " ")
						: "unknown";

					let preview = "";
					if (msg.source) {
						preview = extractPreview(msg.source.toString("utf-8"), 200);
					}

					const entry = [
						`${count + 1}. From: ${fromStr}`,
						`   Subject: ${subject}`,
						`   Date: ${date}`,
					];
					if (preview) {
						entry.push(`   Preview: ${preview}`);
					}
					messages.push(entry.join("\n"));
					count++;
				}

				if (messages.length === 0) {
					return "No unread emails.";
				}

				return `${messages.length} unread email(s):\n\n${messages.join("\n\n")}`;
			} finally {
				lock.release();
				await client.logout();
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			return `Error: Failed to check email — ${message}`;
		}
	}
}

function extractPreview(source: string, maxLength: number): string {
	let body = "";

	const boundaryMatch = source.match(/Content-Type:\s*multipart\/\w+;\s*boundary="?([^"\s;]+)"?/i);
	if (boundaryMatch?.[1]) {
		const parts = source.split(`--${boundaryMatch[1]}`);
		for (const part of parts) {
			if (/Content-Type:\s*text\/plain/i.test(part)) {
				body = extractPartBody(part);
				break;
			}
		}
	}

	if (!body) {
		const headerEnd = source.indexOf("\r\n\r\n");
		if (headerEnd !== -1) {
			body = source.slice(headerEnd + 4);
		} else {
			const headerEndLf = source.indexOf("\n\n");
			if (headerEndLf !== -1) {
				body = source.slice(headerEndLf + 2);
			}
		}
	}

	body = decodeBody(body, source);
	// Strip quoted replies
	const lines = body.split("\n");
	const cleaned: string[] = [];
	for (const line of lines) {
		if (/^On .+ wrote:\s*$/.test(line)) break;
		if (line.startsWith(">")) continue;
		cleaned.push(line);
	}

	const text = cleaned.join(" ").replace(/\s+/g, " ").trim();
	if (text.length <= maxLength) return text;
	return `${text.slice(0, maxLength)}...`;
}

function extractPartBody(part: string): string {
	const headerEnd = part.indexOf("\r\n\r\n");
	if (headerEnd !== -1) return decodeBody(part.slice(headerEnd + 4), part);
	const headerEndLf = part.indexOf("\n\n");
	if (headerEndLf !== -1) return decodeBody(part.slice(headerEndLf + 2), part);
	return part;
}

function decodeBody(body: string, headers: string): string {
	if (/Content-Transfer-Encoding:\s*quoted-printable/i.test(headers)) {
		return body
			.replace(/=\r?\n/g, "")
			.replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)));
	}
	if (/Content-Transfer-Encoding:\s*base64/i.test(headers)) {
		try {
			return Buffer.from(body.replace(/\s/g, ""), "base64").toString("utf-8");
		} catch {
			return body;
		}
	}
	return body;
}
