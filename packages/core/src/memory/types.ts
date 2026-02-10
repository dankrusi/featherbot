export interface MemoryStore {
	getMemoryContext(): Promise<string>;
	getRecentMemories(days?: number): Promise<string>;
	getMemoryFilePath(): string;
	getDailyNotePath(date?: Date): string;
	readMemoryFile(): Promise<string>;
	writeMemoryFile(content: string): Promise<void>;
	readDailyNote(date?: Date): Promise<string>;
	writeDailyNote(content: string, date?: Date): Promise<void>;
	deleteDailyNote(date: Date): Promise<void>;
	listDailyNotes(): Promise<string[]>;
}
