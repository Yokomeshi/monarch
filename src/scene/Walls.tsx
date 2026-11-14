import { useMemo } from 'react'
import { BufferGeometry, Float32BufferAttribute } from 'three'
import type { ThreeEvent } from '@react-three/fiber'
import { useStore } from '../store'
import { wallFootprints, type Footprint } from '../model/wallGeometry'

const MAX_CLICK_DRAG_PX = 4

/** Extruded walls. Geometry is rebuilt from the wall data whenever it changes. */
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
  selected: boolean
  onSelect?: () => void
}

function WallMesh({ footprint, height, selected, onSelect }: WallMeshProps) {
  const geometry = useMemo(() => prism(footprint, height), [footprint, height])
  const onClick = onSelect
    ? (e: ThreeEvent<MouseEvent>) => {
        if (e.delta > MAX_CLICK_DRAG_PX) return
        e.stopPropagation()
        onSelect()
      }
    : undefined

  return (
    <mesh geometry={geometry} castShadow receiveShadow onClick={onClick}>
      <meshStandardMaterial
        color={selected ? '#7fd8f5' : '#e8e4dc'}
        emissive={selected ? '#0b4a63' : '#000000'}
        roughness={0.9}
      />
    </mesh>
  )
}

/** A flat-shaded prism: the footprint extruded from y = 0 to y = height. */
function prism(footprint: Footprint, height: number): BufferGeometry {
  // Order the corners so the top face's normal points up.
  let q = footprint.map((p) => [p.x, p.z] as const)
  const shoelace = q.reduce((s, [x, z], i) => {
    const [nx, nz] = q[(i + 1) % q.length]
    return s + x * nz - nx * z
  }, 0)
  if (shoelace > 0) q = [...q].reverse()

  const v: number[] = []
  const tri = (...pts: (readonly [number, number, number])[]) => pts.forEach((p) => v.push(...p))
  const top = q.map(([x, z]) => [x, height, z] as const)
  const bottom = q.map(([x, z]) => [x, 0, z] as const)

  tri(top[0], top[1], top[2], top[0], top[2], top[3])
  tri(bottom[0], bottom[2], bottom[1], bottom[0], bottom[3], bottom[2])
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4
    tri(bottom[i], bottom[j], top[j], bottom[i], top[j], top[i])
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(v, 3))
  geometry.computeVertexNormals()
  return geometry
}
