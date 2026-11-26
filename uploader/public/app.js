const $ = (id) => document.getElementById(id);
const FIELDS = ["game", "model", "version", "quant", "variant"];
const PHASES = { check: "Checking source", import: "Preparing game files", build: "Building site", save: "Saving source commit", push: "Pushing source", publish: "Publishing to GitHub Pages", verify: "Verifying live update" };
let token,
  catalog = [],
  staged,
  jobId,
  running = false,
  staging = false;

function notice(text = "", error = false) {
  $("notice").textContent = text;
  $("notice").classList.toggle("error", error);
}
function setBusy(value) {
  $("fields").disabled = value;
  $("publish-site").disabled = value || !token;
}
async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { "X-Upload-Token": token, ...options.headers },
  });
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.error || `Request failed (${response.status})`);
    error.code = data.code;
    error.status = response.status;
    throw error;
  }
  return data;
}
const json = (data) => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(data),
});
function options(id, values) {
  $(id).replaceChildren(
    ...[...new Set(values.filter(Boolean))].sort().map((value) => {
      const option = document.createElement("option");
      option.value = value;
      return option;
    }),
  );
}

// "Claude Opus 5.5" -> ["Claude Opus", "5.5"], "Qwen3.6-35B-A3B" -> ["Qwen", "3.6-35B-A3B"]
function splitModel(model) {
  const match = /^(Claude[ -]?(?:Opus|Sonnet|Haiku)?|[A-Za-z]+)[ -]?(.*)$/.exec(
    model || "",
  );
  if (!match || model === "Unspecified") return ["", ""];
  return [match[1].replace(/-/g, " ").trim(), match[2]];
}
function composeModel() {
  const main = $("model").value.trim(),
    version = $("version").value.trim();
  if (!version) return main;
  const known = new Set(catalog.map((item) => item.model));
  const forms = [
    `${main}${version}`,
    `${main} ${version}`,
    `${main}-${version}`,
  ];
  return (
    forms.find((form) => known.has(form)) ||
    (!/\s/.test(main) && /^\d/.test(version) ? forms[0] : forms[1])
  );
}
function updateSuggestions() {
  const main = $("model").value.trim().toLowerCase();
  options(
    "version-list",
    catalog
      .map((item) => splitModel(item.model))
      .filter(([m]) => !main || m.toLowerCase() === main)
      .map(([, version]) => version),
  );
}
function saveDraft() {
  localStorage.setItem(
    "oneshots-draft",
    JSON.stringify(Object.fromEntries(FIELDS.map((id) => [id, $(id).value]))),
  );
  updateCredit();
}
function updateCredit() {
  $("credit").textContent = $("model").value.trim()
    ? `Credit: ${composeModel()}${$("quant").value.trim() ? ` · ${$("quant").value.trim()}` : ""} · Build: ${$("variant").value.trim() || "Original"}`
    : "Model version identifies the model. Game build identifies this attempt or revision.";
}
for (const id of FIELDS) $(id).addEventListener("input", saveDraft);
$("model").addEventListener("input", updateSuggestions);

function resetFiles() {
  staged = null;
  $("staged").hidden = true;
  $("drop-zone").hidden = false;
  $("deploy").disabled = true;
  $("files").value = "";
  $("folder").value = "";
  $("choose-again").hidden = true;
}
async function removeFiles() {
  if (staged) await api(`/api/uploads/${staged.id}`, { method: "DELETE" });
  resetFiles();
}
$("remove").onclick = () =>
  removeFiles()
    .then(() => notice())
    .catch((error) => notice(error.message, true));

async function stage(files) {
  if (running || staging || !files.length) return;
  staging = true;
  setBusy(true);
  try {
    if (files.length > 500)
      throw new Error("Max 500 loose files. Use a ZIP for more.");
    if (files.reduce((sum, file) => sum + file.size, 0) > 100 * 1024 * 1024)
      throw new Error("Max 100 MB.");
    notice("Uploading…");
    const body = new FormData();
    body.append(
      "paths",
      JSON.stringify(
        files.map(
          (file) => file.relativePath || file.webkitRelativePath || file.name,
        ),
      ),
    );
    for (const file of files) body.append("files", file, file.name);
    const replacement = await api("/api/uploads", { method: "POST", body });
    const previous = staged;
    staged = replacement;
    if (previous) await api(`/api/uploads/${previous.id}`, { method: "DELETE" }).catch(() => {});
    $("entry").replaceChildren(
      ...staged.entries.map((file) => {
        const option = document.createElement("option");
        option.value = option.textContent = file;
        return option;
      }),
    );
    const index = staged.entries
      .filter((file) => /(?:^|\/)index\.html$/i.test(file))
      .sort((a, b) => a.split("/").length - b.split("/").length)[0];
    if (index) $("entry").value = index;
    $("entry").hidden = staged.entries.length < 2;
    $("single-entry").hidden = staged.entries.length > 1;
    $("single-entry").textContent = staged.entries[0];
    $("file-list").replaceChildren(...staged.paths.map((file) => {
      const item = document.createElement("li");
      item.textContent = file;
      return item;
    }));
    $("file-details").open = false;
    const size =
      staged.bytes < 1024 * 1024
        ? `${Math.ceil(staged.bytes / 1024)} KB`
        : `${(staged.bytes / 1024 / 1024).toFixed(1)} MB`;
    $("file-summary").textContent =
      staged.entries.length < 2 && staged.count === 1
        ? `${staged.entries[0]} · ${size}`
        : `${staged.count} files · ${size}`;
    $("staged").hidden = false;
    $("drop-zone").hidden = true;
    $("deploy").disabled = false;
    $("choose-again").hidden = true;
    notice();
  } catch (error) {
    notice(error.message, true);
  } finally {
    // Selecting the same file again must still trigger a change event.
    $("files").value = "";
    $("folder").value = "";
    staging = false;
    setBusy(running);
  }
}
for (const id of ["files", "folder"])
  $(id).addEventListener("change", (event) => stage([...event.target.files]));
$("replace-files").onclick = $("choose-again").onclick = () => $("files").click();
$("replace-folder").onclick = () => $("folder").click();
function uploadError(error) {
  if (error.code === "UPLOAD_EXPIRED") {
    resetFiles();
    $("choose-again").hidden = false;
  }
  notice(error.message, true);
}
$("preview").onclick = async () => {
  if (!staged || running || staging) return;
  $("preview").disabled = true;
  try {
    const result = await api(`/api/uploads/${staged.id}/preview?entry=${encodeURIComponent($("entry").value)}`);
    $("preview-entry").textContent = $("entry").value;
    $("preview-frame").src = result.url;
    $("preview-dialog").showModal();
  } catch (error) { uploadError(error); }
  finally { $("preview").disabled = false; }
};
$("close-preview").onclick = () => $("preview-dialog").close();
$("preview-dialog").addEventListener("close", () => $("preview-frame").removeAttribute("src"));

// Drop anywhere on the page.
const zone = $("drop-zone");
for (const name of ["dragenter", "dragover"])
  document.addEventListener(name, (event) => {
    event.preventDefault();
    zone.classList.add("dragging");
  });
document.addEventListener("dragleave", (event) => {
  if (!event.relatedTarget) zone.classList.remove("dragging");
});
document.addEventListener("drop", async (event) => {
  event.preventDefault();
  zone.classList.remove("dragging");
  if (running || staging) return;
  try {
    const files = [];
    async function visit(entry, prefix = "") {
      if (!entry) return;
      if (entry.isFile) {
        const file = await new Promise((resolve, reject) =>
          entry.file(resolve, reject),
        );
        file.relativePath = prefix + file.name;
        files.push(file);
        if (files.length > 500)
          throw new Error("Max 500 loose files. Use a ZIP for more.");
      } else {
        const reader = entry.createReader();
        let batch;
        while (
          (batch = await new Promise((resolve, reject) =>
            reader.readEntries(resolve, reject),
          )).length
        )
          for (const child of batch)
            await visit(child, prefix + entry.name + "/");
      }
    }
    const entries = [...event.dataTransfer.items]
      .map((item) => item.webkitGetAsEntry?.())
      .filter(Boolean);
    if (entries.length) for (const entry of entries) await visit(entry);
    else files.push(...event.dataTransfer.files);
    await stage(files);
  } catch (error) {
    notice(error.message, true);
  }
});

$("upload-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!staged || running || staging) return;
  running = true;
  setBusy(true);
  notice();
  try {
    const job = await api(
      "/api/deploy",
      json({
        uploadId: staged.id,
        entry: $("entry").value,
        game: $("game").value,
        model: composeModel(),
        quant: $("quant").value,
        variant: $("variant").value,
      }),
    );
    track(job.id);
  } catch (error) {
    running = false;
    setBusy(false);
    uploadError(error);
  }
});

$("publish-site").onclick = async () => {
  if (running || staging || !token) return;
  running = true;
  setBusy(true);
  notice();
  try {
    const job = await api("/api/publish", json({}));
    track(job.id);
  } catch (error) {
    running = false;
    setBusy(false);
    notice(error.message, true);
  }
};

function track(id) {
  jobId = id;
  running = true;
  setBusy(true);
  $("retry").hidden = true;
  $("reconnect").hidden = true;
  $("recovery").hidden = true;
  $("job-panel").hidden = false;
  $("live-link").hidden = true;
  $("job-error").hidden = true;
  $("log-box").open = false;
  $("job-state").textContent = "Publishing…";
  $("job-panel").focus({ preventScroll: true });
  $("job-panel").scrollIntoView({ behavior: "smooth", block: "nearest" });
  localStorage.setItem("oneshots-job", id);
  poll();
}
async function poll() {
  try {
    const job = await api(`/api/jobs/${jobId}`);
    $("log").textContent = job.log;
    $("log").scrollTop = $("log").scrollHeight;
    $("job-target").textContent = job.target || (job.kind === "site" ? "Current site" : "Game upload");
    if (job.state === "running") {
      $("job-state").textContent = `${PHASES[job.phase] || "Publishing"}…`;
      setTimeout(poll, 1000);
      return;
    }
    running = false;
    setBusy(false);
    localStorage.removeItem("oneshots-job");
    if (job.state === "succeeded") {
      $("job-state").textContent = "Published";
      $("live-link").href = job.result.url;
      $("live-link").hidden = false;
      if (job.kind !== "site") resetFiles();
      try { catalog = (await api("/api/catalog")).games; fillLists(); } catch {}
    } else {
      $("job-state").textContent = `${PHASES[job.phase] || "Publication"} — needs attention`;
      $("job-error").textContent = job.error;
      $("job-error").hidden = false;
      $("log-box").open = true;
      $("retry").hidden = !job.canRetry;
      $("recovery").hidden = false;
      $("recovery").textContent = job.canRetry
        ? (job.phase === "verify" ? "The site was pushed, but its live update is not yet verified. Your source is saved; retry publishing without uploading again." : "Your source is saved. Retry publishing without uploading the game again.")
        : "No new source commit was saved. Fix the issue above, then use Publish again. Your form values are retained.";
      if (job.canRetry && job.kind !== "site") resetFiles();
    }
  } catch (error) {
    const missing = error.code === "JOB_NOT_FOUND";
    $("job-state").textContent = missing ? "Job history unavailable" : "Connection interrupted";
    $("job-error").textContent = missing
      ? "The uploader no longer has this job, usually after a restart. Check its terminal or the live archive before publishing again."
      : "Publication may still be running. Reconnect to check this job; reconnecting does not publish again.";
    $("job-error").hidden = false;
    $("retry").hidden = true;
    $("reconnect").hidden = missing;
    running = !missing;
    setBusy(running);
    if (missing) {
      localStorage.removeItem("oneshots-job");
      resetFiles();
      notice("Your metadata is retained. Choose files again if another upload is needed.");
    }
  }
}
$("reconnect").onclick = async () => {
  $("reconnect").disabled = true;
  try {
    const data = await api("/api/catalog");
    token = data.token;
    $("reconnect").hidden = true;
    $("job-error").hidden = true;
    await poll();
  } catch {
    $("job-error").textContent = "Cannot reach the local uploader. Start it again, then reconnect to check the job.";
  } finally { $("reconnect").disabled = false; }
};
$("retry").onclick = async () => {
  if (running || staging) return;
  $("retry").disabled = true;
  running = true;
  setBusy(true);
  try {
    const job = await api(`/api/jobs/${jobId}/retry`, json({}));
    track(job.id);
  } catch (error) {
    running = false;
    setBusy(false);
    notice(error.message, true);
  } finally {
    $("retry").disabled = false;
  }
};

function fillLists() {
  options(
    "game-list",
    catalog.map((item) => item.game),
  );
  options(
    "model-list",
    catalog.map((item) => splitModel(item.model)[0]),
  );
  options(
    "quant-list",
    catalog.map((item) => item.quant),
  );
  updateSuggestions();
  updateCredit();
}
async function init() {
  try {
    const data = await api("/api/catalog");
    token = data.token;
    catalog = data.games;
    setBusy(false);
    try {
      const draft = JSON.parse(localStorage.getItem("oneshots-draft") || "{}");
      for (const id of FIELDS) $(id).value = draft[id] || "";
    } catch {}
    fillLists();
    const previous = localStorage.getItem("oneshots-job");
    if (previous) track(previous);
  } catch (error) {
    notice(`Can't load: ${error.message}`, true);
  }
}
init();
