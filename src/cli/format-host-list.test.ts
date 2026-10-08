import { describe, expect, it } from 'vitest'
import { formatHostList } from './format'

describe('formatHostList', () => {
  it('marks a disabled paired server without reporting a connection for it', () => {
    const text = formatHostList({
      hosts: [
        { kind: 'environment', name: 'laptop', id: 'env-1', selector: '--environment laptop' },
        {
          kind: 'environment',
          name: 'asleep',
          id: 'env-2',
          selector: '--environment asleep',
          disabled: true
        }
      ]
    })
    const [enabled, disabled] = text.split('\n')
    expect(enabled).not.toContain('disabled')
    expect(disabled).toContain('disabled')
    expect(disabled).toContain('->  --environment asleep')
  })
})
