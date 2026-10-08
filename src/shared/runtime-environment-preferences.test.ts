import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  getRuntimeEnvironmentPreferencesPath,
  isRuntimeEnvironmentDisabledInPreferences,
  readRuntimeEnvironmentPreferences,
  writeRuntimeEnvironmentDisabledPreference
} from './runtime-environment-preferences'

describe('runtime environment preferences', () => {
  const tempDirs: string[] = []
  const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')

  beforeEach(() => {
    // Why: secure-file tests cover Windows ACLs; this suite covers the file's content.
    Object.defineProperty(process, 'platform', { configurable: true, value: 'linux' })
  })

  afterEach(() => {
    if (originalPlatform) {
      Object.defineProperty(process, 'platform', originalPlatform)
    }
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  function tempUserData(): string {
    const dir = mkdtempSync(join(tmpdir(), 'orca-runtime-env-prefs-'))
    tempDirs.push(dir)
    return dir
  }

  it('reads a missing file as no preferences and does not create one for a no-op', () => {
    const userDataPath = tempUserData()

    expect(readRuntimeEnvironmentPreferences(userDataPath)).toEqual({ version: 1, entries: {} })
    writeRuntimeEnvironmentDisabledPreference(userDataPath, ['env-1'], 'env-1', false)
    expect(() => readFileSync(getRuntimeEnvironmentPreferencesPath(userDataPath))).toThrow()
  })

  it('reads a corrupt file as no preferences and replaces it on the next write', () => {
    const userDataPath = tempUserData()
    writeFileSync(getRuntimeEnvironmentPreferencesPath(userDataPath), '{not json')

    expect(isRuntimeEnvironmentDisabledInPreferences(userDataPath, 'env-1')).toBe(false)
    writeRuntimeEnvironmentDisabledPreference(userDataPath, ['env-1'], 'env-1', true)
    expect(isRuntimeEnvironmentDisabledInPreferences(userDataPath, 'env-1')).toBe(true)
  })

  it('ignores malformed entries without hiding valid ones', () => {
    const userDataPath = tempUserData()
    writeFileSync(
      getRuntimeEnvironmentPreferencesPath(userDataPath),
      JSON.stringify({
        version: 1,
        entries: { good: { disabled: true, futureField: 1 }, bad: { disabled: 'yes' }, off: {} }
      })
    )

    expect(readRuntimeEnvironmentPreferences(userDataPath).entries).toEqual({
      good: { disabled: true }
    })
  })

  it('prunes entries for hosts that no longer exist', () => {
    const userDataPath = tempUserData()
    writeRuntimeEnvironmentDisabledPreference(userDataPath, ['a', 'b'], 'a', true)
    writeRuntimeEnvironmentDisabledPreference(userDataPath, ['a', 'b'], 'b', true)

    writeRuntimeEnvironmentDisabledPreference(userDataPath, ['b'], 'a', false)

    expect(readRuntimeEnvironmentPreferences(userDataPath).entries).toEqual({
      b: { disabled: true }
    })
  })
})
