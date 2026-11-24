// The page that runs inside the viewport's iframe. The agent's code is untrusted, so the iframe is
// sandboxed without allow-same-origin: it cannot reach the app, its storage or the password. It talks
// to the app only through postMessage.
//
// App -> page: { type: 'render', id, code } | { type: 'screenshot', id }
// Page -> app: { type: 'ready' } | { type: 'done', id, error? } | { type: 'shot', id, dataUrl }

// three's package exports hide these files, so they are read by path. The ES module is used
// because three.cjs is only a deprecated stub that requires it.
import threeModule from '../../node_modules/three/build/three.module.js?raw'
import threeCore from '../../node_modules/three/build/three.core.js?raw'

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

function render(code) {
  clear()
  for (const o of base) if (!scene.children.includes(o)) scene.add(o)
  target.set(0, 1, 0); yaw = 0.7; pitch = 0.5; distance = 9
  new Function('THREE', 'scene', 'camera', 'renderer', code)(THREE, scene, camera, renderer)
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
  const { type, id, code } = e.data ?? {}
  if (type === 'render') {
    try { render(String(code)); parent.postMessage({ type: 'done', id }, '*') }
    catch (err) { parent.postMessage({ type: 'done', id, error: String(err && err.stack ? err.stack : err).slice(0, 1500) }, '*') }
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
const blob = (text) => URL.createObjectURL(new Blob([text], { type: 'text/javascript' }))
const core = blob(CORE)
import(blob(MODULE.split("'./three.core.js'").join(JSON.stringify(core)))).then((module) => {
  window.THREE = module
  const script = document.createElement('script')
  script.textContent = HARNESS
  document.body.appendChild(script)
})
`

/** The document for the iframe's srcdoc. three.js is inlined, so the viewport works offline. */
export const viewportDocument = (): string =>
  `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;height:100%;overflow:hidden}canvas{display:block}</style>` +
  `<script>const CORE=${literal(threeCore)},MODULE=${literal(threeModule)},HARNESS=${literal(HARNESS)};${BOOT}</script>`
