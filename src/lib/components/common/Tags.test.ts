import { render, fireEvent, waitFor } from '@testing-library/svelte';
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { writable } from 'svelte/store';
import TagList from './Tags/TagList.svelte';
import TagInput from './Tags/TagInput.svelte';
import Tags from './Tags.svelte';

// self.chat#31, dispatcher batch 1. The Tags chain moved from
// createEventDispatcher to callback props. The failure mode being guarded is the
// silent one: a stale `on:add` / `on:delete` listener still COMPILES and still
// RENDERS against a component that no longer dispatches, so tagging quietly
// becomes a no-op. That is exactly how the PipelineFlowNode seam broke during
// the xyflow rewrite, caught only by a test that asserted the payload ARRIVED.
//
// So these assert the callback fires AND what it is called with. The payload
// shape is load-bearing and deliberately NOT uniform across the chain:
//   TagList/TagInput/Tags -> a bare tag-name STRING (was `e.detail`)
//   chat/Tags             -> a `{ name }` OBJECT   (was `e.detail.name`)
// ChatMenu and RateComment read those two different shapes, so flattening them
// would compile and silently corrupt the value.

const i18nContext = () => new Map([['i18n', writable({ t: (k: string) => k })]]);

beforeAll(() => {
	globalThis.ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	} as unknown as typeof ResizeObserver;
	Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? (() => {});
});

describe('TagList', () => {
	it('calls onDelete with the tag NAME, not the tag object', async () => {
		const onDelete = vi.fn();
		const { container } = render(TagList, {
			props: { tags: [{ name: 'alpha' }, { name: 'beta' }], onDelete },
			context: i18nContext()
		});

		const buttons = container.querySelectorAll('button');
		expect(buttons.length).toBe(2);
		await fireEvent.click(buttons[1]);

		expect(onDelete).toHaveBeenCalledTimes(1);
		expect(onDelete).toHaveBeenCalledWith('beta');
	});

	it('does not throw when no handler is supplied', async () => {
		const { container } = render(TagList, {
			props: { tags: [{ name: 'alpha' }] },
			context: i18nContext()
		});
		// The default no-op prop matters: several call sites pass only one of the
		// two handlers, and an undefined callback would throw on click.
		await expect(fireEvent.click(container.querySelector('button')!)).resolves.not.toThrow();
	});
});

describe('TagInput', () => {
	it('calls onAdd with the trimmed name on Enter', async () => {
		const onAdd = vi.fn();
		const { container } = render(TagInput, {
			props: { label: '', onAdd },
			context: i18nContext()
		});

		// the collapsed "+" toggle reveals the input
		await fireEvent.click(container.querySelector('button')!);
		const input = await waitFor(() => {
			const el = container.querySelector('input');
			expect(el).toBeTruthy();
			return el as HTMLInputElement;
		});

		await fireEvent.input(input, { target: { value: '  spaced  ' } });
		await fireEvent.keyDown(input, { key: 'Enter' });

		expect(onAdd).toHaveBeenCalledTimes(1);
		expect(onAdd).toHaveBeenCalledWith('spaced');
	});

	it('does not call onAdd for a whitespace-only tag', async () => {
		const onAdd = vi.fn();
		const { container } = render(TagInput, {
			props: { label: '', onAdd },
			context: i18nContext()
		});

		await fireEvent.click(container.querySelector('button')!);
		const input = await waitFor(() => container.querySelector('input') as HTMLInputElement);
		await fireEvent.input(input, { target: { value: '   ' } });
		await fireEvent.keyDown(input, { key: 'Enter' });

		expect(onAdd).not.toHaveBeenCalled();
	});
});

describe('Tags (common) forwards both directions', () => {
	it('forwards a child delete to onDelete unchanged', async () => {
		const onDelete = vi.fn();
		const { container } = render(Tags, {
			props: { tags: [{ name: 'gamma' }], onDelete },
			context: i18nContext()
		});

		// TagList renders one delete button per tag, before TagInput's toggle.
		const del = container.querySelectorAll('button')[0];
		await fireEvent.click(del);

		expect(onDelete).toHaveBeenCalledWith('gamma');
	});

	it('forwards a child add to onAdd unchanged', async () => {
		const onAdd = vi.fn();
		const { container } = render(Tags, {
			props: { tags: [], onAdd },
			context: i18nContext()
		});

		// with no tags, the only button is TagInput's toggle
		await fireEvent.click(container.querySelector('button')!);
		const input = await waitFor(() => container.querySelector('input') as HTMLInputElement);
		await fireEvent.input(input, { target: { value: 'delta' } });
		await fireEvent.keyDown(input, { key: 'Enter' });

		expect(onAdd).toHaveBeenCalledWith('delta');
	});
});
