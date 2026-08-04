<script lang="ts">
	import { createEventDispatcher } from 'svelte';

	interface Props {
		id: string;
		label: string;
		x?: number;
		y?: number;
		type?: 'source' | 'sink' | 'transform';
		hasInput?: boolean;
		hasOutput?: boolean;
		headerColor?: string;
		selected?: boolean;
		children?: import('svelte').Snippet;
	}

	let {
		id,
		label,
		x = $bindable(0),
		y = $bindable(0),
		type = 'transform',
		hasInput = type !== 'source',
		hasOutput = type !== 'sink',
		headerColor = 'bg-blue-500',
		selected = false,
		children
	}: Props = $props();

	const dispatch = createEventDispatcher();

	let nodeCollapsed = $state(false);
	let dragging = $state(false);
	let dragOffsetX = 0;
	let dragOffsetY = 0;

	function onPointerDown(e: PointerEvent) {
		if (!(e.target as HTMLElement).closest('.node-header')) return;
		if ((e.target as HTMLElement).closest('.node-collapse-btn')) return;
		if ((e.target as HTMLElement).closest('.port')) return;
		dragging = true;
		const rect = (e.currentTarget as HTMLElement).parentElement?.getBoundingClientRect();
		dragOffsetX = e.clientX - (rect?.left ?? 0) - x;
		dragOffsetY = e.clientY - (rect?.top ?? 0) - y;
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
	}

	function onPointerMove(e: PointerEvent) {
		if (!dragging) return;
		const rect = (e.currentTarget as HTMLElement).parentElement?.getBoundingClientRect();
		const newX = e.clientX - (rect?.left ?? 0) - dragOffsetX;
		const newY = e.clientY - (rect?.top ?? 0) - dragOffsetY;
		x = Math.max(0, newX);
		y = Math.max(0, newY);
		dispatch('move', { id, x, y });
	}

	function onPointerUp() {
		dragging = false;
	}

	function handleClick(e: MouseEvent) {
		e.stopPropagation();
		dispatch('select', { id });
	}

	function handleContextMenu(e: MouseEvent) {
		e.preventDefault();
		e.stopPropagation();
		dispatch('nodecontextmenu', { id, clientX: e.clientX, clientY: e.clientY});
	}

	function toggleCollapse() {
		nodeCollapsed = !nodeCollapsed;
	}
</script>

<div
	class="absolute select-none pipeline-node"
	style="left: {x}px; top: {y}px; {nodeCollapsed ? '' : 'min-width: 200px; max-width: 280px;'}"
	role="button"
	tabindex="0"
	onpointerdown={onPointerDown}
	onpointermove={onPointerMove}
	onpointerup={onPointerUp}
	onclick={handleClick}
	onkeydown={(e) => {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			dispatch('select', { id });
		}
	}}
	oncontextmenu={handleContextMenu}
	class:cursor-grabbing={dragging}
	class:cursor-grab={!dragging}
	>
	<div
		class="rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden"
		class:ring-2={dragging || selected}
		class:ring-blue-400={dragging}
		class:ring-sky-400={selected && !dragging}
		>
		<!-- Header -->
		<div class="flex items-center gap-1.5 px-3 py-2 {headerColor} text-white text-xs font-semibold node-header"
		>
			{#if hasInput}
				<div class="port port-input" data-node-id={id} data-port="input"></div>
			{/if}
			<button
				class="node-collapse-btn shrink-0 w-4 h-4 flex items-center justify-center rounded hover:bg-white/20 transition"
				onclick={toggleCollapse}
				title={nodeCollapsed ? 'Expand' : 'Collapse'}
			>
				<svg
					class="w-2.5 h-2.5 transition-transform duration-150"
					class:rotate-[-90deg]={nodeCollapsed}
					viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg"
				>
					<path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
				</svg>
			</button>
			<span class="flex-1 truncate">{label}</span>
			{#if hasOutput}
				<div class="port port-output" data-node-id={id} data-port="output"></div>
			{/if}
		</div>

		<!-- Body (collapsible) -->
		{#if !nodeCollapsed}
			<div class="node-content px-3 py-2 text-xs cursor-default">
				{@render children?.()}
			</div>
		{/if}
	</div>
</div>

<style>
	.port {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		border: 2px solid rgba(255, 255, 255, 0.8);
		background: rgba(255, 255, 255, 0.3);
		shrink: 0;
	}
	.port-input {
		margin-left: -8px;
	}
	.port-output {
		margin-right: -8px;
	}
	.port:hover {
		background: white;
		cursor: crosshair;
	}
</style>
