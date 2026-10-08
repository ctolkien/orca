import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

export const ENVIRONMENT_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['host', 'name'],
    summary: 'Show or set the name this Orca runtime reports to connected clients',
    usage: 'orca host name [--name <name>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'name'],
    notes: [
      'With --name, updates the answering runtime over its authenticated connection. Use an empty value to return to the detected computer name.',
      'Without --name, prints the name and platform the answering runtime reports.'
    ],
    examples: ['orca host name', 'orca host name --name build-server']
  },
  {
    path: ['host', 'list'],
    summary: 'List every machine this Orca host can target, and how to name each one',
    usage: 'orca host list [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    notes: [
      'Answers "what can I target and what do I pass" in one place: this machine, the SSH targets registered on it, and the Orca servers paired with it.',
      'The three kinds are reached differently. A paired Orca server is a connection, selected with --environment <name>. An SSH target is a machine the connected Orca host reaches, selected with --host ssh:<id>. Passing one where the other belongs is the most common way to get an empty or missing-host answer.',
      'SSH rows include the detected remote platform after that target has connected (linux, darwin, or win32); disconnected or older targets report platform unknown.',
      'SSH rows also include whether the target is currently connected and its lifecycle status when known.',
      'Paired-server rows come from the pairing store and report platform unknown; ask one server directly with `orca host name --environment <name>`.',
      'A paired server turned off with `orca host disable` (or in Settings) is marked disabled, `disabled: true` in --json. Orca does not connect to it until it is enabled again.',
      "SSH targets are read from this machine's own Orca runtime, so this lists that machine's targets and not another server's. Run `orca host list` on the other machine to see the targets registered there.",
      '--environment and --pairing-code are rejected rather than ignored: paired servers come from this machine\u2019s pairing store, so a routed answer would describe two machines at once.'
    ],
    examples: ['orca host list', 'orca host list --json']
  },
  {
    path: ['host', 'disable'],
    summary: 'Stop Orca connecting to a paired server, without removing it',
    usage: 'orca host disable <selector> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'selector'],
    positionalArgs: ['selector'],
    notes: [
      'The selector is the paired server\u2019s name or id, as shown by `orca host list`.',
      'Disabled servers are never polled or dialed, and stay disabled across restarts and re-pairing. A running Orca app applies the change immediately.',
      'The Active Server cannot be disabled; choose another one in Settings first.',
      'Answers from this machine\u2019s pairing store, so --environment and --pairing-code are rejected.'
    ],
    examples: ['orca host disable laptop']
  },
  {
    path: ['host', 'enable'],
    summary: 'Let Orca connect to a disabled paired server again',
    usage: 'orca host enable <selector> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'selector'],
    positionalArgs: ['selector'],
    notes: [
      'The selector is the paired server\u2019s name or id, as shown by `orca host list`.',
      'A running Orca app reconnects to the server immediately.'
    ],
    examples: ['orca host enable laptop']
  },
  {
    path: ['environment', 'add'],
    summary: 'Save a remote Orca runtime environment from a pairing code',
    usage: 'orca environment add --name <name> --pairing-code <code> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'name'],
    examples: ['orca environment add --name work-laptop --pairing-code orca://pair?code=...']
  },
  {
    path: ['environment', 'list'],
    summary: 'List saved Orca runtime environments',
    usage: 'orca environment list [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    notes: [
      'Answers from this machine\u2019s pairing store. --environment and --pairing-code are rejected rather than ignored, because there is no other host that could answer.'
    ]
  },
  {
    path: ['environment', 'show'],
    summary: 'Show one saved Orca runtime environment',
    usage: 'orca environment show --environment <selector> [--json]',
    allowedFlags: [...GLOBAL_FLAGS]
  },
  {
    path: ['environment', 'rm'],
    destructive: true,
    summary: 'Remove one saved Orca runtime environment',
    usage: 'orca environment rm --environment <selector> [--json]',
    allowedFlags: [...GLOBAL_FLAGS]
  }
]
