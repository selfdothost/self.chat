<script lang="ts">
	// PipelineFlowNode.svelte — the single xyflow custom node backing every
	// curation-pipeline stage (source, sink, transform).
	//
	// One component for all three kinds, the same way Voices/CatalogNode.svelte
	// backs every Sound Studio node: the kind only decides which handles exist
	// and which content component renders the body. Adding a stage template needs
	// no change here.
	//
	// Position, drag, selection and edge geometry are all xyflow's now. This
	// component renders a box; it does not measure ports, own coordinates, or
	// run a lifecycle hook. That is the whole point of the migration — the
	// hand-rolled canvas this replaces recomputed port positions in `afterUpdate`
	// and reassigned a Map that its own derivations read, which is the
	// self.chat#28 `effect_update_depth_exceeded` loop.
	import { Handle, Position, type NodeProps } from '@xyflow/svelte';
	import SourceNodeContent from './SourceNodeContent.svelte';
	import SinkNodeContent from './SinkNodeContent.svelte';
	import TransformNodeContent from './TransformNodeContent.svelte';
	import { TEMPLATES_BY_STAGE_TYPE, type NodeTemplate } from './nodeTemplate';
	import type { PipelineNodeKind } from './nodePalette';

	type PipelineNodeData = {
		label: string;
		kind: PipelineNodeKind;
		headerColor: string;
		stageType?: string;
		config: Record<string, unknown>;
		/** Provided by the canvas so a body edit reaches the graph. */
		onConfigChange?: (config: Record<string, unknown>) => void;
	};

	let { data, selected }: NodeProps = $props();

	const d = $derived(data as PipelineNodeData);
	const template = $derived<NodeTemplate | undefined>(
		d.stageType ? TEMPLATES_BY_STAGE_TYPE[d.stageType] : undefined
	);

	// Collapse is presentation only and deliberately local: it is not part of the
	// persisted NodeDef, so collapsing a node must never mark the pipeline dirty.
	let collapsed = $state(false);

	function emit(config: Record<string, unknown>) {
		d.onConfigChange?.(config);
	}
</script>

<div
	class="pipeline-node rounded-lg border bg-white dark:bg-gray-900 shadow-sm text-xs w-64
	       {selected
		? 'border-blue-500 dark:border-blue-500'
		: 'border-gray-100 dark:border-gray-850'}"
	data-testid="pipeline-node-{d.kind}"
>
	<!-- Inputs on the left, outputs on the right. A source has no input and a
	     sink no output, which is what makes an invalid wire unbuildable rather
	     than merely rejected. -->
	{#if d.kind !== 'source'}
		<Handle type="target" position={Position.Left} />
	{/if}
	{#if d.kind !== 'sink'}
		<Handle type="source" position={Position.Right} />
	{/if}

	<div
		class="node-header flex items-center gap-1.5 px-2.5 py-1.5 rounded-t-lg text-white {d.headerColor}"
	>
		<span class="flex-1 truncate font-medium" title={d.label}>{d.label}</span>
		<button
			type="button"
			class="node-collapse-btn nodrag shrink-0 opacity-70 hover:opacity-100 transition"
			aria-label={collapsed ? 'Expand node' : 'Collapse node'}
			aria-expanded={!collapsed}
			onclick={() => (collapsed = !collapsed)}
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2.5"
				class="size-3 transition-transform {collapsed ? '-rotate-90' : ''}"
				aria-hidden="true"
			>
				<path stroke-linecap="round" stroke-linejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
			</svg>
		</button>
	</div>

	{#if !collapsed}
		<!-- `nodrag` so dragging inside a field edits the value instead of moving
		     the node — xyflow otherwise claims the pointer for a node drag. -->
		<div class="nodrag nowheel px-2.5 py-2 max-h-72 overflow-y-auto">
			{#if d.kind === 'source'}
				<SourceNodeContent config={d.config} onConfigChange={emit} />
			{:else if d.kind === 'sink'}
				<SinkNodeContent config={d.config} stageLabel="output" onConfigChange={emit} />
			{:else if template}
				<TransformNodeContent {template} config={d.config} onConfigChange={emit} />
			{:else}
				<div class="text-gray-400 dark:text-gray-500 italic">
					No template for “{d.stageType ?? d.label}”.
				</div>
			{/if}
		</div>
	{/if}
</div>
