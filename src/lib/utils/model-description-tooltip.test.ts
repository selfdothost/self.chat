import { describe, it, expect } from 'vitest';

import {
	MODEL_DESCRIPTION_TOOLTIP_LIMIT,
	modelDescriptionTooltipHtml
} from './model-description-tooltip';

// The dropdown freeze this guards: Selector.svelte parses every model's
// description into a Tooltip SYNCHRONOUSLY at the moment the dropdown opens
// (the content only mounts then), for every described model at once. The old
// call site flattened the description onto one line before parsing
// (replaceAll('\n', '<br>')), and marked's inline tokenizer is quadratic in a
// single delimiter run -- measured against this repo's marked 18.0.6, 20KB of
// `**` parsed in ~6.2s, which is a whole-tab hard freeze once it happens inside
// the dropdown. The clamp bounds the work; `breaks: true` keeps the line-break
// rendering the manual flattening used to produce.

describe('modelDescriptionTooltipHtml', () => {
	it('parses an emphasis-hostile description in bounded time', () => {
		// 20KB of `**`: ~6.2s with the pre-fix flatten-then-parse path, ~70ms
		// clamped. The budget is generous for CI variance but a clamp removal
		// (or a marked regression back to quadratic runs) blows through it.
		const hostile = `**${'**'.repeat(10_000)}**`;

		const start = performance.now();
		const html = modelDescriptionTooltipHtml(hostile);
		const elapsed = performance.now() - start;

		expect(elapsed).toBeLessThan(1500);
		expect(html.length).toBeLessThan(10_000);
	});

	it('parses a large multi-line description as blocks, not one inline run', () => {
		const card = Array.from(
			{ length: 2_000 },
			(_, i) => `Line ${i}: **bold** _em_ [link${i}](https://example.com/${i}) \`code_${i}\``
		).join('\n');

		const html = modelDescriptionTooltipHtml(card);

		// Block structure survived (this is the flattening regression guard: the
		// old code produced ONE paragraph for the whole card).
		expect(html).toContain('<p>');
	});

	it('renders single newlines as line breaks, as the old flatten did', () => {
		const html = modelDescriptionTooltipHtml('first line\nsecond line');

		expect(html).toContain('first line<br>second line');
	});

	it('leaves short descriptions whole', () => {
		const html = modelDescriptionTooltipHtml('A perfectly ordinary model blurb.');

		expect(html).toContain('A perfectly ordinary model blurb.');
		expect(html).not.toContain('…');
	});

	it('clamps over-limit descriptions and marks the cut', () => {
		const html = modelDescriptionTooltipHtml('x'.repeat(MODEL_DESCRIPTION_TOOLTIP_LIMIT + 5_000));

		expect(html).toContain('…');
		expect(html.length).toBeLessThan(MODEL_DESCRIPTION_TOOLTIP_LIMIT + 100);
	});

	it('keeps sanitizeResponseContent escaping in front of the parser', () => {
		const html = modelDescriptionTooltipHtml('desc with <script>alert(1)</script> inside');

		expect(html).toContain('&lt;script&gt;');
		expect(html).not.toContain('<script>');
	});
});
