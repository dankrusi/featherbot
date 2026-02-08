export type SubagentStatus = "running" | "completed" | "failed";

export interface SubagentState {
	id: string;
	task: string;
	status: SubagentStatus;
	result?: string;
	error?: string;
	startedAt: Date;
	completedAt?: Date;
	originChannel: string;
	originChatId: string;
}

export interface SpawnOptions {
	task: string;
	originChannel: string;
	originChatId: string;
}
