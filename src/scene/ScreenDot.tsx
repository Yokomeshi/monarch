import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Camera, Mesh, OrthographicCamera, PerspectiveCamera } from 'three'
import type { Vec2 } from '../model/walls'

const Y = 0.021 // just above plan, lines and wall footprints

/** Approximate size of one screen pixel, in metres, at `dist` from the camera. */
export function metresPerScreenPx(camera: Camera, viewHeight: number, dist: number): number {
  const ortho = camera as OrthographicCamera
  if (ortho.isOrthographicCamera) return 1 / ortho.zoom
  const persp = camera as PerspectiveCamera
  return (2 * dist * Math.tan((persp.fov * Math.PI) / 360)) / viewHeight
}

interface Props {
  p: Vec2
  color: string
  radiusPx?: number
  /** Hollow, so the spot under it stays visible. */
  ring?: boolean
}

/**
 * A point marker on the ground with a constant size on screen. Sized in pixels, not
 * metres: plans range from a room to a whole site, and a marker sized in metres
 * would cover a small-scale plan.
 */
export function ScreenDot({ p, color, radiusPx = 5, ring = false }: Props) {
  const ref = useRef<Mesh>(null)
  useFrame(({ camera, size }) => {
    const mesh = ref.current
    if (!mesh) return
    const dist = camera.position.distanceTo(mesh.position)
    mesh.scale.setScalar(radiusPx * metresPerScreenPx(camera, size.height, dist))
  })

  return (
    <mesh ref={ref} position={[p.x, Y, p.z]} rotation-x={-Math.PI / 2} scale={0}>
      {ring ? <ringGeometry args={[0.65, 1, 32]} /> : <circleGeometry args={[1, 24]} />}
      <meshBasicMaterial color={color} toneMapped={false} />
    </mesh>
  )
}
