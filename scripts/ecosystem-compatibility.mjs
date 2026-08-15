#!/usr/bin/env node
//
// ecosystem-compatibility.mjs — assert @packkit/core version consistency across the org.
//
// Reads each consumer's MAIN-branch package.json (via `gh api`) and its declared
// @packkit/core range, and compares against core's OWN main-branch version. It catches
// the real drift bug — a consumer requiring a core NEWER than core's main (e.g. a
// provider on ^0.6.0 while core main still says 0.4.0) — before a human trips over it,
// while tolerating the ecosystem's DECLARED benign version split (generators/surfaces
// intentionally trailing core; see compatibility.json). A source-level companion to
// packkit-e2e's J6, which checks the same at PUBLISHED versions.
//
// Usage:  node scripts/ecosystem-compatibility.mjs
// Exit:   0 = consistent · 1 = a real inconsistency · 2 = setup error
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ORG = process.env.PACKKIT_ORG || 'PackkitLabs';
const here = dirname(fileURLToPath(import.meta.url));
const decl = JSON.parse(readFileSync(join(here, '..', 'compatibility.json'), 'utf8'));

function ghManifest(repo) {
	const b64 = execFileSync(
		'gh',
		['api', `repos/${ORG}/${repo}/contents/package.json`, '-q', '.content'],
		{ encoding: 'utf8' },
	);
	return JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
}

// --- tiny semver: caret + exact ranges only (all this ecosystem uses) ----------------
const parse = (v) => {
	const m = String(v)
		.trim()
		.replace(/^[^\d]*/, '')
		.match(/^(\d+)\.(\d+)\.(\d+)/);
	return m ? [+m[1], +m[2], +m[3]] : null;
};
const cmp = (a, b) => {
	for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
	return 0;
};
const caretUpper = ([maj, min, pat]) =>
	maj > 0 ? [maj + 1, 0, 0] : min > 0 ? [0, min + 1, 0] : [0, 0, pat + 1];
const rangeMin = (range) => {
	const m = String(range).match(/(\d+\.\d+\.\d+)/);
	return m ? parse(m[1]) : null;
};
function satisfies(version, range) {
	const v = parse(version);
	if (!v) return null;
	const r = String(range).trim();
	if (r.startsWith('^')) {
		const min = rangeMin(r);
		return min ? cmp(v, min) >= 0 && cmp(v, caretUpper(min)) < 0 : null;
	}
	// Comparator range, e.g. ">=0.6.0 <1.0.0" — accept any core spanning additive minors.
	const ge = r.match(/>=\s*(\d+\.\d+\.\d+)/);
	const lt = r.match(/<\s*(\d+\.\d+\.\d+)/);
	if (ge || lt) {
		if (ge && cmp(v, parse(ge[1])) < 0) return false;
		if (lt && cmp(v, parse(lt[1])) >= 0) return false;
		return true;
	}
	const min = rangeMin(r);
	return min ? cmp(v, min) === 0 : null; // exact
}

let core, coreVersion;
try {
	core = ghManifest(decl.core.repo);
	coreVersion = core.version;
} catch (err) {
	console.error(`ecosystem-compatibility: could not read core manifest (${decl.core.repo}): ${err.message}`);
	process.exit(2);
}

console.log(`Ecosystem compatibility — ${decl.core.package} main is ${coreVersion} (${decl.core.repo})\n`);
const cv = parse(coreVersion);
const failures = [];

for (const c of decl.consumers) {
	let range;
	try {
		const pkg = ghManifest(c.repo);
		range = pkg[c.field]?.[decl.core.package];
	} catch (err) {
		failures.push(`${c.repo}: could not read package.json (${err.message.split('\n')[0]})`);
		console.log(`  ✖ ${c.repo}: manifest unreadable`);
		continue;
	}
	if (!range) {
		failures.push(`${c.repo}: declares no ${decl.core.package} in ${c.field}`);
		console.log(`  ✖ ${c.repo}: no ${decl.core.package} in ${c.field}`);
		continue;
	}
	const minR = rangeMin(range);
	if (!minR) {
		console.log(`  · ${c.repo}: "${range}" — unrecognized range shape, skipped`);
		continue;
	}
	// A consumer requiring a core newer than core's main is always the drift bug.
	if (cmp(minR, cv) > 0) {
		failures.push(
			`${c.repo} requires ${decl.core.package} "${range}" (min ${minR.join('.')}) but core main is ${coreVersion} — consumer is AHEAD of core`,
		);
		console.log(`  ✖ ${c.repo}: "${range}" is AHEAD of core ${coreVersion}`);
		continue;
	}
	if (satisfies(coreVersion, range)) {
		console.log(`  ✓ ${c.repo}: "${range}" tracks current core ${coreVersion}`);
		continue;
	}
	// Behind current core: fine only if declared a benign split.
	if (c.split === 'behind') {
		console.log(`  · ${c.repo}: "${range}" — benign split (intentionally behind core ${coreVersion})`);
		continue;
	}
	failures.push(
		`${c.repo} pins ${decl.core.package} "${range}", which excludes current core ${coreVersion}, and is not a declared benign split`,
	);
	console.log(`  ✖ ${c.repo}: "${range}" excludes core ${coreVersion} (not declared benign)`);
}

if (failures.length) {
	console.error(`\n✖ ecosystem-compatibility: ${failures.length} problem(s):`);
	for (const f of failures) console.error(`   - ${f}`);
	console.error(
		'\nFix core/consumer versions, or (for an intentional trailing pin) mark the consumer `"split": "behind"` in compatibility.json.',
	);
	process.exit(1);
}
console.log('\n✓ ecosystem-compatibility: every consumer is consistent with core (benign splits tolerated).');
