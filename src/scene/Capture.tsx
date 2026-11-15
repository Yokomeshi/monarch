import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import {
  Camera, CubeCamera, HalfFloatType, Mesh, PlaneGeometry, Scene, ShaderMaterial, Vector3, WebGLCubeRenderTarget,
} from 'three'
import { useStore } from '../store'

/** A saved view is about this many pixels wide, whatever the window's size. */
const IMAGE_WIDTH = 3840
/** A 360° panorama is twice as wide as it is high: all the way round by straight up to straight down. */
const PANORAMA = { width: 4096, height: 2048, face: 1024 }

/** Unwraps the six faces around a point into one image, with the way the camera faces (`heading`) in the middle. */
const UNWRAP = new ShaderMaterial({
  uniforms: { surroundings: { value: null }, heading: { value: 0 } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position.xy, 0.0, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    #include <common>
    uniform samplerCube surroundings;
    uniform float heading;
    varying vec2 vUv;
    void main() {
      float around = (vUv.x - 0.5) * 2.0 * PI + heading;
      float up = (vUv.y - 0.5) * PI;
      vec3 direction = vec3(cos(up) * sin(around), sin(up), -cos(up) * cos(around));
      gl_FragColor = textureCube(surroundings, direction);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
})

function download(url: string, name: string) {
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
}

/** Saves pictures of the scene on request: the current view as a large image, or a 360° panorama. */
export function Capture() {
  const request = useStore((s) => s.captureRequest)
  const { gl, scene, camera, size } = useThree()

  useEffect(() => {
    if (!request) return
    const ratio = gl.getPixelRatio()
    if (request.kind === 'image') {
      // Draw once at a higher pixel density and read the picture straight away, before the canvas is cleared.
      gl.setPixelRatio(IMAGE_WIDTH / size.width)
      gl.render(scene, camera)
      download(gl.domElement.toDataURL('image/png'), 'monarch-view.png')
    } else {
      // Everything around the camera, on the six faces of a cube. Half-float keeps bright light from clipping before tone mapping.
      const target = new WebGLCubeRenderTarget(PANORAMA.face, { type: HalfFloatType })
      const around = new CubeCamera(0.05, 1000, target)
      around.position.copy(camera.getWorldPosition(new Vector3()))
      around.update(gl, scene)
      const facing = camera.getWorldDirection(new Vector3())
      UNWRAP.uniforms.surroundings.value = target.texture
      UNWRAP.uniforms.heading.value = Math.atan2(facing.x, -facing.z)
      const page = new Scene().add(new Mesh(new PlaneGeometry(2, 2), UNWRAP))
      gl.setPixelRatio(1)
      gl.setSize(PANORAMA.width, PANORAMA.height, false)
      gl.setRenderTarget(null)
      gl.render(page, new Camera())
      download(gl.domElement.toDataURL('image/jpeg', 0.92), 'monarch-360.jpg')
      target.dispose()
      gl.setSize(size.width, size.height, false)
    }
    gl.setPixelRatio(ratio)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only a new request takes a picture
  }, [request])

  return null
}
