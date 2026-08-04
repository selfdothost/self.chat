<script lang="ts">
    // Admin > Settings > Database — about the database (self.ai#94).
    //
    // This page used to hold three export/backup controls and say nothing about
    // the database. Those moved to Settings > Backup (self.ai#93). One of them,
    // "Download Database", 400s on anything but SQLite, so it had never once
    // worked against this deployment's Postgres — it is kept here, where it
    // belongs, and only shown when the dialect can actually serve it.
    //
    // Read-only by design: with ENABLE_PERSISTENT_CONFIG=False, an editable
    // field with no matching manifest env line silently reverts on the next pod
    // restart.
    import type { i18n as i18nType } from 'i18next';
    import type { Writable } from 'svelte/store';
    import { getContext, onMount } from 'svelte';
    import { toast } from 'svelte-sonner';

    import { getDatabaseInfo, type DatabaseInfo } from '$lib/apis/db';
    import { downloadDatabase } from '$lib/apis/utils';
    import Spinner from '$lib/components/common/Spinner.svelte';
    import Tooltip from '$lib/components/common/Tooltip.svelte';

    const i18n: Writable<i18nType> = getContext('i18n');

    let info: DatabaseInfo | null = $state(null);
    let loading = $state(true);
    let loadError: string | null = $state(null);

    const load = async () => {
        loading = true;
        loadError = null;
        try {
            info = await getDatabaseInfo(localStorage.token);
        } catch (error) {
            loadError = `${error}`;
        } finally {
            loading = false;
        }
    };

    onMount(load);

    const formatBytes = (bytes: number | null) => {
        if (bytes === null || bytes === undefined) return '—';
        const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
        let value = bytes;
        let unit = 0;
        while (value >= 1024 && unit < units.length - 1) {
            value /= 1024;
            unit += 1;
        }
        return `${unit === 0 ? value : value.toFixed(1)} ${units[unit]}`;
    };

    // host:port/database, skipping whichever parts a dialect does not have —
    // SQLite has only a file path.
    const endpoint = $derived.by(() => {
        if (!info) return '—';
        const { host, port, database } = info.connection;
        if (!host) return database ?? '—';
        return `${host}${port ? `:${port}` : ''}${database ? `/${database}` : ''}`;
    });
</script>

<div class="flex flex-col h-full justify-between text-sm">
    <div class="space-y-3 overflow-y-scroll scrollbar-hidden h-full">
        <div class="flex items-center justify-between mb-2">
            <div class="text-sm font-medium">{$i18n.t('Database')}</div>

            <button
                type="button"
                class="text-xs px-2.5 py-1 rounded-lg bg-gray-50 hover:bg-gray-100 dark:bg-gray-850 dark:hover:bg-gray-800 transition disabled:opacity-50"
                disabled={loading}
                onclick={load}
            >
                {$i18n.t('Refresh')}
            </button>
        </div>

        {#if loading && !info}
            <div class="flex justify-center py-6"><Spinner /></div>
        {:else if loadError}
            <div class="text-xs text-red-500 dark:text-red-400 py-2">
                {$i18n.t('Could not read database status')}: {loadError}
            </div>
        {:else if info}
            <!-- Connection -->
            <div>
                <div class="mb-1 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    {$i18n.t('Connection')}
                </div>

                <div class="flex flex-col gap-1">
                    <div class="flex justify-between items-center">
                        <div class="text-xs">{$i18n.t('Engine')}</div>
                        <div class="text-xs text-gray-500 dark:text-gray-400 font-mono">
                            {info.connection.dialect}{info.connection.server_version
                                ? ` ${info.connection.server_version}`
                                : ''}
                        </div>
                    </div>

                    <div class="flex justify-between items-center">
                        <div class="text-xs">{$i18n.t('Driver')}</div>
                        <div class="text-xs text-gray-500 dark:text-gray-400 font-mono">
                            {info.connection.driver}
                        </div>
                    </div>

                    <div class="flex justify-between items-center">
                        <div class="text-xs">{$i18n.t('Endpoint')}</div>
                        <div
                            class="text-xs text-gray-500 dark:text-gray-400 font-mono truncate max-w-[60%]"
                        >
                            {endpoint}
                        </div>
                    </div>

                    {#if info.connection.username}
                        <div class="flex justify-between items-center">
                            <div class="text-xs">{$i18n.t('User')}</div>
                            <div class="text-xs text-gray-500 dark:text-gray-400 font-mono">
                                {info.connection.username}
                            </div>
                        </div>
                    {/if}

                    <div class="flex justify-between items-center">
                        <div class="text-xs">{$i18n.t('Status')}</div>
                        {#if info.connection.reachable}
                            <div class="text-xs text-green-600 dark:text-green-400">
                                {$i18n.t('Connected')}
                                {#if info.connection.latency_ms !== null}
                                    <span class="text-gray-500 dark:text-gray-400">
                                        · {info.connection.latency_ms} ms
                                    </span>
                                {/if}
                            </div>
                        {:else}
                            <div class="text-xs text-red-500 dark:text-red-400">
                                {info.connection.error ?? $i18n.t('Unreachable')}
                            </div>
                        {/if}
                    </div>
                </div>
            </div>

            <hr class="border-gray-100 dark:border-gray-850" />

            <!-- Schema -->
            <div>
                <div class="mb-1 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    {$i18n.t('Schema')}
                </div>

                {#if info.schema.error}
                    <div class="text-xs text-red-500 dark:text-red-400">{info.schema.error}</div>
                {:else}
                    <div class="flex flex-col gap-1">
                        <div class="flex justify-between items-center">
                            <Tooltip
                                content={$i18n.t(
                                    'The Alembic revision this database is stamped with, read back out of the database.'
                                )}
                                placement="top-start"
                            >
                                <div class="text-xs">{$i18n.t('Revision')}</div>
                            </Tooltip>
                            <div class="text-xs text-gray-500 dark:text-gray-400 font-mono">
                                {info.schema.current ?? '—'}
                            </div>
                        </div>

                        <div class="flex justify-between items-center">
                            <div class="text-xs">{$i18n.t('Head')}</div>
                            <div class="text-xs text-gray-500 dark:text-gray-400 font-mono">
                                {info.schema.heads.join(', ') || '—'}
                            </div>
                        </div>

                        <!--
							Boot migrations are strict (self.ai#82): not-at-head is the
							difference between a serving pod and a CrashLoop, so it is
							called out rather than left to be inferred from two hashes.
						-->
                        {#if info.schema.at_head}
                            <div class="text-xs text-green-600 dark:text-green-400">
                                {$i18n.t('Schema is at head.')}
                            </div>
                        {:else}
                            <div class="text-xs text-red-500 dark:text-red-400">
                                {$i18n.t(
                                    'Schema is NOT at head. Migrations are strict at boot — this pod will not start after its next restart until the schema is migrated.'
                                )}
                            </div>
                        {/if}

                        {#if info.schema.branched}
                            <div class="text-xs text-red-500 dark:text-red-400">
                                {$i18n.t(
                                    'The migration chain has more than one head. The next deploy will fail to boot until the chain is merged.'
                                )}
                            </div>
                        {/if}
                    </div>
                {/if}
            </div>

            <hr class="border-gray-100 dark:border-gray-850" />

            <!-- Pool -->
            <div>
                <div class="mb-1 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    {$i18n.t('Connection pool')}
                </div>

                <div class="flex flex-col gap-1">
                    <div class="flex justify-between items-center">
                        <div class="text-xs">{$i18n.t('Pool')}</div>
                        <div class="text-xs text-gray-500 dark:text-gray-400 font-mono">
                            {info.pool.class}
                        </div>
                    </div>

                    {#if info.pool.checked_out !== null}
                        <div class="flex justify-between items-center">
                            <div class="text-xs">{$i18n.t('Connections in use')}</div>
                            <div class="text-xs text-gray-500 dark:text-gray-400 font-mono">
                                {info.pool.checked_out}{info.pool.size !== null
                                    ? ` / ${info.pool.size}`
                                    : ''}
                                {#if info.pool.overflow !== null && info.pool.overflow > 0}
                                    <span>(+{info.pool.overflow} {$i18n.t('overflow')})</span>
                                {/if}
                            </div>
                        </div>
                    {/if}

                    <div class="flex flex-col gap-0.5 mt-1">
                        {#each Object.entries(info.pool.configured) as [name, value] (name)}
                            <div class="flex justify-between items-center">
                                <div
                                    class="text-xs font-mono {info.pool.settings_applied
                                        ? ''
                                        : 'text-gray-400 dark:text-gray-600 line-through'}"
                                >
                                    {name}
                                </div>
                                <div class="text-xs text-gray-500 dark:text-gray-400 font-mono">
                                    {value}
                                </div>
                            </div>
                        {/each}
                    </div>

                    <!--
						These four env vars only do anything when internal/db.py builds a
						QueuePool, which needs a non-SQLite URL and DATABASE_POOL_SIZE > 0
						(it defaults to 0). Showing them without saying so would present
						four numbers that have no effect as though they were live.
					-->
                    {#if !info.pool.settings_applied}
                        <div class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                            {$i18n.t(
                                'These settings are not in effect. Pooling is only configured for a non-SQLite database with DATABASE_POOL_SIZE greater than 0.'
                            )}
                        </div>
                    {/if}
                </div>
            </div>

            <hr class="border-gray-100 dark:border-gray-850" />

            <!-- Storage -->
            <div>
                <div class="mb-1 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    {$i18n.t('Storage')}
                </div>

                <div class="flex flex-col gap-1">
                    <div class="flex justify-between items-center">
                        <div class="text-xs">{$i18n.t('Tables')}</div>
                        <div class="text-xs text-gray-500 dark:text-gray-400 font-mono">
                            {info.storage.table_count ?? '—'}
                        </div>
                    </div>

                    <div class="flex justify-between items-center">
                        <div class="text-xs">{$i18n.t('Size')}</div>
                        <div class="text-xs text-gray-500 dark:text-gray-400 font-mono">
                            {formatBytes(info.storage.size_bytes)}
                        </div>
                    </div>

                    {#if info.storage.error}
                        <div class="text-xs text-red-500 dark:text-red-400">
                            {info.storage.error}
                        </div>
                    {/if}
                </div>
            </div>

            <!--
				SQLite-only. The endpoint (GET /utils/db/download) 400s
				DB_NOT_SQLITE on anything else, which is exactly why this button
				never worked where it used to live.
			-->
            {#if info.connection.dialect === 'sqlite'}
                <hr class="border-gray-100 dark:border-gray-850" />

                <div>
                    <button
                        type="button"
                        class="flex rounded-md py-1.5 px-3 w-full hover:bg-gray-100 dark:hover:bg-gray-850 transition"
                        onclick={() => {
                            downloadDatabase(localStorage.token).catch((error) => {
                                toast.error(`${error}`);
                            });
                        }}
                    >
                        <div class="self-center mr-3">
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                viewBox="0 0 16 16"
                                fill="currentColor"
                                class="w-4 h-4"
                            >
                                <path
                                    d="M2 3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3Z"
                                />
                                <path
                                    fill-rule="evenodd"
                                    d="M13 6H3v6a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V6ZM8.75 7.75a.75.75 0 0 0-1.5 0v2.69L6.03 9.22a.75.75 0 0 0-1.06 1.06l2.5 2.5a.75.75 0 0 0 1.06 0l2.5-2.5a.75.75 0 1 0-1.06-1.06l-1.22 1.22V7.75Z"
                                    clip-rule="evenodd"
                                />
                            </svg>
                        </div>
                        <div class="self-center text-sm font-medium">
                            {$i18n.t('Download Database')}
                        </div>
                    </button>

                    <div class="text-xs text-gray-500 dark:text-gray-400 px-3">
                        {$i18n.t(
                            'Copies the SQLite file as-is. For a portable, scoped archive use Settings > Backup.'
                        )}
                    </div>
                </div>
            {/if}

            <!--
				Reported whatever the live dialect is: the number that matters is the
				one in *this image*, since it decides whether a SQLite-backed demo or
				CI build can replay the migration chain.
			-->
            <hr class="border-gray-100 dark:border-gray-850" />

            <div class="flex justify-between items-center">
                <div class="text-xs text-gray-500 dark:text-gray-400">
                    {$i18n.t('SQLite runtime')}
                </div>
                <div
                    class="text-xs font-mono {info.sqlite.meets_minimum
                        ? 'text-gray-500 dark:text-gray-400'
                        : 'text-red-500 dark:text-red-400'}"
                >
                    {info.sqlite.runtime_version}
                    <span class="text-gray-400 dark:text-gray-600">
                        (min {info.sqlite.minimum_supported})
                    </span>
                </div>
            </div>
        {/if}
    </div>
</div>
