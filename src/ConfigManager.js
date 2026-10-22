'use strict';

const fs   = require('fs');
const path = require('path');

/**
 * Lightweight hierarchical config loader for Node.js pipelines.
 *
 * - Walks parent directories to find config/config.json
 * - Loads config/.env into process.env (without overwriting existing vars)
 * - Picks section by NODE_ENV (default: "development")
 * - Special "_globals" section merged into every section
 * - Resolves {{section.key.subkey}} cross-references
 * - Interpolates ${ENV_VAR} from process.env in string values
 * - Attribute-style access with .get(key, default)
 */
class ConfigManager {
  constructor({ section, startDir, logger } = {}) {
    this._logger = logger || null;
    this._startDir = startDir || path.dirname(require.main ? require.main.filename : process.cwd());
    this._configPath = this._findConfig(this._startDir);
    this._raw = JSON.parse(fs.readFileSync(this._configPath, 'utf8'));

    // Load .env from config/ dir (without overwriting)
    this._loadDotEnv(path.dirname(this._configPath));

    if (!section && !process.env.NODE_ENV) {
      process.stderr.write(
        '[ConfigManager] WARNING: NODE_ENV is not set. Defaulting to "development". ' +
        'Set NODE_ENV to one of: development, staging, production, test.\n'
      );
    }
    this.section = section || process.env.NODE_ENV || 'development';
    this._log(`Config: ${this._configPath} | Section: ${this.section}`);

    const globals = this._raw['_globals'] || {};
    const sectionData = this._raw[this.section] || {};
    const merged = this._deepMerge({}, globals, sectionData);

    const missingEnvVars = this._findMissingEnvVars(merged);
    if (missingEnvVars.length) {
      throw new Error(
        `ConfigManager: Missing required environment variables for section "${this.section}":\n` +
        missingEnvVars.map(name => `  - ${name}`).join('\n') +
        '\nSet these variables in the runtime environment or config/.env.'
      );
    }

    this._data = this._resolveAll(merged, merged, globals);
    this._bindAttributes();
  }

  _findConfig(startDir) {
    let dir = startDir;
    for (let i = 0; i < 10; i++) {
      const candidate = path.join(dir, 'config', 'config.json');
      if (fs.existsSync(candidate)) return candidate;
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
    throw new Error(`ConfigManager: config/config.json not found from ${startDir}`);
  }

  _loadDotEnv(configDir) {
    const envFile = path.join(configDir, '.env');
    if (!fs.existsSync(envFile)) return;
    const lines = fs.readFileSync(envFile, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '');
      if (!(key in process.env)) process.env[key] = val;
    }
  }

  _deepMerge(target, ...sources) {
    for (const src of sources) {
      for (const [k, v] of Object.entries(src)) {
        if (v && typeof v === 'object' && !Array.isArray(v)) {
          target[k] = this._deepMerge(target[k] || {}, v);
        } else {
          target[k] = v;
        }
      }
    }
    return target;
  }

  _findMissingEnvVars(value, missing = new Set()) {
    if (typeof value === 'string') {
      for (const match of value.matchAll(/\$\{([^}]+)\}/g)) {
        const name = match[1].trim();
        if (process.env[name] === undefined) missing.add(name);
      }
    } else if (Array.isArray(value)) {
      for (const item of value) this._findMissingEnvVars(item, missing);
    } else if (value && typeof value === 'object') {
      for (const item of Object.values(value)) this._findMissingEnvVars(item, missing);
    }
    return [...missing].sort();
  }

  _resolveAll(obj, sectionData, globals) {
    if (typeof obj === 'string') return this._interpolate(obj, sectionData, globals);
    if (Array.isArray(obj)) return obj.map(v => this._resolveAll(v, sectionData, globals));
    if (obj && typeof obj === 'object') {
      return Object.fromEntries(
        Object.entries(obj).map(([k, v]) => [k, this._resolveAll(v, sectionData, globals)])
      );
    }
    return obj;
  }

  _interpolate(str, sectionData, globals) {
    // Resolve {{section.key.subkey}} or {{key}} (from globals)
    str = str.replace(/\{\{([^}]+)\}\}/g, (_, ref) => {
      const parts = ref.trim().split('.');
      let val;
      if (parts.length === 1) {
        val = globals[parts[0]];
        if (val === undefined) throw new Error(`ConfigManager: {{${ref}}} not found in _globals`);
      } else {
        const [sec, ...rest] = parts;
        let node = this._raw[sec] || {};
        for (const p of rest) { node = node && node[p]; }
        if (node === undefined) {
          node = sectionData;
          for (const p of parts) { node = node && node[p]; }
        }
        if (node === undefined) throw new Error(`ConfigManager: {{${ref}}} could not be resolved`);
        val = node;
      }
      return String(val);
    });
    // Interpolate ${ENV_VAR}
    str = str.replace(/\$\{([^}]+)\}/g, (_, varName) => {
      const val = process.env[varName.trim()];
      if (val === undefined) throw new Error(`ConfigManager: \${${varName}} not found in env`);
      return val;
    });
    return str;
  }

  _bindAttributes() {
    for (const [k, v] of Object.entries(this._data)) {
      if (!(k in this)) this[k] = v;
    }
  }

  get(key, defaultVal) {
    const parts = key.split('.');
    let node = this._data;
    for (const p of parts) {
      if (node === undefined || node === null) return defaultVal;
      node = node[p];
    }
    return node !== undefined ? node : defaultVal;
  }

  _log(msg) {
    if (this._logger) this._logger.debug(`ConfigManager: ${msg}`);
  }
}

module.exports = ConfigManager;
