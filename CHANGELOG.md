# Changelog — js-config-manager

## [Unreleased] — 2026-10-18

### Phase 1 — Shared Architecture Consolidation

#### Changed
- Synchronized `_findMissingEnvVars` helper — canonical implementation now lives here and is consumed by `southway-api` and `southpass` via `file:../js-config-manager` workspace reference.
- `southway-api/package.json` updated: `@sw-lplk/config-manager` points to `file:../js-config-manager` instead of a local duplicate.
- Deleted duplicate `southway-api/src/lib/config-manager/` directory.
