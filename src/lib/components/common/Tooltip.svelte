<script lang="ts">
	import DOMPurify from 'dompurify';

	import { onDestroy } from 'svelte';

	import tippy from 'tippy.js';
	import type { Placement, Instance } from 'tippy.js';

	// Narrowed to tippy's Placement union -- a plain `let` initializer would
	// otherwise widen to `string`, which tippy() doesn't accept.
	interface Props {
		placement?: Placement;
		/* eslint-disable @typescript-eslint/no-explicit-any */
		content?: any;
		touch?: boolean;
		className?: string;
		theme?: string;
		allowHTML?: boolean;
		tippyOptions?: any;
		/* eslint-enable @typescript-eslint/no-explicit-any */
		children?: import('svelte').Snippet;
	}

	let {
		placement = 'top',
		content = `I'm a tooltip!`,
		touch = true,
		className = 'flex',
		theme = '',
		allowHTML = true,
		tippyOptions = {},
		children
	}: Props = $props();

	let tooltipElement: HTMLDivElement | undefined = $state();
	let tooltipInstance: Instance | undefined = $state();

	$effect(() => {
		if (tooltipElement && content) {
			if (tooltipInstance) {
				tooltipInstance.setContent(DOMPurify.sanitize(content));
			} else {
				tooltipInstance = tippy(tooltipElement, {
					content: DOMPurify.sanitize(content),
					placement: placement,
					allowHTML: allowHTML,
					touch: touch,
					...(theme !== '' ? { theme } : { theme: 'dark' }),
					arrow: false,
					offset: [0, 4],
					...tippyOptions
				});
			}
		} else if (tooltipInstance && content === '') {
			if (tooltipInstance) {
				tooltipInstance.destroy();
			}
		}
	});

	onDestroy(() => {
		if (tooltipInstance) {
			tooltipInstance.destroy();
		}
	});
</script>

<div bind:this={tooltipElement} aria-label={DOMPurify.sanitize(content)} class={className}>
	{@render children?.()}
</div>
