<script lang="ts">
	import { onDestroy } from 'svelte';
	import { fly } from 'svelte/transition';
	import type { AnyFn } from '$lib/types';

	interface Props {
		show?: boolean;
		className?: string;
		children?: import('svelte').Snippet;
		onClose?: AnyFn;
	}

	let {
		show = $bindable(false),
		className = '',
		children,
		onClose = () => {}
	}: Props = $props();

	let modalElement = $state(null);

	const handleKeyDown = (event: KeyboardEvent) => {
		if (event.key === 'Escape' && isTopModal()) {
			console.log('Escape');
			show = false;
		}
	};

	const isTopModal = () => {
		const modals = document.getElementsByClassName('modal');
		return modals.length && modals[modals.length - 1] === modalElement;
	};

	$effect(() => {
		if (show && modalElement) {
			document.body.appendChild(modalElement);
			window.addEventListener('keydown', handleKeyDown);
			document.body.style.overflow = 'hidden';
		} else if (modalElement) {
			onClose();
			window.removeEventListener('keydown', handleKeyDown);

			if (document.body.contains(modalElement)) {
				document.body.removeChild(modalElement);
				document.body.style.overflow = 'unset';
			}
		}
	});

	onDestroy(() => {
		show = false;
		if (modalElement) {
			if (document.body.contains(modalElement)) {
				document.body.removeChild(modalElement);
				document.body.style.overflow = 'unset';
			}
		}
	});
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->

<div
	bind:this={modalElement}
	class="modal fixed right-0 left-0 bottom-0 bg-black/60 w-full h-screen max-h-[100dvh] flex justify-center z-[999] overflow-hidden overscroll-contain"
	in:fly={{ y: 100, duration: 100 }}
	onmousedown={() => {
		show = false;
	}}
>
	<div
		class=" mt-auto max-w-full w-full bg-gray-50 dark:bg-gray-900 dark:text-gray-100 {className} max-h-[100dvh] overflow-y-auto scrollbar-hidden"
		onmousedown={(e) => {
			e.stopPropagation();
		}}
	>
		{@render children?.()}
	</div>
</div>

<style>
	.modal-content {
		animation: scaleUp 0.1s ease-out forwards;
	}

	@keyframes scaleUp {
		from {
			transform: scale(0.985);
			opacity: 0;
		}
		to {
			transform: scale(1);
			opacity: 1;
		}
	}
</style>
