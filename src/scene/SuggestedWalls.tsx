import type { ThreeEvent } from '@react-three/fiber'
import { useStore } from '../store'
import { openingsFromGaps } from '../plan/suggestOpenings'
import { wallLength, type Vec2 } from '../model/walls'

const MAX_CLICK_DRAG_PX = 4
/** Colour of a gap on the plan: white while it would stay plain wall, then by what will be added. */
const GAP_COLOURS = { door: '#3ddc84', window: '#36c5f0', none: '#ffffff' }
/** A thin wall is still given a strip this wide, in metres, so it can be seen and clicked. */
const MIN_STRIP = 0.12

/**
 * Walls detected in the plan, drawn over it in orange until they are added or discarded, with
 * their gaps marked. A click on a wall drops it from the suggestion; a click on a gap changes what it is.
 */
export function SuggestedWalls() {
  const suggested = useStore((s) => s.suggestedWalls)
  const gaps = useStore((s) => s.suggestedGaps)
  const editable = useStore((s) => s.tool === 'none')
  const removeSuggestedWall = useStore((s) => s.removeSuggestedWall)
  const cycleSuggestedGap = useStore((s) => s.cycleSuggestedGap)
  const marking = useStore((s) => s.suggestionClick !== 'edit')
  const markSuggestion = useStore((s) => s.markSuggestion)
  if (!suggested) return null
  const openings = openingsFromGaps(gaps, suggested)
  const onClick = (action: (at: Vec2) => void) =>
    editable
      ? (e: ThreeEvent<MouseEvent>) => {
          if (e.delta > MAX_CLICK_DRAG_PX) return
          e.stopPropagation()
          action({ x: e.point.x, z: e.point.z })
        }
      : undefined

  return (
    <group>
      {marking && editable && (
        // Under the walls: catches a click in the space between two walls, which joins them with an opening.
        <mesh rotation-x={-Math.PI / 2} position-y={0.015} onClick={onClick((at) => markSuggestion(at))}>
          <planeGeometry args={[2000, 2000]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      )}
      {suggested.map((w) => (
        <Strip key={w.id} from={w.start} to={w.end} width={w.thickness} y={0.02} color="#ffb020" opacity={0.85} onClick={onClick((at) => (marking ? markSuggestion(at, w.id) : removeSuggestedWall(w.id)))} />
      ))}
      {gaps.map((gap, i) => {
        const wall = suggested.find((w) => w.id === gap.wallId)
        if (!wall) return null
        const length = wallLength(wall)
        const at = (along: number): Vec2 => ({
          x: wall.start.x + ((wall.end.x - wall.start.x) * along) / length,
          z: wall.start.z + ((wall.end.z - wall.start.z) * along) / length,
        })
        // Green or blue once the gap will become a door or a window; white while it would stay plain wall.
        const opening = openings.find((o) => o.wallId === gap.wallId && Math.abs(o.position - gap.position) < gap.width / 2)
        return (
          <Strip
            key={i}
            from={at(gap.position - gap.width / 2)}
            to={at(gap.position + gap.width / 2)}
            width={wall.thickness}
            y={0.03}
            color={GAP_COLOURS[opening?.type ?? 'none']}
            opacity={1}
            onClick={onClick((at) => (marking ? markSuggestion(at, undefined, i) : cycleSuggestedGap(i)))}
          />
        )
      })}
    </group>
  )
}

interface StripProps {
  from: Vec2
  to: Vec2
  width: number
  y: number
  color: string
  opacity: number
  onClick?: (e: ThreeEvent<MouseEvent>) => void
}

/** A flat coloured band on the ground between two points. */
function Strip({ from, to, width, y, color, opacity, onClick }: StripProps) {
  const dx = to.x - from.x
  const dz = to.z - from.z
  return (
    <mesh position={[(from.x + to.x) / 2, y, (from.z + to.z) / 2]} rotation={[-Math.PI / 2, 0, -Math.atan2(dz, dx)]} onClick={onClick}>
      <planeGeometry args={[Math.hypot(dx, dz), Math.max(width, MIN_STRIP)]} />
      <meshBasicMaterial color={color} transparent opacity={opacity} toneMapped={false} />
    </mesh>
  )
}
