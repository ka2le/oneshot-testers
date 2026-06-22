(function () {
  "use strict";

  const AURA = "\u2728";
  const CAMERA = "\u26AA";
  const SWEAT = "\ud83d\udca6";
  const CHILL = "\u2744\ufe0f";

  window.AuraData = {
    AURA, CAMERA, SWEAT, CHILL,

    constants: {
      SAVE_KEY: "incrementalAuraFarming.v8",
      TICK_MS: 50,
      BASE_CHANCE_PER_TICK: 0.018,
      MAX_CHANCE_PER_TICK: 0.45,
      BASE_AURA_PER_SPAWN: 1,
      BASE_CLICK_POWER: 1,
      BASE_CHILL_MS: 10000,
      MIN_CHILL_MS: 4300,
      CHILL_BASE_AURA: 10,
      HEAT_DECAY_BASE: 0.03
    },

    tierThresholds: [0, 100, 300, 800, 2000],

    boostTypes: [
      { id: "auraFlat", effect: "flat", icons: ["👕", "⌚", "🎸", "❤️", "🕊️"], bases: [10, 40, 80, 200, 500], heat: 0.48, messages: ["Fresh tee. easy aura.", "Wrist watch. timed perfectly.", "Meal prepped. aura fed.", "Heart soft. aura huge.", "Inner peace. outer shine."] },
      { id: "chance", effect: "chance", icons: ["🧥", "💍", "🏃", "🌴", "🌙"], bases: [0.018, 0.028, 0.04, 0.055, 0.075], heat: 0.52, messages: ["Jacket caught the light.", "Ring glint. odds up.", "Morning run. aura finds you.", "Home base. aura settles in.", "Moon phase. aura magnetic."] },
      { id: "spawnValue", effect: "spawnValue", icons: ["👟", "👑", "🥤", "🌷", "🌳"], bases: [0.35, 0.75, 1.2, 2, 3.2], heat: 0.5, messages: ["Clean kicks. sparkle stride.", "Crown energy. bigger sparkle.", "Protein shake. sparkle dense.", "Flowers outside. sparkles inside.", "Lotus bloom. sparkles upgraded."] },
      { id: "clickPower", effect: "clickPower", icons: ["🧢", "🕶️", "🐕", "💃", "🦋"], bases: [1.1, 1.9, 3.2, 5.4, 8.8], heat: 0.52, messages: ["Cap forward. tap cleaner.", "Sunglasses. camera got cooler.", "Dog walk glow-up.", "Long-haired muse. camera blessed.", "Mirror check. honest greatness."] },
      { id: "heatDecay", effect: "heatDecay", icons: ["🩳", "📿", "💨", "🍁", "🛡️"], bases: [0.015, 0.025, 0.04, 0.06, 0.09], heat: 0.56, messages: ["Soft hands. stank fades.", "Prayer beads. panic drains.", "Cool breeze. thirsty no more.", "Secure attachment. stank down.", "Boundaries up. desperation leaves."] },
      { id: "chillTimer", effect: "chillTimer", icons: ["🧦", "🎧", "🧘", "🤙", "☁️"], bases: [1, 1.4, 1.8, 2.3, 3], heat: 0.5, messages: ["Cozy socks. timer trimmed.", "Playlist on. waiting shorter.", "Breathing arc activated.", "Open hands. calm arrives sooner.", "Cloud mind. timer melts."] },
      { id: "chillReward", effect: "chillReward", icons: ["🧸", "🎵", "🧹", "🛏️", "🧠"], bases: [0.18, 0.28, 0.42, 0.65, 1], heat: 0.51, messages: ["Comfort object. stillness pays.", "One song. better waiting.", "Clean room. cleaner reward.", "Eight hours. absurd power.", "Peace learned math."] }
    ],

    tips: [
      "Wait. then wait again.", "White bar pays each fill.", "Red bar full = aura zero.", "Side boosts cost 💦.", "Two boosts can wipe.", "Pick one. ignore three.", "✨ never gets spent.", "Higher aura changes icons.", "Random rolls can spike.", "Flat ✨ is bait but tasty.", "Camera scales hard.", "💦 fades over time.", "Stank makes offers tempting.", "Cool means restraint.", "Top gold line changes chapters.", "Hover is optional. text is there.", "Chill reward is steady now.", "No more chill exponential.", "Let some icons stay locked."
    ],

    jokes: [
      "Try hard. invisibly.", "Be real... real cool.", "Chill!!!!", "Aura farming. no tiller.", "The sidebar is judging.", "Cool has opportunity cost.", "The red bar smells fear.", "Do less. gain more.", "Loot goblin denied.", "Main character on energy saver.", "That icon is flirting with disaster.", "Pick me energy detected.", "Soft flex. hard penalty.", "The dog arc remains elite.", "No caption. just chapter.", "Your stank bar filed a complaint.", "Stillness is overpowered.", "Need less. glow more.", "The gold bar knows things.", "Cool enough to miss loot.", "Sunglasses indoors. spiritually correct.", "One more boost? dangerous sentence.", "A little mystery, as a stat.", "Do not scare the ✨.", "Your aura has legal counsel.", "Chill streak became chill salary.", "The city is taking notes.", "This build is risk management.", "Silent mode. louder aura.", "The shirt started it all."
    ]
  };
})();
