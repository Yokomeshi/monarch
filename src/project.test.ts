import { describe, expect, it } from 'vitest'
import { parseProject, PROJECT_VERSION, usedTextureIds, type ProjectFile } from './project'
import { DEFAULT_MATERIAL } from './model/materials'
import { createWall, WALL_DEFAULTS } from './model/walls'

const IMG = 'data:image/png;base64,AAAA'
const p = (x: number, z: number) => ({ x, z })

function sample(): ProjectFile {
  const textured = { ...DEFAULT_MATERIAL, textureId: 'tex1', tileSize: 0.5, color: '#ffffff' }
  return {
    app: 'monarch',
    version: PROJECT_VERSION,
    units: 'imperial',
    plan: {
      name: 'plan.png',
      widthPx: 1000,
      heightPx: 800,
      metresPerPx: 0.006096,
      calibrated: true,
      calibrationLine: [{ x: 250, y: 400 }, { x: 750, y: 400 }],
      image: IMG,
    },
    walls: [
      createWall(p(0, 0), p(4, 0), { height: 3, thickness: 0.2, material: textured }),
      createWall(p(4, 0), p(4, 3)),
    ],
    wallDefaults: WALL_DEFAULTS,
    textures: { tex1: { name: 'tile.png', image: IMG } },
  }
}

const parse = (edit: (d: any) => void) => {
  const d = JSON.parse(JSON.stringify(sample()))
  edit(d)
  return () => parseProject(JSON.stringify(d))
}

describe('parseProject', () => {
  it('round-trips a full project unchanged', () => {
    const project = sample()
    expect(parseProject(JSON.stringify(project))).toEqual(project)
  })

  it('accepts a project with no plan, walls or textures', () => {
    const empty = { ...sample(), plan: null, walls: [], textures: {} }
    expect(parseProject(JSON.stringify(empty))).toEqual(empty)
  })

  it('rejects files that are not Monarch projects', () => {
    expect(() => parseProject('not json')).toThrow(/isn't valid JSON/)
    expect(() => parseProject('{"hello":1}')).toThrow(/isn't a Monarch project/)
    expect(() => parseProject('[]')).toThrow(/isn't a Monarch project/)
  })

  it('rejects a file from a newer format version', () => {
    expect(parse((d) => (d.version = PROJECT_VERSION + 1))).toThrow(/newer version/)
  })

  it.each([
    ['a non-numeric coordinate', (d: any) => (d.walls[0].start.x = 'left')],
    ['a missing wall end', (d: any) => delete d.walls[0].end],
    ['zero height', (d: any) => (d.walls[1].height = 0)],
    ['negative thickness', (d: any) => (d.walls[1].thickness = -0.1)],
    ['a bad colour', (d: any) => (d.walls[0].material.color = 'red')],
    ['roughness out of range', (d: any) => (d.walls[0].material.roughness = 2)],
    ['duplicate wall ids', (d: any) => (d.walls[1].id = d.walls[0].id)],
    ['unknown units', (d: any) => (d.units = 'cubits')],
    ['a plan image that is not an image', (d: any) => (d.plan.image = 'javascript:alert(1)')],
    ['a zero plan scale', (d: any) => (d.plan.metresPerPx = 0)],
    ['a texture that is not an image', (d: any) => (d.textures.tex1.image = 'https://example.com/x.png')],
  ])('rejects %s', (_name, edit) => {
    expect(parse(edit)).toThrow(/damaged/)
  })

  it('falls back to the plain colour when a texture is missing from the file', () => {
    const project = parse((d) => (d.textures = {}))()
    expect(project.walls[0].material.textureId).toBeNull()
    expect(project.walls[0].material.color).toBe('#ffffff')
  })
})

describe('usedTextureIds', () => {
  it('lists each referenced texture once, including the defaults', () => {
    const { walls } = sample()
    const defaults = { ...WALL_DEFAULTS, material: { ...DEFAULT_MATERIAL, textureId: 'tex2' } }
    expect(usedTextureIds([...walls, walls[0]], defaults).sort()).toEqual(['tex1', 'tex2'])
    expect(usedTextureIds([walls[1]], WALL_DEFAULTS)).toEqual([])
  })
})
