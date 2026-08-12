# packkit-actions

Reusable GitHub Actions workflows shared across the [PackkitJS](https://github.com/PackkitJS)
ecosystem — the single place CI/release logic lives, so `packkit-core`, the
generators (`create-packkit-js`, `create-packkit-py`, …), and downstream packages
don't each carry a copy.

Part of the Packkit platform migration — see `create-packkit/docs/PLATFORM.md`,
Phase 4.

## Design rules

- **Scripts, not commands.** A reusable workflow invokes a *standard npm script*
  (`check`, `test:integration`, `check:generated`, `check:freshness`) and never
  encodes a language's toolchain. What "check" means for a generator lives in that
  generator's `package.json`, so the same YAML serves a JS repo and a Python-emitting
  JS repo alike.
- **Verification only — publishing stays local.** These workflows run checks. The
  actual `npm publish` step stays in each repo's own `release.yml` (with its own
  OIDC trusted-publishing config), so a compromise of this shared repo can never
  publish a package. Supply-chain blast radius stays small.
- **Pin `@v1`, never `@main`.** Consumers reference a released major tag (or a full
  commit SHA for security-sensitive jobs). A push to `main` here must never break
  every repo in the org.

## Workflows

| Workflow | Trigger in consumer | Runs |
| --- | --- | --- |
| `generator-ci.yml` | `push` / `pull_request` | `npm ci` → `npm run check` |

_More workflows (`security`, `dependency-freshness`, `generator-integration`) land
in later Phase-4 slices._

## Usage

```yaml
# .github/workflows/ci.yml in a consumer repo
name: CI
on:
  push:
    branches: [main]
  pull_request:
jobs:
  ci:
    uses: PackkitJS/packkit-actions/.github/workflows/generator-ci.yml@v1
    # optional overrides:
    # with:
    #   node-version: '22'
```

## Versioning

Released as a moving major tag: `v1` always points at the latest `v1.x.y`.
Breaking changes to a workflow's inputs or contract move to `v2`. Consumers that
need immutability pin a full SHA instead of `@v1`.
