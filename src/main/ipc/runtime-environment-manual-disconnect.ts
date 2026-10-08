import type { RuntimeRpcFailure } from '../../shared/runtime-rpc-envelope'

const manuallyDisconnectedEnvironmentIds = new Set<string>()
// Mirrors orca-environment-preferences.json so hot request paths never read the file.
const disabledEnvironmentIds = new Set<string>()

export const RUNTIME_MANUALLY_DISCONNECTED_MESSAGE = 'Runtime environment is manually disconnected.'
export const RUNTIME_DISABLED_MESSAGE = 'Runtime environment is disabled. Enable it to connect.'

export function markRuntimeEnvironmentManuallyDisconnected(environmentId: string): void {
  manuallyDisconnectedEnvironmentIds.add(environmentId)
}

export function clearRuntimeEnvironmentManualDisconnect(environmentId: string): void {
  manuallyDisconnectedEnvironmentIds.delete(environmentId)
}

/** True for a session-only Disconnect and for a persisted Disable: either way, never dial. */
export function isRuntimeEnvironmentManuallyDisconnected(environmentId: string): boolean {
  return (
    manuallyDisconnectedEnvironmentIds.has(environmentId) ||
    disabledEnvironmentIds.has(environmentId)
  )
}

export function isRuntimeEnvironmentDisabled(environmentId: string): boolean {
  return disabledEnvironmentIds.has(environmentId)
}

/** For a removed host only; a live host leaves the set through syncRuntimeEnvironmentDisabledIds. */
export function forgetRuntimeEnvironmentDisabled(environmentId: string): void {
  disabledEnvironmentIds.delete(environmentId)
}

/** Replaces the disabled set; returns the ids whose state changed. */
export function syncRuntimeEnvironmentDisabledIds(ids: Iterable<string>): {
  disabled: string[]
  enabled: string[]
} {
  const next = new Set(ids)
  const disabled = [...next].filter((id) => !disabledEnvironmentIds.has(id))
  const enabled = [...disabledEnvironmentIds].filter((id) => !next.has(id))
  disabledEnvironmentIds.clear()
  for (const id of next) {
    disabledEnvironmentIds.add(id)
  }
  return { disabled, enabled }
}

export function runtimeEnvironmentInactiveError(environmentId: string): {
  code: 'runtime_disabled' | 'runtime_manually_disconnected'
  message: string
} {
  return disabledEnvironmentIds.has(environmentId)
    ? { code: 'runtime_disabled', message: RUNTIME_DISABLED_MESSAGE }
    : { code: 'runtime_manually_disconnected', message: RUNTIME_MANUALLY_DISCONNECTED_MESSAGE }
}

/** The no-network answer for a host that is disconnected or disabled; null when it may be dialed. */
export function runtimeEnvironmentInactiveFailure(
  environment: { id: string; runtimeId: string | null },
  method: string
): RuntimeRpcFailure | null {
  if (!isRuntimeEnvironmentManuallyDisconnected(environment.id)) {
    return null
  }
  return {
    id: method,
    ok: false,
    error: runtimeEnvironmentInactiveError(environment.id),
    _meta: { runtimeId: environment.runtimeId }
  }
}
