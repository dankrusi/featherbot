import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CronService } from "@featherbot/scheduler";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CronTool } from "./cron-tool.js";

describe("CronTool", () => {
	let tmpDir: string;
	let service: CronService;
	let tool: CronTool;

	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-02-08T10:00:00Z"));
		tmpDir = mkdtempSync(join(tmpdir(), "cron-tool-"));
		service = new CronService({
			storePath: join(tmpDir, "cron.json"),
			onJobFire: async () => {},
		});
		service.start();
		tool = new CronTool(service);
	});

	afterEach(() => {
		service.stop();
		vi.useRealTimers();
	});

	describe("add action", () => {
		it("creates a job with cronExpr", async () => {
			const result = await tool.execute({
				action: "add",
				name: "Morning weather",
				message: "Check weather",
				cronExpr: "0 9 * * *",
			});
			expect(result).toContain("Job created");
			expect(result).toContain("Morning weather");
			expect(service.listJobs()).toHaveLength(1);
			const job = service.listJobs()[0];
			expect(job?.schedule.kind).toBe("cron");
		});

		it("creates a job with everySeconds", async () => {
			const result = await tool.execute({
				action: "add",
				name: "Frequent check",
				message: "Check something",
				everySeconds: 300,
			});
			expect(result).toContain("Job created");
			expect(service.listJobs()).toHaveLength(1);
			const job = service.listJobs()[0];
			expect(job?.schedule.kind).toBe("every");
		});

		it("creates a one-time job with at", async () => {
			const result = await tool.execute({
				action: "add",
				name: "Reminder",
				message: "Do the thing",
				at: "2026-02-09T15:00:00Z",
			});
			expect(result).toContain("Job created");
			const job = service.listJobs()[0];
			expect(job?.schedule.kind).toBe("at");
			expect(job?.deleteAfterRun).toBe(true);
		});

		it("rejects when no schedule type provided", async () => {
			const result = await tool.execute({
				action: "add",
				name: "Bad job",
				message: "No schedule",
			});
			expect(result).toContain("Error");
			expect(result).toContain("exactly one");
		});

		it("rejects when multiple schedule types provided", async () => {
			const result = await tool.execute({
				action: "add",
				name: "Bad job",
				message: "Two schedules",
				cronExpr: "0 9 * * *",
				everySeconds: 300,
			});
			expect(result).toContain("Error");
			expect(result).toContain("exactly one");
		});

		it("rejects when name is missing", async () => {
			const result = await tool.execute({
				action: "add",
				message: "No name",
				cronExpr: "0 9 * * *",
			});
			expect(result).toContain("Error");
		});

		it("rejects when message is missing", async () => {
			const result = await tool.execute({
				action: "add",
				name: "No message",
				cronExpr: "0 9 * * *",
			});
			expect(result).toContain("Error");
		});
	});

	describe("list action", () => {
		it("returns 'No scheduled jobs' when empty", async () => {
			const result = await tool.execute({ action: "list" });
			expect(result).toBe("No scheduled jobs.");
		});

		it("returns formatted list with jobs", async () => {
			await tool.execute({
				action: "add",
				name: "Weather",
				message: "Check weather",
				cronExpr: "0 9 * * *",
			});
			const result = await tool.execute({ action: "list" });
			expect(result).toContain("Weather");
			expect(result).toContain("Schedule:");
			expect(result).toContain("enabled");
		});
	});

	describe("remove action", () => {
		it("removes existing job", async () => {
			await tool.execute({
				action: "add",
				name: "To remove",
				message: "test",
				everySeconds: 60,
			});
			const jobId = service.listJobs()[0]?.id;
			const result = await tool.execute({ action: "remove", jobId });
			expect(result).toContain("removed");
			expect(service.listJobs()).toHaveLength(0);
		});

		it("returns not found for non-existent job", async () => {
			const result = await tool.execute({
				action: "remove",
				jobId: "non-existent",
			});
			expect(result).toContain("not found");
		});

		it("returns error when jobId missing", async () => {
			const result = await tool.execute({ action: "remove" });
			expect(result).toContain("Error");
		});
	});

	describe("enable/disable actions", () => {
		it("disables a job", async () => {
			await tool.execute({
				action: "add",
				name: "Toggle me",
				message: "test",
				everySeconds: 60,
			});
			const jobId = service.listJobs()[0]?.id;
			const result = await tool.execute({ action: "disable", jobId });
			expect(result).toContain("disabled");
			expect(service.getJob(jobId as string)?.enabled).toBe(false);
		});

		it("enables a job", async () => {
			await tool.execute({
				action: "add",
				name: "Toggle me",
				message: "test",
				everySeconds: 60,
			});
			const jobId = service.listJobs()[0]?.id;
			await tool.execute({ action: "disable", jobId });
			const result = await tool.execute({ action: "enable", jobId });
			expect(result).toContain("enabled");
			expect(service.getJob(jobId as string)?.enabled).toBe(true);
		});

		it("returns not found for non-existent job", async () => {
			const result = await tool.execute({
				action: "enable",
				jobId: "missing",
			});
			expect(result).toContain("not found");
		});
	});

	describe("context injection", () => {
		it("injects channel and chatId into job payload", async () => {
			tool.setContext("telegram", "12345");
			await tool.execute({
				action: "add",
				name: "Contextual",
				message: "test",
				everySeconds: 60,
			});
			const job = service.listJobs()[0];
			expect(job?.payload.channel).toBe("telegram");
			expect(job?.payload.chatId).toBe("12345");
		});

		it("uses undefined context when not set", async () => {
			await tool.execute({
				action: "add",
				name: "No context",
				message: "test",
				everySeconds: 60,
			});
			const job = service.listJobs()[0];
			expect(job?.payload.channel).toBeUndefined();
			expect(job?.payload.chatId).toBeUndefined();
		});
	});

	describe("relativeMinutes", () => {
		it("creates an at job ~5 minutes in the future", async () => {
			const result = await tool.execute({
				action: "add",
				name: "Quick reminder",
				message: "Drink water",
				relativeMinutes: 5,
			});
			expect(result).toContain("Job created");
			const job = service.listJobs()[0];
			expect(job?.schedule.kind).toBe("at");
			if (job?.schedule.kind === "at") {
				const scheduledAt = new Date(job.schedule.at).getTime();
				const expected = new Date("2026-02-08T10:05:00Z").getTime();
				expect(Math.abs(scheduledAt - expected)).toBeLessThan(1000);
			}
			expect(job?.deleteAfterRun).toBe(true);
		});

		it("rejects when combined with other schedule types", async () => {
			const result = await tool.execute({
				action: "add",
				name: "Bad combo",
				message: "test",
				relativeMinutes: 5,
				cronExpr: "0 9 * * *",
			});
			expect(result).toContain("Error");
			expect(result).toContain("exactly one");
		});

		it("rejects when combined with at", async () => {
			const result = await tool.execute({
				action: "add",
				name: "Bad combo",
				message: "test",
				relativeMinutes: 5,
				at: "2026-02-09T15:00:00Z",
			});
			expect(result).toContain("Error");
			expect(result).toContain("exactly one");
		});
	});

	describe("timezone-aware formatting", () => {
		it("formats output times in local timezone when timezone is set", async () => {
			tool.setContext("telegram", "12345", "Asia/Kolkata");
			const result = await tool.execute({
				action: "add",
				name: "TZ test",
				message: "test",
				at: "2026-02-08T15:00:00Z",
			});
			expect(result).toContain("Job created");
			expect(result).not.toContain("2026-02-08T15:00:00.000Z");
			// Node uses "GMT+5:30" for Asia/Kolkata
			expect(result).toMatch(/GMT\+5:30|IST/);
		});

		it("formats list output in local timezone", async () => {
			tool.setContext("telegram", "12345", "Asia/Kolkata");
			await tool.execute({
				action: "add",
				name: "TZ list",
				message: "test",
				cronExpr: "0 9 * * *",
			});
			const result = await tool.execute({ action: "list" });
			expect(result).toContain("TZ list");
			expect(result).toMatch(/GMT\+5:30|IST/);
		});

		it("auto-applies timezone to cron expressions", async () => {
			tool.setContext("telegram", "12345", "Asia/Kolkata");
			await tool.execute({
				action: "add",
				name: "Auto TZ cron",
				message: "test",
				cronExpr: "0 9 * * *",
			});
			const job = service.listJobs()[0];
			expect(job?.schedule.kind).toBe("cron");
			if (job?.schedule.kind === "cron") {
				expect(job.schedule.timezone).toBe("Asia/Kolkata");
			}
		});

		it("explicit timezone overrides auto-applied timezone", async () => {
			tool.setContext("telegram", "12345", "Asia/Kolkata");
			await tool.execute({
				action: "add",
				name: "Override TZ",
				message: "test",
				cronExpr: "0 9 * * *",
				timezone: "America/New_York",
			});
			const job = service.listJobs()[0];
			if (job?.schedule.kind === "cron") {
				expect(job.schedule.timezone).toBe("America/New_York");
			}
		});

		it("falls back to ISO when no timezone is set", async () => {
			const result = await tool.execute({
				action: "add",
				name: "No TZ",
				message: "test",
				at: "2026-02-08T15:00:00Z",
			});
			expect(result).toContain("2026-02-08T15:00:00");
		});
	});

	describe("bare at timestamp handling", () => {
		it("interprets bare at timestamp in user timezone", async () => {
			tool.setContext("telegram", "12345", "Asia/Kolkata");
			await tool.execute({
				action: "add",
				name: "Bare at",
				message: "test",
				at: "2026-02-08T21:00:00",
			});
			const job = service.listJobs()[0];
			expect(job?.schedule.kind).toBe("at");
			if (job?.schedule.kind === "at") {
				// 21:00 IST = 15:30 UTC (IST is UTC+5:30)
				const d = new Date(job.schedule.at);
				expect(d.getUTCHours()).toBe(15);
				expect(d.getUTCMinutes()).toBe(30);
			}
		});

		it("does not modify at timestamp with Z suffix", async () => {
			tool.setContext("telegram", "12345", "Asia/Kolkata");
			await tool.execute({
				action: "add",
				name: "UTC at",
				message: "test",
				at: "2026-02-08T15:00:00Z",
			});
			const job = service.listJobs()[0];
			if (job?.schedule.kind === "at") {
				expect(job.schedule.at).toBe("2026-02-08T15:00:00Z");
			}
		});

		it("does not modify at timestamp with offset", async () => {
			tool.setContext("telegram", "12345", "Asia/Kolkata");
			await tool.execute({
				action: "add",
				name: "Offset at",
				message: "test",
				at: "2026-02-08T15:00:00+05:30",
			});
			const job = service.listJobs()[0];
			if (job?.schedule.kind === "at") {
				expect(job.schedule.at).toBe("2026-02-08T15:00:00+05:30");
			}
		});
	});
});
