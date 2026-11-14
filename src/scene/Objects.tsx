import { useMemo, useRef } from 'react'
import { Color, Plane, Vector3 } from 'three'
import { useThree, type ThreeEvent } from '@react-three/fiber'
import { Edges } from '@react-three/drei'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { useStore } from '../store'
import { objectParts, type PlacedObject } from '../model/objects'
import { snapToWalls } from '../model/objectSnap'
import { Surface } from './Surface'
import { ImportedModel } from './ImportedModel'

const MAX_CLICK_DRAG_PX = 4
const GROUND = new Plane(new Vector3(0, 1, 0), 0)
/** A dragged piece snaps to a wall when its back is within this many metres of it. */
const SNAP_DISTANCE = 0.25

/** Furniture, and the click target for placing a new piece. */
export function Objects() {
  const objects = useStore((s) => s.objects)
  const selectedObjectId = useStore((s) => s.selectedObjectId)
  const tool = useStore((s) => s.tool)
  const placeObject = useStore((s) => s.placeObject)

  return (
    <group>
      {objects.map((o) => (
        <ObjectModel key={o.id} object={o} selected={o.id === selectedObjectId} interactive={tool === 'none'} />
      ))}
      {tool === 'object' && (
        // Invisible, so a click anywhere on the ground places the piece.
        <mesh
          rotation-x={-Math.PI / 2}
          position-y={0.004}
          onClick={(e) => {
            if (e.delta > MAX_CLICK_DRAG_PX) return
            e.stopPropagation()
            placeObject({ x: e.point.x, z: e.point.z })
          }}
        >
          <planeGeometry args={[2000, 2000]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      )}
    </group>
  )
}

function ObjectModel({ object, selected, interactive }: { object: PlacedObject; selected: boolean; interactive: boolean }) {
  const selectObject = useStore((s) => s.selectObject)
  const updateObject = useStore((s) => s.updateObject)
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null
  const topView = useStore((s) => s.viewMode === 'top' && s.tool !== 'walk')
  /** While dragging: the piece's centre minus the point on the ground that was grabbed. */
  const grab = useRef<{ x: number; z: number } | null>(null)
  const { width, depth, height } = object.size
  const parts = useMemo(() => objectParts(object), [object.kind, width, depth, height]) // eslint-disable-line react-hooks/exhaustive-deps
  const accent = useMemo(
    () => `#${new Color(object.material.color).lerp(new Color('#ffffff'), 0.55).getHexString()}`,
    [object.material.color],
  )

  const groundPoint = (e: ThreeEvent<PointerEvent>) => e.ray.intersectPlane(GROUND, new Vector3())
  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0) return
    e.stopPropagation()
    selectObject(object.id)
    const hit = groundPoint(e)
    if (!hit) return
    grab.current = { x: object.position.x - hit.x, z: object.position.z - hit.z }
    ;(e.target as Element).setPointerCapture(e.pointerId)
    if (controls) controls.enabled = false // dragging moves the piece, not the camera
  }
  const onPointerMove = (e: ThreeEvent<PointerEvent>) => {
    const hit = grab.current && groundPoint(e)
    if (!hit) return
    const position = { x: hit.x + grab.current!.x, z: hit.z + grab.current!.z }
    // Holding Alt moves the piece freely.
    const snap = e.nativeEvent.altKey ? null : snapToWalls({ ...object, position }, useStore.getState().walls, SNAP_DISTANCE)
    updateObject(object.id, snap ?? { position })
  }
  const endDrag = (e: ThreeEvent<PointerEvent>) => {
    if (!grab.current) return
    grab.current = null
    ;(e.target as Element).releasePointerCapture(e.pointerId)
    if (controls) controls.enabled = true
  }
  const handlers = interactive ? { onPointerDown, onPointerMove, onPointerUp: endDrag, onLostPointerCapture: endDrag } : {}

  return (
    // Local axes: x across the width, y up, z across the depth with the back at -z.
    <group position={[object.position.x, 0, object.position.z]} rotation-y={(object.rotation * Math.PI) / 180} {...handlers}>
      {/* Invisible bounding box: an easy target between a table's legs, and the outline. */}
      <mesh position-y={height / 2}>
        <boxGeometry args={[width, height, depth]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        {selected ? (
          <Edges color="#36c5f0" lineWidth={3} />
        ) : (
          // In Top view a piece can match the floor under it, so every piece gets a plan-style outline.
          topView && <Edges color="#2b2f36" lineWidth={1.5} />
        )}
      </mesh>
      {object.kind === 'model' && <ImportedModel object={object} />}
      {parts.map((part, i) => (
        <mesh key={i} position={part.position} castShadow receiveShadow>
          <boxGeometry args={part.size} />
          {part.accent ? (
            <meshStandardMaterial color={accent} roughness={object.material.roughness} />
          ) : (
            <Surface material={object.material} />
          )}
        </mesh>
      ))}
    </group>
  )
}
