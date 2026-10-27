'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

const ConfigManager = require('../dist/index')

function makeTempConfig(json) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-test-'))
  const configDir = path.join(dir, 'config')
  fs.mkdirSync(configDir)
  fs.writeFileSync(path.join(configDir, 'config.json'), JSON.stringify(json), 'utf8')
  return dir
}

test('loads correct section based on NODE_ENV', () => {
  const dir = makeTempConfig({
    development: { server: { port: 3001 }, name: 'dev' },
    production:  { server: { port: 80 },   name: 'prod' },
  })
  const config = new ConfigManager({ section: 'development', startDir: dir })
  assert.equal(config.get('server.port'), 3001)
  assert.equal(config.get('name'), 'dev')
})

test('_globals are merged into section data', () => {
  const dir = makeTempConfig({
    _globals: { appName: 'TestApp', version: '2.0' },
    development: { server: { port: 4000 } },
  })
  const config = new ConfigManager({ section: 'development', startDir: dir })
  assert.equal(config.get('appName'), 'TestApp')
  assert.equal(config.get('version'), '2.0')
  assert.equal(config.get('server.port'), 4000)
})

test('_globals do not overwrite section keys', () => {
  const dir = makeTempConfig({
    _globals: { appName: 'GlobalName' },
    development: { appName: 'SectionName' },
  })
  const config = new ConfigManager({ section: 'development', startDir: dir })
  assert.equal(config.get('appName'), 'SectionName')
})

test('{{key}} references resolve from _globals', () => {
  const dir = makeTempConfig({
    _globals: { appName: 'MyApp' },
    development: { label: '{{appName}} development' },
  })
  const config = new ConfigManager({ section: 'development', startDir: dir })
  assert.equal(config.get('label'), 'MyApp development')
})

test('{{section.key}} cross-section references resolve', () => {
  const dir = makeTempConfig({
    _globals: {},
    development: { db: { host: 'localhost' }, connStr: 'host={{development.db.host}}' },
  })
  const config = new ConfigManager({ section: 'development', startDir: dir })
  assert.equal(config.get('connStr'), 'host=localhost')
})

test('.get() returns defaultVal when key is missing', () => {
  const dir = makeTempConfig({ development: { name: 'dev' } })
  const config = new ConfigManager({ section: 'development', startDir: dir })
  assert.equal(config.get('nonexistent', 'fallback'), 'fallback')
  assert.equal(config.get('deep.missing.key', 42), 42)
})

test('.get() returns value (not default) when key exists', () => {
  const dir = makeTempConfig({ development: { port: 0 } })
  const config = new ConfigManager({ section: 'development', startDir: dir })
  assert.equal(config.get('port', 9999), 0)
})

test('attribute-style access works for top-level keys', () => {
  const dir = makeTempConfig({ development: { server: { port: 7777 }, appName: 'Attr' } })
  const config = new ConfigManager({ section: 'development', startDir: dir })
  assert.deepEqual(config.server, { port: 7777 })
  assert.equal(config.appName, 'Attr')
})

test('throws when config/config.json is not found', () => {
  assert.throws(
    () => new ConfigManager({ startDir: os.tmpdir() + '/nonexistent-xyz-abc' }),
    /config\/config\.json not found/,
  )
})

test('${ENV_VAR} is interpolated from process.env', () => {
  process.env._CM_TEST_VAR = 'hello_from_env'
  const dir = makeTempConfig({ development: { greeting: '${_CM_TEST_VAR}' } })
  const config = new ConfigManager({ section: 'development', startDir: dir })
  assert.equal(config.get('greeting'), 'hello_from_env')
  delete process.env._CM_TEST_VAR
})

test('config/.env file is loaded without overwriting existing env vars', () => {
  const dir = makeTempConfig({ development: { val: '${_CM_DOT_ENV_VAR}' } })
  const envFile = path.join(dir, 'config', '.env')
  fs.writeFileSync(envFile, '_CM_DOT_ENV_VAR=from_dotenv\n', 'utf8')

  delete process.env._CM_DOT_ENV_VAR
  const config = new ConfigManager({ section: 'development', startDir: dir })
  assert.equal(config.get('val'), 'from_dotenv')

  process.env._CM_DOT_ENV_VAR = 'already_set'
  const config2 = new ConfigManager({ section: 'development', startDir: dir })
  assert.equal(config2.get('val'), 'already_set')

  delete process.env._CM_DOT_ENV_VAR
})

test('throws with all missing ${ENV_VAR} names when env vars are absent', () => {
  const dir = makeTempConfig({
    development: {
      a: '${_CM_MISSING_ONE}',
      nested: { b: '${_CM_MISSING_TWO}' },
    },
  })
  delete process.env._CM_MISSING_ONE
  delete process.env._CM_MISSING_TWO

  assert.throws(
    () => new ConfigManager({ section: 'development', startDir: dir }),
    (err) => {
      assert.ok(err.message.includes('_CM_MISSING_ONE'), 'should list first missing var')
      assert.ok(err.message.includes('_CM_MISSING_TWO'), 'should list second missing var')
      return true
    },
  )
})

test('does not throw when all referenced ${ENV_VAR}s are present', () => {
  process.env._CM_PRESENT_VAR = 'here'
  const dir = makeTempConfig({ development: { val: '${_CM_PRESENT_VAR}' } })
  assert.doesNotThrow(() => new ConfigManager({ section: 'development', startDir: dir }))
  delete process.env._CM_PRESENT_VAR
})
