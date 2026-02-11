/**
 * Derive the root thread message-id for use as chatId.
 * Walks the References header (oldest first) or falls back to In-Reply-To,
 * then the message's own Message-ID.
 */
export function deriveThreadId(headers: {
	messageId: string;
	inReplyTo?: string;
	references?: string;
}): string {
	if (headers.references) {
		const first = headers.references.trim().split(/\s+/)[0];
		if (first) return first;
	}
	if (headers.inReplyTo) return headers.inReplyTo;
	return headers.messageId;
}

/**
 * Strip quoted reply text from an email body.
 * Removes "On ... wrote:" attribution lines and `>` quoted blocks.
 */
export function stripQuotedReply(text: string): string {
	const lines = text.split("\n");
	const result: string[] = [];

	for (const line of lines) {
		// Stop at "On ... wrote:" attribution line
		if (/^On .+ wrote:\s*$/.test(line)) break;
		// Skip lines starting with >
		if (line.startsWith(">")) continue;
		result.push(line);
	}

	return result.join("\n").trim();
}

/**
 * Convert simple markdown to HTML for email bodies.
 * Handles: bold, italic, code blocks, inline code, links, unordered lists, paragraphs.
 */
export function markdownToHtml(text: string): string {
	const segments: string[] = [];
	let remaining = text;

	while (remaining.length > 0) {
		const codeBlockIdx = remaining.indexOf("```");
		if (codeBlockIdx === -1) {
			segments.push(inlineMarkdownToHtml(remaining));
			break;
		}

		// Process text before the code block
		if (codeBlockIdx > 0) {
			segments.push(inlineMarkdownToHtml(remaining.slice(0, codeBlockIdx)));
		}

		const closingIdx = remaining.indexOf("```", codeBlockIdx + 3);
		if (closingIdx === -1) {
			// No closing — treat rest as code block
			const code = escapeHtml(remaining.slice(codeBlockIdx + 3));
			segments.push(`<pre><code>${code}</code></pre>`);
			remaining = "";
		} else {
			let code = remaining.slice(codeBlockIdx + 3, closingIdx);
			// Strip optional language identifier on first line
			const newlineIdx = code.indexOf("\n");
			if (newlineIdx !== -1) {
				code = code.slice(newlineIdx + 1);
			}
			segments.push(`<pre><code>${escapeHtml(code)}</code></pre>`);
			remaining = remaining.slice(closingIdx + 3);
		}
	}

	return segments.join("");
}

function escapeHtml(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

function inlineMarkdownToHtml(text: string): string {
	// Process paragraph by paragraph
	const paragraphs = text.split(/\n\n+/);
	const htmlParts: string[] = [];

	for (const para of paragraphs) {
		const trimmed = para.trim();
		if (!trimmed) continue;

		// Check if this is a list block (all lines start with - or *)
		const lines = trimmed.split("\n");
		const isList = lines.every((l) => /^\s*[-*]\s/.test(l) || l.trim() === "");
		if (isList) {
			const items = lines
				.filter((l) => /^\s*[-*]\s/.test(l))
				.map((l) => `<li>${formatInline(l.replace(/^\s*[-*]\s+/, ""))}</li>`)
				.join("");
			htmlParts.push(`<ul>${items}</ul>`);
			continue;
		}

		htmlParts.push(`<p>${formatInline(trimmed.replace(/\n/g, "<br>"))}</p>`);
	}

	return htmlParts.join("");
}

function formatInline(text: string): string {
	let result = escapeHtml(text);
	// Inline code (before bold/italic to avoid conflicts)
	result = result.replace(/`([^`]+)`/g, "<code>$1</code>");
	// Bold **text**
	result = result.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
	// Italic *text*
	result = result.replace(/\*(.+?)\*/g, "<em>$1</em>");
	// Links [text](url)
	result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
	return result;
}
