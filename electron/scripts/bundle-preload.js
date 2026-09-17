#!/usr/bin/env node
const { build } = require('esbuild');
const path = require('path');
const base = { bundle: true, target: 'es2022', sourcemap: false };
Promise.all([
  build({
    ...base,
    entryPoints: [path.join(__dirname, '..', 'preload.ts')],
    outfile: path.join(__dirname, '..', 'preload.js'),
    platform: 'node',
    format: 'cjs',
    external: ['electron'],
    logLevel: 'info',
  }),
  build({
    ...base,
    entryPoints: [path.join(__dirname, '..', 'tray-popover-preload.ts')],
    outfile: path.join(__dirname, '..', 'tray-popover-preload.js'),
    platform: 'node',
    format: 'cjs',
    external: ['electron'],
  }),
  build({
    ...base,
    entryPoints: [path.join(__dirname, '..', 'tray-popover-renderer.ts')],
    outfile: path.join(__dirname, '..', 'tray-popover-renderer.js'),
    platform: 'browser',
    format: 'iife',
  }),
]).catch(() => process.exit(1));
