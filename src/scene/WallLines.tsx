import { Line } from '@react-three/drei'
import { useStore } from '../store'
import { Dot } from './WallTool'

const COLOR = '#36c5f0'

/** Wall centrelines on the ground. Step 4 replaces this with extruded walls. */
export function WallLines() {
  const walls = useStore((s) => s.walls)
  if (walls.length === 0) return null
  const points = walls.flatMap((w): [number, number, number][] => [
    [w.start.x, 0.02, w.start.z],
    [w.end.x, 0.02, w.end.z],
  ])
  return (
    <group>
      <Line points={points} segments color={COLOR} lineWidth={3} />
      {walls.flatMap((w) => [
        <Dot key={`${w.id}-s`} p={w.start} color={COLOR} />,
        <Dot key={`${w.id}-e`} p={w.end} color={COLOR} />,
      ])}
    </group>
  )
}
