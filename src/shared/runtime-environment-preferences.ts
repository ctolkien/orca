import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import { writeSecureJsonFileWithinLimit } from './bounded-secure-json-file'
import { readNodeFileSyncWithinLimit } from './node-bounded-file-reader'
import { hardenExistingSecureFile } from './secure-file'

// Why a separate file: shipped builds strip unknown keys when they rewrite orca-environments.json,
// and sidecar entries are bound to a pairing, so a re-pair would drop a preference stored there.
const PREFERENCES_FILE = 'orca-environment-preferences.json'
const MAX_PREFERENCES_FILE_BYTES = 256 * 1024

const PreferenceEntrySchema = z.object({ disabled: z.literal(true).optional() })

// Tolerant: unknown keys survive a parse and one malformed entry never hides the others.
const PreferencesFileSchema = z.object({
  version: z.literal(1),
  entries: z.record(z.string(), z.unknown())
})

export type RuntimeEnvironmentPreferences = {
  version: 1
  entries: Record<string, z.infer<typeof PreferenceEntrySchema>>
}

export function getRuntimeEnvironmentPreferencesPath(userDataPath: string): string {
  return join(userDataPath, PREFERENCES_FILE)
}

/** A missing or unreadable file means no preferences: a preference never blocks using a host. */
export function readRuntimeEnvironmentPreferences(
  userDataPath: string
): RuntimeEnvironmentPreferences {
  const path = getRuntimeEnvironmentPreferencesPath(userDataPath)
  const empty: RuntimeEnvironmentPreferences = { version: 1, entries: {} }
  if (!existsSync(path)) {
    return empty
  }
  let parsed: z.infer<typeof PreferencesFileSchema>
  try {
    hardenExistingSecureFile(path)
    parsed = PreferencesFileSchema.parse(
      JSON.parse(
        readNodeFileSyncWithinLimit(path, MAX_PREFERENCES_FILE_BYTES).buffer.toString('utf8')
      )
    )
  } catch {
    return empty
  }
  const entries: RuntimeEnvironmentPreferences['entries'] = {}
  for (const [id, value] of Object.entries(parsed.entries)) {
    const entry = PreferenceEntrySchema.safeParse(value)
    if (id && entry.success && entry.data.disabled) {
      entries[id] = { disabled: true }
    }
  }
  return { version: 1, entries }
}

export function isRuntimeEnvironmentDisabledInPreferences(
  userDataPath: string,
  environmentId: string
): boolean {
  return readRuntimeEnvironmentPreferences(userDataPath).entries[environmentId]?.disabled === true
}

/**
 * Sets one environment's disabled flag. `liveEnvironmentIds` prunes entries for removed hosts so
 * the file cannot outgrow the store.
 */
export function writeRuntimeEnvironmentDisabledPreference(
  userDataPath: string,
  liveEnvironmentIds: readonly string[],
  environmentId: string,
  disabled: boolean
): void {
  const current = readRuntimeEnvironmentPreferences(userDataPath)
  const live = new Set(liveEnvironmentIds)
  const entries: RuntimeEnvironmentPreferences['entries'] = {}
  for (const [id, entry] of Object.entries(current.entries)) {
    if (id !== environmentId && live.has(id)) {
      entries[id] = entry
    }
  }
  if (disabled && live.has(environmentId)) {
    entries[environmentId] = { disabled: true }
  }
  const unchanged =
    Object.keys(entries).length === Object.keys(current.entries).length &&
    Object.keys(entries).every((id) => current.entries[id]?.disabled === entries[id]?.disabled)
  if (unchanged) {
    return
  }
  writeSecureJsonFileWithinLimit(
    getRuntimeEnvironmentPreferencesPath(userDataPath),
    { version: 1, entries },
    MAX_PREFERENCES_FILE_BYTES
  )
}
