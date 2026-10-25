# @sw-lplk/config-manager

Lightweight hierarchical config loader for Node.js — per-environment sections, cross-references, `.env` loading, and `process.env` interpolation.

## Install

```bash
npm install github:SW-lplk/config-manager-pkg#v1.0.0
```

> Install from the GitHub repository at a version tag.

Node.js equivalent of [config-manager](https://github.com/lukaszplk/config-manager).

---

## Environment selection

`ConfigManager` reads `NODE_ENV` from `process.env` to pick which section of `config/config.json` to load.

- **`NODE_ENV` should always be set** — by Infisical, your CI/CD pipeline, or your shell before starting the process.
- Supported values: `development`, `staging`, `production`, `test` (must match a top-level key in `config.json`).
- If `NODE_ENV` is missing, a warning is printed to stderr and `development` is used as a fallback.
- To override programmatically, pass `section` explicitly:
  ```js
  new ConfigManager({ section: 'production' })
  ```

---

## Installation

```bash
npm install github:SW-lplk/config-manager-pkg#develop
# or local:
npm install file:../config-manager-pkg
```

---

## Folder Structure

Place a `config/` folder anywhere in your project (or a parent directory):

```
your-project/
  config/
    config.json   ← main config file
    .env          ← loaded automatically (does NOT overwrite existing env vars)
  src/
    index.js
```

---

## `config/config.json` Example

```json
{
  "_globals": {
    "appName": "My App",
    "apiVersion": "v1"
  },
  "development": {
    "server": { "port": 3001 },
    "frontend": { "url": "http://localhost:3000" },
    "db": { "host": "localhost", "name": "myapp_dev" },
    "label": "{{appName}} (dev)"
  },
  "production": {
    "server": { "port": 3001 },
    "frontend": { "url": "${FRONTEND_URL}" },
    "db": { "host": "${DB_HOST}", "name": "myapp_prod" },
    "label": "{{appName}} (prod)"
  },
  "test": {
    "server": { "port": 9999 }
  }
}
```

---

## Usage

```js
const ConfigManager = require('@sw-lplk/config-manager');

// Walks up from __dirname to find config/config.json
// Section defaults to process.env.NODE_ENV || 'development'
const config = new ConfigManager({ startDir: __dirname });

// Attribute-style access (top-level keys only)
console.log(config.server);        // { port: 3001 }
console.log(config.appName);       // "My App"  (from _globals)

// Dot-path access with optional default
console.log(config.get('server.port'));          // 3001
console.log(config.get('missing.key', 'N/A'));   // "N/A"

// Force a specific section
const prodConfig = new ConfigManager({ section: 'production', startDir: __dirname });
```

---

## Features

| Feature | Syntax | Description |
|---|---|---|
| Per-env sections | `"development": { ... }` | Active section set by `NODE_ENV` |
| Globals | `"_globals": { ... }` | Merged into every section |
| Cross-references | `{{appName}}` or `{{development.db.host}}` | Resolved at load time |
| Env interpolation | `${ENV_VAR}` | Replaced with `process.env.ENV_VAR` |
| `.env` loading | `config/.env` | Loaded without overwriting existing vars |
| Dot-path get | `.get('server.port', 3000)` | Deep access with fallback default |

---

## Constructor Options

| Option | Type | Default | Description |
|---|---|---|---|
| `section` | `string` | `process.env.NODE_ENV \|\| 'development'` | Config section to use |
| `startDir` | `string` | `require.main` directory | Starting directory for `config/config.json` search |
| `logger` | `object` | `null` | Optional logger with `.debug()` method |

---

## License

MIT

