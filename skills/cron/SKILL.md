---
name: cron
description: Schedule reminders and recurring tasks
metadata:
  featherbot:
    always: false
---

# Cron Scheduling Skill

You can schedule reminders and recurring tasks using the `cron` tool.

## Actions

### Add a job

Use `action: "add"` with a `name`, `message`, and exactly ONE schedule type:

- `cronExpr` — standard 5-field cron expression
- `everySeconds` — fixed interval in seconds
- `at` — ISO 8601 date-time for a one-time reminder (bare timestamps are interpreted in the user's timezone)
- `relativeMinutes` — minutes from now for a one-time reminder (system computes exact time)

### List jobs

Use `action: "list"` to show all scheduled jobs.

### Remove a job

Use `action: "remove"` with the `jobId`.

### Enable/Disable

Use `action: "enable"` or `action: "disable"` with the `jobId`.

## Schedule Type Guide

**Use `cronExpr`** for time-of-day or calendar-based schedules:
- `"0 9 * * *"` — every day at 9:00 AM
- `"0 9 * * 1-5"` — weekdays at 9:00 AM
- `"0 9 * * 0,6"` — weekends at 9:00 AM
- `"30 8 * * *"` — every day at 8:30 AM
- `"0 */2 * * *"` — every 2 hours
- `"0 0 1 * *"` — first day of every month at midnight
- `"0 18 * * 5"` — every Friday at 6:00 PM

**Use `everySeconds`** for simple fixed intervals:
- Every 5 minutes: `everySeconds: 300`
- Every 30 minutes: `everySeconds: 1800`
- Every hour: `everySeconds: 3600`
- Every 6 hours: `everySeconds: 21600`

**Use `relativeMinutes`** for "in X minutes/hours" reminders:
- "in 5 minutes": `relativeMinutes: 5`
- "in 2 hours": `relativeMinutes: 120`
- "in half an hour": `relativeMinutes: 30`

**IMPORTANT:** Always prefer `relativeMinutes` for relative time requests. Do NOT compute ISO timestamps yourself.

**Use `at`** for one-time reminders at a specific date/time:
- `at: "2026-02-09T15:00:00"` — once at Feb 9, 3:00 PM (interpreted in the user's timezone)

## Natural Language Mapping

| User says | Schedule |
|-----------|----------|
| "every morning at 9am" | `cronExpr: "0 9 * * *"` |
| "every weekday at 8:30am" | `cronExpr: "30 8 * * 1-5"` |
| "every hour" | `everySeconds: 3600` |
| "every 20 minutes" | `everySeconds: 1200` |
| "every Sunday at noon" | `cronExpr: "0 12 * * 0"` |
| "tomorrow at 3pm" | `at: "2026-02-09T15:00:00"` |
| "in 5 minutes" | `relativeMinutes: 5` |
| "in 2 hours" | `relativeMinutes: 120` |
| "in half an hour" | `relativeMinutes: 30` |
| "first of every month" | `cronExpr: "0 9 1 * *"` |

## Cron Expression Format

```
┌───────── minute (0-59)
│ ┌─────── hour (0-23)
│ │ ┌───── day of month (1-31)
│ │ │ ┌─── month (1-12)
│ │ │ │ ┌─ day of week (0-6, 0=Sunday)
│ │ │ │ │
* * * * *
```

## Timezone

The user's timezone is automatically applied from their profile. You do NOT need to pass `timezone` explicitly unless the user requests a different timezone.

If you do need to override:
- `timezone: "America/New_York"`
- `timezone: "Asia/Kolkata"`
- `timezone: "Europe/London"`

## Rules

- **Create ONLY what the user asks for.** If the user says "remind me in 5 minutes", create exactly ONE one-time reminder. Do NOT add extra recurring jobs, "helpful" follow-ups, or bonus reminders. One request = one job.
- **Ask before adding anything extra.** If you think a recurring reminder would be useful, ASK the user first — never create it silently.
- The `message` field is what the agent will process when the job fires. Write it as a task instruction (e.g., "Check the weather in Delhi and send me a summary") not just a label.
- One-time jobs (`at`, `relativeMinutes`) are automatically deleted after they fire.
- Use `list` to show the user their active jobs before adding duplicates.
