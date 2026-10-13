import { describe, it, expect, vi, afterEach } from 'vitest';
import { buildModelSelectorItems } from './model-selector-items';

// Regression shape: /api/models can serve the same model id twice (the
// catalog assembly is upstream in self.ai core; self.chat#46 expects
// same-line entries to accumulate once versioning lands), and the picker
// renders a keyed {#each} on that id — Svelte 5 refuses duplicate keys
// (each_key_duplicate) and the whole dropdown blanks. The builder must hand
// the Selector a key-unique list no matter what the catalog contains.
//
// Tag names get the same treatment: they render in keyed {#each}es on
// tag.name, and ModelEditor's add path could persist a duplicate name before
// its guard landed.

// Generic so `extra` props (info, name overrides) stay typed on the result —
// svelte-check gates this suite in CI and a Record<string, unknown> spread
// widens them away.
const model = <T extends object>(
	id: string,
	extra: T = {} as T
): { id: string; name: string } & T => ({
	id,
	name: `name-of-${id}`,
	...extra
});

describe('buildModelSelectorItems: duplicate model ids', () => {
	afterEach(() => vi.restoreAllMocks());

	it('drops repeat ids, first occurrence wins', () => {
		const first = model('m1', { name: 'first-name' });
		const dup = model('m1', { name: 'second-name' });
		const items = buildModelSelectorItems([first, dup, model('m2')]);

		expect(items.map((i) => i.value)).toEqual(['m1', 'm2']);
		expect(items[0].label).toBe('first-name');
		// The surviving row is the first entry itself, not a merge of the two.
		expect(items[0].model).toBe(first);
	});

	it('drops only the repeated id, not unrelated entries around it', () => {
		const items = buildModelSelectorItems([
			model('a'),
			model('b'),
			model('a'),
			model('c'),
			model('b')
		]);
		expect(items.map((i) => i.value)).toEqual(['a', 'b', 'c']);
	});

	it('warns once naming the dropped ids, so the catalog bug stays visible', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		buildModelSelectorItems([model('x'), model('x'), model('x'), model('y')]);

		expect(warn).toHaveBeenCalledTimes(1);
		expect(warn.mock.calls[0][0]).toContain('duplicate id(s) x');
		warn.mockRestore();
	});

	it('keeps every entry, in order, when ids are unique', () => {
		const a = model('a');
		const b = model('b');
		const items = buildModelSelectorItems([a, b]);

		expect(items).toEqual([
			{ value: 'a', label: 'name-of-a', model: a },
			{ value: 'b', label: 'name-of-b', model: b }
		]);
	});

	it('returns an empty list for an empty catalog', () => {
		expect(buildModelSelectorItems([])).toEqual([]);
	});
});

describe('buildModelSelectorItems: duplicate tag names', () => {
	afterEach(() => vi.restoreAllMocks());

	it('dedupes tag names on the item model without mutating the source', () => {
		const source = model('m', {
			info: { meta: { tags: [{ name: 'gguf' }, { name: 'chat' }, { name: 'gguf' }] } }
		});
		const items = buildModelSelectorItems([source]);

		expect(items[0].model.info?.meta?.tags).toEqual([{ name: 'gguf' }, { name: 'chat' }]);
		// The catalog entry itself is untouched — the dedupe is a clone, not an edit.
		expect(source.info?.meta?.tags).toHaveLength(3);
	});

	it('keeps the model object identity when tags are already unique', () => {
		const source = model('m', {
			info: { meta: { tags: [{ name: 'gguf' }, { name: 'chat' }] } }
		});
		const items = buildModelSelectorItems([source]);

		expect(items[0].model).toBe(source);
	});

	it('keeps the model object identity when there is nothing to clone', () => {
		for (const info of [undefined, null, { meta: null }, { meta: {} }, { meta: { tags: null } }]) {
			const source = { ...model('m'), info };
			const items = buildModelSelectorItems([source]);
			expect(items[0].model).toBe(source);
		}
	});
});
