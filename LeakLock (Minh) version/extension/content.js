"use strict";
(() => {
  // src/adapters/index.ts
  var SELECTORS = {
    reddit: 'shreddit-post, shreddit-comment, .thing.link, .thing.comment, [data-testid="post-container"], [data-testid="comment"]',
    forum: '[itemtype$="/DiscussionForumPosting"], [itemtype$="/Comment"], article[data-post-id], .topic-post, .Comment, [data-comment-id]',
    news: 'article, [itemtype$="/NewsArticle"], [itemtype$="/Article"]',
    generic: 'article, [role="article"]'
  };
  var query = (doc, selector) => Array.from(doc.querySelectorAll(selector));
  function owned(root, candidates) {
    const clone = root.cloneNode(true);
    const originals = Array.from(root.querySelectorAll("*"));
    const copies = Array.from(clone.querySelectorAll("*"));
    originals.forEach((node, i) => {
      if (candidates.has(node)) copies[i]?.remove();
    });
    clone.querySelectorAll('script,style,template,nav,time,a[href*="/reels/audio/"],button,input,textarea,select,quiet-web-controls,quiet-web-manual,video,audio,[hidden],[aria-hidden="true"],[slot="credit-bar"],[slot="repost-button"],[slot="post-stats-entry-point"]').forEach((el) => el.remove());
    const walker = root.ownerDocument.createTreeWalker(clone, NodeFilter.SHOW_TEXT), parts = [];
    while (walker.nextNode()) parts.push(walker.currentNode.textContent || "");
    return parts.join(" ").replace(/\s+/g, " ").trim().slice(0, 16e3);
  }
  function ownElement(root, selector, candidates) {
    return Array.from(root.querySelectorAll(selector)).find((el) => {
      let parent = el.parentElement;
      while (parent && parent !== root) {
        if (candidates.has(parent)) return false;
        parent = parent.parentElement;
      }
      return true;
    });
  }
  function extract(root, url, candidates, type, metadata = root.matches("article") ? root.querySelector("shreddit-post") || root : root) {
    const title = ownElement(root, 'h1,h2,h3,[slot="title"],[data-testid="post-title"]', candidates)?.textContent?.trim() || metadata.getAttribute("post-title") || "";
    const authorEl = ownElement(root, '[rel="author"],[data-author],a[href*="/user/"],a[href*="/u/"],a[slot="authorName"]', candidates);
    const author = metadata.getAttribute("author") || metadata.getAttribute("data-author") || authorEl?.getAttribute("data-author") || authorEl?.textContent?.trim();
    const link = ownElement(root, 'a[href*="/reel/"],a[href*="/p/"],a[href*="/reels/"]:not([href*="/reels/audio/"]),a[data-permalink],a[rel="bookmark"],a[href*="/comments/"]', candidates);
    let permalink = url.href;
    try {
      permalink = new URL(metadata.getAttribute("permalink") || metadata.getAttribute("data-permalink") || link?.getAttribute("href") || url.href, url).href;
    } catch {
    }
    const body = owned(root, candidates);
    const labels = [root.getAttribute("aria-label"), ...Array.from(root.querySelectorAll("video[aria-label],img[alt]")).filter((el) => {
      let p = el.parentElement;
      while (p && p !== root) {
        if (candidates.has(p)) return false;
        p = p.parentElement;
      }
      return true;
    }).map((el) => el.getAttribute("aria-label") || el.getAttribute("alt"))].filter((s) => !!s && !/^(video|reel|photo|image)$/i.test(s)).slice(0, 12);
    let domain = url.hostname;
    const external = ownElement(root, "a[data-domain],a[data-outbound-url]", candidates);
    const outbound = metadata.getAttribute("content-href") || external?.getAttribute("href");
    if (outbound) {
      try {
        const target = new URL(outbound, url);
        if (/^https?:$/.test(target.protocol)) domain = target.hostname;
      } catch {
      }
    }
    return { root, id: metadata.getAttribute("post-id") || metadata.getAttribute("thingid") || metadata.id || permalink, site: url.hostname, url: permalink, type, author, title, body, caption: type === "reel" ? body : "", hashtags: body.match(/#[\p{L}\p{N}_]+/gu) ?? [], labels, domain, evidence: [...body ? ["visible DOM text"] : [], ...labels.length ? ["accessible metadata"] : []], limitations: type === "reel" ? ["Text and accessible metadata only; video, audio and embedded text are not analyzed."] : ["Heuristic extraction; site structure may limit coverage."] };
  }
  function instagramPath(link) {
    try {
      const url = new URL(link.getAttribute("href") || "", "https://www.instagram.com");
      return /(^|\.)instagram\.com$/.test(url.hostname) ? url.pathname : "";
    } catch {
      return "";
    }
  }
  function instagramProfile(root) {
    return Array.from(root.querySelectorAll("a[href]")).find((a) => {
      const path = instagramPath(a);
      return /^\/[\w.]+(?:\/reels)?\/?$/.test(path) && !/^\/(reels|reel|p|explore|direct|accounts|stories|about|legal)\/?$/.test(path);
    });
  }
  function instagramPermalink(root) {
    return Array.from(root.querySelectorAll("a[href]")).find((a) => /^\/(?:p|reel|reels)\/(?!audio(?:\/|$))[\w-]+\/?$/.test(instagramPath(a)));
  }
  var instagram = {
    id: "instagram-reels",
    matches: (url) => /(^|\.)instagram\.com$/.test(url.hostname),
    discover(doc) {
      const roots = new Set(query(doc, "main article").filter((root) => !root.querySelector("article")));
      for (const video of doc.querySelectorAll("video")) {
        const article = video.closest("article");
        if (article && article.querySelectorAll("video").length === 1) {
          roots.add(article);
          continue;
        }
        let el = video.parentElement, fallback;
        for (let depth = 0; el && depth < 40; depth++, el = el.parentElement) {
          if (el.matches('main,body,[role="main"],[role="dialog"],nav')) break;
          if (el.querySelectorAll("video").length !== 1) break;
          const hasIdentity = !!instagramProfile(el) || !!instagramPermalink(el);
          if (hasIdentity && !fallback) fallback = el;
          if (el.querySelector('[aria-label="Like"],[aria-label="Unlike"],[aria-label="Comment"]')) {
            fallback = el;
            break;
          }
        }
        if (fallback) roots.add(fallback);
      }
      return [...roots].filter((root) => ![...roots].some((other) => other !== root && other.contains(root)));
    },
    extract(root, url, candidates) {
      const item = extract(root, url, candidates, root.querySelector("video") ? "reel" : "post");
      const viewport = root.ownerDocument.defaultView;
      const ranked = [...candidates].map((candidate) => {
        const rect = candidate.getBoundingClientRect();
        const visible = Math.max(0, Math.min(rect.bottom, viewport.innerHeight) - Math.max(rect.top, 0)) * Math.max(0, Math.min(rect.right, viewport.innerWidth) - Math.max(rect.left, 0));
        const video2 = candidate.querySelector("video");
        return { candidate, score: visible > 0 ? visible + (video2 && !video2.paused ? 1e12 : 0) : 0 };
      }).sort((a, b) => b.score - a.score);
      item.active = !!ranked[0]?.score && ranked[0]?.candidate === root;
      const profile = instagramProfile(root), permalink = instagramPermalink(root);
      item.author = profile ? instagramPath(profile).split("/").filter(Boolean)[0] : item.author;
      const caption = Array.from(root.querySelectorAll('[role="button"],button')).find((el) => !el.hasAttribute("aria-label") && !el.querySelector('svg,video,[role="button"],button') && (el.textContent?.trim().length ?? 0) >= 8)?.textContent?.replace(/\s+/g, " ").trim();
      if (caption && item.author) item.identityHint = JSON.stringify([item.author, caption]);
      const video = root.querySelector("video"), media = video?.getAttribute("src") || video?.querySelector("source")?.getAttribute("src") || video?.getAttribute("poster");
      item.url = permalink ? new URL(instagramPath(permalink), url).href : new URL("/reels/", url).href;
      item.id = permalink ? item.url : `instagram:${item.author || ""}:${media || root.id || item.body}`;
      if (item.author) item.body = item.body.replace(item.author, "").trim();
      item.caption = item.body;
      return item;
    }
  };
  var redditComment = 'shreddit-comment,.thing.comment,[data-testid="comment"]';
  var reddit = { id: "reddit", matches: (url) => /(^|\.)reddit\.com$/.test(url.hostname), discover: (doc) => [...new Set(query(doc, SELECTORS.reddit).flatMap((root) => {
    if (root.matches(redditComment)) {
      const body = Array.from(root.querySelectorAll('[slot="comment"],.entry,[data-testid="comment-body"]')).find((el) => el.closest(redditComment) === root);
      return body ? [body] : root.querySelector(redditComment) ? [] : [root];
    }
    if (!root.matches("shreddit-post")) return [root];
    const article = root.closest("article");
    return [article && article.querySelectorAll("shreddit-post").length === 1 && !article.querySelector(redditComment) ? article : root];
  }))], extract: (root, url, c) => {
    const comment = root.closest(redditComment);
    const ownedCandidates = /* @__PURE__ */ new Set([...c, ...root.querySelectorAll(redditComment)]);
    const item = comment ? extract(root, url, ownedCandidates, "comment", comment) : extract(root, url, ownedCandidates, "post");
    const metadata = comment || root.querySelector("shreddit-post") || root;
    const community = metadata.getAttribute("subreddit-prefixed-name") || metadata.getAttribute("subreddit-name") || metadata.getAttribute("data-subreddit") || /^\/r\/([^/]+)/i.exec(new URL(item.url).pathname)?.[1];
    if (community) {
      item.community = `r/${community.replace(/^r\//i, "")}`;
      item.evidence.push("Reddit community metadata");
    }
    return item;
  } };
  var forum = { id: "forum", matches: (_url, doc) => !!doc.querySelector(SELECTORS.forum), discover: (doc) => query(doc, SELECTORS.forum), extract: (root, url, c) => extract(root, url, c, root.matches('[itemtype$="/Comment"],[data-comment-id],.Comment') ? "comment" : "post") };
  var news = {
    id: "news",
    matches: (_url, doc) => !!doc.querySelector('meta[property="og:type"][content="article"], [itemtype$="/NewsArticle"], main article h1, article section'),
    discover(doc) {
      return query(doc, SELECTORS.news).flatMap((root) => {
        const sections = Array.from(root.querySelectorAll(':scope > section, :scope > [itemprop="articleBody"] > section'));
        if (sections.length) return sections;
        if (root.querySelector("h1") || (root.textContent?.length ?? 0) > 2500) return Array.from(root.querySelectorAll("p")).filter((p) => !p.closest("aside,nav"));
        return [root];
      });
    },
    extract: (root, url, c) => extract(root, url, c, root.matches("section,p") ? "article-section" : "news-card")
  };
  var generic = { id: "generic", matches: () => true, discover: (doc) => query(doc, SELECTORS.generic).filter((el) => !el.querySelector('article,[role="article"]') && (el.textContent?.length ?? 0) < 2500), extract: (root, url, c) => extract(root, url, c, "post") };
  var adapters = [instagram, reddit, forum, news, generic];
  var chooseAdapter = (url, doc) => adapters.find((a) => a.matches(url, doc));

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
  var authorKey = (site, author) => `${site.toLowerCase()}|${author.trim().toLowerCase()}`;
  function defaultRules() {
    return Object.keys(PRESETS).map((key) => ({ ...presetRule(key), id: `preset-${key}`, enabled: false }));
  }
  var DEFAULTS = { presetsVersion: 3, enabled: true, demoControls: false, defaultAction: "blur", rules: defaultRules(), pausedSites: [], allowedAuthors: [], allowedDomains: [] };

  // src/classifier.ts
  function contains(text, term) {
    const escaped = term.normalize("NFKC").trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return !!escaped && new RegExp(`(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`, "iu").test(text.normalize("NFKC"));
  }
  function evaluate(item, prefs) {
    if (prefs.allowedDomains.includes(item.domain ?? item.site) || item.author && prefs.allowedAuthors.includes(authorKey(item.site, item.author))) return { status: "allowed" };
    const community = item.community || "";
    const fields = { title: item.title, body: item.body, caption: item.caption, hashtags: item.hashtags.join(" "), labels: item.labels.join(" "), community: [community, community.replace(/[_-]+/g, " ").replace(new RegExp("([\\p{Ll}\\p{N}])(\\p{Lu})", "gu"), "$1 $2")].join(" ") };
    const all = Object.values(fields).join(" ");
    for (const rule of prefs.rules) {
      if (!rule.enabled || rule.except.some((term) => contains(all, term))) continue;
      const contextTerm = rule.contextTerms?.find((term) => contains(all, term));
      if (rule.contextTerms?.length && !contextTerm) continue;
      for (const [field, text] of Object.entries(fields)) {
        const term = rule.terms.find((term2) => contains(text, term2));
        if (term) return { status: "match", rule, field, term, ...contextTerm ? { contextTerm } : {} };
      }
    }
    return { status: all.replace(/[^\p{L}\p{N}]/gu, "").length < 8 ? "insufficient" : "clear" };
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

  // src/manual.ts
  var controlCSS = disclosureMotion + `
:host{font:700 13px/1.4 system-ui,sans-serif!important;color:#334155!important}*{box-sizing:border-box}
button,input,select{font:inherit;border:2px solid #dfe5e8;border-radius:12px;min-height:38px;padding:8px 12px;background:white;color:#334155;max-width:100%}
button{cursor:pointer;border-bottom-width:4px}button:active{transform:translateY(2px);border-bottom-width:2px}button:disabled{cursor:wait;opacity:.6}
button:focus-visible,input:focus-visible,select:focus-visible{outline:3px solid #1cb0f6;outline-offset:2px}
form{display:grid;gap:8px;margin-top:10px;max-width:340px}label{display:grid;gap:4px;font-size:12px}p{font-size:12px;margin:6px 0;color:#526574}.primary{background:#58cc02;color:#173d00;border-color:#48ad00}.form-actions{display:flex;gap:8px;flex-wrap:wrap}
`;
  function addManualControl(item, hide) {
    const root = item.root, doc = root.ownerDocument;
    const priorPosition = root.style.getPropertyValue("position"), priority = root.style.getPropertyPriority("position"), hadStyle = root.hasAttribute("style");
    const changed = getComputedStyle(root).position === "static";
    if (changed) root.style.setProperty("position", "relative", "important");
    const host = doc.createElement("quiet-web-manual");
    host.style.cssText = `all:initial!important;display:block!important;position:absolute!important;top:${item.type === "comment" ? 4 : 56}px!important;right:10px!important;z-index:2147483645!important;pointer-events:auto!important;`;
    const shadow = host.attachShadow({ mode: "open" }), style = doc.createElement("style");
    style.textContent = controlCSS + `
    button{display:grid;place-items:center;width:28px;height:28px;min-height:28px;padding:5px;border:1px solid #cbd5e1;border-radius:50%;background:#ffffffed;color:#64748b;opacity:0;transition:opacity 120ms ease;touch-action:manipulation}
    :host([data-hover]) button{opacity:.65}:host button:hover,:host button:focus-visible{opacity:1;background:#fff;color:#334155}button:active{transform:none;border-bottom-width:1px}svg{width:16px;height:16px;pointer-events:none}
    @media(hover:none){button{opacity:.65}}
    @media(prefers-reduced-motion:reduce){button{transition:none}}
  `;
    const kind = item.type === "comment" ? "comment" : item.type === "reel" ? "reel" : "post";
    const button = doc.createElement("button");
    button.type = "button";
    button.title = `Demo: hide this ${kind}`;
    button.setAttribute("aria-label", `Hide this ${kind} with Leak Lock`);
    button.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m3 3 18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.8 5.2A11 11 0 0 1 12 5c6 0 10 7 10 7a18 18 0 0 1-3.1 3.9M6.3 6.3A21 21 0 0 0 2 12s4 7 10 7a11 11 0 0 0 5.7-1.7"/></svg>';
    button.onclick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      hide();
    };
    const enter = () => host.setAttribute("data-hover", ""), leave = () => host.removeAttribute("data-hover");
    root.addEventListener("pointerenter", enter);
    root.addEventListener("pointerleave", leave);
    if (root.matches(":hover")) enter();
    shadow.append(style, button);
    root.append(host);
    return { host, restore() {
      root.removeEventListener("pointerenter", enter);
      root.removeEventListener("pointerleave", leave);
      host.remove();
      if (changed && root.style.position === "relative") {
        if (priorPosition) root.style.setProperty("position", priorPosition, priority);
        else root.style.removeProperty("position");
        if (!hadStyle && !root.style.cssText) root.removeAttribute("style");
      }
    } };
  }

  // src/treatment.ts
  function applyTreatment(item, decision, reveal, allow, learning) {
    const root = item.root;
    const host = document.createElement("quiet-web-controls");
    const shadow = host.attachShadow({ mode: "open" });
    host.addEventListener("click", (event) => event.stopPropagation());
    host.addEventListener("keydown", (event) => event.stopPropagation());
    const demo = !!learning?.manual;
    const compact = /(^|\.)reddit\.com$/.test(item.site) || item.type !== "reel" && !demo && decision.rule?.action === "collapse";
    const collapse = compact;
    const saved = [];
    const originalStyles = /* @__PURE__ */ new Map();
    function prop(el, key, value) {
      if (!originalStyles.has(el)) originalStyles.set(el, el.getAttribute("style"));
      const prior = el.style.getPropertyValue(key), priority = el.style.getPropertyPriority(key);
      el.style.setProperty(key, value, "important");
      saved.push(() => {
        if (el.style.getPropertyValue(key) === value) {
          if (prior) el.style.setProperty(key, prior, priority);
          else el.style.removeProperty(key);
        }
      });
    }
    const wrapped = [], treated = /* @__PURE__ */ new WeakSet();
    function refresh() {
      for (const node of [...root.childNodes]) if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) {
        const span = document.createElement("span");
        span.dataset.quietText = "";
        node.replaceWith(span);
        span.append(node);
        wrapped.push(span);
      }
      for (const child of [...root.children]) if (child instanceof HTMLElement && child !== host && !child.matches("quiet-web-manual") && !treated.has(child)) {
        treated.add(child);
        const inert = child.inert;
        child.inert = true;
        saved.push(() => {
          child.inert = inert;
        });
        if (collapse) prop(child, "display", "none");
        else {
          prop(child, "filter", "blur(12px)");
          prop(child, "user-select", "none");
          prop(child, "pointer-events", "none");
        }
      }
    }
    refresh();
    if (getComputedStyle(root).display === "inline") prop(root, "display", "block");
    if (getComputedStyle(root).position === "static") prop(root, "position", "relative");
    if (collapse) {
      prop(root, "padding", "0px");
      prop(root, "min-height", "0px");
      prop(root, "height", "auto");
      prop(root, "max-height", "none");
    } else prop(root, "min-height", "160px");
    if (compact) {
      prop(root, "display", "block");
      prop(root, "flex-grow", "0");
      prop(root, "flex-basis", "auto");
    }
    for (const key of ["tabindex"]) {
      const value = root.getAttribute(key);
      if (value !== null) {
        root.removeAttribute(key);
        saved.push(() => {
          if (!root.hasAttribute(key)) root.setAttribute(key, value);
        });
      }
    }
    host.style.cssText = `all:initial!important;display:block!important;${collapse ? "position:relative!important;" : "position:absolute!important;inset:0!important;"}z-index:2147483646!important;pointer-events:auto!important;`;
    const style = document.createElement("style");
    style.textContent = `
    :host{font:14px/1.45 system-ui,sans-serif!important;color:#183c37!important}
    *{box-sizing:border-box}.surface{${collapse ? "" : "position:absolute;inset:0;"}display:flex;align-items:center;justify-content:center;padding:12px;background:rgba(247,253,239,.96);border:2px solid #d8e9c9;border-radius:18px;overflow:auto;max-height:100%}
    .surface:has(form){align-items:flex-start}.panel{max-width:460px;padding:6px;text-align:left}strong{display:block;font-size:15px;margin-bottom:4px}p{margin:4px 0 10px;font-size:12px;color:#3c5d54;overflow-wrap:anywhere}.actions{display:flex;gap:6px;flex-wrap:wrap}
    details{font:12px/1.4 system-ui;align-self:center}summary{cursor:pointer;padding:8px;color:#345b4c}details[open]{width:100%}details[open]>.actions{padding-top:5px}summary:focus-visible{outline:3px solid #b76716;outline-offset:2px}
    button{font:600 12px/1.3 system-ui;min-height:34px;border:1px solid #789b8d;border-radius:7px;padding:7px 10px;color:#163f35;background:white;cursor:pointer}button:first-child{background:#58cc02;color:#173d00;border-color:#48ad00}button:focus-visible{outline:3px solid #b76716;outline-offset:2px}`;
    style.textContent += `
    .surface{position:${compact ? "relative" : "absolute"};isolation:isolate;min-height:${compact ? "88px" : "0"};padding:14px 18px;overflow:hidden;background:#f1f8e9;border-radius:16px}
    .surface::before{content:"";position:absolute;inset:-20px;z-index:-1;background:radial-gradient(ellipse at 18% 45%,#c9dfb1 0,transparent 48%),radial-gradient(ellipse at 85% 80%,#dfebd5 0,transparent 50%);filter:blur(16px);opacity:.8;pointer-events:none}
    .panel{display:flex;align-items:center;justify-content:center;gap:12px;flex-wrap:wrap;padding:0;max-width:100%;width:100%}
    .lock-mark{width:28px;height:28px;flex:none;color:#527247}.panel>strong{margin:0;font-size:15px}.actions{gap:6px}
    .panel>form{flex-basis:100%;margin:6px auto 0}.surface:has(form){align-items:center}
    @media(max-width:360px){.surface{padding:12px}.panel{gap:8px}.lock-mark{width:22px;height:22px}}
  `;
    const surface = document.createElement("div");
    surface.className = "surface";
    surface.setAttribute("role", "group");
    surface.setAttribute("aria-label", "Leak Lock locked content");
    const panel = document.createElement("div");
    panel.className = "panel";
    {
      const mark = document.createElement("span");
      mark.className = "lock-mark";
      mark.setAttribute("aria-hidden", "true");
      mark.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/></svg>';
      panel.append(mark);
    }
    const title = document.createElement("strong");
    title.textContent = "Locked";
    const actions = document.createElement("div");
    actions.className = "actions";
    function button(label, callback, target = actions) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = label;
      b.onclick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        callback();
      };
      target.append(b);
    }
    button(learning?.manual ? "Undo hide" : "Reveal for 30s", reveal);
    const more = document.createElement("details");
    const summary = document.createElement("summary");
    summary.textContent = "Always allow\u2026";
    more.append(summary);
    const allowances = document.createElement("div");
    allowances.className = "actions";
    more.append(allowances);
    if (item.author) button(`Allow @${item.author.replace(/^u\//, "")}`, () => allow("author"), allowances);
    button(`Allow ${item.domain || item.site}`, () => allow("domain"), allowances);
    if (!learning?.manual) actions.append(more);
    panel.append(title, actions);
    surface.append(panel);
    style.textContent += controlCSS;
    shadow.append(style, surface);
    root.append(host);
    return { host, refresh, restore(moveFocus = true) {
      const focused = shadow.activeElement !== null;
      host.remove();
      saved.reverse().forEach((fn) => fn());
      for (const [el, original] of originalStyles) {
        const normalized = document.createElement("div");
        if (original !== null) normalized.setAttribute("style", original);
        if (el.style.cssText === normalized.style.cssText) {
          if (original === null) el.removeAttribute("style");
          else el.setAttribute("style", original);
        }
      }
      for (const span of wrapped) if (span.isConnected) span.replaceWith(...span.childNodes);
      if (moveFocus && focused && root.isConnected) {
        const prev = root.getAttribute("tabindex");
        root.tabIndex = -1;
        root.focus({ preventScroll: true });
        if (prev === null) root.removeAttribute("tabindex");
        else root.setAttribute("tabindex", prev);
      }
    } };
  }

  // src/engine.ts
  var FilterEngine = class {
    constructor(prefs, mutate, doc = document, learn2 = async () => {
      throw new Error("Learning unavailable");
    }) {
      this.prefs = prefs;
      this.mutate = mutate;
      this.doc = doc;
      this.learn = learn2;
      this.observer = new MutationObserver((mutations) => {
        if (mutations.some((m) => !(m.target instanceof Element && m.target.closest("quiet-web-controls,quiet-web-manual")))) this.schedule();
      });
      this.observe();
      doc.defaultView?.addEventListener("scroll", this.onViewport, { passive: true, capture: true });
      doc.defaultView?.addEventListener("resize", this.onViewport, { passive: true });
      this.navigation = setInterval(() => {
        if (this.lastURL !== this.doc.location.href) this.schedule();
      }, 700);
      this.scan();
    }
    records = /* @__PURE__ */ new Map();
    // Feed virtualization replaces DOM nodes. Keep user choices by content identity,
    // independently of the controls and roots that currently happen to be mounted.
    interactions = /* @__PURE__ */ new Map();
    timer;
    observer;
    navigation;
    revealTimers = /* @__PURE__ */ new Set();
    lastURL = "";
    revision = 0;
    onViewport = () => {
      if (this.status.adapter === "instagram-reels") this.schedule();
    };
    status = { adapter: "generic", scanned: 0, hidden: 0, insufficient: 0, paused: false };
    observe() {
      this.observer.observe(this.doc.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["href", "src", "aria-label", "alt", "post-id", "thingid", "permalink", "author", "data-author", "data-permalink", "data-post-id", "data-comment-id", "subreddit-name", "subreddit-prefixed-name", "data-subreddit"] });
    }
    schedule() {
      if (!this.timer) this.timer = setTimeout(() => {
        this.timer = void 0;
        this.scan();
      }, 180);
    }
    clearView(state, focus = false) {
      state.manual?.restore();
      state.manual = void 0;
      state.treatment?.restore(focus);
      state.treatment = void 0;
    }
    update(prefs) {
      this.prefs = prefs;
      this.revision++;
      for (const [identity, state] of this.interactions) {
        state.revealedUntil = void 0;
        if (!prefs.demoControls || !state.manualHidden) this.interactions.delete(identity);
      }
      this.scan();
    }
    routeKey(item) {
      const url = new URL(this.doc.location.href);
      return item.type === "reel" && item.active && item.identityHint && /(^|\.)instagram\.com$/.test(url.hostname) && /^\/reels?\/[\w-]+\/?$/.test(url.pathname) ? `reel-route:${url.origin}${url.pathname.replace(/\/$/, "")}|${item.identityHint}` : void 0;
    }
    remember(state) {
      const route = this.routeKey(state.item), previous = this.interactions.get(state.identity) || (route ? this.interactions.get(route) : void 0);
      if (previous) {
        for (const [key, value] of this.interactions) if (value === previous) this.interactions.delete(key);
      }
      if (state.manualHidden || (state.revealedUntil ?? 0) > Date.now()) {
        const interaction = { manualHidden: !!state.manualHidden, revealedUntil: state.revealedUntil };
        this.interactions.set(state.identity, interaction);
        if (route) this.interactions.set(route, interaction);
      }
    }
    scan() {
      this.observer.disconnect();
      try {
        for (const [key, value] of this.interactions) if (!value.manualHidden && (value.revealedUntil ?? 0) <= Date.now()) this.interactions.delete(key);
        const url = new URL(this.doc.location.href), navigated = this.lastURL !== url.href;
        this.lastURL = url.href;
        if (navigated) {
          for (const state of this.records.values()) this.clearView(state);
          this.records.clear();
        }
        const adapter = chooseAdapter(url, this.doc);
        const roots = adapter.discover(this.doc).filter((el) => el.isConnected && !el.closest("nav,header,footer,aside,quiet-web-controls,quiet-web-manual"));
        const candidates = new Set(roots);
        for (const [root, state] of this.records) if (!candidates.has(root)) {
          this.clearView(state);
          this.records.delete(root);
        }
        this.status = { adapter: adapter.id, scanned: 0, hidden: 0, insufficient: 0, paused: !this.prefs.enabled || this.prefs.pausedSites.includes(url.hostname) };
        if (this.status.paused) {
          for (const state of this.records.values()) this.clearView(state);
          this.records.clear();
          return;
        }
        for (const root of roots) {
          const item = adapter.extract(root, url, candidates);
          const { root: _, active: __, ...serializable } = item;
          const fingerprint = JSON.stringify(serializable);
          const identity = item.url !== url.href || root.matches("[post-id],[thingid],[data-post-id],[data-comment-id],shreddit-post,shreddit-comment") || root.querySelector("shreddit-post") || /\/(?:p|reel|reels|comments)\/[^/]+/.test(item.url) ? `${item.id}|${item.url}` : JSON.stringify([fingerprint, root.querySelector("video")?.getAttribute("src")]);
          let state = this.records.get(root);
          if (!state || state.identity !== identity) {
            if (state) this.clearView(state);
            state = { identity, item };
            this.records.set(root, state);
          }
          state.item = item;
          const route = this.routeKey(item), remembered = this.interactions.get(identity) || (route ? this.interactions.get(route) : void 0);
          if (remembered) {
            this.interactions.set(identity, remembered);
            if (route) this.interactions.set(route, remembered);
          }
          state.manualHidden = remembered?.manualHidden ?? false;
          state.revealedUntil = remembered?.revealedUntil;
          this.status.scanned++;
          const decision = evaluate(item, this.prefs);
          if (decision.status === "insufficient") this.status.insufficient++;
          const covered = [...this.records].some(([other, s]) => other !== root && other.contains(root) && !!s.treatment);
          if (covered) {
            this.clearView(state);
            state.signature = void 0;
            continue;
          }
          const hidden = !!state.manualHidden || decision.status === "match" && (state.revealedUntil ?? 0) <= Date.now();
          const signature = JSON.stringify([hidden, !!state.manualHidden, decision.rule, decision.term, decision.field, decision.contextTerm, this.revision, item.author, item.domain]);
          if (state.signature === signature && (hidden ? state.treatment?.host.isConnected : state.manual?.host.isConnected)) {
            state.treatment?.refresh();
            if (hidden) this.status.hidden++;
            continue;
          }
          const previous = state.treatment?.host.shadowRoot;
          const form = previous?.querySelector("form");
          const expanded = previous?.querySelector("details")?.open;
          const focused = previous?.activeElement?.getAttribute("aria-label") || previous?.activeElement?.textContent;
          this.clearView(state);
          state.signature = signature;
          const current = state;
          if (!hidden) {
            if (this.prefs.demoControls) state.manual = addManualControl(item, () => {
              current.manualHidden = true;
              current.revealedUntil = void 0;
              this.remember(current);
              this.scan();
              current.treatment?.host.shadowRoot?.querySelector("button")?.focus({ preventScroll: true });
            });
            continue;
          }
          state.treatment = applyTreatment(item, decision, () => {
            current.manualHidden = false;
            current.revealedUntil = Date.now() + 3e4;
            this.remember(current);
            this.clearView(current, true);
            current.signature = void 0;
            this.scan();
            const timer = setTimeout(() => {
              this.revealTimers.delete(timer);
              this.schedule();
            }, 30010);
            this.revealTimers.add(timer);
          }, (kind) => {
            const latest = current.item;
            void this.mutate(kind, kind === "author" ? authorKey(latest.site, latest.author) : latest.domain || latest.site).catch((error) => {
              const panel = current.treatment?.host.shadowRoot?.querySelector(".panel");
              if (panel) {
                let p = panel.querySelector(".allow-error");
                if (!p) {
                  p = this.doc.createElement("p");
                  p.className = "allow-error";
                  p.setAttribute("role", "status");
                  panel.append(p);
                }
                p.textContent = `Could not save: ${String(error)}`;
              }
            });
          }, { rules: this.prefs.rules, learn: this.learn, manual: !!state.manualHidden });
          const shadow = state.treatment.host.shadowRoot;
          const more = shadow.querySelector("details");
          if (more && expanded) more.open = true;
          if (form) shadow.querySelector(".panel")?.append(form);
          if (focused) [...shadow.querySelectorAll("button,summary,input,select")].find((el) => (el.getAttribute("aria-label") || el.textContent) === focused)?.focus({ preventScroll: true });
          this.status.hidden++;
        }
      } finally {
        this.observe();
      }
    }
    destroy() {
      this.doc.defaultView?.removeEventListener("scroll", this.onViewport, true);
      this.doc.defaultView?.removeEventListener("resize", this.onViewport);
      clearInterval(this.navigation);
      clearTimeout(this.timer);
      for (const timer of this.revealTimers) clearTimeout(timer);
      this.observer.disconnect();
      for (const state of this.records.values()) this.clearView(state, true);
      this.records.clear();
      this.interactions.clear();
    }
  };

  // src/content.ts
  var engine;
  var learn = async (ruleId, phrase) => {
    const result = await chrome.runtime.sendMessage({ type: "learnRule", ruleId, phrase });
    if (!result?.ok) throw new Error(result?.error || "Could not save phrase");
  };
  void readPreferences().then((prefs) => {
    engine = new FilterEngine(prefs, async (kind, value) => {
      const result = await chrome.runtime.sendMessage(kind === "author" ? { type: "allowAuthor", author: value } : { type: "allowDomain", domain: value });
      if (!result?.ok) throw new Error(result?.error || "Settings unavailable");
    }, document, learn);
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.preferences) void readPreferences().then((p) => engine?.update(p));
  });
  chrome.runtime.onMessage.addListener((message, _sender, reply) => {
    if (message.type === "status") reply(engine?.status ?? { loading: true });
  });
  window.addEventListener("pagehide", () => engine?.destroy());
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) void readPreferences().then((p) => {
      engine?.destroy();
      engine = new FilterEngine(p, async (kind, value) => {
        const r = await chrome.runtime.sendMessage(kind === "author" ? { type: "allowAuthor", author: value } : { type: "allowDomain", domain: value });
        if (!r?.ok) throw new Error(r?.error);
      }, document, learn);
    });
  });
})();
