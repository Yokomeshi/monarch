import { Suspense, useMemo } from 'react'
import { useLoader } from '@react-three/fiber'
import { RepeatWrapping, SRGBColorSpace, TextureLoader, type Side } from 'three'
import { useStore } from '../store'
import type { Material } from '../model/materials'

interface Props {
  material: Material
  side?: Side
}

/** The three.js material for a wall, floor or ceiling. Expects the mesh's UVs to be in metres. */
export function Surface({ material, side }: Props) {
  const textureUrl = useStore((s) => (material.textureId ? s.textures[material.textureId]?.url : undefined))
  const plain = (
    <meshStandardMaterial color={material.color} roughness={material.roughness} metalness={material.metalness} side={side} />
  )
  if (!textureUrl) return plain
  // Show the plain colour while the photo loads.
  return (
    <Suspense fallback={plain}>
      <Textured material={material} textureUrl={textureUrl} side={side} />
    </Suspense>
  )
}

function Textured({ material, textureUrl, side }: Props & { textureUrl: string }) {
  const base = useLoader(TextureLoader, textureUrl)
  // UVs are in metres, so repeating every `tileSize` metres is a 1 / tileSize scale.
  // Cloned per surface: surfaces sharing a photo can have different tile sizes.
  const map = useMemo(() => {
    const t = base.clone()
    t.wrapS = t.wrapT = RepeatWrapping
    t.colorSpace = SRGBColorSpace
    t.repeat.set(1 / material.tileSize, 1 / material.tileSize)
    t.needsUpdate = true
    return t
  }, [base, material.tileSize])

  return (
    <meshStandardMaterial
      key={map.uuid}
      map={map}
      color={material.color}
      roughness={material.roughness}
      metalness={material.metalness}
      side={side}
    />
  )
}
