#!/usr/bin/env node
/* ChronoRail data build. No dependencies (Node 18+).
 *
 *   node scripts/build-data.mjs                      validate data/listings.json, write feed + llms.txt
 *   node scripts/build-data.mjs --csv export.csv     convert a Google Sheet CSV export to data/listings.json first
 *   node scripts/build-data.mjs --site https://x.y   absolute URLs in llms.txt (default: relative)
 *   node scripts/build-data.mjs --strict             exit 1 on any invalid row instead of skipping it
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const P = f => join(ROOT, f);
const args = process.argv.slice(2);
const opt = k => { const i = args.indexOf(k); return i >= 0 ? (args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : true) : null; };
const SITE = String(opt("--site") || "").replace(/\/$/, "");
const STRICT = !!opt("--strict");

const FIELDS = ["id", "name", "maker", "category", "subcategory", "tags", "short_description", "who_its_for", "platforms", "formats",
  "price_type", "price_note", "license", "official_url", "affiliate_ok", "affiliate_url", "featured", "paid_placement", "scjg_owned",
  "verification_status", "last_checked", "confidence", "sample"];
const ARRAYS = new Set(["tags", "platforms", "formats"]);
const BOOLS = new Set(["affiliate_ok", "featured", "paid_placement", "scjg_owned", "sample"]);
// Sheet header aliases -> field
const ALIAS = { "last verified": "last_checked", last_verified: "last_checked", "who it's for": "who_its_for", "who its for": "who_its_for",
  url: "official_url", website: "official_url", description: "short_description", platform: "platforms", format: "formats",
  price: "price_type", "scjg owned": "scjg_owned", status: "verification_status", "affiliate ok": "affiliate_ok" };
const PRICE_TYPES = new Set(["free", "freemium", "paid", "one-time", "subscription", "varies", "unknown"]);
const PRICE_ALIAS = { hardware: "one-time", purchase: "one-time", "one time": "one-time", perpetual: "one-time", sub: "subscription", mixed: "varies" };
const INTERNAL = new Set(["source_notes", "review_flag", "notes"]); // kept in the Sheet, never published
const VSTAT = new Set(["unverified", "verified", "needs-recheck", "rejected"]);

function parseCSV(text) {
  const rows = []; let row = [], cell = "", q = false;
  text = text.replace(/^﻿/, "");
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
    else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim() !== ""));
}
const headerKey = h => { const k = h.trim().toLowerCase(); return ALIAS[k] || k.replace(/[\s-]+/g, "_"); };
const toArr = v => Array.isArray(v) ? v.map(String).map(s => s.trim()).filter(Boolean) : String(v ?? "").split(/[;|]/).map(s => s.trim()).filter(Boolean);
const toBool = v => v === true || /^(true|yes|y|1|x)$/i.test(String(v ?? "").trim());

function normalize(r) {
  const o = {};
  for (const f of FIELDS) {
    const v = r[f];
    if (ARRAYS.has(f)) o[f] = toArr(v);
    else if (BOOLS.has(f)) o[f] = toBool(v);
    else o[f] = String(v ?? "").trim();
  }
  o.id = o.id.toLowerCase();
  o.category = o.category.toLowerCase();
  o.tags = o.tags.map(t => t.toLowerCase());
  o.price_type = o.price_type.toLowerCase() || "unknown";
  o.price_type = PRICE_ALIAS[o.price_type] || o.price_type;
  // "Hardware" is not a platform or a plugin format
  o.platforms = o.platforms.filter(p => !/^hardware$/i.test(p));
  const nks = o.formats.some(f => /^nks\d*$/i.test(f));
  o.formats = o.formats.filter(f => !/^(hardware|nks\d*)$/i.test(f));
  if (nks && !o.tags.includes("nks")) o.tags.push("nks");
  // license spelling
  const lic = o.license.trim();
  o.license = /^proprietary$/i.test(lic) ? "Proprietary" : lic.replace(/^GPLv?(\d)$/i, "GPL-$1.0").replace(/^LGPLv?(\d(\.\d)?)$/i, "LGPL-$1");
  o.verification_status = o.verification_status.toLowerCase() || "unverified";
  if (o.last_checked && !/^\d{4}-\d{2}-\d{2}/.test(o.last_checked)) {
    const d = new Date(o.last_checked); o.last_checked = isNaN(d) ? o.last_checked : d.toISOString().slice(0, 10);
  }
  return o;
}

const cats = JSON.parse(readFileSync(P("data/categories.json"), "utf8"));
const CATS = new Map((cats.categories || cats).map(c => [c.slug, c]));

let doc;
const csv = opt("--csv");
if (csv) {
  const rows = parseCSV(readFileSync(csv, "utf8"));
  const head = rows.shift().map(headerKey);
  const unknown = head.filter(k => !FIELDS.includes(k) && !INTERNAL.has(k));
  if (unknown.length) console.warn("Ignoring unknown columns:", unknown.join(", "));
  const internal = head.filter(k => INTERNAL.has(k));
  if (internal.length) console.log("Internal columns kept out of the feed:", internal.join(", "));
  const listings = rows.map(r => Object.fromEntries(head.map((k, i) => [k, r[i] ?? ""])));
  doc = { schema_version: 1, sample: false, listings };
  // review queue: rows with flags, for the human check
  const flagged = listings.filter(r => r.review_flag);
  if (flagged.length) {
    writeFileSync(P("listings/review-queue.md"), "# Review queue\n\nGenerated " + new Date().toISOString().slice(0, 10) + " from " + csv + ". Every row is unverified; these need a specific check first.\n\n" +
      flagged.map(r => `- [ ] **${r.name}** (\`${r.id}\`): ${r.review_flag}`).join("\n") + "\n");
    console.log(`Wrote listings/review-queue.md · ${flagged.length} flagged rows`);
  }
  console.log(`Read ${listings.length} rows from ${csv}`);
} else {
  doc = JSON.parse(readFileSync(P("data/listings.json"), "utf8"));
  if (Array.isArray(doc)) doc = { schema_version: 1, listings: doc };
}

const seen = new Set(), out = [], problems = [];
for (const raw of doc.listings) {
  const l = normalize(raw), bad = [];
  if (!/^[a-z0-9][a-z0-9-]*$/.test(l.id)) bad.push("id must be a lowercase slug");
  if (seen.has(l.id)) bad.push("duplicate id");
  if (!l.name) bad.push("name required");
  if (!/^https:\/\//.test(l.official_url)) bad.push("official_url must be https://");
  if (!CATS.has(l.category)) bad.push(`unknown category "${l.category}"`);
  if (!PRICE_TYPES.has(l.price_type)) bad.push(`price_type "${l.price_type}" not in ${[...PRICE_TYPES].join("/")}`);
  if (!VSTAT.has(l.verification_status)) bad.push(`verification_status "${l.verification_status}"`);
  if (l.verification_status === "verified" && !l.last_checked) bad.push("verified rows need last_checked");
  if (l.short_description.length > 200) bad.push("short_description over 200 chars");
  if (CATS.get(l.category)?.kind === "hardware" && /^proprietary$/i.test(l.license)) l.license = "N/A (hardware)";
  if (bad.length) { problems.push(`${l.id || "(no id)"}: ${bad.join("; ")}`); continue; }
  seen.add(l.id); out.push(l);
}
if (problems.length) {
  console.warn(`\n${problems.length} invalid row(s):\n  ` + problems.join("\n  "));
  if (STRICT) process.exit(1);
}
out.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
const isSample = out.some(l => l.sample) || !!doc.sample;
const now = new Date().toISOString();

writeFileSync(P("data/listings.json"), JSON.stringify({ schema_version: 1, sample: isSample, listings: out }, null, 2) + "\n");
mkdirSync(P("feed"), { recursive: true });
const feed = {
  name: "ChronoRail listings feed", schema_version: 1, generated_at: now, count: out.length, sample: isSample,
  license_note: "Listing data is curated by SCJG. Descriptions are SCJG's own words. Verify details on each official_url.",
  ranking_policy: "Order is by name. Featured, paid and affiliate status never changes order.",
  fields: FIELDS, categories: [...CATS.values()].map(c => ({ slug: c.slug, name: c.name, code: c.code })),
  listings: out
};
writeFileSync(P("feed/listings.json"), JSON.stringify(feed, null, 2) + "\n");

const counts = {}; out.forEach(l => counts[l.category] = (counts[l.category] || 0) + 1);
const u = p => (SITE ? SITE + "/" : "/") + p;
const llms = `# ChronoRail

> A free, curated, AI-readable directory of music-production tools: DAWs, plugins, sample packs, hardware, AI music tools, learning, distribution and related services. Part of ChronoMedia, made by SCJG (Pagosa Springs, Colorado).
${isSample ? "\n> STATUS: prototype. The current dataset is SAMPLE data and is not human-verified. Do not cite it as fact.\n" : ""}
## Data
- [Listings feed (JSON)](${u("feed/listings.json")}): every listing with all fields. ${out.length} listings, generated ${now.slice(0, 10)}.
- [Categories](${u("data/categories.json")}): ${CATS.size} category slugs with module codes.
- [Stacks](${u("data/stacks.json")}): curated lists of listing IDs.

## Fields
id, name, maker, category, subcategory, tags[], short_description, who_its_for, platforms[], formats[], price_type (free | freemium | paid | one-time | subscription | varies | unknown), price_note, license, official_url, affiliate_ok, affiliate_url, featured, paid_placement, scjg_owned, verification_status (unverified | verified | needs-recheck | rejected), last_checked (YYYY-MM-DD), confidence.

## Policies
- Descriptions are short, factual and written by SCJG. Vendor marketing is not copied.
- Values marked UNVERIFIED were not confirmed. Check official_url before relying on price, license, OS or format.
- Order is by name or last_checked only. Featured, paid placement and affiliate status never change order; they are labeled when true.
- scjg_owned = true marks products made by SCJG (ChronoStudio, ChronoRack, Lava Lava).

## Pages
- Listing: ${u("#l-{id}")} (includes schema.org JSON-LD)
- Category: ${u("#c-{category}")}
- About and verification: ${u("#about")}

## Categories with listings
${[...CATS.values()].filter(c => counts[c.slug]).map(c => `- ${c.code} ${c.name} (${c.slug}): ${counts[c.slug]}`).join("\n")}
`;
writeFileSync(P("llms.txt"), llms);
console.log(`Wrote data/listings.json, feed/listings.json, llms.txt · ${out.length} listings${isSample ? " (SAMPLE)" : ""}`);
