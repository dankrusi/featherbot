type ProviderName = "anthropic" | "openai" | "openrouter";

interface DetectResult {
	provider: ProviderName | null;
}

interface ValidationResult {
	valid: boolean;
	error?: string;
}

const PREFIX_MAP: Array<{ prefix: string; provider: ProviderName }> = [
	{ prefix: "sk-ant-", provider: "anthropic" },
	{ prefix: "sk-or-", provider: "openrouter" },
	{ prefix: "sk-", provider: "openai" },
];

export function detectProvider(key: string): DetectResult {
	const trimmed = key.trim();
	for (const { prefix, provider } of PREFIX_MAP) {
		if (trimmed.startsWith(prefix)) {
			return { provider };
		}
	}
	return { provider: null };
}

const EXPECTED_PREFIXES: Record<ProviderName, string[]> = {
	anthropic: ["sk-ant-"],
	openai: ["sk-"],
	openrouter: ["sk-or-"],
};

export function validateApiKeyFormat(provider: ProviderName, key: string): ValidationResult {
	const trimmed = key.trim();
	if (!trimmed) {
		return { valid: false, error: "API key is empty" };
	}

	const prefixes = EXPECTED_PREFIXES[provider];
	if (!prefixes) {
		return { valid: true };
	}

	const matches = prefixes.some((p) => trimmed.startsWith(p));
	if (!matches) {
		return {
			valid: false,
			error: `Key does not match expected format for ${provider} (expected prefix: ${prefixes.join(" or ")})`,
		};
	}

	return { valid: true };
}
