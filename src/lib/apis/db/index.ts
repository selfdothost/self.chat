import { WEBUI_API_BASE_URL } from '$lib/constants';

const BASE = `${WEBUI_API_BASE_URL}/db`;

export type DatabaseConnection = {
    dialect: string;
    driver: string;
    host: string | null;
    port: number | null;
    database: string | null;
    username: string | null;
    server_version: string | null;
    reachable: boolean;
    latency_ms: number | null;
    error: string | null;
};

export type DatabasePool = {
    class: string;
    pooling: boolean;
    configured: Record<string, number>;
    /**
     * Whether the four DATABASE_POOL_* values above actually built the pool.
     * They are inert unless the Postgres branch of internal/db.py makes a
     * QueuePool, which needs DATABASE_POOL_SIZE > 0 (it defaults to 0).
     */
    settings_applied: boolean;
    size: number | null;
    checked_out: number | null;
    checked_in: number | null;
    overflow: number | null;
    error: string | null;
};

export type DatabaseSchema = {
    current: string | null;
    heads: string[];
    at_head: boolean;
    /** More than one head — the next roll CrashLoops (self.ai#102). */
    branched: boolean;
    error: string | null;
};

export type DatabaseStorage = {
    table_count: number | null;
    size_bytes: number | null;
    error: string | null;
};

export type DatabaseSqlite = {
    runtime_version: string;
    minimum_supported: string;
    meets_minimum: boolean;
};

export type DatabaseInfo = {
    connection: DatabaseConnection;
    pool: DatabasePool;
    schema: DatabaseSchema;
    storage: DatabaseStorage;
    sqlite: DatabaseSqlite;
};

export const getDatabaseInfo = async (token: string): Promise<DatabaseInfo> => {
    const res = await fetch(`${BASE}/info`, {
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
        }
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw err?.detail ?? 'Request failed';
    }
    return res.json();
};
