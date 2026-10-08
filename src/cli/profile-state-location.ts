import { join } from 'node:path'
import { getActiveProfileStateLocation as resolveActiveProfileStateLocation } from '../main/persistence/profile-state/profile-state-active-location'
import type { ProfileStateOfflineLocation } from '../main/persistence/profile-state/profile-state-offline-settings'
import { DEFAULT_LOCAL_ORCA_PROFILE_ID } from '../shared/orca-profiles'
import { RuntimeClientError, getDefaultUserDataPath } from './runtime-client'

export function getActiveProfileStateLocation(userDataPath = getDefaultUserDataPath()) {
  try {
    return resolveActiveProfileStateLocation(userDataPath)
  } catch (error) {
    throw new RuntimeClientError(
      'runtime_error',
      error instanceof Error ? error.message : String(error)
    )
  }
}

/** Where a profile predating the profile index keeps its state. */
export function legacyProfileStateLocation(
  userDataPath = getDefaultUserDataPath()
): ProfileStateOfflineLocation {
  return {
    dataFile: join(userDataPath, 'orca-data.json'),
    databaseFile: join(userDataPath, 'profile-state.db'),
    profileId: DEFAULT_LOCAL_ORCA_PROFILE_ID
  }
}
