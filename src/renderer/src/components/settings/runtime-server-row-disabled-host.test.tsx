// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { PublicKnownRuntimeEnvironment } from '../../../../shared/runtime-environments'
import { useAppStore } from '@/store'
import { RuntimeServerRow } from './runtime-server-row'

const initialState = useAppStore.getInitialState()

const environment: PublicKnownRuntimeEnvironment = {
  id: 'env-laptop',
  name: 'Laptop',
  createdAt: 100,
  updatedAt: 100,
  pairingRevision: 1,
  lastUsedAt: null,
  runtimeId: null,
  endpoints: [{ id: 'ws-a', kind: 'websocket', label: 'WebSocket', endpoint: 'ws://x' }],
  preferredEndpointId: 'ws-a'
}

function renderRow(
  target: PublicKnownRuntimeEnvironment,
  onToggleDisabled = vi.fn(),
  onRemove = vi.fn()
): void {
  render(
    <RuntimeServerRow
      environment={target}
      details={undefined}
      isActive={false}
      remoteUpdate={undefined}
      remoteServerUpdatesRunning={false}
      connecting={false}
      switching={false}
      disconnecting={false}
      removing={false}
      togglingDisabled={false}
      isBusy={false}
      onOpenUpdate={vi.fn()}
      onDisconnect={vi.fn()}
      onConnect={vi.fn()}
      onRemove={onRemove}
      onToggleDisabled={onToggleDisabled}
    />
  )
}

beforeEach(() => {
  useAppStore.setState(initialState, true)
})

afterEach(() => {
  cleanup()
  useAppStore.setState(initialState, true)
})

it('shows a disabled host as Disabled with no Connect, but keeps Remove', () => {
  renderRow({ ...environment, disabled: true })

  expect(screen.queryByText('Disabled')).not.toBeNull()
  expect(screen.queryByText('Checking…')).toBeNull()
  expect(screen.queryByRole('button', { name: /^connect$/i })).toBeNull()
  expect(screen.queryByRole('button', { name: /disconnect/i })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Remove Laptop' })).not.toBeNull()
  expect(screen.getByRole('switch', { name: 'Laptop enabled' }).getAttribute('aria-checked')).toBe(
    'false'
  )
})

it('turns the switch off to disable and on to enable', () => {
  const onToggleDisabled = vi.fn()
  renderRow(environment, onToggleDisabled)
  fireEvent.click(screen.getByRole('switch', { name: 'Laptop enabled' }))
  expect(onToggleDisabled).toHaveBeenCalledWith(environment, true)
  cleanup()

  const disabled = { ...environment, disabled: true as const }
  renderRow(disabled, onToggleDisabled)
  fireEvent.click(screen.getByRole('switch', { name: 'Laptop enabled' }))
  expect(onToggleDisabled).toHaveBeenLastCalledWith(disabled, false)
})
