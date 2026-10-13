import { render, act } from '@testing-library/svelte';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Tooltip from './Tooltip.svelte';

// Tooltip holds its tippy instance outside reactive state on purpose: the
// $effect branches on the instance and assigns it on first run, so a $state
// instance would make the effect self-writing (the self.chat#33 loop class —
// it settles today only via tippy's closure-based mutation). These tests pin
// the lifecycle contract the non-reactive instance must keep honoring.
//
// The mock's implementation signature carries the parameter types (same
// convention as loader.test.ts's fetch double) so each mock.calls entry is a
// real [element, props] tuple. The props type is the slice the assertions
// read; the component always passes sanitized string content.
interface TippyStubProps {
	content: string;
}

interface StubInstance {
	setContent: ReturnType<typeof vi.fn>;
	destroy: ReturnType<typeof vi.fn>;
}

const { tippyMock, stubInstances } = vi.hoisted(() => {
	const stubInstances: StubInstance[] = [];
	const tippyMock = vi.fn((_element: HTMLElement, _props: TippyStubProps) => {
		const instance: StubInstance = { setContent: vi.fn(), destroy: vi.fn() };
		stubInstances.push(instance);
		return instance;
	});
	return { tippyMock, stubInstances };
});

vi.mock('tippy.js', () => ({ default: tippyMock }));

beforeEach(() => {
	tippyMock.mockClear();
	stubInstances.length = 0;
});

describe('Tooltip tippy lifecycle', () => {
	it('creates one instance anchored to the wrapper div, and mount settles without a redundant setContent pass', async () => {
		const { container } = render(Tooltip, { props: { content: 'Hello' } });
		await act();

		// Created exactly once, on the bound wrapper element (the component's
		// only DOM), with the sanitized content in the initial props.
		expect(tippyMock).toHaveBeenCalledTimes(1);
		const [anchor, props] = tippyMock.mock.calls[0];
		expect(anchor).toBe(container.firstElementChild);
		expect(props.content).toBe('Hello');

		// The regression guard: with the instance in $state, the effect's own
		// assignment re-triggered it and mount ended in a spurious setContent.
		expect(stubInstances[0].setContent).not.toHaveBeenCalled();
	});

	it('sanitizes markup out of the tooltip content', async () => {
		render(Tooltip, { props: { content: '<script>alert(1)</script>Hi' } });
		await act();

		const [, props] = tippyMock.mock.calls[0];
		expect(props.content).not.toContain('<script');
		expect(props.content).toContain('Hi');
	});

	it('applies content updates via setContent without recreating the instance', async () => {
		const { rerender } = render(Tooltip, { props: { content: 'Before' } });
		await act();

		await rerender({ content: 'After' });
		await act();

		expect(tippyMock).toHaveBeenCalledTimes(1);
		expect(stubInstances[0].setContent).toHaveBeenCalledWith('After');
	});

	it('destroys the instance when content becomes empty', async () => {
		const { rerender } = render(Tooltip, { props: { content: 'Before' } });
		await act();

		await rerender({ content: '' });
		await act();

		expect(stubInstances[0].destroy).toHaveBeenCalledTimes(1);
	});

	it('destroys the instance on unmount', async () => {
		const { unmount } = render(Tooltip, { props: { content: 'Hello' } });
		await act();

		unmount();

		expect(tippyMock).toHaveBeenCalledTimes(1);
		expect(stubInstances[0].destroy).toHaveBeenCalledTimes(1);
	});
});
