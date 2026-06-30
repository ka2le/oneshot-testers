(function () {
  "use strict";

  const U = {
    clamp(value, min, max) {
      return Math.max(min, Math.min(max, value));
    },

    rand(min, max) {
      return min + Math.random() * (max - min);
    },

    randInt(min, max) {
      return Math.floor(U.rand(min, max + 1));
    },

    chance(probability) {
      return Math.random() < probability;
    },

    pick(list) {
      return list[Math.floor(Math.random() * list.length)];
    },

    weightedPick(list, getWeight) {
      let total = 0;
      for (const item of list) total += Math.max(0, Number(getWeight(item)) || 0);
      if (total <= 0) return U.pick(list);
      let roll = Math.random() * total;
      for (const item of list) {
        roll -= Math.max(0, Number(getWeight(item)) || 0);
        if (roll <= 0) return item;
      }
      return list[list.length - 1];
    },

    formatWhole(value) {
      const safe = Math.max(0, Math.floor(Number(value) || 0));
      return safe.toLocaleString("en-US");
    },

    formatShortNumber(value) {
      const safe = Math.max(0, Number(value) || 0);
      if (safe < 1000) return Math.floor(safe).toLocaleString("en-US");
      if (safe < 1000000) return `${(safe / 1000).toFixed(safe < 10000 ? 1 : 0)}k`;
      if (safe < 1000000000) return `${(safe / 1000000).toFixed(safe < 10000000 ? 1 : 0)}m`;
      return `${(safe / 1000000000).toFixed(1)}b`;
    },

    formatDecimal(value) {
      const safe = Number(value) || 0;
      if (Math.abs(safe) >= 10) return safe.toFixed(0);
      if (Math.abs(safe) >= 1) return safe.toFixed(1).replace(/\.0$/, "");
      return safe.toFixed(2).replace(/0$/, "");
    },

    formatPercent(value, digits) {
      const pct = (Number(value) || 0) * 100;
      const fixed = pct.toFixed(digits == null ? (Math.abs(pct) < 10 ? 1 : 0) : digits);
      return fixed.replace(/\.0$/, "");
    },

    now() {
      return Date.now();
    },

    gaussian(center, spread, min, max) {
      let spare = 0;
      let random = 0;
      for (let i = 0; i < 6; i += 1) random += Math.random();
      spare = random / 6 - 0.5;
      return U.clamp(center + spare * spread * 2.8, min, max);
    }
  };

  window.AuraUtils = U;
})();
