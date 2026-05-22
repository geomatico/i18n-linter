import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {collectEmptyKeys, findDynamicTCallsInContent, runChecks} from './i18n-linter.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

// ── Dynamic t() argument detection ───────────────────────────────────────────

describe('findDynamicTCallsInContent', () => {
  it('flags a variable argument and includes the file path and line number', () => {
    const [hit] = findDynamicTCallsInContent("const x = t(key);", 'src/Foo.tsx');
    assert.strictEqual(hit.filename, 'src/Foo.tsx');
    assert.strictEqual(hit.lineNum, 1);
    assert.ok(hit.text.includes('t(key)'));
  });

  it('reports the correct line number in a multi-line file', () => {
    const [hit] = findDynamicTCallsInContent("const a = 1;\nconst x = t(key);", 'f.tsx');
    assert.strictEqual(hit.lineNum, 2);
  });

  it('does not flag a single-quoted literal argument', () => {
    assert.strictEqual(findDynamicTCallsInContent("t('my.key')", 'f.tsx').length, 0);
  });

  it('does not flag a double-quoted literal argument', () => {
    assert.strictEqual(findDynamicTCallsInContent('t("my.key")', 'f.tsx').length, 0);
  });

  it('does not flag a multiline call when the argument is a literal', () => {
    assert.strictEqual(findDynamicTCallsInContent("t(\n  'my.key'\n)", 'f.tsx').length, 0);
  });

  it('flags a template literal argument', () => {
    assert.strictEqual(findDynamicTCallsInContent('t(`${key}`)', 'f.tsx').length, 1);
  });

  it('flags multiple dynamic calls in the same file', () => {
    assert.strictEqual(findDynamicTCallsInContent("t(a);\nt(b);", 'f.tsx').length, 2);
  });
});

// ── runChecks: dynamic calls are reported ────────────────────────────────────

describe('runChecks — dynamic calls are reported', () => {
  it('returns true when dynamic t() calls are present', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'i18n-test-'));
    writeFileSync(join(tmp, 'App.tsx'), "const x = t(dynamicKey);");
    const savedError = console.error;
    console.error = () => {};
    try {
      const hasErrors = await runChecks({
        cwd: ROOT,
        srcDir: tmp,
        src: 'src',
        output: 'src/i18n/{{language}}.json',
        write: false,
        locales: ['en'],
      });
      assert.strictEqual(hasErrors, true);
    } finally {
      console.error = savedError;
      rmSync(tmp, {recursive: true, force: true});
    }
  });
});

// ── Empty value detection ─────────────────────────────────────────────────────

describe('collectEmptyKeys', () => {
  it('detects a top-level empty value', () => {
    assert.deepStrictEqual(collectEmptyKeys({key: ''}), ['key']);
  });

  it('detects empty values in nested objects using dotted paths', () => {
    assert.deepStrictEqual(collectEmptyKeys({a: {b: ''}}), ['a.b']);
  });

  it('ignores non-empty values', () => {
    assert.deepStrictEqual(collectEmptyKeys({key: 'value'}), []);
  });

  it('handles mixed empty and non-empty values', () => {
    assert.deepStrictEqual(collectEmptyKeys({a: 'filled', b: '', c: {d: ''}}), ['b', 'c.d']);
  });
});