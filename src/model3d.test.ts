import { describe, expect, it } from 'vitest'
import { inspectModelFile, loadModel, measureModel } from './model3d'
import { blockGlb, crateObj } from './testModels'

describe('inspectModelFile', () => {
  it('reads a .glb and measures it in metres', async () => {
    const { format, naturalSize } = await inspectModelFile(blockGlb())
    expect(format).toBe('glb')
    expect(naturalSize.width).toBeCloseTo(1, 6)
    expect(naturalSize.height).toBeCloseTo(2, 6)
    expect(naturalSize.depth).toBeCloseTo(0.5, 6)
  })

  it('reads an .obj, wherever the model sits in its file', async () => {
    const { format, naturalSize, url } = await inspectModelFile(crateObj())
    expect(format).toBe('obj')
    expect(naturalSize).toEqual({ width: 2, height: 1, depth: 0.5 })
    // The crate is 10 units off-centre: the box says where, so it can be re-centred when drawn.
    const { box } = measureModel(await loadModel(url, 'obj'))!
    expect(box.min.x).toBe(9)
  })

  it('refuses a file of another type by its name', async () => {
    await expect(inspectModelFile(new File(['x'], 'photo.png'))).rejects.toThrow(/isn't a model file/)
  })

  it('refuses a .glb that is not really one', async () => {
    await expect(inspectModelFile(new File(['hello'], 'fake.glb'))).rejects.toThrow(/Couldn't read "fake.glb" as a glb model/)
  })

  it('refuses an .obj with no geometry', async () => {
    await expect(inspectModelFile(new File(['# just a comment\n'], 'empty.obj'))).rejects.toThrow(/no visible geometry/)
  })

  it('explains what to do about a .gltf that needs other files', async () => {
    const gltf = JSON.stringify({
      asset: { version: '2.0' },
      scene: 0,
      scenes: [{ nodes: [0] }],
      nodes: [{ mesh: 0 }],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
      buffers: [{ uri: 'missing.bin', byteLength: 36 }],
      bufferViews: [{ buffer: 0, byteLength: 36 }],
      accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3' }],
    })
    await expect(inspectModelFile(new File([gltf], 'scene.gltf'))).rejects.toThrow(/export a single \.glb/)
  })
})
