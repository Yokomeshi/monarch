import { useEffect, useState } from 'react'
import { useThree, type ThreeEvent } from '@react-three/fiber'
import { Html, Line } from '@react-three/drei'
import type { Camera, OrthographicCamera, PerspectiveCamera } from 'three'
import { useStore } from '../store'
import { constrainAngle, distance, endpoints, snapToPoint, type Vec2 } from '../model/walls'
import { formatLength } from '../units'

const MAX_CLICK_DRAG_PX = 4
const SNAP_PX = 10
const Y = 0.02
const DRAFT_COLOR = '#ffb020'

/** Click-to-place wall drawing on the ground plane. */
export function WallTool() {
  const draft = useStore((s) => s.draft)
  const units = useStore((s) => s.units)
  const addDraftPoint = useStore((s) => s.addDraftPoint)
  const removeDraftPoint = useStore((s) => s.removeDraftPoint)
  const finishDraft = useStore((s) => s.finishDraft)
  const setTool = useStore((s) => s.setTool)
  const camera = useThree((s) => s.camera)
  const viewHeight = useThree((s) => s.size.height)
  const [cursor, setCursor] = useState<{ p: Vec2; snapped: boolean } | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
      const { draft } = useStore.getState()
      if (e.key === 'Enter') finishDraft()
      else if (e.key === 'Escape') draft.length ? finishDraft() : setTool('none')
      else if (e.key === 'Backspace') {
        e.preventDefault()
        removeDraftPoint()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [finishDraft, removeDraftPoint, setTool])

  // Handlers read the store directly: clicks can arrive faster than React re-renders,
  // and a stale chain would lock angles and snap against the wrong points.
  const resolve = (e: ThreeEvent<PointerEvent | MouseEvent>) => {
    const { walls, draft } = useStore.getState()
    const raw = { x: e.point.x, z: e.point.z }
    const tolerance = SNAP_PX * metresPerScreenPx(camera, viewHeight, e.distance)
    const snap = snapToPoint(raw, [...endpoints(walls), ...draft], tolerance)
    if (snap) return { p: snap, snapped: true }
    const last = draft[draft.length - 1]
    if (last && e.nativeEvent.shiftKey) return { p: constrainAngle(last, raw), snapped: false }
    return { p: raw, snapped: false }
  }

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > MAX_CLICK_DRAG_PX) return
    e.stopPropagation()
    const { p } = resolve(e)
    const { draft } = useStore.getState()
    const first = draft[0]
    const last = draft[draft.length - 1]
    if (draft.length > 2 && p === first) finishDraft(true)
    else if (last && distance(p, last) < 1e-9) finishDraft()
    else addDraftPoint(p)
  }

  const last = draft[draft.length - 1]
  const toV = (p: Vec2): [number, number, number] => [p.x, Y, p.z]

  return (
    <group>
      {/* Invisible catcher so clicks land anywhere on the ground, not just on the plan. */}
      <mesh
        rotation-x={-Math.PI / 2}
        position-y={0.004}
        onPointerMove={(e) => setCursor(resolve(e))}
        onPointerOut={() => setCursor(null)}
        onClick={onClick}
      >
        <planeGeometry args={[2000, 2000]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {draft.length > 1 && <Line points={draft.map(toV)} color={DRAFT_COLOR} lineWidth={2} />}
      {draft.map((p, i) => (
        <Dot key={i} p={p} color={DRAFT_COLOR} />
      ))}

      {cursor && (
        <>
          <Dot p={cursor.p} color={cursor.snapped ? '#3ddc84' : DRAFT_COLOR} radius={0.1} />
          {last && (
            <>
              <Line points={[toV(last), toV(cursor.p)]} color={DRAFT_COLOR} lineWidth={1} dashed dashSize={0.2} gapSize={0.1} />
              <Html position={[(last.x + cursor.p.x) / 2, 0.3, (last.z + cursor.p.z) / 2]} center style={{ pointerEvents: 'none' }}>
                <div className="measure-label draft">{formatLength(distance(last, cursor.p), units)}</div>
              </Html>
            </>
          )}
        </>
      )}
    </group>
  )
}

export function Dot({ p, color, radius = 0.06 }: { p: Vec2; color: string; radius?: number }) {
  return (
    <mesh position={[p.x, Y + 0.001, p.z]} rotation-x={-Math.PI / 2}>
      <circleGeometry args={[radius, 20]} />
      <meshBasicMaterial color={color} toneMapped={false} />
    </mesh>
  )
}

/** Approximate size of one screen pixel, in metres, at `dist` from the camera. */
function metresPerScreenPx(camera: Camera, viewHeight: number, dist: number): number {
  const ortho = camera as OrthographicCamera
  if (ortho.isOrthographicCamera) return 1 / ortho.zoom
  const persp = camera as PerspectiveCamera
  return (2 * dist * Math.tan((persp.fov * Math.PI) / 360)) / viewHeight
}
