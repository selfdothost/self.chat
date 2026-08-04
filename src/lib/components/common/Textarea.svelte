<script lang="ts">
	import type { AnyFn } from '$lib/types';
	import { onMount, tick } from 'svelte';


	// This is a contenteditable div (see below), not a real <textarea>, so
	// there's no native `rows` attribute to size it by -- it auto-grows via
	// `field-sizing: content` instead. Several callers still pass `rows` out
	// of habit from the native-textarea API; accepted (and intentionally
	
	// Same story as `rows` -- a contenteditable div has no native `required`
	// validation; accepted (and intentionally unused) so callers passing it
	

	interface Props {
		value?: string;
		placeholder?: string;
		className?: string;
		// unused) so those call sites type-check rather than error.
		rows?: number | undefined;
		// out of native-textarea habit still type-check.
		required?: boolean | undefined;
		onKeydown?: AnyFn;
	}

	// rows/required accepted (part of the public props contract, matching a
	// native textarea's attributes) but not read internally by this component.
	let {
		value = $bindable(''),
		placeholder = '',
		className = 'w-full rounded-lg px-3 py-2 text-sm bg-gray-50 dark:text-gray-300 dark:bg-gray-850 outline-hidden resize-none h-full',
		onKeydown = () => {}
	}: Props = $props();

	let textareaElement: HTMLDivElement | undefined = $state();

	$effect(() => {
		if (textareaElement) {
			if (textareaElement.innerText !== value && value !== '') {
				// Deliberate: this is a contenteditable div, not a real <textarea>, so there's no
				// Svelte-native binding target for its content. The equality guard above only writes
				// on external value changes (not on every keystroke, which flows the other way via
				// on:input below), which is what avoids disrupting cursor position while typing.
				// eslint-disable-next-line svelte/no-dom-manipulating
				textareaElement.innerText = value ?? '';
			}
		}
	});

	// Adjust height on mount and after setting the element.
	onMount(async () => {
		await tick();
	});

	// Handle paste event to ensure only plaintext is pasted
	function handlePaste(event: ClipboardEvent) {
		event.preventDefault(); // Prevent the default paste action
		const clipboardData = event.clipboardData?.getData('text/plain'); // Get plaintext from clipboard

		// Insert plaintext into the textarea
		document.execCommand('insertText', false, clipboardData);
	}
</script>

<div
	contenteditable="true"
	role="textbox"
	tabindex="0"
	aria-multiline="true"
	bind:this={textareaElement}
	class="{className} whitespace-pre-wrap relative {value
		? !value.trim()
			? 'placeholder'
			: ''
		: 'placeholder'}"
	style="field-sizing: content; -moz-user-select: text !important;"
	oninput={() => {
		const text = textareaElement.innerText;
		if (text === '\n') {
			value = '';
			return;
		}

		value = text;
	}}
	onpaste={handlePaste}
	onkeydown={onKeydown}
	data-placeholder={placeholder}
></div>

<style>
	.placeholder::before {
		/* absolute */
		position: absolute;
		content: attr(data-placeholder);
		color: #adb5bd;
		overflow: hidden;
		display: -webkit-box;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 1;
		pointer-events: none;
		touch-action: none;
	}
</style>
