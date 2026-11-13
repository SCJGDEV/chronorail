/* ChronoRail · PRO skin controller + live circuit board.
   Load in <head> (sync) so the saved skin applies before first paint.
   Skins: NEU L (default) · NEU D · PRO D · PRO L · CORE D · CORE L, plus HC on any base. TRACES 0–10.
   Board: traces drawn once per size/skin/trace change; packets ≤30 fps, paused when hidden,
   off under prefers-reduced-motion and in HC. Colours come from --bd-* tokens. */
(function () {
  "use strict";
  var H = document.documentElement;
  function load(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }
  function save(k, v) { try { localStorage.setItem(k, v); } catch (_) {} }

  /* ---- 1. apply saved state immediately (before CSS paints) ---- */
  var saved = load("cr.skin");
  if (!saved && load("cr.theme") === "graphite") saved = "PRO|";   // v1 Graphite users land on CORE D
  var s = (saved || "NEU|l").split("|");
  H.dataset.skin = s[0] === "CRL" || s[0] === "NEU" ? s[0] : "PRO";
  if (H.dataset.skin === "NEU") { H.dataset.glass = ""; H.dataset.tone = s[1] === "d" ? "d" : "l"; }
  else { H.dataset.glass = H.dataset.skin === "CRL" ? "" : (s[1] === "d" || s[1] === "l" ? s[1] : ""); delete H.dataset.tone; }
  H.dataset.hc = load("cr.hc") === "1" ? "1" : "0";
  var TK = Math.max(0, Math.min(10, parseInt(load("cr.trc"), 10)));
  if (isNaN(TK)) TK = 5;

  var RM = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---- 2. board ---- */
  var bd, pk, TR = [], seed = 7, lastW = 0, lastH = 0;
  function rnd() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
  function tok(n) { return getComputedStyle(H).getPropertyValue(n).trim(); }
  function boardOn() { return H.dataset.glass !== "" && H.dataset.hc !== "1"; }
  function build() {
    if (!bd) return;
    TR = [];
    if (!boardOn()) { clearPk(); return; }
    var d = Math.min(window.devicePixelRatio || 1, 2), W = innerWidth, Hh = innerHeight;
    lastW = W; lastH = Hh;
    [bd, pk].forEach(function (c) { c.width = W * d; c.height = Hh * d; });
    var g = bd.getContext("2d"); g.setTransform(d, 0, 0, d, 0, 0); seed = 7;
    var gr = g.createLinearGradient(0, 0, 0, Hh); gr.addColorStop(0, tok("--bd-bg0")); gr.addColorStop(1, tok("--bd-bg1"));
    g.fillStyle = gr; g.fillRect(0, 0, W, Hh);
    g.strokeStyle = tok("--bd-hatch"); g.lineWidth = 1;
    for (var x = .5; x < W; x += 24) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, Hh); g.stroke(); }
    var cTr = tok("--bd-tr"), cTrf = tok("--bd-trf"), cTrm = tok("--bd-trm"), cTra = tok("--bd-tra"), cVia = tok("--bd-via");
    var n = Math.round(W * Hh / (150 * 150) * (TK / 5));
    for (var i = 0; i < n; i++) {
      var hz = rnd() < .6, lanes = 1 + (rnd() < .35 ? Math.floor(rnd() * 5) + 2 : 0), x0 = rnd() * W, y0 = rnd() * Hh,
        l1 = 40 + rnd() * 160, jg = (14 + rnd() * 40) * (rnd() < .5 ? -1 : 1), l2 = 30 + rnd() * 200;
      var col = rnd() < .08 ? cTra : (lanes > 1 ? cTrm : (rnd() < .5 ? cTr : cTrf));
      for (var L = 0; L < lanes; L++) {
        var o = L * 6, aj = Math.abs(jg), p = hz
          ? [[x0, y0 + o], [x0 + l1, y0 + o], [x0 + l1 + aj, y0 + o + jg], [x0 + l1 + aj + l2, y0 + o + jg]]
          : [[x0 + o, y0], [x0 + o, y0 + l1], [x0 + o + jg, y0 + l1 + aj], [x0 + o + jg, y0 + l1 + aj + l2]];
        g.strokeStyle = col; g.lineWidth = lanes > 1 ? 1 : 1.2;
        g.beginPath(); g.moveTo(p[0][0], p[0][1]); for (var j = 1; j < 4; j++) g.lineTo(p[j][0], p[j][1]); g.stroke();
        g.strokeStyle = cVia; [p[0], p[3]].forEach(function (q) { g.beginPath(); g.arc(q[0], q[1], 2.6, 0, 6.283); g.stroke(); });
        if (rnd() < .14) TR.push({ p: p, t: rnd(), v: 36 + rnd() * 54 });   // ≈14% of traces carry packets, 36–90 px/s
      }
      if (rnd() < .18) { var sx = rnd() * W, sy = rnd() * Hh, sw = 8 + rnd() * 14, sh = 4 + rnd() * 6;
        g.fillStyle = cTrf; g.fillRect(sx, sy, sw, sh); g.fillStyle = cVia; g.fillRect(sx - 2, sy, 2, sh); g.fillRect(sx + sw, sy, 2, sh); }
    }
    TR.forEach(function (r) { var t = 0; r.seg = []; for (var j = 1; j < 4; j++) { var a = r.p[j - 1], b = r.p[j], l = Math.hypot(b[0] - a[0], b[1] - a[1]); r.seg.push([a, b, l]); t += l; } r.len = t; });
    pktCol = tok("--bd-pkt"); last = 0; paint(0);
  }
  function clearPk() { if (!pk) return; var c = pk.getContext("2d"); c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, pk.width, pk.height); }
  var last = 0, pktCol = "";
  function paint(ts) {
    var c = pk.getContext("2d"), d = Math.min(window.devicePixelRatio || 1, 2);
    c.setTransform(d, 0, 0, d, 0, 0); c.clearRect(0, 0, innerWidth, innerHeight);
    if (RM || !TR.length || !boardOn()) return;
    var dt = last ? Math.min((ts - last) / 1000, .1) : 0; last = ts; c.fillStyle = pktCol; c.globalAlpha = .55;
    TR.forEach(function (r) {
      r.t = (r.t + dt * r.v / r.len) % 1; var at = r.t * r.len;
      for (var j = 0; j < 3; j++) { var sg = r.seg[j]; if (at <= sg[2]) { var f = sg[2] ? at / sg[2] : 0;
        c.beginPath(); c.arc(sg[0][0] + (sg[1][0] - sg[0][0]) * f, sg[0][1] + (sg[1][1] - sg[0][1]) * f, 1.6, 0, 6.283); c.fill(); break; } at -= sg[2]; }
    });
    c.globalAlpha = 1;
  }
  var acc = 0;
  function loop(ts) { requestAnimationFrame(loop); if (document.hidden || ts - acc < 33) return; acc = ts; paint(ts); }
  document.addEventListener("visibilitychange", function () { if (!document.hidden) last = 0; });

  /* ---- 3. controls in the footer dock ---- */
  function meta() {
    var m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute("content", tok("--bd-bg0") || "#04070a");
  }
  function sync() {
    document.querySelectorAll("[data-sk]").forEach(function (b) {
      var on = b.dataset.sk === H.dataset.skin && (H.dataset.skin === "NEU" ? b.dataset.tn === H.dataset.tone : b.dataset.gl === H.dataset.glass);
      b.classList.toggle("on", on); b.setAttribute("aria-pressed", on ? "true" : "false");
    });
    var hc = document.getElementById("hcBtn");
    if (hc) { hc.classList.toggle("on", H.dataset.hc === "1"); hc.setAttribute("aria-pressed", H.dataset.hc === "1" ? "true" : "false"); }
    var trc = document.getElementById("trc");
    if (trc) { trc.setAttribute("aria-valuenow", TK); trc.setAttribute("aria-valuetext", TK + " of 10");
      [].forEach.call(trc.children, function (e, j) { e.classList.toggle("on", j <= TK && TK > 0); }); }
    meta();
  }
  function setSkin(sk, gl, tn) {
    H.dataset.skin = sk;
    if (sk === "NEU") { H.dataset.glass = ""; H.dataset.tone = tn === "d" ? "d" : "l"; save("cr.skin", "NEU|" + H.dataset.tone); }
    else { H.dataset.glass = gl; delete H.dataset.tone; save("cr.skin", sk + "|" + gl); }
    sync(); build();
  }
  function setHc(on) { H.dataset.hc = on ? "1" : "0"; save("cr.hc", on ? "1" : "0"); sync(); build(); }
  function setTk(v) { TK = Math.max(0, Math.min(10, v)); save("cr.trc", String(TK)); sync(); build(); }

  function init() {
    if (!document.getElementById("bd")) {
      var frag = document.createDocumentFragment();
      bd = document.createElement("canvas"); bd.id = "bd"; bd.setAttribute("aria-hidden", "true");
      pk = document.createElement("canvas"); pk.id = "pk"; pk.setAttribute("aria-hidden", "true");
      var sh = document.createElement("div"); sh.className = "sheet"; sh.setAttribute("aria-hidden", "true");
      frag.append(bd, pk, sh); document.body.prepend(frag);
    } else { bd = document.getElementById("bd"); pk = document.getElementById("pk"); }

    document.querySelectorAll("[data-sk]").forEach(function (b) { b.addEventListener("click", function () { setSkin(b.dataset.sk, b.dataset.gl, b.dataset.tn); }); });
    var hc = document.getElementById("hcBtn");
    if (hc) hc.addEventListener("click", function () { setHc(H.dataset.hc !== "1"); });
    var trc = document.getElementById("trc");
    if (trc) {
      for (var i = 0; i < 11; i++) { var b = document.createElement("i"); b.style.height = (5 + i * .9) + "px"; trc.appendChild(b); }
      trc.addEventListener("click", function (e) { var r = trc.getBoundingClientRect(); setTk(Math.round((e.clientX - r.left) / r.width * 10)); });
      trc.addEventListener("keydown", function (e) {
        var k = e.key, v = null;
        if (k === "ArrowRight" || k === "ArrowUp") v = TK + 1; else if (k === "ArrowLeft" || k === "ArrowDown") v = TK - 1;
        else if (k === "Home") v = 0; else if (k === "End") v = 10; else if (k === "PageUp") v = TK + 2; else if (k === "PageDown") v = TK - 2;
        if (v != null) { e.preventDefault(); setTk(v); }
      });
    }
    sync(); build();
    if (!RM) requestAnimationFrame(loop);
    var rt; addEventListener("resize", function () {
      clearTimeout(rt);
      rt = setTimeout(function () { if (innerWidth !== lastW || Math.abs(innerHeight - lastH) > 120) build(); }, 150);   // ignore phone URL-bar jitter
    });
    if (window.matchMedia) {
      ["(prefers-contrast: more)", "(prefers-reduced-transparency: reduce)", "(prefers-color-scheme: dark)"].forEach(function (q) {
        var m = matchMedia(q); if (m.addEventListener) m.addEventListener("change", build);
      });
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
