// The page that runs inside the viewport's iframe. The agent's code is untrusted, so the iframe is
// sandboxed without allow-same-origin: it cannot reach the app, its storage or the password. It talks
// to the app only through postMessage.
//
// App -> page: { type: 'render', id, code } | { type: 'screenshot', id } | { type: 'loadModel', id, name, glb } | { type: 'measure', id }
// Page -> app: { type: 'ready' } | { type: 'done', id, error?, size?, objects? } | { type: 'shot', id, dataUrl }

// three's package exports hide these files, so they are read by path. The ES module is used
// because three.cjs is only a deprecated stub that requires it.
import threeModule from '../../node_modules/three/build/three.module.js?raw'
import threeCore from '../../node_modules/three/build/three.core.js?raw'
import gltfLoader from '../../node_modules/three/examples/jsm/loaders/GLTFLoader.js?raw'
import geometryUtils from '../../node_modules/three/examples/jsm/utils/BufferGeometryUtils.js?raw'
import skeletonUtils from '../../node_modules/three/examples/jsm/utils/SkeletonUtils.js?raw'

/** The script that sets up the renderer, orbit controls and the message handling, as plain JavaScript. */
const HARNESS = `
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
document.body.appendChild(renderer.domElement)
const scene = new THREE.Scene()
scene.background = new THREE.Color(0xe9eaec)
const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 500)

const sun = new THREE.DirectionalLight(0xffffff, 1.4)
sun.position.set(5, 10, 6)
const base = [new THREE.HemisphereLight(0xffffff, 0x9a9a9a, 1.1), sun, new THREE.GridHelper(40, 40, 0x8a8f98, 0xc4c7cc)]

// Orbit around a target: drag to turn, wheel to zoom, shift-drag to slide.
const target = new THREE.Vector3(0, 1, 0)
let yaw = 0.7, pitch = 0.5, distance = 9
function placeCamera() {
  camera.position.set(
    target.x + distance * Math.cos(pitch) * Math.sin(yaw),
    target.y + distance * Math.sin(pitch),
    target.z + distance * Math.cos(pitch) * Math.cos(yaw),
  )
  camera.lookAt(target)
}
let drag = null
addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, pan: e.shiftKey || e.button === 2 } })
addEventListener('pointerup', () => { drag = null })
addEventListener('contextmenu', (e) => e.preventDefault())
addEventListener('pointermove', (e) => {
  if (!drag) return
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y
  drag.x = e.clientX; drag.y = e.clientY
  if (drag.pan) {
    const k = distance * 0.002
    target.x -= (Math.cos(yaw) * dx) * k; target.z += (Math.sin(yaw) * dx) * k
    target.y += dy * k
  } else {
    yaw -= dx * 0.006
    pitch = Math.max(-0.05, Math.min(1.5, pitch + dy * 0.006))
  }
})
addEventListener('wheel', (e) => { distance = Math.max(0.5, Math.min(80, distance * Math.exp(e.deltaY * 0.001))) }, { passive: true })

function resize() {
  renderer.setSize(innerWidth, innerHeight)
  camera.aspect = innerWidth / Math.max(innerHeight, 1)
  camera.updateProjectionMatrix()
}
addEventListener('resize', resize)
resize()

function draw() { placeCamera(); renderer.render(scene, camera) }
;(function loop() { draw(); requestAnimationFrame(loop) })()

function clear() {
  for (const child of [...scene.children]) {
    if (base.includes(child)) continue
    scene.remove(child)
    child.traverse((o) => {
      o.geometry?.dispose()
      for (const m of [].concat(o.material ?? [])) m.dispose()
    })
  }
}

// 3D models made from photos, by name. They survive each render, so the code can clone them into a new scene.
const models = {}
function loadModel(name, glb) {
  return new Promise((resolve, reject) => {
    new GLTFLoader().parse(glb, '', (gltf) => {
      // Stand it on the floor at the origin, so placing it is only a matter of moving the wrapper.
      const box = new THREE.Box3().setFromObject(gltf.scene)
      const size = box.getSize(new THREE.Vector3()), middle = box.getCenter(new THREE.Vector3())
      gltf.scene.position.set(-middle.x, -box.min.y, -middle.z)
      const wrapper = new THREE.Group()
      wrapper.add(gltf.scene)
      models[name] = wrapper
      resolve([size.x, size.y, size.z])
    }, reject)
  })
}

// Helpers for the agent's code. Axes: x is width, y is up, z is depth, and the floor is y = 0.

/** A room centred on the origin: a floor and four walls that face inward, so from outside the walls cannot be seen (a dollhouse view). */
function room(width, depth, height) {
  const group = new THREE.Group()
  group.name = 'room'
  const wall = new THREE.MeshStandardMaterial({ color: 0xf2efe9 })
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), new THREE.MeshStandardMaterial({ color: 0xd9c8a9 }))
  floor.rotation.x = -Math.PI / 2
  group.add(floor)
  for (const [w, x, z, turn] of [[width, 0, -depth / 2, 0], [width, 0, depth / 2, Math.PI], [depth, -width / 2, 0, Math.PI / 2], [depth, width / 2, 0, -Math.PI / 2]]) {
    const side = new THREE.Mesh(new THREE.PlaneGeometry(w, height), wall)
    side.position.set(x, height / 2, z)
    side.rotation.y = turn
    group.add(side)
  }
  scene.add(group)
  return group
}

/**
 * Scales an object to exact sizes in metres: { x: width, y: height, z: depth }. A size left out follows the
 * average scale of the ones given, so the object is not squashed. Returns the size it now has.
 */
function fit(object, sizes) {
  const size = new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3())
  const wanted = { x: sizes.x, y: sizes.y, z: sizes.z }
  const factors = ['x', 'y', 'z'].filter((a) => wanted[a] > 0).map((a) => wanted[a] / size[a])
  if (factors.length === 0) return size
  const mean = factors.reduce((a, b) => a + b, 0) / factors.length
  const k = (a) => (wanted[a] > 0 ? wanted[a] / size[a] : mean)
  object.scale.multiply(new THREE.Vector3(k('x'), k('y'), k('z')))
  return new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3())
}

/** Every named object in the scene, with its size and where it is, in metres. */
function measure() {
  return scene.children.filter((o) => !base.includes(o) && o.name).map((o) => {
    const box = new THREE.Box3().setFromObject(o)
    const size = box.getSize(new THREE.Vector3())
    return { name: o.name, size: [size.x, size.y, size.z], min: [box.min.x, box.min.y, box.min.z], max: [box.max.x, box.max.y, box.max.z] }
  })
}

/** Points the camera at what the scene holds, from far enough to see all of it. */
function frame() {
  const box = new THREE.Box3()
  for (const o of scene.children) if (!base.includes(o)) box.expandByObject(o)
  if (box.isEmpty()) return
  box.getCenter(target)
  const radius = box.getSize(new THREE.Vector3()).length() / 2
  if (radius > 0) distance = Math.max(2, Math.min(80, (radius / Math.sin((camera.fov * Math.PI) / 360)) * 1.1))
}

function render(code) {
  clear()
  for (const o of base) if (!scene.children.includes(o)) scene.add(o)
  target.set(0, 1, 0); yaw = 0.7; pitch = 0.5; distance = 9
  new Function('THREE', 'scene', 'camera', 'renderer', 'models', 'room', 'fit', code)(THREE, scene, camera, renderer, models, room, fit)
  frame()
}

function screenshot() {
  draw()
  const scale = Math.min(1, 768 / Math.max(renderer.domElement.width, renderer.domElement.height))
  const copy = document.createElement('canvas')
  copy.width = Math.round(renderer.domElement.width * scale)
  copy.height = Math.round(renderer.domElement.height * scale)
  copy.getContext('2d').drawImage(renderer.domElement, 0, 0, copy.width, copy.height)
  return copy.toDataURL('image/jpeg', 0.85)
}

addEventListener('message', (e) => {
  const { type, id, code, name } = e.data ?? {}
  if (type === 'render') {
    try { render(String(code)); parent.postMessage({ type: 'done', id }, '*') }
    catch (err) { parent.postMessage({ type: 'done', id, error: String(err && err.stack ? err.stack : err).slice(0, 1500) }, '*') }
  } else if (type === 'loadModel') {
    loadModel(String(name), e.data.glb).then(
      (size) => parent.postMessage({ type: 'done', id, size }, '*'),
      (err) => parent.postMessage({ type: 'done', id, error: String((err && err.message) || err).slice(0, 500) }, '*'),
    )
  } else if (type === 'measure') {
    parent.postMessage({ type: 'done', id, objects: measure() }, '*')
  } else if (type === 'screenshot') {
    parent.postMessage({ type: 'shot', id, dataUrl: screenshot() }, '*')
  }
})
parent.postMessage({ type: 'ready' }, '*')
`

/** Text for inside a <script> as a string literal: a script cannot contain its own closing tag or an HTML comment opener. */
const literal = (text: string) => JSON.stringify(text).replaceAll('</script', '<\\/script').replaceAll('<!--', '<\\!--')

/**
 * Loads three.js from its own source text, then runs the harness. The sandboxed page has no origin
 * to fetch files from, but blob: URLs it makes itself can be imported, so it needs no network.
 */
const BOOT = `
const patch = (source, imports) => {
  for (const [from, to] of Object.entries(imports)) source = source.split("'" + from + "'").join(JSON.stringify(to))
  return source
}
const blob = (text) => URL.createObjectURL(new Blob([text], { type: 'text/javascript' }))
const three = blob(patch(MODULE, { './three.core.js': blob(CORE) }))
const utils = blob(patch(GEOMETRY_UTILS, { three }))
const skeleton = blob(patch(SKELETON_UTILS, { three }))
const loader = blob(patch(GLTF, { three, '../utils/BufferGeometryUtils.js': utils, '../utils/SkeletonUtils.js': skeleton }))
Promise.all([import(three), import(loader)]).then(([module, gltf]) => {
  window.THREE = module
  window.GLTFLoader = gltf.GLTFLoader
  const script = document.createElement('script')
  script.textContent = HARNESS
  document.body.appendChild(script)
})
`

/** The document for the iframe's srcdoc. three.js is inlined, so the viewport works offline. */
export const viewportDocument = (): string =>
  `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;height:100%;overflow:hidden}canvas{display:block}</style>` +
  `<script>const CORE=${literal(threeCore)},MODULE=${literal(threeModule)},GLTF=${literal(gltfLoader)},GEOMETRY_UTILS=${literal(geometryUtils)},SKELETON_UTILS=${literal(skeletonUtils)},HARNESS=${literal(HARNESS)};${BOOT}</script>`
