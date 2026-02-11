import { z } from "zod";
import type { Tool } from "./types.js";

export interface SendEmailToolOptions {
	host: string;
	port: number;
	auth: { user: string; pass: string };
	tls?: boolean;
}

export class SendEmailTool implements Tool {
	readonly name = "send_email";
	readonly description =
		"Send an email to a recipient. Supports plain text and simple markdown formatting. Use this to proactively send emails when asked.";
	readonly parameters = z.object({
		to: z.string().describe("Recipient email address"),
		subject: z.string().describe("Email subject line"),
		body: z
			.string()
			.describe("Email body text (supports markdown: **bold**, *italic*, `code`, lists)"),
	});

	private readonly smtpConfig: SendEmailToolOptions;

	constructor(options: SendEmailToolOptions) {
		this.smtpConfig = options;
	}

	async execute(params: Record<string, unknown>): Promise<string> {
		const { to, subject, body } = params as {
			to: string;
			subject: string;
			body: string;
		};

		if (!this.smtpConfig.host) {
			return "Error: No SMTP host configured. Set channels.email.smtp.host in config.";
		}

		try {
			const nodemailer = await import("nodemailer");
			const transport = nodemailer.default.createTransport({
				host: this.smtpConfig.host,
				port: this.smtpConfig.port,
				secure: this.smtpConfig.tls ?? this.smtpConfig.port === 465,
				auth: {
					user: this.smtpConfig.auth.user,
					pass: this.smtpConfig.auth.pass,
				},
			});

			const html = markdownToSimpleHtml(body);

			await transport.sendMail({
				from: this.smtpConfig.auth.user,
				to,
				subject,
				text: body,
				html,
			});

			transport.close();
			return `Email sent to ${to} with subject "${subject}"`;
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			return `Error: Failed to send email — ${message}`;
		}
	}
}

function escapeHtml(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

function markdownToSimpleHtml(text: string): string {
	const paragraphs = text.split(/\n\n+/);
	const parts: string[] = [];

	for (const para of paragraphs) {
		const trimmed = para.trim();
		if (!trimmed) continue;

		const lines = trimmed.split("\n");
		const isList = lines.every((l) => /^\s*[-*]\s/.test(l) || l.trim() === "");
		if (isList) {
			const items = lines
				.filter((l) => /^\s*[-*]\s/.test(l))
				.map((l) => `<li>${formatInline(l.replace(/^\s*[-*]\s+/, ""))}</li>`)
				.join("");
			parts.push(`<ul>${items}</ul>`);
			continue;
		}

		parts.push(`<p>${formatInline(trimmed.replace(/\n/g, "<br>"))}</p>`);
	}

	return parts.join("");
}

function formatInline(text: string): string {
	let result = escapeHtml(text);
	result = result.replace(/`([^`]+)`/g, "<code>$1</code>");
	result = result.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
	result = result.replace(/\*(.+?)\*/g, "<em>$1</em>");
	result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
	return result;
}
