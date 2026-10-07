# NAAMII PMIS — architecture summary

The full Phase 1 architecture & design document lives in Claude Docs
("NAAMII PMIS — Architecture & Design (Phase 1)"). This file records the decisions the code implements.

| Decision | Choice |
| --- | --- |
| Hosting | All-Azure: App Service (Next.js), Azure Database for PostgreSQL (Flexible Server), Functions, Blob Storage, Key Vault |
| Authentication | Microsoft Entra ID single sign-on via App Service built-in authentication (Demo Mode locally) |
| Authorization | PostgreSQL Row Level Security driven by `app.user_id`; roles ED / PI / Project Lead / Admin; compensation visible to Admin + ED only |
| Data source | Project Excel workbooks in OneDrive, read nightly through Microsoft Graph (app-only); manual upload as fallback |
| Calculations | Centralised in `packages/core` (utilisation, remaining, variances, days remaining, health rules, alerts) |
| Brand | NAAMII Brand Book 2026 tokens in `app/src/app/globals.css` (Helvetica Neue; #454d59 #db0505 #737370 #a1a6b2 #ffffff) |

Layers: **DATA** (`db/`, `functions/`) → **BUSINESS LOGIC** (`packages/core`, RLS policies, `app/src/lib`) → **PRESENTATION** (`app/src/components`, `app/src/app`).
