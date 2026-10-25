'use strict'

const { describe, it, before, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

describe('env helpers (dist/env)', () => {
  let envModule

  before(() => {
    envModule = require('../dist/env')
  })

  // ── loadEnvDefaults ─────────────────────────────────────────────────────────

  describe('loadEnvDefaults', () => {
    let tmpDir

    afterEach(() => {
      if (tmpDir) {
        try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch {}
        tmpDir = undefined
      }
    })

    it('loads config.json _globals + env section into process.env without overwriting', () => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sw-env-test-'))
      fs.writeFileSync(path.join(tmpDir, 'config.json'), JSON.stringify({
        _globals: { 'email.provider': 'brevo' },
        development: { 'app.url': 'http://localhost:3000' },
      }), 'utf8')

      delete process.env.TEST_EMAIL_PROVIDER
      delete process.env.TEST_APP_URL

      envModule.loadEnvDefaults({
        configDir: tmpDir,
        mapping: {
          'email.provider': 'TEST_EMAIL_PROVIDER',
          'app.url': 'TEST_APP_URL',
        },
        env: 'development',
      })

      assert.equal(process.env.TEST_EMAIL_PROVIDER, 'brevo')
      assert.equal(process.env.TEST_APP_URL, 'http://localhost:3000')

      // Cleanup
      delete process.env.TEST_EMAIL_PROVIDER
      delete process.env.TEST_APP_URL
    })

    it('does not overwrite existing process.env values', () => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sw-env-test-'))
      fs.writeFileSync(path.join(tmpDir, 'config.json'), JSON.stringify({
        development: { 'app.url': 'http://from-config' },
      }), 'utf8')

      process.env.TEST_APP_URL_NO_OVERWRITE = 'http://already-set'
      envModule.loadEnvDefaults({
        configDir: tmpDir,
        mapping: { 'app.url': 'TEST_APP_URL_NO_OVERWRITE' },
        env: 'development',
      })
      assert.equal(process.env.TEST_APP_URL_NO_OVERWRITE, 'http://already-set')
      delete process.env.TEST_APP_URL_NO_OVERWRITE
    })

    it('silently skips missing config.json', () => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sw-env-test-'))
      // config.json does NOT exist
      assert.doesNotThrow(() => envModule.loadEnvDefaults({ configDir: tmpDir, mapping: {} }))
    })
  })

  // ── validateEnvironment ─────────────────────────────────────────────────────

  describe('validateEnvironment', () => {
    it('returns values for all present keys', () => {
      const env = { FOO: 'bar', BAZ: '42' }
      const result = envModule.validateEnvironment(env, [
        { key: 'FOO' },
        { key: 'BAZ' },
      ], 'test')
      assert.deepEqual(result, { FOO: 'bar', BAZ: '42' })
    })

    it('throws with all missing keys listed', () => {
      assert.throws(
        () => envModule.validateEnvironment({}, [{ key: 'REQUIRED_A' }, { key: 'REQUIRED_B' }], 'test'),
        /REQUIRED_A: missing/,
      )
    })

    it('omits optional missing keys without throwing', () => {
      const result = envModule.validateEnvironment({}, [{ key: 'OPTIONAL', optional: true }], 'test')
      assert.deepEqual(result, {})
    })

    it('throws for invalid values', () => {
      assert.throws(
        () => envModule.validateEnvironment({ PORT: 'not-a-number' }, [{ key: 'PORT', validate: envModule.portNumber }], 'test'),
        /PORT:/,
      )
    })
  })

  // ── Validator factories ─────────────────────────────────────────────────────

  describe('validUrl', () => {
    it('accepts http and https', () => {
      assert.equal(envModule.validUrl('https://example.com'), null)
      assert.equal(envModule.validUrl('http://localhost'), null)
    })
    it('rejects non-URLs', () => {
      assert.match(envModule.validUrl('not-a-url') ?? '', /valid URL/)
      assert.match(envModule.validUrl('ftp://example.com') ?? '', /http or https/)
    })
  })

  describe('noTrailingSlash', () => {
    it('rejects URLs ending in slash', () => {
      assert.match(envModule.noTrailingSlash('https://example.com/') ?? '', /slash/)
    })
    it('accepts URLs without trailing slash', () => {
      assert.equal(envModule.noTrailingSlash('https://example.com'), null)
    })
  })

  describe('minimumLength', () => {
    it('accepts values meeting the minimum', () => {
      assert.equal(envModule.minimumLength(5)('hello'), null)
    })
    it('rejects values below the minimum', () => {
      assert.match(envModule.minimumLength(10)('short') ?? '', /at least/)
    })
  })

  describe('portNumber', () => {
    it('accepts valid port numbers', () => {
      assert.equal(envModule.portNumber('3000'), null)
      assert.equal(envModule.portNumber('65535'), null)
    })
    it('rejects out-of-range values', () => {
      assert.match(envModule.portNumber('0') ?? '', /integer/)
      assert.match(envModule.portNumber('99999') ?? '', /integer/)
    })
  })

  describe('positiveInt', () => {
    it('accepts positive integers', () => assert.equal(envModule.positiveInt('1'), null))
    it('rejects zero and negatives', () => assert.match(envModule.positiveInt('0') ?? '', /positive/))
  })

  describe('oneOf', () => {
    it('accepts listed values', () => assert.equal(envModule.oneOf('a', 'b')('a'), null))
    it('rejects unlisted values', () => assert.match(envModule.oneOf('a', 'b')('c') ?? '', /one of/))
  })

  describe('booleanString', () => {
    it('accepts true and false', () => {
      assert.equal(envModule.booleanString('true'), null)
      assert.equal(envModule.booleanString('false'), null)
    })
    it('rejects anything else', () => {
      assert.match(envModule.booleanString('yes') ?? '', /true or false/)
    })
  })
})
