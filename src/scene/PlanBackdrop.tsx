import { useEffect, useMemo, useRef } from 'react'
import { useLoader, useThree, type ThreeEvent } from '@react-three/fiber'
import { Plane, SRGBColorSpace, TextureLoader, Vector3 } from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { useStore, type Plan } from '../store'
import { lockAngle, worldToPixel, type Px } from '../plan/geometry'

// A press that moves less than this is a click; more is a drag.
const MAX_CLICK_DRAG_PX = 4
const GROUND = new Plane(new Vector3(0, 1, 0), 0)

export function PlanBackdrop({ plan }: { plan: Plan }) {
  const texture = useLoader(TextureLoader, plan.url)
  useEffect(() => {
    texture.colorSpace = SRGBColorSpace
    texture.needsUpdate = true
  }, [texture])

  const calibrating = useStore((s) => s.tool === 'calibrate')
  const addCalibrationPoint = useStore((s) => s.addCalibrationPoint)
  const setCalibrationPreview = useStore((s) => s.setCalibrationPreview)
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null
  /** The press in progress: where on screen it began, and whether it placed the first point. */
  const press = useRef<{ x: number; y: number; placedFirst: boolean } | null>(null)

  const width = plan.widthPx * plan.metresPerPx
  const depth = plan.heightPx * plan.metresPerPx
  const frame = useMemo(
    () => ({ widthPx: plan.widthPx, heightPx: plan.heightPx, metresPerPx: plan.metresPerPx }),
    [plan.widthPx, plan.heightPx, plan.metresPerPx],
  )

  /** The plan pixel under the pointer; with Shift and a first point, kept on a straight line from it. */
  const aim = (e: ThreeEvent<PointerEvent>): Px | null => {
    // The ground under the pointer, so a drag can run on past the edge of the plan.
    const hit = e.ray.intersectPlane(GROUND, new Vector3())
    if (!hit) return null
    const p = worldToPixel({ x: hit.x, z: hit.z }, frame)
    const [first] = useStore.getState().calibrationPoints
    return first && e.nativeEvent.shiftKey ? lockAngle(first, p) : p
  }

  // Two ways to pick the two points: click each, or press on the first and drag to the second.
  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    const picked = useStore.getState().calibrationPoints.length
    if (e.button !== 0 || picked >= 2) return
    e.stopPropagation()
    press.current = { x: e.nativeEvent.clientX, y: e.nativeEvent.clientY, placedFirst: picked === 0 }
    if (picked > 0) return
    const p = aim(e)
    if (p) addCalibrationPoint(p)
    ;(e.target as Element).setPointerCapture(e.pointerId)
    if (controls) controls.enabled = false // this drag draws the line; it does not move the camera
  }
  const onPointerMove = (e: ThreeEvent<PointerEvent>) => {
    if (useStore.getState().calibrationPoints.length === 1) setCalibrationPreview(aim(e))
  }
  const onPointerUp = (e: ThreeEvent<PointerEvent>) => {
    const pressed = press.current
    if (!pressed) return
    press.current = null
    if (pressed.placedFirst) {
      ;(e.target as Element).releasePointerCapture(e.pointerId)
      if (controls) controls.enabled = true
    }
    const dragged = Math.hypot(e.nativeEvent.clientX - pressed.x, e.nativeEvent.clientY - pressed.y) > MAX_CLICK_DRAG_PX
    // A drag from the first point ends on the second; so does a plain click after the first. A drag
    // that starts after the first point is the camera being moved.
    if (dragged !== pressed.placedFirst) return
    const p = aim(e)
    if (p) addCalibrationPoint(p)
  }

  // No handlers unless calibrating, so a click on the plan counts as a click on empty space.
  const handlers = calibrating ? { onPointerDown, onPointerMove, onPointerUp } : {}
  return (
    <mesh rotation-x={-Math.PI / 2} position-y={0.002} {...handlers}>
      <planeGeometry args={[width, depth]} />
      <meshBasicMaterial map={texture} toneMapped={false} />
    </mesh>
  )
}
