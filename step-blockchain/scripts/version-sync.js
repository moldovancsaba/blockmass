#!/usr/bin/env node

/**
 * Version Synchronization Utility
 * 
 * Purpose: Propagates the current version from package.json to all documentation files
 * that reference the version number, ensuring consistency across the project.
 * 
 * Why: Manual version updates across multiple markdown files are error-prone and often
 * result in version mismatches. This script automates the synchronization process,
 * enforcing the Versioning and Release Protocol requirement that all version references
 * be updated atomically.
 * 
 * Usage:
 *   node scripts/version-sync.js
 * 
 * Files Updated:
 *   - README.md (version badge and metadata)
 *   - ARCHITECTURE.md (header version)
 *   - ROADMAP.md (header version)
 *   - TASKLIST.md (header version, if exists)
 *   - LEARNINGS.md (header version, if exists)
 *   - RELEASE_NOTES.md (header version, if exists)
 * 
 * Timestamp Format: ISO 8601 with milliseconds in UTC (YYYY-MM-DDTHH:MM:SS.sssZ)
 */

const fs = require('fs');
const path = require('path');

// Get current version from package.json
const packageJsonPath = path.join(__dirname, '..', 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
const version = packageJson.version;

// Generate ISO 8601 timestamp with milliseconds in UTC
const timestamp = new Date().toISOString();

console.log(`\n🔄 Version Sync Utility`);
console.log(`Timestamp: ${timestamp}`);
console.log(`Current Version: ${version}\n`);

/**
 * Update version in a markdown file
 * 
 * Strategy:
 * - Finds patterns like **Version:** X.Y.Z or Version: X.Y.Z
 * - Finds patterns like Last Updated: TIMESTAMP
 * - Updates to current version and timestamp
 */
function updateMarkdownFile(filePath, fileName) {
  if (!fs.existsSync(filePath)) {
    console.log(`⏭️  Skipping ${fileName} (file does not exist)`);
    return false;
  }

  let content = fs.readFileSync(filePath, 'utf-8');
  let updated = false;

  // Pattern 1: **Version:** X.Y.Z or Version: X.Y.Z
  const versionPatterns = [
    /(\*\*Version:\*\*\s+)[\d.]+/g,
    /(Version:\s+)[\d.]+/g,
    /(version":\s*")[\d.]+/g,
    /(Current Version:\s+v?)[\d.]+/g,
  ];

  versionPatterns.forEach(pattern => {
    if (pattern.test(content)) {
      content = content.replace(pattern, `$1${version}`);
      updated = true;
    }
  });

  // Pattern 2: Last Updated: TIMESTAMP (ISO 8601)
  const timestampPatterns = [
    /(\*\*Last Updated:\*\*\s+)\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/g,
    /(Last Updated:\s+)\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/g,
  ];

  timestampPatterns.forEach(pattern => {
    if (pattern.test(content)) {
      content = content.replace(pattern, `$1${timestamp}`);
      updated = true;
    }
  });

  if (updated) {
    fs.writeFileSync(filePath, content, 'utf-8');
    console.log(`✅ Updated ${fileName}`);
    return true;
  } else {
    console.log(`⚪ No changes needed for ${fileName}`);
    return false;
  }
}

// Files to update
const files = [
  { path: path.join(__dirname, '..', 'README.md'), name: 'README.md' },
  { path: path.join(__dirname, '..', 'ARCHITECTURE.md'), name: 'ARCHITECTURE.md' },
  { path: path.join(__dirname, '..', 'ROADMAP.md'), name: 'ROADMAP.md' },
  { path: path.join(__dirname, '..', 'TASKLIST.md'), name: 'TASKLIST.md' },
  { path: path.join(__dirname, '..', 'LEARNINGS.md'), name: 'LEARNINGS.md' },
  { path: path.join(__dirname, '..', 'RELEASE_NOTES.md'), name: 'RELEASE_NOTES.md' },
];

let totalUpdated = 0;
files.forEach(file => {
  if (updateMarkdownFile(file.path, file.name)) {
    totalUpdated++;
  }
});

console.log(`\n✅ Version sync complete: ${totalUpdated} file(s) updated to v${version}`);
console.log(`Timestamp: ${timestamp}\n`);
