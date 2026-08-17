<script lang="ts">
	// PipelineCanvas.svelte — curation-pipeline editor, on @xyflow/svelte.
	//
	// Replaces a hand-rolled SVG canvas that owned pan, drag, port measurement
	// and edge routing itself. xyflow OWNS nodes/edges/viewport now (we bind to
	// it); this component maps between xyflow's shape and the PERSISTED shape,
	// and renders the palette.
	//
	// WHY THE REWRITE, not just a reskin (self.chat#28): the old canvas ran
	// `afterUpdate -> updatePortPositions()`, which reassigned a fresh Map that
	// `computedPaths`/`pendingPath` read reactively — so the reassignment itself
	// re-triggered the update, forever, until `effect_update_depth_exceeded` tore
	// the component down. It fired on an EMPTY canvas, on ordinary interaction.
	// The class of bug is gone here rather than patched: there is no lifecycle
	// hook, and the one $effect READS nodes/edges to emit the graph — it never
	// writes them, so it cannot re-trigger itself. Same discipline as
	// Voices/SoundPipelineCanvas.
	//
	// THE PERSISTED SHAPE IS UNCHANGED. KnowledgeBase saves `nodes` as
	// {id,label,type,x,y,headerColor,config} and `connections` as
	// {fromId,toId}, and builds the API payload by walking that chain. xyflow's
	// {position:{x,y}} / {source,target} live only inside this component, so
	// existing saved pipelines keep loading and the curator payload is untouched.
	import { untrack } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { v4 as uuidv4 } from 'uuid';
	import { theme } from '$lib/stores';
	import {
		SvelteFlow,
		Background,
		BackgroundVariant,
		Controls,
		MiniMap,
		Panel,
		type Node,
		type Edge
	} from '@xyflow/svelte';
	import '@xyflow/svelte/dist/style.css';
	import PipelineFlowNode from './PipelineFlowNode.svelte';
	import {
		NODE_TYPES,
		paletteGroups,
		type PaletteEntry,
		type PipelineNodeKind
	} from './nodePalette';

	type NodeDef = {
		id: string;
		label: string;
		type: PipelineNodeKind;
		x: number;
		y: number;
		headerColor: string;
		config: Record<string, unknown>;
	};

	type Connection = { fromId: string; toId: string };

	let {
		nodes: initialNodes = [],
		connections: initialConnections = [],
		onConfigChange = () => {}
	}: {
		nodes?: NodeDef[];
		connections?: Connection[];
		onConfigChange?: (graph: { nodes: NodeDef[]; connections: Connection[] }) => void;
	} = $props();

	// --- mapping between the persisted shape and xyflow's -------------------

	function toFlowNode(n: NodeDef): Node {
		return {
			id: n.id,
			type: 'pipeline',
			position: { x: n.x ?? 0, y: n.y ?? 0 },
			data: {
				label: n.label,
				kind: n.type,
				headerColor: n.headerColor,
				stageType: (n.config?.stage_type as string | undefined) ?? undefined,
				config: n.config ?? {},
				onConfigChange: (config: Record<string, unknown>) => updateNodeConfig(n.id, config)
			}
		};
	}

	function fromFlowNode(n: Node): NodeDef {
		const d = n.data as {
			label: string;
			kind: NodeDef['type'];
			headerColor: string;
			config: Record<string, unknown>;
		};
		return {
			id: n.id,
			label: d.label,
			type: d.kind,
			// Round-trip the live position so a drag is what gets saved.
			x: Math.round(n.position.x),
			y: Math.round(n.position.y),
			headerColor: d.headerColor,
			config: d.config ?? {}
		};
	}

	// Read the incoming graph ONCE. Deliberately not reactive to later prop
	// changes: KnowledgeBase feeds our own emissions straight back into these
	// props, so re-syncing here would be exactly the write-what-you-read loop
	// this rewrite exists to remove.
	let nodes = $state.raw<Node[]>(untrack(() => (initialNodes ?? []).map(toFlowNode)));
	let edges = $state.raw<Edge[]>(
		untrack(() =>
			(initialConnections ?? []).map((c) => ({
				id: `${c.fromId}->${c.toId}`,
				source: c.fromId,
				target: c.toId
			}))
		)
	);

	const nodeTypes = { pipeline: PipelineFlowNode };

	// Drive xyflow's built-in theming off the app theme, same expression the
	// Sound Studio canvas and the chat Overview minimap use.
	const colorMode = $derived(
		$theme.includes('dark')
			? 'dark'
			: $theme === 'system'
				? window.matchMedia('(prefers-color-scheme: dark)').matches
					? 'dark'
					: 'light'
				: 'light'
	);

	// --- graph mutation ------------------------------------------------------

	function updateNodeConfig(id: string, config: Record<string, unknown>) {
		nodes = nodes.map((n) =>
			n.id === id ? { ...n, data: { ...n.data, config } } : n
		);
	}

	function addNode(entry: PaletteEntry, position?: { x: number; y: number }) {
		const count = nodes.length;
		// Seed each param's declared default, exactly as the previous canvas did —
		// a node added without them submits empty params and the stage runs with
		// nothing configured.
		const defaultParams: Record<string, unknown> = {};
		if (entry.template) {
			for (const p of entry.template.params) {
				if (p.default !== undefined && p.default !== null) {
					defaultParams[p.name] = p.default;
				}
			}
		}
		const def: NodeDef = {
			id: uuidv4(),
			label: entry.label,
			type: entry.type,
			// Cascade so successive adds don't stack exactly on top of each other.
			x: position?.x ?? 120 + (count % 6) * 40,
			y: position?.y ?? 80 + (count % 6) * 40,
			headerColor: entry.headerColor,
			config: entry.template
				? { stage_type: entry.template.stageType, params: defaultParams }
				: {}
		};
		nodes = [...nodes, toFlowNode(def)];
	}

	function deleteSelected() {
		const doomed = new Set(nodes.filter((n) => n.selected).map((n) => n.id));
		if (doomed.size) nodes = nodes.filter((n) => !doomed.has(n.id));
		edges = edges.filter(
			(e) => !e.selected && !doomed.has(e.source) && !doomed.has(e.target)
		);
	}

	const hasSelection = $derived(
		nodes.some((n) => n.selected) || edges.some((e) => e.selected)
	);

	// --- palette -------------------------------------------------------------

	let nodeSearch = $state('');

	const filteredNodeTypes = $derived(
		nodeSearch.trim()
			? NODE_TYPES.filter(
					(nt) =>
						nt.label.toLowerCase().includes(nodeSearch.toLowerCase()) ||
						(nt.group ?? '').toLowerCase().includes(nodeSearch.toLowerCase())
				)
			: NODE_TYPES
	);

	const groups = $derived(paletteGroups(filteredNodeTypes));

	// Groups start collapsed (58 entries is too many to show at once); a search
	// expands everything so matches are visible without hunting.
	const collapsedGroups = new SvelteSet<string>(
		NODE_TYPES.map((nt) => nt.group).filter((g): g is string => !!g)
	);
	const searching = $derived(nodeSearch.trim().length > 0);

	function toggleGroup(group: string) {
		if (collapsedGroups.has(group)) collapsedGroups.delete(group);
		else collapsedGroups.add(group);
	}

	// --- persistence ---------------------------------------------------------
	// READ-ONLY over nodes/edges. Never writes them, so it cannot self-trigger.
	let debounceTimer: ReturnType<typeof setTimeout> | undefined;
	let mounted = false;
	$effect(() => {
		const snapshot = {
			nodes: nodes.map(fromFlowNode),
			connections: edges.map((e) => ({ fromId: e.source, toId: e.target }))
		};
		if (!mounted) {
			// Skip the first run so we don't immediately re-emit the graph we were
			// just handed.
			mounted = true;
			return;
		}
		clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => onConfigChange(snapshot), 250);
	});

	$effect(() => () => clearTimeout(debounceTimer));
</script>

<div class="pipeline-canvas" data-testid="pipeline-canvas">
	<SvelteFlow
		bind:nodes
		bind:edges
		{nodeTypes}
		{colorMode}
		fitView
		deleteKey={['Delete', 'Backspace']}
		minZoom={0.2}
		maxZoom={2}
	>
		<Background variant={BackgroundVariant.Dots} />
		<Controls />
		<MiniMap />

		<Panel position="top-left">
			<div
				class="flex flex-col gap-1.5 p-2 w-56 max-h-[70%] rounded-xl bg-white dark:bg-gray-900 border border-gray-50 dark:border-gray-850 shadow-sm text-xs"
				role="toolbar"
				aria-label="Add pipeline node"
			>
				<span
					class="px-1 text-[10px] font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500"
					>Add Node</span
				>
				<input
					class="w-full px-2 py-1 rounded-lg bg-gray-50 dark:bg-gray-850 outline-hidden text-xs"
					placeholder="Search nodes…"
					bind:value={nodeSearch}
					aria-label="Search nodes"
					data-testid="node-search"
				/>

				<div class="flex flex-col gap-0.5 overflow-y-auto max-h-72">
					{#each groups as { group, items } (group ?? '__ungrouped')}
						{#if group}
							<button
								type="button"
								class="flex items-center gap-1 px-1.5 py-1 rounded-lg text-left text-[10px] font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500 hover:bg-black/5 dark:hover:bg-white/5"
								onclick={() => toggleGroup(group)}
								aria-expanded={searching || !collapsedGroups.has(group)}
							>
								<span
									class="transition-transform {searching || !collapsedGroups.has(group)
										? ''
										: '-rotate-90'}">▾</span
								>
								{group}
								<span class="ml-auto opacity-60">{items.length}</span>
							</button>
						{/if}
						{#if !group || searching || !collapsedGroups.has(group)}
							{#each items as entry (entry.label)}
								<button
									type="button"
									class="text-left px-2 py-1.5 rounded-lg border-l-[3px] border-transparent text-gray-700 dark:text-gray-300 hover:bg-black/5 dark:hover:bg-white/5 transition"
									onclick={() => addNode(entry)}
									title={entry.description}
									data-testid="add-node-{entry.label}"
								>
									{entry.label}
								</button>
							{/each}
						{/if}
					{/each}
					{#if groups.length === 0}
						<span class="px-2 py-1.5 text-gray-400 dark:text-gray-500 italic"
							>No nodes match “{nodeSearch}”.</span
						>
					{/if}
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
	.pipeline-canvas {
		width: 100%;
		height: 100%;
		min-height: 320px;
	}

	/* xyflow's default handles are ~6px — too small to grab reliably, so users
	   miss them and drag the node instead ("won't connect"). Same treatment the
	   Sound Studio canvas uses: a slightly larger, direction-coloured dot with a
	   transparent ::after expanding the hit area to ~27px. A pointerdown on the
	   ::after still targets the handle, so xyflow's connection start fires; only
	   the grabbable region grows, the centering transform is untouched. */
	.pipeline-canvas :global(.svelte-flow__handle) {
		width: 11px;
		height: 11px;
		border-width: 2px;
	}
	.pipeline-canvas :global(.svelte-flow__handle.source) {
		background: #10b981; /* emerald — outputs */
	}
	.pipeline-canvas :global(.svelte-flow__handle.target) {
		background: #6366f1; /* indigo — inputs */
	}
	.pipeline-canvas :global(.svelte-flow__handle)::after {
		content: '';
		position: absolute;
		inset: -8px;
		border-radius: 9999px;
	}
	.pipeline-canvas :global(.svelte-flow__handle:hover),
	.pipeline-canvas :global(.svelte-flow__handle.connectingfrom),
	.pipeline-canvas :global(.svelte-flow__handle.connectingto) {
		box-shadow: 0 0 0 4px rgb(99 102 241 / 0.25);
	}
</style>
