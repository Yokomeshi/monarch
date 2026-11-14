import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { PerspectiveCamera } from '@react-three/drei'
import { Raycaster, Vector2, type Material, type Mesh } from 'three'
import { useStore } from '../store'
import { detectRooms } from '../model/rooms'
import { EYE_HEIGHT, moveVector, startPosition, walkTo } from '../model/walk'

const WALK_SPEED = 1.4 // metres per second
const RUN_SPEED = 3
const TURN_SPEED = Math.PI / 2 // radians per second, for the arrow keys
const LOOK_SPEED = 0.005 // radians per pixel dragged
const MAX_PITCH = 1.4
const MAX_CLICK_DRAG_PX = 4
const KEYS = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'])

/** First-person camera: keys walk and turn, dragging looks around, clicking a floor goes there. */
export function WalkRig() {
  const gl = useThree((s) => s.gl)
  const camera = useThree((s) => s.camera)
  const scene = useThree((s) => s.scene)
  const pose = useRef<{ x: number; z: number; yaw: number; pitch: number } | null>(null)
  if (!pose.current) {
    const start = startPosition(detectRooms(useStore.getState().walls))
    pose.current = { x: start.x, z: start.z, yaw: 0, pitch: 0 }
  }
  const held = useRef({ keys: new Set<string>(), shift: false })

  useEffect(() => {
    const el = gl.domElement
    const keys = held.current.keys

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
      if (e.key === 'Escape') return useStore.getState().setTool('none')
      held.current.shift = e.shiftKey
      const key = e.key.toLowerCase()
      if (!KEYS.has(key)) return
      e.preventDefault() // arrow keys would scroll the page
      keys.add(key)
    }
    const onKeyUp = (e: KeyboardEvent) => {
      held.current.shift = e.shiftKey
      keys.delete(e.key.toLowerCase())
    }
    const release = () => keys.clear()

    let drag: { x: number; y: number; moved: number } | null = null
    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return
      drag = { x: e.clientX, y: e.clientY, moved: 0 }
      el.setPointerCapture(e.pointerId)
    }
    const onPointerMove = (e: PointerEvent) => {
      if (!drag) return
      const dx = e.clientX - drag.x
      const dy = e.clientY - drag.y
      drag = { x: e.clientX, y: e.clientY, moved: drag.moved + Math.abs(dx) + Math.abs(dy) }
      const p = pose.current!
      p.yaw -= dx * LOOK_SPEED
      p.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, p.pitch - dy * LOOK_SPEED))
    }
    const onPointerUp = (e: PointerEvent) => {
      if (!drag) return
      const wasClick = drag.moved <= MAX_CLICK_DRAG_PX
      drag = null
      if (!wasClick) return
      // A plain click on a floor walks there, if the floor is the first thing under the pointer.
      const rect = el.getBoundingClientRect()
      const pointer = new Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      )
      const raycaster = new Raycaster()
      raycaster.setFromCamera(pointer, camera)
      for (const hit of raycaster.intersectObjects(scene.children, true)) {
        const mesh = hit.object as Mesh
        const material = mesh.material as Material | undefined
        // Skip things that aren't solid surfaces: outlines, helpers and invisible click targets.
        if (!mesh.isMesh || !mesh.visible || !material || Array.isArray(material)) continue
        if (material.transparent && material.opacity === 0) continue
        if (mesh.userData.walkable) Object.assign(pose.current!, { x: hit.point.x, z: hit.point.z })
        break
      }
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', release)
    el.addEventListener('pointerdown', onPointerDown)
    el.addEventListener('pointermove', onPointerMove)
    el.addEventListener('pointerup', onPointerUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', release)
      el.removeEventListener('pointerdown', onPointerDown)
      el.removeEventListener('pointermove', onPointerMove)
      el.removeEventListener('pointerup', onPointerUp)
    }
  }, [gl, camera, scene])

  useFrame((_, delta) => {
    const p = pose.current!
    const { keys, shift } = held.current
    const dt = Math.min(delta, 0.1) // a long frame must not turn into a long stride
    const on = (...names: string[]) => (names.some((n) => keys.has(n)) ? 1 : 0)

    p.yaw += (on('arrowleft') - on('arrowright')) * TURN_SPEED * dt
    const v = moveVector(p.yaw, on('w', 'arrowup') - on('s', 'arrowdown'), on('d') - on('a'))
    if (v.x || v.z) {
      const distance = (shift ? RUN_SPEED : WALK_SPEED) * dt
      const { walls, openings } = useStore.getState()
      Object.assign(p, walkTo(p, { x: p.x + v.x * distance, z: p.z + v.z * distance }, walls, openings))
    }
    camera.position.set(p.x, EYE_HEIGHT, p.z)
    camera.rotation.set(p.pitch, p.yaw, 0, 'YXZ')
  })

  return <PerspectiveCamera makeDefault fov={70} near={0.05} far={1000} />
}
