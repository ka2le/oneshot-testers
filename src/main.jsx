import React, { useEffect, useMemo, useState } from "react";
import ReactDOM from "react-dom/client";
import "./styles.css";
import { games, unique, filterGames } from "./games";

const initial = new URLSearchParams(location.search);
function App() {
  const [mode, setMode] = useState(
    initial.get("view") === "model" ? "model" : "game",
  );
  const [family, setFamily] = useState(initial.get("family") || "");
  const [model, setModel] = useState(initial.get("model") || "");
  const [game, setGame] = useState(initial.get("game") || "");
  const [search, setSearch] = useState(initial.get("q") || "");
  const [paste, setPaste] = useState(false);
  const [html, setHtml] = useState("");
  const [error, setError] = useState("");
  const [preview, setPreview] = useState("");
  const families = unique(games.map((g) => g.family));
  const models = unique(
    games.filter((g) => !family || g.family === family).map((g) => g.model),
  );
  const gameNames = unique(games.map((g) => g.game));
  const filtered = useMemo(
    () => filterGames(games, { mode, family, model, game, search }),
    [mode, family, model, game, search],
  );
  const groups = Object.groupBy(filtered, (g) =>
    mode === "game" ? g.game : `${g.family} / ${g.model}`,
  );

  useEffect(() => {
    const params = new URLSearchParams({ view: mode });
    for (const [key, value] of Object.entries({
      family,
      model,
      game,
      q: search,
    }))
      if (value) params.set(key, value);
    history.replaceState(null, "", `?${params}`);
  }, [mode, family, model, game, search]);
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  useEffect(() => {
    const close = (e) => {
      if (e.key === "Escape") setPreview("");
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, []);
  function openPaste() {
    if (
      !/<(?:!doctype|html|body|head|div|canvas|script|style|main|section)\b/i.test(
        html,
      )
    ) {
      setError("Paste an HTML document or snippet to preview.");
      return;
    }
    setError("");
    setPreview(URL.createObjectURL(new Blob([html], { type: "text/html" })));
  }
  function reset() {
    setFamily("");
    setModel("");
    setGame("");
    setSearch("");
  }

  return (
    <main className="app-shell">
      <header className="masthead">
        <a className="brand" href={import.meta.env.BASE_URL}>
          <span className="brand-icon">1</span> ONESHOTS
          <span className="brand-note">THE GAME ARCHIVE</span>
        </a>
        <button onClick={() => setPaste(!paste)} aria-expanded={paste}>
          Paste HTML
        </button>
      </header>
      <section className="intro">
        <p className="eyebrow">ONE PROMPT. MANY POSSIBILITIES.</p>
        <h1>
          Same idea.
          <br />
          <span>Different minds.</span>
        </h1>
        <p>
          Explore little games made by AI. Follow a model, or pick a game and
          see how each model plays it.
        </p>
        <div className="stats">
          <span>
            <b>{games.length}</b> versions
          </span>
          <span>
            <b>{gameNames.length}</b> games
          </span>
          <span>
            <b>{families.filter((f) => f !== "Unspecified").length}</b> model
            families
          </span>
        </div>
      </section>
      {paste && (
        <section className="panel paste-panel">
          <h2>Try something new</h2>
          <p>Preview pasted HTML in this browser.</p>
          <label htmlFor="paste-html">HTML document</label>
          <textarea
            id="paste-html"
            value={html}
            onChange={(e) => setHtml(e.target.value)}
            placeholder="<!doctype html>…"
            spellCheck={false}
          />
          <div className="actions">
            <button className="primary" onClick={openPaste}>
              Open preview
            </button>
            <button
              onClick={() => {
                setHtml("");
                setError("");
              }}
            >
              Clear
            </button>
          </div>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
        </section>
      )}
      <section className="browser" aria-label="Browse archive">
        <div className="browse-top">
          <div className="switch" role="group" aria-label="Browse by">
            <button
              aria-pressed={mode === "game"}
              onClick={() => setMode("game")}
            >
              By game
            </button>
            <button
              aria-pressed={mode === "model"}
              onClick={() => setMode("model")}
            >
              By model
            </button>
          </div>
          <label className="search">
            <span className="sr-only">Search archive</span>
            <input
              type="search"
              placeholder="Search games, models, versions…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
        </div>
        <div className="filters">
          {mode === "game" ? (
            <label>
              Game
              <select value={game} onChange={(e) => setGame(e.target.value)}>
                <option value="">All games</option>
                {gameNames.map((name) => (
                  <option key={name}>{name}</option>
                ))}
              </select>
            </label>
          ) : (
            <>
              <label>
                Model family
                <select
                  value={family}
                  onChange={(e) => {
                    setFamily(e.target.value);
                    setModel("");
                  }}
                >
                  <option value="">All families</option>
                  {families.map((name) => (
                    <option key={name}>{name}</option>
                  ))}
                </select>
              </label>
              <label>
                Model
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                >
                  <option value="">All models</option>
                  {models.map((name) => (
                    <option key={name}>{name}</option>
                  ))}
                </select>
              </label>
            </>
          )}
          <button className="text-button" onClick={reset}>
            Reset filters
          </button>
        </div>
        <div className="results-bar">
          <span>
            {filtered.length} version{filtered.length === 1 ? "" : "s"}
          </span>
          <span>
            {mode === "game"
              ? "Compare the models. Find your favorite."
              : "Everything this model made."}
          </span>
        </div>
        <div className="groups">
          {Object.entries(groups)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([name, entries]) => (
              <section className="game-group" key={name}>
                <div className="group-title">
                  <h2>{name}</h2>
                  <span>
                    {entries.length} version{entries.length === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="game-grid">
                  {entries.map((item) => (
                    <a className="game-card" href={item.href} key={item.id}>
                      <div className="card-top">
                        <span className="family" data-family={item.family}>
                          {item.family}
                        </span>
                        <span className="play-label">PLAY</span>
                      </div>
                      <h3>{mode === "game" ? item.model : item.game}</h3>
                      <p>{item.variant || "Original"}</p>
                      <span className="file-name">
                        {item.file.split("/").at(-1)}
                      </span>
                    </a>
                  ))}
                </div>
              </section>
            ))}
        </div>
        {!filtered.length && (
          <div className="empty">
            <h2>No matching games</h2>
            <p>Try another search or clear your filters.</p>
            <button onClick={reset}>Show all games</button>
          </div>
        )}
      </section>
      <footer>
        <span>ONESHOTS / Made once. Played again.</span>
        <a href="https://github.com/ka2le/oneshot-testers">Source on GitHub</a>
      </footer>
      {preview && (
        <div
          className="preview-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Pasted HTML preview"
        >
          <div className="preview-toolbar">
            <strong>Pasted HTML preview</strong>
            <button autoFocus onClick={() => setPreview("")}>
              Close preview
            </button>
          </div>
          <iframe
            src={preview}
            title="Pasted HTML preview"
            sandbox="allow-scripts allow-pointer-lock"
          />
        </div>
      )}
    </main>
  );
}
ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
