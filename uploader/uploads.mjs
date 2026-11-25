import { createWriteStream } from "node:fs";
import { mkdir, copyFile, readdir, stat } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";
import path from "node:path";
import yauzl from "yauzl";

export const limits = {
  bytes: 100 * 1024 * 1024,
  expanded: 250 * 1024 * 1024,
  files: 2000,
};
export function safePath(name) {
  if (
    typeof name !== "string" ||
    !name ||
    name.length > 240 ||
    /[\\\x00-\x1f:<>"|?*]/.test(name)
  )
    throw new Error("Invalid upload path");
  const parts = name.split("/");
  if (
    parts.some(
      (p) =>
        !p ||
        p === "." ||
        p === ".." ||
        p.startsWith(".") ||
        /[. ]$/.test(p) ||
        /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(p),
    )
  )
    throw new Error(`Unsafe upload path: ${name}`);
  return parts.join("/");
}

export async function prepareFiles(files, names, destination) {
  const seen = new Set();
  let bytes = 0,
    count = 0;
  function reserve(name, size) {
    name = safePath(name);
    const key = name.toLowerCase();
    if (seen.has(key)) throw new Error(`Duplicate upload path: ${name}`);
    if (++count > limits.files || (bytes += size) > limits.expanded)
      throw new Error("Upload exceeds 2,000 files or 250 MB expanded");
    seen.add(key);
    return path.join(destination, ...name.split("/"));
  }
  for (let index = 0; index < files.length; index++) {
    const file = files[index],
      name = safePath(names[index]);
    if (/\.zip$/i.test(name)) {
      const zip = await new Promise((resolve, reject) =>
        yauzl.open(
          file.path,
          {
            lazyEntries: true,
            validateEntrySizes: true,
            strictFileNames: true,
          },
          (error, value) => (error ? reject(error) : resolve(value)),
        ),
      );
      await new Promise((resolve, reject) => {
        let failed = false;
        const fail = (error) => {
          if (!failed) {
            failed = true;
            zip.close();
            reject(error);
          }
        };
        zip.on("error", fail);
        zip.on("end", resolve);
        zip.on("entry", async (entry) => {
          try {
            if (
              entry.fileName.startsWith("__MACOSX/") ||
              /(?:^|\/)\.DS_Store$/.test(entry.fileName)
            ) {
              zip.readEntry();
              return;
            }
            if (entry.generalPurposeBitFlag & 1)
              throw new Error("Encrypted ZIPs are not supported");
            const mode = (entry.externalFileAttributes >>> 16) & 0xf000;
            if (mode && mode !== 0x8000 && mode !== 0x4000)
              throw new Error("ZIP links and special files are not supported");
            if (entry.fileName.endsWith("/")) {
              safePath(entry.fileName.slice(0, -1));
              zip.readEntry();
              return;
            }
            const target = reserve(entry.fileName, entry.uncompressedSize);
            await mkdir(path.dirname(target), { recursive: true });
            const stream = await new Promise((res, rej) =>
              zip.openReadStream(entry, (error, value) =>
                error ? rej(error) : res(value),
              ),
            );
            let written = 0;
            const meter = new Transform({
              transform(chunk, encoding, callback) {
                written += chunk.length;
                callback(
                  written > entry.uncompressedSize || written > limits.expanded
                    ? new Error("ZIP entry exceeded its declared size")
                    : null,
                  chunk,
                );
              },
            });
            await pipeline(
              stream,
              meter,
              createWriteStream(target, { flags: "wx" }),
            );
            if (!failed) zip.readEntry();
          } catch (error) {
            fail(error);
          }
        });
        zip.readEntry();
      });
    } else {
      const target = reserve(name, file.size);
      await mkdir(path.dirname(target), { recursive: true });
      await copyFile(file.path, target);
    }
  }
  const paths = [];
  async function walk(folder, prefix = "") {
    for (const item of await readdir(folder, { withFileTypes: true })) {
      const file = prefix + item.name;
      if (item.isDirectory())
        await walk(path.join(folder, item.name), file + "/");
      else paths.push(file);
    }
  }
  await walk(destination);
  const entries = paths.filter((p) => /\.html$/i.test(p)).sort();
  if (!entries.length)
    throw new Error(
      "No HTML page found. Include an HTML file with your assets.",
    );
  return { paths, entries, bytes, count };
}

export function cleanLabel(value, label, optional = false) {
  if (
    typeof value !== "string" ||
    (!optional && !value.trim()) ||
    value.length > 120 ||
    /[\x00-\x1f\x7f]/.test(value)
  )
    throw new Error(
      `${label} must be ${optional ? "at most" : "between 1 and"} 120 characters`,
    );
  return value.trim();
}

export async function assertEntry(folder, entry) {
  safePath(entry);
  if (
    !/\.html$/i.test(entry) ||
    !(await stat(path.join(folder, entry))).isFile()
  )
    throw new Error("Select an HTML entry page");
}
