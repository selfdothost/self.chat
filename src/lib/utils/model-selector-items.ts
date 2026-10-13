// Builds the item list the model Selector primitive renders.
//
// ModelSelector/Selector.svelte renders its list with a keyed {#each} on
// item.value (= the model id) and the per-row tag chips with keyed {#each}es
// on tag.name. Svelte 5 refuses a keyed each with duplicate keys
// (each_key_duplicate), and the failure blanks the whole dropdown — one bad
// catalog row kills the picker. The list fed to that render must therefore be
// key-unique by construction, whatever the catalog contains.
//
// Where duplicates come from:
//
//   - model ids: /api/models, assembled by self.ai core. self.chat fetches it
//     verbatim (getModels is a passthrough; the `models` store merges
//     nothing), so an id served twice upstream reaches this render twice.
//     self.chat#46 expects the catalog to accumulate same-line entries once
//     model versioning lands (blocked on self.ai#131), so treating the
//     catalog as untrusted input at list-build is the durable posture.
//     Upstream follow-up: dedupe or version at the /api/models assembly.
//
//   - tag names: ModelEditor's tag add appended without checking for an
//     existing name, so re-typing an already-present tag persisted a
//     duplicate (fixed at that source separately). Duplicates saved before
//     that fix still ride in the catalog, so tags are deduped here too.

/** The subset of a catalog model entry this builder reads. */
export interface ModelSelectorItemSource {
	id: string;
	name: string;
	info?: {
		meta?: {
			tags?: { name: string }[] | null;
		} | null;
	} | null;
}

export interface ModelSelectorItem<T extends ModelSelectorItemSource = ModelSelectorItemSource> {
	value: string;
	label: string;
	model: T;
}

/**
 * Strip duplicate tag names from one model entry. Returns the entry itself
 * when there is nothing to strip (clean entries keep their object identity —
 * callers hold references from the items array); otherwise returns a shallow
 * clone, never mutating the input.
 */
const withUniqueTagNames = <T extends ModelSelectorItemSource>(model: T): T => {
	const tags = model.info?.meta?.tags;
	if (!tags || tags.length < 2) return model;

	const seen = new Set<string>();
	const deduped = tags.filter((tag) => {
		if (!tag?.name || seen.has(tag.name)) return false;
		seen.add(tag.name);
		return true;
	});
	if (deduped.length === tags.length) return model;

	// Spreading a generic widens the result type; the clone provably carries
	// every field of `model` except tags, so the cast is sound.
	return {
		...model,
		info: { ...model.info, meta: { ...model.info?.meta, tags: deduped } }
	} as T;
};

/**
 * Map catalog models to Selector items, dropping repeat ids so the keyed
 * render can never see a duplicate key. First-wins: two catalog rows sharing
 * an id are indistinguishable to the picker — the value IS the id — so unlike
 * the liveeval task list (which suffixes repeats to keep both rows), the
 * duplicate is dropped, not disambiguated. Dropped ids are console.warn'd so
 * an upstream catalog bug stays diagnosable instead of silently hidden.
 */
export const buildModelSelectorItems = <T extends ModelSelectorItemSource>(
	models: T[]
): ModelSelectorItem<T>[] => {
	const seen = new Set<string>();
	const dropped: string[] = [];
	const items: ModelSelectorItem<T>[] = [];

	for (const model of models) {
		if (seen.has(model.id)) {
			dropped.push(model.id);
			continue;
		}
		seen.add(model.id);
		items.push({ value: model.id, label: model.name, model: withUniqueTagNames(model) });
	}

	if (dropped.length > 0) {
		console.warn(
			`buildModelSelectorItems: /api/models served duplicate id(s) ${[...new Set(dropped)].join(', ')} — keeping the first occurrence of each (duplicate keys would blank the model dropdown)`
		);
	}
	return items;
};
