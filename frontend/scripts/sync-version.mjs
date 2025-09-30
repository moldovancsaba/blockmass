#!/usr/bin/env node
/**
 * sync-version.mjs
 * What: Syncs current version (from package.json) across docs and .env.local.
 * Why: Enforces version consistency across UI, docs, and metadata per Versioning Protocol.
 */
import fs from 'fs';
import path from 'path';

const cwd = process.cwd();
const pkgPath = path.join(cwd, 'package.json');
const readmePath = path.join(cwd, 'README.md');
const roadmapPath = path.join(cwd, 'ROADMAP.md');
const tasklistPath = path.join(cwd, 'TASKLIST.md');
const archPath = path.join(cwd, 'ARCHITECTURE.md');
const learningsPath = path.join(cwd, 'LEARNINGS.md');
const envLocalPath = path.join(cwd, '.env.local');

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const version = pkg.version;

// ISO 8601 with milliseconds UTC
const now = new Date().toISOString();

function ensureFile(filePath, initialContent) {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, initialContent, 'utf8');
  }
}

function upsertBetweenMarkers(filePath, startMark, endMark, newContent) {
  const exists = fs.existsSync(filePath);
  const src = exists ? fs.readFileSync(filePath, 'utf8') : '';
  const startIdx = src.indexOf(startMark);
  const endIdx = src.indexOf(endMark);
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    const before = src.slice(0, startIdx + startMark.length);
    const after = src.slice(endIdx);
    fs.writeFileSync(filePath, before + '\n' + newContent + '\n' + after, 'utf8');
  } else {
    const injected = `${startMark}\n${newContent}\n${endMark}`;
    const content = src ? `${injected}\n\n${src}` : injected;
    fs.writeFileSync(filePath, content, 'utf8');
  }
}

// README version badge
const badge = `![Version](https://img.shields.io/badge/version-v${version}-blue)`;
upsertBetweenMarkers(readmePath, '<!--VERSION_BADGE_START-->', '<!--VERSION_BADGE_END-->', `${badge}\nLast synced: ${now}`);

// Add/update version line in other docs
function upsertVersionLine(filePath, title) {
  const markStart = '<!--VERSION_INFO_START-->';
  const markEnd = '<!--VERSION_INFO_END-->';
  const content = `${title}: v${version} (synced ${now})`;
  upsertBetweenMarkers(filePath, markStart, markEnd, content);
}

[roadmapPath, tasklistPath, archPath, learningsPath].forEach((p) => {
  ensureFile(p, `# ${path.basename(p, path.extname(p))}\n\n`);
  upsertVersionLine(p, 'Current Version');
});

// Update NEXT_PUBLIC_APP_VERSION in .env.local without exposing secrets
let envOut = '';
if (fs.existsSync(envLocalPath)) {
  const lines = fs.readFileSync(envLocalPath, 'utf8').split(/\r?\n/);
  let found = false;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('NEXT_PUBLIC_APP_VERSION=')) {
      lines[i] = `NEXT_PUBLIC_APP_VERSION=v${version}`;
      found = true;
    }
  }
  if (!found) lines.push(`NEXT_PUBLIC_APP_VERSION=v${version}`);
  envOut = lines.join('\n');
} else {
  envOut = `NEXT_PUBLIC_APP_VERSION=v${version}`;
}
fs.writeFileSync(envLocalPath, envOut + '\n', 'utf8');

console.log(`Synced version v${version} at ${now}`);
