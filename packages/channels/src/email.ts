import { createInboundMessage } from "@featherbot/bus";
import type { OutboundMessage } from "@featherbot/bus";
import { ImapFlow } from "imapflow";
import type { MailboxLockObject } from "imapflow";
import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { BaseChannel } from "./base.js";
import { deriveThreadId, markdownToHtml, stripQuotedReply } from "./email-format.js";
import type { ChannelOptions } from "./types.js";

interface ImapConfig {
	host: string;
	port: number;
	auth: { user: string; pass: string };
	tls?: boolean;
}

interface SmtpConfig {
	host: string;
	port: number;
	auth: { user: string; pass: string };
	tls?: boolean;
}

export interface EmailChannelOptions extends ChannelOptions {
	imap: ImapConfig;
	smtp: SmtpConfig;
	mailbox?: string;
	pollInterval?: number;
}

export class EmailChannel extends BaseChannel {
	readonly name = "email";

	private readonly imapConfig: ImapConfig;
	private readonly smtpConfig: SmtpConfig;
	private readonly mailboxName: string;
	private readonly pollInterval: number;

	private imapClient: ImapFlow | undefined;
	private smtpTransport: Transporter | undefined;
	private pollTimer: ReturnType<typeof setInterval> | undefined;
	private stopping = false;

	constructor(options: EmailChannelOptions) {
		super(options);
		this.imapConfig = options.imap;
		this.smtpConfig = options.smtp;
		this.mailboxName = options.mailbox ?? "INBOX";
		this.pollInterval = options.pollInterval ?? 60000;
	}

	async start(): Promise<void> {
		this.stopping = false;

		// Set up SMTP transporter
		this.smtpTransport = nodemailer.createTransport({
			host: this.smtpConfig.host,
			port: this.smtpConfig.port,
			secure: this.smtpConfig.tls ?? this.smtpConfig.port === 465,
			auth: {
				user: this.smtpConfig.auth.user,
				pass: this.smtpConfig.auth.pass,
			},
		});

		// Connect IMAP and start listening
		await this.connectImap();
	}

	async stop(): Promise<void> {
		this.stopping = true;

		if (this.pollTimer) {
			clearInterval(this.pollTimer);
			this.pollTimer = undefined;
		}

		if (this.imapClient) {
			try {
				await this.imapClient.logout();
			} catch {
				// Ignore logout errors during shutdown
			}
			this.imapClient = undefined;
		}

		if (this.smtpTransport) {
			this.smtpTransport.close();
			this.smtpTransport = undefined;
		}
	}

	async send(message: OutboundMessage): Promise<void> {
		if (!this.smtpTransport) return;

		const metadata = message.metadata as {
			emailMessageId?: string;
			subject?: string;
			from?: string;
			inReplyTo?: string;
			references?: string;
		};

		const to = metadata.from ?? message.chatId.replace(/^email:/, "");
		const subject = metadata.subject
			? metadata.subject.startsWith("Re:")
				? metadata.subject
				: `Re: ${metadata.subject}`
			: "Re: (no subject)";

		const headers: Record<string, string> = {};
		if (metadata.emailMessageId) {
			headers["In-Reply-To"] = metadata.emailMessageId;
			const existingRefs = metadata.references ?? "";
			headers.References = existingRefs
				? `${existingRefs} ${metadata.emailMessageId}`
				: metadata.emailMessageId;
		}

		const html = markdownToHtml(message.content);

		try {
			await this.smtpTransport.sendMail({
				from: this.smtpConfig.auth.user,
				to,
				subject,
				text: message.content,
				html,
				headers,
			});
		} catch (err) {
			console.error("Email send error:", err);
		}
	}

	private async connectImap(): Promise<void> {
		if (this.stopping) return;

		this.imapClient = new ImapFlow({
			host: this.imapConfig.host,
			port: this.imapConfig.port,
			secure: this.imapConfig.tls ?? true,
			auth: {
				user: this.imapConfig.auth.user,
				pass: this.imapConfig.auth.pass,
			},
			logger: false,
		});

		this.imapClient.on("error", (err: Error) => {
			console.error("IMAP error:", err.message);
			this.scheduleReconnect();
		});

		this.imapClient.on("close", () => {
			if (!this.stopping) {
				console.warn("IMAP connection closed, reconnecting...");
				this.scheduleReconnect();
			}
		});

		try {
			await this.imapClient.connect();
			console.log("Email IMAP connected");
			await this.startIdleLoop();
		} catch (err) {
			console.error("IMAP connect error:", err);
			this.scheduleReconnect();
		}
	}

	private async startIdleLoop(): Promise<void> {
		const client = this.imapClient;
		if (!client || this.stopping) return;

		let lock: MailboxLockObject;
		try {
			lock = await client.getMailboxLock(this.mailboxName);
		} catch (err) {
			console.error("IMAP mailbox lock error:", err);
			this.scheduleReconnect();
			return;
		}

		try {
			// Fetch any unseen messages already in the mailbox
			await this.fetchUnseen(client);

			// Listen for new mail via exists event
			client.on("exists", async () => {
				try {
					await this.fetchUnseen(client);
				} catch (err) {
					console.error("IMAP fetch error on exists:", err);
				}
			});

			// Start IDLE — this keeps the connection alive and waits for server notifications.
			// ImapFlow handles IDLE internally when the connection is open and locked.
			// We set up a poll timer as a fallback in case IDLE notifications are missed.
			if (this.pollTimer) clearInterval(this.pollTimer);
			this.pollTimer = setInterval(async () => {
				if (this.stopping) return;
				try {
					await this.fetchUnseen(client);
				} catch (err) {
					console.error("IMAP poll error:", err);
				}
			}, this.pollInterval);
		} catch (err) {
			console.error("IMAP idle loop error:", err);
			lock.release();
			this.scheduleReconnect();
		}
	}

	private async fetchUnseen(client: ImapFlow): Promise<void> {
		const messages = client.fetch(
			{ seen: false },
			{
				envelope: true,
				source: true,
				uid: true,
			},
		);

		for await (const msg of messages) {
			try {
				const envelope = msg.envelope;
				if (!envelope) continue;

				const from = envelope.from?.[0]?.address ?? "unknown";
				const senderId = `email:${from}`;
				const messageId = envelope.messageId ?? "";
				const inReplyTo = envelope.inReplyTo ?? undefined;
				const subject = envelope.subject ?? "(no subject)";

				// Extract references from raw source
				let references: string | undefined;
				if (msg.source) {
					const sourceStr = msg.source.toString("utf-8");
					const refMatch = sourceStr.match(/^References:\s*(.+?)(?:\r?\n(?!\s))/ms);
					if (refMatch?.[1]) {
						references = refMatch[1].replace(/\s+/g, " ").trim();
					}
				}

				const threadId = deriveThreadId({
					messageId,
					inReplyTo,
					references,
				});
				const chatId = `email:${threadId}`;

				// Extract plain text body from source
				let body = "";
				if (msg.source) {
					body = extractTextBody(msg.source.toString("utf-8"));
				}
				const content = stripQuotedReply(body);

				if (!content.trim()) continue;

				const to =
					envelope.to
						?.map((a) => a.address)
						.filter(Boolean)
						.join(", ") ?? "";

				const inbound = createInboundMessage({
					channel: "email",
					senderId,
					chatId,
					content,
					media: [],
					metadata: {
						emailMessageId: messageId,
						subject,
						from,
						to,
						inReplyTo,
						references,
					},
				});

				await this.publishInbound(inbound);

				// Mark as seen
				try {
					await client.messageFlagsAdd({ uid: msg.uid }, ["\\Seen"], { uid: true });
				} catch (flagErr) {
					console.error("IMAP flag error:", flagErr);
				}
			} catch (err) {
				console.error("Email message processing error:", err);
			}
		}
	}

	private scheduleReconnect(): void {
		if (this.stopping) return;
		if (this.pollTimer) {
			clearInterval(this.pollTimer);
			this.pollTimer = undefined;
		}
		setTimeout(() => {
			if (!this.stopping) {
				this.connectImap().catch((err) => {
					console.error("IMAP reconnect failed:", err);
				});
			}
		}, 5000);
	}
}

/**
 * Extract the plain text body from a raw email source.
 * Handles simple single-part and multipart/alternative messages.
 */
function extractTextBody(source: string): string {
	// Check for multipart boundary
	const boundaryMatch = source.match(/Content-Type:\s*multipart\/\w+;\s*boundary="?([^"\s;]+)"?/i);
	if (boundaryMatch?.[1]) {
		const boundary = boundaryMatch[1];
		const parts = source.split(`--${boundary}`);
		for (const part of parts) {
			if (/Content-Type:\s*text\/plain/i.test(part)) {
				return extractPartBody(part);
			}
		}
		// Fallback: try to get any text part
		for (const part of parts) {
			if (/Content-Type:\s*text\/html/i.test(part)) {
				// Strip HTML tags as a rough fallback
				return extractPartBody(part).replace(/<[^>]+>/g, "");
			}
		}
	}

	// Simple single-part message: body is after the first blank line
	const headerEnd = source.indexOf("\r\n\r\n");
	if (headerEnd !== -1) {
		return decodeBody(source.slice(headerEnd + 4), source);
	}
	const headerEndLf = source.indexOf("\n\n");
	if (headerEndLf !== -1) {
		return decodeBody(source.slice(headerEndLf + 2), source);
	}

	return source;
}

function extractPartBody(part: string): string {
	const headerEnd = part.indexOf("\r\n\r\n");
	if (headerEnd !== -1) {
		return decodeBody(part.slice(headerEnd + 4), part);
	}
	const headerEndLf = part.indexOf("\n\n");
	if (headerEndLf !== -1) {
		return decodeBody(part.slice(headerEndLf + 2), part);
	}
	return part;
}

function decodeBody(body: string, headers: string): string {
	// Handle quoted-printable encoding
	if (/Content-Transfer-Encoding:\s*quoted-printable/i.test(headers)) {
		return body
			.replace(/=\r?\n/g, "")
			.replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)));
	}
	// Handle base64 encoding
	if (/Content-Transfer-Encoding:\s*base64/i.test(headers)) {
		try {
			return Buffer.from(body.replace(/\s/g, ""), "base64").toString("utf-8");
		} catch {
			return body;
		}
	}
	return body;
}
