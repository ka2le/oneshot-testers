import React, { useEffect, useMemo, useState } from "react";
import ReactDOM from "react-dom/client";
import "./styles.css";
import { PasteDialog, CompareWorkspace } from "./Workspaces";
import {
  games,
  filterGames,
  byName,
  buildLabel,
  familyColor,
  ringColor,
  UNSPECIFIED,
} from "./games";

const initial = new URLSearchParams(location.search);
const groupBy = (list, key) => {
  const map = new Map();
  for (const item of list) {
    const k = key(item);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(item);
  }
  return map;
};

// Families ordered by size, Unspecified last; each with its models.
const familyTree = [...groupBy(games, (g) => g.family)]
  .map(([family, items]) => ({
    family,
    count: items.length,
    models: [...groupBy(items, (g) => g.model)]
      .map(([model, list]) => ({ model, count: list.length }))
      .sort((a, b) => byName(a.model, b.model)),
  }))
  .sort(
    (a, b) =>
      (a.family === UNSPECIFIED) - (b.family === UNSPECIFIED) ||
      b.count - a.count ||
      a.family.localeCompare(b.family),
  );

// "Original" first, then natural order (v2 < v10).
const byBuild = (a, b) => {
  const x = buildLabel(a),
    y = buildLabel(b);
  return (
    (y === "Original") - (x === "Original") ||
    x.localeCompare(y, undefined, { numeric: true, sensitivity: "base" })
  );
};

function Logo() {
  const C = 157.08,
    seg = C / 5,
    dash = seg * 0.88;
  return (
    <svg className="logo" viewBox="0 0 64 64" aria-hidden="true">
      {["#0081c8", "#f4a300", "#1d1d1f", "#00a651", "#ee334e"].map((c, i) => (
        <circle
          key={c}
          cx="32"
          cy="32"
          r="25"
          fill="none"
          stroke={c}
          strokeWidth="7"
          strokeDasharray={`${dash} ${C - dash}`}
          strokeDashoffset={C / 4 - i * seg}
        />
      ))}
      <path d="M28.5 25.5 35 21h3v22h-5V27.6l-4.5 2.6z" />
    </svg>
  );
}

function Card({ title, subtitle, color, rows, rowColor, selected, toggleCompare }) {
  const [open, setOpen] = useState(false);
  const limit = 7;
  const shown = open ? rows : rows.slice(0, limit);
  const total = rows.reduce((n, [, items]) => n + items.length, 0);
  return (
    <article className="card" style={{ "--c": color }}>
      <header className="cover">
        <div>
          <h2>{title}</h2>
          {subtitle && <span className="sub">{subtitle}</span>}
        </div>
        <span className="count" title={`${total} builds`}>
          {total}
        </span>
      </header>
      <ul className="rows">
        {shown.map(([name, items]) => (
          <li
            key={name}
            className={name === UNSPECIFIED ? "row unspecified" : "row"}
          >
            <span className="name">
              {rowColor && <i className="dot" style={{ background: rowColor(items[0]) }} />}
              {name}
            </span>
            <div className="build-options">
              {items.map((item) => <div className="build-option" key={item.id}>
                <a className="build" href={item.href} title={item.file} aria-label={`Play ${item.game}, ${item.model}, ${buildLabel(item)}`}>{buildLabel(item)}</a>
                <button className="compare-pick" aria-label={`Compare ${item.game}, ${item.model}, ${buildLabel(item)}, ${item.file}`} aria-pressed={selected.includes(item.id)} disabled={selected.length === 2 && !selected.includes(item.id)} onClick={() => toggleCompare(item.id)}>{selected.includes(item.id) ? "Selected" : "Compare"}</button>
              </div>)}
            </div>
          </li>
        ))}
      </ul>
      {rows.length > limit && (
        <button className="more" onClick={() => setOpen(!open)}>
          {open ? "Show less" : `+${rows.length - limit} more`}
        </button>
      )}
    </article>
  );
}

function App() {
  const [mode, setMode] = useState(
    initial.get("view") === "model" ? "model" : "game",
  );
  const [family, setFamily] = useState(initial.get("family") || "");
  const [model, setModel] = useState(initial.get("model") || "");
  const [search, setSearch] = useState(initial.get("q") || "");
  const [paste, setPaste] = useState(false);
  const [htmlDraft, setHtmlDraft] = useState("");
  const [selected, setSelected] = useState(() => [...new Set(initial.getAll("compare"))].filter((id) => games.some((g) => g.id === id)).slice(0, 2));
  const [comparing, setComparing] = useState(false);
  const toggleCompare = (id) => setSelected((ids) => ids.includes(id) ? ids.filter((value) => value !== id) : ids.length < 2 ? [...ids, id] : ids);

  const filtered = useMemo(
    () => filterGames(games, { family, model, search }),
    [family, model, search],
  );

  const cards = useMemo(() => {
    const primary = mode === "game" ? "game" : "model";
    const secondary = mode === "game" ? "model" : "game";
    return [...groupBy(filtered, (g) => g[primary])]
      .sort(([a], [b]) => byName(a, b))
      .map(([title, items]) => ({
        title,
        items,
        rows: [...groupBy(items, (g) => g[secondary])]
          .sort(([a], [b]) => byName(a, b))
          .map(([name, list]) => [name, [...list].sort(byBuild)]),
      }));
  }, [filtered, mode]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (mode === "model") params.set("view", "model");
    for (const [key, value] of Object.entries({ family, model, q: search }))
      if (value) params.set(key, value);
    for (const id of selected) params.append("compare", id);
    const query = params.toString();
    history.replaceState(null, "", query ? `?${query}` : location.pathname);
  }, [mode, family, model, search, selected]);

  const pickFamily = (name) => {
    setFamily(family === name && !model ? "" : name);
    setModel("");
  };
  const pickModel = (fam, name) => {
    setFamily(fam);
    setModel(model === name ? "" : name);
  };
  const activeFamily = familyTree.find((f) => f.family === family);

  return (
    <div className="page">
      <div className="stripe" aria-hidden="true">
        <i /><i /><i /><i /><i />
      </div>
      <header className="top">
        <a className="brand" href={import.meta.env.BASE_URL}>
          <Logo />
          <span>OneShots</span>
        </a>
        <input
          className="search"
          type="search"
          placeholder="Search"
          aria-label="Search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button
          className="ghost"
          onClick={() => setPaste(true)}
          aria-label="Paste HTML"
        >
          <span className="long">Paste HTML</span>
          <span className="short" aria-hidden="true">
            &lt;/&gt;
          </span>
        </button>
      </header>

      <div className="layout">
        <nav className="models" aria-label="Models">
          <button
            className="fam"
            aria-pressed={!family}
            onClick={() => {
              setFamily("");
              setModel("");
            }}
          >
            <span>All</span>
            <em>{games.length}</em>
          </button>
          {familyTree.map((f) => (
            <div className="fam-group" key={f.family}>
              <button
                className="fam"
                aria-pressed={family === f.family && !model}
                aria-expanded={family === f.family}
                onClick={() => pickFamily(f.family)}
              >
                <i className="dot" style={{ background: familyColor(f.family) }} />
                <span>{f.family}</span>
                <em>{f.count}</em>
              </button>
              {family === f.family && f.family !== UNSPECIFIED && (
                <div className="model-list">
                  {f.models.map((m) => (
                    <button
                      key={m.model}
                      aria-pressed={model === m.model}
                      onClick={() => pickModel(f.family, m.model)}
                    >
                      <span>{m.model}</span>
                      <em>{m.count}</em>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </nav>

        {/* Mobile: chip rows instead of the sidebar */}
        <div className="chips" aria-label="Models">
          <div className="chip-row">
            <button aria-pressed={!family} onClick={() => pickFamily("")}>
              All
            </button>
            {familyTree.map((f) => (
              <button
                key={f.family}
                aria-pressed={family === f.family}
                onClick={() => pickFamily(f.family)}
              >
                <i className="dot" style={{ background: familyColor(f.family) }} />
                {f.family}
              </button>
            ))}
          </div>
          {activeFamily && activeFamily.family !== UNSPECIFIED && (
            <div className="chip-row sub">
              {activeFamily.models.map((m) => (
                <button
                  key={m.model}
                  aria-pressed={model === m.model}
                  onClick={() => pickModel(family, m.model)}
                >
                  {m.model}
                </button>
              ))}
            </div>
          )}
        </div>

        <main>
          <div className="toolbar">
            <div className="tabs" role="group" aria-label="Group by">
              <button
                aria-pressed={mode === "game"}
                onClick={() => setMode("game")}
              >
                Games
              </button>
              <button
                aria-pressed={mode === "model"}
                onClick={() => setMode("model")}
              >
                Models
              </button>
            </div>
            {(family || model || search) && (
              <button
                className="clear"
                onClick={() => {
                  setFamily("");
                  setModel("");
                  setSearch("");
                }}
              >
                {[model || family, search && `“${search}”`]
                  .filter(Boolean)
                  .join(" · ")}{" "}
                <span aria-hidden="true">×</span>
                <span className="sr-only">Clear filters</span>
              </button>
            )}
          </div>

          <div className="grid">
            {cards.map((card) =>
              mode === "game" ? (
                <Card
                  key={card.title}
                  title={card.title}
                  color={ringColor(card.title)}
                  selected={selected}
                  toggleCompare={toggleCompare}
                  rows={card.rows}
                  rowColor={(item) => familyColor(item.family)}
                />
              ) : (
                <Card
                  key={card.title}
                  title={card.title}
                  subtitle={
                    card.title === UNSPECIFIED ? "" : card.items[0].family
                  }
                  color={familyColor(card.items[0].family)}
                  selected={selected}
                  toggleCompare={toggleCompare}
                  rows={card.rows}
                />
              ),
            )}
          </div>
          {!cards.length && <p className="empty">Nothing found.</p>}
        </main>
      </div>

      <footer>
        <span>OneShots</span>
        <a href="https://github.com/ka2le/oneshot-testers">GitHub</a>
      </footer>
      {!!selected.length && <aside className="compare-tray" aria-label="Selected builds">
        <div className="selected-builds">{selected.map((id, i) => { const item = games.find((g) => g.id === id); return <div key={id}><span>{i ? "B" : "A"}: {item.game} · {item.model} · {buildLabel(item)}</span><button aria-label={`Remove build ${i ? "B" : "A"}`} onClick={() => toggleCompare(id)}>×</button></div>; })}</div>
        <button className="primary" disabled={selected.length !== 2} onClick={() => setComparing(true)}>{selected.length === 2 ? "Compare 2 builds" : "Choose one more build"}</button>
      </aside>}
      {paste && <PasteDialog html={htmlDraft} setHtml={setHtmlDraft} onClose={() => setPaste(false)} />}
      {comparing && selected.length === 2 && <CompareWorkspace selected={selected} onChange={setSelected} onClose={() => setComparing(false)} />}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
