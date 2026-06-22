(function () {
  "use strict";

  const U = window.AuraUtils;
  const Data = window.AuraData;
  const refs = {};
  let toastTimer = 0;
  let resizeRaf = 0;

  function init() {
    refs.stage = document.getElementById("game");
    refs.counter = document.getElementById("auraCounter");
    refs.counterWrap = document.querySelector(".aura-counter");
    refs.boostSidebar = document.getElementById("boostSidebar");
    refs.particleLayer = document.getElementById("particleLayer");
    refs.toast = document.getElementById("toast");
    refs.cameraButton = document.getElementById("cameraButton");
    refs.menuButton = document.getElementById("menuButton");
    refs.fullscreenButton = document.getElementById("fullscreenButton");
    refs.idleFill = document.getElementById("idleFill");
    refs.heatFill = document.getElementById("heatFill");
    refs.tierFill = document.getElementById("tierFill");
    refs.idleMeter = refs.idleFill.parentElement;
    refs.heatMeter = refs.heatFill.parentElement;
    refs.tierMeter = refs.tierFill.parentElement;
    syncCrop();
    window.addEventListener("resize", queueSyncCrop, { passive: true });
    window.addEventListener("orientationchange", queueSyncCrop, { passive: true });
  }

  function queueSyncCrop() {
    if (resizeRaf) cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(syncCrop);
  }

  function syncCrop() {
    if (!refs.stage) return;
    const rect = refs.stage.getBoundingClientRect();
    refs.stage.style.setProperty("--crop-x", `${Math.max(0, -rect.left)}px`);
  }

  function metrics() {
    syncCrop();
    const rect = refs.stage.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    const visibleLeft = U.clamp(-rect.left, 0, width);
    const visibleRight = U.clamp(window.innerWidth - rect.left, 0, width);
    return { rect, width, height, visibleLeft, visibleRight, visibleWidth: Math.max(0, visibleRight - visibleLeft) };
  }

  function iconMaskUrl(symbol) {
    const safe = String(symbol || "?").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><text x="64" y="91" font-size="92" text-anchor="middle" font-family="Arial, Apple Color Emoji, Segoe UI Emoji, sans-serif">${safe}</text></svg>`;
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  }

  function createMaskedIcon(symbol, className) {
    const icon = document.createElement("span");
    icon.className = `masked-icon ${className || ""}`.trim();
    icon.setAttribute("aria-hidden", "true");
    if (symbol && symbol !== Data.AURA && symbol !== Data.SWEAT && symbol !== Data.CHILL) icon.style.setProperty("--icon-mask", iconMaskUrl(symbol));
    return icon;
  }

  function setAura(value) { refs.counter.textContent = U.formatWhole(value); }

  function setMeters(idleProgress, heat, tierProgress) {
    refs.idleFill.style.width = `${U.clamp(idleProgress, 0, 1) * 100}%`;
    refs.heatFill.style.width = `${U.clamp(heat, 0, 1) * 100}%`;
    refs.tierFill.style.width = `${U.clamp(tierProgress || 0, 0, 1) * 100}%`;
  }

  function humanPoint() {
    const m = metrics();
    return { x: U.gaussian(m.width * 0.51, m.width * 0.13, m.width * 0.38, m.width * 0.63), y: U.gaussian(m.height * 0.45, m.height * 0.22, m.height * 0.22, m.height * 0.72) };
  }

  function cameraPoint() {
    const m = metrics();
    return { x: m.width * 0.5, y: m.height * 0.86 };
  }

  function menuPoint() {
    const m = metrics();
    return { x: Math.max(m.visibleLeft + 28, m.visibleRight - 28), y: Math.max(24, m.height * 0.05) };
  }

  function heatPoint() {
    const m = metrics();
    return { x: Math.max(m.visibleLeft + 26, Math.min(m.width * 0.85, m.visibleRight - 26)), y: m.height - Math.max(17, m.height * 0.013) };
  }

  function spawnAura(kind, startPoint) {
    const m = metrics();
    const start = startPoint || humanPoint();
    const target = { x: m.width * 0.5, y: Math.max(26, m.height * 0.043) };
    const outSign = Math.random() < 0.5 ? -1 : 1;
    const outX = outSign * U.rand(m.width * 0.022, m.width * 0.096);
    const up = U.rand(m.height * 0.032, m.height * 0.08);
    const wiggle = outSign * U.rand(m.width * 0.012, m.width * 0.03);
    const dx = target.x - start.x;
    const dy = target.y - start.y;
    const particle = document.createElement("span");
    particle.className = `aura-particle ${kind || "normal"}`;
    particle.style.left = `${start.x}px`;
    particle.style.top = `${start.y}px`;
    refs.particleLayer.appendChild(particle);
    const duration = kind === "boost" ? U.rand(1120, 1420) : U.rand(940, 1180);
    const scalePeak = kind === "boost" ? 1.18 : 0.98;
    const animation = particle.animate([
      { opacity: 0, transform: "translate(-50%, -50%) translate(0, 11px) rotate(-12deg) scale(0.14)", offset: 0 },
      { opacity: 0.58, transform: `translate(-50%, -50%) translate(${wiggle * 0.4}px, ${-up * 0.2}px) rotate(8deg) scale(0.54)`, offset: 0.16 },
      { opacity: 1, transform: `translate(-50%, -50%) translate(${outX * 0.42}px, ${-up * 0.68}px) rotate(-10deg) scale(${scalePeak})`, offset: 0.42 },
      { opacity: 0.98, transform: `translate(-50%, -50%) translate(${outX}px, ${-up * 0.62}px) rotate(6deg) scale(${scalePeak * 0.95})`, offset: 0.56 },
      { opacity: 0.92, transform: `translate(-50%, -50%) translate(${outX * 0.7}px, ${-up * 0.08}px) rotate(0deg) scale(0.74)`, offset: 0.7 },
      { opacity: 0, transform: `translate(-50%, -50%) translate(${dx}px, ${dy}px) rotate(16deg) scale(0.22)`, offset: 1 }
    ], { duration, easing: "cubic-bezier(0.19, 0.78, 0.16, 1)", fill: "forwards" });
    animation.onfinish = () => particle.remove();
    animation.oncancel = () => particle.remove();
  }

  function spawnSweat(amount, startPoint) {
    const m = metrics();
    const start = startPoint || cameraPoint();
    const target = heatPoint();
    const total = Math.max(1, Math.min(8, Math.ceil((Number(amount) || 0) * 8)));
    for (let i = 0; i < total; i += 1) {
      window.setTimeout(() => {
        const particle = document.createElement("span");
        const wobble = U.rand(-m.width * 0.06, m.width * 0.06);
        particle.className = "aura-particle sweat";
        particle.style.left = `${start.x + U.rand(-10, 10)}px`;
        particle.style.top = `${start.y + U.rand(-10, 10)}px`;
        refs.particleLayer.appendChild(particle);
        const dx = target.x - start.x;
        const dy = target.y - start.y;
        const animation = particle.animate([
          { opacity: 0, transform: "translate(-50%, -50%) scale(0.22)", offset: 0 },
          { opacity: 1, transform: `translate(-50%, -50%) translate(${wobble}px, -26px) scale(0.92)`, offset: 0.32 },
          { opacity: 0, transform: `translate(-50%, -50%) translate(${dx}px, ${dy}px) scale(0.22)`, offset: 1 }
        ], { duration: U.rand(640, 860), easing: "cubic-bezier(.22,.76,.22,1)", fill: "forwards" });
        animation.onfinish = () => particle.remove();
        animation.oncancel = () => particle.remove();
      }, i * 44);
    }
  }

  function spawnChillBurst(count) {
    const m = metrics();
    const visibleLeft = Math.max(m.visibleLeft + 26, m.width * 0.08);
    const visibleRight = Math.min(m.visibleRight - 26, m.width * 0.92);
    const y = m.height - Math.max(15, m.height * 0.014);
    const total = Math.max(5, Math.min(18, Math.round(count || 8)));
    for (let i = 0; i < total; i += 1) {
      const spread = total === 1 ? 0.5 : i / (total - 1);
      const x = U.rand(visibleLeft + (visibleRight - visibleLeft) * Math.max(0, spread - 0.08), visibleLeft + (visibleRight - visibleLeft) * Math.min(1, spread + 0.08));
      window.setTimeout(() => spawnAura("chill", { x, y }), i * 34);
    }
  }

  function cameraFlash() {
    refs.cameraButton.classList.add("pulse");
    window.setTimeout(() => refs.cameraButton.classList.remove("pulse"), 120);
    const flash = document.createElement("span");
    flash.className = "camera-flash";
    refs.stage.appendChild(flash);
    flash.addEventListener("animationend", () => flash.remove(), { once: true });
  }

  function flashUpgrade(effect) {
    const targets = [];
    if (effect === "flat" || effect === "chance" || effect === "spawnValue") targets.push(refs.counterWrap, refs.tierMeter);
    if (effect === "clickPower") targets.push(refs.cameraButton);
    if (effect === "heatDecay") targets.push(refs.heatMeter);
    if (effect === "chillTimer" || effect === "chillReward") targets.push(refs.idleMeter);
    for (const target of targets) {
      if (!target) continue;
      target.classList.remove("glow-gold");
      void target.offsetWidth;
      target.classList.add("glow-gold");
      window.setTimeout(() => target.classList.remove("glow-gold"), 820);
    }
  }

  function renderStat(container, stat) {
    container.textContent = "";
    if (!stat) return;
    if (stat.number) {
      const number = document.createElement("span");
      number.className = "stat-num";
      number.textContent = stat.number;
      container.appendChild(number);
    } else if (stat.before) {
      container.append(document.createTextNode(stat.before));
    }
    if (stat.icon === "sparkle") container.appendChild(createMaskedIcon(Data.AURA, "stat-icon sparkle"));
    if (stat.icon === "camera") container.appendChild(createMaskedIcon(Data.CAMERA, "stat-icon camera"));
    if (stat.icon === "sweat") container.appendChild(createMaskedIcon(Data.SWEAT, "stat-icon sweat"));
    if (stat.text) {
      const text = document.createElement("span");
      text.className = "stat-text";
      text.textContent = stat.text;
      container.appendChild(text);
    } else if (stat.after) {
      container.append(document.createTextNode(stat.after));
    }
  }

  function renderBoosts(slots, onClick) {
    refs.boostSidebar.textContent = "";
    for (const slot of slots) {
      const button = document.createElement("button");
      button.className = "boost-button disabled";
      button.type = "button";
      button.dataset.boostId = slot.id;
      button.style.setProperty("--ready", "0");
      button.innerHTML = '<span class="boost-icon-wrap"><span class="masked-icon boost-icon boost-main" aria-hidden="true"></span></span><span class="boost-label"></span>';
      button.addEventListener("click", (event) => {
        event.preventDefault();
        onClick(slot.id);
      });
      refs.boostSidebar.appendChild(button);
    }
    updateBoosts(slots);
  }

  function updateBoosts(slots) {
    for (const slot of slots) {
      const button = refs.boostSidebar.querySelector(`[data-boost-id="${CSS.escape(slot.id)}"]`);
      if (!button) continue;
      button.classList.toggle("active", Boolean(slot.available));
      button.classList.toggle("disabled", !slot.available);
      button.style.setProperty("--ready", String(U.clamp(slot.ready || 0, 0, 1)));
      button.setAttribute("aria-label", slot.statLabel || slot.name || slot.id);
      const icon = button.querySelector(".boost-main");
      if (icon && slot.icon) icon.style.setProperty("--icon-mask", iconMaskUrl(slot.icon));
      const label = button.querySelector(".boost-label");
      renderStat(label, slot.stat);
    }
  }

  function boostPoint(id) {
    const button = refs.boostSidebar && refs.boostSidebar.querySelector(`[data-boost-id="${CSS.escape(id)}"]`);
    const stageRect = refs.stage.getBoundingClientRect();
    if (!button) return cameraPoint();
    const rect = button.getBoundingClientRect();
    return { x: rect.left - stageRect.left + rect.width * 0.5, y: rect.top - stageRect.top + rect.height * 0.42 };
  }

  function popBlockDust(id) {
    const point = boostPoint(id);
    for (let i = 0; i < 7; i += 1) {
      const dust = document.createElement("span");
      dust.className = "block-dust";
      dust.style.left = `${point.x}px`;
      dust.style.top = `${point.y}px`;
      refs.particleLayer.appendChild(dust);
      const dx = U.rand(-22, 22);
      const dy = U.rand(-26, 18);
      const animation = dust.animate([
        { opacity: 0.72, transform: "translate(-50%, -50%) scale(0.7)" },
        { opacity: 0, transform: `translate(-50%, -50%) translate(${dx}px, ${dy}px) scale(${U.rand(0.15, 0.45)})` }
      ], { duration: U.rand(340, 520), easing: "cubic-bezier(.2,.7,.2,1)", fill: "forwards" });
      animation.onfinish = () => dust.remove();
      animation.oncancel = () => dust.remove();
    }
  }

  function showToast(text, important) {
    if (!text) return;
    window.clearTimeout(toastTimer);
    refs.toast.textContent = text;
    refs.toast.classList.toggle("important", Boolean(important));
    refs.toast.classList.add("show");
    toastTimer = window.setTimeout(() => refs.toast.classList.remove("show", "important"), important ? 2500 : 2100);
  }

  function toggleFullscreen() {
    const target = refs.stage;
    if (!document.fullscreenElement) {
      if (target.requestFullscreen) target.requestFullscreen().catch(() => {});
    } else if (document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    }
  }

  window.AuraUI = { init, refs, metrics, syncCrop, setAura, setMeters, humanPoint, cameraPoint, menuPoint, heatPoint, spawnAura, spawnSweat, spawnChillBurst, cameraFlash, flashUpgrade, renderBoosts, updateBoosts, boostPoint, popBlockDust, showToast, toggleFullscreen };
})();
