<script lang="ts">
	import type { AnyFn } from '$lib/types';
	import { SvelteFlowProvider } from '@xyflow/svelte';
	import { Pane, PaneResizer } from 'paneforge';

	import { onDestroy, onMount, tick } from 'svelte';
	import { browser } from '$app/environment';
	import { showControls, showCallOverlay, showOverview, showArtifacts } from '$lib/stores';

	import Controls from './Controls/Controls.svelte';
	import CallOverlay from './MessageInput/CallOverlay.svelte';
	import Drawer from '../common/Drawer.svelte';
	import Overview from './Overview.svelte';
	import EllipsisVertical from '../icons/EllipsisVertical.svelte';
	import Artifacts from './Artifacts.svelte';





	interface Props {
		/* eslint-disable @typescript-eslint/no-explicit-any */
		history: any;
		models?: any;
		chatId?: any;
		chatFiles?: any;
		params?: any;
		eventTarget: EventTarget;
		submitPrompt: AnyFn;
		stopResponse: AnyFn;
		showMessage: AnyFn;
		files: any;
		modelId: any;
		pane?: any;
		/* eslint-enable @typescript-eslint/no-explicit-any */
	}

	// `models` accepted (part of the public props contract) but not read
	// internally by this component.
	let {
		history = $bindable(),
		chatId = null,
		chatFiles = $bindable([]),
		params = $bindable({}),
		eventTarget,
		submitPrompt,
		stopResponse,
		showMessage,
		files = $bindable(),
		modelId,
		pane = $bindable(null)
	}: Props = $props();

	let mediaQuery;
	let largeScreen = $state(false);
	let dragged = $state(false);

	let minSize = $state(0);

	// Fallback share of the group for the rail, used until the ResizeObserver has
	// measured the container. 350px of a ~1400px chat is about a quarter.
	const FALLBACK_RAIL_SIZE = 25;

	// The rail can already be open before this component exists: ContentRenderer
	// sits earlier in Chat.svelte's markup, so a message carrying an html/svg block
	// sets showControls while this pane is still being created, and Chat.svelte's
	// showControls subscriber has no pane to call openPane() on yet.
	//
	// Opening it AFTER the fact means an imperative resize(), and that turned out to
	// be unreliable in three different ways across three different mount paths --
	// too early to have a layout (resize() throws an assertion that a promise
	// callback swallows), undone again by a later pass, or simply never reached.
	// So the pane is CREATED at the right size instead: paneforge reads defaultSize
	// when it first lays the group out, which is a single well-defined moment that
	// does not depend on how this component came to be mounted.
	//
	// Deliberately a snapshot, not reactive: this is the pane's starting size, and
	// every change after that belongs to openPane() / the user dragging the handle.
	const initialSize = (() => {
		if (!browser || !$showControls) return 0;
		if (!window.matchMedia('(min-width: 1024px)').matches) return 0;

		const stored = parseInt(localStorage?.chatControlsSize);
		return stored > 0 ? stored : FALLBACK_RAIL_SIZE;
	})();

	// paneforge announces a pane's first layout through callPaneCallbacks: onResize
	// always, then onCollapse too when that first size equals collapsedSize. That
	// registration onCollapse is not a user collapse, and honouring it would close
	// a rail that opened before this component existed -- so it is swallowed once.
	// A non-zero first layout emits no collapse at all, which is why the swallow is
	// marked consumed in that case rather than left armed for a real one.
	let paneLaidOut = $state(false);
	let registrationCollapseHandled = false;

	export const openPane = () => {
		const stored = parseInt(localStorage?.chatControlsSize);
		const size = stored || minSize;
		// Never resize to 0 -- that IS a collapse, and it would bounce straight
		// back through onCollapse and close the rail we are trying to open.
		if (size > 0) {
			pane.resize(size);
		}
	};

	const handleMediaQuery = async (e) => {
		if (e.matches) {
			largeScreen = true;

			if ($showCallOverlay) {
				showCallOverlay.set(false);
				await tick();
				showCallOverlay.set(true);
			}
		} else {
			largeScreen = false;

			if ($showCallOverlay) {
				showCallOverlay.set(false);
				await tick();
				showCallOverlay.set(true);
			}
			pane = null;
		}
	};

	const onMouseDown = (_event) => {
		dragged = true;
	};

	const onMouseUp = (_event) => {
		dragged = false;
	};

	onMount(() => {
		// listen to resize 1024px
		mediaQuery = window.matchMedia('(min-width: 1024px)');

		mediaQuery.addEventListener('change', handleMediaQuery);
		handleMediaQuery(mediaQuery);

		// Select the container element you want to observe
		const container = document.getElementById('chat-container');

		// initialize the minSize based on the container width
		minSize = Math.floor((350 / container.clientWidth) * 100);

		// Create a new ResizeObserver instance
		const resizeObserver = new ResizeObserver((entries) => {
			for (let entry of entries) {
				const width = entry.contentRect.width;
				// calculate the percentage of 200px
				const percentage = (350 / width) * 100;
				// set the minSize to the percentage, must be an integer
				minSize = Math.floor(percentage);

				// No pane.resize() here. paneforge enforces minSize itself (passed as a
				// prop below); calling resize() from a resize notification is a
				// callback that writes what it reads, and Svelte aborts the whole
				// reactive graph when it will not settle -- see self.chat#33.
			}
		});

		// Start observing the container's size changes
		resizeObserver.observe(container);

		document.addEventListener('mousedown', onMouseDown);
		document.addEventListener('mouseup', onMouseUp);
	});

	onDestroy(() => {
		showControls.set(false);

		mediaQuery.removeEventListener('change', handleMediaQuery);
		document.removeEventListener('mousedown', onMouseDown);
		document.removeEventListener('mouseup', onMouseUp);
	});

	const closeHandler = () => {
		showControls.set(false);
		showOverview.set(false);
		showArtifacts.set(false);

		if ($showCallOverlay) {
			showCallOverlay.set(false);
		}
	};

	// The rail can be opened by something that runs BEFORE this component's pane
	// exists: ContentRenderer sits earlier in Chat.svelte's markup, so a message's
	// html block flips showControls during the same flush in which this component
	// is still mounting. Chat.svelte's showControls subscriber fires then, sees a
	// null controlPane, and skips openPane() -- and never fires again, because the
	// store is already true. initialSize does not cover it either: that is read at
	// component init, which is earlier still.
	//
	// So catch up here, once the pane exists. `openedRail` is a plain let, not
	// $state, so it is not a tracked dependency -- this effect reads showControls,
	// largeScreen and pane, and writes none of them.
	let openedRail = false;
	$effect(() => {
		if (!$showControls) {
			openedRail = false;
			return;
		}

		// paneLaidOut gates on paneforge's first layout. Before that the pane is
		// absent from the group and resize() throws an assertion -- which is exactly
		// how !134's catch-up failed. It is $state so this effect re-runs when the
		// pane registers, covering both orders: rail opened first, or pane first.
		if (!largeScreen || !pane || !paneLaidOut || openedRail) return;

		openedRail = true;
		openPane();
	});

	$effect(() => {
		if (!chatId) {
			closeHandler();
		}
	});
</script>

<SvelteFlowProvider>
	{#if !largeScreen}
		{#if $showControls}
			<Drawer
				show={$showControls}
				onClose={() => {
					showControls.set(false);
				}}
			>
				<div
					class=" {$showCallOverlay || $showOverview || $showArtifacts
						? ' h-screen  w-screen'
						: 'px-6 py-4'} h-full"
				>
					{#if $showCallOverlay}
						<div
							class=" h-full max-h-[100dvh] bg-white text-gray-700 dark:bg-black dark:text-gray-300 flex justify-center"
						>
							<CallOverlay
								bind:files
								{submitPrompt}
								{stopResponse}
								{modelId}
								{chatId}
								{eventTarget}
								onClose={() => {
									showControls.set(false);
								}}
							/>
						</div>
					{:else if $showArtifacts}
						<Artifacts {history} />
					{:else if $showOverview}
						<Overview
							{history}
							onNodeClick={(detail) => {
								showMessage(detail.node.data.message);
							}}
							onClose={() => {
								showControls.set(false);
							}}
						/>
					{:else}
						<Controls
							onClose={() => {
								showControls.set(false);
							}}
							bind:chatFiles
							bind:params
						/>
					{/if}
				</div>
			</Drawer>
		{/if}
	{:else}
		<!-- if $showControls -->

		{#if $showControls}
			<PaneResizer class="relative flex w-2 items-center justify-center bg-background group">
				<div class="z-10 flex h-7 w-5 items-center justify-center rounded-xs">
					<EllipsisVertical className="size-4 invisible group-hover:visible" />
				</div>
			</PaneResizer>
		{/if}

		<!-- paneforge v1 splits these: `bind:ref` gives the pane's <div>, while the
		     imperative API (resize/collapse/isExpanded/getSize) is exposed as
		     component exports, i.e. `bind:this`. Binding `ref` here compiles clean
		     but leaves every pane.resize()/collapse() call throwing on an
		     HTMLElement -- so the pane never leaves defaultSize={0} and the whole
		     right-hand rail (Controls, Overview, Artifacts) is invisible. -->
		<Pane
			bind:this={pane}
			defaultSize={initialSize}
			{minSize}
			collapsedSize={0}
			onResize={(size) => {
				if (!paneLaidOut) {
					paneLaidOut = true;

					if (size !== 0) {
						// No registration onCollapse is coming, so the next one is real.
						registrationCollapseHandled = true;
					}

					return;
				}

				if ($showControls && pane.isExpanded()) {
					// Persist only. Re-entering resize() from here is what looped:
					// minSize is Math.floor()ed while paneforge lays out in floats, so
					// `size < minSize` could stay true no matter how many times it fired.
					localStorage.chatControlsSize = size < minSize ? 0 : size;
				}
			}}
			onCollapse={() => {
				if (!registrationCollapseHandled) {
					registrationCollapseHandled = true;
					return;
				}
				showControls.set(false);
			}}
			collapsible={true}
			class="pt-8"
		>
			{#if $showControls}
				<div class="pr-4 pb-8 flex max-h-full min-h-full">
					<div
						class="w-full {($showOverview || $showArtifacts) && !$showCallOverlay
							? ' '
							: 'px-4 py-4 bg-white dark:shadow-lg dark:bg-gray-850  border border-gray-50 dark:border-gray-850'}  rounded-xl z-40 pointer-events-auto overflow-y-auto scrollbar-hidden"
					>
						{#if $showCallOverlay}
							<div class="w-full h-full flex justify-center">
								<CallOverlay
									bind:files
									{submitPrompt}
									{stopResponse}
									{modelId}
									{chatId}
									{eventTarget}
									onClose={() => {
										showControls.set(false);
									}}
								/>
							</div>
						{:else if $showArtifacts}
							<Artifacts {history} overlay={dragged} />
						{:else if $showOverview}
							<Overview
								{history}
								onNodeClick={(detail) => {
									if (detail.node.data.message.favorite) {
										history.messages[detail.node.data.message.id].favorite = true;
									} else {
										history.messages[detail.node.data.message.id].favorite = null;
									}

									showMessage(detail.node.data.message);
								}}
								onClose={() => {
									showControls.set(false);
								}}
							/>
						{:else}
							<Controls
								onClose={() => {
									showControls.set(false);
								}}
								bind:chatFiles
								bind:params
							/>
						{/if}
					</div>
				</div>
			{/if}
		</Pane>
	{/if}
</SvelteFlowProvider>
