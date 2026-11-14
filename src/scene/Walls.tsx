import { useMemo } from 'react'
import { BufferGeometry, Float32BufferAttribute } from 'three'
import type { ThreeEvent } from '@react-three/fiber'
import { Edges } from '@react-three/drei'
import { useStore } from '../store'
import { wallFootprints, type Footprint } from '../model/wallGeometry'
import { wallMeshData } from '../model/wallMesh'
import { CUT_HEIGHT, cutOpenings, cutWall } from '../model/cutaway'
import type { Opening } from '../model/openings'
import type { Vec2, Wall } from '../model/walls'
import { Surface } from './Surface'

const MAX_CLICK_DRAG_PX = 4

/** Extruded walls. Geometry and materials are rebuilt from the wall data whenever it changes. */
export function Walls() {
  const walls = useStore((s) => s.walls)
  const selectedWallId = useStore((s) => s.selectedWallId)
  const tool = useStore((s) => s.tool)
  const selectWall = useStore((s) => s.selectWall)
  const placeOpening = useStore((s) => s.placeOpening)
  // Walking shows the walls at full height.
  const cut = useStore((s) => (s.cutaway && s.tool !== 'walk' ? CUT_HEIGHT : null))
  const openings = useStore((s) => s.openings)
  const footprints = useMemo(() => wallFootprints(walls), [walls])
  const openingsByWall = useMemo(() => {
    const map = new Map<string, Opening[]>()
    for (const o of openings) map.set(o.wallId, [...(map.get(o.wallId) ?? []), o])
    return map
  }, [openings])

  return (
    <group>
      {walls.map((w) => (
        <WallMesh
          key={w.id}
          wall={w}
          footprint={footprints.get(w.id)!}
          openings={openingsByWall.get(w.id) ?? NO_OPENINGS}
          cut={cut}
          selected={w.id === selectedWallId}
          onPick={
            tool === 'none'
              ? () => selectWall(w.id)
              : tool === 'door' || tool === 'window'
                ? (point) => placeOpening(w.id, distanceAlong(w, point))
                : undefined
          }
        />
      ))}
    </group>
  )
}

const NO_OPENINGS: Opening[] = []

interface WallMeshProps {
  wall: Wall
  footprint: Footprint
  openings: Opening[]
  /** In cutaway view, the height to draw the wall cut off at. */
  cut: number | null
  selected: boolean
  /** Called with the clicked point, in world metres. */
  onPick?: (point: Vec2) => void
}

/** How far along the wall's centreline a point is, from the wall's start. */
function distanceAlong(wall: Wall, point: Vec2): number {
  const dx = wall.end.x - wall.start.x
  const dz = wall.end.z - wall.start.z
  return ((point.x - wall.start.x) * dx + (point.z - wall.start.z) * dz) / Math.hypot(dx, dz)
}

function WallMesh({ wall, footprint, openings, cut, selected, onPick }: WallMeshProps) {
  const geometry = useMemo(() => {
    const { positions, uvs } = cut
      ? wallMeshData(cutWall(wall, cut), footprint, cutOpenings(openings, cut))
      : wallMeshData(wall, footprint, openings)
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(positions, 3))
    g.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
    g.computeVertexNormals()
    return g
  }, [wall, footprint, openings, cut])
  const onClick = onPick
    ? (e: ThreeEvent<MouseEvent>) => {
        if (e.delta > MAX_CLICK_DRAG_PX) return
        e.stopPropagation()
        onPick({ x: e.point.x, z: e.point.z })
      }
    : undefined

  return (
    <mesh geometry={geometry} castShadow receiveShadow onClick={onClick}>
      <Surface material={wall.material} />
      {/* The selection outline leaves the surface colour untouched, so materials can be judged. */}
      {selected && <Edges color="#36c5f0" lineWidth={3} threshold={15} />}
    </mesh>
  )
}
