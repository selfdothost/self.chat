<script lang="ts">
	// Admin voice curation (cavekit-audio-voice-picker R1 + R4), reached from the
	// admin Audio surface (cavekit-audio-admin-surface R2).
	//
	// Reads /voices/curation — the ADMIN view of the aggregated catalog — not
	// /voices/selectable. Selectable is the enabled-only downstream set; using it
	// here would hide precisely the disabled voices an admin came to re-enable.
	import type { i18n as i18nType } from 'i18next';
	import type { Writable } from 'svelte/store';
	import type { AnyFn } from '$lib/types';
	import { getContext } from 'svelte';
	import { toast } from 'svelte-sonner';

	import type { VoiceCurationEntry } from '$lib/apis/audio';
	import { getVoiceCuration, setVoiceEnabled } from '$lib/apis/audio';

	import Modal from '$lib/components/common/Modal.svelte';
	import Switch from '$lib/components/common/Switch.svelte';
	import Spinner from '$lib/components/common/Spinner.svelte';
	import Tooltip from '$lib/components/common/Tooltip.svelte';
	import Search from '$lib/components/icons/Search.svelte';

	const i18n: Writable<i18nType> = getContext('i18n');


	// Called when the modal closes, with `true` if at least one voice was
	// successfully toggled while it was open. The parent (the admin Audio tab)
	// uses this to refetch — curation gates the downstream selectable set, so a
	
	interface Props {
		show?: boolean;
		// default-voice picker rendered behind this modal can go stale.
		onClose?: AnyFn;
	}

	let { show = $bindable(false), onClose = () => {} }: Props = $props();

	let voices: VoiceCurationEntry[] = $state([]);
	let loading = $state(true);
	let searchValue = $state('');
	let changed = false;

	// Every declaration below is deliberately placed BEFORE the `$:` blocks that
	// call it — a reactive statement referencing a later binding trips eslint's
	// no-useless-assignment on this repo.

	const displayName = (voice: VoiceCurationEntry) => voice.name?.trim() || voice.id;

	// R4: the source connection is part of a voice's identity here, so it is also
	// part of what search matches — an admin narrowing to one backend's voices
	// should be able to type that backend's name.
	const sourceLabel = (voice: VoiceCurationEntry) =>
		voice.source_connection_label?.trim() || voice.source_connection_id?.trim() || '';

	const matchesSearch = (voice: VoiceCurationEntry, query: string) => {
		const q = query.trim().toLowerCase();
		if (q === '') return true;

		return [voice.id, voice.name, voice.language, voice.gender, sourceLabel(voice)]
			.filter((field): field is string => typeof field === 'string' && field !== '')
			.some((field) => field.toLowerCase().includes(q));
	};

	const errorMessage = (err: unknown) => {
		if (typeof err === 'string') return err;
		const shaped = err as { detail?: string; message?: string } | null;
		return shaped?.detail ?? shaped?.message ?? String(err);
	};

	const init = async () => {
		loading = true;
		// Never throws: a deployment with no self-hosted TTS connection yields []
		// by design, which is a legitimate empty state rather than a failure.
		voices = await getVoiceCuration(localStorage.token);
		loading = false;
	};

	// Optimistic toggle, reverted on failure. setVoiceEnabled throws on failure
	// precisely so this can happen; the write and the /voices/curation read hit
	// the same AUDIO_TTS_ENABLED_VOICES map, so an accepted toggle is what the
	// next load of this list (and the downstream selectable set) will show.
	const toggleVoiceHandler = async (voice: VoiceCurationEntry, enabled: boolean) => {
		const previous = voice.enabled;
		if (previous === enabled) return;

		const applyTo = (id: string, value: boolean) =>
			voices.map((v) => (v.id === id ? { ...v, enabled: value } : v));

		voices = applyTo(voice.id, enabled);

		try {
			await setVoiceEnabled(localStorage.token, voice.id, enabled);
			changed = true;
		} catch (err) {
			voices = applyTo(voice.id, previous);
			toast.error(
				$i18n.t('Failed to update voice availability: {{error}}', {
					error: errorMessage(err)
				})
			);
		}
	};

	// Modal.svelte exposes no close event — it just flips `show` (backdrop click,
	// Escape, the X button). Watching the transition is the only way to run an
	// open/close hook for every path.
	let opened = false;
	const handleVisibilityChange = (visible: boolean) => {
		if (visible && !opened) {
			opened = true;
			changed = false;
			searchValue = '';
			init();
		} else if (!visible && opened) {
			opened = false;
			onClose(changed);
		}
	};

	$effect(() => {
		handleVisibilityChange(show);
	});

	// Client-side filtering over the fetched set, matching the text-model
	// curation surface (admin/Settings/Models.svelte). Keeping the full set in
	// memory also means an optimistic toggle is never racing a refetch.
	//
	// Sorted by display name with the source connection as tie-break, so R4's
	// two similarly-named voices from different connections land adjacent and
	// read as an obvious pair distinguished only by their shown source. Enabled
	// state is NOT part of the sort — a toggled row must not jump away from the
	// cursor mid-curation.
	let filteredVoices = $derived(voices
		.filter((voice) => matchesSearch(voice, searchValue))
		.sort(
			(a, b) =>
				displayName(a).localeCompare(displayName(b)) ||
				sourceLabel(a).localeCompare(sourceLabel(b))
		));
</script>

<Modal size="sm" bind:show>
	<div>
		<div class=" flex justify-between dark:text-gray-100 px-5 pt-4 pb-2">
			<div class=" text-lg font-medium self-center font-primary">
				{$i18n.t('Manage Voices')}
			</div>
			<button
				class="self-center"
				type="button"
				onclick={() => {
					show = false;
				}}
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 20 20"
					fill="currentColor"
					class="w-5 h-5"
				>
					<path
						d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z"
					/>
				</svg>
			</button>
		</div>

		<div class="flex flex-col w-full px-5 pb-4 dark:text-gray-200">
			<div class=" text-xs text-gray-500 mb-2">
				{$i18n.t('Voices left enabled here are the ones users can choose from.')}
			</div>

			{#if loading}
				<div class="flex justify-center items-center h-32">
					<Spinner />
				</div>
			{:else if voices.length === 0}
				<!-- Correct behaviour, not an error: /voices/curation returns an empty
				     set when the deployment has no self-hosted TTS connection. -->
				<div class="flex flex-col items-center justify-center gap-1 h-32 text-center">
					<div class="text-sm text-gray-500 dark:text-gray-400">
						{$i18n.t('No self-hosted TTS voices are available')}
					</div>
					<div class="text-xs text-gray-500 dark:text-gray-500">
						{$i18n.t('Add a self-hosted TTS connection to curate its voices.')}
					</div>
				</div>
			{:else}
				<div class=" flex flex-1 items-center w-full mb-1">
					<div class=" self-center ml-1 mr-3">
						<Search className="size-3.5" />
					</div>
					<input
						class=" w-full text-sm py-1 rounded-r-xl outline-none bg-transparent"
						bind:value={searchValue}
						placeholder={$i18n.t('Search Voices')}
					/>
				</div>

				<hr class=" border-gray-100 dark:border-gray-700/10 my-1.5 w-full" />

				<div class=" flex flex-col max-h-80 overflow-y-auto scrollbar-hidden">
					{#if filteredVoices.length > 0}
						{#each filteredVoices as voice (voice.id)}
							<div
								class=" flex gap-4 w-full px-2 py-1.5 dark:hover:bg-white/5 hover:bg-black/5 rounded-lg transition"
							>
								<div class=" flex-1 min-w-0 self-center {voice.enabled ? '' : 'text-gray-500'}">
									<div class=" text-sm font-medium line-clamp-1">
										{displayName(voice)}
									</div>
									<div
										class=" text-xs overflow-hidden text-ellipsis line-clamp-1 text-gray-500 flex gap-1.5"
									>
										<!-- R4: which connection this voice came from, always shown. -->
										<span class=" shrink-0">
											{sourceLabel(voice) || $i18n.t('Unknown connection')}
										</span>
										<span class=" text-gray-400 dark:text-gray-600">•</span>
										<span class=" line-clamp-1">
											{[voice.id, voice.language, voice.gender]
												.filter((part) => part)
												.join(' · ')}
										</span>
									</div>
								</div>

								<div class="flex items-center self-center shrink-0">
									<Tooltip content={voice.enabled ? $i18n.t('Enabled') : $i18n.t('Disabled')}>
										<Switch
											state={voice.enabled}
											onChange={(checked) => {
												toggleVoiceHandler(voice, checked);
											}}
										/>
									</Tooltip>
								</div>
							</div>
						{/each}
					{:else}
						<div class="flex flex-col items-center justify-center w-full h-20">
							<div class="text-gray-500 dark:text-gray-400 text-xs">
								{$i18n.t('No voices found')}
							</div>
						</div>
					{/if}
				</div>
			{/if}
		</div>
	</div>
</Modal>
