import { watch, type FSWatcher } from 'node:fs'
import { basename } from 'node:path'
import type { GlobalSettings } from '../../shared/global-settings-types'
import { getEnvironmentStorePath, listEnvironments } from '../../shared/runtime-environment-store'
import { getRuntimeEnvironmentPreferencesPath } from '../../shared/runtime-environment-preferences'
import type { Store } from '../persistence'
import {
  applyRuntimeEnvironmentDisabledPreferences,
  type InvalidateRuntimeEnvironmentTransport
} from './runtime-environment-disabled-state'

type PreferenceStore = Pick<Store, 'getSettings' | 'updateSettings'>

function reconcileRuntimeEnvironmentPreference(
  store: PreferenceStore,
  environments: readonly { id: string }[]
): GlobalSettings {
  const settings = store.getSettings()
  const activeId = settings?.activeRuntimeEnvironmentId?.trim()
  if (!activeId || environments.some((environment) => environment.id === activeId)) {
    return settings
  }
  // A deleted default must not keep routing unrelated requests to its retired pairing.
  return store.updateSettings({ activeRuntimeEnvironmentId: null }, { notifyListeners: true })
}

export function readSettingsWithRuntimeEnvironmentPreference(
  store: PreferenceStore,
  userDataPath: string
): GlobalSettings {
  const settings = store.getSettings()
  if (!settings?.activeRuntimeEnvironmentId?.trim()) {
    return settings
  }
  let environments: { id: string }[]
  try {
    // An unavailable registry cannot prove the selected host was removed.
    environments = listEnvironments(userDataPath, { requireStoreFile: true })
  } catch {
    return settings
  }
  return reconcileRuntimeEnvironmentPreference(store, environments)
}

export function watchRuntimeEnvironmentPreference(
  store: PreferenceStore,
  userDataPath: string,
  invalidateTransport?: InvalidateRuntimeEnvironmentTransport
): () => void {
  const registryName = basename(getEnvironmentStorePath(userDataPath))
  const preferencesName = basename(getRuntimeEnvironmentPreferencesPath(userDataPath))
  const repairPreference = (): void => {
    try {
      readSettingsWithRuntimeEnvironmentPreference(store, userDataPath)
    } catch (error) {
      console.warn('[runtime-environments] Active Server preference repair failed:', error)
    }
  }
  // The CLI writes the preferences file directly; apply its enable/disable to the running app.
  const applyDisabled = (): void => {
    if (!invalidateTransport) {
      return
    }
    try {
      applyRuntimeEnvironmentDisabledPreferences(userDataPath, invalidateTransport)
    } catch (error) {
      console.warn('[runtime-environments] disabled-host preference apply failed:', error)
    }
  }
  const reconcile = (): void => {
    repairPreference()
    applyDisabled()
  }
  // Reconcile changes made while the native watch was being installed.
  const initialCheck = setImmediate(reconcile)
  let watcher: FSWatcher | undefined
  try {
    // Watch the directory because registry writes atomically replace the file.
    watcher = watch(userDataPath, { persistent: false }, (_event, filename) => {
      const name = filename === null ? null : filename.toString()
      if (name === null) {
        reconcile()
      } else if (name === registryName) {
        repairPreference()
      } else if (name === preferencesName) {
        applyDisabled()
      }
    })
    watcher.on('error', (error) => {
      watcher?.close()
      console.warn('[runtime-environments] Active Server preference watch failed:', error)
    })
  } catch (error) {
    console.warn('[runtime-environments] Active Server preference watch failed:', error)
  }
  return () => {
    clearImmediate(initialCheck)
    watcher?.close()
  }
}
