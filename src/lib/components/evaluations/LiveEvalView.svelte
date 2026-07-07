<script lang="ts">
	import { onMount, onDestroy, getContext, createEventDispatcher } from 'svelte';
	import { toast } from 'svelte-sonner';

	import Spinner from '$lib/components/common/Spinner.svelte';
	import {
		streamEvalJobLive,
		getEvalJobEvents,
		type LiveEvalEvent,
		type EvalJob
	} from '$lib/apis/evaluations/jobs';
	import { getCodeTestDetails, getCodeTests } from '$lib/apis/evaluations/codetests';

	const i18n = getContext('i18n');
	const dispatch = createEventDispatcher();

	export let job: EvalJob;

	// ── Shared state ─────────────────────────────────────────────────
	let status: 'loading' | 'streaming' | 'done' | 'error' = 'loading';
	let errorMessage = '';
	let stopStream: (() => void) | null = null;

	// ── language-eval / generic events path ────────────────────────────────
	let events: LiveEvalEvent[] = [];
	let benchmarks: Record<string, number> = {};

	// Graded aggregate scores for a code-eval run (pass@1 per task), pulled from
	// the code-eval results summary — the per-task detail list has pass/fail but
	// not the harness's official aggregate.
	let codeScores: Record<string, any> = {};
	let expandedIndex: number | null = null;

	// ── code-eval graded (pass/fail) path ──────────────────────────────
	type CodeTaskSample = {
		completion_id: number;
		generation: string;
		completion: string;
		passed: boolean;
		result: string;
	};
	type CodeTaskDetail = {
		task_id: string;
		prompt: string;
		entry_point: string;
		canonical_solution: string;
		reference_test: string;
		samples: CodeTaskSample[];
	};
	let codeTasks: CodeTaskDetail[] = [];
	let liveTotal = 0;
	let expandedTask: string | null = null;
	let filterStatus: 'all' | 'passed' | 'failed' = 'all';
	// When graded detail is unavailable (not synced yet / non-admin), fall back
	// to rendering the raw streamed events instead of the pass/fail task list.
	let codeFallback = false;

	// A task is ungraded until code-eval scores it; treat those as pending,
	// not failed, so a still-running / not-yet-graded run doesn't read "all failed".
	const isPending = (t: CodeTaskDetail) =>
		t.samples.length === 0 || t.samples.some((s) => s.result === 'pending' || s.result === '');
	const isPassed = (t: CodeTaskDetail) => !isPending(t) && t.samples.every((s) => s.passed);
	const isFailed = (t: CodeTaskDetail) => !isPending(t) && t.samples.some((s) => !s.passed);

	// ── Shared UI refs ───────────────────────────────────────────────
	let listEl: HTMLDivElement;
	let autoScroll = true;

	// ── Derived ──────────────────────────────────────────────────────
	$: isCode = job.eval_type === 'code-eval';
	$: isRunning = job.status === 'running';
	// code-eval code-test results are keyed by the remote code-eval job id, which
	// the backend stashes on the job meta as `code_eval_job_id` at dispatch. The
	// admin Code Tests view synthesizes a job that carries the result id as
	// `code_job_id` (or job.id). Prefer the real dispatch key so a user's own job
	// resolves to its graded result file instead of falling back to job.id (which
	// isn't a result key) and degrading to the raw-events view.
	$: resultId = (job.meta as any)?.code_eval_job_id ?? (job.meta as any)?.code_job_id ?? job.id;

	$: totalTasks = events.length > 0 ? (events[events.length - 1].total ?? events.length) : 0;
	$: hasBenchmarks = Object.keys(benchmarks).length > 0;

	// code-eval counts / filter
	$: codeTotal = liveTotal || codeTasks.length;
	$: passedCount = codeTasks.filter(isPassed).length;
	$: failedCount = codeTasks.filter(isFailed).length;
	$: pendingCount = codeTasks.filter(isPending).length;
	$: filteredTasks = codeTasks.filter((t) => {
		if (filterStatus === 'all') return true;
		if (filterStatus === 'passed') return isPassed(t);
		return isFailed(t);
	});

	// Title changes based on job state
	$: title = isRunning ? $i18n.t('Live Evaluation') : $i18n.t('Evaluation Details');

	// ── Helpers (events path) ────────────────────────────────────────
	const getEventLabel = (event: LiveEvalEvent) =>
		event.task_name ?? event.task_id ?? `#${event.index + 1}`;

	const getEventPreview = (event: LiveEvalEvent) => {
		const parts: string[] = [];
		if (event.thinking) parts.push(`[thinking: ${event.thinking.length} chars]`);
		const resp = event.scored_response ?? event.response;
		if (resp) parts.push(resp.slice(0, 120));
		else if (event.completions?.length) parts.push(event.completions[0]?.slice(0, 120) ?? '');
		return parts.join(' ') || '';
	};

	const scoreColor = (score: number): string => {
		if (score >= 70) return 'text-green-500';
		if (score >= 40) return 'text-yellow-500';
		return 'text-red-500';
	};

	const formatBenchmarkName = (name: string): string =>
		name.replace('leaderboard_', '').replace(/_/g, ' ');

	// Flatten code-eval scores ({task: {pass@1: 0.8}}) into displayable badges.
	// Prefers pass@1, falls back to the first pass@k / bare number present.
	const codeScoreEntries = (
		scores: Record<string, any>
	): { task: string; label: string; pct: number }[] => {
		const out: { task: string; label: string; pct: number }[] = [];
		for (const [task, metric] of Object.entries(scores ?? {})) {
			if (metric && typeof metric === 'object') {
				const key =
					'pass@1' in metric ? 'pass@1' : Object.keys(metric).find((k) => k.startsWith('pass@'));
				if (key && typeof metric[key] === 'number') {
					out.push({ task, label: key, pct: metric[key] * 100 });
				}
			} else if (typeof metric === 'number') {
				out.push({ task, label: '', pct: metric * 100 });
			}
		}
		return out;
	};

	// Fetch the graded aggregate for this run from the results listing.
	async function loadCodeScores() {
		try {
			const all = await getCodeTests(localStorage.token);
			const entry = (all ?? []).find((r: any) => r.id === resultId);
			codeScores = entry?.scores ?? {};
		} catch {
			// scores unavailable — the per-task list still renders
		}
	}

	const formatMetricValue = (v: unknown): string => {
		if (typeof v === 'number') return v % 1 === 0 ? String(v) : v.toFixed(4);
		return String(v ?? '');
	};

	function toggleExpand(index: number) {
		expandedIndex = expandedIndex === index ? null : index;
	}

	function toggleTask(taskId: string) {
		expandedTask = expandedTask === taskId ? null : taskId;
	}

	function scrollToBottom() {
		if (autoScroll) {
			requestAnimationFrame(() => {
				listEl?.scrollTo({ top: listEl.scrollHeight, behavior: 'smooth' });
			});
		}
	}

	// ── Loaders ──────────────────────────────────────────────────────
	async function loadEvents() {
		status = 'loading';
		try {
			const data = await getEvalJobEvents(localStorage.token, job.id);
			events = (data as any).events ?? [];
			benchmarks = (data as any).benchmarks ?? {};
			status = 'done';
		} catch (e) {
			status = 'error';
			errorMessage = e instanceof Error ? e.message : String(e);
		}
	}

	// Load the graded pass/fail detail for a code-eval run. Falls back to the
	// generic events view when the graded file is unavailable (e.g. results not
	// synced from code-eval yet, a failed run, or a non-admin caller who
	// cannot read the code-test details).
	async function loadCodeDetails() {
		status = 'loading';
		codeFallback = false;
		loadCodeScores();
		try {
			const data = await getCodeTestDetails(localStorage.token, resultId);
			if (data && data.length) {
				codeTasks = data;
				status = 'done';
				return;
			}
		} catch {
			// graded detail unavailable — try raw events below
		}
		// Fallback: raw streamed events. Works for the Schedule path (real job id)
		// and for non-admins; a synthesized run-only job has no events endpoint,
		// so this may come back empty — handled by the "not synced yet" state.
		try {
			const data = await getEvalJobEvents(localStorage.token, job.id);
			events = (data as any).events ?? [];
			benchmarks = (data as any).benchmarks ?? {};
			codeFallback = events.length > 0;
		} catch {
			// no events either — leave codeTasks empty; UI shows retry state
		}
		status = 'done';
	}

	// ── Live streaming ───────────────────────────────────────────────
	function startEventsStream() {
		status = 'streaming';
		stopStream = streamEvalJobLive(
			localStorage.token,
			job.id,
			(event) => {
				events = [...events, event];
				scrollToBottom();
			},
			(doneStatus) => {
				status = 'done';
				toast.success($i18n.t('Evaluation finished: ') + doneStatus);
			},
			(error) => {
				status = 'error';
				errorMessage = error;
			}
		);
	}

	function handleCodeEvent(event: LiveEvalEvent) {
		// code-eval streams task-by-task 'progress' events
		if (event.type && event.type !== 'progress') return;
		liveTotal = event.total || liveTotal;
		const taskId = event.task_id || `Task ${event.index}`;
		const existing = codeTasks.find((t) => t.task_id === taskId);
		if (existing) {
			existing.prompt = event.prompt || existing.prompt;
			const completion = event.response || '';
			if (completion && existing.samples[0]) {
				existing.samples[0].completion = completion;
				existing.samples[0].generation = (event.prompt || '') + completion;
			}
			if (event.passed !== undefined && existing.samples[0]) {
				existing.samples[0].passed = event.passed;
				existing.samples[0].result = event.result || (event.passed ? 'passed' : 'failed');
			}
			codeTasks = codeTasks;
		} else {
			codeTasks = [
				...codeTasks,
				{
					task_id: taskId,
					prompt: event.prompt || '',
					entry_point: event.entry_point || '',
					canonical_solution: '',
					reference_test: '',
					samples: [
						{
							completion_id: 0,
							generation: (event.prompt || '') + (event.response || ''),
							completion: event.response || '',
							passed: event.passed ?? false,
							result: event.result || 'pending'
						}
					]
				}
			];
		}
		scrollToBottom();
	}

	function startCodeStream() {
		status = 'streaming';
		stopStream = streamEvalJobLive(
			localStorage.token,
			job.id,
			handleCodeEvent,
			async (doneStatus) => {
				status = 'done';
				toast.success($i18n.t('Evaluation finished: ') + doneStatus);
				// Replace streamed (possibly ungraded) tasks with the final graded
				// details once the run is scored, and pull the aggregate scores.
				loadCodeScores();
				try {
					const data = await getCodeTestDetails(localStorage.token, resultId);
					if (data && data.length) codeTasks = data;
				} catch {
					// keep the streamed tasks
				}
			},
			(error) => {
				status = 'error';
				errorMessage = error;
			}
		);
	}

	onMount(() => {
		if (isCode) {
			if (isRunning) startCodeStream();
			else loadCodeDetails();
		} else {
			if (isRunning) startEventsStream();
			else loadEvents();
		}
	});

	onDestroy(() => {
		if (stopStream) stopStream();
	});
</script>

<div class="flex flex-col h-full">
	<!-- Header -->
	<div class="flex items-center gap-3 mb-3">
		<button
			class="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-850 transition"
			on:click={() => dispatch('back')}
			title={$i18n.t('Back')}
		>
			<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="size-5">
				<path fill-rule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clip-rule="evenodd" />
			</svg>
		</button>
		<div class="flex-1">
			<div class="text-lg font-medium flex items-center gap-2">
				{title}
				{#if status === 'streaming'}
					<span class="relative flex h-2.5 w-2.5">
						<span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
						<span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-500"></span>
					</span>
				{/if}
			</div>
			<div class="text-xs text-gray-500 dark:text-gray-400">
				{job.model_id} &middot; {job.benchmark}
				{#if isCode && codeTasks.length > 0}
					&middot; {codeTasks.length}{codeTotal ? `/${codeTotal}` : ''} {$i18n.t('tasks')}
				{:else if !isCode && events.length > 0}
					&middot; {events.length}/{totalTasks} {$i18n.t('tasks')}
				{/if}
			</div>
		</div>
		{#if isCode && status !== 'loading' && codeTasks.length > 0}
			<div class="flex items-center gap-3 text-sm">
				<span class="text-green-500 font-medium">{passedCount} {$i18n.t('passed')}</span>
				<span class="text-red-500 font-medium">{failedCount} {$i18n.t('failed')}</span>
				{#if pendingCount > 0}
					<span class="text-yellow-500 font-medium">{pendingCount} {$i18n.t('pending')}</span>
				{/if}
				<span class="text-gray-500">{codeTasks.length} {$i18n.t('total')}</span>
			</div>
		{:else if isRunning}
			<label class="flex items-center gap-1.5 text-xs text-gray-500">
				<input type="checkbox" bind:checked={autoScroll} class="rounded" />
				{$i18n.t('Auto-scroll')}
			</label>
		{/if}
	</div>

	<!-- code-eval pass/fail filter -->
	{#if isCode && status !== 'loading' && codeTasks.length > 0}
		<div class="flex items-center gap-1.5 text-sm mb-3">
			<button
				class="px-2 py-0.5 rounded {filterStatus === 'all'
					? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white'
					: 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}"
				on:click={() => (filterStatus = 'all')}
			>
				{$i18n.t('All')}
			</button>
			<button
				class="px-2 py-0.5 rounded {filterStatus === 'passed'
					? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400'
					: 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}"
				on:click={() => (filterStatus = 'passed')}
			>
				{$i18n.t('Passed')}
			</button>
			<button
				class="px-2 py-0.5 rounded {filterStatus === 'failed'
					? 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400'
					: 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}"
				on:click={() => (filterStatus = 'failed')}
			>
				{$i18n.t('Failed')}
			</button>
		</div>
	{/if}

	<!-- Progress bar (events path) -->
	{#if !isCode && events.length > 0 && totalTasks > 0}
		{@const pct = Math.round((events.length / totalTasks) * 100)}
		<div class="mb-3">
			<div class="w-full bg-gray-200 dark:bg-gray-800 rounded-full h-1.5">
				<div
					class="h-1.5 rounded-full transition-all duration-300 {status === 'done' ? 'bg-green-500' : status === 'error' ? 'bg-red-500' : 'bg-blue-500'}"
					style="width: {pct}%"
				></div>
			</div>
		</div>
	{/if}

	<!-- Progress bar (code-eval live) -->
	{#if isCode && isRunning && codeTasks.length > 0 && codeTotal > 0}
		{@const pct = Math.round((codeTasks.length / codeTotal) * 100)}
		<div class="mb-3">
			<div class="w-full bg-gray-200 dark:bg-gray-800 rounded-full h-1.5">
				<div
					class="h-1.5 rounded-full transition-all duration-300 {status === 'done' ? 'bg-green-500' : status === 'error' ? 'bg-red-500' : 'bg-blue-500'}"
					style="width: {pct}%"
				></div>
			</div>
		</div>
	{/if}

	<!-- Benchmark scores (events path) -->
	{#if !isCode && hasBenchmarks}
		<div class="mb-3 flex flex-wrap gap-3 text-xs">
			{#each Object.entries(benchmarks) as [bench, score]}
				<div class="px-2 py-1 rounded bg-gray-50 dark:bg-gray-850">
					<span class="text-gray-500 capitalize">{formatBenchmarkName(bench)}:</span>
					<span class="font-semibold ml-1 {scoreColor(score)}">{score.toFixed(1)}%</span>
				</div>
			{/each}
		</div>
	{/if}

	<!-- Graded scores (code-eval): the harness's aggregate pass@k per task -->
	{#if isCode && codeScoreEntries(codeScores).length}
		<div class="mb-3 flex flex-wrap gap-3 text-xs">
			{#each codeScoreEntries(codeScores) as e}
				<div class="px-2 py-1 rounded bg-gray-50 dark:bg-gray-850">
					<span class="text-gray-500 capitalize"
						>{formatBenchmarkName(e.task)}{e.label ? ` ${e.label}` : ''}:</span
					>
					<span class="font-semibold ml-1 {scoreColor(e.pct)}">{e.pct.toFixed(1)}%</span>
				</div>
			{/each}
		</div>
	{/if}

	<!-- Status messages -->
	{#if status === 'error'}
		<div class="mb-3 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm">
			{errorMessage}
		</div>
	{/if}

	{#if isCode && !codeFallback}
		<!-- ══ code-eval: unified live + graded pass/fail task list ══ -->
		<div
			bind:this={listEl}
			class="flex-1 overflow-y-auto space-y-1 min-h-0"
			on:scroll={() => {
				if (listEl) {
					const atBottom = listEl.scrollHeight - listEl.scrollTop - listEl.clientHeight < 50;
					autoScroll = atBottom;
				}
			}}
		>
			{#if codeTasks.length === 0 && (status === 'streaming' || status === 'loading')}
				<div class="flex flex-col items-center justify-center py-12 text-gray-400">
					<Spinner />
					<div class="mt-3 text-sm">
						{status === 'streaming' ? $i18n.t('Waiting for first task...') : $i18n.t('Loading events...')}
					</div>
				</div>
			{:else if codeTasks.length === 0 && status === 'done'}
				<div class="flex flex-col items-center justify-center py-12 text-center gap-2">
					<div class="text-sm text-gray-500 dark:text-gray-400">
						{$i18n.t('Graded results aren’t available yet.')}
					</div>
					<div class="text-xs text-gray-400 dark:text-gray-500 max-w-sm">
						{$i18n.t('Results sync from the code-eval harness shortly after a run finishes. Try again in a moment.')}
					</div>
					<button
						class="mt-1 px-3 py-1 rounded-lg text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white transition"
						on:click={loadCodeDetails}
					>
						{$i18n.t('Retry')}
					</button>
				</div>
			{/if}

			{#each filteredTasks as task (task.task_id)}
				{@const st = isPending(task) ? 'pending' : isPassed(task) ? 'passed' : 'failed'}
				<div class="rounded border border-gray-100 dark:border-gray-800">
					<button
						class="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-850/50"
						on:click={() => toggleTask(task.task_id)}
					>
						<div class="flex items-center gap-2 text-xs">
							<span
								class="inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold {st === 'passed'
									? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400'
									: st === 'pending'
										? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400'
										: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400'}"
							>
								{st === 'passed' ? '✓' : st === 'pending' ? '⋯' : '✗'}
							</span>
							<span class="font-mono font-medium text-gray-900 dark:text-white">
								{task.task_id}
							</span>
							<span class="text-gray-500">{task.entry_point}</span>
						</div>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							viewBox="0 0 16 16"
							fill="currentColor"
							class="size-3 text-gray-400 transition-transform {expandedTask === task.task_id ? 'rotate-180' : ''}"
						>
							<path fill-rule="evenodd" d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06Z" clip-rule="evenodd" />
						</svg>
					</button>

					{#if expandedTask === task.task_id}
						<div class="border-t border-gray-100 dark:border-gray-800 px-3 py-2 space-y-3">
							<!-- Prompt -->
							<div>
								<div class="text-[10px] uppercase font-semibold text-gray-500 mb-1">{$i18n.t('Prompt')}</div>
								<pre class="text-xs bg-gray-50 dark:bg-gray-850 rounded p-2 overflow-x-auto whitespace-pre-wrap font-mono max-h-48 overflow-y-auto">{task.prompt}</pre>
							</div>

							<!-- Entry Point -->
							{#if task.entry_point}
								<div>
									<div class="text-[10px] uppercase font-semibold text-gray-500 mb-1">{$i18n.t('Entry Point')}</div>
									<code class="text-xs font-mono bg-gray-50 dark:bg-gray-850 rounded px-2 py-1">{task.entry_point}</code>
								</div>
							{/if}

							<!-- Samples / Completions -->
							{#each task.samples as sample, idx}
								<div>
									<div class="flex items-center gap-2 mb-1">
										<span class="text-[10px] uppercase font-semibold text-gray-500">{$i18n.t('Sample')} {idx + 1}</span>
										<span
											class="text-[10px] px-1.5 py-0.5 rounded font-medium {sample.passed
												? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400'
												: sample.result === 'pending'
													? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400'
													: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400'}"
										>
											{sample.result || 'pending'}
										</span>
									</div>
									{#if sample.completion}
										<div class="text-[10px] uppercase font-semibold text-gray-400 mb-0.5 mt-1">{$i18n.t('Completion')}</div>
										<pre class="text-xs bg-gray-50 dark:bg-gray-850 rounded p-2 overflow-x-auto whitespace-pre-wrap font-mono max-h-48 overflow-y-auto">{sample.completion}</pre>
									{/if}
									{#if sample.generation}
										<div class="text-[10px] uppercase font-semibold text-gray-400 mb-0.5 mt-1">{$i18n.t('Full Generation')}</div>
										<pre class="text-xs bg-gray-50 dark:bg-gray-850 rounded p-2 overflow-x-auto whitespace-pre-wrap font-mono max-h-64 overflow-y-auto">{sample.generation}</pre>
									{/if}
								</div>
							{/each}

							<!-- Canonical solution -->
							{#if task.canonical_solution}
								<div>
									<div class="text-[10px] uppercase font-semibold text-gray-500 mb-1">{$i18n.t('Reference Solution')}</div>
									<pre class="text-xs bg-gray-50 dark:bg-gray-850 rounded p-2 overflow-x-auto whitespace-pre-wrap font-mono max-h-48 overflow-y-auto">{task.canonical_solution}</pre>
								</div>
							{/if}

							<!-- Reference test -->
							{#if task.reference_test}
								<div>
									<div class="text-[10px] uppercase font-semibold text-gray-500 mb-1">{$i18n.t('Reference Test')}</div>
									<pre class="text-xs bg-gray-50 dark:bg-gray-850 rounded p-2 overflow-x-auto whitespace-pre-wrap font-mono max-h-48 overflow-y-auto">{task.reference_test}</pre>
								</div>
							{/if}
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{:else}
		<!-- ══ language-eval / generic events list ══ -->
		<div
			bind:this={listEl}
			class="flex-1 overflow-y-auto space-y-2 min-h-0"
			on:scroll={() => {
				if (listEl) {
					const atBottom = listEl.scrollHeight - listEl.scrollTop - listEl.clientHeight < 50;
					autoScroll = atBottom;
				}
			}}
		>
			{#if events.length === 0 && (status === 'streaming' || status === 'loading')}
				<div class="flex flex-col items-center justify-center py-12 text-gray-400">
					<Spinner />
					<div class="mt-3 text-sm">
						{status === 'streaming' ? $i18n.t('Waiting for first task...') : $i18n.t('Loading events...')}
					</div>
				</div>
			{:else if events.length === 0 && status === 'done'}
				<div class="text-center text-xs text-gray-500 dark:text-gray-400 py-6">
					{$i18n.t('No event data recorded for this job.')}
				</div>
			{/if}

			{#each events as event, i (event.index)}
				<button
					class="w-full text-left rounded-xl border transition
						{expandedIndex === i
							? 'border-blue-300 dark:border-blue-700 bg-blue-50/50 dark:bg-blue-900/10'
							: 'border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700'}
						p-3"
					on:click={() => toggleExpand(i)}
				>
					<!-- Task header -->
					<div class="flex items-center justify-between">
						<div class="flex items-center gap-2">
							<span class="text-xs font-mono px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
								{event.index + 1}/{totalTasks}
							</span>
							<span class="text-sm font-medium text-gray-900 dark:text-white">
								{getEventLabel(event)}
							</span>
							{#if event.metrics}
								{#each Object.entries(event.metrics) as [key, val]}
									<span class="px-1.5 py-0.5 rounded text-[10px] font-medium {Number(val) >= 0.5 ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400' : 'bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400'}">
										{key}: {formatMetricValue(val)}
									</span>
								{/each}
							{/if}
						</div>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							viewBox="0 0 20 20"
							fill="currentColor"
							class="size-4 text-gray-400 transition-transform {expandedIndex === i ? 'rotate-180' : ''}"
						>
							<path fill-rule="evenodd" d="M5.22 8.22a.75.75 0 011.06 0L10 11.94l3.72-3.72a.75.75 0 111.06 1.06l-4.25 4.25a.75.75 0 01-1.06 0L5.22 9.28a.75.75 0 010-1.06z" clip-rule="evenodd" />
						</svg>
					</div>

					<!-- Preview (collapsed) -->
					{#if expandedIndex !== i}
						<div class="mt-1.5 text-xs text-gray-500 dark:text-gray-400 truncate font-mono">
							{getEventPreview(event)}
						</div>
					{/if}

					<!-- Expanded content -->
					{#if expandedIndex === i}
						<div class="mt-3 space-y-3">
							{#if event.prompt}
								<div>
									<div class="text-[11px] uppercase font-medium text-gray-500 dark:text-gray-400 mb-1">
										{$i18n.t('Prompt')}
									</div>
									<pre class="text-xs bg-gray-50 dark:bg-gray-900 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-words max-h-64 overflow-y-auto font-mono text-gray-800 dark:text-gray-200">{event.prompt}</pre>
								</div>
							{/if}
							{#if event.thinking}
								<div>
									<div class="text-[11px] uppercase font-medium text-gray-500 dark:text-gray-400 mb-1">
										{$i18n.t('Thinking')}
									</div>
									<pre class="text-xs bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/30 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-words max-h-48 overflow-y-auto font-mono text-amber-800 dark:text-amber-200">{event.thinking}</pre>
								</div>
							{/if}
							{#if event.target}
								<div>
									<div class="text-[11px] uppercase font-medium text-gray-500 dark:text-gray-400 mb-1">
										{$i18n.t('Expected')}
									</div>
									<pre class="text-xs bg-gray-50 dark:bg-gray-900 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-words max-h-40 overflow-y-auto font-mono text-gray-800 dark:text-gray-200">{event.target}</pre>
								</div>
							{/if}
							{#if event.scored_response || event.response}
								<div>
									<div class="text-[11px] uppercase font-medium text-gray-500 dark:text-gray-400 mb-1">
										{$i18n.t('Response')}
									</div>
									<pre class="text-xs bg-gray-50 dark:bg-gray-900 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-words max-h-64 overflow-y-auto font-mono text-gray-800 dark:text-gray-200">{event.scored_response ?? event.response}</pre>
								</div>
							{/if}
							{#if event.completions}
								{#each event.completions as completion, ci}
									<div>
										<div class="text-[11px] uppercase font-medium text-gray-500 dark:text-gray-400 mb-1">
											{$i18n.t('Response')}{event.completions.length > 1 ? ` #${ci + 1}` : ''}
										</div>
										<pre class="text-xs bg-gray-50 dark:bg-gray-900 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-words max-h-64 overflow-y-auto font-mono text-gray-800 dark:text-gray-200">{completion}</pre>
									</div>
								{/each}
							{/if}
							{#if event.metrics && Object.keys(event.metrics).length > 0}
								<div>
									<div class="text-[11px] uppercase font-medium text-gray-500 dark:text-gray-400 mb-1">
										{$i18n.t('Metrics')}
									</div>
									<div class="flex flex-wrap gap-2">
										{#each Object.entries(event.metrics) as [key, val]}
											<span class="px-2 py-1 rounded-lg text-xs font-mono bg-gray-50 dark:bg-gray-900 text-gray-700 dark:text-gray-300">
												{key}: {formatMetricValue(val)}
											</span>
										{/each}
									</div>
								</div>
							{/if}
						</div>
					{/if}
				</button>
			{/each}
		</div>
	{/if}

	<!-- Done footer -->
	{#if status === 'done'}
		{#if isCode && !codeFallback && codeTasks.length > 0}
			{#if pendingCount > 0}
				<div class="mt-3 flex items-center justify-center gap-2 text-sm text-yellow-600 dark:text-yellow-400 font-medium py-2">
					{$i18n.t('Grades still syncing')} &mdash; {pendingCount} {$i18n.t('pending')}
					<button
						class="px-2 py-0.5 rounded-lg text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white transition"
						on:click={loadCodeDetails}
					>
						{$i18n.t('Refresh')}
					</button>
				</div>
			{:else}
				<div class="mt-3 text-center text-sm text-green-600 dark:text-green-400 font-medium py-2">
					{$i18n.t('Evaluation complete')} &mdash; {passedCount}/{codeTasks.length} {$i18n.t('passed')}
				</div>
			{/if}
		{:else if !isCode && events.length > 0}
			<div class="mt-3 text-center text-sm text-green-600 dark:text-green-400 font-medium py-2">
				{$i18n.t('Evaluation complete')} &mdash; {events.length} {$i18n.t('tasks')}
			</div>
		{/if}
	{/if}
</div>
