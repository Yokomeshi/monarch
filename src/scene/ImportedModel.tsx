import { Component, Suspense, use, useMemo, type ReactNode } from 'react'
import { MeshStandardMaterial, type Mesh } from 'three'
import { useStore } from '../store'
import { measureModel, modelFor } from '../model3d'
import type { ModelFormat, PlacedObject } from '../model/objects'

/** An imported model file, scaled to the object's size and standing centred on its spot. */
export function ImportedModel({ object }: { object: PlacedObject }) {
  const model = useStore((s) => (object.modelId ? s.models[object.modelId] : undefined))
  if (!model) return null
  const { width, depth, height } = object.size
  const placeholder = (
    <mesh position-y={height / 2}>
      <boxGeometry args={[width, height, depth]} />
      <meshStandardMaterial color="#8a93a0" transparent opacity={0.35} />
    </mesh>
  )
  return (
    // A box stands in while the file is parsed, and stays if it can't be.
    <ModelErrorBoundary key={model.url} fallback={placeholder}>
      <Suspense fallback={placeholder}>
        <Loaded object={object} url={model.url} format={model.format} />
      </Suspense>
    </ModelErrorBoundary>
  )
}

function Loaded({ object, url, format }: { object: PlacedObject; url: string; format: ModelFormat }) {
  const source = use(modelFor(url, format))
  const { color, roughness, metalness } = object.material
  // .obj files carry no materials, so they take the object's own. glTF files keep theirs.
  const ownMaterial = useMemo(
    () => (format === 'obj' ? new MeshStandardMaterial({ color, roughness, metalness }) : null),
    [format, color, roughness, metalness],
  )
  const { copy, box, natural } = useMemo(() => {
    const copy = source.clone(true) // each placed copy needs its own scene node
    const measured = measureModel(source)!
    return { copy, box: measured.box, natural: measured.size }
  }, [source])

  useMemo(() => {
    copy.traverse((node) => {
      const mesh = node as Mesh
      if (!mesh.isMesh) return
      mesh.castShadow = true
      mesh.receiveShadow = true
      if (ownMaterial) mesh.material = ownMaterial
    })
  }, [copy, ownMaterial])

  const sx = object.size.width / natural.width
  const sy = object.size.height / natural.height
  const sz = object.size.depth / natural.depth
  // Move the model so the middle of its base sits on the object's origin, wherever it was in its file.
  const cx = (box.min.x + box.max.x) / 2
  const cz = (box.min.z + box.max.z) / 2
  return (
    <group position={[-cx * sx, -box.min.y * sy, -cz * sz]} scale={[sx, sy, sz]}>
      <primitive object={copy} />
    </group>
  )
}

class ModelErrorBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}
