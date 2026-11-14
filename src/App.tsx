import { Scene } from './scene/Scene'
import { Sidebar } from './ui/Sidebar'
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
      </main>
    </div>
  )
}
