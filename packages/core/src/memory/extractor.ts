import type { LLMMessage, LLMProvider } from "../provider/types.js";
import { appendToExistingNote, formatDailyNote } from "./daily-note.js";
import { CompactionResultSchema, ExtractionResultSchema } from "./extraction-schema.js";
import { mergeExtraction, parseMemoryMarkdown, renderMemoryMarkdown } from "./memory-markdown.js";
import { performRollup } from "./rollup.js";
import type { MemoryStore } from "./types.js";

export interface MemoryExtractorOptions {
	provider: LLMProvider;
	memoryStore: MemoryStore;
	getHistory: (sessionKey: string) => LLMMessage[];
	idleMs?: number;
	maxAgeMs?: number;
	compactionThreshold?: number;
	enabled?: boolean;
	model?: string;
}

export function buildExtractionPrompt(currentMemory: string): string {
	return `You are a memory extraction assistant. Analyze the conversation above and extract structured information.

Current MEMORY.md content:
---
${currentMemory || "(empty)"}
---

Extract the following from the conversation:

1. **facts**: Personal details, projects, preferences, things the user wants remembered. Only include NEW facts not already in MEMORY.md.
2. **patterns**: Recurring behaviors or preferences observed. Only include NEW patterns.
3. **pending**: Follow-ups, reminders, things to circle back on. Only include NEW pending items.
4. **resolvedPending**: Any pending items from MEMORY.md that have been completed or are no longer relevant.
5. **observations**: Notable observations from this conversation for the daily note, each with a priority:
   - "red": Important — decisions made, action items, explicit requests to remember, strong preferences
   - "yellow": Moderate — topics discussed, tasks worked on, notable context
   - "green": Minor — informational details, passing mentions

Set "skip" to true ONLY if the conversation is truly empty (just greetings with no substance).
Be concise — compress, don't transcribe.`;
}

function buildCompactionPrompt(currentMemory: string): string {
	return `You are a memory compaction assistant. The MEMORY.md file has grown too large and needs consolidation.

Current MEMORY.md content:
---
${currentMemory}
---

Consolidate the memory:
1. Merge duplicate or overlapping facts into single entries
2. Remove outdated or contradicted information (keep the newer version)
3. Combine related patterns
4. Remove pending items that appear resolved based on facts
5. Keep the same categories: facts, patterns, pending

Return the compacted version. Aim to reduce size by ~30% while preserving all important information.`;
}

export class MemoryExtractor {
	private readonly provider: LLMProvider;
	private readonly memoryStore: MemoryStore;
	private readonly getHistoryFn: (sessionKey: string) => LLMMessage[];
	private readonly idleMs: number;
	private readonly maxAgeMs: number;
	private readonly compactionThreshold: number;
	private readonly enabled: boolean;
	private readonly model?: string;
	private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
	private readonly running = new Set<string>();
	private readonly lastExtraction = new Map<string, number>();

	constructor(options: MemoryExtractorOptions) {
		this.provider = options.provider;
		this.memoryStore = options.memoryStore;
		this.getHistoryFn = options.getHistory;
		this.idleMs = options.idleMs ?? 300_000;
		this.maxAgeMs = options.maxAgeMs ?? 1_800_000;
		this.compactionThreshold = options.compactionThreshold ?? 4000;
		this.enabled = options.enabled ?? true;
		this.model = options.model;
	}

	scheduleExtraction(sessionKey: string): void {
		if (!this.enabled) return;

		const existing = this.timers.get(sessionKey);
		if (existing !== undefined) {
			clearTimeout(existing);
		}

		const timer = setTimeout(() => {
			this.timers.delete(sessionKey);
			void this.extract(sessionKey);
		}, this.idleMs);

		this.timers.set(sessionKey, timer);

		// Check max-age: force extraction if it's been too long
		const lastTime = this.lastExtraction.get(sessionKey);
		if (lastTime !== undefined && Date.now() - lastTime >= this.maxAgeMs) {
			clearTimeout(timer);
			this.timers.delete(sessionKey);
			void this.extract(sessionKey);
		}
	}

	async dispose(): Promise<void> {
		// Clear all idle timers
		for (const timer of this.timers.values()) {
			clearTimeout(timer);
		}

		// Collect sessions that have pending timers (not yet extracted)
		const pendingSessions = [...this.timers.keys()];
		this.timers.clear();

		// Force-extract all pending sessions with a timeout
		if (pendingSessions.length > 0) {
			const extractPromises = pendingSessions.map((key) => this.extract(key));
			await Promise.race([
				Promise.allSettled(extractPromises),
				new Promise((resolve) => setTimeout(resolve, 10_000)),
			]);
		}
	}

	private async extract(sessionKey: string): Promise<void> {
		if (this.running.has(sessionKey)) return;
		this.running.add(sessionKey);
		console.log(`[memory] extracting observations for ${sessionKey}...`);

		try {
			// 1. Get conversation history
			const history = this.getHistoryFn(sessionKey);
			const textMessages = history
				.filter((m) => (m.role === "user" || m.role === "assistant") && m.content.trim())
				.slice(-50);

			if (textMessages.length === 0) {
				console.log(`[memory] extraction skipped for ${sessionKey} (no messages)`);
				return;
			}

			// 2. Read current MEMORY.md
			const currentMemory = await this.memoryStore.readMemoryFile();

			// 3. Call generateStructured for extraction
			const extractionPrompt = buildExtractionPrompt(currentMemory);
			const messages: LLMMessage[] = [
				{ role: "system", content: extractionPrompt },
				...textMessages,
			];

			const result = await this.provider.generateStructured({
				model: this.model,
				messages,
				schema: ExtractionResultSchema,
				schemaName: "ExtractionResult",
				schemaDescription: "Structured memory extraction from conversation",
				temperature: 0.3,
			});

			const extraction = result.object;

			// 4. Check skip
			if (
				extraction.skip &&
				extraction.facts.length === 0 &&
				extraction.observations.length === 0
			) {
				console.log(`[memory] extraction skipped for ${sessionKey} (nothing new)`);
				this.lastExtraction.set(sessionKey, Date.now());
				return;
			}

			// 5. Deterministic merge into MEMORY.md
			const parsed = parseMemoryMarkdown(currentMemory);
			const merged = mergeExtraction(parsed, extraction);
			const rendered = renderMemoryMarkdown(merged);
			await this.memoryStore.writeMemoryFile(rendered);

			// 6. Create/update daily note if observations exist
			if (extraction.observations.length > 0) {
				const today = new Date().toISOString().slice(0, 10);
				const existingNote = await this.memoryStore.readDailyNote();
				let noteContent: string;
				if (existingNote.trim()) {
					noteContent = appendToExistingNote(existingNote, sessionKey, extraction.observations);
				} else {
					noteContent = formatDailyNote(today, sessionKey, extraction.observations);
				}
				await this.memoryStore.writeDailyNote(noteContent);
			}

			// 7. Perform rollup (promote old daily note 🔴 items)
			try {
				const rollupResult = await performRollup(this.memoryStore);
				if (rollupResult.promotedCount > 0) {
					console.log(
						`[memory] rollup promoted ${rollupResult.promotedCount} item(s), deleted ${rollupResult.deletedNotes.length} note(s)`,
					);
				}
			} catch (err) {
				console.warn("[memory] rollup failed:", err);
			}

			// 8. Compaction if MEMORY.md is too large
			const updatedMemory = await this.memoryStore.readMemoryFile();
			if (updatedMemory.length > this.compactionThreshold) {
				try {
					await this.compact(updatedMemory);
				} catch (err) {
					console.warn("[memory] compaction failed:", err);
				}
			}

			// 9. Cleanup old notes
			await this.cleanupOldNotes();

			this.lastExtraction.set(sessionKey, Date.now());

			const factCount = extraction.facts.length;
			const obsCount = extraction.observations.length;
			console.log(
				`[memory] extraction complete for ${sessionKey} (${factCount} fact(s), ${obsCount} observation(s))`,
			);
		} catch (err) {
			console.error(`[memory] extraction failed for ${sessionKey}:`, err);
		} finally {
			this.running.delete(sessionKey);
		}
	}

	private async compact(currentContent: string): Promise<void> {
		const prompt = buildCompactionPrompt(currentContent);
		const result = await this.provider.generateStructured({
			model: this.model,
			messages: [{ role: "user", content: prompt }],
			schema: CompactionResultSchema,
			schemaName: "CompactionResult",
			schemaDescription: "Compacted memory content",
			temperature: 0.2,
		});

		const compacted = result.object;
		const rendered = renderMemoryMarkdown({
			facts: compacted.facts,
			patterns: compacted.patterns,
			pending: compacted.pending,
		});
		await this.memoryStore.writeMemoryFile(rendered);
		console.log("[memory] compaction complete");
	}

	private async cleanupOldNotes(): Promise<void> {
		try {
			const notes = await this.memoryStore.listDailyNotes();
			const cutoff = new Date();
			cutoff.setDate(cutoff.getDate() - 30);
			const cutoffStr = cutoff.toISOString().slice(0, 10);

			for (const note of notes) {
				const dateStr = note.slice(0, 10);
				if (dateStr < cutoffStr) {
					const date = new Date(`${dateStr}T00:00:00Z`);
					await this.memoryStore.deleteDailyNote(date);
				}
			}
		} catch {
			// Best-effort cleanup — swallow errors
		}
	}
}
