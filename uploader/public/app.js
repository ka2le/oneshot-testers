const $ = (id) => document.getElementById(id);
let token,
  catalog = [],
  staged,
  jobId,
  running = false,
  staging = false;
function notice(text, error = false) {
  $("notice").textContent = text;
  $("notice").classList.toggle("error", error);
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
    ...[...new Set(values)].sort().map((value) => {
      const option = document.createElement("option");
      option.value = value;
      return option;
    }),
  );
}
function updateModels() {
  options(
    "model-list",
    catalog
      .filter((item) => !$("family").value || item.family === $("family").value)
      .map((item) => item.model),
  );
}
function saveDraft() {
  localStorage.setItem(
    "oneshots-draft",
    JSON.stringify(
      Object.fromEntries(
        ["game", "model", "family", "variant"].map((id) => [id, $(id).value]),
      ),
    ),
  );
}
for (const id of ["game", "model", "family", "variant"])
  $(id).addEventListener("input", saveDraft);
$("family").addEventListener("input", updateModels);
$("model").addEventListener("change", () => {
  const item = catalog.find((item) => item.model === $("model").value);
  if (item) {
    $("family").value = item.family;
    updateModels();
    saveDraft();
  }
});
async function removeFiles() {
  if (staged) await api(`/api/uploads/${staged.id}`, { method: "DELETE" });
  staged = null;
  $("staged").hidden = true;
  $("deploy").disabled = true;
  $("files").value = "";
  $("folder").value = "";
}
$("remove").onclick = () =>
  removeFiles()
    .then(() => notice("Choose your files to get started."))
    .catch((error) => notice(error.message, true));
async function stage(files) {
  if (running || staging || !files.length) return;
  staging = true;
  $("fields").disabled = true;
  try {
    await removeFiles();
    if (files.length > 500)
      throw new Error(
        "Choose up to 500 loose files, or use a ZIP for larger folders.",
      );
    if (files.reduce((sum, file) => sum + file.size, 0) > 100 * 1024 * 1024)
      throw new Error("Choose at most 100 MB in total.");
    notice("Uploading and checking your files…");
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
    const size =
      staged.bytes < 1024 * 1024
        ? `${Math.ceil(staged.bytes / 1024)} KB`
        : `${(staged.bytes / 1024 / 1024).toFixed(1)} MB`;
    $("file-summary").textContent =
      `${staged.count} file${staged.count === 1 ? "" : "s"} ready · ${size}`;
    $("file-list").replaceChildren(
      ...staged.paths.map((file) => {
        const li = document.createElement("li");
        li.textContent = file;
        return li;
      }),
    );
    $("staged").hidden = false;
    $("deploy").disabled = false;
    notice(
      staged.entries.length > 1
        ? "Choose the page to open, then deploy your game."
        : "Your files are ready. Name your game and deploy.",
    );
  } catch (error) {
    notice(error.message, true);
  } finally {
    staging = false;
    $("fields").disabled = running;
  }
}
for (const id of ["files", "folder"])
  $(id).addEventListener("change", (event) => stage([...event.target.files]));
const zone = $("drop-zone");
for (const name of ["dragenter", "dragover"])
  zone.addEventListener(name, (event) => {
    event.preventDefault();
    zone.classList.add("dragging");
  });
zone.addEventListener("dragleave", () => zone.classList.remove("dragging"));
zone.addEventListener("drop", async (event) => {
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
          throw new Error("Use a ZIP for more than 500 loose files.");
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
  $("fields").disabled = true;
  try {
    const job = await api(
      "/api/deploy",
      json({
        uploadId: staged.id,
        entry: $("entry").value,
        ...Object.fromEntries(
          ["game", "model", "family", "variant"].map((id) => [id, $(id).value]),
        ),
      }),
    );
    track(job.id);
  } catch (error) {
    running = false;
    $("fields").disabled = false;
    notice(error.message, true);
  }
});
function track(id) {
  jobId = id;
  running = true;
  $("fields").disabled = true;
  $("retry").hidden = true;
  $("job-panel").hidden = false;
  $("live-link").hidden = true;
  $("job-error").hidden = true;
  $("job-state").textContent = "Deploying…";
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
    $("fields").disabled = false;
    localStorage.removeItem("oneshots-job");
    $("job-state").textContent =
      job.state === "succeeded"
        ? "Deployed to the archive"
        : "Deployment needs attention";
    if (job.state === "succeeded") {
      $("live-link").href = job.result.url;
      $("live-link").hidden = false;
      staged = null;
      $("staged").hidden = true;
      $("deploy").disabled = true;
      notice("Published. Choose more files to add another game.");
      $("files").value = "";
      $("folder").value = "";
      catalog = (await api("/api/catalog")).games;
      updateModels();
    } else {
      $("job-error").textContent = job.error;
      $("job-error").hidden = false;
      $("retry").hidden = !job.canRetry;
      if (job.canRetry) {
        staged = null;
        $("staged").hidden = true;
        $("deploy").disabled = true;
      }
    }
  } catch (error) {
    $("job-state").textContent = "Cannot reach the local uploader";
    $("job-error").textContent =
      `${error.message} Restart the uploader if needed, then reload this page. Your source commits are kept.`;
    $("job-error").hidden = false;
    running = false;
    $("fields").disabled = false;
  }
}
$("retry").onclick = async () => {
  $("retry").disabled = true;
  try {
    const job = await api(`/api/jobs/${jobId}/retry`, json({}));
    track(job.id);
  } catch (error) {
    notice(error.message, true);
  } finally {
    $("retry").disabled = false;
  }
};
async function init() {
  try {
    const data = await api("/api/catalog");
    token = data.token;
    catalog = data.games;
    options(
      "game-list",
      catalog.map((item) => item.game),
    );
    options(
      "family-list",
      catalog.map((item) => item.family),
    );
    updateModels();
    try {
      const draft = JSON.parse(localStorage.getItem("oneshots-draft") || "{}");
      for (const id of ["game", "model", "family", "variant"])
        $(id).value = draft[id] || "";
      updateModels();
    } catch {}
    const previous = localStorage.getItem("oneshots-job");
    if (previous) track(previous);
  } catch (error) {
    notice(`Cannot load the archive: ${error.message}`, true);
  }
}
init();
