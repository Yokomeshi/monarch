import { Line } from '@react-three/drei'
import { useStore } from '../store'
import { openingsFromGaps } from '../plan/suggestOpenings'
import { wallLength } from '../model/walls'

/** Colour of a gap on the plan: white until it is identified, then by what will be added. */
const GAP_COLOURS = { door: '#3ddc84', window: '#36c5f0', none: '#ffffff' }

/** Walls detected in the plan, drawn over it in orange until they are added or discarded, with their gaps marked. */
export function SuggestedWalls() {
  const suggested = useStore((s) => s.suggestedWalls)
  const gaps = useStore((s) => s.suggestedGaps)
  if (!suggested) return null
  const openings = openingsFromGaps(gaps, suggested)
  return (
    <group>
      {suggested.map((w) => (
        <Line
          key={w.id}
          points={[
            [w.start.x, 0.02, w.start.z],
            [w.end.x, 0.02, w.end.z],
          ]}
          color="#ffb020"
          worldUnits
          lineWidth={w.thickness}
          transparent
          opacity={0.85}
        />
      ))}
      {gaps.map((gap, i) => {
        const wall = suggested.find((w) => w.id === gap.wallId)
        if (!wall) return null
        const length = wallLength(wall)
        const at = (along: number): [number, number, number] => [
          wall.start.x + ((wall.end.x - wall.start.x) * along) / length,
          0.03,
          wall.start.z + ((wall.end.z - wall.start.z) * along) / length,
        ]
        // Green or blue once the gap will become a door or a window; white while it would stay plain wall.
        const opening = openings.find((o) => o.wallId === gap.wallId && Math.abs(o.position - gap.position) < gap.width / 2)
        return (
          <Line
            key={i}
            points={[at(gap.position - gap.width / 2), at(gap.position + gap.width / 2)]}
            color={GAP_COLOURS[opening?.type ?? 'none']}
            worldUnits
            lineWidth={wall.thickness}
          />
        )
      })}
    </group>
  )
}
