import { useMemo } from 'react'
import { BufferGeometry, Float32BufferAttribute } from 'three'
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
const CEILING_GAP = 0.02 // between a ceiling's top and its underside

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
              <Slab outline={room.outline} y={FLOOR_Y} facing="up" walkable material={materials.floor} selected={selected} onSelect={onSelect} />
            )}
            {showCeilings && (
              // Two faces, so it also shows from above, with the sun block between them:
              // the top is sunlit, the underside is not.
              <>
                <Slab outline={room.outline} y={ceilingY} facing="up" material={materials.ceiling} selected={selected} onSelect={onSelect} />
                <SunBlock outline={room.centreline} y={ceilingY - CEILING_GAP / 2} />
                <Slab outline={room.outline} y={ceilingY - CEILING_GAP} facing="down" material={materials.ceiling} selected={selected} onSelect={onSelect} />
              </>
            )}
          </group>
        )
      })}
    </group>
  )
}

/**
 * Keeps the sun out of a room with a ceiling, so daylight enters through the windows.
 * Invisible, and it reaches into the walls: a shadow cast by the ceiling itself would
 * streak the ceiling and leak light along the tops of the walls.
 */
function SunBlock({ outline, y }: { outline: Vec2[]; y: number }) {
  const geometry = useMemo(() => {
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(slabData(outline, y, 'down').positions, 3))
    return g
  }, [outline, y])
  return (
    // Facing down, so only light from above is blocked: ceiling lights below shine past it.
    <mesh geometry={geometry} castShadow raycast={() => null}>
      <meshBasicMaterial colorWrite={false} depthWrite={false} />
    </mesh>
  )
}

interface SlabProps {
  outline: Vec2[]
  y: number
  facing: 'up' | 'down'
  /** A floor: somewhere a click can send the walker. */
  walkable?: boolean
  material: Material
  selected: boolean
  onSelect?: () => void
}

function Slab({ outline, y, facing, walkable, material, selected, onSelect }: SlabProps) {
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
    <mesh geometry={geometry} receiveShadow onClick={onClick} userData={{ walkable }}>
      <Surface material={material} />
      {selected && <Edges color="#36c5f0" lineWidth={3} threshold={15} />}
    </mesh>
  )
}
