# functions/ — Azure Functions (Phase 2)

Planned contents (see the architecture document, section F):

- `sync/` — nightly timer trigger + HTTP "Sync Now": Microsoft Graph client (app-only via managed identity),
  delta/eTag + content-hash change detection, download-and-parse (SheetJS), configurable column mapping
  (`column_mappings` table), validation, upsert by natural key, `import_runs` / `import_files` / `import_errors` logging.
- `ingest-upload/` — blob trigger that runs the same parser for workbooks uploaded from the Admin console.

Both connect to PostgreSQL as the `pmis_etl` role (trusted writer; bypasses Row Level Security by design).
