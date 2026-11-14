import { Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { Grid } from '@react-three/drei'
import { useStore } from '../store'
import { CameraRig } from './CameraRig'
import { PlanBackdrop } from './PlanBackdrop'
import { CalibrationOverlay } from './CalibrationOverlay'
import { WallTool } from './WallTool'
import { Walls } from './Walls'

// World units are metres; Y is up. The ground plane is y = 0.
export function Scene() {
  const plan = useStore((s) => s.plan)
  const tool = useStore((s) => s.tool)

  return (
    <Canvas shadows="percentage">
      <CameraRig />
      <color attach="background" args={['#1b1d21']} />
      <ambientLight intensity={0.6} />
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
      <Walls />
      {tool === 'wall' && <WallTool />}
    </Canvas>
  )
}
