import React, { useEffect, useRef, useState } from "react";
import { games, buildLabel } from "./games";

function Modal({ title, onClose, children, className = "" }) {
  const dialog = useRef(null);
  useEffect(() => {
    const element = dialog.current;
    element.showModal();
    return () => element.close();
  }, []);
  return <dialog ref={dialog} className={`workspace ${className}`} aria-label={title} onClose={onClose}>
    {children}
  </dialog>;
}

export function PasteDialog({ html, setHtml, onClose }) {
  const [preview, setPreview] = useState("");
  const editor = useRef(null);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  useEffect(() => { if (!preview) editor.current?.focus(); }, [preview]);
  return <Modal title="Paste HTML" onClose={onClose} className={preview ? "play-workspace" : "paste-workspace"}>
    <header className="workspace-head">
      <h2>{preview ? "HTML preview" : "Paste HTML"}</h2>
      <div className="workspace-actions">
        {preview && <button onClick={() => setPreview("")}>Back to edit</button>}
        <button onClick={onClose}>Close</button>
      </div>
    </header>
    {preview ? <iframe src={preview} title="Pasted HTML preview" sandbox="allow-scripts allow-pointer-lock" /> : <>
      <p className="workspace-note">Temporary preview; nothing is published. Your draft stays here until this page reloads. Include assets in the HTML or use the local uploader for a folder.</p>
      <textarea ref={editor} value={html} onChange={(e) => setHtml(e.target.value)} placeholder="Paste HTML…" spellCheck={false} aria-label="HTML" />
      <div className="workspace-actions editor-actions">
        <button onClick={() => { setHtml(""); editor.current?.focus(); }} disabled={!html}>Discard code</button>
        <button className="primary" disabled={!/<[a-z!]/i.test(html)} onClick={() => setPreview(URL.createObjectURL(new Blob([html], { type: "text/html" })))}>Preview</button>
      </div>
    </>}
  </Modal>;
}

export function CompareWorkspace({ selected, onChange, onClose }) {
  const [active, setActive] = useState(null);
  const [run, setRun] = useState(0);
  const [fit, setFit] = useState(true);
  const [scale, setScale] = useState(1);
  const stage = useRef(null);
  const items = selected.map((id) => games.find((g) => g.id === id));
  const playing = active === null ? null : items[active];
  useEffect(() => {
    if (!playing || !stage.current) return;
    const observer = new ResizeObserver(([entry]) => {
      setScale(Math.min(entry.contentRect.width / 960, entry.contentRect.height / 900, 1));
    });
    observer.observe(stage.current);
    return () => observer.disconnect();
  }, [playing?.id]);
  return <Modal title="Compare builds" onClose={onClose} className="play-workspace compare-workspace">
    <header className="workspace-head"><h2>Compare builds</h2><button onClick={onClose}>Back to archive</button></header>
    <p className="workspace-note">Try one build at a time. Switching restarts the game. These saved artifacts may use different prompts or revisions.</p>
    <div className="compare-identities">
      {items.map((item, index) => <section className="compare-identity" key={index} aria-label={`Build ${index ? "B" : "A"}`}>
        <label className="build-picker">{index ? "B" : "A"} · Choose build
          <select aria-label={`Choose build ${index ? "B" : "A"}`} value={selected[index]} onChange={(e) => {
            if (active === index) setActive(null);
            onChange(selected.map((id, i) => i === index ? e.target.value : id));
          }}>
            {games.filter((g) => g.id !== selected[1 - index]).map((g) => <option key={g.id} value={g.id}>{g.game} — {g.model} — {buildLabel(g)} — {g.file}</option>)}
          </select>
        </label>
        <strong>{item.game}</strong>
        <p className="model-credit">Model: {item.model}</p>
        <p className="build-credit">Game build: {item.variant || "Original"} · Quant: {item.quant || "Not specified"}</p>
        <details><summary>File details</summary><p className="file-path">{item.file}</p><p>Family: {item.family}</p></details>
        <div className="workspace-actions">
          <button aria-pressed={active === index} onClick={() => { setActive(index); setRun((n) => n + 1); }}>{active === index ? "Restart" : "Try"} {index ? "B" : "A"}</button>
          <a href={item.href} target="_blank" rel="noopener">Open original ↗</a>
        </div>
      </section>)}
    </div>
    {playing ? <>
      <div className="playing-label"><span>Playing {active ? "B" : "A"}: {playing.game} · {playing.model} · {buildLabel(playing)}</span><label><input type="checkbox" checked={fit} onChange={(e) => setFit(e.target.checked)} /> Fit 960 × 900</label><button onClick={() => setActive(null)}>Stop</button></div>
      {/* Published archive pages retain the same origin/storage as direct play.
          Only pasted HTML and unpublished uploader previews are isolated. */}
      <div ref={stage} className={`game-stage ${fit ? "fit-game" : ""}`}>
        <iframe key={`${playing.id}-${run}`} src={playing.href} title={`Playing build ${active ? "B" : "A"}`} allow="fullscreen" style={fit ? { transform: `translate(-50%, -50%) scale(${scale})` } : undefined} />
      </div>
    </> : <div className="compare-idle">Choose Try A or Try B to play here. Both build credits stay visible.</div>}
    <p className="workspace-note playback-note">For games that need a larger window or do not work embedded, use Open original.</p>
  </Modal>;
}
