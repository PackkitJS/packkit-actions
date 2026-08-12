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
| `generator-integration.yml` | `push` / `pull_request` / `schedule` | provisions runtimes (Node always; uv opt-in) → `npm run test:integration` |
| `security.yml` | `pull_request` / `schedule` | `npm ci` → `npm audit --audit-level=<high>` |

Each invokes a single standard npm script, so the shared YAML stays
language-agnostic:

| Script | Meaning |
| --- | --- |
| `check` | typecheck + lint + test + build + package validation |
| `test:integration` | scaffold a project with the real CLI and exercise its own tooling |

_`dependency-freshness` (template-dependency currency) lands in a later slice, once
there's a generator freshness check to generalize._

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

```yaml
# .github/workflows/integration.yml in a Python generator repo
name: Integration
on:
  push:
    branches: [main]
  pull_request:
jobs:
  integration:
    uses: PackkitJS/packkit-actions/.github/workflows/generator-integration.yml@v1
    with:
      setup-uv: true
```

```yaml
# .github/workflows/security.yml
name: Security
on:
  pull_request:
  schedule:
    - cron: '0 6 * * 1'
jobs:
  security:
    uses: PackkitJS/packkit-actions/.github/workflows/security.yml@v1
```

## Versioning

Released as a moving major tag: `v1` always points at the latest `v1.x.y`.
Breaking changes to a workflow's inputs or contract move to `v2`. Consumers that
need immutability pin a full SHA instead of `@v1`.
