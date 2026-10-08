import { BrowserWindow } from 'electron'
import { listEnvironments } from '../../shared/runtime-environment-store'
import { RUNTIME_ENVIRONMENTS_CHANGED_CHANNEL } from '../../shared/runtime-host-status'
import {
  clearRuntimeEnvironmentManualDisconnect,
  isRuntimeEnvironmentManuallyDisconnected,
  syncRuntimeEnvironmentDisabledIds
} from './runtime-environment-manual-disconnect'
import {
  closeRemoteRuntimeRequestConnection,
  getRuntimeEnvironmentStatusOwner
} from './runtime-environment-request-connections'

export type InvalidateRuntimeEnvironmentTransport = (environmentId: string) => Promise<void> | void

/**
 * Brings the in-memory disabled gate in line with the preferences file: tears down newly disabled
 * hosts and reactivates newly enabled ones. Safe to call on any file change, including CLI writes.
 */
export function applyRuntimeEnvironmentDisabledPreferences(
  userDataPath: string,
  invalidateTransport: InvalidateRuntimeEnvironmentTransport
): { disabled: string[]; enabled: string[] } {
  const environments = listEnvironments(userDataPath)
  const changes = syncRuntimeEnvironmentDisabledIds(
    environments.filter((environment) => environment.disabled).map((environment) => environment.id)
  )
  const byId = new Map(environments.map((environment) => [environment.id, environment]))
  for (const id of changes.disabled) {
    void invalidateTransport(id)
    const name = byId.get(id)?.name
    // Legacy callers cached a connection under the name they selected the host by.
    if (name && name !== id) {
      closeRemoteRuntimeRequestConnection(name)
    }
    // Retain disconnected evidence for renderers that missed the teardown event.
    getRuntimeEnvironmentStatusOwner(userDataPath, id)
  }
  for (const id of changes.enabled) {
    // Enabling is a fresh start: a session Disconnect from before the Disable no longer applies.
    clearRuntimeEnvironmentManualDisconnect(id)
    if (byId.has(id) && !isRuntimeEnvironmentManuallyDisconnected(id)) {
      getRuntimeEnvironmentStatusOwner(userDataPath, id).activate()
    }
  }
  if (changes.disabled.length > 0 || changes.enabled.length > 0) {
    publishRuntimeEnvironmentsChanged()
  }
  return changes
}

export function publishRuntimeEnvironmentsChanged(): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) {
      continue
    }
    try {
      window.webContents.send(RUNTIME_ENVIRONMENTS_CHANGED_CHANNEL)
    } catch {
      // A renderer can disappear between isDestroyed() and send().
    }
  }
}
