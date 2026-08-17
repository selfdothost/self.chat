import { WEBUI_API_BASE_URL } from '$lib/constants';

const BASE = `${WEBUI_API_BASE_URL}/evaluations`;

export type EvalTask = {
	name: string;
	category: string;
};

export type EvalType = 'code-eval' | 'language-eval';

/**
 * List the benchmarks a harness can actually run.
 *
 * Proxied by self.ai from the harness's own `GET /api/tasks` (self.ai#89). The
 * client used to hardcode this list, which drifted to 30 code + 14 language
 * options against 23 MultiPL-E languages and 13,418 vendored task YAMLs.
 *
 * A `502` here means the harness is unreachable — deliberately *not* an empty
 * list, because an empty list is a meaningful answer from these harnesses
 * (code-eval's registry has genuinely emptied before, when a vendored metric
 * raised at import time). Callers must keep the two apart.
 */
export const getEvalTasks = async (token: string, evalType: EvalType): Promise<EvalTask[]> => {
	const res = await fetch(`${BASE}/tasks?eval_type=${encodeURIComponent(evalType)}`, {
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${token}`
		}
	});
	if (!res.ok) {
		const err = await res.json().catch(() => ({ detail: res.statusText }));
		throw err?.detail ?? 'Failed to list benchmarks';
	}
	return res.json();
};

export type EvalLanguages = {
	/** MultiPL-E languages the harness ships. Never legitimately empty. */
	builtin: string[];
	/** Languages registered at runtime (self.code-eval#6/#7). Withdrawable. */
	custom: string[];
};

/**
 * List code-eval's MultiPL-E languages.
 *
 * code-eval only — language-eval has no equivalent concept, which is why there
 * is no `evalType` parameter to get wrong.
 *
 * Kept separate from `getEvalTasks` because the two answer different questions:
 * a `multiple-{lang}` task only exists once the language is registered, so the
 * language list is what a picker must offer, not the task list. The client used
 * to hardcode 14 of these against 23 built-ins (self.chat#40).
 *
 * A `502` means the harness is unreachable. As with `getEvalTasks`, that is
 * deliberately *not* an empty set — but the reason is sharper here: `builtin`
 * can never legitimately be empty, so rendering an outage as "no languages"
 * would be a lie rather than merely ambiguous.
 */
export const getEvalLanguages = async (token: string): Promise<EvalLanguages> => {
	const res = await fetch(`${BASE}/languages`, {
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${token}`
		}
	});
	if (!res.ok) {
		const err = await res.json().catch(() => ({ detail: res.statusText }));
		throw err?.detail ?? 'Failed to list languages';
	}
	return res.json();
};
