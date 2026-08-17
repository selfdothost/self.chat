<script lang="ts">
	import type { i18n as i18nType } from 'i18next';
	import { getContext, onDestroy } from 'svelte';
	import { useSvelteFlow, useNodesInitialized, useStore } from '@xyflow/svelte';

	const i18n: Writable<i18nType> = getContext('i18n');

	import { onMount, tick } from 'svelte';

	import { writable, type Writable } from 'svelte/store';
	import { models, showOverview, user } from '$lib/stores';

	import '@xyflow/svelte/dist/style.css';

	import CustomNode from './Overview/Node.svelte';
	import Flow from './Overview/Flow.svelte';
	import XMark from '../icons/XMark.svelte';
	import ArrowLeft from '../icons/ArrowLeft.svelte';

	// NB: in this @xyflow/svelte version, useStore() exposes `width`/`height` as
	// plain reactive getters (Svelte 5 runes under the hood), not Svelte stores
	// -- destructuring them here would just copy a one-time snapshot number and
	// lose reactivity entirely. Keep the live store object and read
	// `flowStore.width`/`flowStore.height` inside a reactive ($:) block instead,
	// same as `nodesInitializedState.current` below.
	const flowStore = useStore();

	const { fitView } = useSvelteFlow();
	// Also a reactive getter object (`{ readonly current: boolean }`), not a
	// store -- see the note above.
	const nodesInitializedState = useNodesInitialized();

	// onClose fires when the overview's own X is pressed. onNodeClick forwards
	// xyflow's node-click payload up unchanged; ChatControls reads
	// `.node.data.message.id` from it.
	let { history, onClose = () => {}, onNodeClick = () => {} } = $props();

	let selectedMessageId = $state(null);

	const nodes = writable([]);
	const edges = writable([]);

	const nodeTypes = {
		custom: CustomNode
	};



		// Svelte compiles $: blocks in dependency order, not source order --
	// this is called from an earlier reactive block despite being declared
	// here. ESLint's static top-down analysis can't see that reordering.
	 
	const focusNode = async () => {
		if (selectedMessageId === null) {
			await fitView({ nodes: [{ id: history.currentId }] });
		} else {
			await fitView({ nodes: [{ id: selectedMessageId }] });
		}

		selectedMessageId = null;
	};

	const drawFlow = async () => {
		const nodeList = [];
		const edgeList = [];
		const levelOffset = 150; // Vertical spacing between layers
		const siblingOffset = 250; // Horizontal spacing between nodes at the same layer

		// Map to keep track of node positions at each level -- function-local
		// to drawFlow(), never touches component state or Svelte's reactivity.
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		let positionMap = new Map();

		// Create nodes and map children to ensure alignment in width
		let layerWidths = {}; // Track widths of each layer

		Object.keys(history.messages).forEach((id) => {
			const message = history.messages[id];
			const level = message.parentId ? (positionMap.get(message.parentId)?.level ?? -1) + 1 : 0;
			if (!layerWidths[level]) layerWidths[level] = 0;

			positionMap.set(id, {
				id: message.id,
				level,
				position: layerWidths[level]++
			});
		});

		// Adjust positions based on siblings count to centralize vertical spacing
		Object.keys(history.messages).forEach((id) => {
			const pos = positionMap.get(id);
			const xOffset = pos.position * siblingOffset;
			const y = pos.level * levelOffset;
			const x = xOffset;

			nodeList.push({
				id: pos.id,
				type: 'custom',
				data: {
					user: $user,
					message: history.messages[id],
					model: $models.find((model) => model.id === history.messages[id].model)
				},
				position: { x, y }
			});

			// Create edges
			const parentId = history.messages[id].parentId;
			if (parentId) {
				edgeList.push({
					id: parentId + '-' + pos.id,
					source: parentId,
					target: pos.id,
					selectable: false,
					class: ' dark:fill-gray-300 fill-gray-300',
					type: 'smoothstep',
					animated: history.currentId === id || recurseCheckChild(id, history.currentId)
				});
			}
		});

		await edges.set([...edgeList]);
		await nodes.set([...nodeList]);
	};

	const recurseCheckChild = (nodeId, currentId) => {
		const node = history.messages[nodeId];
		return (
			node.childrenIds &&
			node.childrenIds.some((id) => id === currentId || recurseCheckChild(id, currentId))
		);
	};

	onMount(() => {
		drawFlow();
	});




	onDestroy(() => {
		console.log('Overview destroyed');

		nodes.set([]);
		edges.set([]);
	});
	$effect(() => {
		if (history) {
			drawFlow();
		}
	});
	$effect(() => {
		if (history && history.currentId) {
			focusNode();
		}
	});
	// These replace the old nodesInitialized/width/height `.subscribe(...)`
	// calls that used to live in onMount() -- none of the three are Svelte
	// stores in this @xyflow/svelte version (see the notes above), so
	// `.subscribe` doesn't exist on them and would have thrown at runtime.
	// Reading their reactive getters inside an $effect re-runs whenever the
	// underlying signal changes, same as the `history` blocks above.
	$effect(() => {
		if (nodesInitializedState.current) {
			(async () => {
				await tick();
				await fitView({ nodes: [{ id: history.currentId }] });
			})();
		}
	});
	$effect(() => {
		if (flowStore.width) {
			fitView({ nodes: [{ id: history.currentId }] });
		}
	});
	$effect(() => {
		if (flowStore.height) {
			fitView({ nodes: [{ id: history.currentId }] });
		}
	});
</script>

<div class="w-full h-full relative">
	<div class=" absolute z-50 w-full flex justify-between dark:text-gray-100 px-4 py-3.5">
		<div class="flex items-center gap-2.5">
			<button
				class="self-center p-0.5"
				onclick={() => {
					showOverview.set(false);
				}}
			>
				<ArrowLeft className="size-3.5" />
			</button>
			<div class=" text-lg font-medium self-center font-primary">{$i18n.t('Chat Overview')}</div>
		</div>
		<button
			class="self-center p-0.5"
			onclick={() => {
				onClose();
				showOverview.set(false);
			}}
		>
			<XMark className="size-3.5" />
		</button>
	</div>

	{#if $nodes.length > 0}
		<Flow
			{nodes}
			{nodeTypes}
			{edges}
			onNodeClick={(detail) => {
				onNodeClick(detail);
				selectedMessageId = detail.node.data.message.id;
				fitView({ nodes: [{ id: selectedMessageId }] });
			}}
		/>
	{/if}
</div>
