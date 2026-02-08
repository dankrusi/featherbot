import { describe, expect, it, vi } from "vitest";
import type { SubagentState } from "../agent/subagent-types.js";
import type { SubagentManager } from "../agent/subagent.js";
import { SpawnTool, SubagentStatusTool } from "./spawn-tool.js";
import type { SpawnToolOriginContext } from "./spawn-tool.js";

function makeMockManager(overrides?: Partial<SubagentManager>): SubagentManager {
	return {
		spawn: vi.fn(() => "mock-task-id"),
		getState: vi.fn(() => undefined),
		listActive: vi.fn(() => []),
		listAll: vi.fn(() => []),
		...overrides,
	} as unknown as SubagentManager;
}

function makeOriginContext(): SpawnToolOriginContext {
	return { channel: "telegram", chatId: "123" };
}

function makeState(overrides?: Partial<SubagentState>): SubagentState {
	return {
		id: "test-id",
		task: "test task",
		status: "running",
		startedAt: new Date("2026-01-01T00:00:00Z"),
		originChannel: "telegram",
		originChatId: "123",
		...overrides,
	};
}

describe("SpawnTool", () => {
	it("execute with valid task returns success message containing task ID", async () => {
		const manager = makeMockManager();
		const tool = new SpawnTool(manager, makeOriginContext());

		const result = await tool.execute({ task: "do something" });

		expect(result).toContain("mock-task-id");
		expect(result).toContain("Sub-agent spawned successfully");
		expect(result).toContain("do something");
	});

	it("execute passes origin context to SubagentManager", async () => {
		const spawnSpy = vi.fn(() => "id-1");
		const manager = makeMockManager({ spawn: spawnSpy } as unknown as Partial<SubagentManager>);
		const context = { channel: "whatsapp", chatId: "456" };
		const tool = new SpawnTool(manager, context);

		await tool.execute({ task: "my task" });

		expect(spawnSpy).toHaveBeenCalledWith({
			task: "my task",
			originChannel: "whatsapp",
			originChatId: "456",
		});
	});

	it("parameters schema validates task as required string", () => {
		const tool = new SpawnTool(makeMockManager(), makeOriginContext());

		const validResult = tool.parameters.safeParse({ task: "hello" });
		expect(validResult.success).toBe(true);

		const invalidResult = tool.parameters.safeParse({});
		expect(invalidResult.success).toBe(false);

		const wrongType = tool.parameters.safeParse({ task: 123 });
		expect(wrongType.success).toBe(false);
	});
});

describe("SubagentStatusTool", () => {
	it("execute with specific ID returns that sub-agent status", async () => {
		const state = makeState({
			id: "abc-123",
			task: "research topic",
			status: "completed",
			result: "Found the answer",
			completedAt: new Date("2026-01-01T00:05:00Z"),
		});
		const manager = makeMockManager({
			getState: vi.fn(() => state),
		} as unknown as Partial<SubagentManager>);

		const tool = new SubagentStatusTool(manager);
		const result = await tool.execute({ id: "abc-123" });

		expect(result).toContain("abc-123");
		expect(result).toContain("research topic");
		expect(result).toContain("completed");
		expect(result).toContain("Found the answer");
	});

	it("execute without ID returns list of active sub-agents", async () => {
		const active = [
			makeState({ id: "id-1", task: "task one" }),
			makeState({ id: "id-2", task: "task two" }),
		];
		const manager = makeMockManager({
			listActive: vi.fn(() => active),
		} as unknown as Partial<SubagentManager>);

		const tool = new SubagentStatusTool(manager);
		const result = await tool.execute({});

		expect(result).toContain("Active sub-agents");
		expect(result).toContain("id-1");
		expect(result).toContain("task one");
		expect(result).toContain("id-2");
		expect(result).toContain("task two");
	});

	it("returns 'No active sub-agents' when none running", async () => {
		const manager = makeMockManager();
		const tool = new SubagentStatusTool(manager);

		const result = await tool.execute({});
		expect(result).toBe("No active sub-agents.");
	});

	it("returns not found for unknown ID", async () => {
		const manager = makeMockManager();
		const tool = new SubagentStatusTool(manager);

		const result = await tool.execute({ id: "nonexistent" });
		expect(result).toContain("No sub-agent found");
		expect(result).toContain("nonexistent");
	});
});
