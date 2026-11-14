import { useEffect, useMemo } from 'react'
import { useLoader, type ThreeEvent } from '@react-three/fiber'
import { SRGBColorSpace, TextureLoader } from 'three'
import { useStore, type Plan } from '../store'
import { worldToPixel } from '../plan/geometry'

// Ignore clicks that were really orbit drags.
const MAX_CLICK_DRAG_PX = 4

export function PlanBackdrop({ plan }: { plan: Plan }) {
  const texture = useLoader(TextureLoader, plan.url)
  useEffect(() => {
    texture.colorSpace = SRGBColorSpace
    texture.needsUpdate = true
  }, [texture])

  const calibrating = useStore((s) => s.calibrating)
  const addCalibrationPoint = useStore((s) => s.addCalibrationPoint)

  const width = plan.widthPx * plan.metresPerPx
  const depth = plan.heightPx * plan.metresPerPx
  const frame = useMemo(
    () => ({ widthPx: plan.widthPx, heightPx: plan.heightPx, metresPerPx: plan.metresPerPx }),
    [plan.widthPx, plan.heightPx, plan.metresPerPx],
  )

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (!calibrating || e.delta > MAX_CLICK_DRAG_PX) return
    e.stopPropagation()
    addCalibrationPoint(worldToPixel({ x: e.point.x, z: e.point.z }, frame))
  }

  return (
    <mesh
      rotation-x={-Math.PI / 2}
      position-y={0.002}
      onClick={onClick}
      onPointerOver={() => calibrating && (document.body.style.cursor = 'crosshair')}
      onPointerOut={() => (document.body.style.cursor = '')}
    >
      <planeGeometry args={[width, depth]} />
      <meshBasicMaterial map={texture} toneMapped={false} />
    </mesh>
  )
}
