import { Html, Line } from '@react-three/drei'
import { useStore, type Plan } from '../store'
import { pixelDistance, pixelToWorld, type Px } from '../plan/geometry'
import { formatLength } from '../units'
import { ScreenDot } from './ScreenDot'

const Y = 0.01 // just above the plan

/** Points being picked, and the span the scale was last set from. */
export function CalibrationOverlay({ plan }: { plan: Plan }) {
  const points = useStore((s) => s.calibrationPoints)
  const line = useStore((s) => s.calibrationLine)
  const preview = useStore((s) => s.calibrationPreview)
  const units = useStore((s) => s.units)

  const toVec = (p: Px): [number, number, number] => {
    const w = pixelToWorld(p, plan)
    return [w.x, Y, w.z]
  }

  const pending = points.length > 0
  // With one point picked, the line follows the pointer to where the second would go.
  const shown = pending ? (points.length === 1 && preview ? [points[0], preview] : points) : (line ?? [])
  const color = pending ? '#ffb020' : '#36c5f0'

  return (
    <group>
      {shown.map((p, i) => (
        <ScreenDot key={i} p={pixelToWorld(p, plan)} color={color} />
      ))}
      {shown.length === 2 && (
        <>
          <Line points={[toVec(shown[0]), toVec(shown[1])]} color={color} lineWidth={2} />
          {!pending && (
            <Html position={midpoint(toVec(shown[0]), toVec(shown[1]))} center style={{ pointerEvents: 'none' }}>
              <div className="measure-label">
                {formatLength(pixelDistance(shown[0], shown[1]) * plan.metresPerPx, units)}
              </div>
            </Html>
          )}
        </>
      )}
    </group>
  )
}

function midpoint(a: number[], b: number[]): [number, number, number] {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 0.3, (a[2] + b[2]) / 2]
}
