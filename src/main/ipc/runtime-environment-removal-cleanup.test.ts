import { describe, expect, it, vi } from 'vitest'

vi.mock('../browser/browser-route-partition-storage-runtime', () => ({
  clearBrowserRoutePartitionStorageForEnvironment: vi.fn()
}))
vi.mock('../browser/browser-route-partition-storage-retirement', () => ({
  retireBrowserRoutePartitionStorageForEnvironment: vi.fn(async () => undefined)
}))

const { retireRemovedRuntimeEnvironment } = await import('./runtime-environment-removal-cleanup')
const { isRuntimeEnvironmentManuallyDisconnected, syncRuntimeEnvironmentDisabledIds } =
  await import('./runtime-environment-manual-disconnect')

describe('retiring a removed runtime environment', () => {
  it('forgets the server’s workspace session partition under its runtime host id', async () => {
    const forgetHostSession = vi.fn()
    await retireRemovedRuntimeEnvironment('env 1', vi.fn(), forgetHostSession)
    expect(forgetHostSession).toHaveBeenCalledWith('runtime:env%201')
  })

  it('forgets a removed server’s disabled gate', async () => {
    syncRuntimeEnvironmentDisabledIds(['env-disabled'])
    await retireRemovedRuntimeEnvironment('env-disabled', vi.fn())
    expect(isRuntimeEnvironmentManuallyDisconnected('env-disabled')).toBe(false)
  })
})
