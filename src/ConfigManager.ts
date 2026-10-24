import fs from 'node:fs'
import path from 'node:path'

type ConfigValue = string | number | boolean | null | ConfigValue[] | { [key: string]: ConfigValue }
type ConfigData = { [key: string]: ConfigValue }

class ConfigManager {
  [key: string]: unknown

  private _logger: ConfigManager.ConfigLogger | null
  private _startDir: string
  private _configPath: string
  private _raw: Record<string, ConfigData>
  private _data: ConfigData
  section: string

  constructor({ section, startDir, logger }: ConfigManager.ConfigManagerOptions = {}) {
    this._logger = logger ?? null
    this._startDir = startDir ?? path.dirname(require.main ? require.main.filename : process.cwd())
    this._configPath = this._findConfig(this._startDir)
    this._raw = JSON.parse(fs.readFileSync(this._configPath, 'utf8')) as Record<string, ConfigData>

    this._loadDotEnv(path.dirname(this._configPath))

    if (!section && !process.env['NODE_ENV']) {
      process.stderr.write(
        '[ConfigManager] WARNING: NODE_ENV is not set. Defaulting to "development". ' +
          'Set NODE_ENV to one of: development, staging, production, test.\n',
      )
    }
    this.section = section ?? process.env['NODE_ENV'] ?? 'development'
    this._log(`Config: ${this._configPath} | Section: ${this.section}`)

    const globals = this._raw['_globals'] ?? {}
    const sectionData = this._raw[this.section] ?? {}
    const merged = this._deepMerge({}, globals, sectionData)

    const missingEnvVars = this._findMissingEnvVars(merged)
    if (missingEnvVars.length) {
      throw new Error(
        `ConfigManager: Missing required environment variables for section "${this.section}":\n` +
          missingEnvVars.map((name) => `  - ${name}`).join('\n') +
          '\nSet these variables in the runtime environment or config/.env.',
      )
    }

    this._data = this._resolveAll(merged, merged, globals) as ConfigData
    this._bindAttributes()
  }

  private _findConfig(startDir: string): string {
    let dir = startDir
    for (let i = 0; i < 10; i++) {
      const candidate = path.join(dir, 'config', 'config.json')
      if (fs.existsSync(candidate)) return candidate
      const parent = path.dirname(dir)
      if (parent === dir) break
      dir = parent
    }
    throw new Error(`ConfigManager: config/config.json not found from ${startDir}`)
  }

  private _loadDotEnv(configDir: string): void {
    const envFile = path.join(configDir, '.env')
    if (!fs.existsSync(envFile)) return
    const lines = fs.readFileSync(envFile, 'utf8').split('\n')
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq === -1) continue
      const key = trimmed.slice(0, eq).trim()
      const val = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '')
      if (!(key in process.env)) process.env[key] = val
    }
  }

  private _deepMerge(target: ConfigData, ...sources: ConfigData[]): ConfigData {
    for (const src of sources) {
      for (const [k, v] of Object.entries(src)) {
        if (v && typeof v === 'object' && !Array.isArray(v)) {
          target[k] = this._deepMerge((target[k] as ConfigData) ?? {}, v as ConfigData)
        } else {
          target[k] = v
        }
      }
    }
    return target
  }

  private _findMissingEnvVars(value: unknown, missing: Set<string> = new Set()): string[] {
    if (typeof value === 'string') {
      for (const match of value.matchAll(/\$\{([^}]+)\}/g)) {
        const name = match[1]!.trim()
        if (process.env[name] === undefined) missing.add(name)
      }
    } else if (Array.isArray(value)) {
      for (const item of value) this._findMissingEnvVars(item, missing)
    } else if (value && typeof value === 'object') {
      for (const item of Object.values(value)) this._findMissingEnvVars(item, missing)
    }
    return [...missing].sort()
  }

  private _resolveAll(obj: unknown, sectionData: ConfigData, globals: ConfigData): unknown {
    if (typeof obj === 'string') return this._interpolate(obj, sectionData, globals)
    if (Array.isArray(obj)) return obj.map((v) => this._resolveAll(v, sectionData, globals))
    if (obj && typeof obj === 'object') {
      return Object.fromEntries(
        Object.entries(obj).map(([k, v]) => [k, this._resolveAll(v, sectionData, globals)]),
      )
    }
    return obj
  }

  private _interpolate(str: string, sectionData: ConfigData, globals: ConfigData): string {
    str = str.replace(/\{\{([^}]+)\}\}/g, (_, ref: string) => {
      const parts = ref.trim().split('.')
      let val: unknown
      if (parts.length === 1) {
        val = globals[parts[0]!]
        if (val === undefined) throw new Error(`ConfigManager: {{${ref}}} not found in _globals`)
      } else {
        const [sec, ...rest] = parts
        let node: unknown = this._raw[sec!] ?? {}
        for (const p of rest) {
          node = node && typeof node === 'object' ? (node as Record<string, unknown>)[p!] : undefined
        }
        if (node === undefined) {
          node = sectionData
          for (const p of parts) {
            node = node && typeof node === 'object' ? (node as Record<string, unknown>)[p!] : undefined
          }
        }
        if (node === undefined) throw new Error(`ConfigManager: {{${ref}}} could not be resolved`)
        val = node
      }
      return String(val)
    })
    str = str.replace(/\$\{([^}]+)\}/g, (_, varName: string) => {
      const val = process.env[varName.trim()]
      if (val === undefined) throw new Error(`ConfigManager: \${${varName}} not found in env`)
      return val
    })
    return str
  }

  private _bindAttributes(): void {
    for (const [k, v] of Object.entries(this._data)) {
      if (!(k in this)) this[k] = v
    }
  }

  get(key: string, defaultVal?: unknown): unknown {
    const parts = key.split('.')
    let node: unknown = this._data
    for (const p of parts) {
      if (node === undefined || node === null) return defaultVal
      node = (node as Record<string, unknown>)[p]!
    }
    return node !== undefined ? node : defaultVal
  }

  private _log(msg: string): void {
    if (this._logger) this._logger.debug(`ConfigManager: ${msg}`)
  }
}

// eslint-disable-next-line @typescript-eslint/no-namespace
namespace ConfigManager {
  export interface ConfigLogger {
    debug(message: string): void
  }

  export interface ConfigManagerOptions {
    section?: string
    startDir?: string
    logger?: ConfigLogger
  }
}

export = ConfigManager
