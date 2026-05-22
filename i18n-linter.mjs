#!/usr/bin/env node
/**
 * @geomatico/i18n-linter — enforces six i18n rules:
 *   1. t() must be called with a literal string argument  (never auto-fixable)
 *   2. all locales must have a bundle file
 *   3. all t() keys must exist in every bundle
 *   4. no bundle keys absent from the code (unused keys)
 *   5. bundle keys must be sorted alphabetically at every level
 *   6. no empty string values in bundles                  (never auto-fixable)
 *
 * Checks 2–5 are delegated to i18next-cli. Checks 1 and 6 are custom.
 *
 * Usage (CLI):
 *   i18n-linter [--write] [--locales <l1,l2>] [--src <dir>] [--output <pattern>]
 */
import {existsSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync} from 'node:fs';
import {basename, extname, join, resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const SRC_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx']);
// Matches t( NOT followed by optional whitespace + quote.
// \s* in the lookahead spans newlines so multiline t(\n  'key') is not flagged.
// Template literals are always flagged — static analysis can't verify their content.
const DYNAMIC_T_RE = /\bt\((?!\s*['"])/g;

// ── Pure logic ────────────────────────────────────────────────────────────────

export function findDynamicTCallsInContent(content, filename) {
  const findings = [];
  DYNAMIC_T_RE.lastIndex = 0;
  let match;
  while ((match = DYNAMIC_T_RE.exec(content)) !== null) {
    const lineNum = content.slice(0, match.index).split('\n').length;
    findings.push({filename, lineNum, text: content.split('\n')[lineNum - 1].trim()});
  }
  return findings;
}

export function collectEmptyKeys(obj, prefix = '') {
  const empty = [];
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') { if (v === '') empty.push(path); }
    else if (v !== null && typeof v === 'object') empty.push(...collectEmptyKeys(v, path));
  }
  return empty;
}

// ── I/O ───────────────────────────────────────────────────────────────────────

function* walkFiles(dir) {
  for (const entry of readdirSync(dir, {withFileTypes: true})) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* walkFiles(full);
    else if (SRC_EXTENSIONS.has(extname(entry.name))) yield full;
  }
}

function writeTempConfig({cwd, src, output, locales}) {
  const absSrc = resolve(cwd, src);
  const absOutput = resolve(cwd, output);
  const content = [
    'export default {',
    `  locales: ${JSON.stringify(locales)},`,
    '  extract: {',
    `    input: ${JSON.stringify(absSrc + '/**/*.{js,jsx,ts,tsx}')},`,
    `    output: ${JSON.stringify(absOutput)},`,
    '    defaultNS: false,',
    "    defaultValue: '',",
    '    sort: true,',
    '  },',
    '};',
  ].join('\n');
  const dir = mkdtempSync(join(tmpdir(), 'i18n-linter-'));
  const configPath = join(dir, 'i18next.config.mjs');
  writeFileSync(configPath, content);
  return {dir, configPath};
}

// ── runChecks ─────────────────────────────────────────────────────────────────

export async function runChecks({cwd, srcDir, src, output, write, locales}) {
  let hasErrors = false;

  // Check 1: dynamic t() calls
  const dynamicFindings = [];
  for (const file of walkFiles(srcDir)) {
    dynamicFindings.push(...findDynamicTCallsInContent(readFileSync(file, 'utf8'), file));
  }
  if (dynamicFindings.length > 0) {
    console.error('Error: t() must be called with a literal string argument.');
    console.error('Dynamic keys prevent complete translation verification.\n');
    dynamicFindings.forEach(({filename, lineNum, text}) =>
      console.error(`  ${filename}:${lineNum}: ${text}`)
    );
    hasErrors = true;
  }

  // Checks 2–5: delegate to i18next-cli via a generated temp config
  const cli = process.platform === 'win32' ? 'i18next-cli.cmd' : 'i18next-cli';
  const {dir, configPath} = writeTempConfig({cwd, src, output, locales});
  try {
    const args = ['--config', configPath, ...(write ? ['extract'] : ['extract', '--ci', '--dry-run'])];
    console.error('\nBundle sync check (+ missing in bundle, - unused in bundle):');
    const {status} = spawnSync(cli, args, {stdio: 'inherit', cwd});
    if (status !== 0) {
      if (!write)
        console.error('\nRun with --write to auto-fix missing/unused keys and sorting.');
      hasErrors = true;
    }
  } finally {
    rmSync(dir, {recursive: true, force: true});
  }

  // Check 6: empty values — always run, even when checks 2–5 failed
  for (const locale of locales) {
    const bundlePath = resolve(cwd, output.replace('{{language}}', locale));
    if (!existsSync(bundlePath)) continue;
    const empty = collectEmptyKeys(JSON.parse(readFileSync(bundlePath, 'utf8')));
    if (empty.length > 0) {
      hasErrors = true;
      console.error(`\nEmpty translations in ${basename(bundlePath)} (fill these in manually):`);
      empty.forEach(k => console.error(`  📍 ${k}`));
    }
  }

  return hasErrors;
}

// ── CLI entry point ───────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = argv.slice(2);
  const get = flag => {const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : undefined;};
  return {
    locales: (get('--locales') ?? 'es,en').split(',').map(l => l.trim()),
    src: get('--src') ?? 'src',
    output: get('--output') ?? 'src/i18n/{{language}}.json',
    write: args.includes('--write'),
  };
}

async function main() {
  const cwd = process.cwd();
  const {locales, src, output, write} = parseArgs(process.argv);
  const hasErrors = await runChecks({
    cwd,
    srcDir: resolve(cwd, src),
    src,
    output,
    write,
    locales,
  });
  if (hasErrors) process.exit(1);
}

if (realpathSync(process.argv[1]) === __filename) {
  main().catch(err => {console.error(err); process.exit(1);});
}