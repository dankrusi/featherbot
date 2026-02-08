import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildHeartbeatPrompt } from "./heartbeat-prompt.js";

describe("buildHeartbeatPrompt", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-02-09T14:30:00Z")); // Monday
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("includes current timestamp", () => {
		const prompt = buildHeartbeatPrompt("test content");
		expect(prompt).toContain("2026-02-09T14:30:00.000Z");
	});

	it("includes day of week", () => {
		const prompt = buildHeartbeatPrompt("test content");
		expect(prompt).toContain("Monday");
	});

	it("includes heartbeat file content", () => {
		const content = "## Tasks\n- [ ] Check email\n- [ ] Review calendar";
		const prompt = buildHeartbeatPrompt(content);
		expect(prompt).toContain(content);
	});

	it("includes SKIP instruction", () => {
		const prompt = buildHeartbeatPrompt("test");
		expect(prompt).toContain("SKIP");
	});
});
