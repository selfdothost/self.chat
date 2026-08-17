<script>
    // Model residency on llamolotl: what is on the card, what it costs, and an
    // explicit load/unload — instead of "pick it in the chat dropdown and hope
    // the first request triggers a load".
    //
    // The load is PROACTIVE rather than immediate. A load evicts a resident
    // model, so firing it while that model is mid-generation kills someone's
    // in-flight request. This panel watches the slot counts and fires the load
    // once the card is quiet, showing what it is waiting for the whole time.
    //
    // Two rules the waiting loop will not bend:
    //
    //   * `slots: null` is NOT idle. It means the router would not tell us. We
    //     keep waiting and offer an explicit override rather than guessing.
    //   * The wait is bounded. A model that never goes quiet must surface as a
    //     decision for the operator, not an animation that runs forever.
    import { onMount, onDestroy, getContext } from 'svelte';
    import { toast } from 'svelte-sonner';
    import {
        getLlamolotlResidency,
        loadLlamolotlModel,
        unloadLlamolotlModel
    } from '$lib/apis/llamolotl';

    /** @type {import('svelte/store').Writable<import('i18next').i18n>} */
    const i18n = getContext('i18n');

    const POLL_MS = 2000;
    // Long enough for a genuinely long generation to finish, short enough that a
    // wedged slot becomes a question instead of a spinner.
    const MAX_WAIT_MS = 5 * 60 * 1000;

    let residency = $state(null);
    let loading = $state(true);
    let error = $state(null);

    // The one swap in flight, if any. Single-slot on purpose: this is a
    // single-GPU box, and two queued swaps would race each other's eviction.
    // { model, phase: 'waiting'|'loading', startedAt, blockedBy, unreadable }
    let pending = $state(null);
    let busyModel = $state(null); // id of a model with an unload in flight

    let pollInterval = null;

    const bytesToGiB = (n) => (typeof n === 'number' ? (n / 1024 ** 3).toFixed(2) : null);

    /** Models llamolotl serves, newest status first: loaded, then the rest. */
    const sortedModels = $derived(
        [...(residency?.models ?? [])].sort((a, b) => {
            const rank = (m) => (m.status === 'loaded' ? 0 : m.status === 'loading' ? 1 : 2);
            return rank(a) - rank(b) || a.id.localeCompare(b.id);
        })
    );

    /** Every loaded model that is currently generating. These are what a swap
     *  waits on — the router picks its own eviction set (LRU), so we cannot know
     *  which one it will take and wait for the card as a whole instead. */
    const generating = $derived(
        (residency?.models ?? []).filter((m) => m.status === 'loaded' && m.slots?.busy > 0)
    );

    /** Loaded models whose slots we could not read. Unknown is not idle. */
    const unreadable = $derived(
        (residency?.models ?? []).filter(
            (m) => m.status === 'loaded' && (m.slots === null || m.slots === undefined)
        )
    );

    async function fetchResidency() {
        try {
            residency = await getLlamolotlResidency(localStorage.token);
            error = null;
        } catch (err) {
            error = err?.toString() ?? 'Failed to read model residency';
        }
    }

    /** Turn a broker denial into the arithmetic behind it. `requested_bytes` off
     *  the broker is the NET ask (self.ai#114), which on its own matches no
     *  model's size — showing it alone reads like a bug. */
    function describeDenial(detail) {
        if (!detail || typeof detail !== 'object') {
            return null;
        }
        const gross = bytesToGiB(detail.footprint_bytes);
        const net = bytesToGiB(detail.requested_bytes);
        const free = bytesToGiB(detail.free_bytes);
        const freeable = bytesToGiB(detail.freeable_bytes);
        if (gross === null && net === null) {
            return null;
        }
        return $i18n.t(
            `Needs ${gross ?? '?'} GiB, of which ${net ?? '?'} GiB must come from the card. Free now: ${free ?? '?'} GiB; reclaimable: ${freeable ?? '?'} GiB.`
        );
    }

    async function fireLoad(modelId) {
        pending = { ...pending, model: modelId, phase: 'loading' };
        try {
            await loadLlamolotlModel(localStorage.token, modelId);
            toast.success($i18n.t(`Loading ${modelId}`));
        } catch (err) {
            const explained = describeDenial(err);
            toast.error(explained ?? err?.toString() ?? $i18n.t('Load refused'));
        } finally {
            pending = null;
            await fetchResidency();
        }
    }

    /** Re-evaluate a queued swap against the latest residency read. Called from
     *  the poll rather than an $effect: this writes state it also reads, and a
     *  self-writing effect takes the whole route down (self.chat#33). */
    async function advancePending() {
        if (!pending || pending.phase !== 'waiting') {
            return;
        }
        if (Date.now() - pending.startedAt > MAX_WAIT_MS) {
            pending = { ...pending, timedOut: true };
            return;
        }
        // Unknown slots are not idle — hold, and let the operator override.
        if (unreadable.length > 0) {
            pending = { ...pending, blockedBy: [], unreadable: unreadable.map((m) => m.id) };
            return;
        }
        if (generating.length > 0) {
            pending = {
                ...pending,
                blockedBy: generating.map((m) => `${m.id} (${m.slots.busy})`),
                unreadable: []
            };
            return;
        }
        await fireLoad(pending.model);
    }

    async function handleLoad(modelId) {
        if (pending) {
            toast.error($i18n.t('A model swap is already queued'));
            return;
        }
        await fetchResidency();
        pending = {
            model: modelId,
            phase: 'waiting',
            startedAt: Date.now(),
            blockedBy: [],
            unreadable: []
        };
        await advancePending();
    }

    async function handleUnload(modelId) {
        busyModel = modelId;
        try {
            await unloadLlamolotlModel(localStorage.token, modelId);
            toast.success($i18n.t(`Unloaded ${modelId}`));
        } catch (err) {
            toast.error(err?.toString() ?? $i18n.t('Unload failed'));
        } finally {
            busyModel = null;
            await fetchResidency();
        }
    }

    onMount(async () => {
        await fetchResidency();
        loading = false;
        pollInterval = setInterval(async () => {
            await fetchResidency();
            await advancePending();
        }, POLL_MS);
    });

    onDestroy(() => {
        if (pollInterval) clearInterval(pollInterval);
    });
</script>

<div class="flex flex-col gap-3">
    {#if loading}
        <div class="text-gray-500 dark:text-gray-400 text-sm">{$i18n.t('Loading...')}</div>
    {:else if error}
        <div class="text-sm text-red-600 dark:text-red-400">{error}</div>
    {:else}
        {#if residency?.capacity}
            <div
                class="flex flex-wrap gap-x-6 gap-y-1 text-xs text-gray-600 dark:text-gray-400 pb-2 border-b dark:border-gray-800"
            >
                <span>{$i18n.t('Card')}: {bytesToGiB(residency.capacity.total_bytes)} GiB</span>
                <span>{$i18n.t('Free')}: {bytesToGiB(residency.capacity.free_bytes)} GiB</span>
                <!-- Shown because free capacity alone does not explain admissibility:
				     a model too big for `free` still fits in free + what llamolotl
				     evicts of its own (self.ai#114). -->
                <span>
                    {$i18n.t('Reclaimable from loaded models')}:
                    {bytesToGiB(residency.capacity.llamolotl_held_bytes)} GiB
                </span>
            </div>
        {/if}

        {#if pending}
            <div
                class="rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 text-xs"
            >
                <div class="font-medium text-amber-800 dark:text-amber-300">
                    {#if pending.phase === 'loading'}
                        {$i18n.t(`Loading ${pending.model}...`)}
                    {:else if pending.timedOut}
                        {$i18n.t(`Still waiting to load ${pending.model}`)}
                    {:else}
                        {$i18n.t(`Queued: ${pending.model}`)}
                    {/if}
                </div>
                <div class="mt-1 text-amber-700 dark:text-amber-400">
                    {#if pending.phase === 'loading'}
                        {$i18n.t('The card is quiet; the swap is running.')}
                    {:else if pending.unreadable?.length}
                        {$i18n.t(
                            `Cannot read in-flight requests for ${pending.unreadable.join(', ')}. Not assuming idle.`
                        )}
                    {:else if pending.blockedBy?.length}
                        {$i18n.t(`Waiting on generation in ${pending.blockedBy.join(', ')}`)}
                    {:else}
                        {$i18n.t('Checking for in-flight requests...')}
                    {/if}
                </div>
                {#if pending.phase === 'waiting'}
                    <div class="mt-2 flex gap-2">
                        <button
                            class="px-2 py-1 rounded border dark:border-gray-700 hover:bg-white dark:hover:bg-gray-800"
                            onclick={() => (pending = null)}
                        >
                            {$i18n.t('Cancel')}
                        </button>
                        <!-- The override exists because "cannot read slots" and "wedged
						     slot" both need an operator decision, not an indefinite wait.
						     It interrupts in-flight generation, so it says so. -->
                        <button
                            class="px-2 py-1 rounded border border-red-300 dark:border-red-800 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                            onclick={() => fireLoad(pending.model)}
                        >
                            {$i18n.t('Load now (interrupts generation)')}
                        </button>
                    </div>
                {/if}
            </div>
        {/if}

        <div class="flex flex-col divide-y dark:divide-gray-850">
            {#each sortedModels as model (model.id)}
                <div class="flex items-center gap-3 py-2">
                    <div class="flex-1 min-w-0">
                        <div class="text-sm truncate dark:text-gray-200">{model.id}</div>
                        <div
                            class="text-xs text-gray-500 dark:text-gray-400 flex flex-wrap gap-x-3"
                        >
                            <span>{model.status ?? 'unknown'}</span>
                            {#if model.vram_footprint_bytes}
                                <span>
                                    {bytesToGiB(model.vram_footprint_bytes)} GiB
                                    {#if model.vram_footprint_source}
                                        ({model.vram_footprint_source})
                                    {/if}
                                </span>
                            {/if}
                            {#if model.status === 'loaded'}
                                {#if model.slots}
                                    <span
                                        class={model.slots.busy > 0
                                            ? 'text-amber-600 dark:text-amber-400'
                                            : ''}
                                    >
                                        {model.slots.busy}/{model.slots.total}
                                        {$i18n.t('slots busy')}
                                    </span>
                                {:else}
                                    <!-- Rendered distinctly from "0 busy" on purpose. -->
                                    <span class="italic">{$i18n.t('slots unreadable')}</span>
                                {/if}
                            {/if}
                        </div>
                    </div>

                    {#if model.status === 'loaded'}
                        <button
                            class="text-xs px-2 py-1 rounded border dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
                            onclick={() => handleUnload(model.id)}
                            disabled={busyModel === model.id}
                        >
                            {busyModel === model.id ? $i18n.t('Unloading...') : $i18n.t('Unload')}
                        </button>
                    {:else if model.status !== 'loading'}
                        <button
                            class="text-xs px-2 py-1 rounded border dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
                            onclick={() => handleLoad(model.id)}
                            disabled={pending !== null}
                        >
                            {$i18n.t('Load')}
                        </button>
                    {/if}
                </div>
            {/each}
        </div>

        {#if sortedModels.length === 0}
            <div class="text-sm text-gray-500 dark:text-gray-400">
                {$i18n.t('No models reported by llamolotl.')}
            </div>
        {/if}
    {/if}
</div>
