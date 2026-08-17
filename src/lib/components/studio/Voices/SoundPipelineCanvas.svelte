<script lang="ts">
	// SoundPipelineCanvas.svelte — Sound Studio pipeline canvas (Phase 1, T-011).
	//
	// A node-graph editor built on @xyflow/svelte. xyflow OWNS the nodes/edges/
	// viewport state (we bind to it); we never re-measure ports or hand-roll a
	// reactive geometry store. Node types come entirely from an external,
	// pluggable catalog (`nodeCatalog.ts`) — the canvas renders any descriptor
	// generically through the single `CatalogNode` component.
	//
	// #28 anti-pattern avoidance (self.chat#28): the original hand-rolled SVG
	// canvas ran `afterUpdate` -> unconditionally reassign a freshly-built Map
	// that a `$:`/`$derived` read -> re-render -> `afterUpdate` again -> forever
	// (`effect_update_depth_exceeded`). This component has NO lifecycle hook that
	// reassigns reactive state a derivation reads:
	//   * nodes/edges are $state.raw, mutated ONLY by xyflow (via bind:) or by
	//     explicit user actions (add/delete) — never by an $effect.
	//   * the one $effect here READS nodes/edges to emit `onGraphChange`; it
	//     never writes them, so it cannot re-trigger itself.
	//   * the initial graph is read ONCE at init, not reassigned in an $effect.
	import { setContext, untrack } from 'svelte';
	import { theme } from '$lib/stores';
	import {
		SvelteFlow,
		Background,
		BackgroundVariant,
		Controls,
		MiniMap,
		Panel,
		type Node,
		type Edge,
		type Connection
	} from '@xyflow/svelte';

	// Drive xyflow's built-in dark/light theming off self.chat's theme store
	// (same expression the chat Overview minimap uses). This themes the canvas
	// background, controls, minimap and edges to match the app.
	const colorMode = $derived(
		$theme.includes('dark')
			? 'dark'
			: $theme === 'system'
				? window.matchMedia('(prefers-color-scheme: dark)').matches
					? 'dark'
					: 'light'
				: 'light'
	);
	import '@xyflow/svelte/dist/style.css';
	import { toast } from 'svelte-sonner';
	import { previewVoice } from '$lib/apis/voices';
	import CatalogNode from './CatalogNode.svelte';
	import {
		nodeCatalog,
		CATALOG_CONTEXT_KEY,
		PREVIEW_CONTEXT_KEY,
		SAMPLES_CONTEXT_KEY,
		defaultValuesFor,
		type NodeCatalog
	} from './nodeCatalog';

	type Graph = { nodes: Node[]; edges: Edge[] };
	type Sample = { id: string; name: string };

	// --- Integration contract (match exactly; another stream mounts this) ---
	let {
		graph = null,
		onGraphChange = () => {},
		catalog = nodeCatalog,
		voiceId = null,
		samples = []
	}: {
		graph?: Graph | null | undefined;
		onGraphChange?: (graph: Graph) => void;
		catalog?: NodeCatalog;
		// When set, Preview nodes get a working Play button that synthesises real
		// audio for this voice (Phase 3). Null = stub canvas (no live engine).
		voiceId?: string | null;
		// The voice's uploaded sample files — the options a Voice Sample node picks
		// from, and the ids a blend references. Empty on the stub canvas.
		samples?: Sample[];
	} = $props();

	// Read the initial graph ONCE. Deliberately not reactive to later `graph`
	// prop changes — the parent persists via onGraphChange and does not push the
	// graph back in; re-syncing here is exactly the reassign-in-a-lifecycle trap.
	let nodes = $state.raw<Node[]>(untrack(() => (graph?.nodes ?? []) as Node[]));
	let edges = $state.raw<Edge[]>(untrack(() => (graph?.edges ?? []) as Edge[]));

	// The catalog is fixed at mount (swapped by editing nodeCatalog.ts or by the
	// mounting stream passing a different `catalog` once). We read it once here;
	// `untrack` makes that non-reactive intent explicit.
	const activeCatalog = untrack(() => catalog);

	// Provide the catalog to CatalogNode instances (rendered inside SvelteFlow).
	setContext<NodeCatalog>(CATALOG_CONTEXT_KEY, activeCatalog);

	// Provide the voice's samples as select options for Voice Sample nodes. Read
	// once at mount (like the catalog) — the picker options don't need to react to
	// live uploads; a tab remount (VoiceDetail keys the canvas on voice id) refreshes.
	const sampleOptions = untrack(() => samples).map((s) => ({ label: s.name, value: s.id }));
	setContext(SAMPLES_CONTEXT_KEY, sampleOptions);

	// Preview: resolve the crafted voice's levers from the graph (the Shape node
	// feeding this Preview node's `voice` input), then synthesise via the
	// connector and RETURN the audio blob. Playback is deliberately owned by the
	// caller (CatalogNode), which runs inside the click gesture and can therefore
	// unlock an <audio> element BEFORE this multi-second synth await — otherwise
	// the browser's transient user-activation expires during the fetch and
	// `audio.play()` is blocked by the autoplay policy (the "no sound" bug).
	// Only wired when a real `voiceId` is present. `nodes`/`edges` are read live
	// in the click handler (never in an $effect) — no #28 rune-loop.
	async function runPreview(previewNodeId: string, text: string): Promise<Blob | null> {
		const line = (text ?? '').trim();
		if (!line) {
			toast.error('Type a line to preview.');
			return null;
		}
		if (!voiceId) return null;
		let exaggeration: number | undefined;
		let cfg_weight: number | undefined;
		let references: Array<{ file_id: string; weight: number }> = [];
		let singleFileId: string | undefined;

		// Walk back from the Preview node: its `voice` input is fed by a Shape node,
		// whose `ref` input is fed by one or more Voice Sample nodes.
		const voiceEdge = edges.find(
			(e) => e.target === previewNodeId && (e.targetHandle ?? 'voice') === 'voice'
		);
		if (voiceEdge) {
			const shape = nodes.find((n) => n.id === voiceEdge.source);
			const sv = ((shape?.data as { values?: Record<string, unknown> })?.values) ?? {};
			if (typeof sv.exaggeration === 'number') exaggeration = sv.exaggeration;
			if (typeof sv.cfg_weight === 'number') cfg_weight = sv.cfg_weight;
			const blend =
				typeof sv.blend === 'number' ? Math.min(1, Math.max(0, sv.blend)) : 0.5;

			if (shape) {
				// The Voice Sample clips feeding this Shape, in edge order, with a
				// real picked file id.
				const fileIds = edges
					.filter((e) => e.target === shape.id)
					.map((e) => nodes.find((n) => n.id === e.source))
					.map((n) => ((n?.data as { values?: Record<string, unknown> })?.values ?? {}).file)
					.filter((f): f is string => typeof f === 'string' && f.length > 0);

				if (fileIds.length >= 2) {
					// Two clips → the Blend slider weights them (0 = first, 1 = second).
					// More than two → equal weights (the single slider can't express it).
					const weights =
						fileIds.length === 2 ? [1 - blend, blend] : fileIds.map(() => 1);
					references = fileIds.map((file_id, i) => ({ file_id, weight: weights[i] }));
				} else if (fileIds.length === 1) {
					singleFileId = fileIds[0];
				}
			}
		}

		try {
			return await previewVoice(localStorage.token, voiceId, {
				text: line,
				...(references.length >= 2
					? { references }
					: singleFileId
						? { file_id: singleFileId }
						: {}),
				exaggeration,
				cfg_weight
			});
		} catch (err) {
			toast.error(`Preview failed: ${err instanceof Error ? err.message : err}`);
			return null;
		}
	}
	setContext(PREVIEW_CONTEXT_KEY, voiceId ? runPreview : null);

	// One generic component backs every catalog type. Adding a type in the
	// catalog auto-registers it here — no canvas change required.
	const nodeTypes = Object.fromEntries(
		Object.keys(activeCatalog).map((key) => [key, CatalogNode])
	);

	let idSeq = $state(0);
	function nextId(): string {
		idSeq += 1;
		return `n${Date.now().toString(36)}-${idSeq}`;
	}

	function addNode(type: string) {
		const descriptor = activeCatalog[type];
		if (!descriptor) return;
		const count = nodes.length;
		const node: Node = {
			id: nextId(),
			type,
			// Cascade placement so successive adds don't stack exactly.
			position: { x: 120 + (count % 6) * 40, y: 80 + (count % 6) * 40 },
			data: { values: defaultValuesFor(descriptor) }
		};
		// Reassign (not push) so $state.raw sees the change.
		nodes = [...nodes, node];
	}

	function deleteSelected() {
		const doomed = new Set(nodes.filter((n) => n.selected).map((n) => n.id));
		if (doomed.size) {
			nodes = nodes.filter((n) => !doomed.has(n.id));
		}
		edges = edges.filter(
			(e) => !e.selected && !doomed.has(e.source) && !doomed.has(e.target)
		);
	}

	const hasSelection = $derived(
		nodes.some((n) => n.selected) || edges.some((e) => e.selected)
	);

	// --- Typed-port connection validation (Phase 2) ---
	// Look up a port's dataType from the catalog so we can reject nonsensical
	// wires (e.g. a `voice` output into a `ref_audio` input). Untyped ports are
	// wildcards.
	function portDataType(
		nodeId: string,
		handleId: string | null | undefined,
		dir: 'inputs' | 'outputs'
	): string | undefined {
		const node = nodes.find((n) => n.id === nodeId);
		const descriptor = node ? activeCatalog[node.type as string] : undefined;
		if (!descriptor) return undefined;
		const ports = descriptor[dir];
		const port = handleId ? ports.find((p) => p.id === handleId) : ports[0];
		return port?.dataType;
	}

	// xyflow's IsValidConnection callback is handed an Edge | Connection (it reuses
	// the guard when validating existing edges too). Both carry source/target and
	// optional handles, which is all we read.
	function isValidConnection(conn: Edge | Connection): boolean {
		const src = portDataType(conn.source, conn.sourceHandle, 'outputs');
		const tgt = portDataType(conn.target, conn.targetHandle, 'inputs');
		if (src === undefined || tgt === undefined) return true; // wildcard
		return src === tgt;
	}

	// --- Persistence: emit a snapshot whenever nodes/edges change (debounced) ---
	// READ-ONLY over nodes/edges — never writes them, so no self-trigger loop.
	let debounceTimer: ReturnType<typeof setTimeout> | undefined;
	let mounted = false;
	$effect(() => {
		// Track both arrays.
		const snapshot: Graph = { nodes, edges };
		if (!mounted) {
			// Skip the initial run so we don't immediately re-persist the graph we
			// were just handed.
			mounted = true;
			return;
		}
		clearTimeout(debounceTimer);
		const payload = { nodes: snapshot.nodes, edges: snapshot.edges };
		debounceTimer = setTimeout(() => onGraphChange(payload), 250);
	});

	$effect(() => () => clearTimeout(debounceTimer));

	const catalogEntries = Object.values(activeCatalog);
</script>

<div class="sound-pipeline-canvas" data-testid="sound-pipeline-canvas">
	<SvelteFlow
		bind:nodes
		bind:edges
		{nodeTypes}
		{colorMode}
		{isValidConnection}
		fitView
		deleteKey={['Delete', 'Backspace']}
		minZoom={0.2}
		maxZoom={2}
	>
		<Background variant={BackgroundVariant.Dots} />
		<Controls />
		<MiniMap />

		<!-- Palette: add any catalog node type. This is the add-node affordance. -->
		<Panel position="top-left">
			<div
				class="flex flex-col gap-1.5 p-2 rounded-xl bg-white dark:bg-gray-900 border border-gray-50 dark:border-gray-850 shadow-sm text-xs"
				role="toolbar"
				aria-label="Add pipeline node"
			>
				<span
					class="px-1 text-[10px] font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500"
					>Add node</span
				>
				<div class="flex flex-col gap-0.5">
					{#each catalogEntries as entry (entry.type)}
						<button
							type="button"
							class="text-left px-2 py-1.5 rounded-lg border-l-[3px] text-gray-700 dark:text-gray-300 hover:bg-black/5 dark:hover:bg-white/5 transition"
							style={`border-left-color: ${entry.accent ?? '#64748b'}`}
							onclick={() => addNode(entry.type)}
							title={entry.description ?? entry.label}
							data-testid={`add-node-${entry.type}`}
						>
							Add {entry.label}
						</button>
					{/each}
				</div>
				<button
					type="button"
					class="text-left px-2 py-1.5 rounded-lg text-red-500 hover:bg-red-500/10 transition disabled:opacity-40 disabled:hover:bg-transparent"
					onclick={deleteSelected}
					disabled={!hasSelection}
					data-testid="delete-selected"
				>
					Delete selected
				</button>
			</div>
		</Panel>
	</SvelteFlow>
</div>

<style>
	.sound-pipeline-canvas {
		width: 100%;
		height: 100%;
		min-height: 240px;
	}

	/* xyflow's default connection handles are ~6px — far too small to grab by
	   hand, so users miss them and drag the node instead ("won't connect"). Keep
	   the dot compact but (a) make it a bit bigger + colour-coded by direction so
	   the wiring affordance actually reads, and (b) expand the pointer hit-area to
	   ~26px with a transparent ::after. A pointerdown on the ::after still targets
	   the handle element itself, so xyflow's connection start fires — we only grow
	   the grabbable region, we never touch the handle's positioning transform. */
	.sound-pipeline-canvas :global(.svelte-flow__handle) {
		width: 11px;
		height: 11px;
		border-width: 2px;
	}
	.sound-pipeline-canvas :global(.svelte-flow__handle.source) {
		background: #10b981; /* emerald — outputs */
	}
	.sound-pipeline-canvas :global(.svelte-flow__handle.target) {
		background: #6366f1; /* indigo — inputs */
	}
	.sound-pipeline-canvas :global(.svelte-flow__handle)::after {
		content: '';
		position: absolute;
		inset: -8px; /* grows the clickable area to ~27px without moving the dot */
		border-radius: 9999px;
	}
	/* Non-transform hover/active affordance (a ring, so xyflow's centering
	   translate is preserved) telling the user the port is grabbable. */
	.sound-pipeline-canvas :global(.svelte-flow__handle:hover),
	.sound-pipeline-canvas :global(.svelte-flow__handle.connectingfrom),
	.sound-pipeline-canvas :global(.svelte-flow__handle.connectingto) {
		box-shadow: 0 0 0 4px rgb(99 102 241 / 0.25);
	}
</style>
