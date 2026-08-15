# packkit-actions

Reusable GitHub Actions workflows shared across the [PackkitLabs](https://github.com/PackkitLabs)
ecosystem — the single place CI/release logic lives, so `packkit-core`, the
generators (`create-packkit-js`, `create-packkit-py`, …), and downstream packages
don't each carry a copy.

Part of the [Packkit platform](https://github.com/PackkitLabs) — see
[`create-packkit-js/docs/PLATFORM.md`](https://github.com/PackkitLabs/create-packkit-js/blob/main/docs/PLATFORM.md).

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
| `dependency-freshness.yml` | `schedule` / `workflow_dispatch` | `npm run check:freshness` → open/update/close a tracking issue |
| `stale-references.yml` | `push` / `pull_request` / `schedule` | source `scripts/stale-references.sh` → fail on stale org/repo/Pages references |

Most invoke a single standard npm script, so the shared YAML stays
language-agnostic:

| Script | Meaning |
| --- | --- |
| `check` | typecheck + lint + test + build + package validation |
| `test:integration` | scaffold a project with the real CLI and exercise its own tooling |
| `check:freshness` | compare the deps the generator EMITS to the latest published; exit non-zero if a major behind |

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
    uses: PackkitLabs/packkit-actions/.github/workflows/generator-ci.yml@v1
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
    uses: PackkitLabs/packkit-actions/.github/workflows/generator-integration.yml@v1
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
    uses: PackkitLabs/packkit-actions/.github/workflows/security.yml@v1
```

```yaml
# .github/workflows/freshness.yml in a generator repo
name: Dependency freshness
on:
  schedule:
    - cron: '0 9 * * 1'
  workflow_dispatch:
jobs:
  freshness:
    permissions: # the caller must grant issues: write
      contents: read
      issues: write
    uses: PackkitLabs/packkit-actions/.github/workflows/dependency-freshness.yml@v1
```

```yaml
# .github/workflows/stale-references.yml in any ecosystem repo
name: Stale references
on:
  push:
    branches: [main]
  pull_request:
  workflow_dispatch:
jobs:
  stale-references:
    uses: PackkitLabs/packkit-actions/.github/workflows/stale-references.yml@v1
```

### Stale-reference audit

`stale-references.yml` guards against the slow rot GitHub's rename redirects hide:
after `PackkitJS` → `PackkitLabs` and `create-packkit` → `create-packkit-js`, old
links keep resolving, so nothing fails when a doc, badge, or emitted `$schema` URL
still names the old org/repo. The audit greps every tracked file for the stale
spellings (the org-qualified `PackkitLabs/create-packkit` repo path, the
`packkitjs.github.io` and `…github.io/create-packkit` Pages paths, and the bare
`PackkitJS` org name) and fails the run if any survive. The unqualified npm/CLI
name `create-packkit` is deliberately **not** flagged.

Patterns live once in [`scripts/stale-references.sh`](scripts/stale-references.sh)
— run it locally too (`bash scripts/stale-references.sh` from any repo). Exempt a
legitimate historical mention (a CHANGELOG entry or a frozen migration doc naming
the old org in past tense) by adding the file's path as an ERE, one per line, to a
`.stale-refs-allow` file at the repo root:

```text
# .stale-refs-allow — historical records; past org/repo names are correct here.
(^|/)CHANGELOG\.md$
(^|/)docs/history/
```

## Versioning

Released as a moving major tag: `v1` always points at the latest `v1.x.y`.
Breaking changes to a workflow's inputs or contract move to `v2`. Consumers that
need immutability pin a full SHA instead of `@v1`.
