"use strict";
(() => {
  // src/filter-content.ts
  var items = (value) => value.split(",").map((s) => s.trim()).filter(Boolean);
  function formatContent(rule) {
    return [rule.terms.join(", "), ...rule.except.length ? [`Keep: ${rule.except.join(", ")}`] : [], ...rule.contextTerms?.length ? [`Only with: ${rule.contextTerms.join(", ")}`] : []].join("\n");
  }
  function parseContent(content) {
    const terms = [], except = [], context = [];
    for (const raw of content.split("\n")) {
      const line = raw.trim();
      if (!line) continue;
      const keep = /^keep\s*:\s*(.*)$/i.exec(line), only = /^only with\s*:\s*(.*)$/i.exec(line), hide = /^hide\s*:\s*(.*)$/i.exec(line);
      if (keep) except.push(...items(keep[1]));
      else if (only) context.push(...items(only[1]));
      else terms.push(...items(hide?.[1] ?? line));
    }
    if (!terms.length) throw new Error("Add filter content to hide.");
    const unique = (values) => [...new Set(values)];
    return { terms: unique(terms), except: unique(except), ...context.length ? { contextTerms: unique(context) } : {} };
  }

  // src/motion.ts
  var disclosureMotion = `
@supports (interpolate-size: allow-keywords) {
  details { interpolate-size: allow-keywords; }
  details::details-content {
    block-size: 0;
    opacity: 0;
    overflow: clip;
    transition: block-size 220ms cubic-bezier(.2,.7,.2,1), opacity 160ms ease, content-visibility 220ms allow-discrete;
  }
  details[open]::details-content { block-size: auto; opacity: 1; }
}
summary { transition: color 160ms ease; }
@media (prefers-reduced-motion: reduce) {
  details::details-content, summary { transition: none !important; }
}
`;

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

  // src/ui.ts
  var $ = (id) => document.getElementById(id);
  var motionStyle = document.createElement("style");
  motionStyle.textContent = disclosureMotion;
  document.head.append(motionStyle);
  var prefs;
  var feedbackTimer;
  function feedback(message) {
    clearTimeout(feedbackTimer);
    $("feedback").textContent = message;
    feedbackTimer = setTimeout(() => {
      $("feedback").textContent = "";
    }, 6e3);
  }
  async function mutate(message) {
    const r = await chrome.runtime.sendMessage(message);
    if (!r?.ok) throw new Error(r?.error || "Could not save settings");
    prefs = await readPreferences();
  }
  async function save() {
    try {
      await mutate({ type: "save", preferences: validatePreferences(prefs) });
      render();
      feedback("Saved.");
    } catch (error) {
      prefs = await readPreferences();
      render();
      throw error;
    }
  }
  function run(fn) {
    void fn().catch((e) => feedback(e.message));
  }
  function el(tag, text) {
    const e = document.createElement(tag);
    if (text) e.textContent = text;
    return e;
  }
  function render() {
    $("rule-count").textContent = prefs.enabled ? `${prefs.rules.filter((r) => r.enabled).length} on` : "Paused";
    if (document.body.classList.contains("popup")) {
      const list2 = $("popup-rules");
      list2.replaceChildren();
      for (const rule of prefs.rules.filter((r) => r.enabled)) {
        const row = el("div");
        row.className = "popup-rule";
        row.append(el("strong", rule.name), el("span", rule.action));
        list2.append(row);
      }
      return;
    }
    $("enabled").checked = prefs.enabled;
    $("demo-controls").checked = !!prefs.demoControls;
    $("enabled-label").textContent = prefs.enabled ? "On" : "Off";
    $("default-action").value = prefs.defaultAction;
    const list = $("rules");
    const opened = new Set(Array.from(list.querySelectorAll(".rule-card[open]")).map((card) => card.dataset.rule));
    list.replaceChildren();
    for (const rule of prefs.rules) {
      const row = ruleEditor(rule);
      const card = row.querySelector(".rule-card");
      card.open = opened.has(rule.id);
      list.append(row);
    }
    for (const [id, keys] of [["allow-list", ["allowedAuthors", "allowedDomains"]], ["pause-list", ["pausedSites"]]]) {
      const target = $(id);
      target.replaceChildren();
      for (const key of keys) for (const value of prefs[key]) {
        const row = el("div");
        row.className = "allowance";
        row.append(el("span", `${key === "allowedAuthors" ? "Author" : key === "allowedDomains" ? "Domain" : "Site"} \xB7 ${value}`));
        const remove = el("button", "Remove");
        remove.onclick = () => run(async () => {
          prefs[key] = prefs[key].filter((v) => v !== value);
          await save();
        });
        row.append(remove);
        target.append(row);
      }
      if (!target.children.length) target.append(el("p", id === "allow-list" ? "No allowances yet." : "No paused sites."));
    }
  }
  function ruleEditor(rule) {
    const row = el("div");
    row.className = "rule-row";
    const quickToggle = el("input");
    quickToggle.type = "checkbox";
    quickToggle.checked = rule.enabled;
    quickToggle.setAttribute("aria-label", `Enable ${rule.name}`);
    quickToggle.onchange = () => run(async () => {
      rule.enabled = quickToggle.checked;
      await save();
    });
    const card = el("details");
    card.className = "rule-card";
    card.dataset.rule = rule.id;
    const summary = el("summary", rule.name);
    card.append(summary);
    const form = el("form");
    form.className = "editor";
    form.setAttribute("aria-label", `Edit ${rule.name}`);
    const name = el("input");
    name.value = rule.name;
    name.required = true;
    name.maxLength = 160;
    const content = el("textarea");
    content.value = formatContent(rule);
    content.required = true;
    content.rows = 4;
    content.placeholder = "Words or phrases to hide\u2026";
    for (const [text, input] of [["Name", name], ["Filter content", content]]) {
      const label = el("label", text);
      label.append(input);
      form.append(label);
    }
    const actions = el("div");
    actions.className = "row";
    const submit = el("button", "Save");
    submit.className = "primary";
    submit.type = "submit";
    const remove = el("button", "Delete");
    remove.type = "button";
    remove.className = "danger";
    remove.setAttribute("aria-label", `Delete ${rule.name}`);
    remove.onclick = () => run(async () => {
      prefs.rules = prefs.rules.filter((r) => r.id !== rule.id);
      await save();
    });
    actions.append(submit, remove);
    form.append(actions);
    form.onsubmit = (event) => {
      event.preventDefault();
      run(async () => {
        const parsed = parseContent(content.value);
        const updated = { ...rule, name: name.value.trim(), ...parsed };
        if (!("contextTerms" in parsed)) delete updated.contextTerms;
        prefs.rules = prefs.rules.map((r) => r.id === rule.id ? updated : r);
        await save();
      });
    };
    card.append(form);
    row.append(quickToggle, card);
    return row;
  }
  async function initPopup() {
    $("options").onclick = () => {
      void chrome.runtime.openOptionsPage();
    };
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab.url || !/^https?:/.test(tab.url)) {
      $("site-status").textContent = "Open a website to start.";
      return;
    }
    const site = new URL(tab.url).hostname;
    $("site").textContent = site;
    const refresh = async () => {
      const paused = !prefs.enabled || prefs.pausedSites.includes(site);
      const button = $("pause");
      button.disabled = !prefs.enabled;
      button.textContent = !prefs.enabled ? "Filtering off" : prefs.pausedSites.includes(site) ? "Resume this site" : "Pause this site";
      try {
        const status = await chrome.tabs.sendMessage(tab.id, { type: "status" });
        $("hidden").textContent = String(paused ? 0 : status.hidden ?? 0);
        $("scanned").textContent = String(status.scanned ?? 0);
        $("site-status").textContent = !prefs.enabled ? "Turn on Leak Lock in Your filters." : paused ? "Paused on this site." : status.scanned === 0 ? "No supported items found." : status.insufficient ? `${status.insufficient} ${status.insufficient === 1 ? "item needs" : "items need"} more text.` : "Filtering on.";
      } catch {
        $("site-status").textContent = "Refresh this tab to start.";
      }
    };
    $("pause").onclick = () => run(async () => {
      await mutate({ type: "toggleSite", site });
      await refresh();
      feedback(prefs.pausedSites.includes(site) ? "Site paused." : "Filtering resumed.");
    });
    await refresh();
    const refreshTimer = setInterval(() => {
      void refresh();
    }, 700);
    window.addEventListener("pagehide", () => clearInterval(refreshTimer), { once: true });
  }
  function initOptions() {
    $("demo-controls").onchange = () => run(async () => {
      prefs.demoControls = $("demo-controls").checked;
      await save();
    });
    $("enabled").onchange = () => run(async () => {
      prefs.enabled = $("enabled").checked;
      await save();
    });
    $("default-action").onchange = () => run(async () => {
      prefs.defaultAction = $("default-action").value;
      await save();
    });
    $("add-rule").onsubmit = (event) => {
      event.preventDefault();
      run(async () => {
        const content = parseContent($("rule-terms").value);
        const name = $("rule-name").value.trim() || content.terms.slice(0, 2).join(", ").slice(0, 80);
        const rule = { id: crypto.randomUUID(), name, ...content, enabled: true, action: prefs.defaultAction };
        validatePreferences({ ...prefs, rules: [...prefs.rules, rule] });
        prefs.rules.push(rule);
        await save();
        $("add-rule").reset();
        $("custom-filter").open = false;
      });
    };
    $("export").onclick = () => {
      const blob = new Blob([JSON.stringify(prefs, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = el("a");
      a.href = url;
      a.download = "leak-lock-settings.json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1e3);
    };
    $("import").onchange = () => run(async () => {
      const file = $("import").files?.[0];
      if (!file) return;
      if (file.size > 1e6) throw new Error("Settings file must be under 1 MB");
      const imported = validatePreferences(JSON.parse(await file.text()));
      await mutate({ type: "save", preferences: imported });
      render();
      feedback("Imported settings.");
    });
  }
  run(async () => {
    prefs = await readPreferences();
    render();
    if (document.body.classList.contains("popup")) await initPopup();
    else initOptions();
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.preferences) run(async () => {
      prefs = await readPreferences();
      render();
    });
  });
})();
