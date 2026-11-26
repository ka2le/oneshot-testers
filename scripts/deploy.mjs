import { spawn } from "node:child_process";
import { readFile, writeFile, cp, mkdir, rename, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { root, readCatalog } from "./catalog.mjs";

export function run(command, args, { cwd = root, log = console.log } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      shell: false,
      windowsHide: true,
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    });
    let output = "", errors = "";
    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      output += text;
      log(text);
    });
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      errors += text;
      log(text);
    });
    child.once("error", reject);
    child.once("close", (code) =>
      code === 0
        ? resolve(output.trim())
        : reject(
            new Error(`${command} failed (${code}). ${(output + errors).slice(-2000)}`),
          ),
    );
  });
}

export async function publish({
  cwd = root,
  log = console.log,
  built = false,
  phase = () => {},
} = {}) {
  // Build without invoking a shell, including on Windows.
  if (!built) {
    phase("build");
    await run(
      process.execPath,
      [path.join(cwd, "node_modules/vite/bin/vite.js"), "build"],
      { cwd, log },
    );
  }
  phase("publish");
  const { default: ghpages } = await import("gh-pages");
  const repo = await run("git", ["remote", "get-url", "origin"], {
    cwd,
    log: () => {},
  });
  log("Publishing the built archive to GitHub Pages…\n");
  await writeFile(path.join(cwd, "dist", ".nojekyll"), "");
  const deployment = {
    id: randomUUID(),
    commit: await run("git", ["rev-parse", "HEAD"], { cwd, log: () => {} }),
    createdAt: new Date().toISOString(),
  };
  await writeFile(
    path.join(cwd, "dist", "deployment.json"),
    JSON.stringify(deployment) + "\n",
  );
  await new Promise((resolve, reject) =>
    ghpages.publish(
      path.join(cwd, "dist"),
      {
        repo,
        branch: "gh-pages",
        dotfiles: true,
        message: "Deploy OneShots archive",
      },
      (error) => (error ? reject(error) : resolve()),
    ),
  );
  const url = "https://ka2le.github.io/oneshot-testers/";
  log("Waiting for the live site to serve this deployment…\n");
  phase("verify");
  await waitForDeployment(url, deployment.id, { log });
  return url;
}

export async function waitForDeployment(
  url,
  id,
  {
    log = console.log,
    fetcher = fetch,
    timeoutMs = 180000,
    intervalMs = 4000,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  } = {},
) {
  const deadline = Date.now() + timeoutMs;
  do {
    try {
      const marker = new URL("deployment.json", url);
      marker.searchParams.set("deployment", id);
      const response = await fetcher(marker, {
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
      });
      if (response.ok && (await response.json()).id === id) {
        log("The live site is now serving this deployment.\n");
        return;
      }
    } catch {}
    if (Date.now() >= deadline) break;
    await sleep(Math.min(intervalMs, deadline - Date.now()));
  } while (Date.now() <= deadline);
  throw new Error(
    "The build was pushed to GitHub Pages, but the live update could not be verified within three minutes. Check GitHub Pages or retry publishing.",
  );
}

const sitePaths = new Set([
  "index.html",
  "src",
  "public",
  "games",
  "catalog.json",
  "vite.config.js",
  "package.json",
  "package-lock.json",
  "scripts",
  "uploader",
  "tests",
  "qa",
  "README.md",
  "Start-Uploader.cmd",
  "Deploy.cmd",
  ".gitignore",
]);

async function siteChanges(cwd) {
  const output = await Promise.all([
    run("git", ["diff", "--name-only", "--no-renames", "-z", "HEAD"], {
      cwd,
      log: () => {},
    }),
    run("git", ["ls-files", "--others", "--exclude-standard", "-z"], {
      cwd,
      log: () => {},
    }),
  ]);
  const changes = [
    ...new Set(output.flatMap((text) => text.split("\0").filter(Boolean))),
  ];
  const outside = changes.filter((file) => !sitePaths.has(file.split("/")[0]));
  if (outside.length)
    throw new Error(
      `Commit or stash these files before publishing the site: ${outside.join(", ")}`,
    );
  return changes;
}

export async function deploySite({
  cwd = root,
  log = console.log,
  publisher = publish,
  phase = () => {},
} = {}) {
  const options = { cwd, log, phase };
  phase("check");
  const branch = await run("git", ["branch", "--show-current"], {
    cwd,
    log: () => {},
  });
  if (branch !== "main")
    throw new Error("Switch this checkout to main before publishing the site.");
  await siteChanges(cwd);
  log("Checking the remote branch…\n");
  await run("git", ["fetch", "origin", "main"], options);
  const behind = await run(
    "git",
    ["rev-list", "--count", "HEAD..origin/main"],
    { cwd, log: () => {} },
  );
  if (behind !== "0")
    throw new Error(
      "Remote main has newer commits. Update this checkout before publishing the site.",
    );
  let saved = false;
  try {
    await readCatalog(cwd);
    phase("build");
    await run(
      process.execPath,
      [path.join(cwd, "node_modules/vite/bin/vite.js"), "build"],
      options,
    );
    const changes = await siteChanges(cwd);
    if (changes.length) {
      phase("save");
      log(`Committing ${changes.length} changed project files…\n`);
      const roots = [...new Set(changes.map((file) => file.split("/")[0]))];
      await run("git", ["add", "--all", "--", ...roots], options);
      await run(
        "git",
        ["commit", "-m", "Publish OneShots site changes"],
        options,
      );
    } else log("No source changes to commit. Republishing the current site…\n");
    saved = true;
    phase("push");
    await run("git", ["push", "origin", "main"], options);
    const url = await publisher({ ...options, built: true });
    return {
      url,
      commit: await run("git", ["rev-parse", "HEAD"], { cwd, log: () => {} }),
      changedFiles: changes.length,
    };
  } catch (error) {
    error.committed = saved;
    if (saved)
      error.message +=
        "\nYour source is saved. Retry publishing to deploy it again.";
    throw error;
  }
}

export async function deployUpload(
  upload,
  { cwd = root, log = console.log, publisher = publish, phase = () => {} } = {},
) {
  const options = { cwd, log, phase };
  phase("check");
  const branch = await run("git", ["branch", "--show-current"], {
    ...options,
    log: () => {},
  });
  if (branch !== "main")
    throw new Error("Switch this checkout to main before deploying uploads.");
  if (
    await run("git", ["status", "--porcelain"], { ...options, log: () => {} })
  )
    throw new Error(
      "The source checkout has uncommitted changes. Commit or stash them before deploying an upload.",
    );
  log("Checking the remote branch…\n");
  await run("git", ["fetch", "origin", "main"], options);
  const behind = await run(
    "git",
    ["rev-list", "--count", "HEAD..origin/main"],
    { ...options, log: () => {} },
  );
  if (behind !== "0")
    throw new Error(
      "Remote main has newer commits. Run git pull --ff-only in source, then retry.",
    );
  const slug = (value) =>
    value
      .normalize("NFKD")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48) || "game";
  const folder = `uploads/${slug(upload.game)}/${slug([upload.model, upload.quant].filter(Boolean).join(" "))}-${randomUUID().slice(0, 8)}`;
  const file = `${folder}/${upload.entry}`;
  const destination = path.join(cwd, "games", folder);
  const catalogPath = path.join(cwd, "catalog.json");
  const original = await readFile(catalogPath, "utf8");
  let committed = false;
  try {
    phase("import");
    await mkdir(path.dirname(destination), { recursive: true });
    await cp(upload.directory, destination, {
      recursive: true,
      errorOnExist: true,
      force: false,
    });
    const catalog = JSON.parse(original);
    // Auxiliary HTML pages belong to this game, but should not become extra launcher entries.
    for (const entry of upload.entries)
      catalog[`${folder}/${entry}`] =
        entry === upload.entry
          ? {
              game: upload.game,
              family: upload.family,
              model: upload.model,
              ...(upload.quant ? { quant: upload.quant } : {}),
              variant: upload.variant,
              keepDuplicate: true,
            }
          : { hidden: true };
    const temp = catalogPath + ".tmp";
    await writeFile(temp, JSON.stringify(catalog, null, 2) + "\n");
    await rename(temp, catalogPath);
    await readCatalog(cwd);
    // A failed build never creates a source commit.
    phase("build");
    await run(
      process.execPath,
      [path.join(cwd, "node_modules/vite/bin/vite.js"), "build"],
      options,
    );
    phase("save");
    await run("git", ["add", "--", `games/${folder}`, "catalog.json"], options);
    await run(
      "git",
      ["commit", "-m", `Add ${upload.game} by ${upload.model}`],
      options,
    );
    committed = true;
    log("Pushing the source commit…\n");
    phase("push");
    await run("git", ["push", "origin", "main"], options);
    const url = await publisher({ ...options, built: true });
    return {
      url,
      file,
      commit: await run("git", ["rev-parse", "HEAD"], {
        ...options,
        log: () => {},
      }),
    };
  } catch (error) {
    if (!committed) {
      await run("git", ["reset", "--", `games/${folder}`, "catalog.json"], {
        ...options,
        log: () => {},
      }).catch(() => {});
      await writeFile(catalogPath, original);
      await rm(destination, { recursive: true, force: true });
    } else
      error.message +=
        "\nYour upload is committed locally. Use “Retry publishing” to push and deploy that commit without importing it again.";
    error.committed = committed;
    throw error;
  }
}

export async function retryPublish({ cwd = root, log = console.log, phase = () => {} } = {}) {
  phase("check");
  if (await run("git", ["status", "--porcelain"], { cwd, log: () => {} }))
    throw new Error("Commit or stash source changes before retrying.");
  const branch = await run("git", ["branch", "--show-current"], {
    cwd,
    log: () => {},
  });
  if (branch !== "main") throw new Error("Switch to main before publishing.");
  phase("push");
  await run("git", ["push", "origin", "main"], { cwd, log });
  return { url: await publish({ cwd, log, phase }) };
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    console.log(await deploySite());
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
