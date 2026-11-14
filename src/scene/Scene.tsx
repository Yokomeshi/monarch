import { Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { Environment, Grid, Lightformer } from '@react-three/drei'
import { useStore } from '../store'
import { CameraRig } from './CameraRig'
import { PlanBackdrop } from './PlanBackdrop'
import { CalibrationOverlay } from './CalibrationOverlay'
import { WallTool } from './WallTool'
import { Walls } from './Walls'
import { RoomLabels } from './RoomLabels'
import { Rooms } from './Rooms'
import { Openings } from './Openings'
import { Objects } from './Objects'

// World units are metres; Y is up. The ground plane is y = 0.
export function Scene() {
  const plan = useStore((s) => s.plan)
  const tool = useStore((s) => s.tool)
  const selectWall = useStore((s) => s.selectWall)

  return (
    <Canvas shadows="percentage" onPointerMissed={() => selectWall(null)}>
      <CameraRig />
      <color attach="background" args={['#1b1d21']} />
      <ambientLight intensity={0.25} />
      {/* A built-in studio for surfaces to reflect; without it metals render black. */}
      <Environment resolution={64}>
        <color attach="background" args={['#6b7078']} />
        <Lightformer form="rect" intensity={3} position={[0, 8, 0]} rotation-x={Math.PI / 2} scale={[12, 12, 1]} />
        <Lightformer form="rect" intensity={1.5} position={[-8, 3, 0]} rotation-y={Math.PI / 2} scale={[12, 6, 1]} />
        <Lightformer form="rect" intensity={1} position={[8, 3, 0]} rotation-y={-Math.PI / 2} scale={[12, 6, 1]} />
        <Lightformer form="rect" intensity={1} position={[0, 3, 8]} rotation-y={Math.PI} scale={[12, 6, 1]} />
        <Lightformer form="rect" intensity={1.5} position={[0, 3, -8]} scale={[12, 6, 1]} />
      </Environment>
      <directionalLight
        position={[10, 15, 5]}
        intensity={1.5}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-30}
        shadow-camera-right={30}
        shadow-camera-top={30}
        shadow-camera-bottom={-30}
      />
      <Grid
        args={[50, 50]}
        cellSize={0.5}
        sectionSize={5}
        cellColor="#3a3f47"
        sectionColor="#5b6470"
        fadeDistance={60}
        infiniteGrid
      />
      <axesHelper args={[1]} />
      {plan && (
        <Suspense fallback={null}>
          <PlanBackdrop key={plan.url} plan={plan} />
          <CalibrationOverlay plan={plan} />
        </Suspense>
      )}
      <Rooms />
      <Walls />
      <Openings />
      <Objects />
      <RoomLabels />
      {tool === 'wall' && <WallTool />}
    </Canvas>
  )
}
