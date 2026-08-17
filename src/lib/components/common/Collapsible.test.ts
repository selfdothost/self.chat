import { render, fireEvent, waitFor } from '@testing-library/svelte';
import { describe, it, expect, beforeAll, vi } from 'vitest';
import Collapsible from './Collapsible.svelte';
import IdentityHarness from './Collapsible.identity.test.harness.svelte';

// self.chat#31, dispatcher batch 2. Collapsible is used in seven places
// (Controls, Citations, MarkdownTokens, WebSearchResults, Folder,
// RecursiveFolder, playground/Chat), so its change contract is pinned here
// rather than left to Folder.test.ts, which only covers it transitively.

beforeAll(() => {
	globalThis.ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	} as unknown as typeof ResizeObserver;
	Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? (() => {});
	// svelte/transition slide uses the Web Animations API, absent in jsdom.
	if (!Element.prototype.animate) {
		Element.prototype.animate = () => {
			/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
			const anim: any = {
				cancel() {},
				play() {},
				pause() {},
				reverse() {},
				finished: Promise.resolve(),
				_onfinish: null,
				set onfinish(fn: (() => void) | null) {
					this._onfinish = fn;
					if (fn) fn();
				},
				get onfinish() {
					return this._onfinish;
				}
			};
			return anim as unknown as Animation;
		};
	}
});

describe('Collapsible change contract', () => {
	it('reports the initial state on mount, before any interaction', async () => {
		const onChange = vi.fn();
		render(Collapsible, { props: { title: 'Section', open: true, onChange } });

		// The dispatch this replaced lived in an $effect, so consumers already got
		// a call on mount. Dropping that would silently change startup behaviour
		// for anything persisting the value.
		await waitFor(() => expect(onChange).toHaveBeenCalledWith(true));
	});

	it('reports the new state when toggled', async () => {
		const onChange = vi.fn();
		const { container } = render(Collapsible, {
			props: { title: 'Section', open: false, onChange }
		});

		await waitFor(() => expect(onChange).toHaveBeenCalledWith(false));
		onChange.mockClear();

		await fireEvent.pointerUp(container.querySelector('.cursor-pointer')!);

		await waitFor(() => expect(onChange).toHaveBeenCalledWith(true));
	});

	it('does not fire when disabled', async () => {
		const onChange = vi.fn();
		const { container } = render(Collapsible, {
			props: { title: 'Section', open: false, disabled: true, onChange }
		});

		await waitFor(() => expect(onChange).toHaveBeenCalledWith(false));
		onChange.mockClear();

		await fireEvent.pointerUp(container.querySelector('.cursor-pointer')!);

		// a disabled header must not toggle, so no further change is reported
		expect(onChange).not.toHaveBeenCalled();
	});

	it('does not re-fire when only the callback IDENTITY changes', async () => {
		// The regression this guards is invisible by inspection. The effect must
		// track `open` and NOT `onChange`; if the callback is read tracked, a
		// consumer passing an inline arrow gets a duplicate change event on every
		// parent re-render, for an `open` that never moved. The harness passes an
		// inline arrow precisely so its identity churns.
		const onChange = vi.fn();
		const { rerender, getByTestId } = render(IdentityHarness, {
			props: { onChange, tick: 0 }
		});

		await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));

		await rerender({ onChange, tick: 1 });
		await waitFor(() => expect(getByTestId('tick').textContent).toBe('1'));

		await rerender({ onChange, tick: 2 });
		await waitFor(() => expect(getByTestId('tick').textContent).toBe('2'));

		// still exactly the one mount call — `open` never changed
		expect(onChange).toHaveBeenCalledTimes(1);
	});
});
