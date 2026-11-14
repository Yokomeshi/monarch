import { useRef } from 'react'
import { Plane, Vector3 } from 'three'
import { useThree, type ThreeEvent } from '@react-three/fiber'
import { Edges } from '@react-three/drei'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { useStore } from '../store'
import { useRooms } from '../useRooms'
import { ceilingHeightAt, kelvinToHex, lightIntensity, type CeilingLight } from '../model/lights'

const MAX_CLICK_DRAG_PX = 4
const GROUND = new Plane(new Vector3(0, 1, 0), 0)
const FIXTURE_RADIUS = 0.15
const FIXTURE_DEPTH = 0.06
/** Each shadow takes one of the graphics card's texture slots, often 16 in all, and six renders a frame. */
const MAX_SHADOWS = 8

/** Ceiling lights, and the click target for placing a new one. */
export function Lights() {
  const lights = useStore((s) => s.lights)
  const walls = useStore((s) => s.walls)
  const fallback = useStore((s) => s.wallDefaults.height)
  const selectedLightId = useStore((s) => s.selectedLightId)
  const tool = useStore((s) => s.tool)
  const placeLight = useStore((s) => s.placeLight)
  const rooms = useRooms()

  return (
    <group>
      {lights.map((l, i) => (
        <Fixture
          key={l.id}
          light={l}
          ceiling={ceilingHeightAt(l.position, rooms, walls, fallback)}
          selected={l.id === selectedLightId}
          shadows={i < MAX_SHADOWS}
          interactive={tool === 'none'}
        />
      ))}
      {tool === 'light' && (
        // Invisible, so a click anywhere over the ground places the light above that point.
        <mesh
          rotation-x={-Math.PI / 2}
          position-y={0.004}
          onClick={(e) => {
            if (e.delta > MAX_CLICK_DRAG_PX) return
            e.stopPropagation()
            placeLight({ x: e.point.x, z: e.point.z })
          }}
        >
          <planeGeometry args={[2000, 2000]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      )}
    </group>
  )
}

interface FixtureProps {
  light: CeilingLight
  ceiling: number
  selected: boolean
  /** Whether walls and furniture block this light. */
  shadows: boolean
  interactive: boolean
}

function Fixture({ light, ceiling, selected, shadows, interactive }: FixtureProps) {
  const selectLight = useStore((s) => s.selectLight)
  const updateLight = useStore((s) => s.updateLight)
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null
  /** While dragging: the light's position minus the point on the ground that was grabbed. */
  const grab = useRef<{ x: number; z: number } | null>(null)
  const colour = kelvinToHex(light.kelvin)

  const groundPoint = (e: ThreeEvent<PointerEvent>) => e.ray.intersectPlane(GROUND, new Vector3())
  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0) return
    e.stopPropagation()
    selectLight(light.id)
    const hit = groundPoint(e)
    if (!hit) return
    grab.current = { x: light.position.x - hit.x, z: light.position.z - hit.z }
    ;(e.target as Element).setPointerCapture(e.pointerId)
    if (controls) controls.enabled = false // dragging moves the light, not the camera
  }
  const onPointerMove = (e: ThreeEvent<PointerEvent>) => {
    const hit = grab.current && groundPoint(e)
    if (hit) updateLight(light.id, { position: { x: hit.x + grab.current!.x, z: hit.z + grab.current!.z } })
  }
  const endDrag = (e: ThreeEvent<PointerEvent>) => {
    if (!grab.current) return
    grab.current = null
    ;(e.target as Element).releasePointerCapture(e.pointerId)
    if (controls) controls.enabled = true
  }
  const handlers = interactive
    ? {
        onPointerDown,
        onPointerMove,
        onPointerUp: endDrag,
        onLostPointerCapture: endDrag,
        // Otherwise the click carries on to the floor below and selects the room instead.
        onClick: (e: ThreeEvent<MouseEvent>) => e.stopPropagation(),
      }
    : {}

  return (
    <group position={[light.position.x, ceiling, light.position.z]}>
      {/* The fitting: a glowing disc flush under the ceiling. */}
      <mesh position-y={-FIXTURE_DEPTH / 2} {...handlers}>
        <cylinderGeometry args={[FIXTURE_RADIUS, FIXTURE_RADIUS, FIXTURE_DEPTH, 24]} />
        <meshBasicMaterial color={colour} toneMapped={false} />
        {selected && <Edges color="#36c5f0" lineWidth={3} threshold={30} />}
      </mesh>
      {/* The source hangs just below the fitting, so the ceiling around it is lit too. */}
      <pointLight
        position-y={-FIXTURE_DEPTH - 0.1}
        color={colour}
        intensity={lightIntensity(light.lumens)}
        castShadow={shadows}
        shadow-mapSize={[512, 512]}
        shadow-bias={-0.002}
      />
    </group>
  )
}
