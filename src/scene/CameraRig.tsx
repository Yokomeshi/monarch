import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import { OrbitControls, OrthographicCamera, PerspectiveCamera } from '@react-three/drei'
import { Vector3, type OrthographicCamera as OrthoCam, type PerspectiveCamera as PerspCam } from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { useStore } from '../store'
import { WalkRig } from './WalkRig'

const FIT_MARGIN = 0.9
const DEFAULT_EXTENT_M = 20

/** Perspective orbit camera in 3D; straight-down orthographic camera in Top; first-person camera while walking. */
export function CameraRig() {
  const viewMode = useStore((s) => s.viewMode)
  const walking = useStore((s) => s.tool === 'walk')
  const frameRequest = useStore((s) => s.frameRequest)
  const camera = useThree((s) => s.camera)
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null

  useEffect(() => {
    if (!controls) return
    const { plan } = useStore.getState()
    const width = plan ? plan.widthPx * plan.metresPerPx : DEFAULT_EXTENT_M
    const depth = plan ? plan.heightPx * plan.metresPerPx : DEFAULT_EXTENT_M
    frame(camera as OrthoCam | PerspCam, controls, width, depth)
  }, [frameRequest, camera, controls])

  if (walking) return <WalkRig />
  return viewMode === 'top' ? (
    <>
      <OrthographicCamera makeDefault position={[0, 100, 0]} up={[0, 0, -1]} near={0.1} far={1000} />
      <OrbitControls key="top" makeDefault enableRotate={false} screenSpacePanning />
    </>
  ) : (
    <>
      <PerspectiveCamera makeDefault position={[8, 6, 8]} fov={50} near={0.1} far={1000} />
      <OrbitControls key="3d" makeDefault maxPolarAngle={Math.PI / 2 - 0.01} />
    </>
  )
}

function frame(camera: OrthoCam | PerspCam, controls: OrbitControlsImpl, width: number, depth: number) {
  controls.target.set(0, 0, 0)
  if ('isOrthographicCamera' in camera && camera.isOrthographicCamera) {
    // drei sizes the ortho frustum in screen pixels, so zoom is pixels per metre.
    const viewW = camera.right - camera.left
    const viewH = camera.top - camera.bottom
    camera.position.set(0, 100, 0)
    camera.zoom = FIT_MARGIN * Math.min(viewW / width, viewH / depth)
  } else {
    const persp = camera as PerspCam
    const radius = Math.hypot(width, depth) / 2
    const dist = radius / Math.sin((persp.fov * Math.PI) / 360) / FIT_MARGIN
    camera.position.copy(new Vector3(1, 0.8, 1).normalize().multiplyScalar(dist))
  }
  camera.lookAt(0, 0, 0)
  camera.updateProjectionMatrix()
  controls.update()
}
