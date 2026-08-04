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
