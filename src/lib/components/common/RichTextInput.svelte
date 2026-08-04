<script lang="ts">
	import type { AnyFn } from '$lib/types';
	import { marked } from 'marked';
	import TurndownService from 'turndown';
	const turndownService = new TurndownService({
		codeBlockStyle: 'fenced',
		headingStyle: 'atx'
	});
	turndownService.escape = (string) => string;

	import { onMount, onDestroy } from 'svelte';

	import { TextSelection } from 'prosemirror-state';

	import { Editor } from '@tiptap/core';

	import { AIAutocompletion } from './RichTextInput/AutoCompletion.js';

	import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
	import Placeholder from '@tiptap/extension-placeholder';
	import Highlight from '@tiptap/extension-highlight';
	import Typography from '@tiptap/extension-typography';
	import StarterKit from '@tiptap/starter-kit';
	import { all, createLowlight } from 'lowlight';

	import { PASTED_TEXT_CHARACTER_LIMIT } from '$lib/constants';

	// create a lowlight instance with all languages loaded
	const lowlight = createLowlight(all);


	interface Props {
		className?: string;
		placeholder?: string;
		value?: string;
		id?: string;
		preserveBreaks?: boolean;
		generateAutoCompletion?: AnyFn;
		autocomplete?: boolean;
		messageInput?: boolean;
		shiftEnter?: boolean;
		largeTextAsFile?: boolean;
		onKeydown?: AnyFn;
		onPaste?: AnyFn;
	}

	let {
		className = 'input-prose',
		placeholder = 'Type here...',
		value = $bindable(''),
		id = '',
		preserveBreaks = false,
		generateAutoCompletion = async () => null,
		autocomplete = false,
		messageInput = false,
		shiftEnter = false,
		largeTextAsFile = false,
		onKeydown = () => {},
		onPaste = () => {}
	}: Props = $props();

	let element: HTMLDivElement | undefined = $state();
	let editor: Editor | undefined = $state();

	// Function to find the next template in the document
	function findNextTemplate(doc, from = 0) {
		const patterns = [
			{ start: '[', end: ']' },
			{ start: '{{', end: '}}' }
		];

		let result = null;

		doc.nodesBetween(from, doc.content.size, (node, pos) => {
			if (result) return false; // Stop if we've found a match
			if (node.isText) {
				const text = node.text;
				let index = Math.max(0, from - pos);
				while (index < text.length) {
					for (const pattern of patterns) {
						if (text.startsWith(pattern.start, index)) {
							const endIndex = text.indexOf(pattern.end, index + pattern.start.length);
							if (endIndex !== -1) {
								result = {
									from: pos + index,
									to: pos + endIndex + pattern.end.length
								};
								return false; // Stop searching
							}
						}
					}
					index++;
				}
			}
		});

		return result;
	}

	// Function to select the next template in the document
	function selectNextTemplate(state, dispatch) {
		const { doc, selection } = state;
		const from = selection.to;
		let template = findNextTemplate(doc, from);

		if (!template) {
			// If not found, search from the beginning
			template = findNextTemplate(doc, 0);
		}

		if (template) {
			if (dispatch) {
				const tr = state.tr.setSelection(TextSelection.create(doc, template.from, template.to));
				dispatch(tr);
			}
			return true;
		}
		return false;
	}

	export const setContent = (content) => {
		editor.commands.setContent(content);
	};

	const selectTemplate = () => {
		if (value !== '') {
			// After updating the state, try to find and select the next template
			setTimeout(() => {
				const templateFound = selectNextTemplate(editor.view.state, editor.view.dispatch);
				if (!templateFound) {
					// If no template found, set cursor at the end
					const endPos = editor.view.state.doc.content.size;
					editor.view.dispatch(
						editor.view.state.tr.setSelection(TextSelection.create(editor.view.state.doc, endPos))
					);
				}
			}, 0);
		}
	};

	onMount(async () => {
		console.log(value);

		if (preserveBreaks) {
			turndownService.addRule('preserveBreaks', {
				filter: 'br', // Target <br> elements
				replacement: function (_content) {
					return '<br/>';
				}
			});
		}

		async function tryParse(value, attempts = 3, interval = 100) {
			try {
				// Try parsing the value
				return marked.parse(value.replaceAll(`\n<br/>`, `<br/>`), {
					breaks: false
				});
			} catch {
				// If no attempts remain, fallback to plain text
				if (attempts <= 1) {
					return value;
				}
				// Wait for the interval, then retry
				await new Promise((resolve) => setTimeout(resolve, interval));
				return tryParse(value, attempts - 1, interval); // Recursive call
			}
		}

		// Usage example
		let content = await tryParse(value);

		editor = new Editor({
			element: element,
			extensions: [
				StarterKit.configure({
					codeBlock: false,
					// Default shouldAutoLink treats any bare `word.tld`-shaped text as a
					// link (no scheme/www required) as long as the "hostname" contains a
					// dot and isn't a bare IP -- so typing e.g. "self.ai" in a sentence
					// silently becomes <a href="http://self.ai">, an unrelated domain
					// (self.chat#21). Require an explicit scheme or "www." before
					// auto-linking; a real pasted/typed URL still works either way.
					link: {
						shouldAutoLink: (url) => /^[a-z][a-z0-9+.-]*:\/\//i.test(url) || /^www\./i.test(url)
					}
				}),
				CodeBlockLowlight.configure({
					lowlight
				}),
				Highlight,
				Typography,
				Placeholder.configure({ placeholder }),
				...(autocomplete
					? [
							AIAutocompletion.configure({
								generateCompletion: async (text) => {
									if (text.trim().length === 0) {
										return null;
									}

									const suggestion = await generateAutoCompletion(text).catch(() => null);
									if (!suggestion || suggestion.trim().length === 0) {
										return null;
									}

									return suggestion;
								}
							})
						]
					: [])
			],
			content: content,
			autofocus: messageInput ? true : false,
			onTransaction: () => {
				// force re-render so `editor.isActive` works as expected
				editor = editor;
				let newValue = turndownService
					.turndown(
						editor
							.getHTML()
							.replace(/<p><\/p>/g, '<br/>')
							.replace(/ {2,}/g, (m) => m.replace(/ /g, '\u00a0'))
					)
					.replace(/\u00a0/g, ' ');

				if (!preserveBreaks) {
					newValue = newValue.replace(/<br\/>/g, '');
				}

				if (value !== newValue) {
					value = newValue;

					// check if the node is paragraph as well
					if (editor.isActive('paragraph')) {
						if (value === '') {
							editor.commands.clearContent();
						}
					}
				}
			},
			editorProps: {
				attributes: { id },
				handleDOMEvents: {
					keydown: (view, event) => {
						if (messageInput) {
							// Handle Tab Key
							if (event.key === 'Tab') {
								const handled = selectNextTemplate(view.state, view.dispatch);
								if (handled) {
									event.preventDefault();
									return true;
								}
							}

							if (event.key === 'Enter') {
								// Check if the current selection is inside a structured block (like codeBlock or list)
								const { state } = view;
								// Svelte reserves the `$` prefix in runes mode, so ProseMirror's
								// own `$head` (a resolved position) is renamed on destructure.
								const { $head: head } = state.selection;

								// Recursive function to check ancestors for specific node types
								const isInside = (nodeTypes: string[]): boolean => {
									let currentNode = head;
									while (currentNode) {
										if (nodeTypes.includes(currentNode.parent.type.name)) {
											return true;
										}
										if (!currentNode.depth) break; // Stop if we reach the top
										currentNode = state.doc.resolve(currentNode.before()); // Move to the parent node
									}
									return false;
								};

								const isInCodeBlock = isInside(['codeBlock']);
								const isInList = isInside(['listItem', 'bulletList', 'orderedList']);
								const isInHeading = isInside(['heading']);

								if (isInCodeBlock || isInList || isInHeading) {
									// Let ProseMirror handle the normal Enter behavior
									return false;
								}
							}

							// Handle shift + Enter for a line break
							if (shiftEnter) {
								if (event.key === 'Enter' && event.shiftKey && !event.ctrlKey && !event.metaKey) {
									editor.commands.setHardBreak(); // Insert a hard break
									view.dispatch(view.state.tr.scrollIntoView()); // Move viewport to the cursor
									event.preventDefault();
									return true;
								}
							}
						}
						onKeydown({ event });
						return false;
					},
					paste: (view, event) => {
						if (event.clipboardData) {
							// Extract plain text from clipboard and paste it without formatting
							const plainText = event.clipboardData.getData('text/plain');
							if (plainText) {
								if (largeTextAsFile) {
									if (plainText.length > PASTED_TEXT_CHARACTER_LIMIT) {
										// Dispatch paste event to parent component
										onPaste({ event });
										event.preventDefault();
										return true;
									}
								}
								return false;
							}

							// Check if the pasted content contains image files
							const hasImageFile = Array.from(event.clipboardData.files).some((file) =>
								file.type.startsWith('image/')
							);

							// Check for image in dataTransfer items (for cases where files are not available)
							const hasImageItem = Array.from(event.clipboardData.items).some((item) =>
								item.type.startsWith('image/')
							);
							if (hasImageFile) {
								// If there's an image, dispatch the event to the parent
								onPaste({ event });
								event.preventDefault();
								return true;
							}

							if (hasImageItem) {
								// If there's an image item, dispatch the event to the parent
								onPaste({ event });
								event.preventDefault();
								return true;
							}
						}

						// For all other cases (text, formatted text, etc.), let ProseMirror handle it
						view.dispatch(view.state.tr.scrollIntoView()); // Move viewport to the cursor after pasting
						return false;
					}
				}
			}
		});

		if (messageInput) {
			selectTemplate();
		}
	});

	onDestroy(() => {
		if (editor) {
			editor.destroy();
		}
	});

	// Update the editor content if the external `value` changes
	$effect(() => {
		if (
			editor &&
			value !==
				turndownService
					.turndown(
						(preserveBreaks
							? editor.getHTML().replace(/<p><\/p>/g, '<br/>')
							: editor.getHTML()
						).replace(/ {2,}/g, (m) => m.replace(/ /g, '\u00a0'))
					)
					.replace(/\u00a0/g, ' ')
		) {
			editor.commands.setContent(
				marked.parse(value.replaceAll(`\n<br/>`, `<br/>`), {
					breaks: false
				})
			); // Update editor content
			selectTemplate();
		}
	});
</script>

<div bind:this={element} class="relative w-full min-w-full h-full min-h-fit {className}"></div>
