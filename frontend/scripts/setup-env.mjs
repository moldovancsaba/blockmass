#!/usr/bin/env node
/**
 * setup-env.mjs
 * What: Creates .env.local from .env.example if missing.
 * Why: Smooth onboarding and consistent local setup.
 */
import fs from 'fs';
import path from 'path';

const cwd = process.cwd();
const examplePath = path.join(cwd, '.env.example');
const localPath = path.join(cwd, '.env.local');

if (fs.existsSync(localPath)) {
  console.log('.env.local already exists. No changes made.');
  process.exit(0);
}

if (!fs.existsSync(examplePath)) {
  console.error('Missing .env.example. Cannot scaffold .env.local');
  process.exit(1);
}

const example = fs.readFileSync(examplePath, 'utf8');
fs.writeFileSync(localPath, example, 'utf8');
console.log('Created .env.local from .env.example');
