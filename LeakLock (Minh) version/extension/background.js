"use strict";
(() => {
  // src/model.ts
  var PRESETS = {
    gambling: { name: "Gambling promotions", terms: ["casino", "sportsbook", "free bet", "betting bonus", "bet now", "gambling", "promo odds"], except: [] },
    gossip: { name: "Celebrity gossip", terms: ["celebrity gossip", "dating rumors", "dating rumours", "celebrity breakup", "secret romance", "paparazzi"], except: ["film review", "movie review", "cinema review"] },
    politics: { name: "Political arguments", terms: ["libtard", "snowflake liberals", "idiot conservatives", "political rant", "stolen election", "traitor voters"], except: ["election results", "election reporting", "official vote count", "polling station"] },
    dune: { name: "Dune movie spoilers", contextTerms: ["dune", "dune2", "dune3", "duneparttwo", "dunepartthree", "dunemessiah"], terms: ["spoiler", "spoilers", "ending", "ending explained", "plot leak", "plot leaks", "final scene", "post credits", "post-credits", "dies", "death", "killed", "kills", "twist"], except: ["spoiler-free", "spoiler free", "no spoilers"] },
    golf: { name: "Golf content", terms: ["golf", "golfer", "golfers", "golfing", "golf swing", "golf course", "golf club", "golf clubs", "golf lesson", "golfswing", "golftips", "golflife", "golfcontent", "golfreels", "PGA", "PGA Tour", "LPGA", "LIV Golf", "tee time", "driving range", "putting green", "fairway"], except: [] },
    spoilers: { name: "Sports spoilers", terms: ["final score", "match result", "game result", "wins the match", "won the game", "spoiler"], except: [] }
  };
  function presetRule(key, action = "blur") {
    return { id: crypto.randomUUID(), ...PRESETS[key], terms: [...PRESETS[key].terms], except: [...PRESETS[key].except], action, enabled: true };
  }
  function defaultRules() {
    return Object.keys(PRESETS).map((key) => ({ ...presetRule(key), id: `preset-${key}`, enabled: false }));
  }
  var DEFAULTS = { presetsVersion: 3, enabled: true, demoControls: false, defaultAction: "blur", rules: defaultRules(), pausedSites: [], allowedAuthors: [], allowedDomains: [] };

  // src/preferences.ts
  function validatePreferences(value) {
    if (!value || typeof value !== "object") throw new Error("Invalid preferences");
    const p = value;
    if (p.demoControls !== void 0 && typeof p.demoControls !== "boolean") throw new Error("Invalid demo controls setting");
    if (typeof p.enabled !== "boolean" || !["blur", "collapse"].includes(p.defaultAction) || !Array.isArray(p.rules) || p.rules.length > 100) throw new Error("Invalid settings or too many rules (maximum 100)");
    for (const key of ["pausedSites", "allowedAuthors", "allowedDomains"]) if (!Array.isArray(p[key]) || p[key].some((s) => typeof s !== "string" || s.length > 500)) throw new Error(`Invalid ${key}`);
    for (const r of p.rules) if (!r || typeof r.id !== "string" || typeof r.name !== "string" || !r.name.trim() || r.name.length > 160 || typeof r.enabled !== "boolean" || !["blur", "collapse"].includes(r.action) || !Array.isArray(r.terms) || !r.terms.length || !Array.isArray(r.except) || [...r.terms, ...r.except].some((t) => typeof t !== "string" || !t.trim() || t.length > 200) || r.terms.length > 100 || r.except.length > 100) throw new Error("Rules need a name and 1\u2013100 phrases, each at most 200 characters");
    for (const r of p.rules) if (r.contextTerms !== void 0 && (!Array.isArray(r.contextTerms) || r.contextTerms.length > 100 || r.contextTerms.some((t) => typeof t !== "string" || !t.trim() || t.length > 200))) throw new Error("Invalid context phrases");
    return { ...structuredClone(p), demoControls: p.demoControls ?? false };
  }
  async function readPreferences() {
    const data = await chrome.storage.local.get("preferences");
    if (!data.preferences) return structuredClone(DEFAULTS);
    const p = validatePreferences(data.preferences);
    if ((p.presetsVersion ?? 0) < 1) {
      for (const rule of defaultRules()) if (!p.rules.some((r) => r.id === rule.id || r.name === rule.name) && p.rules.length < 100) p.rules.push(rule);
      p.presetsVersion = 1;
    }
    if ((p.presetsVersion ?? 0) < 2) {
      const golf = defaultRules().find((r) => r.id === "preset-golf");
      if (!p.rules.some((r) => r.id === golf.id || r.name === golf.name) && p.rules.length < 100) p.rules.push(golf);
      p.presetsVersion = 2;
    }
    if ((p.presetsVersion ?? 0) < 3) {
      const dune = defaultRules().find((r) => r.id === "preset-dune");
      if (!p.rules.some((r) => r.id === dune.id || r.name === dune.name) && p.rules.length < 100) p.rules.push(dune);
      p.presetsVersion = 3;
    }
    return p;
  }

  // src/learning.ts
  function learnRule(preferences, ruleId, phrase) {
    const p = validatePreferences(preferences);
    if (typeof ruleId !== "string" || typeof phrase !== "string") throw new Error("Choose a filter and enter a phrase");
    const term = phrase.normalize("NFKC").replace(/\s+/g, " ").trim();
    if (!term || term.length > 200) throw new Error("Enter a phrase of 1\u2013200 characters");
    const rule = p.rules.find((r) => r.id === ruleId);
    if (!rule) throw new Error("This filter was removed. Choose another filter.");
    if (!rule.terms.some((t) => t.normalize("NFKC").trim().toLocaleLowerCase() === term.toLocaleLowerCase())) rule.terms.push(term);
    rule.enabled = true;
    return validatePreferences(p);
  }

  // src/background.ts
  var queue = Promise.resolve();
  chrome.runtime.onInstalled.addListener(() => {
    void readPreferences().then((p) => chrome.storage.local.set({ preferences: p }));
  });
  chrome.runtime.onMessage.addListener((message, sender, reply) => {
    if (sender.id !== chrome.runtime.id) return;
    queue = queue.then(async () => {
      const p = await readPreferences();
      if (message.type === "save") {
        if (!sender.url?.startsWith(chrome.runtime.getURL(""))) throw new Error("Settings must be saved from the extension UI");
        await chrome.storage.local.set({ preferences: validatePreferences(message.preferences) });
      } else if (message.type === "learnRule") {
        await chrome.storage.local.set({ preferences: learnRule(p, message.ruleId, message.phrase) });
      } else if (message.type === "toggleSite" || message.type === "allowDomain" || message.type === "allowAuthor") {
        const value = message.type === "toggleSite" ? message.site : message.type === "allowDomain" ? message.domain : message.author;
        if (typeof value !== "string" || !value || value.length > 500) throw new Error("Invalid preference value");
        const key = message.type === "toggleSite" ? "pausedSites" : message.type === "allowDomain" ? "allowedDomains" : "allowedAuthors";
        if (message.type === "toggleSite" && p[key].includes(value)) p[key] = p[key].filter((s) => s !== value);
        else if (!p[key].includes(value)) p[key].push(value);
        await chrome.storage.local.set({ preferences: validatePreferences(p) });
      } else throw new Error("Unknown request");
      reply({ ok: true });
    }).catch((error) => {
      reply({ ok: false, error: error.message });
    });
    return true;
  });
})();
