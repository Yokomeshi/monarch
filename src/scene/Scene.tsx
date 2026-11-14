import { Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { Grid } from '@react-three/drei'
import { useStore } from '../store'
import { CameraRig } from './CameraRig'
import { Lighting } from './Lighting'
import { PlanBackdrop } from './PlanBackdrop'
import { CalibrationOverlay } from './CalibrationOverlay'
import { WallTool } from './WallTool'
import { Walls } from './Walls'
import { RoomLabels } from './RoomLabels'
import { Rooms } from './Rooms'
import { Openings } from './Openings'
import { Objects } from './Objects'
import { Lights } from './Lights'

// World units are metres; Y is up. The ground plane is y = 0.
export function Scene() {
  const plan = useStore((s) => s.plan)
  const tool = useStore((s) => s.tool)
  const selectWall = useStore((s) => s.selectWall)

  return (
    <Canvas shadows="percentage" onPointerMissed={() => selectWall(null)}>
      <CameraRig />
      <color attach="background" args={['#1b1d21']} />
      <Lighting />
      <Grid
        args={[50, 50]}
        cellSize={0.5}
        sectionSize={5}
        cellColor="#3a3f47"
        sectionColor="#5b6470"
        fadeDistance={60}
        infiniteGrid
      />
      {/* The origin marker is a drafting aid; it would stand in the middle of the room on a walk. */}
      {tool !== 'walk' && <axesHelper args={[1]} />}
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
      <Lights />
      <RoomLabels />
      {tool === 'wall' && <WallTool />}
    </Canvas>
  )
}
