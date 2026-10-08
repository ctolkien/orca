import { describe, expect, it, vi } from 'vitest'

const {
  callMock,
  runtimeClientConstructorMock,
  serveOrcaAppMock,
  getDefaultUserDataPathMock,
  addEnvironmentFromPairingCodeMock,
  listEnvironmentsMock,
  resolveEnvironmentMock,
  setEnvironmentDisabledMock,
  activeRuntimeEnvironmentIdMock,
  spawnMock
} = vi.hoisted(() => ({
  callMock: vi.fn(),
  runtimeClientConstructorMock: vi.fn(),
  serveOrcaAppMock: vi.fn(),
  getDefaultUserDataPathMock: vi.fn(() => '/tmp/orca-user-data'),
  addEnvironmentFromPairingCodeMock: vi.fn(),
  listEnvironmentsMock: vi.fn(),
  resolveEnvironmentMock: vi.fn(),
  setEnvironmentDisabledMock: vi.fn(),
  activeRuntimeEnvironmentIdMock: vi.fn(),
  spawnMock: vi.fn()
}))

vi.mock('./runtime-client', async () => {
  const { createRuntimeClientModuleMock } = await import('./index-test-harness.js')
  return createRuntimeClientModuleMock({
    callMock,
    runtimeClientConstructorMock,
    serveOrcaAppMock,
    getDefaultUserDataPathMock
  })
})

vi.mock('./runtime/environments', () => ({
  addEnvironmentFromPairingCode: addEnvironmentFromPairingCodeMock,
  listEnvironments: listEnvironmentsMock,
  removeEnvironment: vi.fn(),
  resolveEnvironment: resolveEnvironmentMock,
  setEnvironmentDisabled: setEnvironmentDisabledMock
}))

vi.mock('./profile-state-location', () => ({
  getActiveProfileStateLocation: () => undefined,
  legacyProfileStateLocation: () => ({
    dataFile: '/tmp/orca-user-data/orca-data.json',
    databaseFile: '/tmp/orca-user-data/profile-state.db',
    profileId: 'default'
  })
}))

vi.mock('../main/persistence/profile-state/profile-state-access', () => ({
  acquireProfileStateRuntimeAdmission: () => ({ release: () => {} })
}))

vi.mock('../main/persistence/profile-state/profile-state-offline-settings', () => ({
  readActiveRuntimeEnvironmentIdFromProfileState: activeRuntimeEnvironmentIdMock
}))

vi.mock('child_process', async () => {
  const { createChildProcessModuleMock } = await import('./index-test-harness.js')
  return createChildProcessModuleMock(spawnMock)
})

import { main } from './index'
import { useWorktreeAwarenessEnvironment } from './index-test-harness'

describe('orca cli worktree awareness', () => {
  useWorktreeAwarenessEnvironment({
    callMock,
    serveOrcaAppMock,
    getDefaultUserDataPathMock,
    addEnvironmentFromPairingCodeMock,
    listEnvironmentsMock,
    spawnMock
  })

  it('lists saved environments even when ORCA_ENVIRONMENT is set', async () => {
    process.env.ORCA_ENVIRONMENT = 'stale-env'
    listEnvironmentsMock.mockReturnValue([addEnvironmentFromPairingCodeMock()])
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await main(['environment', 'list', '--json'], '/tmp/repo')

    expect(listEnvironmentsMock).toHaveBeenCalledWith('/tmp/orca-user-data')
    expect(callMock).not.toHaveBeenCalled()
    expect(logSpy.mock.calls[0]?.[0]).not.toContain('token')
    expect(logSpy.mock.calls[0]?.[0]).not.toContain('publicKeyB64')
  })

  it('adds saved environments even when ORCA_ENVIRONMENT is set', async () => {
    process.env.ORCA_ENVIRONMENT = 'stale-env'
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await main(
      ['environment', 'add', '--name', 'desk', '--pairing-code', 'orca://pair#abc', '--json'],
      '/tmp/repo'
    )

    expect(addEnvironmentFromPairingCodeMock).toHaveBeenCalledWith('/tmp/orca-user-data', {
      name: 'desk',
      pairingCode: 'orca://pair#abc'
    })
    expect(callMock).not.toHaveBeenCalled()
    expect(logSpy.mock.calls[0]?.[0]).not.toContain('token')
    expect(logSpy.mock.calls[0]?.[0]).not.toContain('publicKeyB64')
  })
  describe('host disable and enable', () => {
    const laptop = {
      id: 'env-laptop',
      name: 'laptop',
      createdAt: 1,
      updatedAt: 1,
      lastUsedAt: null,
      runtimeId: null,
      endpoints: [
        {
          id: 'ws-laptop',
          kind: 'websocket',
          label: 'WebSocket',
          endpoint: 'ws://127.0.0.1:6768',
          deviceToken: 'token',
          publicKeyB64: 'pk'
        }
      ],
      preferredEndpointId: 'ws-laptop'
    }

    function arrange(activeId: string | null): ReturnType<typeof vi.spyOn> {
      resolveEnvironmentMock.mockReset().mockReturnValue(laptop)
      setEnvironmentDisabledMock
        .mockReset()
        .mockImplementation((_path: string, _selector: string, disabled: boolean) =>
          disabled ? { ...laptop, disabled: true } : laptop
        )
      activeRuntimeEnvironmentIdMock.mockReset().mockReturnValue(activeId)
      return vi.spyOn(console, 'log').mockImplementation(() => {})
    }

    it('disables a paired server locally by name, even when ORCA_ENVIRONMENT is set', async () => {
      process.env.ORCA_ENVIRONMENT = 'stale-env'
      const logSpy = arrange(null)

      await main(['host', 'disable', 'laptop', '--json'], '/tmp/repo')

      expect(resolveEnvironmentMock).toHaveBeenCalledWith('/tmp/orca-user-data', 'laptop')
      expect(setEnvironmentDisabledMock).toHaveBeenCalledWith(
        '/tmp/orca-user-data',
        'env-laptop',
        true
      )
      expect(callMock).not.toHaveBeenCalled()
      const printed = JSON.parse(String(logSpy.mock.calls[0]?.[0]))
      expect(printed.result.environment).toMatchObject({ id: 'env-laptop', disabled: true })
      expect(String(logSpy.mock.calls[0]?.[0])).not.toContain('token')
    })

    it('enables a disabled paired server', async () => {
      const logSpy = arrange(null)

      await main(['host', 'enable', 'laptop'], '/tmp/repo')

      expect(setEnvironmentDisabledMock).toHaveBeenCalledWith(
        '/tmp/orca-user-data',
        'env-laptop',
        false
      )
      expect(logSpy.mock.calls[0]?.[0]).toBe('Enabled laptop (env-laptop).')
    })

    it('refuses to disable the Active Server', async () => {
      const logSpy = arrange('env-laptop')

      await main(['host', 'disable', 'laptop', '--json'], '/tmp/repo')

      const printed = JSON.parse(String(logSpy.mock.calls[0]?.[0]))
      expect(printed.ok).toBe(false)
      expect(printed.error.message).toContain('is the Active Server')
      expect(setEnvironmentDisabledMock).not.toHaveBeenCalled()
      process.exitCode = 0
    })
  })
})
