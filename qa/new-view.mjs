import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import express from "express";
import { chromium } from "playwright";
import { readCatalog, root } from "../scripts/catalog.mjs";

const entries = (await readCatalog()).sort((a, b) =>
  Date.parse(b.addedAt) - Date.parse(a.addedAt) || a.file.localeCompare(b.file));
const href = (item) => `/oneshot-testers/games/${item.file.split("/").map(encodeURIComponent).join("/")}`;
const app = express();
app.use("/oneshot-testers", express.static(path.join(root, "dist")));
const server = await new Promise((resolve) => {
  const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
});
const fallback = path.join(process.env.LOCALAPPDATA || "", "ms-playwright", "chromium_headless_shell-1243", "chrome-headless-shell-win64", "chrome-headless-shell.exe");
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || (existsSync(chromium.executablePath()) ? undefined : existsSync(fallback) ? fallback : undefined);
let browser;
try {
  browser = await chromium.launch({ headless: true, executablePath });
  const errors = [];
  const evidence = path.join(root, ".local", "ui-evidence");
  await mkdir(evidence, { recursive: true });
  for (const width of [1440, 390, 320]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/oneshot-testers/`);
    const tabs = page.getByRole("group", { name: "Archive view" });
    assert.deepEqual(await tabs.getByRole("button").allTextContents(), ["Games", "Models", "New"]);
    await tabs.getByRole("button", { name: "Models", exact: true }).focus();
    await page.keyboard.press("Tab");
    assert.equal(await page.evaluate(() => document.activeElement.textContent.trim()), "New");
    await page.keyboard.press("Enter");
    await page.waitForURL(/view=new/);
    assert.equal(await tabs.getByRole("button", { name: "New", exact: true }).getAttribute("aria-pressed"), "true");
    assert.deepEqual(await page.locator(".grid .build").evaluateAll((links) => links.map((a) => a.getAttribute("href"))), entries.map(href));
    await page.locator(".compare-pick").first().click();
    await page.getByRole("searchbox").fill("Snake");
    const query = page.url();
    await page.reload();
    assert.equal(page.url(), query);
    assert.equal(await page.getByRole("searchbox").inputValue(), "Snake");
    assert.equal(await tabs.getByRole("button", { name: "New", exact: true }).getAttribute("aria-pressed"), "true");
    assert.equal(await page.locator(".selected-builds > div").count(), 1);
    const familyNav = page.locator(width > 820 ? ".models" : ".chips");
    await familyNav.getByRole("button", { name: /Qwen/ }).first().click();
    const expected = entries.filter((item) => item.family === "Qwen" &&
      `${item.game} ${item.family} ${item.model} ${item.quant} ${item.variant} ${item.file}`.toLowerCase().includes("snake"));
    assert.deepEqual(await page.locator(".grid .build").evaluateAll((links) => links.map((a) => a.getAttribute("href"))), expected.map(href));
    await tabs.getByRole("button", { name: "Games", exact: true }).click();
    assert.equal(await page.getByRole("searchbox").inputValue(), "Snake");
    await tabs.getByRole("button", { name: "New", exact: true }).click();
    await page.getByRole("button", { name: "Remove build A", exact: true }).click();
    await page.screenshot({ path: path.join(evidence, `new-view-${width}.png`), fullPage: false });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "No horizontal page overflow");
    await page.evaluate(() => document.documentElement.style.fontSize = "24px");
    await page.screenshot({ path: path.join(evidence, `new-view-${width}-large-text.png`), fullPage: false });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "No horizontal overflow with larger text");
    await page.close();
    console.log(`PASS ${width}px: chronological builds, keyboard, URL reload, filters, selection and layout`);
  }
  assert.deepEqual(errors, []);
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
