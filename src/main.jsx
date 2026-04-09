import React, { useMemo, useState } from 'react'
import ReactDOM from 'react-dom/client'
import './styles.css'
import { games } from './games'

function isProbablyHtml(input) {
  const text = input.trim()
  if (!text) return false

  return /<(html|body|head|div|canvas|script|style|main|section)\b/i.test(text) || /<!doctype html>/i.test(text)
}

function createPreviewDocument(html) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Pasted HTML Preview</title>
    <style>
      html, body {
        margin: 0;
        width: 100%;
        height: 100%;
        background: #020617;
      }
    </style>
  </head>
  <body>
${html}
  </body>
</html>`
}

function App() {
  const [pasteValue, setPasteValue] = useState('')
  const [pasteError, setPasteError] = useState('')
  const [previewUrl, setPreviewUrl] = useState('')
  const [showPastePanel, setShowPastePanel] = useState(false)

  const gameCountLabel = useMemo(() => `${games.length} game${games.length === 1 ? '' : 's'} ready`, [])

  function handleLoadPastedHtml() {
    if (!isProbablyHtml(pasteValue)) {
      setPasteError('That does not look like HTML yet. Paste a full HTML snippet or page.')
      return
    }

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl)
    }

    const blob = new Blob([createPreviewDocument(pasteValue)], { type: 'text/html' })
    const nextUrl = URL.createObjectURL(blob)

    setPreviewUrl(nextUrl)
    setPasteError('')
  }

  function handleClosePreview() {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl)
      setPreviewUrl('')
    }
  }

  return (
    <>
      <main className="app-shell">
        <section className="hero-card">
          <div className="hero-row">
            <div>
              <p className="eyebrow">oneshot-testers</p>
              <h1>One-page game test hub</h1>
              <p className="intro">
                Tap a game to open its standalone HTML page. Any new <code>.html</code> file dropped into the games folder will show up automatically on the next deploy.
              </p>
            </div>

            <button
              type="button"
              className="paste-toggle"
              onClick={() => setShowPastePanel((current) => !current)}
            >
              {showPastePanel ? 'Hide paste loader' : 'Paste HTML'}
            </button>
          </div>

          <div className="meta-row">
            <span className="meta-pill">{gameCountLabel}</span>
            <span className="meta-pill">Mobile-friendly launcher</span>
          </div>
        </section>

        {showPastePanel && (
          <section className="paste-card">
            <div className="paste-header">
              <h2>Load pasted HTML</h2>
              <p>
                Paste HTML below and open it locally in your browser without adding it to the repo.
              </p>
            </div>

            <textarea
              className="paste-input"
              value={pasteValue}
              onChange={(event) => setPasteValue(event.target.value)}
              placeholder="Paste a full HTML document or snippet here..."
              spellCheck={false}
            />

            <div className="paste-actions">
              <button type="button" className="primary-button" onClick={handleLoadPastedHtml}>
                Open pasted HTML
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setPasteValue('')
                  setPasteError('')
                  handleClosePreview()
                }}
              >
                Clear
              </button>
            </div>

            {pasteError && <p className="paste-error">{pasteError}</p>}
          </section>
        )}

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

      {previewUrl && (
        <section className="preview-overlay" aria-label="Pasted HTML preview">
          <div className="preview-shell">
            <div className="preview-toolbar">
              <strong>Pasted HTML preview</strong>
              <button type="button" className="secondary-button" onClick={handleClosePreview}>
                Close preview
              </button>
            </div>
            <iframe
              className="preview-frame"
              src={previewUrl}
              title="Pasted HTML preview"
              sandbox="allow-scripts allow-pointer-lock allow-same-origin"
            />
          </div>
        </section>
      )}
    </>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
