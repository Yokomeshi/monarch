import { Scene } from './scene/Scene'
import { Sidebar } from './ui/Sidebar'

export function App() {
  return (
    <div className="app">
      <Sidebar />
      <main className="viewport">
        <Scene />
      </main>
    </div>
  )
}
