import { describe, expect, it } from 'vitest'
import { renderRoonOrb } from './roon-orb'

describe('Roon orb', () => {
  it('renders explicit static and animated state hooks', () => {
    expect(renderRoonOrb('waiting', 16)).toContain('roon-orb--waiting')
    expect(renderRoonOrb('active', 20)).toContain('data-roon-orb-state="active"')
    expect(renderRoonOrb('complete', 24)).toContain('data-roon-orb-canvas')
  })

  it('keeps the rendered size within the supported range', () => {
    expect(renderRoonOrb('waiting', 2)).toContain('data-roon-orb-size="12"')
    expect(renderRoonOrb('complete', 200)).toContain('data-roon-orb-size="64"')
  })
})
