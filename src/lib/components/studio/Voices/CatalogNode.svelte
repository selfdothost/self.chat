<script lang="ts">
	// CatalogNode.svelte — the ONE generic node component every catalog entry
	// renders through. It looks its descriptor up from the catalog (provided via
	// context by SoundPipelineCanvas) using the node's own `type`, then draws
	// ports and a body purely from that descriptor. Adding a node type is a
	// catalog edit; this component never changes.
	import { getContext } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { Handle, Position, useSvelteFlow, type NodeProps } from '@xyflow/svelte';
	import {
		CATALOG_CONTEXT_KEY,
		PREVIEW_CONTEXT_KEY,
		SAMPLES_CONTEXT_KEY,
		type FieldSpec,
		type NodeCatalog,
		type NodeTypeDescriptor
	} from './nodeCatalog';

	// NodeProps gives us `id`, `type`, `data`, `selected`, etc.
	let { id, type, data, selected }: NodeProps = $props();

	const catalog = getContext<NodeCatalog>(CATALOG_CONTEXT_KEY) ?? {};
	const { updateNodeData } = useSvelteFlow();

	// Runtime-provided select options (the voice's uploaded samples). A `select`
	// field with optionsKey 'samples' renders these instead of static options.
	const sampleOptions =
		getContext<Array<{ label: string; value: string }>>(SAMPLES_CONTEXT_KEY) ?? [];
	function optionsFor(field: FieldSpec): Array<{ label: string; value: string }> {
		if (field.optionsKey === 'samples') return sampleOptions;
		return field.options ?? [];
	}

	// Preview action — provided by SoundPipelineCanvas only when a real voice is
	// being built (Phase 3). Returns the synthesised audio blob (or null); this
	// component owns PLAYBACK because it runs inside the click gesture. null on
	// the stub canvas → no Play button.
	const runPreview =
		getContext<((nodeId: string, text: string) => Promise<Blob | null>) | null>(
			PREVIEW_CONTEXT_KEY
		) ?? null;
	let previewing = $state(false);

	// A 44-byte silent WAV. We play THIS through `previewAudio` synchronously
	// inside the click gesture to "unlock" the element (grant it persistent
	// autoplay permission). Chatterbox synthesis takes several seconds, so by the
	// time the real blob arrives the transient user-activation is long gone and a
	// fresh `new Audio().play()` would be blocked — but an already-unlocked
	// element replays programmatically. This is the fix for "Preview made no
	// sound": the backend always returned audio; it just never played.
	const SILENT_WAV =
		'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';
	let previewAudio: HTMLAudioElement | null = null;
	let lastUrl: string | null = null;

	async function handlePreview() {
		if (previewing || !runPreview) return;
		previewing = true;
		// Unlock the reusable audio element within the gesture (do NOT await the
		// unlock before kicking off synth — but do start it now so the element is
		// activated). A rejected unlock (rare) is harmless.
		if (!previewAudio) previewAudio = new Audio();
		const el = previewAudio;
		try {
			el.src = SILENT_WAV;
			await el.play().catch(() => {});
			el.pause();
			el.currentTime = 0;
		} catch {
			/* unlock best-effort */
		}
		try {
			const blob = await runPreview(id, (values.text as string) ?? '');
			if (!blob) return;
			if (lastUrl) URL.revokeObjectURL(lastUrl);
			lastUrl = URL.createObjectURL(blob);
			el.src = lastUrl;
			await el.play();
		} catch (err) {
			// Autoplay still blocked, or decode failed — surface it instead of
			// swallowing (the original bug hid every failure).
			toast.error(
				`Could not play preview: ${err instanceof Error ? err.message : err}. Click Play again.`
			);
		} finally {
			previewing = false;
		}
	}

	// Pure derivations — no lifecycle hook reassigns anything here (that is the
	// #28 anti-pattern). The descriptor and current values are read straight off
	// props/context on every render.
	const descriptor = $derived<NodeTypeDescriptor | undefined>(catalog[type as string]);
	const values = $derived<Record<string, unknown>>(
		(data?.values as Record<string, unknown>) ?? {}
	);

	function patch(key: string, value: unknown) {
		// updateNodeData is xyflow's own state mutation — it owns nodes/edges, so
		// we never touch a locally-derived store here.
		updateNodeData(id, { values: { ...values, [key]: value } });
	}

	function portTop(index: number, count: number): string {
		// Evenly distribute handles down the node's vertical edge.
		return `${((index + 1) / (count + 1)) * 100}%`;
	}
</script>

{#if descriptor}
	<div
		class="sound-node min-w-40 overflow-hidden rounded-xl border border-l-4 border-gray-50 dark:border-gray-850 bg-white dark:bg-gray-900 text-xs text-gray-800 dark:text-gray-200 shadow-sm"
		class:selected
		style={`--accent: ${descriptor.accent ?? '#64748b'}; border-left-color: ${descriptor.accent ?? '#64748b'}`}
		data-testid={`catalog-node-${type}`}
	>
		<!-- Input ports (targets) on the left edge -->
		{#each descriptor.inputs as port, i (port.id)}
			<Handle
				type="target"
				position={Position.Left}
				id={port.id}
				style={`top: ${portTop(i, descriptor.inputs.length)}`}
			/>
		{/each}

		<div
			class="px-2.5 py-1.5 font-medium text-gray-700 dark:text-gray-200 border-b border-gray-50 dark:border-gray-850"
		>
			<span>{descriptor.label}</span>
		</div>

		<div class="flex flex-col gap-1.5 p-2.5">
			{#if descriptor.body}
				<!-- Custom body component from the descriptor -->
				<descriptor.body {values} onchange={(p) => updateNodeData(id, { values: { ...values, ...p } })} />
			{:else if descriptor.fields && descriptor.fields.length}
				{#each descriptor.fields as field (field.key)}
					<label class="flex flex-col gap-0.5">
						<span class="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500"
							>{field.label}</span
						>
						{#if field.type === 'select'}
							<select
								class="nodrag rounded-lg border-0 bg-gray-50 dark:bg-gray-800 px-2 py-1 text-xs text-gray-800 dark:text-gray-200 outline-none"
								value={(values[field.key] as string) ?? ''}
								onchange={(e) => patch(field.key, e.currentTarget.value)}
							>
								<option value="" disabled>
									{optionsFor(field).length ? 'pick a sample…' : 'no samples uploaded'}
								</option>
								{#each optionsFor(field) as opt (opt.value)}
									<option value={opt.value}>{opt.label}</option>
								{/each}
							</select>
						{:else if field.type === 'checkbox'}
							<input
								class="nodrag self-start"
								type="checkbox"
								checked={Boolean(values[field.key])}
								onchange={(e) => patch(field.key, e.currentTarget.checked)}
							/>
						{:else if field.type === 'number'}
							<input
								class="nodrag rounded-lg border-0 bg-gray-50 dark:bg-gray-800 px-2 py-1 text-xs text-gray-800 dark:text-gray-200 outline-none"
								type="number"
								step="any"
								value={(values[field.key] as number) ?? ''}
								placeholder={field.placeholder ?? ''}
								onchange={(e) => patch(field.key, e.currentTarget.valueAsNumber)}
							/>
						{:else}
							<input
								class="nodrag rounded-lg border-0 bg-gray-50 dark:bg-gray-800 px-2 py-1 text-xs text-gray-800 dark:text-gray-200 outline-none"
								type="text"
								value={(values[field.key] as string) ?? ''}
								placeholder={field.placeholder ?? ''}
								oninput={(e) => patch(field.key, e.currentTarget.value)}
							/>
						{/if}
					</label>
				{/each}
			{:else}
				<div class="text-[11px] text-gray-400 dark:text-gray-500">{descriptor.description ?? ''}</div>
			{/if}

			{#if type === 'preview' && runPreview}
				<!-- Live Preview: synthesise the text in the crafted voice and play it. -->
				<button
					class="nodrag mt-0.5 inline-flex items-center justify-center gap-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-2 py-1 text-[11px] font-medium text-white transition"
					onclick={handlePreview}
					disabled={previewing}
				>
					{previewing ? 'Synthesising…' : '▶ Play'}
				</button>
			{/if}
		</div>

		<!-- Output ports (sources) on the right edge -->
		{#each descriptor.outputs as port, i (port.id)}
			<Handle
				type="source"
				position={Position.Right}
				id={port.id}
				style={`top: ${portTop(i, descriptor.outputs.length)}`}
			/>
		{/each}
	</div>
{:else}
	<!-- Unknown type (catalog changed out from under a persisted graph). Render
	     a visible stub rather than crashing. -->
	<div
		class="min-w-40 overflow-hidden rounded-xl border border-l-4 border-gray-50 border-l-red-500 dark:border-gray-850 bg-white dark:bg-gray-900 text-xs opacity-80"
		data-testid="catalog-node-unknown"
	>
		<div class="px-2.5 py-1.5 font-medium text-gray-700 dark:text-gray-200">
			<span>Unknown: {type}</span>
		</div>
	</div>
{/if}

<style>
	/* Per-type accent ring on selection — the one thing Tailwind can't express
	   because the accent color is dynamic (set via the inline --accent var). */
	.sound-node.selected {
		box-shadow: 0 0 0 2px var(--accent);
	}
</style>
