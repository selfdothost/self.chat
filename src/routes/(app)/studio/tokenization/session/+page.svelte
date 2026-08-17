<script lang="ts">
	import Chat from '$lib/components/chat/Chat.svelte';
	import Help from '$lib/components/layout/Help.svelte';
	import PromptPresets from '$lib/components/studio/Tokenization/PromptPresets.svelte';
	import SamplingPanel from '$lib/components/studio/Tokenization/SamplingPanel.svelte';
	import { isTokenizationSelectable } from '$lib/components/studio/Tokenization/selectable';
	import {
		DEFAULT_TOP_LOGPROBS,
		tokenizationRequestExtras
	} from '$lib/components/studio/Tokenization/constants';
	import { controlsRailIsPinned } from '$lib/components/studio/Tokenization/rail';

	// Tokenization Studio Shell R2 + R3 + R5 — T-204, T-205 and T-208 of
	// context/plans/build-site-tokenization-shell.md.
	//
	// The session page. It "forks the chat page" in the sense the kit means:
	// its own route with its own configuration, rendering the same chat
	// component rather than a copy of it.
	//
	// WHY NOT A LITERAL COPY. Chat.svelte is 2207 lines and had exactly one prop,
	// so a literal fork would have duplicated the app's most complex component --
	// and every future chat fix would then need applying twice, drifting silently
	// when it wasn't. R2-AC4 was amended to say what it protects (no behavioural
	// change to chat, no foreign concepts inside chat components) rather than "no
	// file modified", which as a proxy forced the worse outcome. Converting to a
	// properly shared component is self.chat#50.
	//
	// Every rule lives HERE. Chat is handed a predicate and a bag of request
	// fields; it never learns what tokenization is.

	// R1-AC3 / R2-AC3 — only llamolotl-backed models can serve this surface.
	const modelFilter = (model: { id: string; owned_by?: string; arena?: boolean }) =>
		isTokenizationSelectable(model);

	// R3-AC4 — configurable per session, defaulting from the one place the
	// default is declared. SamplingPanel both shows and sets it.
	let topLogprobs = $state(DEFAULT_TOP_LOGPROBS);

	const requestExtras = $derived(tokenizationRequestExtras(topLogprobs));

	// R5 — the rail is pinned open on entry, on viewports wide enough for
	// ChatControls to present a rail at all. Below that breakpoint it presents a
	// Drawer across the conversation, and opening that unasked would bury the
	// thing the artist came to look at (R5-AC2).
	//
	// `const`, evaluated once at entry, and NOT `$derived`: R5-AC3 and R5-AC6.
	// Re-evaluating it would re-open a rail the artist had deliberately closed
	// the moment they resized the window. There is no `$effect` here at all, so
	// the self-writing `showControls` loop of R5-AC5 cannot be re-armed from this
	// surface — the value is computed here and applied once by Chat, at the same
	// point in `initNewChat()` that has always decided the rail's entry state.
	const controlsOpenOnEntry = controlsRailIsPinned();
	// R3-AC5 — Chat's advanced params bag, bound OUT so the sampler in effect can
	// be shown. The controls rail writes it; this page only reads it. See
	// Tokenization/sampling.ts for why a hidden sampler misleads.
	let chatParams = $state({});
</script>

<Help />

<SamplingPanel sessionParams={chatParams} bind:topLogprobs />

<!--
	R3-AC1/AC2 — splitLargeDeltas is FORCED off here, and forced rather than set:
	`streamLargeDeltasAsRandomChunks` re-chops content into random 1-3 character
	pieces for a typewriter effect, which would destroy every token boundary the
	view depends on. Passing it as an override means the user's stored
	`splitLargeChunks` preference is never written, so returning to ordinary chat
	restores their own choice exactly.
-->
<!--
	R6 — Studio > Prompts in the composer. The picker is OURS, rendered through
	an accessory slot the composer offers to anyone; the chat components never
	learn that a tokenization surface is what asked for it. `insertText` is the
	only capability handed back, and the text it writes stays editable.
-->
{#snippet promptPresets({ insertText }: { insertText: (text: string) => void })}
	<PromptPresets onSelect={insertText} />
{/snippet}

<Chat
	{modelFilter}
	{requestExtras}
	{controlsOpenOnEntry}
	splitLargeDeltas={false}
	composerAccessory={promptPresets}
	bind:params={chatParams}
	sessionKind="tokenization"
/>
