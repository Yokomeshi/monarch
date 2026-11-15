import { Line } from '@react-three/drei'
import { useStore } from '../store'

/** Walls detected in the plan, drawn over it in orange until they are added or discarded. */
export function SuggestedWalls() {
  const suggested = useStore((s) => s.suggestedWalls)
  if (!suggested) return null
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
    </group>
  )
}
