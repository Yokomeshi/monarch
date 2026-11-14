import { useMemo } from 'react'
import type { ThreeEvent } from '@react-three/fiber'
import { Edges, Line } from '@react-three/drei'
import { useStore } from '../store'
import { fitOpening, swingArc, type Opening } from '../model/openings'
import { wallLength } from '../model/walls'

const MAX_CLICK_DRAG_PX = 4
const FRAME = 0.05 // frame section, metres
const LEAF = 0.04 // door leaf thickness
const FRAME_COLOR = '#f4f1ea'
const LEAF_COLOR = '#c9b79c'

/** Frames, glass and door leaves in the openings the walls leave for them. */
export function Openings() {
  const walls = useStore((s) => s.walls)
  const openings = useStore((s) => s.openings)
  const selectedOpeningId = useStore((s) => s.selectedOpeningId)
  const selectable = useStore((s) => s.tool === 'none')
  const selectOpening = useStore((s) => s.selectOpening)
  const wallById = useMemo(() => new Map(walls.map((w) => [w.id, w])), [walls])

  return (
    <group>
      {openings.map((o) => {
        const wall = wallById.get(o.wallId)
        if (!wall) return null
        const length = wallLength(wall)
        // Fitted exactly as the wall mesh fits it, so the model sits in the hole.
        const fitted = fitOpening(o, length, wall.height)
        if (fitted.width <= 0 || fitted.height <= 0) return null
        const dir = { x: (wall.end.x - wall.start.x) / length, z: (wall.end.z - wall.start.z) / length }
        return (
          // Local axes: x along the wall, y up, z towards the wall's left.
          <group
            key={o.id}
            position={[wall.start.x + dir.x * fitted.position, 0, wall.start.z + dir.z * fitted.position]}
            rotation-y={-Math.atan2(dir.z, dir.x)}
          >
            <OpeningModel
              opening={fitted}
              thickness={wall.thickness}
              selected={o.id === selectedOpeningId}
              onSelect={selectable ? () => selectOpening(o.id) : undefined}
            />
          </group>
        )
      })}
    </group>
  )
}

interface ModelProps {
  opening: Opening
  thickness: number
  selected: boolean
  onSelect?: () => void
}

function OpeningModel({ opening, thickness, selected, onSelect }: ModelProps) {
  const { width: w, height: h, sill, type } = opening
  const depth = thickness + 0.02 // the frame stands a little proud of the wall
  const midY = sill + h / 2
  const onClick = onSelect
    ? (e: ThreeEvent<MouseEvent>) => {
        if (e.delta > MAX_CLICK_DRAG_PX) return
        e.stopPropagation()
        onSelect()
      }
    : undefined

  return (
    <group onClick={onClick}>
      {/* Invisible, so the empty doorway or the glass can be clicked; carries the selection outline. */}
      <mesh position-y={midY}>
        <boxGeometry args={[w, h, depth + 0.02]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        {selected && <Edges color="#36c5f0" lineWidth={3} />}
      </mesh>

      <FramePiece size={[FRAME, h, depth]} position={[-(w - FRAME) / 2, midY, 0]} />
      <FramePiece size={[FRAME, h, depth]} position={[(w - FRAME) / 2, midY, 0]} />
      <FramePiece size={[w, FRAME, depth]} position={[0, sill + h - FRAME / 2, 0]} />
      {type === 'window' ? (
        <>
          <FramePiece size={[w, FRAME, depth]} position={[0, sill + FRAME / 2, 0]} />
          <mesh position-y={midY}>
            <boxGeometry args={[w - 2 * FRAME, h - 2 * FRAME, 0.01]} />
            <meshPhysicalMaterial color="#bcd9e6" transparent opacity={0.3} roughness={0.05} />
          </mesh>
        </>
      ) : (
        <DoorLeaf opening={opening} />
      )}
    </group>
  )
}

function FramePiece({ size, position }: { size: [number, number, number]; position: [number, number, number] }) {
  return (
    <mesh position={position} castShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color={FRAME_COLOR} roughness={0.6} />
    </mesh>
  )
}

/** The leaf drawn open at 90 degrees with its swing arc on the floor: the plan symbol, in 3D. */
function DoorLeaf({ opening }: { opening: Opening }) {
  const { width: w, height: h, sill } = opening
  const arc = swingArc(opening, 16)
  const open = arc[arc.length - 1] // the free edge when open; the hinge is straight below it on the wall line
  const leafHeight = h - FRAME
  return (
    <>
      <mesh position={[open.x, sill + leafHeight / 2, open.z / 2]} castShadow>
        <boxGeometry args={[LEAF, leafHeight, w]} />
        <meshStandardMaterial color={LEAF_COLOR} roughness={0.7} />
      </mesh>
      <Line points={arc.map((q) => [q.x, 0.03, q.z] as [number, number, number])} color="#8a93a0" lineWidth={1.5} />
    </>
  )
}
