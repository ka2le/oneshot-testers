import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { safePath, prepareFiles } from "../uploader/uploads.mjs";
import { createUploader } from "../uploader/server.mjs";

async function temp(t) {
  const dir = await mkdtemp(path.join(tmpdir(), "oneshots-test-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}
function zip(entries) {
  const chunks = [],
    central = [];
  let offset = 0;
  for (const [name, source, mode = 0x8000] of entries) {
    const filename = Buffer.from(name),
      data = Buffer.from(source);
    let crc = 0xffffffff;
    for (const byte of data) {
      crc ^= byte;
      for (let i = 0; i < 8; i++)
        crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
    crc = (crc ^ 0xffffffff) >>> 0;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(filename.length, 26);
    const head = Buffer.alloc(46);
    head.writeUInt32LE(0x02014b50);
    head.writeUInt16LE(0x0314, 4);
    head.writeUInt16LE(20, 6);
    head.writeUInt32LE(crc, 16);
    head.writeUInt32LE(data.length, 20);
    head.writeUInt32LE(data.length, 24);
    head.writeUInt16LE(filename.length, 28);
    head.writeUInt32LE((mode << 16) >>> 0, 38);
    head.writeUInt32LE(offset, 42);
    chunks.push(local, filename, data);
    central.push(head, filename);
    offset += local.length + filename.length + data.length;
  }
  const directory = Buffer.concat(central),
    end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...chunks, directory, end]);
}

test("ZIPs preserve nested HTML, CSS and binary assets byte for byte", async (t) => {
  const dir = await temp(t),
    output = path.join(dir, "out");
  await mkdir(output);
  const archive = zip([
    ["game/index.html", '<link href="css/style.css">'],
    ["game/css/style.css", "body{color:red}"],
    ["game/images/a.png", Buffer.from([0, 1, 255, 4])],
  ]);
  const input = path.join(dir, "game.zip");
  await writeFile(input, archive);
  const result = await prepareFiles(
    [{ path: input, size: archive.length }],
    ["game.zip"],
    output,
  );
  assert.deepEqual(result.entries, ["game/index.html"]);
  assert.equal(result.count, 3);
  assert.deepEqual(
    await readFile(path.join(output, "game/images/a.png")),
    Buffer.from([0, 1, 255, 4]),
  );
});
test("rejects traversal, Windows special paths, ZIP links and case collisions", async (t) => {
  for (const name of [
    "../escape.html",
    "/absolute.html",
    "x/../../a",
    "C:/a.html",
    "x\\a.html",
    "x/.git/config",
    "CON.html",
    "a:stream",
    "a./x",
    "x//a",
    "x/../a",
  ])
    assert.throws(() => safePath(name), name);
  const dir = await temp(t);
  for (const [label, entries] of [
    ["traversal", [["../escape.html", "bad"]]],
    ["link", [["index.html", "target", 0xa000]]],
    [
      "collision",
      [
        ["index.html", "one"],
        ["INDEX.html", "two"],
      ],
    ],
  ]) {
    const input = path.join(dir, label + ".zip"),
      out = path.join(dir, label);
    await mkdir(out);
    const data = zip(entries);
    await writeFile(input, data);
    await assert.rejects(
      prepareFiles([{ path: input, size: data.length }], [label + ".zip"], out),
    );
  }
});
test("local server stages uploads, checks origin/token and exposes deployment results", async (t) => {
  let calls = 0,
    release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const uploader = createUploader({
    deploy: async (upload, { log }) => {
      calls++;
      assert.equal(upload.game, "My Game");
      assert.equal(
        await readFile(path.join(upload.directory, "style.css"), "utf8"),
        "body{}",
      );
      log("Building test game\n");
      await gate;
      return { url: "https://example.com/game" };
    },
  });
  const server = await new Promise((resolve) => {
    const s = uploader.app.listen(0, "127.0.0.1", () => resolve(s));
  });
  t.after(async () => {
    release();
    await new Promise((resolve) => server.close(resolve));
    await uploader.close();
  });
  const url = `http://127.0.0.1:${server.address().port}`;
  const catalog = await (await fetch(url + "/api/catalog")).json(),
    token = catalog.token;
  assert.equal(
    (
      await fetch(url + "/api/catalog", {
        headers: { Origin: "https://evil.example" },
      })
    ).status,
    403,
  );
  assert.equal(
    (await fetch(url + "/api/deploy", { method: "POST" })).status,
    403,
  );
  const form = new FormData();
  form.append("paths", JSON.stringify(["index.html", "style.css"]));
  form.append("files", new Blob(["<html>test</html>"]), "index.html");
  form.append("files", new Blob(["body{}"]), "style.css");
  const stage = await fetch(url + "/api/uploads", {
    method: "POST",
    headers: { "X-Upload-Token": token },
    body: form,
  });
  assert.equal(stage.status, 200);
  const staged = await stage.json();
  assert.deepEqual(staged.entries, ["index.html"]);
  assert.equal(staged.count, 2);
  const post = (body) => ({
    method: "POST",
    headers: { "X-Upload-Token": token, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const metadata = {
    uploadId: staged.id,
    entry: "index.html",
    game: "My Game",
    family: "Custom",
    model: "My Model",
  };
  assert.equal(
    (
      await fetch(
        url + "/api/deploy",
        post({ ...metadata, entry: "../escape.html" }),
      )
    ).status,
    400,
  );
  const response = await fetch(url + "/api/deploy", post(metadata));
  assert.equal(response.status, 202);
  const job = await response.json();
  assert.equal((await fetch(url + "/api/deploy", post(metadata))).status, 409);
  release();
  let result;
  for (let i = 0; i < 30; i++) {
    result = await (await fetch(url + "/api/jobs/" + job.id)).json();
    if (result.state !== "running") break;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.equal(result.state, "succeeded");
  assert.equal(calls, 1);
  assert.match(result.log, /Building test game/);
  assert.equal((await fetch(url + "/api/deploy", post(metadata))).status, 400);
  assert.equal((await fetch(url + "/scripts/deploy.mjs")).status, 404);
});

test("site publishing needs no upload, rejects concurrent operations and retains retry kind", async (t) => {
  let release,
    calls = 0;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const uploader = createUploader({
    publishSite: async ({ log, phase }) => {
      calls++;
      log("Publishing existing site\n");
      phase("verify");
      await gate;
      const error = new Error("Saved source; simulated Pages failure");
      error.committed = true;
      throw error;
    },
    retry: async () => ({ url: "https://example.com/verified" }),
  });
  const server = await new Promise((resolve) => {
    const s = uploader.app.listen(0, "127.0.0.1", () => resolve(s));
  });
  t.after(async () => {
    release();
    await new Promise((resolve) => server.close(resolve));
    await uploader.close();
  });
  const url = `http://127.0.0.1:${server.address().port}`;
  const { token } = await (await fetch(url + "/api/catalog")).json();
  const post = {
    method: "POST",
    headers: { "X-Upload-Token": token, "Content-Type": "application/json" },
    body: "{}",
  };
  assert.equal(
    (await fetch(url + "/api/publish", { method: "POST" })).status,
    403,
  );
  const response = await fetch(url + "/api/publish", post);
  assert.equal(response.status, 202);
  const job = await response.json();
  assert.equal((await fetch(url + "/api/publish", post)).status, 409);
  assert.equal((await fetch(url + "/api/deploy", post)).status, 409);
  release();
  async function completed(id) {
    for (let i = 0; i < 100; i++) {
      const state = await (await fetch(url + "/api/jobs/" + id)).json();
      if (state.state !== "running") return state;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.fail("job did not complete");
  }
  const failed = await completed(job.id);
  assert.equal(failed.kind, "site");
  assert.equal(failed.canRetry, true);
  assert.equal(failed.phase, "verify");
  assert.equal(failed.target, "Current site");
  assert.equal(calls, 1);
  const retry = await fetch(`${url}/api/jobs/${job.id}/retry`, post);
  assert.equal(retry.status, 202);
  const recovered = await completed((await retry.json()).id);
  assert.equal(recovered.kind, "site");
  assert.equal(recovered.state, "succeeded");
});

test("staged previews serve only package files on a sandboxed separate origin and never deploy", async (t) => {
  const uploader = createUploader({ deploy: () => assert.fail("preview must not deploy") });
  const server = await new Promise((resolve) => {
    const s = uploader.app.listen(0, "127.0.0.1", () => resolve(s));
  });
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await uploader.close();
  });
  const url = `http://127.0.0.1:${server.address().port}`;
  const { token } = await (await fetch(url + "/api/catalog")).json();
  const form = new FormData();
  form.append("paths", JSON.stringify(["game/index.html", "game/css/style.css"]));
  form.append("files", new Blob(['<link rel="stylesheet" href="css/style.css"><p>Preview</p>']), "index.html");
  form.append("files", new Blob(["body{color:red}"]), "style.css");
  const stage = await (await fetch(url + "/api/uploads", { method: "POST", headers: { "X-Upload-Token": token }, body: form })).json();
  assert.deepEqual(stage.paths.sort(), ["game/css/style.css", "game/index.html"]);
  const preview = await (await fetch(`${url}/api/uploads/${stage.id}/preview?entry=game%2Findex.html`)).json();
  assert.notEqual(new URL(preview.url).origin, url);
  const page = await fetch(preview.url);
  assert.equal(page.status, 200);
  assert.match(page.headers.get("content-security-policy"), /sandbox allow-scripts allow-pointer-lock/);
  assert(!page.headers.get("content-security-policy").includes("allow-same-origin"));
  assert.equal(await (await fetch(new URL("css/style.css", preview.url))).text(), "body{color:red}");
  assert.equal((await fetch(new URL("/api/catalog", preview.url))).status, 410);
  assert.equal((await fetch(new URL("../catalog.json", preview.url))).status, 404);
  assert.equal((await fetch(url + "/api/catalog", { headers: { Origin: "null" } })).status, 403);
  assert.equal((await fetch(`${url}/api/uploads/${stage.id}/preview?entry=missing.html`)).status, 400);
  await fetch(`${url}/api/uploads/${stage.id}`, { method: "DELETE", headers: { "X-Upload-Token": token } });
  assert.equal((await fetch(preview.url)).status, 410);
  assert.equal((await (await fetch(`${url}/api/uploads/${stage.id}/preview?entry=game%2Findex.html`)).json()).code, "UPLOAD_EXPIRED");
  assert.equal((await (await fetch(`${url}/api/jobs/missing`)).json()).code, "JOB_NOT_FOUND");
});
