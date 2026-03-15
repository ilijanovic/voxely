import { describe, expect, it } from 'vitest'
import { getCreatureDefsForBiome } from './entity-defs'

describe('entity-defs meadow spawn set', () => {
  it('keeps meadow focused on sheep + equine stand-in', () => {
    const kinds = getCreatureDefsForBiome('meadow').map(({ def }) => def.kind)

    expect(kinds).toContain('sheep')
    expect(kinds).toContain('horse')
    expect(kinds).not.toContain('pig')
    expect(kinds).not.toContain('cow')
    expect(kinds).not.toContain('chicken')
  })
})
