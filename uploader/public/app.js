const $ = (id) => document.getElementById(id);
const FIELDS = ["game", "model", "version", "quant"];
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
  if (!response.ok)
    throw new Error(data.error || `Request failed (${response.status})`);
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
    await removeFiles();
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
    staged = await api("/api/uploads", { method: "POST", body });
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
    notice();
  } catch (error) {
    notice(error.message, true);
  } finally {
    staging = false;
    setBusy(running);
  }
}
for (const id of ["files", "folder"])
  $(id).addEventListener("change", (event) => stage([...event.target.files]));

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
      }),
    );
    track(job.id);
  } catch (error) {
    running = false;
    setBusy(false);
    notice(error.message, true);
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
  $("job-panel").hidden = false;
  $("live-link").hidden = true;
  $("job-error").hidden = true;
  $("log-box").open = false;
  $("job-state").textContent = "Publishing…";
  localStorage.setItem("oneshots-job", id);
  poll();
}
async function poll() {
  try {
    const job = await api(`/api/jobs/${jobId}`);
    $("log").textContent = job.log;
    $("log").scrollTop = $("log").scrollHeight;
    if (job.state === "running") {
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
      catalog = (await api("/api/catalog")).games;
      fillLists();
    } else {
      $("job-state").textContent = "Failed";
      $("job-error").textContent = job.error;
      $("job-error").hidden = false;
      $("log-box").open = true;
      $("retry").hidden = !job.canRetry;
      if (job.canRetry && job.kind !== "site") resetFiles();
    }
  } catch (error) {
    $("job-state").textContent = "Uploader not reachable";
    $("job-error").textContent = `${error.message} Restart it and reload.`;
    $("job-error").hidden = false;
    running = false;
    setBusy(false);
  }
}
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
