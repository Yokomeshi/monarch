import { useMemo } from 'react'
import { BufferGeometry, DoubleSide, Float32BufferAttribute, type Side } from 'three'
import type { ThreeEvent } from '@react-three/fiber'
import { Edges } from '@react-three/drei'
import { useStore } from '../store'
import { useRooms } from '../useRooms'
import { slabData } from '../model/roomMesh'
import type { Material } from '../model/materials'
import type { Vec2 } from '../model/walls'
import { Surface } from './Surface'

const MAX_CLICK_DRAG_PX = 4
const FLOOR_Y = 0.004 // just above the plan image

/** A floor and a ceiling for every room. */
export function Rooms() {
  const rooms = useRooms()
  const walls = useStore((s) => s.walls)
  const showFloors = useStore((s) => s.showFloors)
  // Walking: ceilings always show. Otherwise they follow the toggle, but a ceiling would
  // cover the rooms that cutaway view opens up.
  const showCeilings = useStore((s) => s.tool === 'walk' || (s.showCeilings && !s.cutaway))
  const roomMaterials = useStore((s) => s.roomMaterials)
  const roomDefaults = useStore((s) => s.roomDefaults)
  const selectedRoomId = useStore((s) => s.selectedRoomId)
  const selectable = useStore((s) => s.tool === 'none')
  const selectRoom = useStore((s) => s.selectRoom)
  const heights = useMemo(() => new Map(walls.map((w) => [w.id, w.height])), [walls])

  return (
    <group>
      {rooms.map((room) => {
        const materials = roomMaterials[room.id] ?? roomDefaults
        const selected = room.id === selectedRoomId
        const onSelect = selectable ? () => selectRoom(room.id) : undefined
        // The ceiling sits on the lowest wall around the room.
        const ceilingY = Math.min(...room.wallIds.map((id) => heights.get(id)!))
        return (
          <group key={room.id}>
            {showFloors && (
              <Slab outline={room.outline} y={FLOOR_Y} facing="up" material={materials.floor} selected={selected} onSelect={onSelect} />
            )}
            {showCeilings && (
              // Double-sided, so it also shows from above.
              <Slab outline={room.outline} y={ceilingY} facing="down" material={materials.ceiling} side={DoubleSide} selected={selected} onSelect={onSelect} />
            )}
          </group>
        )
      })}
    </group>
  )
}

interface SlabProps {
  outline: Vec2[]
  y: number
  facing: 'up' | 'down'
  material: Material
  side?: Side
  selected: boolean
  onSelect?: () => void
}

function Slab({ outline, y, facing, material, side, selected, onSelect }: SlabProps) {
  const geometry = useMemo(() => {
    const { positions, uvs } = slabData(outline, y, facing)
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(positions, 3))
    g.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
    g.computeVertexNormals()
    return g
  }, [outline, y, facing])
  const onClick = onSelect
    ? (e: ThreeEvent<MouseEvent>) => {
        if (e.delta > MAX_CLICK_DRAG_PX) return
        e.stopPropagation()
        onSelect()
      }
    : undefined

  return (
    <mesh geometry={geometry} receiveShadow onClick={onClick} userData={{ walkable: facing === 'up' }}>
      <Surface material={material} side={side} />
      {selected && <Edges color="#36c5f0" lineWidth={3} threshold={15} />}
    </mesh>
  )
}
