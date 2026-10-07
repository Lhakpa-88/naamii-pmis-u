import "server-only";
import type { Role } from "@naamii/core";
import type { Queryable } from "../db";

/** Admin-only reads (RLS returns nothing for other roles). */
export async function loadImportRuns(q: Queryable) {
  const runs = await q.query<{ id: string; started_at: Date; finished_at: Date | null; triggered_by: string; status: string; files_total: number; files_changed: number; files_unchanged: number; files_failed: number; notes: string | null }>(
    "SELECT id, started_at, finished_at, triggered_by, status, files_total, files_changed, files_unchanged, files_failed, notes FROM import_runs ORDER BY started_at DESC LIMIT 25");
  const files = await q.query<{ import_run_id: string; source_file: string; status: string; rows_upserted: number; message: string | null; processed_at: Date }>(
    "SELECT import_run_id, source_file, status, rows_upserted, message, processed_at FROM import_files WHERE import_run_id = ANY($1::uuid[]) ORDER BY source_file", [runs.rows.map((r) => r.id)]);
  return { runs: runs.rows, files: files.rows };
}

export async function loadImportErrors(q: Queryable) {
  const { rows } = await q.query<{ id: string; source_file: string; source_sheet: string | null; source_row: number | null; field: string | null; error_code: string; message: string; created_at: Date }>(
    "SELECT id, source_file, source_sheet, source_row, field, error_code, message, created_at FROM import_errors ORDER BY created_at DESC LIMIT 200");
  return rows;
}

export async function loadUsers(q: Queryable) {
  const { rows } = await q.query<{ id: string; email: string; name: string; role: Role; lab_name: string | null; active: boolean; projects: number; entra_bound: boolean }>(
    `SELECT u.id, u.email, u.name, u.role, l.name AS lab_name, u.active,
            (SELECT count(*) FROM project_assignments pa WHERE pa.user_id = u.id)::int AS projects,
            (u.entra_object_id IS NOT NULL) AS entra_bound
     FROM users u LEFT JOIN labs l ON l.id = u.lab_id ORDER BY u.role, u.name`);
  return rows;
}

export async function loadMappings(q: Queryable) {
  const { rows } = await q.query<{ id: string; sheet_pattern: string; excel_column: string; target_entity: string; target_field: string; data_type: string; required: boolean; active: boolean; notes: string | null }>(
    "SELECT id, sheet_pattern, excel_column, target_entity, target_field, data_type, required, active, notes FROM column_mappings ORDER BY sheet_pattern, excel_column");
  return rows;
}
