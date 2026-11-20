/* ChronoRail Worker: serves the static site from ./dist and, when accounts are switched on, the /api/* routes.
   Accounts are OFF unless AUTH_ENABLED = "1" and BETTER_AUTH_SECRET is set (see docs/ACCOUNTS.md).
   Static requests never touch D1 or Better Auth; only /api/* runs this code first (assets.run_worker_first). */
import { betterAuth } from "better-auth";
import { magicLink } from "better-auth/plugins";

const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers } });

const devLinks = new Map();
const ID = /^[a-z0-9][a-z0-9-]{0,80}$/;
const MAX_ITEMS = 500, MAX_NOTE = 500, MAX_BODY = 128 * 1024;

/* Magic-link email. Sends through the Cloudflare EMAIL binding when it exists (needs Workers Paid + an onboarded
   sending domain). Without it, sign-in by email is refused and the UI only offers Google. Never logs the link. */
async function sendMagicLinkEmail(env, email, url) {
  // Local development only: keep the last link in memory so a test can read it. Ignored on any non-localhost BASE_URL.
  if (env.DEV_MAGIC_LINK_ECHO === "1" && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(env.BASE_URL || "")) { devLinks.set(email, url); return; }
  if (!env.EMAIL || !env.MAIL_FROM) throw new Error("email_not_configured");
  const text = `Sign in to ChronoRail\n\nOpen this link to sign in. It works once and expires in 10 minutes:\n${url}\n\nIf you didn't ask for this, ignore this email. Nobody can sign in without the link.\n\nChronoRail · Built on ChronoWare by SCJG LLC · Pagosa Springs, Colorado`;
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#E9E4DC;font-family:Inter,Arial,sans-serif;color:#2A2622">
<table role="presentation" width="100%" style="max-width:520px;margin:0 auto;background:#F7F4EE;border-radius:16px;padding:24px"><tr><td>
<p style="font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:#5B544C;margin:0 0 12px">ChronoRail</p>
<h1 style="font-size:20px;margin:0 0 12px">Sign in to ChronoRail</h1>
<p style="margin:0 0 20px;line-height:1.5">Press the button to sign in. The link works once and expires in 10 minutes.</p>
<p style="margin:0 0 20px"><a href="${url}" style="display:inline-block;background:#2A2622;color:#F7F4EE;text-decoration:none;padding:12px 20px;border-radius:999px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;font-size:12px">Sign in</a></p>
<p style="margin:0 0 6px;font-size:12px;color:#5B544C">Or paste this link into your browser:</p>
<p style="margin:0 0 20px;font-size:12px;word-break:break-all;color:#075E6B">${url}</p>
<p style="margin:0;font-size:12px;color:#5B544C">If you didn't ask for this, ignore this email. Nobody can sign in without the link.</p>
</td></tr></table>
<p style="max-width:520px;margin:12px auto 0;font-size:11px;color:#5B544C;text-align:center">Built on ChronoWare by SCJG LLC · Pagosa Springs, Colorado</p>
</body></html>`;
  await env.EMAIL.send({ from: { email: env.MAIL_FROM, name: "ChronoRail" }, to: email, subject: "Your ChronoRail sign-in link", text, html });
}

function makeAuth(env) {
  const base = env.BASE_URL || "https://chronorail.si";
  return betterAuth({
    appName: "ChronoRail",
    database: env.DB,                       // D1 binding; Better Auth's Kysely adapter detects D1 directly
    secret: env.BETTER_AUTH_SECRET,
    baseURL: base,
    basePath: "/api/auth",
    trustedOrigins: [base],
    session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24 },
    rateLimit: { enabled: true, storage: "database", window: 60, max: 30,
      customRules: { "/sign-in/magic-link": { window: 300, max: 3 }, "/sign-in/social": { window: 60, max: 10 } } },
    user: { deleteUser: { enabled: true } },  // rack row is removed by the FK cascade
    socialProviders: env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? { google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET, prompt: "select_account" } } : {},
    plugins: [magicLink({ expiresIn: 600, sendMagicLink: ({ email, url }) => sendMagicLinkEmail(env, email, url) })],
    advanced: { useSecureCookies: base.startsWith("https://"), cookiePrefix: "cr" }
  });
}

/* Clean a rack payload into { v:1, items:{ id:{ s, n, t } } }; drops anything unexpected. */
function cleanRack(d) {
  const out = { v: 1, items: {} };
  const items = d && typeof d.items === "object" && d.items ? d.items : {};
  for (const [id, it] of Object.entries(items).slice(0, MAX_ITEMS)) {
    if (!ID.test(id) || !it || typeof it !== "object") continue;
    const s = ["own", "want", "tried"].includes(it.s) ? it.s : "";
    const n = typeof it.n === "string" ? it.n.slice(0, MAX_NOTE) : "";
    const t = typeof it.t === "string" && !isNaN(Date.parse(it.t)) ? new Date(it.t).toISOString() : new Date().toISOString();
    out.items[id] = { s, n, t };
  }
  return out;
}

async function rackApi(req, env, auth) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return json({ error: "signed_out" }, 401);
  const uid = session.user.id;
  if (req.method === "GET") {
    const row = await env.DB.prepare('select "data", "updatedAt" from "rack" where "userId" = ?').bind(uid).first();
    return json(row ? { ...JSON.parse(row.data), updated: row.updatedAt } : { v: 1, items: {}, updated: null });
  }
  if (req.method === "PUT") {
    const raw = await req.text();
    if (raw.length > MAX_BODY) return json({ error: "too_large" }, 413);
    let body; try { body = JSON.parse(raw); } catch { return json({ error: "bad_json" }, 400); }
    const data = cleanRack(body), now = new Date().toISOString();
    await env.DB.prepare('insert into "rack" ("userId", "data", "updatedAt") values (?, ?, ?) on conflict("userId") do update set "data" = excluded."data", "updatedAt" = excluded."updatedAt"')
      .bind(uid, JSON.stringify(data), now).run();
    return json({ ...data, updated: now });
  }
  return json({ error: "method_not_allowed" }, 405, { allow: "GET, PUT" });
}


/* ---------- Feedback: public POST (no login, no personal data), agent-only GET/PATCH with a bearer token ---------- */
const FB_KINDS = ["bug", "idea", "suggestion"];
const FB_STATUS = ["new", "triaged", "planned", "done", "wontfix", "spam", "duplicate"];
async function sha256(t) { const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join(""); }
function agentOk(req, env) {
  const h = req.headers.get("authorization") || "", tok = env.FEEDBACK_AGENT_TOKEN || "";
  if (!tok || tok.length < 24 || !h.startsWith("Bearer ")) return false;
  const a = new TextEncoder().encode(h.slice(7)), b = new TextEncoder().encode(tok);
  if (a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i]; return d === 0;   // constant-time compare
}
async function feedbackApi(req, env, url) {
  if (!env.DB) return json({ error: "unavailable" }, 503);
  const idm = url.pathname.match(/^\/api\/feedback\/([a-z0-9-]{8,40})$/);
  if (req.method === "POST" && url.pathname === "/api/feedback") {
    const o = req.headers.get("origin");
    if (!o || o !== (env.BASE_URL || url.origin)) return json({ error: "bad_origin" }, 403);
    const raw = await req.text(); if (raw.length > 8192) return json({ error: "too_large" }, 413);
    let b; try { b = JSON.parse(raw); } catch { return json({ error: "bad_json" }, 400); }
    if (b.website) return json({ ok: true });                               // honeypot: bots fill hidden fields
    const kind = FB_KINDS.includes(b.kind) ? b.kind : null;
    const message = typeof b.message === "string" ? b.message.trim().slice(0, 2000) : "";
    if (!kind || message.length < 5) return json({ error: "invalid" }, 400);
    const page = typeof b.page === "string" ? b.page.slice(0, 200) : "";
    const skin = typeof b.skin === "string" ? b.skin.replace(/[^A-Za-z|]/g, "").slice(0, 12) : "";
    // abuse limit: 5 per hour per salted IP hash; raw IPs are never stored
    const ip = req.headers.get("cf-connecting-ip") || "0";
    const key = await sha256((env.BETTER_AUTH_SECRET || "cr") + "|fb|" + ip), now = Date.now(), win = 3600e3;
    const row = await env.DB.prepare('select "count", "windowStart" from "feedbackLimit" where "key" = ?').bind(key).first();
    if (row && now - row.windowStart < win && row.count >= 5) return json({ error: "rate_limited" }, 429);
    const fresh = !row || now - row.windowStart >= win;
    await env.DB.prepare('insert into "feedbackLimit" ("key","count","windowStart") values (?,?,?) on conflict("key") do update set "count" = excluded."count", "windowStart" = excluded."windowStart"')
      .bind(key, fresh ? 1 : row.count + 1, fresh ? now : row.windowStart).run();
    const id = crypto.randomUUID(), ts = new Date().toISOString();
    await env.DB.prepare('insert into "feedback" ("id","kind","message","page","skin","status","createdAt","updatedAt") values (?,?,?,?,?,\'new\',?,?)')
      .bind(id, kind, message, page, skin, ts, ts).run();
    return json({ ok: true, id }, 201);
  }
  // everything below is for agents only
  if (!agentOk(req, env)) return json({ error: "unauthorized" }, 401);
  if (req.method === "GET" && url.pathname === "/api/feedback") {
    const st = url.searchParams.get("status") || "new";
    const lim = Math.min(200, Math.max(1, parseInt(url.searchParams.get("limit") || "50", 10) || 50));
    const q = st === "all"
      ? env.DB.prepare('select * from "feedback" order by "createdAt" desc limit ?').bind(lim)
      : env.DB.prepare('select * from "feedback" where "status" = ? order by "createdAt" asc limit ?').bind(FB_STATUS.includes(st) ? st : "new", lim);
    const { results } = await q.all();
    return json({ items: results, count: results.length });
  }
  if (req.method === "PATCH" && idm) {
    let b; try { b = await req.json(); } catch { return json({ error: "bad_json" }, 400); }
    const status = FB_STATUS.includes(b.status) ? b.status : null;
    const note = typeof b.agentNote === "string" ? b.agentNote.slice(0, 2000) : null;
    const ref = typeof b.ref === "string" ? b.ref.slice(0, 300) : null;
    if (!status && note === null && ref === null) return json({ error: "nothing_to_update" }, 400);
    const r = await env.DB.prepare('update "feedback" set "status" = coalesce(?, "status"), "agentNote" = coalesce(?, "agentNote"), "ref" = coalesce(?, "ref"), "updatedAt" = ? where "id" = ?')
      .bind(status, note, ref, new Date().toISOString(), idm[1]).run();
    return r.meta.changes ? json({ ok: true }) : json({ error: "not_found" }, 404);
  }
  return json({ error: "method_not_allowed" }, 405);
}

// ---- Nightly stats → Notion (option A: counts only; no emails, names or notes leave Cloudflare) ----
const NOTION_STATS_DS = "41e1fa25-b7de-81bc-88cd-000b145490c3";   // Notion "ChronoRail Stats" data source
async function collectStats(env) {
  const now = new Date(), since = new Date(now.getTime() - 864e5).toISOString(), nowIso = now.toISOString();
  const one = async (sql, ...b) => { try { const r = await env.DB.prepare(sql).bind(...b).first(); return Number(r && r.n) || 0; } catch { return null; } };
  const s = {
    users: await one('select count(*) n from "user"'),
    newUsers: await one('select count(*) n from "user" where "createdAt" >= ?', since),
    sessions: await one('select count(*) n from "session" where "expiresAt" > ?', nowIso),
    racks: await one('select count(*) n from "rack"'),
    rackItems: await one(`select coalesce(sum((select count(*) from json_each("data", '$.items'))),0) n from "rack" where json_valid("data")`),
    fbNew: await one(`select count(*) n from "feedback" where "status" = 'new'`),
    fbTotal: await one('select count(*) n from "feedback" where "status" != \'spam\''),
    listings: null, verified: null,
  };
  try {
    const r = await env.ASSETS.fetch(new Request((env.BASE_URL || "https://chronorail.si") + "/feed/listings.json"));
    const d = await r.json(), L = Array.isArray(d) ? d : (d.listings || d.items || []);
    s.listings = L.length; s.verified = L.filter(l => l.verification_status === "verified").length;
  } catch {}
  return s;
}
async function pushStatsToNotion(env) {
  if (!env.DB || !env.NOTION_TOKEN) return { skipped: true };
  const s = await collectStats(env), day = new Date().toISOString().slice(0, 10);
  const num = v => ({ number: v === null ? null : v });
  const properties = {
    "Day": { title: [{ text: { content: day } }] }, "Date": { date: { start: day } },
    "Users": num(s.users), "New users (24h)": num(s.newUsers), "Active sessions": num(s.sessions),
    "Racks saved": num(s.racks), "Rack items": num(s.rackItems),
    "Feedback new": num(s.fbNew), "Feedback total": num(s.fbTotal),
    "Listings": num(s.listings), "Verified listings": num(s.verified),
  };
  const ds = env.NOTION_STATS_DS || NOTION_STATS_DS;
  const post = (ver, parent) => fetch("https://api.notion.com/v1/pages", {
    method: "POST",
    headers: { "Authorization": "Bearer " + env.NOTION_TOKEN, "Notion-Version": ver, "Content-Type": "application/json" },
    body: JSON.stringify({ parent, properties }),
  });
  console.log("stats", JSON.stringify(s));
  let r;
  try {
  r = await post("2025-09-03", { type: "data_source_id", data_source_id: ds });
  if (!r.ok) r = await post("2022-06-28", { database_id: env.NOTION_STATS_DB || "41e1fa25b7de81479ab8d090a49e23ad" });   // fallback for older API
  } catch (e) { console.log("notion stats error", String(e).slice(0, 200)); return { ok: false, stats: s }; }
  const ok = r.ok; if (!ok) console.log("notion stats failed", r.status, (await r.text()).slice(0, 300));
  else console.log("notion stats ok", day);
  return { ok, stats: s };
}

export default {
  async scheduled(_ev, env, ctx) { ctx.waitUntil(pushStatsToNotion(env)); },
  async fetch(req, env) {
    const url = new URL(req.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(req);
    if (url.pathname === "/api/status") {
      const on = env.AUTH_ENABLED === "1" && !!env.BETTER_AUTH_SECRET && !!env.DB;
      const devEcho = env.DEV_MAGIC_LINK_ECHO === "1" && /^http:\/\/(localhost|127\.0\.0\.1)/.test(env.BASE_URL || "");
      return json({ accounts: on, google: on && !!env.GOOGLE_CLIENT_ID, email: on && ((!!env.EMAIL && !!env.MAIL_FROM) || devEcho) });
    }
    if (url.pathname === "/api/feedback" || url.pathname.startsWith("/api/feedback/")) return feedbackApi(req, env, url);
    if (env.AUTH_ENABLED !== "1" || !env.BETTER_AUTH_SECRET || !env.DB) return json({ error: "accounts_not_live" }, 503);
    // Same-origin only for state-changing calls (Better Auth checks Origin on its own routes too).
    if (req.method !== "GET" && req.method !== "HEAD") {
      const o = req.headers.get("origin");
      if (o && o !== (env.BASE_URL || url.origin)) return json({ error: "bad_origin" }, 403);
    }
    const auth = makeAuth(env);
    if (url.pathname.startsWith("/api/auth/")) return auth.handler(req);
    if (url.pathname === "/api/rack") return rackApi(req, env, auth);
    if (url.pathname === "/api/dev/last-link" && env.DEV_MAGIC_LINK_ECHO === "1" && /^http:\/\/(localhost|127\.0\.0\.1)/.test(env.BASE_URL || ""))
      return json({ url: devLinks.get(url.searchParams.get("email")) || null });
    return json({ error: "not_found" }, 404);
  }
};
