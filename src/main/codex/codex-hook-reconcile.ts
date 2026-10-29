import { withTimeout } from '../../shared/promise-timeout-fallback'
import { resolveCodexCommand } from '../codex-cli/command'
import {
  CODEX_HOOK_LAUNCH_WAIT_MS,
  readKnownCodexHookAnswer,
  resolveCodexHookAnswer,
  startCodexHookHashLookup
} from './codex-hook-hash-lookup'
import type { CodexHookAnswer } from './codex-hook-trust-derivation'
import { reconcileRealHomeCodexHookEntries } from './codex-real-home-hook-install'

type ReconcileConfig = {
  isEnabled: () => boolean
  /** Next native pane's CODEX_HOME; null for ~/.codex, throws while unknown. */
  resolveLaunchHome: () => string | null
}

type ReconcileRequest = {
  /** Only app start or explicit enablement may replace older builds' entries. */
  convertOlderForms?: boolean
  /** Force ~/.codex for launches such as resumes that bypass the selected home. */
  realHomeLaunch?: boolean
}

// CLI processes leave reconciliation to app main.
let config: ReconcileConfig | null = null
let running: Promise<void> | null = null
let rerun = false
// Retain conversion requests while hooks are off or another home is selected.
let convertRequested = false
// Consume launch requests on the next run; their launch proceeds even if reconciliation cannot.
let realHomeLaunchRequested = false

// Leave room in the launch's 3s budget to write stopgap approvals.
const ANSWER_WAIT_MS = 500
// Each run re-scans PATH synchronously (#35565); a session restore needs one recheck, not one per pane.
const SPAWN_RECONCILE_MIN_INTERVAL_MS = 10_000
let lastSpawnReconcileAt = Number.NEGATIVE_INFINITY
let trailingSpawnReconcile: ReturnType<typeof setTimeout> | null = null

/** Start app-main hash lookup and reconciliation after shell PATH hydration. */
export function startCodexHooks({
  pathReady: hydrating,
  ...appConfig
}: ReconcileConfig & { pathReady: Promise<unknown> }): void {
  const pathReady = hydrating.catch(() => {})
  startCodexHookHashLookup(pathReady)
  config = appConfig
  // Warm the hash cache before the first managed launch.
  void pathReady.then(() => (appConfig.isEnabled() ? resolveCodexHookAnswer() : undefined))
  // Early launches must join this run and wait for PATH hydration.
  void reconcileAfter(pathReady, { convertOlderForms: true })
}

/** Concurrent calls request another pass; reconciliation failures are logged. */
export function reconcileCodexHooks(request: ReconcileRequest = {}): Promise<void> {
  return reconcileAfter(Promise.resolve(), request)
}

function reconcileAfter(ready: Promise<unknown>, request: ReconcileRequest): Promise<void> {
  convertRequested ||= request.convertOlderForms === true
  realHomeLaunchRequested ||= request.realHomeLaunch === true
  if (running) {
    rerun = true
    return running
  }
  running = ready.then(runUntilSettled)
  return running
}

export function scheduleCodexHookReconcile(): void {
  // One run already reads after the spawn; coalesce calls from its multiple env builders.
  if (!config || running || trailingSpawnReconcile) {
    return
  }
  const waitMs = lastSpawnReconcileAt + SPAWN_RECONCILE_MIN_INTERVAL_MS - Date.now()
  if (waitMs > 0) {
    // Trailing run so a spawn inside the window is still rechecked; a busy run reruns rather than absorbing it.
    trailingSpawnReconcile = setTimeout(() => {
      trailingSpawnReconcile = null
      lastSpawnReconcileAt = Date.now()
      if (config) {
        void reconcileCodexHooks()
      }
    }, waitMs)
    trailingSpawnReconcile.unref?.()
    return
  }
  lastSpawnReconcileAt = Date.now()
  void reconcileCodexHooks()
}

/** Bound reconciliation waits so real-home launches can proceed. */
export function reconcileCodexHooksForLaunch(): Promise<void> {
  return withTimeout(
    reconcileCodexHooks({ realHomeLaunch: true }),
    CODEX_HOOK_LAUNCH_WAIT_MS,
    undefined
  )
}

/** Status follows the next native pane's home; CLI processes default to ~/.codex. */
export function resolveCodexHookStatusHome(): CodexHookHomeChoice {
  return resolveHome(config)
}

type CodexHookHomeChoice =
  | { kind: 'real' }
  | { kind: 'managed'; path: string }
  | { kind: 'unknown' }

// Status and reconciliation must agree on the active home.
function resolveHome(current: ReconcileConfig | null): CodexHookHomeChoice {
  if (!current) {
    return { kind: 'real' }
  }
  try {
    const path = current.resolveLaunchHome()
    return path === null ? { kind: 'real' } : { kind: 'managed', path }
  } catch {
    return { kind: 'unknown' }
  }
}

async function runUntilSettled(): Promise<void> {
  for (;;) {
    rerun = false
    const realHomeLaunch = realHomeLaunchRequested
    realHomeLaunchRequested = false
    try {
      await reconcileOnce(realHomeLaunch)
    } catch (error) {
      console.warn('[codex-hook-reconcile] Codex hook reconcile failed:', error)
    }
    // Clear running without yielding so new requests cannot join a finished run.
    if (!rerun) {
      running = null
      return
    }
  }
}

async function reconcileOnce(realHomeLaunch: boolean): Promise<void> {
  const current = config
  if (!current?.isEnabled() || !(realHomeLaunch || resolveHome(current).kind === 'real')) {
    return
  }
  // Runs start after PATH hydration; resolve once since each resolution is a sync PATH scan.
  const codexPath = resolveCodexCommand()
  const lookup = resolveCodexHookAnswer(codexPath)
  const live = await withTimeout<CodexHookAnswer | null>(lookup, ANSWER_WAIT_MS, null)
  if (!live) {
    // Replace stopgap approvals once Codex's answer arrives.
    void lookup.then(() => reconcileCodexHooks({ realHomeLaunch }))
  }
  // Reuse Codex's saved answer so a slow startup probe does not disturb existing hooks.
  const answer = live && live.kind !== 'pending' ? live : readKnownCodexHookAnswer(codexPath)
  if (answer?.kind === 'refused' || (answer?.kind === 'pending' && answer.codexMissing)) {
    return
  }
  const convertOlderForms = convertRequested
  convertRequested = false
  await reconcileRealHomeCodexHookEntries({
    hashes: answer?.kind === 'hashes' ? answer.hashes : null,
    isEnabled: () => current.isEnabled(),
    convertOlderForms
  })
}

export const _internals = {
  resetForTesting(): void {
    config = null
    running = null
    rerun = false
    convertRequested = false
    realHomeLaunchRequested = false
    lastSpawnReconcileAt = Number.NEGATIVE_INFINITY
    if (trailingSpawnReconcile) {
      clearTimeout(trailingSpawnReconcile)
      trailingSpawnReconcile = null
    }
  },
  async settledForTesting(): Promise<void> {
    while (running) {
      await running
    }
  }
}
