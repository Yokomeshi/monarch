import { describe, expect, it } from 'vitest'
import { applyPreset, DEFAULT_MATERIAL, matchingPreset, PRESETS } from './materials'

describe('materials', () => {
  it('the default material is the first preset', () => {
    expect(matchingPreset(DEFAULT_MATERIAL)).toBe(PRESETS[0])
  })

  it('applying a preset sets its values, removes any texture and keeps the tile size', () => {
    const textured = { ...DEFAULT_MATERIAL, textureId: 'abc', tileSize: 2 }
    const brick = PRESETS.find((p) => p.name === 'Brick')!
    const m = applyPreset(textured, brick)
    expect(m).toEqual({ color: brick.color, roughness: brick.roughness, metalness: brick.metalness, textureId: null, tileSize: 2 })
    expect(matchingPreset(m)).toBe(brick)
  })

  it('a customised or textured material matches no preset', () => {
    expect(matchingPreset({ ...DEFAULT_MATERIAL, roughness: 0.5 })).toBeUndefined()
    expect(matchingPreset({ ...DEFAULT_MATERIAL, textureId: 'abc' })).toBeUndefined()
  })

  it('preset values are valid PBR parameters', () => {
    for (const p of PRESETS) {
      expect(p.color).toMatch(/^#[0-9a-f]{6}$/)
      expect(p.roughness).toBeGreaterThanOrEqual(0)
      expect(p.roughness).toBeLessThanOrEqual(1)
      expect(p.metalness).toBeGreaterThanOrEqual(0)
      expect(p.metalness).toBeLessThanOrEqual(1)
    }
  })
})
