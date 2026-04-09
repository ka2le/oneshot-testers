import React from 'react'
import ReactDOM from 'react-dom/client'
import './styles.css'
import { games } from './games'

function App() {
  return (
    <main className="app-shell">
      <section className="hero-card">
        <p className="eyebrow">oneshot-testers</p>
        <h1>One-page game test hub</h1>
        <p className="intro">
          Tap a game to open its standalone HTML page. This list is meant to grow as new test files get dropped into the project.
        </p>
      </section>

      <section className="list-card">
        <ul className="game-list">
          {games.map((game) => (
            <li key={game.slug}>
              <a className="game-link" href={game.href}>
                <span className="game-name">{game.name}</span>
                <span className="game-arrow" aria-hidden="true">→</span>
              </a>
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
