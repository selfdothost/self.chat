<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import type { AnyFn } from '$lib/types';
	interface Props {
		children?: import('svelte').Snippet;
		onVisible?: AnyFn;
	}

	let { children, onVisible = () => {} }: Props = $props();

	let loaderElement: HTMLElement = $state();

	let observer;
	let intervalId;

	onMount(() => {
		observer = new IntersectionObserver(
			(entries, _observer) => {
				entries.forEach((entry) => {
					if (entry.isIntersecting) {
						// Clear any interval already running before starting a new one --
						// without this, every intersection crossing leaks another
						// concurrent 100ms interval (never reachable again to clear),
						// each one independently re-triggering onVisible() and its
						// scroll/render side effects forever. Confirmed live: this
						// compounded a chat view from ~26MB to 4GB+ of heap within
						// ~20 seconds of opening any chat long enough to scroll the
						// loader in and out of view.
						if (intervalId) {
							clearInterval(intervalId);
						}
						intervalId = setInterval(() => {
							onVisible();
						}, 100);
					} else {
						clearInterval(intervalId);
					}
				});
			},
			{
				root: null, // viewport
				rootMargin: '0px',
				threshold: 0.1 // When 10% of the loader is visible
			}
		);

		observer.observe(loaderElement);
	});

	onDestroy(() => {
		observer.disconnect();

		if (intervalId) {
			clearInterval(intervalId);
		}
	});
</script>

<div bind:this={loaderElement}>
	{@render children?.()}
</div>
