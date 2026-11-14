import { useMemo } from 'react'
import { BufferGeometry, Float32BufferAttribute } from 'three'
import type { ThreeEvent } from '@react-three/fiber'
import { Edges } from '@react-three/drei'
import { useStore } from '../store'
import { wallFootprints, type Footprint } from '../model/wallGeometry'
import { prismData } from '../model/wallMesh'
import type { Material } from '../model/materials'
import { Surface } from './Surface'

const MAX_CLICK_DRAG_PX = 4

/** Extruded walls. Geometry and materials are rebuilt from the wall data whenever it changes. */
export function Walls() {
  const walls = useStore((s) => s.walls)
  const selectedWallId = useStore((s) => s.selectedWallId)
  const selectable = useStore((s) => s.tool === 'none')
  const selectWall = useStore((s) => s.selectWall)
  const footprints = useMemo(() => wallFootprints(walls), [walls])

  return (
    <group>
      {walls.map((w) => (
        <WallMesh
          key={w.id}
          footprint={footprints.get(w.id)!}
          height={w.height}
          material={w.material}
          selected={w.id === selectedWallId}
          onSelect={selectable ? () => selectWall(w.id) : undefined}
        />
      ))}
    </group>
  )
}

interface WallMeshProps {
  footprint: Footprint
  height: number
  material: Material
  selected: boolean
  onSelect?: () => void
}

function WallMesh({ footprint, height, material, selected, onSelect }: WallMeshProps) {
  const geometry = useMemo(() => {
    const { positions, uvs } = prismData(footprint, height)
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(positions, 3))
    g.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
    g.computeVertexNormals()
    return g
  }, [footprint, height])
  const onClick = onSelect
    ? (e: ThreeEvent<MouseEvent>) => {
        if (e.delta > MAX_CLICK_DRAG_PX) return
        e.stopPropagation()
        onSelect()
      }
    : undefined

  return (
    <mesh geometry={geometry} castShadow receiveShadow onClick={onClick}>
      <Surface material={material} />
      {/* The selection outline leaves the surface colour untouched, so materials can be judged. */}
      {selected && <Edges color="#36c5f0" lineWidth={3} threshold={15} />}
    </mesh>
  )
}
