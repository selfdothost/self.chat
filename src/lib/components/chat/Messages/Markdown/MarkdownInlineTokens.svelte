<script lang="ts">
	import MarkdownInlineTokens from './MarkdownInlineTokens.svelte';
	import type { i18n as i18nType } from 'i18next';
	import type { Writable } from 'svelte/store';
	import type { AnyFn } from '$lib/types';
	import DOMPurify from 'dompurify';
	import { toast } from 'svelte-sonner';

	import type { Token } from 'marked';
	import { getContext } from 'svelte';

	const i18n: Writable<i18nType> = getContext('i18n');

	import { WEBUI_BASE_URL } from '$lib/constants';
	import {
		copyToClipboard,
		matchTrustedFileIframeSrc,
		resizeIframeToContent,
		revertSanitizedResponseContent,
		sanitizeHref,
		unescapeHtml
	} from '$lib/utils';

	import Image from '$lib/components/common/Image.svelte';
	import KatexRenderer from './KatexRenderer.svelte';
	import Source from './Source.svelte';

	interface Props {
		id: string;
		tokens: Token[];
		onSourceClick?: AnyFn;
	}

	let { id, tokens, onSourceClick = () => {} }: Props = $props();
</script>

<!-- marked Token union has no stable identity field and raw text can repeat (e.g. duplicate words/formatting); tokens are only ever rendered in the fixed order marked produced, never reordered/filtered, so index is fine -->
{#each tokens as token, tokenIdx (tokenIdx)}
	{#if token.type === 'escape'}
		{unescapeHtml(token.text)}
	{:else if token.type === 'html'}
		{@const html = DOMPurify.sanitize(token.text)}
		{#if html && html.includes('<video')}
			<!-- eslint-disable-next-line svelte/no-at-html-tags -- `html` is DOMPurify.sanitize(token.text) with default (safe) config, no added tags/attrs -->
			{@html html}
		{:else if matchTrustedFileIframeSrc(token.text)}
			<!-- self.chat#7: real Svelte element, not {@html} -- the src is extracted only
			     after anchoring the WHOLE token text to the one shape we generate
			     (see matchTrustedFileIframeSrc), and the resize behavior is a fixed
			     bound handler, never an onload value taken from the content. -->
			<iframe
				src={matchTrustedFileIframeSrc(token.text)}
				title={$i18n.t('Embedded file preview')}
				width="100%"
				frameborder="0"
				onload={resizeIframeToContent}
			></iframe>
		{:else if token.text.includes(`<source_id`)}
			<Source {token} onClick={onSourceClick} />
		{:else}
			{token.text}
		{/if}
	{:else if token.type === 'link'}
		{#if token.tokens}
			<a href={sanitizeHref(token.href)} target="_blank" rel="nofollow external" title={token.title}>
				<MarkdownInlineTokens id={`${id}-a`} tokens={token.tokens} {onSourceClick} />
			</a>
		{:else}
			<a href={sanitizeHref(token.href)} target="_blank" rel="nofollow external" title={token.title}>{token.text}</a>
		{/if}
	{:else if token.type === 'image'}
		<Image src={token.href} alt={token.text} />
	{:else if token.type === 'strong'}
		<strong>
			<MarkdownInlineTokens id={`${id}-strong`} tokens={token.tokens} {onSourceClick} />
		</strong>
	{:else if token.type === 'em'}
		<em>
			<MarkdownInlineTokens id={`${id}-em`} tokens={token.tokens} {onSourceClick} />
		</em>
	{:else if token.type === 'codespan'}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
		<code
			class="codespan cursor-pointer"
			onclick={() => {
				copyToClipboard(unescapeHtml(token.text));
				toast.success($i18n.t('Copied to clipboard'));
			}}>{unescapeHtml(token.text)}</code
		>
	{:else if token.type === 'br'}
		<br />
	{:else if token.type === 'del'}
		<del>
			<MarkdownInlineTokens id={`${id}-del`} tokens={token.tokens} {onSourceClick} />
		</del>
	{:else if token.type === 'inlineKatex'}
		{#if token.text}
			<KatexRenderer content={revertSanitizedResponseContent(token.text)} displayMode={false} />
		{/if}
	{:else if token.type === 'iframe'}
		<iframe
			src="{WEBUI_BASE_URL}/api/v1/files/{token.fileId}/content"
			title={token.fileId}
			width="100%"
			frameborder="0"
			onload={resizeIframeToContent}
		></iframe>
	{:else if token.type === 'text'}
		{token.raw}
	{/if}
{/each}
