// Context-window utilization for the status line under the chat composer
// (self.chat context status line / conversation compaction epic).
//
// The whole readout is derived state: history tree + selected model + the
// pending draft go in, one immutable status object comes out. No stores, no
// effects — the component renders it, the tests exercise it directly, and
// nothing here can write back into chat state.

export type UsageProvenance = 'measured' | 'estimated' | 'unknown';

/** The subset of a chat message this module reads. Free-form on purpose —
 * history nodes are untyped JSON from the stored chat blob. */
interface ChainMessage {
	id: string;
	parentId?: string | null;
	role?: string;
	content?: unknown;
	usage?: {
		prompt_tokens?: number;
		completion_tokens?: number;
		total_tokens?: number;
	};
}

export interface ContextStatusInput {
	history: { messages: Record<string, ChainMessage>; currentId: string | null } | null | undefined;
	modelId?: string | null;
	/** The subset of the models store this module reads. */
	models: Array<{ id: string; context_length?: number }>;
	/** The composer's current draft — it will be part of the next request. */
	promptDraft?: string;
}

export interface TurnUsage {
	id: string;
	role: string;
	promptTokens: number | null;
	completionTokens: number | null;
}

export interface ContextStatus {
	/** ↑ — tokens of context the next request will carry: the last measured
	 * request's full footprint (prompt + completion ≈ the re-sent prefix),
	 * or a chars/4 estimate when nothing has been measured yet. */
	contextInUse: number;
	/** ↓ — cumulative tokens received: Σ completion_tokens over the chain's
	 * assistant messages. (Σ prompt_tokens is deliberately NOT shown: it
	 * double-counts the re-sent prefix every turn, grows O(n²), and matches
	 * neither the context bar nor anything a user can act on.) */
	totalReceived: number;
	/** The model's context window, or null when the backend didn't publish
	 * one (omitted-when-unknown per /api/models' contract) — the bar and the
	 * "of Nk" are hidden rather than invented. */
	contextLength: number | null;
	/** contextInUse / contextLength, or null when contextLength is unknown. */
	percent: number | null;
	/** Whether ↑ comes from a real usage trailer or a chars/4 guess. */
	provenance: UsageProvenance;
	/** Per-assistant-turn usage for the tooltip breakdown. */
	turns: TurnUsage[];
}

// The estimate divisor. There is no tokenizer in this client (deliberately —
// an exact count needs the loaded model's tokenizer on the GPU side), so the
// fallback is the industry rule of thumb. The backend's own refusal floor
// (self.ai utils/tokenization.py) divides by 16 to UNDERSTATE; a status line
// must instead be roughly right, and 4 is the conventional middle.
const CHARS_PER_TOKEN_ESTIMATE = 4;

export function estimateTokens(text: string): number {
	return Math.ceil((text ?? '').length / CHARS_PER_TOKEN_ESTIMATE);
}

/** 18943 -> "18.9k"; 943 -> "943". Status-line compact form. */
export function formatTokens(n: number): string {
	if (!Number.isFinite(n)) return '0';
	if (n < 1000) return String(Math.round(n));
	if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
	return `${(n / 1_000_000).toFixed(1)}M`;
}

/** A 10-block utilization bar, e.g. 0.59 -> "▓▓▓▓▓▓░░░░". */
export function contextBar(percent: number): string {
	const clamped = Math.max(0, Math.min(1, percent));
	const filled = Math.round(clamped * 10);
	return '▓'.repeat(filled) + '░'.repeat(10 - filled);
}

/** Walk the active branch root-first, mirroring createMessagesList
 * (Chat.svelte): follow parentId from currentId to the root, reverse. The
 * model only ever sees this chain, so this — not history.messages — is what
 * the status line must measure. */
export function chainMessages(
	history: ContextStatusInput['history']
): ChainMessage[] {
	if (!history?.messages || !history.currentId) return [];
	const chain: ChainMessage[] = [];
	let cursor: string | null = history.currentId;
	const seen = new Set<string>();
	while (cursor && history.messages[cursor] && !seen.has(cursor)) {
		seen.add(cursor);
		const message = history.messages[cursor];
		chain.push(message);
		cursor = message.parentId ?? null;
	}
	return chain.reverse();
}

function messageText(message: ChainMessage): string {
	return typeof message.content === 'string' ? message.content : '';
}

export function contextStatus(input: ContextStatusInput): ContextStatus {
	const chain = chainMessages(input.history);

	// ↓ and the tooltip breakdown: every assistant message that carries a
	// usage trailer (absent on older chats and capability-less models).
	const turns: TurnUsage[] = [];
	let totalReceived = 0;
	for (const message of chain) {
		if (message.role !== 'assistant') continue;
		const usage = message.usage;
		if (!usage) continue;
		turns.push({
			id: message.id,
			role: message.role,
			promptTokens: usage.prompt_tokens ?? null,
			completionTokens: usage.completion_tokens ?? null
		});
		totalReceived += usage.completion_tokens ?? 0;
	}

	// ↑: the LAST measured request's footprint is the best answer to "how
	// full is the context" — prompt_tokens already includes the system
	// prompt, the whole re-sent prefix, and file context. Older trailers
	// describe strictly smaller prefixes; the newest one wins.
	const lastMeasured = turns.length
		? (turns[turns.length - 1].promptTokens ?? 0) + (turns[turns.length - 1].completionTokens ?? 0)
		: 0;
	const hasMeasured = turns.some(
		(t) => (t.promptTokens ?? 0) > 0 || (t.completionTokens ?? 0) > 0
	);

	const draftEstimate = estimateTokens(input.promptDraft ?? '');

	let contextInUse: number;
	let provenance: UsageProvenance;
	if (hasMeasured) {
		// The trailer is authoritative for what was sent; the draft is the
		// one thing it cannot know about, so it rides on top as an estimate.
		contextInUse = lastMeasured + draftEstimate;
		provenance = 'measured';
	} else if (chain.length || draftEstimate) {
		// No trailer yet (first turn, or the backend/model never sent usage):
		// estimate the whole chain. Marked with ≈ in the UI.
		const chainEstimate = chain.reduce((sum, message) => sum + estimateTokens(messageText(message)), 0);
		contextInUse = chainEstimate + draftEstimate;
		provenance = 'estimated';
	} else {
		contextInUse = 0;
		provenance = 'unknown';
	}

	const model = input.models.find((m) => m.id === input.modelId);
	const contextLength = model?.context_length ?? null;
	const percent =
		contextLength && contextLength > 0 ? contextInUse / contextLength : null;

	return { contextInUse, totalReceived, contextLength, percent, provenance, turns };
}
