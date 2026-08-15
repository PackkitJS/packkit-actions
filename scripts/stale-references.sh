#!/usr/bin/env bash
#
# stale-references.sh — org-wide audit for stale Packkit references.
#
# After the `PackkitJS` → `PackkitLabs` org rename and the
# `create-packkit` → `create-packkit-js` repo rename, GitHub keeps *redirects*,
# so stale links keep working and silently rot instead of failing loudly. This
# script greps a repo's git-tracked files for the known-stale spellings and exits
# non-zero if any survive — the reference analog of the dependency-freshness net.
#
# It is deliberately language-agnostic and carries the org-wide patterns as a
# single source of truth, so every repo runs the *same* audit (via the reusable
# `stale-references.yml` workflow) without vendoring a copy that can drift.
#
# Legitimate historical mentions (e.g. a CHANGELOG entry describing the rename in
# past tense) can be exempted per-repo: add an ERE that matches the file PATH to a
# `.stale-refs-allow` file at the repo root, one pattern per line (`#` comments ok).
#
# Usage:  bash stale-references.sh            # audits the git repo containing $PWD
# Exit:   0 = clean · 1 = stale references found · 2 = not a git repo
set -uo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || {
	echo "stale-references: not inside a git repository." >&2
	exit 2
}
cd "$ROOT" || exit 2

# Per-repo path allowlist for legitimate historical mentions.
ALLOW_FILE=".stale-refs-allow"
declare -a ALLOW=()
if [[ -f "$ALLOW_FILE" ]]; then
	while IFS= read -r line || [[ -n "$line" ]]; do
		[[ -z "$line" || "$line" == \#* ]] && continue
		ALLOW+=("$line")
	done <"$ALLOW_FILE"
fi
# The audit's own machinery is always exempt.
ALLOW+=('(^|/)\.stale-refs-allow$' '(^|/)stale-references\.sh$' '(^|/)stale-references\.yml$')

# pattern<TAB>why. ERE. The unqualified npm/CLI name `create-packkit` is fine — we
# only flag the *org-qualified repo path* and the *Pages project path*, which is
# why the create-packkit patterns require a non-[-A-Za-z0-9] char (or end) next, so
# create-packkit-js / -py / -go and `npx create-packkit` never match.
readonly PATTERNS=$(
	cat <<'EOF'
PackkitJS	old org name — use PackkitLabs
packkitjs\.github\.io	old Pages subdomain — use packkitlabs.github.io
PackkitLabs/create-packkit([^-A-Za-z0-9]|$)	old JS repo path — the repo is create-packkit-js
github\.io/create-packkit([^-A-Za-z0-9]|$)	old Pages project path — use /create-packkit-js
EOF
)

is_allowed() {
	local path="$1" a
	for a in "${ALLOW[@]}"; do
		printf '%s' "$path" | grep -Eq "$a" && return 0
	done
	return 1
}

found=0
while IFS=$'\t' read -r re why; do
	[[ -z "$re" ]] && continue
	while IFS= read -r hit; do
		[[ -z "$hit" ]] && continue
		file="${hit%%:*}"
		is_allowed "$file" && continue
		if [[ "$found" -eq 0 ]]; then
			echo "Stale reference audit — findings:"
			echo
		fi
		found=1
		printf '  · %s\n    (%s)\n' "$hit" "$why"
	done < <(git grep -InE "$re" 2>/dev/null || true)
done <<<"$PATTERNS"

if [[ "$found" -ne 0 ]]; then
	echo
	echo "These are stale after the PackkitJS→PackkitLabs / create-packkit→create-packkit-js renames."
	echo "Fix them, or exempt a legitimate historical mention by adding its file path (an ERE)"
	echo "to .stale-refs-allow at the repo root."
	exit 1
fi

echo "Stale reference audit: clean — no stale org/repo/Pages references found."
