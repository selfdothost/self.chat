<script lang="ts">
	// cavekit-browse-web-access.md R9: the surface for a direct page read.
	//
	// Deliberately not WebSearchResults: that is a collapsible list built for
	// "here are the N sites a search touched". A web_fetch is one page the user
	// or the model named, so the useful thing to show is that page — inline,
	// already visible, no disclosure to open. A one-item collapsible would be a
	// worse version of a link.
	export let status: { url?: string; title?: string; done?: boolean; error?: boolean } = {};

	// The host, not the full URL: the path on a real article URL is long enough
	// to swallow the row, and the host is what tells a reader where this came
	// from. The full URL is still the link target and the hover title.
	const hostOf = (url: string): string => {
		try {
			return new URL(url).hostname.replace(/^www\./, '');
		} catch {
			return url;
		}
	};
</script>

<div class="flex items-center gap-1.5 min-w-0">
	<slot />

	{#if status?.url}
		<a
			href={status.url}
			target="_blank"
			rel="external noreferrer"
			title={status.title ? `${status.title} — ${status.url}` : status.url}
			class="inline-flex items-center gap-1 min-w-0 max-w-[20rem] px-2 py-0.5 rounded-lg text-sm
				border border-gray-300/30 dark:border-gray-700/50
				text-gray-700 dark:text-gray-300
				hover:bg-gray-50 dark:hover:bg-gray-800/50 transition no-underline
				{status?.error ? 'line-through opacity-60' : ''}"
		>
			<span class="line-clamp-1 break-all">{hostOf(status.url)}</span>

			<svg
				xmlns="http://www.w3.org/2000/svg"
				viewBox="0 0 16 16"
				fill="currentColor"
				class="size-3.5 shrink-0 opacity-60"
			>
				<path
					fill-rule="evenodd"
					d="M4.22 11.78a.75.75 0 0 1 0-1.06L9.44 5.5H5.75a.75.75 0 0 1 0-1.5h5.5a.75.75 0 0 1 .75.75v5.5a.75.75 0 0 1-1.5 0V6.56l-5.22 5.22a.75.75 0 0 1-1.06 0Z"
					clip-rule="evenodd"
				/>
			</svg>
		</a>
	{/if}
</div>
