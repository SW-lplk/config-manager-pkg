/**
 * @sw-lplk/config-manager/env
 *
 * Lightweight process.env helpers shared across all SouthWay Next.js and
 * Node.js applications:
 *
 *   - loadEnvDefaults()    — loads config/.env and flattens config.json
 *                            _globals + section into process.env (non-destructive)
 *   - validateEnvironment() — validates env var presence and format
 *   - Validator factories:  validUrl, noTrailingSlash, minimumLength, oneOf,
 *                           portNumber, positiveInt
 */

import fs from 'node:fs'
import path from 'node:path'

// ── flatten ───────────────────────────────────────────────────────────────────

function flatten(obj: unknown, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {}
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return out
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      Object.assign(out, flatten(v, key))
    } else if (v !== null && v !== undefined) {
      out[key] = String(v)
    }
  }
  return out
}

// ── loadEnvDefaults ───────────────────────────────────────────────────────────

export interface LoadEnvDefaultsOptions {
  /**
   * Absolute path to the directory containing `config.json` and optionally `.env`.
   * E.g. `path.resolve(process.cwd(), '../../config')`
   */
  configDir: string
  /**
   * Map from `config.json` dot-path to the `process.env` key it populates.
   * E.g. `{ 'database.host': 'DB_HOST', 'email.provider': 'EMAIL_PROVIDER' }`
   */
  mapping: Record<string, string>
  /**
   * Active environment section name.
   * Defaults to `process.env.NODE_ENV ?? 'development'`.
   */
  env?: string
}

/**
 * Populate `process.env` with non-secret defaults from:
 *   1. `configDir/.env` — optional local secrets/overrides file
 *   2. `configDir/config.json` — structured config with `_globals` and per-env sections
 *
 * Existing `process.env` values (injected by CI, Infisical, or `.env.local`) always win;
 * this function only fills in missing values.
 */
export function loadEnvDefaults(options: LoadEnvDefaultsOptions): void {
  const { configDir, mapping, env } = options
  const envName = env ?? process.env['NODE_ENV'] ?? 'development'

  // Load config/.env
  const dotEnvPath = path.join(configDir, '.env')
  if (fs.existsSync(dotEnvPath)) {
    for (const line of fs.readFileSync(dotEnvPath, 'utf8').split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq === -1) continue
      const key = trimmed.slice(0, eq).trim()
      const val = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '')
      if (!(key in process.env)) process.env[key] = val
    }
  }

  // Load config/config.json
  const configJsonPath = path.join(configDir, 'config.json')
  if (!fs.existsSync(configJsonPath)) return
  let raw: Record<string, unknown>
  try {
    raw = JSON.parse(fs.readFileSync(configJsonPath, 'utf8')) as Record<string, unknown>
  } catch {
    return
  }

  const globals = (raw['_globals'] as Record<string, unknown>) ?? {}
  const section = (raw[envName] as Record<string, unknown>) ?? {}
  const flat = { ...flatten(globals), ...flatten(section) }

  for (const [dotKey, envKey] of Object.entries(mapping)) {
    const value = flat[dotKey]
    if (value !== undefined && !(envKey in process.env)) {
      process.env[envKey] = value
    }
  }
}

// ── validateEnvironment ───────────────────────────────────────────────────────

export type EnvRule = {
  key: string
  optional?: boolean
  validate?: (value: string) => string | null
}

/**
 * Validate `environment` against `rules`, returning the subset of valid values.
 * Throws an `Error` with a human-readable message when any required key is
 * missing or fails its validator.
 *
 * @param environment - usually `process.env` or a subset thereof
 * @param rules - array of `EnvRule` descriptors
 * @param scope - label used in the error message (e.g. `'server'`, `'public'`)
 */
export function validateEnvironment(
  environment: Record<string, string | undefined>,
  rules: readonly EnvRule[],
  scope: string,
): Record<string, string> {
  const values: Record<string, string> = {}
  const errors: string[] = []

  for (const rule of rules) {
    const value = environment[rule.key]?.trim()
    if (!value) {
      if (rule.optional) continue
      errors.push(`${rule.key}: missing`)
      continue
    }
    const validationError = rule.validate?.(value)
    if (validationError) {
      errors.push(`${rule.key}: ${validationError}`)
      continue
    }
    values[rule.key] = value
  }

  if (errors.length > 0) {
    throw new Error(`Invalid ${scope} environment:\n${errors.map(e => `- ${e}`).join('\n')}`)
  }

  return values
}

// ── Validator factories ───────────────────────────────────────────────────────

/** Accept a value that is a valid HTTP or HTTPS URL. */
export function validUrl(value: string): string | null {
  try {
    const url = new URL(value)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return 'must use http or https'
    return null
  } catch {
    return 'must be a valid URL'
  }
}

/** Accept a valid HTTP/HTTPS URL without a trailing slash. */
export function noTrailingSlash(value: string): string | null {
  const urlError = validUrl(value)
  if (urlError) return urlError
  return value.endsWith('/') ? 'must not end with a slash' : null
}

/** Accept a string of at least `length` characters. */
export function minimumLength(length: number) {
  return (value: string): string | null =>
    value.length >= length ? null : `must be at least ${length} characters`
}

/** Accept a string that is one of the provided allowed values. */
export function oneOf(...allowed: string[]) {
  const set = new Set(allowed)
  return (value: string): string | null =>
    set.has(value) ? null : `must be one of: ${allowed.join(', ')}`
}

/** Accept a string representing a TCP port number (1–65535). */
export function portNumber(value: string): string | null {
  const n = Number(value)
  return /^\d+$/.test(value) && n >= 1 && n <= 65535 ? null : 'must be an integer from 1 to 65535'
}

/** Accept a string representing a positive integer (≥1). */
export function positiveInt(value: string): string | null {
  const n = Number(value)
  return /^\d+$/.test(value) && n > 0 ? null : 'must be a positive integer'
}

/** Accept a string that is exactly `'true'` or `'false'`. */
export function booleanString(value: string): string | null {
  return value === 'true' || value === 'false' ? null : 'must be true or false'
}
