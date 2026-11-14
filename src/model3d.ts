// Reading imported 3D model files with three.js loaders.

import { Box3, type Object3D } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { modelFormat, type ModelFormat, type Size3 } from './model/objects'

/** Parse a model from a blob: or data: URL. */
export async function loadModel(url: string, format: ModelFormat): Promise<Object3D> {
  const response = await fetch(url)
  if (format === 'obj') return new OBJLoader().parse(await response.text())
  // No base path: a .gltf that points to separate files fails here rather than fetching them.
  return (await new GLTFLoader().parseAsync(await response.arrayBuffer(), '')).scene
}

/** The model's bounding box, and its size along our width (x), height (y) and depth (z). */
export function measureModel(object: Object3D): { box: Box3; size: Size3 } | null {
  const box = new Box3().setFromObject(object)
  if (box.isEmpty()) return null
  // A perfectly flat model still needs a thickness to scale by.
  const span = (min: number, max: number) => Math.max(max - min, 0.001)
  return {
    box,
    size: { width: span(box.min.x, box.max.x), height: span(box.min.y, box.max.y), depth: span(box.min.z, box.max.z) },
  }
}

const parsed = new Map<string, Promise<Object3D>>()

/** The parsed model for a URL, loaded once however many copies are placed. */
export function modelFor(url: string, format: ModelFormat): Promise<Object3D> {
  let promise = parsed.get(url)
  if (!promise) parsed.set(url, (promise = loadModel(url, format)))
  return promise
}

/**
 * Check that a file is a model we can draw, and measure it.
 * Throws an Error with a message fit to show the user.
 */
export async function inspectModelFile(file: File): Promise<{ url: string; format: ModelFormat; naturalSize: Size3 }> {
  const format = modelFormat(file.name)
  if (!format) throw new Error(`"${file.name}" isn't a model file Monarch reads. Use .glb, .gltf or .obj.`)
  const url = URL.createObjectURL(file)
  try {
    const measured = measureModel(await loadModel(url, format))
    if (!measured) throw new Error(`"${file.name}" has no visible geometry.`)
    return { url, format, naturalSize: measured.size }
  } catch (err) {
    URL.revokeObjectURL(url)
    const detail = err instanceof Error ? err.message : ''
    if (detail.includes('no visible geometry')) throw err
    if (/draco|meshopt/i.test(detail)) {
      throw new Error(`"${file.name}" is compressed (Draco or Meshopt), which Monarch can't read. Export it without compression.`)
    }
    if (format === 'gltf') {
      throw new Error(`Couldn't read "${file.name}". A .gltf that comes with separate files won't load; export a single .glb instead.`)
    }
    throw new Error(`Couldn't read "${file.name}" as a ${format} model.`)
  }
}
