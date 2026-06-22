(function () {
  "use strict";

  function defaults() {
    const now = Date.now();
    return {
      aura: 0,
      peakAura: 0,
      extraChancePerTick: 0,
      auraPerSpawn: 1,
      clickPower: 1,
      chillDurationMs: 10000,
      chillBoostMultiplier: 1,
      heat: 0,
      heatGainMultiplier: 1,
      heatDecayBonus: 0,
      chillChain: 0,
      lastActionAt: now,
      lastChillBoostAt: now,
      lastPenaltyAt: 0,
      lastClickAt: 0,
      clickChain: 0,
      itemsTaken: 0,
      uniqueTaken: [],
      uniqueMissed: [],
      mercyCharges: 0,
      savedAt: now,
      totals: {
        naturalSpawns: 0,
        cameraClicks: 0,
        chillBoosts: 0,
        items: 0,
        penalties: 0
      }
    };
  }

  function mergeState(base, saved) {
    if (!saved || typeof saved !== "object") return base;
    const merged = { ...base, ...saved };
    merged.totals = { ...base.totals, ...(saved.totals || {}) };
    merged.uniqueTaken = Array.isArray(saved.uniqueTaken) ? saved.uniqueTaken : [];
    merged.uniqueMissed = Array.isArray(saved.uniqueMissed) ? saved.uniqueMissed : [];
    return merged;
  }

  function sanitize(state) {
    const c = window.AuraData.constants;
    const now = Date.now();
    const offlineSeconds = Math.max(0, (now - (Number(state.savedAt) || now)) / 1000);

    state.aura = Math.max(0, Number(state.aura) || 0);
    state.peakAura = Math.max(state.aura, Number(state.peakAura) || 0);
    state.extraChancePerTick = Math.max(0, Number(state.extraChancePerTick) || 0);
    state.auraPerSpawn = Math.max(c.BASE_AURA_PER_SPAWN, Number(state.auraPerSpawn) || c.BASE_AURA_PER_SPAWN);
    state.clickPower = Math.max(c.BASE_CLICK_POWER, Number(state.clickPower) || c.BASE_CLICK_POWER);
    state.chillDurationMs = Math.max(c.MIN_CHILL_MS, Number(state.chillDurationMs) || c.BASE_CHILL_MS);
    state.chillBoostMultiplier = Math.max(1, Number(state.chillBoostMultiplier) || 1);
    state.heat = Math.max(0, Math.min(0.95, (Number(state.heat) || 0) - offlineSeconds * c.HEAT_DECAY_BASE));
    state.heatGainMultiplier = Math.max(0.28, Math.min(1, Number(state.heatGainMultiplier) || 1));
    state.heatDecayBonus = Math.max(0, Number(state.heatDecayBonus) || 0);
    state.chillChain = 0;
    state.lastActionAt = now;
    state.lastChillBoostAt = now;
    state.lastClickAt = 0;
    state.clickChain = 0;
    state.mercyCharges = Math.max(0, Math.floor(Number(state.mercyCharges) || 0));
    state.savedAt = now;
    return state;
  }

  function load() {
    const c = window.AuraData.constants;
    let saved = null;
    try {
      saved = JSON.parse(localStorage.getItem(c.SAVE_KEY) || "null");
    } catch (error) {
      saved = null;
    }
    return sanitize(mergeState(defaults(), saved));
  }

  function save(state) {
    const c = window.AuraData.constants;
    try {
      const copy = { ...state, savedAt: Date.now() };
      localStorage.setItem(c.SAVE_KEY, JSON.stringify(copy));
    } catch (error) {
      /* localStorage can be unavailable in locked-down browsers. */
    }
  }

  function reset() {
    const c = window.AuraData.constants;
    try { localStorage.removeItem(c.SAVE_KEY); } catch (error) { /* ignore */ }
    return defaults();
  }

  window.AuraState = { defaults, load, save, reset };
})();
