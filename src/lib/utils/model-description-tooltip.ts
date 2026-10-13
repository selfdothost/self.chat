import { marked } from 'marked';

import { sanitizeResponseContent } from './index';

// Selector.svelte renders every model's description as a Tooltip inside the
// dropdown, and the parse is SYNCHRONOUS and per-item at the moment the
// dropdown opens -- the content only mounts then. marked's inline tokenizer is
// quadratic in the length of a single delimiter run, and the old call site
// flattened the whole description onto ONE line before parsing
// (replaceAll('\n', '<br>')), which is exactly the worst case: measured against
// this repo's marked 18.0.6, a 20KB description of `**` runs parsed in ~6.2
// seconds. One curated model card of that shape freezes the whole tab on
// dropdown open. A tooltip cannot display more than a screenful anyway, so the
// ceiling costs nothing real; `breaks: true` makes marked emit the `<br>`s the
// old manual flattening was after, while still letting the block tokenizer
// split the text into paragraphs instead of one pathological inline run.
export const MODEL_DESCRIPTION_TOOLTIP_LIMIT = 2000;

export const modelDescriptionTooltipHtml = (description: string): string => {
	const sanitized = sanitizeResponseContent(description);
	const clamped =
		sanitized.length > MODEL_DESCRIPTION_TOOLTIP_LIMIT
			? `${sanitized.slice(0, MODEL_DESCRIPTION_TOOLTIP_LIMIT).trimEnd()}…`
			: sanitized;

	return `${marked.parse(clamped, { breaks: true })}`;
};
