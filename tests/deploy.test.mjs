import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import {
  deployUpload,
  deploySite,
  waitForDeployment,
  run,
} from "../scripts/deploy.mjs";
import { inferMetadata, readCatalog } from "../scripts/catalog.mjs";

test("catalog groups games, attributes model families and hides report/auxiliary pages", async () => {
  assert.equal(inferMetadata("AutumNationV1-Opus5.5.html").family, "Claude");
  const catalog = await readCatalog();
  for (const file of [
    "wildfang.html",
    "the-ninth-tide.html",
    "Snake-Qwen3.8-Flash-Next-resumed.html",
    "SnakeExplore-GPT5.6-sol.html",
  ])
    assert(
      catalog.some((g) => g.file === file),
      file,
    );
  assert(!catalog.some((g) => g.file === "wildfang-flow-lab.html"));
  for (const file of ["elsewhere.html", "the-ninth-tide.html", "wildfang.html"])
    assert.equal(catalog.find((g) => g.file === file).model, "Astra 6.0");
  assert.deepEqual(
    [
      ...new Set(
        catalog.filter((g) => /^Astra/i.test(g.model)).map((g) => g.model),
      ),
    ],
    ["Astra 6.0"],
  );
  assert(
    new Set(catalog.filter((g) => g.game === "Snake").map((g) => g.family))
      .size >= 4,
  );
  assert.equal(
    catalog.find((g) => g.file.includes("reskin-Claude")).family,
    "Claude",
  );
});

async function fixture(t) {
  const base = await mkdtemp(path.join(tmpdir(), "oneshots-git-test-"));
  t.after(() => rm(base, { recursive: true, force: true }));
  const cwd = path.join(base, "repo"),
    remote = path.join(base, "remote.git"),
    directory = path.join(base, "upload");
  await mkdir(cwd);
  await mkdir(directory);
  const git = (args) => run("git", args, { cwd, log: () => {} });
  await git(["init", "--bare", remote]);
  await git(["init", "-b", "main"]);
  await git(["config", "user.name", "OneShots Test"]);
  await git(["config", "user.email", "test@example.invalid"]);
  await git(["remote", "add", "origin", remote]);
  await mkdir(path.join(cwd, "games"));
  await writeFile(path.join(cwd, "catalog.json"), "{}\n");
  await writeFile(path.join(cwd, ".gitignore"), "node_modules/\ndist/\n");
  const vite = path.join(cwd, "node_modules/vite/bin");
  await mkdir(vite, { recursive: true });
  await writeFile(
    path.join(vite, "vite.js"),
    'console.log("Fixture build passed")',
  );
  await git(["add", "."]);
  await git(["commit", "-m", "Initial"]);
  await git(["push", "-u", "origin", "main"]);
  await writeFile(
    path.join(directory, "index.html"),
    "<html>Real upload</html>",
  );
  await writeFile(path.join(directory, "help.html"), "<html>Help</html>");
  await writeFile(path.join(directory, "style.css"), "body{}");
  const upload = {
    directory,
    entries: ["index.html", "help.html"],
    entry: "index.html",
    game: "Test Game",
    family: "Custom",
    model: "Model & literal $name",
    variant: "v1",
  };
  return { cwd, git, upload, vite };
}
test("deploy commits only game files and metadata, pushes main, then invokes publishing", async (t) => {
  const { cwd, git, upload } = await fixture(t);
  let published = false;
  const phases = [];
  const result = await deployUpload(upload, {
    cwd,
    log: () => {},
    phase: (value) => phases.push(value),
    publisher: async (options) => {
      assert(options.built);
      published = true;
      assert.equal(
        await git(["rev-parse", "HEAD"]),
        await git(["rev-parse", "origin/main"]),
      );
      return "https://example.com";
    },
  });
  assert(published);
  assert.deepEqual(phases, ["check", "import", "build", "save", "push"]);
  assert.equal(await git(["status", "--porcelain"]), "");
  assert.equal(result.url, "https://example.com");
  const changed = (
    await git(["diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD"])
  ).split("\n");
  assert(
    changed.every(
      (p) => p === "catalog.json" || p.startsWith("games/uploads/"),
    ),
  );
  assert.equal(
    await readFile(
      path.join(cwd, "games", path.dirname(result.file), "style.css"),
      "utf8",
    ),
    "body{}",
  );
  const catalog = await readCatalog(cwd);
  assert.equal(catalog.length, 1);
  assert.equal(catalog[0].model, upload.model);
  assert.equal(catalog[0].variant, "v1");
});
test("failed build rolls back import and creates no source commit", async (t) => {
  const { cwd, git, upload, vite } = await fixture(t),
    before = await git(["rev-parse", "HEAD"]);
  await writeFile(path.join(vite, "vite.js"), "process.exit(1)");
  await assert.rejects(
    deployUpload(upload, {
      cwd,
      log: () => {},
      publisher: () => assert.fail("must not publish"),
    }),
  );
  assert.equal(await git(["rev-parse", "HEAD"]), before);
  assert.equal(await git(["status", "--porcelain"]), "");
  assert.equal(await readFile(path.join(cwd, "catalog.json"), "utf8"), "{}\n");
});
test("unrelated work prevents deploy and publishing errors preserve the source commit", async (t) => {
  const { cwd, git, upload } = await fixture(t);
  await writeFile(path.join(cwd, "unrelated.txt"), "keep me");
  await assert.rejects(
    deployUpload(upload, { cwd, log: () => {} }),
    /uncommitted/,
  );
  await rm(path.join(cwd, "unrelated.txt"));
  await assert.rejects(
    deployUpload(upload, {
      cwd,
      log: () => {},
      publisher: async () => {
        throw new Error("simulated publish failure");
      },
    }),
    (error) => error.committed && /Retry publishing/.test(error.message),
  );
  assert.equal(await git(["status", "--porcelain"]), "");
  assert.equal((await readCatalog(cwd)).length, 1);
});

test("site publish saves local redesign changes and republishes without adding games", async (t) => {
  const { cwd, git, vite } = await fixture(t);
  await git(["config", "core.autocrlf", "true"]);
  await writeFile(path.join(cwd, "README.md"), "original\n");
  await git(["add", "README.md"]);
  await git(["commit", "-m", "Existing source with Windows line endings"]);
  await writeFile(path.join(cwd, "README.md"), "updated design notes\n");
  await mkdir(path.join(cwd, "src"));
  await mkdir(path.join(cwd, "public"));
  await writeFile(path.join(cwd, "src/main.jsx"), "new local design");
  await writeFile(path.join(cwd, "public/favicon.svg"), "new icon");
  await writeFile(
    path.join(vite, "vite.js"),
    `const fs=require('node:fs');fs.writeFileSync('node_modules/built-design',fs.readFileSync('src/main.jsx'))`,
  );
  const publisher = async ({ built }) => {
    assert(built);
    assert.equal(
      await readFile(path.join(cwd, "node_modules/built-design"), "utf8"),
      "new local design",
    );
    assert.equal(
      await git(["rev-parse", "HEAD"]),
      await git(["rev-parse", "origin/main"]),
    );
    return "https://example.com/site";
  };
  const result = await deploySite({ cwd, log: () => {}, publisher });
  assert.equal(result.changedFiles, 3);
  assert.equal(await git(["show", "HEAD:src/main.jsx"]), "new local design");
  assert.equal(await git(["status", "--porcelain"]), "");
  assert.equal((await readCatalog(cwd)).length, 0);
  const again = await deploySite({ cwd, log: () => {}, publisher });
  assert.equal(again.changedFiles, 0);
  assert.equal(again.commit, result.commit);
});

test("failed site build preserves local edits and does not commit them", async (t) => {
  const { cwd, git, vite } = await fixture(t);
  await writeFile(path.join(cwd, "README.md"), "local edits stay here");
  await git(["add", "README.md"]);
  const before = await git(["rev-parse", "HEAD"]),
    status = await git(["status", "--porcelain"]);
  await writeFile(path.join(vite, "vite.js"), "process.exit(1)");
  await assert.rejects(
    deploySite({
      cwd,
      log: () => {},
      publisher: () => assert.fail("must not publish"),
    }),
  );
  assert.equal(await git(["rev-parse", "HEAD"]), before);
  assert.equal(await git(["status", "--porcelain"]), status);
  assert.equal(
    await readFile(path.join(cwd, "README.md"), "utf8"),
    "local edits stay here",
  );
  await writeFile(
    path.join(cwd, "outside-project.txt"),
    "leave this uncommitted",
  );
  await assert.rejects(
    deploySite({ cwd, log: () => {} }),
    /outside-project.txt/,
  );
});

test("live verification waits for the exact deployment and reports an unverified push as a failure", async () => {
  let calls = 0;
  await waitForDeployment("https://example.com/site/", "new-build", {
    fetcher: async (url) => {
      assert.equal(url.searchParams.get("deployment"), "new-build");
      calls++;
      return {
        ok: true,
        json: async () => ({ id: calls < 3 ? "old-build" : "new-build" }),
      };
    },
    sleep: async () => {},
    log: () => {},
  });
  assert.equal(calls, 3);
  await assert.rejects(
    waitForDeployment("https://example.com/", "missing", {
      fetcher: async () => ({ ok: false }),
      timeoutMs: 0,
      log: () => {},
    }),
    /live update could not be verified/,
  );
});
