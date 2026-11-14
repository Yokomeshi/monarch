import { Environment, Lightformer } from '@react-three/drei'
import { useStore } from '../store'
import { daylight, sunDirection, sunPosition } from '../model/sun'

const SUN_DISTANCE = 60 // metres from the origin; the shadow area is a 60 m square around it

/** The scene's light: a fixed default, or the sun of the sun study. */
export function Lighting() {
  const sun = useStore((s) => s.sun)

  let position: [number, number, number] = [10, 15, 5]
  let strength = 1
  // The default look is soft, with gentle shadows. A sun study wants the opposite:
  // a strong sun and little fill, so that shadows read clearly.
  const sunPower = sun.enabled ? 3 : 1.5
  const fill = sun.enabled ? 0.4 : 1
  if (sun.enabled) {
    const at = sunPosition(sun.latitude, sun.day, sun.hour)
    const d = sunDirection(at, sun.north)
    strength = daylight(at.altitude)
    // Kept just above the horizon so the light always has a valid direction; at night its strength is zero.
    position = [d.x * SUN_DISTANCE, Math.max(d.y, 0.01) * SUN_DISTANCE, d.z * SUN_DISTANCE]
  }

  return (
    <>
      <ambientLight intensity={(0.05 + 0.2 * strength) * fill} />
      {/* A built-in studio for surfaces to reflect; without it metals render black. Dimmed at night. */}
      <Environment resolution={64} environmentIntensity={(0.15 + 0.85 * strength) * fill}>
        <color attach="background" args={['#6b7078']} />
        <Lightformer form="rect" intensity={3} position={[0, 8, 0]} rotation-x={Math.PI / 2} scale={[12, 12, 1]} />
        <Lightformer form="rect" intensity={1.5} position={[-8, 3, 0]} rotation-y={Math.PI / 2} scale={[12, 6, 1]} />
        <Lightformer form="rect" intensity={1} position={[8, 3, 0]} rotation-y={-Math.PI / 2} scale={[12, 6, 1]} />
        <Lightformer form="rect" intensity={1} position={[0, 3, 8]} rotation-y={Math.PI} scale={[12, 6, 1]} />
        <Lightformer form="rect" intensity={1.5} position={[0, 3, -8]} scale={[12, 6, 1]} />
      </Environment>
      <directionalLight
        position={position}
        intensity={sunPower * strength}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-30}
        shadow-camera-right={30}
        shadow-camera-top={30}
        shadow-camera-bottom={-30}
      />
    </>
  )
}
