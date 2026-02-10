import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { performRollup } from "./rollup.js";
import type { MemoryStore } from "./types.js";

function createMockStore(overrides?: Partial<MemoryStore>): MemoryStore {
	return {
		getMemoryContext: vi.fn().mockResolvedValue(""),
		getRecentMemories: vi.fn().mockResolvedValue(""),
		getMemoryFilePath: vi.fn().mockReturnValue("/workspace/memory/MEMORY.md"),
		getDailyNotePath: vi.fn().mockReturnValue("/workspace/memory/today.md"),
		readMemoryFile: vi.fn().mockResolvedValue(""),
		writeMemoryFile: vi.fn().mockResolvedValue(undefined),
		readDailyNote: vi.fn().mockResolvedValue(""),
		writeDailyNote: vi.fn().mockResolvedValue(undefined),
		deleteDailyNote: vi.fn().mockResolvedValue(undefined),
		listDailyNotes: vi.fn().mockResolvedValue([]),
		...overrides,
	};
}

describe("performRollup", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-02-11T12:00:00Z"));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("promotes 🔴 items from old daily notes to MEMORY.md Facts", async () => {
		const store = createMockStore({
			readDailyNote: vi.fn().mockImplementation(async (date?: Date) => {
				const ds = date?.toISOString().slice(0, 10);
				if (ds === "2026-02-10") {
					return "# 2026-02-10\n\n## session\n- 🔴 Important decision made\n- 🟡 Moderate thing\n";
				}
				return "";
			}),
			readMemoryFile: vi
				.fn()
				.mockResolvedValue(
					"## Facts\n- Existing fact\n\n## Observed Patterns\n- (no entries yet)\n\n## Pending\n- (no entries yet)\n",
				),
		});

		const result = await performRollup(store);

		expect(result.promotedCount).toBe(1);
		expect(store.writeMemoryFile).toHaveBeenCalledTimes(1);
		const written = (store.writeMemoryFile as ReturnType<typeof vi.fn>).mock
			.calls[0]?.[0] as string;
		expect(written).toContain("- Existing fact");
		expect(written).toContain("- Important decision made");
	});

	it("deletes processed daily notes", async () => {
		const store = createMockStore({
			readDailyNote: vi.fn().mockImplementation(async (date?: Date) => {
				const ds = date?.toISOString().slice(0, 10);
				if (ds === "2026-02-10" || ds === "2026-02-09") {
					return `# ${ds}\n\n## session\n- 🟢 Minor note\n`;
				}
				return "";
			}),
		});

		const result = await performRollup(store);

		expect(result.deletedNotes).toContain("2026-02-10");
		expect(result.deletedNotes).toContain("2026-02-09");
		expect(store.deleteDailyNote).toHaveBeenCalledTimes(2);
	});

	it("deduplicates when promoting items already in MEMORY.md", async () => {
		const store = createMockStore({
			readDailyNote: vi.fn().mockImplementation(async (date?: Date) => {
				const ds = date?.toISOString().slice(0, 10);
				if (ds === "2026-02-10") {
					return "# 2026-02-10\n\n## session\n- 🔴 Existing fact\n";
				}
				return "";
			}),
			readMemoryFile: vi
				.fn()
				.mockResolvedValue(
					"## Facts\n- Existing fact\n\n## Observed Patterns\n- (no entries yet)\n\n## Pending\n- (no entries yet)\n",
				),
		});

		const result = await performRollup(store);

		expect(result.promotedCount).toBe(0);
		// Should not write if nothing was promoted
		expect(store.writeMemoryFile).not.toHaveBeenCalled();
	});

	it("handles missing daily notes gracefully", async () => {
		const store = createMockStore();

		const result = await performRollup(store);

		expect(result.promotedCount).toBe(0);
		expect(result.deletedNotes).toEqual([]);
		expect(store.writeMemoryFile).not.toHaveBeenCalled();
		expect(store.deleteDailyNote).not.toHaveBeenCalled();
	});

	it("handles missing MEMORY.md (creates from scratch)", async () => {
		const store = createMockStore({
			readDailyNote: vi.fn().mockImplementation(async (date?: Date) => {
				const ds = date?.toISOString().slice(0, 10);
				if (ds === "2026-02-10") {
					return "# 2026-02-10\n\n## session\n- 🔴 Brand new fact\n";
				}
				return "";
			}),
			readMemoryFile: vi.fn().mockResolvedValue(""),
		});

		const result = await performRollup(store);

		expect(result.promotedCount).toBe(1);
		const written = (store.writeMemoryFile as ReturnType<typeof vi.fn>).mock
			.calls[0]?.[0] as string;
		expect(written).toContain("- Brand new fact");
	});
});
