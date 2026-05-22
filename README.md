# @geomatico/i18n-linter

A linter for [react-i18next](https://react.i18next.com/) projects that enforces translation completeness and consistency.

## What it does

This tool wraps [i18next-cli](https://github.com/felixmosh/i18next-cli) and adds two checks that i18next-cli does not cover:

| # | Check | Auto-fixable with `--write` |
|---|-------|-----------------------------|
| 1 | Every `t()` call uses a **literal string** argument (not a variable or template literal) | No |
| 2 | Every locale listed has a bundle file | Yes |
| 3 | Every key found in source code exists in all bundles | Yes |
| 4 | Every key in bundles is referenced in source code (no orphaned keys) | Yes |
| 5 | Bundle keys are sorted alphabetically at every level | Yes |
| 6 | Every bundle key has a **non-empty** translation value | No |

### Why check 1?

Static key extraction only works when `t()` receives a literal string. A dynamic argument like `t(myVar)` makes the key undetectable at build time, which silently breaks the completeness guarantee of checks 2–5. This linter flags those call sites with the exact file path and line number so they can be fixed:

```
Error: t() must be called with a literal string argument.

  src/components/Foo.tsx:12: const label = t(labelKey);
```

```tsx
// Before — dynamic key, linter flags this
const label = t(labelKey);

// After — static key, linter accepts this
const label = t('my.label.key');
```

### Why check 6?

i18next-cli adds missing keys with an empty string value as a placeholder. An empty translation renders as nothing in the UI, which is easy to miss. This linter catches those:

```
Empty translations in es.json (fill these in manually):
  📍 new.feature.title
  📍 new.feature.description
```

## Installation

```bash
npm install --save-dev @geomatico/i18n-linter
```

## Usage

```bash
# Lint only
npx i18n-linter --locales es,en --src src --output src/i18n/{{language}}.json

# Auto-fix: add missing keys, remove unused keys, sort alphabetically
npx i18n-linter --write --locales es,en --src src --output src/i18n/{{language}}.json
```

### Recommended `package.json` setup

```json
{
  "scripts": {
    "lint:i18n":     "i18n-linter --locales es,en --src src --output src/i18n/{{language}}.json",
    "lint:i18n-fix": "i18n-linter --write --locales es,en --src src --output src/i18n/{{language}}.json"
  }
}
```

## Options

| Option | Default | Description |
|--------|---------|-------------|
| `--locales <l1,l2,...>` | `es,en` | Comma-separated list of locale codes |
| `--src <dir>` | `src` | Directory to scan for `t()` calls |
| `--output <pattern>` | `src/i18n/{{language}}.json` | Bundle file path with `{{language}}` placeholder |
| `--write` | — | Auto-fix: add missing keys, remove unused keys, sort |

## Running tests

```bash
npm install
npm test
```