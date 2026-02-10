import type { ExtractionResult } from "./extraction-schema.js";

const PRIORITY_EMOJI: Record<string, string> = {
	red: "🔴",
	yellow: "🟡",
	green: "🟢",
};

export function formatDailyNote(
	date: string,
	sessionKey: string,
	observations: ExtractionResult["observations"],
): string {
	const lines = [`# ${date}`, "", `## ${sessionKey}`];
	for (const obs of observations) {
		lines.push(`- ${PRIORITY_EMOJI[obs.priority]} ${obs.text}`);
	}
	return `${lines.join("\n")}\n`;
}

export function appendToExistingNote(
	existingContent: string,
	sessionKey: string,
	observations: ExtractionResult["observations"],
): string {
	const sessionHeader = `## ${sessionKey}`;
	const bulletLines = observations.map((obs) => `- ${PRIORITY_EMOJI[obs.priority]} ${obs.text}`);
	const newSection = `${sessionHeader}\n${bulletLines.join("\n")}`;

	const lines = existingContent.split("\n");
	const headerIdx = lines.findIndex((l) => l.trim() === sessionHeader);

	if (headerIdx === -1) {
		// Append new section
		const trimmed = existingContent.trimEnd();
		return `${trimmed}\n\n${newSection}\n`;
	}

	// Find the end of the existing section (next ## header or end of file)
	let endIdx = lines.length;
	for (let i = headerIdx + 1; i < lines.length; i++) {
		if (lines[i]?.match(/^##\s/)) {
			endIdx = i;
			break;
		}
	}

	// Replace the section
	const before = lines.slice(0, headerIdx);
	const after = lines.slice(endIdx);
	const result = [...before, newSection, ...after];
	return `${result.join("\n").trimEnd()}\n`;
}

export function extractImportantItems(noteContent: string): string[] {
	const items: string[] = [];
	const lines = noteContent.split("\n");
	for (const line of lines) {
		const trimmed = line.trim();
		if (trimmed.startsWith("- 🔴")) {
			const text = trimmed.slice(4).trim();
			if (text) {
				items.push(text);
			}
		}
	}
	return items;
}
