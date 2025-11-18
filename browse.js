#!/usr/bin/env node

const BROWSE_FLAG = '--browse-mode';
if (!process.argv.includes(BROWSE_FLAG)) {
  process.argv.splice(2, 0, BROWSE_FLAG);
}

await import('./crawler.js');
