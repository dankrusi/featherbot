import { z } from "zod";

export const ExtractionResultSchema = z.object({
	skip: z.boolean(),
	facts: z.array(z.string()),
	patterns: z.array(z.string()),
	pending: z.array(z.string()),
	resolvedPending: z.array(z.string()),
	observations: z.array(
		z.object({
			text: z.string(),
			priority: z.enum(["red", "yellow", "green"]),
		}),
	),
});

export type ExtractionResult = z.infer<typeof ExtractionResultSchema>;

export const CompactionResultSchema = z.object({
	facts: z.array(z.string()),
	patterns: z.array(z.string()),
	pending: z.array(z.string()),
});

export type CompactionResult = z.infer<typeof CompactionResultSchema>;
