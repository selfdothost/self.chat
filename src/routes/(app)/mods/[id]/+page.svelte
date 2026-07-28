<script lang="ts">
	// The ONE generic, id-parameterized route every mod view resolves through
	// (client R1). There is deliberately no per-mod file under `src/routes/`:
	// adding a mod must not touch `src/routes/` and must not trigger a client
	// rebuild, so every mod's nav entry links here with its id as the route param.
	//
	// Layering on this one route:
	//   T-C02 (R2) — fetch the fresh per-mod manifest, then dynamic-`import()` the
	//                resolved bundle (which runs the bundle's own
	//                `customElements.define()`). Lives in `$lib/mods/loader`.
	//   T-C04 (R3) — instantiate the mod's custom element and hand it auth/context
	//                by INSTANCE PROPERTY assignment (never attributes), set before
	//                DOM insertion, per-instance (no shared window object).
	//   T-C06 (R5) — graceful failure — a "mod unavailable" fallback that
	//                distinguishes what the browser actually lets us distinguish
	//                (a received HTTP error = reached a server, vs a network-level
	//                throw = no response, i.e. blocked OR down), never hard-reloading
	//                the SPA, never poisoning other mods.
	//   T-C05 (R4) — THIS: wrap the mount container in a Svelte 5 `<svelte:boundary>`
	//                so a POST-mount thrown error inside the mod is contained to the
	//                mod's own view slot, never breaking the shell. The mount runs
	//                via the `mountMod` action so it executes WITHIN the boundary's
	//                effect scope (see the boundary block below for exactly what this
	//                does and does not contain, and the named residual risks).
	//   T-C07 (R6) — THIS: teardown on navigation away is the standard Web Components
	//                path (real DOM removal fires `disconnectedCallback`, Svelte
	//                destroys the inner component next tick) — no bespoke teardown
	//                code; see `mountMod`'s teardown note.
	import type { i18n as i18nType } from 'i18next';
	import type { Writable } from 'svelte/store';
	import { getContext } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';

	import { WEBUI_API_BASE_URL } from '$lib/constants';
	import { user, showSidebar, type SessionUser } from '$lib/stores';
	import { loadModBundleDeduped } from '$lib/mods/loader';
	import MenuLines from '$lib/components/icons/MenuLines.svelte';
	import PencilSquare from '$lib/components/icons/PencilSquare.svelte';
	import UserMenu from '$lib/components/layout/Sidebar/UserMenu.svelte';
	import Tooltip from '$lib/components/common/Tooltip.svelte';

	const i18n: Writable<i18nType> = getContext('i18n');

	type ViewState = 'loading' | 'ready' | 'unavailable';

	// The failure taxonomy the "mod unavailable" fallback distinguishes (R5). Only
	// the distinctions the browser genuinely exposes are made — see `enterMod`.
	type FailureKind = 'not_found' | 'no_bundle' | 'server_error' | 'unreachable';

	// The host ↔ mod context contract: the values the host assigns onto the mod's
	// custom element as INSTANCE PROPERTIES (R3). Property assignment (not HTML
	// attributes) keeps the auth token off the serialized DOM and carries structured
	// values; the mod's root component reads them through `$props()`.
	type ModElementContext = {
		authToken: string | undefined;
		apiBase: string;
		currentUser: SessionUser | undefined;
	};

	let state: ViewState = 'loading';
	let tag: string | null = null;
	let failureKind: FailureKind | null = null;

	// R4 real containment (post-CI-finding fix): a custom element's `connectedCallback`
	// reaction, per the HTML/Custom Elements spec, has its thrown exception REPORTED to
	// the global scope, not synchronously propagated back through the DOM call that
	// triggered it (`appendChild`). It never enters Svelte's own render/effect call
	// stack, so `<svelte:boundary>` structurally cannot catch it — confirmed by a real
	// CI failure (the throw surfaced as an unhandled exception, not a caught `failed`
	// state). Set by `handleReportedMountError`, the `window` 'error' listener that IS
	// the correct channel for this class of error. Distinct from the boundary's own
	// `failed` snippet trigger; both render the SAME contained UI (see `crashed`
	// snippet below) via two different catch paths for two different error classes.
	let mountCrashError: unknown = null;

	// AC2 (R2) — re-fetch on EACH view-entry. The load is driven by a reactive block
	// keyed on the route param, NOT a one-time `onMount`. SvelteKit reuses this
	// component instance across `[id]` changes (the same pattern `(app)/channels/[id]`
	// relies on), so keying on `$page.params.id` lets SvelteKit's own navigation
	// lifecycle re-run the load: A → B → A re-fetches A's manifest.
	$: modId = $page.params.id;
	$: void enterMod(modId);

	// A monotonic token guards against a stale async completion clobbering a newer
	// view-entry's state (A → B where A resolves last). This is NOT the concurrent
	// same-mod de-duplication of `import()`/`define()` — that is done by
	// `loadModBundleDeduped` (T-C03), which wraps `loadModBundle` with an in-flight
	// `Map<modId, Promise>`. This is only last-write-wins for the view's own display
	// state; the two guards are complementary and independent.
	let loadToken = 0;

	// R3 (T-C04): instantiate the mod's custom element and hand it auth/context.
	function mountModElement(elementTag: string, host: HTMLDivElement): void {
		// T-C07 (R6) teardown analysis: `replaceChildren()` is now purely DEFENSIVE.
		// Because the mount runs from the `mountMod` action attached to the `ready`
		// branch's container, and Svelte's `{#if}` control flow destroys+recreates a
		// FRESH container node on every view-entry (each entry passes through
		// `state = 'loading'` first — see `enterMod`), the host handed here is always
		// an empty, brand-new node. The previous mod's element is torn down by that
		// `{#if}` destroy (native DOM removal → `disconnectedCallback`), not by this
		// clear. The clear only guards the pathological case of the same node being
		// re-mounted into, so two elements never stack.
		host.replaceChildren();

		// The host instantiates the mod's OWN custom element by tag. That tag was
		// registered by the mod bundle's top-level `customElements.define()` when the
		// loader `import()`ed it (R3 AC5) — the host NEVER calls `define()` itself and
		// never reaches into the mod's internal Svelte component tree; it only ever
		// touches this one DOM element (the choice that sidesteps sveltejs/svelte#13186).
		const el = document.createElement(elementTag);

		// Hand auth/context as INSTANCE PROPERTIES, never HTML attributes (R3 AC1/AC2):
		// attributes are string-only and would serialise the token into the DOM. Set
		// them BEFORE insertion so Svelte's compiled custom element preserves them for
		// the inner component's `$props()` once it mounts (R3 AC3). Context is
		// per-instance (R3 AC4): assigned on THIS element, never through a shared
		// `window`-level object — so mounting the same mod twice yields independent
		// state and teardown is unentangled.
		const ctx = el as unknown as ModElementContext;
		ctx.authToken = localStorage.token;
		ctx.apiBase = WEBUI_API_BASE_URL;
		ctx.currentUser = $user;

		// Only now insert it (property values above are already in place).
		host.appendChild(el);
	}

	// The `window` 'error' listener that IS the correct channel for a reported
	// custom-element reaction exception (see `mountCrashError` above). Registered
	// synchronously before `mountModElement` runs (in `mountMod` below) so it is in
	// place before `appendChild` can fire `connectedCallback`. `preventDefault()`
	// suppresses the browser's/runtime's own default "uncaught" reporting for it,
	// since it is now genuinely handled here instead.
	function handleReportedMountError(event: ErrorEvent): void {
		event.preventDefault();
		mountCrashError = event.error ?? new Error(event.message);
		console.error(
			`[mods] mod "${modId}" (tag: ${tag ?? 'unknown'}) threw from a custom-element reaction (e.g. connectedCallback) — reported globally per the Custom Elements spec, not synchronously catchable by <svelte:boundary>. Contained here instead.`,
			mountCrashError
		);
	}

	// R4 (T-C05) mount seam: invoke the R3 mount from WITHIN the `<svelte:boundary>`.
	// Placing the mount in a `use:` action means `createElement` + property assignment
	// + `appendChild` all run inside the boundary's effect scope — Svelte runs actions
	// as effects, and the boundary catches errors thrown while running effects. That
	// covers errors thrown by THIS action's own synchronous code. It does NOT cover a
	// throw from the mod element's `connectedCallback` itself: per the Custom Elements
	// spec, a reaction's exception is REPORTED to the global scope, not propagated back
	// through `appendChild` — it never enters the boundary's effect stack at all
	// (confirmed by a real CI failure). `handleReportedMountError` is the real
	// containment for that class; the boundary's `failed` snippet remains the
	// containment for whatever it CAN still see (documented on the boundary block
	// below, alongside the still-unsolved residual risks: async mod effects, runaway
	// loops, event-handler/`setTimeout` throws).
	function mountMod(node: HTMLDivElement, elementTag: string) {
		window.addEventListener('error', handleReportedMountError);
		mountModElement(elementTag, node);
		return {
			update(nextTag: string) {
				// A tag change on the SAME node would only happen if the `ready` branch
				// were reused with a different mod WITHOUT passing through `loading` —
				// which `enterMod` never does (every view-entry resets to `loading`
				// first, destroying this node). Re-mount defensively if it ever does.
				if (nextTag !== elementTag) {
					elementTag = nextTag;
					mountModElement(elementTag, node);
				}
			},
			// The ONLY teardown here is the error listener's own scope — NOT a bespoke
			// DOM/component teardown (R6/T-C07 still holds: real DOM removal on
			// navigation away fires the mod element's `disconnectedCallback` and Svelte
			// destroys the inner component next tick, unassisted). Removing the listener
			// here keeps it scoped to exactly this mod instance's mount lifetime, so it
			// never observes a later, unrelated mod's globally-reported errors.
			//
			// BOUNDARY OF WHAT THIS COVERS (R6 AC3): destroying the inner Svelte
			// component runs the mod's own `onDestroy`. NON-Svelte side effects a mod
			// opens itself — raw WebSocket connections, `setInterval`/`setTimeout`
			// timers, a `ResizeObserver`, etc. — are the MOD AUTHOR's responsibility to
			// tear down in that `onDestroy`. This host mechanism neither enforces nor
			// automates that cleanup; it only guarantees the element is removed and the
			// inner component destroyed. Stated so the contract is honest about its edge.
			destroy() {
				window.removeEventListener('error', handleReportedMountError);
			}
		};
	}

	// R4 (T-C05): the boundary's `onerror` hook. Attribute a POST-mount crash to the
	// SPECIFIC mod that was mounting, so a future observability hook could report
	// "which mod misbehaved". No telemetry infrastructure is introduced here — the
	// point is simply to NOT silently swallow the error, leaving a trace for
	// operators. This must NOT call the boundary's `reset` synchronously (Svelte
	// requires the boundary to settle first); recovery is the user-driven `reset()`
	// in the `failed` snippet.
	function reportModCrash(error: unknown): void {
		console.error(
			`[mods] mod "${modId}" (tag: ${tag ?? 'unknown'}) threw AFTER mounting; contained by <svelte:boundary> (R4). Load-time failures are the try/catch's job (R5) — this is the boundary's.`,
			error
		);
	}

	async function enterMod(id: string | undefined): Promise<void> {
		if (!id) {
			return;
		}
		const token = ++loadToken;
		// Every view-entry resets to `loading` FIRST, synchronously, before any
		// `await`. This is load-bearing for teardown (R6 AC4): on an A → B navigation
		// it tears the `ready` branch (and mod A's element) down through the `{#if}`
		// destroy path immediately, so the new mount is a genuine fresh mount, NOT a
		// same-tick detach+reattach (which Svelte would deliberately optimise into no
		// teardown). See the teardown note in `mountMod`.
		state = 'loading';
		tag = null;
		failureKind = null;
		mountCrashError = null;

		let result;
		try {
			// LOAD-TIME containment (R5, and R4 AC5): this try/catch is ONLY for
			// load-time failures — the manifest fetch or the dynamic `import()`
			// rejecting. It deliberately does NOT wrap the mount; POST-mount thrown
			// errors are the `<svelte:boundary>`'s job (R4). Neither does the other's
			// work.
			result = await loadModBundleDeduped(id, { token: localStorage.token });
		} catch {
			// A NETWORK-LEVEL failure: the manifest fetch or the dynamic `import()`
			// rejected WITHOUT any HTTP response reaching us (e.g. `TypeError: Failed
			// to fetch`). This is the honest blocked-vs-unreachable boundary: with no
			// response at all we CANNOT reliably tell an ad-blocker
			// (`ERR_BLOCKED_BY_CLIENT`) from a genuine outage — the browser does not
			// surface that error code to JS consistently across browsers (research
			// brief §Pitfalls). So we label it `unreachable`, which explicitly means
			// "blocked OR down". The one thing we CAN assert is the contrast in the
			// `error` branch below: a received HTTP error status means a server WAS
			// reached, so that case is definitely NOT client-blocked. That real
			// distinction — response received vs no response — is our signal, not any
			// attempt to sniff error-message strings.
			if (token === loadToken) {
				failureKind = 'unreachable';
				state = 'unavailable';
			}
			return;
		}

		// A newer view-entry superseded this one — drop the stale result.
		if (token !== loadToken) {
			return;
		}

		if (result.status === 'ok' && result.tag) {
			// The actual mount now happens in the `ready` branch via the `mountMod`
			// action (R4/T-C05) — running INSIDE `<svelte:boundary>`, so a synchronous
			// mount-time throw from the mod is contained by the boundary rather than
			// left as an unhandled rejection here. Just publish `tag` + `state`; the
			// action does the DOM work once the branch renders.
			tag = result.tag;
			state = 'ready';
			return;
		}

		// Every non-mountable outcome resolves to the SAME "mod unavailable" fallback
		// (R5), tagged with a reason so an operator can tell them apart — WITHOUT
		// breaking the shell and WITHOUT a hard reload.
		if (result.status === 'not_found') {
			// 404: a stale reference after a mod update/removal, or a disabled mod —
			// the dominant real failure (research brief §Pitfalls).
			failureKind = 'not_found';
		} else if (result.status === 'no_bundle' || result.status === 'ok') {
			// A frontend mod that ships no built bundle yet (or `ok` with no resolvable
			// tag) — a named "not built yet" condition, not an error/outage.
			failureKind = 'no_bundle';
		} else {
			// result.status === 'error': a real HTTP error response WAS received, so
			// the request reached a server — this is NOT client-blocked (contrast the
			// network-level throw above). A server-side / transient error.
			failureKind = 'server_error';
		}
		state = 'unavailable';
	}

	// The fallback copy, keyed on the (honestly limited) failure distinction.
	function failureHeading(kind: FailureKind | null): string {
		return kind === 'no_bundle' ? 'Mod not ready' : 'Mod unavailable';
	}

	function failureDetail(kind: FailureKind | null): string {
		switch (kind) {
			case 'not_found':
				return "This mod's view could not be found. It may have been updated or removed.";
			case 'no_bundle':
				return "This mod hasn't published a view yet.";
			case 'server_error':
				// Reached a server (a real HTTP error came back) → NOT an ad-blocker.
				return 'The server returned an error loading this mod. The request reached the server, so this is not a browser extension blocking it — please try again shortly.';
			case 'unreachable':
			default:
				// No response at all → blocked OR down, not distinguishable here.
				return "This mod's view couldn't be loaded. It may be offline, or blocked by a browser extension (such as an ad-blocker).";
		}
	}
</script>

<div
	class="relative flex flex-col w-full h-screen max-h-[100dvh] {$showSidebar
		? 'md:max-w-[calc(100%-260px)]'
		: ''}"
	data-mod-view={modId}
>
	<!-- Every other top-level section (chat, admin, playground, workspace) reserves
	     this width when the sidebar is open and renders its own reopen affordance --
	     this route never had either, so a mod that fills its slot (as crew's own CSS
	     assumes, up to and including a documented-but-never-wired `sidebar-open`
	     class) rendered underneath/behind the sidebar, and collapsing the sidebar
	     from here left no way to reopen it (the toggle lives inside Sidebar.svelte
	     itself, which disappears when collapsed -- every sibling section supplies
	     its own external reopen button for exactly that reason). -->
	<div class="px-2.5 pt-1 backdrop-blur-xl">
		<div class="flex items-center gap-1">
			<div class="{$showSidebar ? 'md:hidden' : ''} self-center flex flex-none items-center">
				<button
					id="sidebar-toggle-button"
					class="cursor-pointer p-1.5 flex rounded-xl hover:bg-gray-100 dark:hover:bg-gray-850 transition"
					on:click={() => {
						showSidebar.set(!$showSidebar);
					}}
					aria-label="Toggle Sidebar"
				>
					<div class="m-auto self-center">
						<MenuLines />
					</div>
				</button>
			</div>

			<!-- Same "New Chat" affordance the regular chat header shows once the
			     sidebar collapses -- lets you jump back to a fresh chat from a mod
			     view without reopening the sidebar first. -->
			<Tooltip content={$i18n.t('New Chat')}>
				<button
					class="{$showSidebar
						? 'md:hidden'
						: ''} flex cursor-pointer px-2 py-2 rounded-xl text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-850 transition"
					on:click={() => goto(resolve('/(app)'))}
					aria-label="New Chat"
				>
					<div class="m-auto self-center">
						<PencilSquare className=" size-5" strokeWidth="2" />
					</div>
				</button>
			</Tooltip>

			<div class="flex-1"></div>

			{#if $user !== undefined}
				<UserMenu className="max-w-[200px]" role={$user.role}>
					<button
						class="select-none flex rounded-xl p-1.5 hover:bg-gray-100 dark:hover:bg-gray-850 transition"
						aria-label="User Menu"
					>
						<div class="self-center">
							<img
								src={$user.profile_image_url}
								class="size-6 object-cover rounded-full"
								alt="User profile"
								draggable="false"
							/>
						</div>
					</button>
				</UserMenu>
			{/if}
		</div>
	</div>

	<div class="w-full flex-1 min-h-0 flex flex-col">
	{#if state === 'loading'}
		<div class="m-auto text-gray-500 dark:text-gray-400 text-sm" data-mod-state="loading">
			Loading…
		</div>
	{:else if state === 'unavailable'}
		<!-- R5: the "mod unavailable" fallback for LOAD-time failure. Contained to this
		     mod's view slot — it does not break the shell, Sidebar, or any other mod's
		     nav entry, and its recovery is a soft in-SPA retry (re-running the loader),
		     NEVER a full-page reload. `data-mod-failure` exposes the (honestly limited)
		     blocked-vs-unreachable distinction for operators/tests. This is distinct
		     from the POST-mount crash state rendered by the boundary's `failed` snippet
		     below: this branch is a pre-mount LOAD failure (the try/catch's job, R4 AC5),
		     that one is a post-mount thrown error (the boundary's job). -->
		<div
			class="m-auto flex max-w-sm flex-col items-center gap-2 px-4 text-center"
			data-mod-state="unavailable"
			data-mod-failure={failureKind}
		>
			<div class="text-gray-700 dark:text-gray-200 text-sm font-medium">
				{failureHeading(failureKind)}
			</div>
			<div class="text-gray-500 dark:text-gray-400 text-xs">
				{failureDetail(failureKind)}
			</div>
			<button
				class="mt-1 rounded-lg bg-gray-100 px-3 py-1 text-xs text-gray-700 transition hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
				data-mod-retry
				on:click={() => void enterMod(modId)}
			>
				Try again
			</button>
		</div>
	{:else if mountCrashError}
		<!-- Real containment for a `connectedCallback`-time (or other reported custom
		     element reaction) throw: caught by `handleReportedMountError`, the `window`
		     'error' listener, NOT by the boundary below (see `mountCrashError` and
		     `mountMod` for why). Renders the SAME contained UI as the boundary's own
		     `failed` snippet, via the shared `crashed` snippet, so the two catch paths
		     are indistinguishable to the user. Recovery re-runs `enterMod` — the same
		     full view-entry reset the "Try again" button uses — rather than a bespoke
		     reset, since this crash happened outside the boundary's own reset mechanism. -->
		{@render crashed(mountCrashError, () => void enterMod(modId))}
	{:else}
		<!-- R4 (T-C05): the mount point is wrapped in Svelte 5's native
		     `<svelte:boundary>`. This is ONE OF the containment mechanisms for errors
		     thrown by the mod AFTER load. The `try/catch` around `loadModBundleDeduped`
		     (R5, in `enterMod`) catches ONLY load-time failures (the fetch/import) — it
		     can never catch errors thrown later by the mounted element's own code, which
		     run outside that catch's stack frame (R4 AC5). Load-time = try/catch;
		     post-mount thrown = boundary and/or the `window` 'error' listener above;
		     neither does the try/catch's work.

		     WHAT THE BOUNDARY CONTAINS: errors thrown during rendering and while
		     running effects within it (Svelte's documented boundary scope) — i.e. errors
		     from THIS HOST's own action/effect code. It does NOT contain a throw from
		     the mod element's `connectedCallback` itself: per the Custom Elements spec,
		     a reaction's exception is REPORTED to the global scope, not synchronously
		     propagated back through `appendChild` — it never enters the boundary's
		     effect stack at all (confirmed by a real CI failure against this exact
		     case). That class is contained by `handleReportedMountError` instead (the
		     `{:else if mountCrashError}` branch above), which is why it renders in the
		     SAME mod view slot (R4 AC3) leaving the app shell, Sidebar, and every other
		     mod's nav entry untouched (R4 AC2), just via a different catch path.

		     NAMED RESIDUAL RISKS (R4 AC4 — documented, deliberately NOT solved here):
		       1. A genuinely RUNAWAY mod — an infinite loop, not a thrown error — has
		          NO in-browser containment short of a Worker or iframe. This is an
		          accepted residual risk of the same-origin, same-privilege,
		          operator-trusted mod trust model this project already chose, not a bug
		          this task fixes.
		       2. The mod is a SEPARATE-bundle Svelte custom element carrying its OWN
		          Svelte runtime/scheduler (shadow DOM). Its ASYNC reactive-effect errors
		          run under the mod's own scheduler, and event-handler / `setTimeout`
		          throws run outside any rendering-or-effect frame AND outside a
		          reported custom-element reaction — neither the boundary nor the
		          `window` 'error' listener catch those in general. Contained here is the
		          synchronous mount/render/reaction class; the async class is the mod
		          author's own responsibility, consistent with the trust model above. -->
		<svelte:boundary onerror={(error) => reportModCrash(error)}>
			<!-- R3/R4 mount point. `mountMod` (the action) instantiates the mod's custom
			     element, assigns auth/context by property BEFORE insertion, and appends
			     it here — all inside this boundary. `tag` is surfaced on the container
			     for observability/tests. -->
			<div
				class="w-full h-full flex flex-col"
				data-mod-state="ready"
				data-mod-tag={tag}
				use:mountMod={tag ?? ''}
			></div>

			{#snippet failed(error, reset)}
				<!-- R4 AC3: a caught POST-mount runtime error renders a CONTAINED failed
				     state within the mod's own view slot, via the shared `crashed` snippet.
				     Recovery is the boundary's own `reset` (a soft, in-SPA re-render),
				     NEVER a full-page reload; `reset` is invoked only from a user click,
				     never synchronously inside `onerror` (Svelte requires the boundary to
				     settle first). -->
				{@render crashed(error, reset)}
			{/snippet}
		</svelte:boundary>
	{/if}
	</div>
</div>

{#snippet crashed(error: unknown, onReset: () => void)}
	<!-- Shared contained-failure UI for BOTH catch paths (boundary `failed` and the
	     `window` 'error' listener's `mountCrashError`) — mirrors R5's "mod unavailable"
	     styling for visual consistency, but is a DISTINCT branch/state from it: the
	     trigger is always a POST-mount error, never a pre-mount load failure. -->
	<div
		class="m-auto flex max-w-sm flex-col items-center gap-2 px-4 text-center"
		data-mod-state="crashed"
		data-mod-failure="runtime_error"
		data-mod-error={String(error)}
	>
		<div class="text-gray-700 dark:text-gray-200 text-sm font-medium">Mod stopped responding</div>
		<div class="text-gray-500 dark:text-gray-400 text-xs">
			This mod hit an error after loading and was contained so the rest of the app keeps working.
		</div>
		<button
			class="mt-1 rounded-lg bg-gray-100 px-3 py-1 text-xs text-gray-700 transition hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
			data-mod-reset
			on:click={() => onReset()}
		>
			Reload this mod
		</button>
	</div>
{/snippet}
