# Changelog

All notable changes to `packkit-actions` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Reusable workflows are versioned by a moving major tag (`v1` → latest `v1.x.y`);
breaking changes to a workflow's inputs or contract move the major.

## [Unreleased]

## [1.0.0] - 2026-08-12

Initial release — Phase 4 of the Packkit platform migration (see
`create-packkit/docs/PLATFORM.md`).

### Added

- `generator-ci.yml` — reusable `workflow_call` CI for every generator repo. Runs
  `npm ci` then the standard `npm run check` entrypoint, so the shared YAML stays
  language-agnostic. Inputs: `node-version` (default `24`), `runs-on`
  (default `ubuntu-latest`).

[Unreleased]: https://github.com/PackkitJS/packkit-actions/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/PackkitJS/packkit-actions/releases/tag/v1.0.0
