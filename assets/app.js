/* ChronoRail client app. Vanilla JS, hash routing, data from JSON.
   Routes: #  #categories  #c-<slug>  #l-<id>  #s-<stack>  #search  #about  #submit  #discover */
(() => {
"use strict";
const SITE = window.SITE || {};
const BRAND = SITE.name || "ChronoRail";
const main = document.getElementById("main");

/* ---------- helpers ---------- */
function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") e.className = v;
    else if (k.startsWith("on") && typeof v === "function") e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? "" : String(v));
  }
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false) continue;
    e.append(k.nodeType ? k : document.createTextNode(String(k)));
  }
  return e;
}
const arr = v => Array.isArray(v) ? v.map(x => String(x).trim()).filter(Boolean)
  : String(v || "").split(/[;|,]/).map(s => s.trim()).filter(Boolean);
const bool = v => v === true || /^(true|yes|y|1)$/i.test(String(v == null ? "" : v).trim());
const str = v => String(v == null ? "" : v).trim();
const humanize = s => /^[a-z0-9]+(-[a-z0-9]+)+$/.test(s) ? s.replace(/-/g, " ").replace(/^./, c => c.toUpperCase()) : s;
const isUV = s => /UNVERIFIED/i.test(s || "");
const PRICE = {
  free: { label: "Free", led: "good" }, freemium: { label: "Free tier", led: "good" },
  paid: { label: "Paid", led: "warn" }, "one-time": { label: "One-time", led: "warn" },
  subscription: { label: "Subscription", led: "warn" }, varies: { label: "Varies", led: "warn" }, unknown: { label: "Unknown", led: "off" }
};
const priceOf = l => PRICE[l.price_type] || PRICE.unknown;
function fmtDate(s) {
  if (!s) return "";
  const d = new Date(s + (s.length === 10 ? "T12:00:00" : ""));
  return isNaN(d) ? s : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
const checked = l => l.last_checked ? "Checked " + fmtDate(l.last_checked) : "Not yet checked";
const verLed = l => l.verification_status === "verified" ? "active" : (l.verification_status === "rejected" ? "err" : "off");

/* ---------- data ---------- */
let L = [], C = [], ST = [];
const byId = {}, bySlug = {}, byStack = {};
let SAMPLE = false, UNCHECKED = false;

function normListing(r) {
  return {
    id: str(r.id).toLowerCase(), name: str(r.name), maker: str(r.maker),
    category: str(r.category).toLowerCase(), subcategory: str(r.subcategory),
    tags: arr(r.tags).map(t => t.toLowerCase()), short_description: str(r.short_description),
    who_its_for: str(r.who_its_for), platforms: arr(r.platforms), formats: arr(r.formats),
    price_type: str(r.price_type).toLowerCase() || "unknown", price_note: str(r.price_note), license: str(r.license),
    official_url: str(r.official_url), affiliate_ok: bool(r.affiliate_ok), affiliate_url: str(r.affiliate_url),
    featured: bool(r.featured), paid_placement: bool(r.paid_placement), scjg_owned: bool(r.scjg_owned),
    verification_status: str(r.verification_status).toLowerCase() || "unverified",
    last_checked: str(r.last_checked || r.last_verified), confidence: str(r.confidence), sample: bool(r.sample)
  };
}
function valid(l) {
  const bad = [];
  if (!/^[a-z0-9][a-z0-9-]*$/.test(l.id)) bad.push("id");
  if (!l.name) bad.push("name");
  if (!/^https:\/\//.test(l.official_url)) bad.push("official_url");
  if (!bySlug[l.category]) bad.push("category");
  if (byId[l.id]) bad.push("duplicate id");
  if (bad.length) console.warn("[ChronoRail] skipped listing", l.id || "(no id)", bad.join(", "));
  return !bad.length;
}
async function getJSON(url) {
  const r = await fetch(url, { cache: "no-cache" });
  if (!r.ok) throw new Error(url + " " + r.status);
  return r.json();
}
async function load() {
  const [cj, lj, sj] = await Promise.all([getJSON(SITE.categoriesUrl), getJSON(SITE.dataUrl), getJSON(SITE.stacksUrl).catch(() => ({ stacks: [] }))]);
  C = (cj.categories || cj).map(c => ({ slug: str(c.slug), name: str(c.name), code: str(c.code) || "··", kind: str(c.kind), status: str(c.status) }));
  C.forEach(c => bySlug[c.slug] = c);
  const raw = Array.isArray(lj) ? lj : (lj.listings || []);
  SAMPLE = bool(lj.sample);
  raw.map(normListing).forEach(l => { if (valid(l)) { byId[l.id] = l; L.push(l); } if (l.sample) SAMPLE = true; });
  ST = (sj.stacks || sj || []).map(s => ({ id: str(s.id), code: str(s.code), name: str(s.name), summary: str(s.summary), ids: arr(s.listing_ids), sample: bool(s.sample) || bool(s.draft) }));
  ST.forEach(s => byStack[s.id] = s);
  UNCHECKED = L.filter(l => l.verification_status !== "verified").length;
  // module ID per listing: category code + position (by name) within category
  C.forEach(c => sortBy(L.filter(l => l.category === c.slug), "name").forEach((l, i) => l.mid = c.code + "-" + String(i + 1).padStart(2, "0")));
}

/* ---------- sort (never uses featured / paid fields) ---------- */
function sortBy(list, mode) {
  const out = list.slice();
  const byName = (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  if (mode === "recent") out.sort((a, b) => (b.last_checked || "").localeCompare(a.last_checked || "") || byName(a, b));
  else out.sort(byName);
  return out;
}

/* ---------- components ---------- */
function tile(l, big) {
  const initials = l.name.replace(/[^A-Za-z0-9 ]/g, " ").split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase() || "?";
  return h("div", { class: "tile well", "aria-hidden": "true" }, big ? initials : initials.slice(0, 2));
}
function labels(l) {
  const t = [];
  if (l.scjg_owned) t.push(h("span", { class: "tag own" }, "SCJG-owned"));
  if (l.featured) t.push(h("span", { class: "tag feat" }, "Featured"));
  if (l.paid_placement) t.push(h("span", { class: "tag paid" }, "Paid placement"));
  if (l.affiliate_url) t.push(h("span", { class: "tag aff" }, "Affiliate"));
  if (l.sample) t.push(h("span", { class: "tag" }, "Sample"));
  return t;
}
const joinOr = (a, empty) => a.length ? a.join(" · ") : empty;
const isHW = l => (bySlug[l.category] || {}).kind === "hardware";
const platText = (l, sep) => l.platforms.length ? l.platforms.join(sep || " · ") : (isHW(l) ? "N/A (hardware)" : "UNVERIFIED");
function plate(l) {
  const p = priceOf(l), c = bySlug[l.category];
  const lab = labels(l);
  const el = h("article", { class: "plate", style: "--tick:var(--led-" + ({ good: "good", warn: "warn" }[p.led] || "off") + ")" },
    h("div", { class: "plate-top" },
      tile(l),
      h("div", { class: "np" },
        h("a", { class: "nm", href: "#l-" + l.id }, l.name),
        h("div", { class: "mk" }, l.maker || "Maker UNVERIFIED"),
        h("div", { class: "meta" }, [l.mid, p.label, platText(l)].join(" · ") + (l.scjg_owned ? " · SCJG-owned" : ""))),
      h("span", { class: "mid", title: c ? c.name : "" }, l.mid || "··")),
    lab.length ? h("div", { class: "tags" }, lab) : null,
    h("dl", { class: "ticks well" },
      h("dt", null, "PLAT"), h("dd", null, platText(l)),
      h("dt", null, "FMT"), h("dd", null, joinOr(l.formats, "—")),
      h("dt", null, "PRICE"), h("dd", null, h("span", { class: "led " + p.led, "aria-hidden": "true" }), p.label)),
    h("p", { class: "legend" }, l.short_description || "No description yet."),
    l.who_its_for ? h("p", { class: "who" }, "For: " + l.who_its_for) : null,
    h("div", { class: "plate-foot" },
      h("span", null, h("span", { class: "led " + verLed(l), "aria-hidden": "true" }), l.verification_status.toUpperCase()),
      h("span", null, checked(l))));
  return el;
}
function rack(list) {
  if (!list.length) return h("div", { class: "msg" }, "No listings match. Clear a filter or try another search.");
  return h("div", { class: "rackgrid" }, list.map(plate));
}
function unit(title, opts, ...body) {
  opts = opts || {};
  const Tag = opts.h1 ? "h1" : "h2";
  return h("section", { class: "unit", "aria-label": opts.label || title },
    h("div", { class: "rail" }, opts.code ? h("span", { class: "mid" }, opts.code) : null, h(Tag, null, title), opts.cnt != null ? h("span", { class: "cnt" }, opts.cnt) : null),
    body);
}

/* ---------- filter panel ---------- */
function filterPanel(base, opts, onChange) {
  const f = opts.state;
  const facet = key => {
    const m = new Map();
    base.forEach(l => (key === "price_type" ? [l.price_type] : l[key]).forEach(v => m.set(v, (m.get(v) || 0) + 1)));
    return [...m.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]))).slice(0, key === "tags" ? 18 : 12);
  };
  const row = (label, key) => {
    const vals = facet(key);
    if (!vals.length) return null;
    return h("div", { class: "frow", role: "group", "aria-label": label },
      h("span", { class: "lab" }, label),
      h("div", { class: "chips" }, vals.map(([v, n]) => {
        const on = f[key].has(v);
        const txt = key === "price_type" ? (PRICE[v] || PRICE.unknown).label : v;
        return h("button", { class: "key", type: "button", "aria-pressed": on ? "true" : "false",
          onclick: () => { on ? f[key].delete(v) : f[key].add(v); onChange(); } }, txt + " " + n);
      })));
  };
  const active = (f.category ? 1 : 0) + f.platforms.size + f.formats.size + f.price_type.size + f.tags.size;
  const wide = !window.matchMedia || window.matchMedia("(min-width: 721px)").matches;
  if (f.open == null) f.open = wide;
  const panel = h("details", { class: "filters", open: f.open ? true : null, ontoggle: e => { f.open = e.currentTarget.open; } },
    h("summary", { class: "lab" }, "Filters & sort" + (active ? " · " + active + " active" : "") + (f.sort === "recent" ? " · recently checked" : "")),
    opts.category ? h("div", { class: "frow" }, h("label", { class: "lab", for: "fcat" }, "Category"),
      (() => { const s = h("select", { id: "fcat", class: "fsel" }, h("option", { value: "" }, "All categories"),
        C.filter(c => base.some(l => l.category === c.slug)).map(c => h("option", { value: c.slug }, c.code + " · " + c.name)));
        s.value = f.category; s.addEventListener("change", () => { f.category = s.value; onChange(); }); return s; })()) : null,
    row("Platform", "platforms"), row("Format", "formats"), row("Price", "price_type"), row("Tags", "tags"),
    h("div", { class: "frow", role: "group", "aria-label": "Sort" },
      h("span", { class: "lab" }, "Sort"),
      h("div", { class: "chips" },
        [["name", "Name A–Z"], ["recent", "Recently checked"]].map(([k, t]) =>
          h("button", { class: "key", type: "button", "aria-pressed": f.sort === k ? "true" : "false", onclick: () => { f.sort = k; onChange(); } }, t))),
      h("span", { class: "sortnote" }, "Featured or paid placement never changes order."),
      anyFilter(f) ? h("button", { class: "key sm", type: "button", onclick: () => { clearFilter(f); onChange(); } }, "Clear filters") : null));
  return panel;
}
function newFilter() { return { category: "", platforms: new Set(), formats: new Set(), price_type: new Set(), tags: new Set(), sort: "name" }; }
function anyFilter(f) { return !!(f.category || f.platforms.size || f.formats.size || f.price_type.size || f.tags.size); }
function clearFilter(f) { f.category = ""; ["platforms", "formats", "price_type", "tags"].forEach(k => f[k].clear()); }
function applyFilter(list, f) {
  const hasAll = (set, vals) => [...set].every(v => vals.includes(v));
  return sortBy(list.filter(l =>
    (!f.category || l.category === f.category) &&
    hasAll(f.platforms, l.platforms) && hasAll(f.formats, l.formats) &&
    (!f.price_type.size || f.price_type.has(l.price_type)) && hasAll(f.tags, l.tags)), f.sort);
}

/* ---------- views ---------- */
const filters = {};   // per-view filter state, kept while navigating
let query = "";

function setTitle(t) { document.title = t ? t + " · " + BRAND : BRAND + " · Music-production tool directory"; }
function navCurrent(key) {
  document.querySelectorAll("[data-nav]").forEach(a => a.dataset.nav === key ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current"));
}
function setLD(obj) {
  clearLD();
  if (!obj) return;
  const s = document.createElement("script"); s.type = "application/ld+json"; s.id = "ld"; s.textContent = JSON.stringify(obj, null, 2);
  document.head.append(s);
}
function clearLD() { const o = document.getElementById("ld"); if (o) o.remove(); }
function render(...nodes) { main.textContent = ""; main.append(...nodes.flat(Infinity).filter(n => n != null && n !== false)); }

function searchForm(id, value, onSubmit) {
  const inp = h("input", { id, type: "search", placeholder: "Search tools, makers, tags…", value: value || "", autocomplete: "off", "aria-label": "Search the directory" });
  const f = h("form", { class: "searchbox", role: "search", onsubmit: e => { e.preventDefault(); onSubmit(inp.value); } },
    inp, h("button", { class: "key prim", type: "submit" }, "Search"));
  return { form: f, input: inp };
}

function home() {
  setTitle(""); navCurrent("");
  const sf = searchForm("hq", query, v => { query = v; go("search"); });
  const owned = L.filter(l => l.scjg_owned).length;
  const counts = {}; L.forEach(l => counts[l.category] = (counts[l.category] || 0) + 1);
  render(
    h("section", { class: "unit", "aria-label": "Introduction" },
      h("div", { class: "rail" }, h("span", { class: "mid" }, "CR-0"), h("h2", null, "Directory · " + (SITE.family || "ChronoMedia")), h("span", { class: "cnt" }, SAMPLE ? "SAMPLE DATA" : (UNCHECKED ? "UNVERIFIED SEED" : "LIVE DATA"))),
      h("div", { class: "hero" },
        h("div", null,
          h("span", { class: "lab" }, "Free · curated · AI-readable"),
          h("h1", null, BRAND.toUpperCase()),
          h("p", null, SITE.tagline + " Listings are structured data, checked by people, and sorted by name or check date only."),
          sf.form,
          h("div", { class: "hero-acts" },
            h("button", { class: "key", type: "button", onclick: discover }, "Discover a tool"),
            h("a", { class: "key", href: "#categories" }, "Browse categories"))),
        h("div", { class: "readout well", "aria-label": "Directory counts" },
          h("div", null, h("div", { class: "n" }, L.length), h("div", { class: "k" }, "Listings")),
          h("div", null, h("div", { class: "n" }, Object.keys(counts).length), h("div", { class: "k" }, "Active categories")),
          h("div", null, h("div", { class: "n" }, L.filter(l => l.verification_status === "verified").length), h("div", { class: "k" }, "Verified")),
          h("div", { class: "full" }, h("span", { class: "led " + (SAMPLE || UNCHECKED ? "warn" : "active"), "aria-hidden": "true" }),
            SAMPLE ? "Prototype seed. Not human-verified." : (UNCHECKED ? "AI-assisted seed. Human check pending." : "Human-curated data."), owned ? " " + owned + " SCJG-owned, labeled." : "")))),
    unit("Category bay", { cnt: C.length + " MODULES" }, bay(counts)),
    unit("Stacks", { cnt: ST.length + " STACKS" }, stacksGrid()));
}
function bay(counts) {
  return h("div", { class: "bay" }, C.map(c => {
    const n = counts[c.slug] || 0;
    return h("a", { href: "#c-" + c.slug, class: n ? "" : "empty", "aria-label": c.name + ", " + n + " listings" },
      h("div", { class: "top" }, h("span", { class: "mid" }, c.code), h("span", { class: "led " + (n ? "active" : "off"), "aria-hidden": "true" })),
      h("span", { class: "cn" }, c.name),
      h("span", { class: "ct" }, n + (n === 1 ? " listing" : " listings")));
  }));
}
function stacksGrid() {
  if (!ST.length) return h("div", { class: "msg" }, "No stacks yet.");
  return h("div", { class: "stacks" }, ST.map(s => h("a", { class: "plate stack", href: "#s-" + s.id },
    h("div", { class: "top", style: "display:flex;gap:8px;align-items:center" }, h("span", { class: "mid" }, s.code || "ST"), s.sample ? h("span", { class: "tag" }, "Draft") : null),
    h("h3", null, s.name), h("p", null, s.summary),
    h("span", { class: "lab" }, s.ids.filter(i => byId[i]).length + " modules"))));
}

function categories() {
  setTitle("Categories"); navCurrent("categories");
  const counts = {}; L.forEach(l => counts[l.category] = (counts[l.category] || 0) + 1);
  render(unit("All categories", { h1: true, cnt: C.length + " MODULES" }, bay(counts)));
}

function category(slug) {
  const c = bySlug[slug];
  setTitle(c.name); navCurrent("categories");
  const base = L.filter(l => l.category === slug);
  const f = filters["c-" + slug] || (filters["c-" + slug] = newFilter());
  const draw = () => {
    const res = applyFilter(base, f);
    render(
      h("div", { class: "crumbs" }, h("a", { href: "#categories" }, "Categories"), " / ", c.name),
      h("section", { class: "unit", "aria-label": c.name },
        h("div", { class: "rail" }, h("span", { class: "mid" }, c.code), h("h1", null, c.name), h("span", { class: "cnt" }, res.length + " / " + base.length)),
        base.length ? filterPanel(base, { state: f }, draw) : null,
        base.length ? rack(res) : h("div", { class: "msg" }, "No listings in this category yet. Know a tool that belongs here? ", h("a", { href: "#submit" }, "Submit it."))));
  };
  draw();
}

function listing(id) {
  const l = byId[id], c = bySlug[l.category], p = priceOf(l);
  setTitle(l.name); navCurrent("");
  const uv = s => s ? (isUV(s) ? h("span", { class: "uv" }, s) : s) : h("span", { class: "uv" }, "UNVERIFIED");
  const row = (k, v) => h("tr", null, h("th", { scope: "row" }, k), h("td", null, v));
  const related = sortBy(L.filter(x => x.category === l.category && x.id !== l.id), "name").slice(0, 6);
  const inStacks = ST.filter(s => s.ids.includes(l.id));
  render(
    h("div", { class: "crumbs" }, h("a", { href: "#categories" }, "Categories"), " / ", h("a", { href: "#c-" + l.category }, c.name), " / ", l.name),
    h("section", { class: "unit", "aria-label": l.name },
      h("div", { class: "rail" }, h("span", { class: "mid" }, l.mid), h("h2", null, "Module faceplate"), h("span", { class: "cnt" }, l.verification_status.toUpperCase())),
      h("div", { class: "detail" },
        h("div", null,
          h("div", { class: "plate-top" }, tile(l, true), h("div", { class: "np" }, h("h1", null, l.name), h("div", { class: "mk" }, l.maker || "Maker UNVERIFIED")), null),
          h("div", { class: "tags", style: "padding:0 0 10px" }, labels(l)),
          h("p", { class: "legend", style: "margin:0;font-size:15px" }, l.short_description || "No description yet."),
          h("p", { class: "who", style: "margin:8px 0 0;font-size:14px" }, h("strong", null, "Who it's for: "), l.who_its_for || "UNVERIFIED"),
          h("div", { class: "acts" },
            h("a", { class: "key prim", href: l.official_url, target: "_blank", rel: "noopener noreferrer" }, "Official site ↗"),
            l.affiliate_url ? h("a", { class: "key", href: l.affiliate_url, target: "_blank", rel: "noopener noreferrer sponsored" }, "Affiliate link ↗") : null,
            h("button", { class: "key", type: "button", onclick: discover }, "Discover another")),
          h("p", { class: "who", style: "margin:10px 0 0;font-size:12px" }, "Official site opens in a new tab: " + l.official_url.replace(/^https:\/\//, "")),
          l.affiliate_url ? h("p", { class: "who", style: "margin:4px 0 0;font-size:12px" }, "Affiliate disclosure: SCJG may earn a commission from the affiliate link. It does not affect order or placement.") : null),
        h("div", { class: "spec well" },
          h("table", null, h("tbody", null,
            row("Category", c.code + " · " + c.name + (l.subcategory ? " / " + humanize(l.subcategory) : "")),
            row("Platforms", l.platforms.length || isHW(l) ? platText(l, ", ") : uv("")),
            row("Formats", l.formats.length ? l.formats.join(", ") : "—"),
            row("Price", h("span", null, h("span", { class: "led " + p.led, "aria-hidden": "true", style: "margin-right:6px" }), p.label, l.price_note && l.price_note.toLowerCase() !== p.label.toLowerCase() ? h("span", null, " · ", uv(l.price_note)) : null)),
            row("License", uv(l.license)),
            row("Tags", l.tags.join(", ") || "—"),
            row("Verification", h("span", null, h("span", { class: "led " + verLed(l), "aria-hidden": "true", style: "margin-right:6px" }), l.verification_status)),
            row("Last checked", l.last_checked ? fmtDate(l.last_checked) : h("span", { class: "uv" }, "Not yet checked")),
            row("Confidence", l.confidence || "—"),
            row("Listing ID", l.id)))))),
    inStacks.length ? unit("In stacks", {}, h("div", { class: "stacks" }, inStacks.map(s => h("a", { class: "plate stack", href: "#s-" + s.id }, h("span", { class: "mid", style: "align-self:flex-start" }, s.code), h("h3", null, s.name))))) : null,
    related.length ? unit("More in " + c.name, { code: c.code }, rack(related)) : null);
  setLD(jsonLD(l, c));
}
function jsonLD(l, c) {
  const hw = c.kind === "hardware", svc = c.kind === "service";
  const o = { "@context": "https://schema.org", "@type": hw ? "Product" : (svc ? "WebApplication" : "SoftwareApplication"),
    name: l.name, url: l.official_url, description: l.short_description, identifier: l.id };
  if (l.maker) o[hw ? "brand" : "publisher"] = { "@type": "Organization", name: l.maker };
  if (!hw) { o.applicationCategory = "MultimediaApplication"; if (l.platforms.length) o.operatingSystem = l.platforms.join(", "); }
  if (l.license && !isUV(l.license)) o.license = l.license;
  if (l.tags.length) o.keywords = l.tags.join(", ");
  if (l.last_checked) o.dateModified = l.last_checked;
  if (l.price_type === "free" && !hw) o.offers = { "@type": "Offer", price: "0", priceCurrency: "USD" };
  o.isAccessibleForFree = l.price_type === "free" || l.price_type === "freemium" ? true : undefined;
  return o;
}

function stack(id) {
  const s = byStack[id];
  setTitle(s.name); navCurrent("");
  const items = s.ids.map(i => byId[i]).filter(Boolean);
  const missing = s.ids.filter(i => !byId[i]);
  render(
    h("div", { class: "crumbs" }, h("a", { href: "#" }, "Home"), " / Stacks / ", s.name),
    h("section", { class: "unit", "aria-label": s.name },
      h("div", { class: "rail" }, h("span", { class: "mid" }, s.code || "ST"), h("h1", null, s.name), h("span", { class: "cnt" }, items.length + " MODULES")),
      h("div", { class: "body" }, h("p", { style: "margin:0" }, s.summary), s.sample ? h("p", { class: "who", style: "margin:6px 0 0" }, "Draft stack: a starting point, not a recommendation yet.") : null,
        missing.length ? h("p", { class: "who uv", style: "margin:6px 0 0" }, "Missing IDs: " + missing.join(", ")) : null),
      rack(items)));
}

function search() {
  setTitle("Search"); navCurrent("search");
  const f = filters.search || (filters.search = newFilter());
  let sf;
  const draw = (focus) => {
    const q = query.trim().toLowerCase();
    const words = q.split(/\s+/).filter(Boolean);
    const hits = !words.length ? L : L.filter(l => {
      const c = bySlug[l.category];
      const hay = [l.name, l.maker, l.short_description, l.who_its_for, l.subcategory, c.name, c.code, l.tags.join(" "), l.platforms.join(" "), l.formats.join(" ")].join(" ").toLowerCase();
      return words.every(w => hay.includes(w));
    });
    const res = applyFilter(hits, f);
    sf = searchForm("sq", query, v => { query = v; draw(true); });
    sf.input.addEventListener("input", () => { query = sf.input.value; clearTimeout(draw._t); draw._t = setTimeout(() => draw(true), 180); });
    render(h("section", { class: "unit", "aria-label": "Search" },
      h("div", { class: "rail" }, h("h1", null, "Search"), h("span", { class: "cnt" }, res.length + " RESULTS")),
      h("div", { class: "body" }, sf.form),
      hits.length ? filterPanel(hits, { state: f, category: true }, () => draw(false)) : null,
      h("div", { class: "resbar", "aria-live": "polite" }, h("span", null, res.length + " of " + L.length + " listings" + (q ? " for “" + query.trim() + "”" : "")), h("span", null, "Sort: " + (f.sort === "recent" ? "recently checked" : "name"))),
      rack(res)));
    if (focus) { sf.input.focus(); const n = sf.input.value.length; try { sf.input.setSelectionRange(n, n); } catch (_) {} }
  };
  draw(true);
}

function about() {
  setTitle("About"); navCurrent("about");
  const P = (...t) => h("p", null, ...t);
  render(unit("About · how listings are verified", { h1: true, cnt: "DRAFT" },
    h("div", { class: "prose" },
      h("span", { class: "draft" }, h("span", { class: "led warn", "aria-hidden": "true" }), "DRAFT · pending SCJG review"),
      h("h2", null, "What this is"),
      P(BRAND + " is a free directory of music-production tools: DAWs, plugins, sample packs, hardware, AI music tools, learning, distribution and related services. It is built and curated by " + (SITE.maker || "SCJG") + " as part of " + (SITE.family || "ChronoMedia") + "."),
      h("h2", null, "How a listing gets in"),
      h("ul", null,
        h("li", null, "Anyone can suggest a tool through the submit form. Suggestions start as unverified."),
        h("li", null, "Each listing is checked against the maker's official site for platforms, formats, price type and license, and the check date is shown. Checks are AI-assisted and reviewed by SCJG."),
        h("li", null, "Descriptions are short, factual and written by us. We do not copy vendor marketing or scrape sites."),
        h("li", null, "Listings not yet checked are marked unverified and show no check date."),
        h("li", null, "Anything we could not confirm is marked UNVERIFIED instead of guessed.")),
      h("h2", null, "Status lights"),
      h("ul", null,
        h("li", null, h("span", { class: "led active" }), " Cyan: checked against the official site."),
        h("li", null, h("span", { class: "led good" }), " Green: free or free tier."),
        h("li", null, h("span", { class: "led warn" }), " Amber: paid, one-time or subscription."),
        h("li", null, h("span", { class: "led off" }), " Grey: unverified or unknown.")),
      h("h2", null, "Ranking and disclosure"),
      P("Lists sort by name or by most recent check. Featured, paid or affiliate status never changes order or default sort. When any of these apply, the listing is labeled Featured, Paid placement or Affiliate."),
      P("Products made by SCJG (for example ChronoStudio, ChronoRack and Lava Lava) are labeled SCJG-owned."),
      h("h2", null, "Images"),
      P("We do not show vendor logos or screenshots unless the maker gives permission. Listings use an initial tile instead."),
      h("h2", null, "For machines"),
      P("The full dataset is published at ", h("a", { href: SITE.feedUrl }, "/feed/listings.json"), " and summarized in ", h("a", { href: "llms.txt" }, "/llms.txt"), ". Listing pages include schema.org JSON-LD."),
      h("h2", null, "Corrections"),
      P("Spot something wrong? Use the submit form with the listing ID. Planned contact: " + (SITE.contact || "") + " (not yet live)."))));

}

/* ---------- submit ---------- */
function submit() {
  setTitle("Submit a listing"); navCurrent("submit");
  const F = [
    ["name", "Tool name", "text", { req: true }],
    ["maker", "Maker", "text", { req: true }],
    ["official_url", "Official URL", "url", { req: true, hint: "https:// link to the maker's own page" }],
    ["category", "Category", "select", { req: true }],
    ["subcategory", "Subcategory", "text"],
    ["price_type", "Price type", "select", { opts: ["unknown", "free", "freemium", "paid", "one-time", "subscription"] }],
    ["price_note", "Price note", "text", { hint: "e.g. intro price, tiers. Leave blank if unsure." }],
    ["platforms", "Platforms", "text", { hint: "Separate with ; e.g. Windows; macOS; Linux; iOS; Web" }],
    ["formats", "Formats", "text", { hint: "Plugins only: VST3; AU; CLAP; AAX; Standalone" }],
    ["license", "License", "text", { hint: "Proprietary, GPL-3.0, MIT… or blank" }],
    ["tags", "Tags", "text", { hint: "3–6 short tags separated by ;" }],
    ["short_description", "Short description", "area", { wide: true, max: 200, hint: "One factual sentence in your own words. No marketing copy." }],
    ["who_its_for", "Who it's for", "text", { wide: true }],
    ["submitter_relation", "Your relation to the tool", "select", { opts: ["user", "maker / employee", "affiliate", "other"] }],
    ["submitter_contact", "Your email (optional)", "email", { hint: "Only used to ask follow-up questions." }]
  ];
  const vals = filters.submit || (filters.submit = { price_type: "unknown", submitter_relation: "user" });
  const pre = h("pre", { class: "json well", "aria-live": "polite", "aria-label": "JSON payload preview" });
  const errBox = h("ul", { class: "errs", "aria-live": "polite" });
  const fieldEls = {};
  const payload = () => {
    const id = (vals.name || "").toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_]+/g, "-").replace(/-+/g, "-");
    return {
      id, name: str(vals.name), maker: str(vals.maker), category: str(vals.category), subcategory: str(vals.subcategory),
      tags: arr(vals.tags).map(t => t.toLowerCase()), short_description: str(vals.short_description), who_its_for: str(vals.who_its_for),
      platforms: arr(vals.platforms), formats: arr(vals.formats), price_type: str(vals.price_type) || "unknown", price_note: str(vals.price_note),
      license: str(vals.license), official_url: str(vals.official_url), affiliate_ok: false, scjg_owned: false,
      verification_status: "unverified", last_checked: "", confidence: "submitted",
      _submission: { relation: str(vals.submitter_relation), contact: str(vals.submitter_contact), submitted_at: new Date().toISOString(), source: "chronorail-submit-form" }
    };
  };
  const check = p => {
    const e = [];
    if (!p.name) e.push(["name", "Tool name is required."]);
    if (!p.maker) e.push(["maker", "Maker is required."]);
    if (!/^https:\/\/[^\s.]+\.[^\s]+$/.test(p.official_url)) e.push(["official_url", "Official URL must start with https://"]);
    if (!bySlug[p.category]) e.push(["category", "Pick a category."]);
    if (p.short_description.length > 200) e.push(["short_description", "Keep the description under 200 characters."]);
    if (p._submission.contact && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p._submission.contact)) e.push(["submitter_contact", "That email doesn't look right."]);
    return e;
  };
  let tried = false;
  const update = () => {
    const p = payload(); const e = check(p);
    pre.textContent = JSON.stringify(p, null, 2);
    Object.values(fieldEls).forEach(w => w.classList.remove("bad"));
    errBox.textContent = "";
    if (tried) e.forEach(([k, m]) => { fieldEls[k] && fieldEls[k].classList.add("bad"); errBox.append(h("li", null, m)); });
    return e;
  };
  const fields = F.map(([k, label, type, o]) => {
    o = o || {};
    let inp;
    const id = "sf-" + k;
    if (type === "select") {
      const opts = k === "category" ? [["", "Choose…"]].concat(C.map(c => [c.slug, c.code + " · " + c.name])) : o.opts.map(v => [v, v]);
      inp = h("select", { id, name: k }, opts.map(([v, t]) => h("option", { value: v }, t)));
    } else if (type === "area") inp = h("textarea", { id, name: k, maxlength: o.max || 600, rows: 3 });
    else inp = h("input", { id, name: k, type, autocomplete: type === "email" ? "email" : "off", inputmode: type === "url" ? "url" : null });
    inp.value = vals[k] || "";
    inp.addEventListener("input", () => { vals[k] = inp.value; update(); });
    inp.addEventListener("change", () => { vals[k] = inp.value; update(); });
    const w = h("div", { class: "f" + (o.wide ? " wide" : "") }, h("label", { class: "lab", for: id }, label + (o.req ? " *" : "")), inp, o.hint ? h("small", null, o.hint) : null);
    fieldEls[k] = w;
    return w;
  });
  const status = h("p", { class: "who", "aria-live": "polite", style: "margin:0" });
  const copyBtn = h("button", { class: "key", type: "button", onclick: async () => {
    try { await navigator.clipboard.writeText(pre.textContent); status.textContent = "JSON copied."; }
    catch (_) { status.textContent = "Copy was blocked here. Select the JSON and copy it by hand."; }
  } }, "Copy JSON");
  const form = h("form", { class: "form", novalidate: true, onsubmit: async ev => {
    ev.preventDefault(); tried = true;
    const e = update();
    if (e.length) { status.textContent = "Fix the highlighted fields."; const first = fieldEls[e[0][0]]; first && first.querySelector("input,select,textarea").focus(); return; }
    if (!SITE.submitEndpoint) { status.textContent = "Preview only: no endpoint is configured, so nothing was sent. The JSON on the right is the exact payload."; return; }
    try {
      const r = await fetch(SITE.submitEndpoint, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(payload()) });
      status.textContent = r.ok ? "Received. A person will review it before anything is published." : "The endpoint answered " + r.status + ". Nothing was confirmed.";
    } catch (_) { status.textContent = "Couldn't reach the endpoint. Nothing was sent."; }
  } },
    h("div", null,
      h("div", { class: "fields" }, fields),
      h("div", { style: "margin-top:14px;display:flex;flex-direction:column;gap:10px" }, errBox,
        h("div", { class: "acts", style: "margin:0" }, h("button", { class: "key prim", type: "submit" }, SITE.submitEndpoint ? "Send for review" : "Check submission"), copyBtn), status)),
    h("div", null, h("span", { class: "lab" }, "Payload preview"), h("div", { style: "height:6px" }), pre,
      h("p", { class: "who", style: "margin:8px 0 0" }, SITE.submitEndpoint ? "This JSON is sent to the review queue." : "No endpoint configured. Submissions are previewed, not sent.")));
  render(unit("Submit a listing", { h1: true, cnt: SITE.submitEndpoint ? "LIVE" : "PREVIEW ONLY" },
    h("div", { class: "body", style: "padding-bottom:0" }, h("p", { style: "margin:0;color:var(--legend-dim)" }, "Suggest a tool for the directory. Every submission starts unverified and is checked by a person before it appears.")),
    form));
  update();
}

function notFound() {
  setTitle("Not found"); navCurrent("");
  render(unit("404 · module not found", { h1: true, code: "ERR" },
    h("div", { class: "body" }, h("p", { style: "margin:0 0 12px" }, h("span", { class: "led err", "aria-hidden": "true" }), " That page or listing isn't in the rack."),
      h("div", { class: "acts" }, h("a", { class: "key prim", href: "#" }, "Home"), h("a", { class: "key", href: "#search" }, "Search"), h("button", { class: "key", type: "button", onclick: discover }, "Discover")))));
}

/* ---------- discover / routing ---------- */
function discover() {
  if (!L.length) return;
  const cur = (location.hash.match(/^#l-(.+)$/) || [])[1];
  const pool = L.filter(l => l.id !== cur);
  const pick = pool[Math.floor(Math.random() * pool.length)] || L[0];
  go("l-" + pick.id);
}
function go(hash) { if (location.hash.slice(1) === hash) route(); else location.hash = hash; }
function route() {
  const k = decodeURIComponent(location.hash.slice(1));
  let m;
  clearLD();
  if (!k) home();
  else if (k === "categories") categories();
  else if ((m = k.match(/^c-([a-z0-9-]+)$/)) && bySlug[m[1]]) category(m[1]);
  else if ((m = k.match(/^l-([a-z0-9-]+)$/)) && byId[m[1]]) listing(m[1]);
  else if ((m = k.match(/^s-([a-z0-9-]+)$/)) && byStack[m[1]]) stack(m[1]);
  else if (k === "search") search();
  else if (k === "about") about();
  else if (k === "submit") submit();
  else if (k === "discover") { discover(); return; }
  else if (k === "main") return;
  else notFound();
  window.scrollTo(0, 0);
  if (route.started) main.focus({ preventScroll: true });
  route.started = true;
}

/* ---------- shell ---------- */
function shell() {
  document.querySelectorAll("[data-brand]").forEach(e => e.textContent = BRAND.toUpperCase());
  document.querySelectorAll("[data-brand-plain]").forEach(e => e.textContent = BRAND);
  document.querySelectorAll("[data-family]").forEach(e => e.textContent = SITE.family || "ChronoMedia");
  document.querySelectorAll("[data-maker]").forEach(e => e.textContent = SITE.maker || "SCJG");
  document.querySelectorAll("[data-discover]").forEach(b => b.addEventListener("click", discover));
  const tb = document.getElementById("themeBtn");
  const setTheme = t => { document.documentElement.dataset.theme = t === "graphite" ? "graphite" : ""; tb.setAttribute("aria-pressed", t === "graphite" ? "true" : "false"); };
  let t = ""; try { t = localStorage.getItem("cr.theme") || ""; } catch (_) {}
  setTheme(t);
  tb.addEventListener("click", () => { const n = document.documentElement.dataset.theme === "graphite" ? "" : "graphite"; setTheme(n); try { localStorage.setItem("cr.theme", n); } catch (_) {} });
  const wl = document.getElementById("waitlist");
  wl.addEventListener("submit", e => { e.preventDefault(); document.getElementById("wlMsg").textContent = "The weekly email isn't live yet. Nothing was saved or sent."; });
}

shell();
load().then(() => {
  const strip = document.getElementById("sampleStrip");
  strip.hidden = !(SAMPLE || UNCHECKED);
  if (!SAMPLE && UNCHECKED) strip.lastChild.textContent = "UNVERIFIED SEED · " + UNCHECKED + " of " + L.length + " listings come from an AI-assisted research pass and have not been checked yet. Prices and specs may be wrong.";
  window.addEventListener("hashchange", route);
  route();
}).catch(err => {
  console.error(err);
  render(unit("Data unavailable", { code: "ERR" }, h("div", { class: "msg" }, "Couldn't load the listings data (" + err.message + "). If you opened index.html from disk, serve the folder instead: see README.")));
});

/* offline cache: optional, ignored where service workers aren't allowed */
if ("serviceWorker" in navigator && location.protocol === "https:") {
  try { navigator.serviceWorker.register("sw.js").catch(() => {}); } catch (_) {}
}
})();
