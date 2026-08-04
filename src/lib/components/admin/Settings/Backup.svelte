<script lang="ts">
    // Admin > Settings > Backup (self.ai#93).
    //
    // The API shipped without a UI, so this is the first surface for it. It also
    // takes the three controls that used to sit on the Database page, none of
    // which was a backup: config import/export, and a whole-chat dump that does
    // not round trip.
    //
    // Restore is replace-only and destructive: it refuses unless the target
    // scopes are empty. Nothing runs until the preview has been seen, and the
    // server re-checks the same conditions on submit rather than trusting that
    // the preview was green when it was rendered.
    import type { i18n as i18nType } from 'i18next';
    import type { Writable } from 'svelte/store';
    import { getContext, onDestroy, onMount } from 'svelte';
    import { toast } from 'svelte-sonner';
    import fileSaver from 'file-saver';
    const { saveAs } = fileSaver;

    import {
        createBackupJob,
        createRestoreJob,
        deleteBackupJob,
        downloadBackupArchive,
        getBackupScopes,
        listBackupJobs,
        previewRestore,
        uploadRestoreArchive,
        type BackupJob,
        type BackupScope,
        type RestorePreview
    } from '$lib/apis/backups';
    import { getAllUserChats } from '$lib/apis/chats';
    import { exportConfig, importConfig } from '$lib/apis/configs';
    import ConfirmDialog from '$lib/components/common/ConfirmDialog.svelte';
    import Spinner from '$lib/components/common/Spinner.svelte';

    const i18n: Writable<i18nType> = getContext('i18n');

    let scopes: BackupScope[] = $state([]);
    let selected: Record<string, boolean> = $state({});
    let jobs: BackupJob[] = $state([]);

    let loading = $state(true);
    let creating = $state(false);

    let uploading = $state(false);
    let uploadedPath: string | null = $state(null);
    let preview: RestorePreview | null = $state(null);
    let restoring = $state(false);
    let showRestoreConfirm = $state(false);

    let pollHandle: ReturnType<typeof setInterval> | null = null;

    const chosenScopes = $derived(Object.keys(selected).filter((name) => selected[name]));
    const active = $derived(
        jobs.some((job) => job.status === 'pending' || job.status === 'running')
    );

    const refreshJobs = async () => {
        try {
            jobs = await listBackupJobs(localStorage.token);
        } catch (error) {
            toast.error(`${error}`);
        }
    };

    onMount(async () => {
        try {
            const res = await getBackupScopes(localStorage.token);
            scopes = res.scopes;
            // Everything on by default: a partial archive is a deliberate choice,
            // not something to arrive at by forgetting to tick a box.
            selected = Object.fromEntries(scopes.map((scope) => [scope.name, true]));
        } catch (error) {
            toast.error(`${error}`);
        }

        await refreshJobs();
        loading = false;

        // Jobs run in the background, so the list is polled rather than pushed.
        // Kept out of an $effect deliberately: this writes `jobs`, which the
        // active-state it would read is derived from, and that shape of effect
        // self-triggers.
        pollHandle = setInterval(() => {
            if (active) refreshJobs();
        }, 3000);
    });

    onDestroy(() => {
        if (pollHandle) clearInterval(pollHandle);
    });

    const startBackup = async () => {
        if (chosenScopes.length === 0) {
            toast.error($i18n.t('Select at least one scope to back up.'));
            return;
        }

        creating = true;
        try {
            await createBackupJob(localStorage.token, chosenScopes);
            toast.success($i18n.t('Backup started'));
            await refreshJobs();
        } catch (error) {
            toast.error(`${error}`);
        } finally {
            creating = false;
        }
    };

    const removeJob = async (job: BackupJob) => {
        try {
            await deleteBackupJob(localStorage.token, job.id);
            await refreshJobs();
        } catch (error) {
            toast.error(`${error}`);
        }
    };

    const download = async (job: BackupJob) => {
        try {
            await downloadBackupArchive(localStorage.token, job);
        } catch (error) {
            toast.error(`${error}`);
        }
    };

    const onArchiveChosen = async (event: Event) => {
        const target = event.target as HTMLInputElement;
        const file = target.files?.[0];
        target.value = '';
        if (!file) return;

        uploading = true;
        preview = null;
        uploadedPath = null;
        try {
            const uploaded = await uploadRestoreArchive(localStorage.token, file);
            uploadedPath = uploaded.archive_path;
            preview = await previewRestore(localStorage.token, uploaded.archive_path);
        } catch (error) {
            toast.error(`${error}`);
        } finally {
            uploading = false;
        }
    };

    // An archive already in the backup store — a completed backup on this
    // instance — can be previewed without re-uploading it.
    const previewExisting = async (job: BackupJob) => {
        if (!job.archive_path) return;
        uploading = true;
        preview = null;
        uploadedPath = job.archive_path;
        try {
            preview = await previewRestore(localStorage.token, job.archive_path);
        } catch (error) {
            toast.error(`${error}`);
        } finally {
            uploading = false;
        }
    };

    const runRestore = async () => {
        if (!uploadedPath) return;
        restoring = true;
        try {
            await createRestoreJob(localStorage.token, uploadedPath);
            toast.success($i18n.t('Restore started'));
            preview = null;
            uploadedPath = null;
            await refreshJobs();
        } catch (error) {
            toast.error(`${error}`);
        } finally {
            restoring = false;
        }
    };

    const exportAllUserChats = async () => {
        const blob = new Blob([JSON.stringify(await getAllUserChats(localStorage.token))], {
            type: 'application/json'
        });
        saveAs(blob, `all-chats-export-${Date.now()}.json`);
    };

    const formatBytes = (bytes: number | null) => {
        if (bytes === null || bytes === undefined) return '—';
        const units = ['B', 'KiB', 'MiB', 'GiB'];
        let value = bytes;
        let unit = 0;
        while (value >= 1024 && unit < units.length - 1) {
            value /= 1024;
            unit += 1;
        }
        return `${unit === 0 ? value : value.toFixed(1)} ${units[unit]}`;
    };

    const formatTime = (seconds: number) =>
        seconds ? new Date(seconds * 1000).toLocaleString() : '—';

    const statusColour = (status: string) => {
        if (status === 'completed') return 'text-green-600 dark:text-green-400';
        if (status === 'failed') return 'text-red-500 dark:text-red-400';
        if (status === 'running' || status === 'pending') return 'text-blue-500 dark:text-blue-400';
        return 'text-gray-500 dark:text-gray-400';
    };
</script>

<ConfirmDialog
    bind:show={showRestoreConfirm}
    title={$i18n.t('Restore from archive?')}
    message={$i18n.t(
        'This writes the archive into this instance. It only proceeds while the target scopes are empty, and it cannot be undone.'
    )}
    confirmLabel={$i18n.t('Restore')}
    onConfirm={runRestore}
/>

<div class="flex flex-col h-full justify-between text-sm">
    <div class="space-y-3 overflow-y-scroll scrollbar-hidden h-full">
        {#if loading}
            <div class="flex justify-center py-6"><Spinner /></div>
        {:else}
            <!-- Create -->
            <div>
                <div class="mb-1 text-sm font-medium">{$i18n.t('Backup')}</div>
                <div class="text-xs text-gray-500 dark:text-gray-400 mb-2">
                    {$i18n.t(
                        'Archives are written to self.corpus and stamped with the schema revision they were taken at.'
                    )}
                </div>

                <div class="flex flex-col gap-1 mb-2">
                    {#each scopes as scope (scope.name)}
                        <label class="flex items-start gap-2 py-0.5 cursor-pointer">
                            <input
                                type="checkbox"
                                class="mt-0.5"
                                bind:checked={selected[scope.name]}
                            />
                            <div>
                                <div class="text-xs font-medium">
                                    {scope.name}
                                    {#if scope.carries_files}
                                        <span class="text-gray-400 dark:text-gray-600">
                                            · {$i18n.t('includes uploaded files')}
                                        </span>
                                    {/if}
                                </div>
                                <div class="text-xs text-gray-500 dark:text-gray-400">
                                    {scope.description}
                                </div>
                            </div>
                        </label>
                    {/each}
                </div>

                <button
                    type="button"
                    class="text-xs px-3 py-1.5 rounded-lg bg-gray-50 hover:bg-gray-100 dark:bg-gray-850 dark:hover:bg-gray-800 transition disabled:opacity-50"
                    disabled={creating || chosenScopes.length === 0}
                    onclick={startBackup}
                >
                    {creating ? $i18n.t('Starting...') : $i18n.t('Start backup')}
                </button>
            </div>

            <hr class="border-gray-100 dark:border-gray-850" />

            <!-- Jobs -->
            <div>
                <div class="mb-1 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    {$i18n.t('History')}
                </div>

                {#if jobs.length === 0}
                    <div class="text-xs text-gray-500 dark:text-gray-400 py-1">
                        {$i18n.t('No backups yet.')}
                    </div>
                {:else}
                    <div class="flex flex-col gap-1">
                        {#each jobs as job (job.id)}
                            <div
                                class="flex justify-between items-start gap-2 py-1.5 border-b border-gray-100 dark:border-gray-850 last:border-0"
                            >
                                <div class="min-w-0">
                                    <div class="text-xs font-medium">
                                        {job.kind === 'restore'
                                            ? $i18n.t('Restore')
                                            : $i18n.t('Backup')}
                                        <span class={statusColour(job.status)}>· {job.status}</span>
                                    </div>
                                    <div class="text-xs text-gray-500 dark:text-gray-400 truncate">
                                        {formatTime(job.created_at)} · {formatBytes(
                                            job.archive_bytes
                                        )}
                                        {#if job.schema_revision}
                                            · <span class="font-mono">{job.schema_revision}</span>
                                        {/if}
                                    </div>
                                    <div class="text-xs text-gray-400 dark:text-gray-600 truncate">
                                        {(job.scopes ?? []).join(', ')}
                                    </div>
                                    {#if job.error_message}
                                        <div class="text-xs text-red-500 dark:text-red-400">
                                            {job.error_message}
                                        </div>
                                    {/if}
                                </div>

                                <div class="flex items-center gap-2 shrink-0">
                                    {#if job.kind === 'backup' && job.status === 'completed'}
                                        <button
                                            type="button"
                                            class="text-xs underline hover:no-underline"
                                            onclick={() => download(job)}
                                        >
                                            {$i18n.t('Download')}
                                        </button>
                                        <button
                                            type="button"
                                            class="text-xs underline hover:no-underline"
                                            onclick={() => previewExisting(job)}
                                        >
                                            {$i18n.t('Restore')}
                                        </button>
                                    {/if}
                                    {#if job.status !== 'running'}
                                        <button
                                            type="button"
                                            class="text-xs text-gray-500 dark:text-gray-400 underline hover:no-underline"
                                            onclick={() => removeJob(job)}
                                        >
                                            {$i18n.t('Remove')}
                                        </button>
                                    {/if}
                                </div>
                            </div>
                        {/each}
                    </div>
                    <!--
						Removing a row forgets the job, not the archive: this feature has
						no fs:DeleteObject grant on self.corpus, and a backup store the
						writer cannot delete from is a feature.
					-->
                    <div class="text-xs text-gray-400 dark:text-gray-600 mt-1">
                        {$i18n.t(
                            'Removing an entry forgets the job. The archive itself is retained.'
                        )}
                    </div>
                {/if}
            </div>

            <hr class="border-gray-100 dark:border-gray-850" />

            <!-- Restore -->
            <div>
                <div class="mb-1 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    {$i18n.t('Restore')}
                </div>
                <div class="text-xs text-gray-500 dark:text-gray-400 mb-2">
                    {$i18n.t(
                        'Restore is replace-only: it refuses unless the scopes it would write into are empty.'
                    )}
                </div>

                <input
                    id="restore-archive-input"
                    hidden
                    type="file"
                    accept=".gz,.tgz,.tar.gz"
                    onchange={onArchiveChosen}
                />

                <button
                    type="button"
                    class="text-xs px-3 py-1.5 rounded-lg bg-gray-50 hover:bg-gray-100 dark:bg-gray-850 dark:hover:bg-gray-800 transition disabled:opacity-50"
                    disabled={uploading}
                    onclick={() => document.getElementById('restore-archive-input')?.click()}
                >
                    {uploading ? $i18n.t('Reading archive...') : $i18n.t('Upload an archive')}
                </button>

                {#if preview}
                    <div
                        class="mt-2 p-2 rounded-lg bg-gray-50 dark:bg-gray-850 flex flex-col gap-1"
                    >
                        <div class="text-xs">
                            {$i18n.t('Taken')}: {preview.manifest.created_at ?? '—'}
                            ·
                            <span class="font-mono">{preview.manifest.schema_revision ?? '—'}</span>
                        </div>
                        <div class="text-xs text-gray-500 dark:text-gray-400">
                            {$i18n.t('Scopes')}: {preview.manifest.scopes.join(', ') || '—'}
                        </div>
                        <div class="text-xs text-gray-500 dark:text-gray-400">
                            {$i18n.t('Files')}: {preview.manifest.files.copied}
                            {$i18n.t('stored')} · {preview.manifest.files.inline}
                            {$i18n.t('inline')}
                            {#if preview.manifest.files.missing > 0}
                                · <span class="text-red-500 dark:text-red-400">
                                    {preview.manifest.files.missing}
                                    {$i18n.t('missing')}
                                </span>
                            {/if}
                        </div>

                        <!--
							The revision plan is the part that decides whether this is
							safe: an older archive is migrated forward through a staging
							schema, a newer or unknown one is refused outright.
						-->
                        <div class="text-xs text-gray-500 dark:text-gray-400">
                            {$i18n.t('Schema plan')}:
                            <span class="font-mono">{preview.compatibility.plan}</span>
                            {#if preview.compatibility.reason}
                                — {preview.compatibility.reason}
                            {/if}
                        </div>

                        {#if preview.can_restore}
                            <div class="text-xs text-green-600 dark:text-green-400">
                                {$i18n.t('Ready to restore.')}
                            </div>
                            <div>
                                <button
                                    type="button"
                                    class="text-xs px-3 py-1.5 mt-1 rounded-lg bg-red-600 hover:bg-red-700 text-white transition disabled:opacity-50"
                                    disabled={restoring}
                                    onclick={() => (showRestoreConfirm = true)}
                                >
                                    {restoring ? $i18n.t('Restoring...') : $i18n.t('Restore')}
                                </button>
                            </div>
                        {:else}
                            <div class="text-xs text-red-500 dark:text-red-400">
                                {$i18n.t('Cannot restore:')}
                                <ul class="list-disc ml-4">
                                    {#each preview.blocked_by as reason (reason)}
                                        <li>{reason}</li>
                                    {/each}
                                </ul>
                            </div>
                        {/if}
                    </div>
                {/if}
            </div>

            <hr class="border-gray-100 dark:border-gray-850" />

            <!-- The old Database-page controls, in the section they belong to. -->
            <div>
                <div class="mb-1 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    {$i18n.t('Other exports')}
                </div>

                <input
                    id="config-json-input"
                    hidden
                    type="file"
                    accept=".json"
                    onchange={(e) => {
                        const target = e.target as HTMLInputElement;
                        const file = target.files?.[0];
                        if (!file) return;

                        const reader = new FileReader();
                        reader.onload = async (loaded) => {
                            try {
                                await importConfig(
                                    localStorage.token,
                                    JSON.parse(loaded.target?.result as string)
                                );
                                toast.success($i18n.t('Config imported successfully'));
                            } catch (error) {
                                toast.error(`${error}`);
                            }
                        };
                        reader.readAsText(file);
                        target.value = '';
                    }}
                />

                <button
                    type="button"
                    class="flex rounded-md py-1.5 px-3 w-full hover:bg-gray-100 dark:hover:bg-gray-850 transition"
                    onclick={() => document.getElementById('config-json-input')?.click()}
                >
                    <div class="self-center text-sm font-medium">
                        {$i18n.t('Import Config from JSON File')}
                    </div>
                </button>

                <button
                    type="button"
                    class="flex rounded-md py-1.5 px-3 w-full hover:bg-gray-100 dark:hover:bg-gray-850 transition"
                    onclick={async () => {
                        try {
                            const exported = await exportConfig(localStorage.token);
                            saveAs(
                                new Blob([JSON.stringify(exported)], { type: 'application/json' }),
                                `config-${Date.now()}.json`
                            );
                        } catch (error) {
                            toast.error(`${error}`);
                        }
                    }}
                >
                    <div class="self-center text-sm font-medium">
                        {$i18n.t('Export Config to JSON File')}
                    </div>
                </button>

                <!--
					Credentials in the config blob are redacted on export (self.ai#95),
					so this file is not a way to move a working config to another
					instance — say so rather than let an admin find out on import.
				-->
                <div class="text-xs text-gray-500 dark:text-gray-400 px-3 mb-2">
                    {$i18n.t('Credentials are redacted from the exported config.')}
                </div>

                <button
                    type="button"
                    class="flex rounded-md py-1.5 px-3 w-full hover:bg-gray-100 dark:hover:bg-gray-850 transition"
                    onclick={exportAllUserChats}
                >
                    <div class="self-center text-sm font-medium">
                        {$i18n.t('Export All Chats (All Users)')}
                    </div>
                </button>

                <!--
					Kept because admins use it, but it is not a backup: it has no
					paging and does not round trip — POST /chats/import takes one chat
					and re-owns it to the importer.
				-->
                <div class="text-xs text-gray-500 dark:text-gray-400 px-3">
                    {$i18n.t(
                        'A flat JSON dump. It does not restore — use a backup archive for that.'
                    )}
                </div>
            </div>
        {/if}
    </div>
</div>
