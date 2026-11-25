import express from "express";
import multer from "multer";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { randomUUID, randomBytes } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { root, readCatalog, inferMetadata } from "../scripts/catalog.mjs";
import { deployUpload, retryPublish } from "../scripts/deploy.mjs";
import { limits, prepareFiles, cleanLabel, assertEntry } from "./uploads.mjs";

export function createUploader({
  deploy = deployUpload,
  retry = retryPublish,
  directory = root,
} = {}) {
  const app = express(),
    uploads = new Map(),
    jobs = new Map();
  const token = randomBytes(32).toString("hex");
  let busy = false,
    preparing = false;
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    const port = req.socket.localPort;
    const origins = [`http://127.0.0.1:${port}`, `http://localhost:${port}`];
    if (
      !origins.includes(`http://${req.headers.host}`) ||
      (req.headers.origin && !origins.includes(req.headers.origin))
    )
      return res
        .status(403)
        .json({ error: "Use this form from its localhost address." });
    res.set({
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy":
        "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    });
    if (req.method !== "GET" && req.headers["x-upload-token"] !== token)
      return res
        .status(403)
        .json({ error: "Refresh this page before uploading." });
    next();
  });
  app.use(express.json({ limit: "64kb" }));
  app.get("/api/catalog", async (req, res) =>
    res.json({
      service: "oneshots-uploader",
      token,
      games: await readCatalog(directory),
    }),
  );
  const parser = multer({
    dest: tmpdir(),
    limits: {
      fileSize: limits.bytes,
      files: 500,
      fields: 1,
      fieldSize: 128 * 1024,
      parts: 501,
    },
  }).array("files", 500);
  app.post("/api/uploads", async (req, res, next) => {
    if (preparing || busy)
      return res
        .status(409)
        .json({
          error:
            "An upload or deployment is already running. Wait for it to finish.",
        });
    if (uploads.size >= 10)
      return res
        .status(429)
        .json({
          error:
            "Too many staged uploads. Remove one or restart the local uploader.",
        });
    preparing = true;
    let temp;
    try {
      const maxRequest = limits.bytes + 1024 * 1024;
      if (Number(req.headers["content-length"] || 0) > maxRequest)
        throw new Error("Choose at most 100 MB in total.");
      let received = 0;
      req.on("data", (chunk) => {
        received += chunk.length;
        if (received > maxRequest)
          req.destroy(new Error("Upload exceeds 100 MB"));
      });
      await new Promise((resolve, reject) =>
        parser(req, res, (error) => (error ? reject(error) : resolve())),
      );
      if (!req.files?.length)
        throw new Error("Choose at least one file or ZIP.");
      if (req.files.reduce((sum, f) => sum + f.size, 0) > limits.bytes)
        throw new Error("Choose at most 100 MB in total.");
      const names = JSON.parse(req.body.paths || "null");
      if (!Array.isArray(names) || names.length !== req.files.length)
        throw new Error("Upload paths do not match the files.");
      temp = await mkdtemp(path.join(tmpdir(), "oneshots-"));
      const contents = path.join(temp, "contents");
      await mkdir(contents);
      const summary = await prepareFiles(req.files, names, contents);
      const id = randomUUID();
      uploads.set(id, {
        ...summary,
        directory: contents,
        temp,
        created: Date.now(),
      });
      res.json({ id, ...summary });
    } catch (error) {
      if (temp) await rm(temp, { recursive: true, force: true });
      next(error);
    } finally {
      preparing = false;
      await Promise.all(
        (req.files || []).map((file) => rm(file.path, { force: true })),
      );
    }
  });
  app.delete("/api/uploads/:id", async (req, res) => {
    const upload = uploads.get(req.params.id);
    if (upload?.inUse)
      return res.status(409).json({ error: "This upload is deploying." });
    if (upload) {
      uploads.delete(req.params.id);
      await rm(upload.temp, { recursive: true, force: true });
    }
    res.json({ ok: true });
  });
  function startJob(operation, res) {
    busy = true;
    const id = randomUUID(),
      job = { id, state: "running", log: "", created: Date.now() };
    jobs.set(id, job);
    if (jobs.size > 30) jobs.delete(jobs.keys().next().value);
    const log = (text) => {
      job.log = (job.log + text).slice(-100000);
      if (directory === root) process.stdout.write(text);
    };
    Promise.resolve()
      .then(() => operation(log))
      .then((result) => {
        Object.assign(job, { state: "succeeded", result });
        log(
          "\nDeployment completed. GitHub Pages may take a minute to update.\n",
        );
      })
      .catch((error) => {
        Object.assign(job, {
          state: "failed",
          error: error.message,
          canRetry: Boolean(error.committed),
        });
        log(`\n${error.message}\n`);
      })
      .finally(() => {
        busy = false;
      });
    res.status(202).json({ id });
  }
  app.post("/api/deploy", async (req, res) => {
    if (busy || preparing)
      return res
        .status(409)
        .json({ error: "A deployment or upload is already running." });
    const staged = uploads.get(req.body.uploadId);
    if (!staged)
      return res
        .status(400)
        .json({ error: "Choose your files again; this upload has expired." });
    const game = cleanLabel(req.body.game, "Game name"),
      model = cleanLabel(req.body.model, "Model"),
      variant = cleanLabel(req.body.variant || "", "Version", true);
    const inferredFamily = inferMetadata(`Upload-${model}.html`).family;
    const family = cleanLabel(
      req.body.family ||
        (inferredFamily === "Unspecified" ? "Other" : inferredFamily),
      "Model family",
    );
    if (!staged.entries.includes(req.body.entry))
      return res
        .status(400)
        .json({ error: "Choose an HTML entry page from this upload." });
    await assertEntry(staged.directory, req.body.entry);
    staged.inUse = true;
    startJob(async (log) => {
      try {
        const result = await deploy(
          { ...staged, game, family, model, variant, entry: req.body.entry },
          { cwd: directory, log },
        );
        uploads.delete(req.body.uploadId);
        await rm(staged.temp, { recursive: true, force: true });
        return result;
      } catch (error) {
        if (error.committed) {
          uploads.delete(req.body.uploadId);
          await rm(staged.temp, { recursive: true, force: true });
        }
        throw error;
      } finally {
        staged.inUse = false;
      }
    }, res);
  });
  app.post("/api/jobs/:id/retry", (req, res) => {
    if (busy || preparing)
      return res
        .status(409)
        .json({ error: "Wait for the current operation to finish." });
    if (!jobs.get(req.params.id)?.canRetry)
      return res
        .status(400)
        .json({ error: "This deployment has no committed upload to retry." });
    startJob(
      (log) =>
        retry({ cwd: directory, log }).catch((error) => {
          error.committed = true;
          throw error;
        }),
      res,
    );
  });
  app.get("/api/jobs/:id", (req, res) => {
    const job = jobs.get(req.params.id);
    if (!job)
      return res
        .status(404)
        .json({
          error: "Deployment not found. Check your terminal for the last run.",
        });
    res.json(job);
  });
  app.use(express.static(path.join(root, "uploader", "public")));
  app.use((error, req, res, next) =>
    res.status(400).json({ error: error.message }),
  );
  const cleanup = setInterval(() => {
    for (const [id, upload] of uploads)
      if (!upload.inUse && Date.now() - upload.created > 3600000) {
        uploads.delete(id);
        rm(upload.temp, { recursive: true, force: true }).catch(() => {});
      }
  }, 60000);
  cleanup.unref();
  return {
    app,
    async close() {
      clearInterval(cleanup);
      for (const upload of uploads.values())
        await rm(upload.temp, { recursive: true, force: true });
    },
  };
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const port = Number(process.env.ONESHOTS_UPLOAD_PORT || 4397);
  const uploader = createUploader();
  const url = `http://127.0.0.1:${port}`;
  const open = () => {
    if (process.argv.includes("--open") && process.platform === "win32")
      spawn("rundll32.exe", ["url.dll,FileProtocolHandler", url], {
        windowsHide: true,
        stdio: "ignore",
      }).on("error", (error) =>
        console.error(`Open ${url} in your browser. ${error.message}`),
      );
  };
  const server = uploader.app.listen(port, "127.0.0.1");
  server.once("listening", () => {
    console.log(
      `OneShots uploader: ${url}\nDeploy commits to main and publishes GitHub Pages.`,
    );
    open();
  });
  server.on("error", async (error) => {
    if (error.code === "EADDRINUSE" && process.argv.includes("--open")) {
      try {
        const existing = await (await fetch(url + "/api/catalog")).json();
        if (existing.service === "oneshots-uploader") {
          console.log(`OneShots uploader is already running: ${url}`);
          open();
          await uploader.close();
          return;
        }
      } catch {}
    }
    console.error(error.message);
    process.exitCode = 1;
  });
  for (const signal of ["SIGINT", "SIGTERM"])
    process.once(signal, () =>
      server.close(async () => {
        await uploader.close();
        process.exit(0);
      }),
    );
}
