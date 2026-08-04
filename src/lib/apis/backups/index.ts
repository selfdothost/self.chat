import { WEBUI_BASE_URL } from '$lib/constants';

const BASE = `${WEBUI_BASE_URL}/api/backups`;

export type BackupScope = {
    name: string;
    description: string;
    carries_files: boolean;
};

export type BackupJob = {
    id: string;
    user_id: string;
    /** "backup" | "restore" */
    kind: string;
    /** pending -> running -> completed | failed | cancelled */
    status: string;
    scopes: string[] | null;
    archive_repo: string | null;
    archive_path: string | null;
    archive_commit: string | null;
    archive_bytes: number | null;
    schema_revision: string | null;
    progress: Record<string, unknown> | null;
    error_message: string | null;
    created_at: number;
    updated_at: number;
    user?: { id: string; name: string; email: string } | null;
};

export type RestoreCompatibility = {
    /** "direct" | "migrate_forward" | "refuse" */
    plan: string;
    reason: string | null;
    archive_revision: string | null;
    current_revision: string | null;
};

export type RestorePreview = {
    manifest: {
        format_version: number;
        created_at: string | null;
        created_by: string | null;
        schema_revision: string | null;
        scopes: string[];
        tables: Record<string, number>;
        files: { copied: number; inline: number; missing: number };
    };
    compatibility: RestoreCompatibility;
    unknown_scopes: string[];
    /** Rows already sitting in each target table. Restore is replace-only. */
    target_occupancy: Record<string, number>;
    can_restore: boolean;
    blocked_by: string[];
};

export type UploadedArchive = {
    archive_path: string;
    archive_commit: string;
    schema_revision: string | null;
    scopes: string[];
};

async function backupsFetch<T>(token: string, path: string, options: RequestInit = {}): Promise<T> {
    const res = await fetch(`${BASE}${path}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            ...((options.headers as Record<string, string>) ?? {})
        }
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw err?.detail ?? 'Request failed';
    }
    return res.json();
}

export const getBackupScopes = (token: string) =>
    backupsFetch<{ scopes: BackupScope[] }>(token, '/scopes');

export const getSchemaRevision = (token: string) =>
    backupsFetch<{ current: string | null; heads: string[]; at_head: boolean }>(token, '/schema');

export const listBackupJobs = (token: string) => backupsFetch<BackupJob[]>(token, '/');

export const createBackupJob = (token: string, scopes: string[]) =>
    backupsFetch<BackupJob>(token, '/', {
        method: 'POST',
        body: JSON.stringify({ scopes })
    });

export const getBackupJob = (token: string, id: string) => backupsFetch<BackupJob>(token, `/${id}`);

export const deleteBackupJob = (token: string, id: string) =>
    backupsFetch<boolean>(token, `/${id}`, { method: 'DELETE' });

/**
 * The archive streams through the API rather than a presigned URL — see the
 * handler's own note on why. That means it cannot be a plain <a href>: the
 * request needs the bearer token, so it is fetched and handed to the browser
 * as a blob.
 */
export const downloadBackupArchive = async (token: string, job: BackupJob): Promise<void> => {
    const res = await fetch(`${BASE}/${job.id}/download`, {
        headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw err?.detail ?? 'Request failed';
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download =
        (job.archive_path ?? `selfai-backup-${job.id}.tar.gz`).split('/').pop() ?? 'backup.tar.gz';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
};

export const uploadRestoreArchive = async (token: string, file: File): Promise<UploadedArchive> => {
    const body = new FormData();
    body.append('file', file);

    // No Content-Type header: the browser must set the multipart boundary.
    const res = await fetch(`${BASE}/restore/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw err?.detail ?? 'Request failed';
    }
    return res.json();
};

export const previewRestore = (token: string, archivePath: string) =>
    backupsFetch<RestorePreview>(token, '/restore/preview', {
        method: 'POST',
        body: JSON.stringify({ archive_path: archivePath })
    });

export const createRestoreJob = (token: string, archivePath: string) =>
    backupsFetch<BackupJob>(token, '/restore', {
        method: 'POST',
        body: JSON.stringify({ archive_path: archivePath })
    });
