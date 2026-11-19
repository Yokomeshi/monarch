import { Scene } from './scene/Scene'
import { Inspector, Sidebar } from './ui/Sidebar'
import { ViewToolbar } from './ui/ViewToolbar'
import { useStore } from './store'

export function App() {
  const tool = useStore((s) => s.tool)
  return (
    <div className="app">
      <Sidebar />
      <main className={`viewport tool-${tool}`}>
        <Scene />
        <ViewToolbar />
        {tool === 'walk' && (
          <div className="walk-help">
            <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> or arrow keys to move · <kbd>Shift</kbd> to go faster ·
            drag to look · click a floor to go there · <kbd>Esc</kbd> to leave
          </div>
        )}
      </main>
      <aside className="inspector">
        <Inspector />
      </aside>
    </div>
  )
}
