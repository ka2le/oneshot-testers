(function () {
  "use strict";

  const U = window.AuraUtils;
  const Data = window.AuraData;
  const UI = window.AuraUI;
  const Store = window.AuraState;
  const C = Data.constants;

  let state;
  let lastTickAt = Date.now();
  let nextSaveAt = 0;
  let nextTargetAt = 0;
  let targetActiveBoosts = 1;
  let boostSlots = [];

  function init() {
    UI.init();
    state = Store.load();
    state.chillBoostMultiplier = Math.max(1, Number(state.chillBoostMultiplier) || 1);
    state.heatDecayBonus = Math.max(0, Number(state.heatDecayBonus) || 0);
    UI.setAura(state.aura);
    UI.setMeters(0, state.heat, tierProgress());
    initBoostSlots();
    UI.renderBoosts(boostSlots, takeBoost);
    UI.refs.cameraButton.addEventListener("click", takePicture);
    UI.refs.menuButton.addEventListener("click", openNothingMenu);
    UI.refs.fullscreenButton.addEventListener("click", UI.toggleFullscreen);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) Store.save(state);
      else {
        const now = Date.now();
        state.lastActionAt = now;
        state.lastChillBoostAt = now;
        lastTickAt = now;
        for (const slot of boostSlots) disableSlot(slot, now, U.rand(400, 2600));
      }
    });
    window.setInterval(tick, C.TICK_MS);
  }

  function initBoostSlots() {
    const now = Date.now();
    boostSlots = Data.boostTypes.map((template, index) => {
      const slot = { ...template, available: false, disabledAt: now, cooldownMs: U.rand(600, 5200) + index * 120, readyAt: now + U.rand(600, 5200) + index * 120, ready: 0, tier: currentTier(), value: 0, icon: template.icons[0], stat: null, statLabel: "" };
      prepareSlotPreview(slot);
      return slot;
    });
  }

  function tick() {
    const now = Date.now();
    const dt = Math.max(0.001, Math.min(0.25, (now - lastTickAt) / 1000));
    lastTickAt = now;
    decayHeat(dt);
    maybeNaturalAura();
    maybeChillBoost(now);
    updateBoostAvailability(now);
    updateMeters(now);
    maybeSave(now);
  }

  function currentTier() {
    const aura = Math.max(0, state ? state.aura || 0 : 0);
    let tier = 0;
    for (let i = 0; i < Data.tierThresholds.length; i += 1) if (aura >= Data.tierThresholds[i]) tier = i;
    return tier;
  }

  function tierProgress() {
    const aura = Math.max(0, state.aura || 0);
    const tier = currentTier();
    const thresholds = Data.tierThresholds;
    const start = thresholds[tier] || 0;
    const end = thresholds[tier + 1] || (start + Math.max(1200, Math.floor(start * 1.2)));
    return U.clamp((aura - start) / Math.max(1, end - start), 0, 1);
  }

  function currentChance() {
    return U.clamp(C.BASE_CHANCE_PER_TICK + state.extraChancePerTick, 0, C.MAX_CHANCE_PER_TICK);
  }

  function maybeNaturalAura() {
    if (!U.chance(currentChance())) return;
    gainAura(state.auraPerSpawn, "normal");
    state.totals.naturalSpawns += 1;
  }

  function maybeChillBoost(now) {
    const idleFor = now - state.lastActionAt;
    if (idleFor < state.chillDurationMs) return;
    if (now - state.lastChillBoostAt < state.chillDurationMs) return;
    const amount = Math.max(C.CHILL_BASE_AURA, state.aura * 0.01) * state.chillBoostMultiplier;
    state.lastChillBoostAt = now;
    state.totals.chillBoosts += 1;
    state.aura += amount;
    state.peakAura = Math.max(state.peakAura, state.aura);
    UI.setAura(state.aura);
    UI.spawnChillBurst(9);
    UI.flashUpgrade("chillReward");
  }

  function gainAura(amount, visualKind, startPoint) {
    const safe = Math.max(0, Number(amount) || 0);
    if (safe <= 0) return;
    state.aura += safe;
    state.peakAura = Math.max(state.peakAura, state.aura);
    UI.setAura(state.aura);
    UI.spawnAura(visualKind || "normal", startPoint);
  }

  function registerAction(baseHeat, options) {
    const now = Date.now();
    state.lastActionAt = now;
    state.lastChillBoostAt = now;
    addHeat(baseHeat, options && options.important, options && options.point);
  }

  function addHeat(rawAmount, important, point) {
    const scaled = Math.max(0, Number(rawAmount) || 0);
    state.heat = U.clamp(state.heat + scaled, 0, 1.5);
    if (scaled > 0.006) UI.spawnSweat(scaled, point || UI.cameraPoint());
    if (important) UI.setMeters(0, state.heat, tierProgress());
    checkHeatPenalty();
  }

  function decayHeat(dt) {
    const decay = (C.HEAT_DECAY_BASE + state.heatDecayBonus) * dt;
    state.heat = Math.max(0, state.heat - decay);
  }

  function checkHeatPenalty() {
    if (state.heat < 1) return;
    state.aura = 0;
    state.lastPenaltyAt = Date.now();
    state.totals.penalties += 1;
    state.heat = 0;
    state.lastActionAt = Date.now();
    state.lastChillBoostAt = Date.now();
    UI.setAura(state.aura);
    UI.flashUpgrade("heatDecay");
    UI.showToast("Aura wiped. [full 💦]", true);
    Store.save(state);
  }

  function takePicture() {
    const now = Date.now();
    const since = now - state.lastClickAt;
    state.clickChain = since < 850 ? state.clickChain + 1 : 0;
    state.lastClickAt = now;
    const spamHeat = Math.min(0.08, state.clickChain * 0.0085);
    registerAction(0.026 + spamHeat, { important: true, point: UI.cameraPoint() });
    state.totals.cameraClicks += 1;
    UI.cameraFlash();
    gainAura(state.clickPower, "camera", UI.cameraPoint());
  }

  function openNothingMenu() {
    registerAction(0.003, { important: true, point: UI.menuPoint() });
    UI.showToast(U.pick(Math.random() < 0.22 ? Data.tips : Data.jokes), false);
  }

  function updateMeters(now) {
    const anchor = Math.max(state.lastActionAt, state.lastChillBoostAt || state.lastActionAt);
    const idleProgress = U.clamp((now - anchor) / state.chillDurationMs, 0, 1);
    UI.setMeters(idleProgress, state.heat, tierProgress());
  }

  function maybeSave(now) {
    if (now < nextSaveAt) return;
    nextSaveAt = now + 1200;
    Store.save(state);
  }

  function pickActiveTarget() {
    const heat = state.heat;
    const weights = heat > 0.45
      ? [{ n: 0, w: 0.04 }, { n: 1, w: 0.24 }, { n: 2, w: 0.43 }, { n: 3, w: 0.22 }, { n: 4, w: 0.07 }]
      : heat > 0.35
        ? [{ n: 0, w: 0.07 }, { n: 1, w: 0.35 }, { n: 2, w: 0.38 }, { n: 3, w: 0.16 }, { n: 4, w: 0.04 }]
        : [{ n: 0, w: 0.1 }, { n: 1, w: 0.44 }, { n: 2, w: 0.32 }, { n: 3, w: 0.12 }, { n: 4, w: 0.02 }];
    return U.weightedPick(weights, (item) => item.w).n;
  }

  function updateBoostAvailability(now) {
    if (now >= nextTargetAt) {
      targetActiveBoosts = pickActiveTarget();
      nextTargetAt = now + U.rand(1800, 2800);
    }

    for (const slot of boostSlots) {
      if (slot.available && now > slot.expiresAt) disableSlot(slot, now);
      if (!slot.available) slot.ready = U.clamp((now - slot.disabledAt) / Math.max(1, slot.cooldownMs), 0, 1);
    }

    let activeCount = boostSlots.filter((slot) => slot.available).length;
    const readySlots = boostSlots.filter((slot) => !slot.available && now >= slot.readyAt);
    while (activeCount < targetActiveBoosts && readySlots.length) {
      const slot = readySlots.splice(Math.floor(Math.random() * readySlots.length), 1)[0];
      activateSlot(slot, now);
      activeCount += 1;
    }
    UI.updateBoosts(boostSlots);
  }

  function disableSlot(slot, now, customCooldown) {
    slot.available = false;
    slot.disabledAt = now;
    slot.cooldownMs = customCooldown || U.rand(4200, 11800);
    slot.readyAt = now + slot.cooldownMs;
    slot.ready = 0;
  }

  function activateSlot(slot, now) {
    const tier = currentTier();
    slot.available = true;
    slot.tier = tier;
    slot.icon = slot.icons[tier] || slot.icons[slot.icons.length - 1];
    slot.value = randomizedValue(slot.bases[tier] || slot.bases[slot.bases.length - 1], slot.effect);
    slot.expiresAt = now + U.rand(7000, 13000);
    slot.ready = 1;
    slot.stat = statParts(slot);
    slot.statLabel = statLabel(slot);
    UI.popBlockDust(slot.id);
  }

  function prepareSlotPreview(slot) {
    const tier = currentTier();
    slot.tier = tier;
    slot.icon = slot.icons[tier] || slot.icons[slot.icons.length - 1];
    slot.value = slot.bases[tier] || slot.bases[slot.bases.length - 1];
    slot.stat = statParts(slot);
    slot.statLabel = statLabel(slot);
  }

  function randomBell() {
    let total = 0;
    for (let i = 0; i < 6; i += 1) total += Math.random();
    return total / 6 - 0.5;
  }

  function randomizedValue(base, effect) {
    let multiplier = Math.exp(randomBell() * 1.35);
    const roll = Math.random();
    if (roll < 0.03) multiplier *= U.rand(1.9, 4.2);
    else if (roll < 0.15) multiplier *= U.rand(1.25, 1.8);
    multiplier = U.clamp(multiplier, 0.65, 4.5);
    const value = base * multiplier;
    if (effect === "flat") return Math.max(1, Math.round(value));
    if (effect === "chance" || effect === "chillReward") return Math.max(0.001, Number(value.toFixed(4)));
    if (effect === "chillTimer") return Math.max(0.1, Number(value.toFixed(1)));
    if (effect === "heatDecay") return Math.max(0.001, Number(value.toFixed(3)));
    return Math.max(0.01, Number(value.toFixed(2)));
  }

  function statParts(slot) {
    switch (slot.effect) {
      case "chance": return { number: `+${U.formatPercent(slot.value)}%`, icon: "sparkle", text: "chance" };
      case "spawnValue": return { number: `+${U.formatDecimal(slot.value)}`, icon: "sparkle", text: "/aura" };
      case "clickPower": return { number: `+${U.formatDecimal(slot.value)}`, icon: "camera", text: "/photo" };
      case "flat": return { number: `+${U.formatShortNumber(slot.value)}`, icon: "sparkle", text: "aura" };
      case "heatDecay": return { number: `+${U.formatDecimal(slot.value)}`, icon: "sweat", text: "fade/s" };
      case "chillTimer": return { number: `-${U.formatDecimal(slot.value)}s`, icon: null, text: "chill timer" };
      case "chillReward": return { number: `+${U.formatPercent(slot.value)}%`, icon: null, text: "chill reward" };
      default: return { before: "+", icon: "sparkle", after: "" };
    }
  }

  function statLabel(slot) {
    switch (slot.effect) {
      case "chance": return `+${U.formatPercent(slot.value)}% ${Data.AURA} chance`;
      case "spawnValue": return `+${U.formatDecimal(slot.value)}/${Data.AURA}`;
      case "clickPower": return `+${U.formatDecimal(slot.value)}/${Data.CAMERA}`;
      case "flat": return `+${U.formatShortNumber(slot.value)}${Data.AURA}`;
      case "heatDecay": return `+${U.formatDecimal(slot.value)} ${Data.SWEAT} fade/s`;
      case "chillTimer": return `-${U.formatDecimal(slot.value)}s chill timer`;
      case "chillReward": return `+${U.formatPercent(slot.value)}% chill reward`;
      default: return `+${Data.AURA}`;
    }
  }

  function takeBoost(id) {
    const slot = boostSlots.find((item) => item.id === id);
    if (!slot || !slot.available) return;
    const point = UI.boostPoint(id);
    slot.available = false;
    applyBoost(slot, point);
    addHeat(slot.heat, true, point);
    disableSlot(slot, Date.now());
    const message = (slot.messages && slot.messages[slot.tier]) || "Upgrade found.";
    UI.showToast(`${message} [${slot.statLabel}]`, false);
    UI.updateBoosts(boostSlots);
    Store.save(state);
  }

  function applyBoost(slot, point) {
    switch (slot.effect) {
      case "chance": state.extraChancePerTick = Math.min(C.MAX_CHANCE_PER_TICK - C.BASE_CHANCE_PER_TICK, state.extraChancePerTick + slot.value); break;
      case "spawnValue": state.auraPerSpawn += slot.value; break;
      case "clickPower": state.clickPower += slot.value; break;
      case "flat": gainAura(slot.value, "boost", point); break;
      case "heatDecay": state.heatDecayBonus += slot.value; break;
      case "chillTimer": state.chillDurationMs = Math.max(C.MIN_CHILL_MS, state.chillDurationMs - (slot.value * 1000)); break;
      case "chillReward": state.chillBoostMultiplier += slot.value; break;
      default: break;
    }
    UI.flashUpgrade(slot.effect);
    state.peakAura = Math.max(state.peakAura, state.aura);
    UI.setAura(state.aura);
  }

  window.addEventListener("DOMContentLoaded", init, { once: true });
})();
