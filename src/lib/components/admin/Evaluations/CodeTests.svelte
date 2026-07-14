<script lang="ts">
	import type { i18n as i18nType } from 'i18next';
	import type { Writable } from 'svelte/store';
	import { onMount, getContext } from 'svelte';
	import { toast } from 'svelte-sonner';

	import Spinner from '$lib/components/common/Spinner.svelte';
	import LiveEvalView from '$lib/components/evaluations/LiveEvalView.svelte';
	import {
		getCodeTestsSummary,
		getCodeTestsBenchmark,
		getModelRuns
	} from '$lib/apis/evaluations/codetests';
	import { getEvalJobs, type EvalJob } from '$lib/apis/evaluations/jobs';

	const i18n: Writable<i18nType> = getContext('i18n');

	const getToken = () => localStorage.getItem('token') ?? '';

	// ── Types ──────────────────────────────────────────────────────────
	type SummaryModel = {
		model: string;
		benchmarks: Record<string, number>;
		average: number;
		runs: number;
	};

	type BenchmarkRow = {
		model: string;
		result_id: string;
		q1: number;
		q2: number;
		q3: number;
		q4: number;
		total: number;
	};

	type RunSummary = {
		id: string;
		filename: string;
		model: string;
		tasks: string;
		scores: Record<string, Record<string, number>>;
		config: Record<string, unknown>;
		created_at: string | null;
	};

	// ── View state ─────────────────────────────────────────────────────
	// 'tabs' = main tabbed view, 'model-runs' = model run list, 'run-details' = single run detail
	type ViewMode = 'tabs' | 'model-runs' | 'run-details';
	let viewMode: ViewMode = 'tabs';

	// Tab state
	let activeTab = 'general';
	let benchmarkNames: string[] = [];

	// General tab
	let summaryModels: SummaryModel[] = [];
	let summaryLoading = true;
	let summarySortKey = 'model';
	let summarySortAsc = true;

	// Benchmark tabs
	let benchmarkRows: BenchmarkRow[] = [];
	let benchmarkLoading = false;
	let benchmarkSortKey = 'model';
	let benchmarkSortAsc = true;
	let loadedBenchmark = '';

	// Model runs view
	let selectedModelName = '';
	let modelRuns: RunSummary[] = [];
	let modelRunsLoading = false;

	// Live jobs tracking
	let runningJobs: EvalJob[] = [];

	// Run detail view — delegated to the unified LiveEvalView
	let activeDetailJob: EvalJob | null = null;

	// ── Derived ────────────────────────────────────────────────────────
	$: sortedSummary = [...summaryModels].sort((a, b) => {
		let va: string | number, vb: string | number;
		if (summarySortKey === 'model') {
			va = a.model.toLowerCase();
			vb = b.model.toLowerCase();
		} else if (summarySortKey === 'average') {
			va = a.average;
			vb = b.average;
		} else {
			va = a.benchmarks[summarySortKey] ?? -1;
			vb = b.benchmarks[summarySortKey] ?? -1;
		}
		if (va < vb) return summarySortAsc ? -1 : 1;
		if (va > vb) return summarySortAsc ? 1 : -1;
		return 0;
	});

	$: sortedBenchmarkRows = [...benchmarkRows].sort((a, b) => {
		// Every BenchmarkRow field is either string or number.
		const va = (a as Record<string, string | number>)[benchmarkSortKey] ?? '';
		const vb = (b as Record<string, string | number>)[benchmarkSortKey] ?? '';
		const aVal = typeof va === 'string' ? va.toLowerCase() : va;
		const bVal = typeof vb === 'string' ? vb.toLowerCase() : vb;
		if (aVal < bVal) return benchmarkSortAsc ? -1 : 1;
		if (aVal > bVal) return benchmarkSortAsc ? 1 : -1;
		return 0;
	});

	// ── Actions ────────────────────────────────────────────────────────
	async function loadSummary() {
		summaryLoading = true;
		try {
			const data = await getCodeTestsSummary(localStorage.token);
			if (data) {
				summaryModels = data.models ?? [];
				benchmarkNames = data.benchmark_names ?? [];
			}
		} catch (err) {
			toast.error(`Failed to load summary: ${err}`);
		}
		summaryLoading = false;
	}

	async function loadBenchmark(benchmark: string) {
		if (loadedBenchmark === benchmark && benchmarkRows.length > 0) return;
		benchmarkLoading = true;
		benchmarkSortKey = 'model';
		benchmarkSortAsc = true;
		try {
			const data = await getCodeTestsBenchmark(localStorage.token, benchmark);
			if (data) {
				benchmarkRows = data.rows ?? [];
				loadedBenchmark = benchmark;
			}
		} catch (err) {
			toast.error(`Failed to load benchmark data: ${err}`);
			benchmarkRows = [];
		}
		benchmarkLoading = false;
	}

	function selectTab(tab: string) {
		activeTab = tab;
		if (tab !== 'general') {
			loadBenchmark(tab);
		}
	}

	async function selectModel(modelName: string) {
		selectedModelName = modelName;
		viewMode = 'model-runs';
		modelRunsLoading = true;
		try {
			modelRuns = (await getModelRuns(getToken(), modelName)) ?? [];
		} catch (err) {
			toast.error(`Failed to load model runs: ${err}`);
			modelRuns = [];
		}
		modelRunsLoading = false;
		loadRunningJobs();
	}

	// View a completed run — synthesize a minimal EvalJob so the unified
	// LiveEvalView can load the graded pass/fail detail (result id == run id).
	function selectRunDetail(run: RunSummary) {
		activeDetailJob = {
			id: run.id,
			user_id: '',
			eval_type: 'code-eval',
			benchmark: run.tasks,
			model_id: run.model,
			status: 'completed',
			scheduled_for: null,
			error_message: null,
			meta: { code_job_id: run.id },
			created_at: run.created_at ? new Date(run.created_at).getTime() / 1000 : 0,
			updated_at: 0,
			user: null
		};
		viewMode = 'run-details';
	}

	// Watch a running job live — hand the real job straight to LiveEvalView.
	function openLiveJob(job: EvalJob) {
		activeDetailJob = job;
		viewMode = 'run-details';
	}

	function goBackToTabs() {
		viewMode = 'tabs';
		selectedModelName = '';
		modelRuns = [];
	}

	function goBackToModelRuns() {
		viewMode = 'model-runs';
		activeDetailJob = null;
	}

	function toggleSummarySort(key: string) {
		if (summarySortKey === key) {
			summarySortAsc = !summarySortAsc;
		} else {
			summarySortKey = key;
			summarySortAsc = key === 'model';
		}
	}

	function toggleBenchmarkSort(key: string) {
		if (benchmarkSortKey === key) {
			benchmarkSortAsc = !benchmarkSortAsc;
		} else {
			benchmarkSortKey = key;
			benchmarkSortAsc = key === 'model';
		}
	}

	function scoreColor(score: number): string {
		if (score >= 70) return 'text-green-500';
		if (score >= 40) return 'text-yellow-500';
		return 'text-red-500';
	}

	function formatPassRate(scores: Record<string, Record<string, number>>): string {
		for (const [, metrics] of Object.entries(scores)) {
			if (metrics['pass@1'] !== undefined) {
				return `${(metrics['pass@1'] * 100).toFixed(1)}%`;
			}
		}
		return '-';
	}

	function formatDate(dateStr: string | null): string {
		if (!dateStr) return '-';
		try {
			const d = new Date(dateStr);
			return d.toLocaleString();
		} catch {
			return dateStr;
		}
	}

	async function loadRunningJobs() {
		try {
			const jobs = await getEvalJobs(getToken());
			runningJobs = jobs.filter(
				(j) => j.eval_type === 'code-eval' && ['pending', 'queued', 'running'].includes(j.status)
			);
		} catch {
			// silently ignore — live runs are a bonus
		}
	}

	onMount(() => {
		loadSummary();
		loadRunningJobs();
	});
</script>

<!-- ── Header / Breadcrumbs (hidden in run-details — LiveEvalView has its own) ── -->
{#if viewMode !== 'run-details'}
<div class="mt-0.5 mb-2 gap-1 flex flex-col md:flex-row justify-between">
	<div class="flex md:self-center text-lg font-medium px-0.5 shrink-0 items-center">
		{#if viewMode === 'model-runs'}
			<button
				class="flex items-center gap-1 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 mr-2"
				on:click={goBackToTabs}
			>
				<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="size-4">
					<path fill-rule="evenodd" d="M9.78 4.22a.75.75 0 0 1 0 1.06L7.06 8l2.72 2.72a.75.75 0 1 1-1.06 1.06L5.47 8.53a.75.75 0 0 1 0-1.06l3.25-3.25a.75.75 0 0 1 1.06 0Z" clip-rule="evenodd" />
				</svg>
			</button>
			<div class="gap-1">
				{selectedModelName}
				<span class="text-sm text-gray-500 ml-1">(Runs)</span>
			</div>
		{:else}
			<div class="gap-1">
				{$i18n.t('Code Tests')}
			</div>
		{/if}
	</div>
</div>
{/if}

<!-- ── Main content ──────────────────────────────────────────────── -->
{#if viewMode === 'tabs'}
	<!-- Tab bar -->
	<div class="flex border-b border-gray-200 dark:border-gray-700 mb-3 overflow-x-auto scrollbar-hidden">
		<button
			class="px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors
				{activeTab === 'general'
					? 'border-blue-500 text-blue-600 dark:text-blue-400'
					: 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300'}"
			on:click={() => selectTab('general')}
		>
			General
		</button>
		{#each benchmarkNames as bm (bm)}
			<button
				class="px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors capitalize
					{activeTab === bm
						? 'border-blue-500 text-blue-600 dark:text-blue-400'
						: 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300'}"
				on:click={() => selectTab(bm)}
			>
				{bm}
			</button>
		{/each}
	</div>

	{#if activeTab === 'general'}
		<!-- ── General Tab ────────────────────────────────────────── -->
		{#if summaryLoading}
			<div class="flex justify-center py-8"><Spinner /></div>
		{:else if summaryModels.length === 0}
			<div class="text-center text-xs text-gray-500 dark:text-gray-400 py-6">
				{$i18n.t('No code test results found. Run a code-eval evaluation to see results here.')}
			</div>
		{:else}
			<div class="scrollbar-hidden relative whitespace-nowrap overflow-x-auto max-w-full rounded pt-0.5">
				<table class="w-full text-sm text-left text-gray-500 dark:text-gray-400 table-auto max-w-full rounded">
					<thead class="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-850 dark:text-gray-400 -translate-y-0.5">
						<tr>
							<th
								scope="col"
								class="px-3 py-1.5 cursor-pointer select-none hover:text-gray-900 dark:hover:text-white"
								on:click={() => toggleSummarySort('model')}
							>
								<div class="flex items-center gap-1">
									Model
									{#if summarySortKey === 'model'}
										<span class="text-blue-500">{summarySortAsc ? '▲' : '▼'}</span>
									{/if}
								</div>
							</th>
							{#each benchmarkNames as bm (bm)}
								<th
									scope="col"
									class="px-3 py-1.5 text-right cursor-pointer select-none hover:text-gray-900 dark:hover:text-white capitalize"
									on:click={() => toggleSummarySort(bm)}
								>
									<div class="flex items-center justify-end gap-1">
										{bm}
										{#if summarySortKey === bm}
											<span class="text-blue-500">{summarySortAsc ? '▲' : '▼'}</span>
										{/if}
									</div>
								</th>
							{/each}
							<th
								scope="col"
								class="px-3 py-1.5 text-right cursor-pointer select-none hover:text-gray-900 dark:hover:text-white"
								on:click={() => toggleSummarySort('average')}
							>
								<div class="flex items-center justify-end gap-1">
									Average
									{#if summarySortKey === 'average'}
										<span class="text-blue-500">{summarySortAsc ? '▲' : '▼'}</span>
									{/if}
								</div>
							</th>
						</tr>
					</thead>
					<tbody>
						{#each sortedSummary as row (row.model)}
							<tr
								class="bg-white dark:bg-gray-900 dark:border-gray-850 text-xs hover:bg-gray-50 dark:hover:bg-gray-850/50 cursor-pointer"
								on:click={() => selectModel(row.model)}
							>
								<td class="px-3 py-2 font-medium text-gray-900 dark:text-white">
									{row.model}
								</td>
								{#each benchmarkNames as bm (bm)}
									<td class="px-3 py-2 text-right font-semibold">
										{#if row.benchmarks[bm] !== undefined}
											<span class={scoreColor(row.benchmarks[bm])}>
												{row.benchmarks[bm].toFixed(1)}%
											</span>
										{:else}
											<span class="text-gray-400">-</span>
										{/if}
									</td>
								{/each}
								<td class="px-3 py-2 text-right font-bold">
									<span class={scoreColor(row.average)}>
										{row.average.toFixed(1)}%
									</span>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	{:else}
		<!-- ── Benchmark Tab (quartiles) ─────────────────────────── -->
		{#if benchmarkLoading}
			<div class="flex justify-center py-8"><Spinner /></div>
		{:else if benchmarkRows.length === 0}
			<div class="text-center text-xs text-gray-500 dark:text-gray-400 py-6">
				No results for this benchmark.
			</div>
		{:else}
			<div class="scrollbar-hidden relative whitespace-nowrap overflow-x-auto max-w-full rounded pt-0.5">
				<table class="w-full text-sm text-left text-gray-500 dark:text-gray-400 table-auto max-w-full rounded">
					<thead class="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-850 dark:text-gray-400 -translate-y-0.5">
						<tr>
							<th
								scope="col"
								class="px-3 py-1.5 cursor-pointer select-none hover:text-gray-900 dark:hover:text-white"
								on:click={() => toggleBenchmarkSort('model')}
							>
								<div class="flex items-center gap-1">
									Model
									{#if benchmarkSortKey === 'model'}
										<span class="text-blue-500">{benchmarkSortAsc ? '▲' : '▼'}</span>
									{/if}
								</div>
							</th>
							{#each ['q1', 'q2', 'q3', 'q4'] as q (q)}
								<th
									scope="col"
									class="px-3 py-1.5 text-right cursor-pointer select-none hover:text-gray-900 dark:hover:text-white uppercase"
									on:click={() => toggleBenchmarkSort(q)}
								>
									<div class="flex items-center justify-end gap-1">
										{q}
										{#if benchmarkSortKey === q}
											<span class="text-blue-500">{benchmarkSortAsc ? '▲' : '▼'}</span>
										{/if}
									</div>
								</th>
							{/each}
							<th
								scope="col"
								class="px-3 py-1.5 text-right cursor-pointer select-none hover:text-gray-900 dark:hover:text-white"
								on:click={() => toggleBenchmarkSort('total')}
							>
								<div class="flex items-center justify-end gap-1">
									Total
									{#if benchmarkSortKey === 'total'}
										<span class="text-blue-500">{benchmarkSortAsc ? '▲' : '▼'}</span>
									{/if}
								</div>
							</th>
						</tr>
					</thead>
					<tbody>
						{#each sortedBenchmarkRows as row (row.model)}
							<tr
								class="bg-white dark:bg-gray-900 dark:border-gray-850 text-xs hover:bg-gray-50 dark:hover:bg-gray-850/50 cursor-pointer"
								on:click={() => selectModel(row.model)}
							>
								<td class="px-3 py-2 font-medium text-gray-900 dark:text-white">
									{row.model}
								</td>
								{#each ['q1', 'q2', 'q3', 'q4'] as q (q)}
									<td class="px-3 py-2 text-right font-semibold">
										<span class={scoreColor(row[q])}>
											{row[q].toFixed(1)}%
										</span>
									</td>
								{/each}
								<td class="px-3 py-2 text-right font-bold">
									<span class={scoreColor(row.total)}>
										{row.total.toFixed(1)}%
									</span>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	{/if}

{:else if viewMode === 'model-runs'}
	<!-- ── Model Runs List ────────────────────────────────────────── -->
	{#if modelRunsLoading}
		<div class="flex justify-center py-8"><Spinner /></div>
	{:else}
		<!-- Running / Queued jobs for this model -->
		{#if runningJobs.filter(j => j.model_id === selectedModelName).length > 0}
			<div class="mb-4">
				<div class="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5 px-0.5">Active Jobs</div>
				<div class="space-y-1">
					{#each runningJobs.filter(j => j.model_id === selectedModelName) as job (job.id)}
						<div
							class="flex items-center justify-between px-3 py-2 rounded border border-blue-100 dark:border-blue-900 bg-blue-50/50 dark:bg-blue-950/20 cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-950/40"
							role="button"
							tabindex="0"
							on:click={() => openLiveJob(job)}
							on:keydown={(e) => {
								if (e.key === 'Enter' || e.key === ' ') {
									e.preventDefault();
									openLiveJob(job);
								}
							}}
						>
							<div class="flex items-center gap-2 text-xs">
								<span class="px-2 py-0.5 rounded text-[10px] font-medium {job.status === 'running' ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400' : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400'}">
									{job.status}
								</span>
								<span class="text-gray-900 dark:text-white">{job.benchmark}</span>
							</div>
							<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="size-3.5 text-blue-500 animate-pulse">
								<path d="M8 1a1 1 0 0 1 1 1v6a1 1 0 1 1-2 0V2a1 1 0 0 1 1-1Zm4 1a1 1 0 1 0 0 2 1 1 0 0 0 0-2ZM4 3a1 1 0 1 0 0 2 1 1 0 0 0 0-2Zm8 2a1 1 0 1 0 0 2 1 1 0 0 0 0-2ZM2 6a1 1 0 1 0 0 2 1 1 0 0 0 0-2Zm11 1a1 1 0 1 0 0 2 1 1 0 0 0 0-2ZM3 9a1 1 0 1 0 0 2 1 1 0 0 0 0-2Zm9 1a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z"/>
							</svg>
						</div>
					{/each}
				</div>
			</div>
		{/if}

		{#if modelRuns.length === 0 && runningJobs.filter(j => j.model_id === selectedModelName).length === 0}
			<div class="text-center text-xs text-gray-500 dark:text-gray-400 py-6">
				No runs found for this model.
			</div>
		{/if}

		{#if modelRuns.length > 0}
		<div class="scrollbar-hidden relative whitespace-nowrap overflow-x-auto max-w-full rounded pt-0.5">
			<table class="w-full text-sm text-left text-gray-500 dark:text-gray-400 table-auto max-w-full rounded">
				<thead class="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-850 dark:text-gray-400 -translate-y-0.5">
					<tr>
						<th scope="col" class="px-3 py-1.5">Run ID</th>
						<th scope="col" class="px-3 py-1.5">Benchmark</th>
						<th scope="col" class="px-3 py-1.5 text-right">pass@1</th>
						<th scope="col" class="px-3 py-1.5">Date</th>
						<th scope="col" class="px-3 py-1.5 text-right">Details</th>
					</tr>
				</thead>
				<tbody>
					{#each modelRuns as run (run.id)}
						<tr
							class="bg-white dark:bg-gray-900 dark:border-gray-850 text-xs hover:bg-gray-50 dark:hover:bg-gray-850/50 cursor-pointer"
							on:click={() => selectRunDetail(run)}
						>
							<td class="px-3 py-2 font-mono text-gray-900 dark:text-white">
								{run.id}
							</td>
							<td class="px-3 py-2 capitalize">{run.tasks}</td>
							<td class="px-3 py-2 text-right font-semibold">
								<span class={parseFloat(formatPassRate(run.scores)) >= 50 ? 'text-green-500' : 'text-red-500'}>
									{formatPassRate(run.scores)}
								</span>
							</td>
							<td class="px-3 py-2 text-gray-500">
								{formatDate(run.created_at)}
							</td>
							<td class="px-3 py-2 text-right">
								<button class="text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300">
									View
								</button>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
	{/if}

{:else if viewMode === 'run-details'}
	<!-- ── Run Detail / Live View — unified LiveEvalView ──────────── -->
	{#if activeDetailJob}
		<LiveEvalView job={activeDetailJob} on:back={goBackToModelRuns} />
	{/if}
{/if}
