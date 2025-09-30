#!/usr/bin/env node
/**
 * bump-version.mjs
 * What: Bumps package.json version (patch|minor|major) and prints the new version.
 * Why: Enforces the Versioning Protocol so each dev run and commit are uniquely versioned.
 */
import fs from 'fs';
import path from 'path';

const cwd = process.cwd();
const pkgPath = path.join(cwd, 'package.json');

const type = (process.argv[2] || '').toLowerCase();
if (!['patch', 'minor', 'major'].includes(type)) {
  console.error('Usage: node scripts/bump-version.mjs <patch|minor|major>');
  process.exit(1);
}

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const current = pkg.version || '0.0.0';
const [maj, min, pat] = current.split('.').map((n) => parseInt(n, 10) || 0);
let nextMaj = maj, nextMin = min, nextPat = pat;

if (type === 'patch') {
  nextPat += 1;
} else if (type === 'minor') {
  nextMin += 1; nextPat = 0;
} else if (type === 'major') {
  nextMaj += 1; nextMin = 0; nextPat = 0;
}

const next = `${nextMaj}.${nextMin}.${nextPat}`;
pkg.version = next;

// Keep JSON formatting stable (2 spaces)
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');

console.log(next);
