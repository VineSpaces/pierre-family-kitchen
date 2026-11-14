/* Pierre Family Kitchen - app. Talks to the Google Sheet through the Apps Script web app (Code.gs). */
(function () {
"use strict";
var CFG = window.PFK_CONFIG || {};
var stores = ["Stop & Shop", "Instacart", "Target"];
var cartUrl = {"Stop & Shop": "https://stopandshop.com/cart", "Instacart": "https://www.instacart.com/", "Target": "https://www.target.com/cart"};
var order = ["list", "cart", "ordered"], lab = {list: "On list", cart: "In cart", ordered: "Ordered by you"};
var banners = {"Fridge": "img/fridge.jpg", "Pantry": "img/pantry.jpg", "Freezer": "img/freezer.jpg"};
var TABS = ["list", "catalog", "pantry", "recipes", "votes", "members", "settings", "coffee"];
var D = {list: [], catalog: [], pantry: [], recipes: [], votes: [], members: [], settings: [], coffee: []};
var st = {chat: [], chatLoaded: false, toolOpen: "", pushOpen: false, voteOpen: false, shopView: "needs", pushKey: undefined, tab: "home", store: "Stop & Shop", typing: false, loaded: false, gate: false, err: "", lastSync: 0};
var me = {name: ls("pfk_name") || "", pin: ls("pfk_pin") || ""};

var P={cal:'<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',plus:'<path d="M12 5v14M5 12h14"/>',search:'<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',lock:'<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',back:'<path d="M15 5l-7 7 7 7"/>',cam:'<path d="M4 8h3l2-2.5h6L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',play:'<circle cx="12" cy="12" r="9"/><path d="M10 8.5v7l6-3.5z"/>',cup:'<path d="M4 9h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M17 10h1.5a2.5 2.5 0 0 1 0 5H17"/><path d="M8 3.5c0 1-1 1.5-1 2.5M12 3.5c0 1-1 1.5-1 2.5"/>',home:'<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',cart:'<circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2.5 3.5h3l2.4 11.2a1 1 0 0 0 1 .8h8.7a1 1 0 0 0 1-.7L20.5 8H6.2"/>',cook:'<path d="M5 10h14v7a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3z"/><path d="M3 10h18M9 6.5c0-1.6 1-1.6 1-3.2M14 6.5c0-1.6 1-1.6 1-3.2"/>',pantry:'<rect x="6.5" y="3" width="11" height="3" rx="1"/><path d="M7.5 6v14a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V6M7.5 11h9"/>',book:'<path d="M4 5a2 2 0 0 1 2-2h13v15H6a2 2 0 0 0-2 2z"/><path d="M4 20a2 2 0 0 1 2-2h13v3H6a2 2 0 0 1-2-1zM9 7h6"/>',mic:'<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M9 21h6"/>',send:'<path d="M4 12L20 4l-6 16-3-7z"/>',x:'<path d="M6 6l12 12M18 6L6 18"/>',check:'<path d="M5 12.5l4.5 4.5L19 7.5"/>'};
function ic(n,c){return '<svg class="'+(c||'i')+'" viewBox="0 0 24 24" aria-hidden="true">'+P[n]+'</svg>';}
/* ---------- small utils ---------- */
function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }
function esc(t) { return String(t == null ? "" : t).replace(/[&<>"]/g, function (c) { return {"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"}[c]; }); }
function $(id) { return document.getElementById(id); }
function rid() { var s = ""; while (s.length < 12) s += Math.random().toString(36).slice(2); return s.slice(0, 12); }
function today() { var d = new Date(); return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate(); }
function byId(arr, id) { for (var i = 0; i < arr.length; i++) if (String(arr[i].id) === String(id)) return arr[i]; return null; }
function toast(m) { var t = $("toast"); t.textContent = m; t.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(function () { t.hidden = true; }, 4200); }
function sheet(h, gate) { st.gate = !!gate; if (!/Push to Stop/.test(h)) st.pushOpen = false; if (!/Dinner vote/.test(h)) st.voteOpen = false; if (!/id="toolT"/.test(h)) st.toolOpen = ""; $("sheetBody").innerHTML = h; $("sheet").hidden = false; }
function closeSheet(force) { if (st.gate && !force) return; st.gate = false; st.pushOpen = false; st.toolOpen = ""; st.voteOpen = false; $("sheet").hidden = true; }
function safeParse(s, d) { try { var v = JSON.parse(s); return v == null ? d : v; } catch (e) { return d; } }
function kwList(c) { return String(c.kw || "").split("|").map(function (x) { return x.trim().toLowerCase(); }).filter(Boolean); }

/* ---------- category guess (word-based so "Fruit loops" is not produce) ---------- */
var CATS = [["pantry", /cereal|loops|cheerios|oatmeal|granola|flakes|syrup|pasta|rice|beans|sauce|flour|sugar/i], ["bread", /\b(bread|rolls?|buns?|bagels?|biscuits?|tortillas?|muffins?)\b/i], ["eggs", /\beggs?\b/i],
  ["dairy", /\b(milk|cream|creamer|cheese|yogurt|butter|half|sour)\b/i], ["bacon", /\b(bacon|beef|chicken|pork|ham|ribs?|sausage|franks?|hot dogs?|burgers?|turkey|steak|meat|wings|thighs?)\b/i],
  ["produce", /\b(lettuce|tomato(es)?|onions?|apples?|bananas?|fruit|veg(etables?)?|potato(es)?|carrots?|basil|peppers?|garlic|lemons?|berries|salad|broccoli|spinach)\b/i],
  ["frozen", /\b(frozen|fries|ice cream|nuggets?|pizza)\b/i], ["drinks", /\b(water|juice|soda|coffee|tea|punch|seltzer|drink)\b/i],
  ["snacks", /\b(chips?|crackers?|crix|cookies?|snacks?|popcorn|pretzels?|candy|gum|wafers?)\b/i], ["household", /\b(towels?|soap|detergent|tissues?|toilet|trash|foil|sponges?|cleaner)\b/i]];
function guessCat(n) { for (var i = 0; i < CATS.length; i++) if (CATS[i][1].test(n)) return CATS[i][0]; return "pantry"; }
var imgCache = {v: null, m: {}};
function hashStr(s) { var h = 0; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h.toString(36); }
function imgFor(name) {
  var d = byId(D.settings, "imgs"); if (!d || !name) return "";
  if (imgCache.v !== d.value) { imgCache.v = d.value; imgCache.m = safeParse(d.value, {}); }
  var p = imgCache.m[hashStr(String(name).toLowerCase().replace(/[^a-z0-9]/g, ""))];
  return p ? "https://i5.peapod.com/" + p : "";
}
/* Real product photo when we have one; the category picture stays underneath if it fails to load. */
function thumb(c, name) {
  var u = imgFor(name);
  return '<div class="thumb" style="background-image:url(img/c/' + esc(c || "pantry") + '.jpg)" aria-hidden="true">' +
    (u ? '<img src="' + esc(u) + '" alt="" loading="lazy" referrerpolicy="no-referrer" style="width:100%;height:100%;object-fit:contain;background:#fff;border-radius:inherit;display:block" onerror="this.remove()">' : "") + "</div>";
}
function recImg(r) { if (r.img && /^https?:/.test(r.img)) return r.img; var ph = Array.isArray(r.photos) ? r.photos : safeParse(r.photos, []); if (ph.length && ph[0].u) return imgSrc(ph[0].u); return r.img ? "img/r/" + r.img + ".jpg" : "img/meals.jpg"; }

/* ---------- sync with the sheet ---------- */
var pending = 0, chain = Promise.resolve(), lastJSON = "", polling = false;
function call(body) {
  body.pin = me.pin;
  return fetch(CFG.api, {method: "POST", headers: {"Content-Type": "text/plain;charset=utf-8"}, body: JSON.stringify(body), redirect: "follow"}).then(function (r) { return r.json(); });
}
function enqueue(body) {
  pending++;
  chain = chain.then(function () { return call(body); }).then(function (r) {
    if (!r.ok) throw new Error(r.error || "save_failed");
  }).catch(function (e) {
    st.err = e.message === "bad_pin" ? "PIN not accepted." : "Could not save (" + e.message + "). Showing what the sheet has.";
    if (e.message === "bad_pin") { me.pin = ""; ls("pfk_pin", ""); showPin(); }
  }).then(function () { pending--; if (!pending) poll(); });
}
function applyAll(data) {
  var j = JSON.stringify(data);
  TABS.forEach(function (t) { D[t] = (data[t] || []).slice(); });
  D.recipes.forEach(function (r) { ["ings", "steps", "loves", "notes", "photos"].forEach(function (f) { r[f] = Array.isArray(r[f]) ? r[f] : safeParse(r[f], []); }); });
  D.coffee.forEach(function (c) { ["ings", "steps", "tweaks"].forEach(function (f) { c[f] = Array.isArray(c[f]) ? c[f] : safeParse(c[f], []); }); c.stars = c.stars && typeof c.stars === "object" ? c.stars : safeParse(c.stars, {}); });
  st.loaded = true; st.lastSync = Date.now(); st.err = ""; checkPushDone();
  if (j !== lastJSON) { lastJSON = j; render(); if (st.pushOpen && !$("sheet").hidden) $("sheetBody").innerHTML = pushHtml(); else if (st.toolOpen && !$("sheet").hidden) $("sheetBody").innerHTML = toolHtml(st.toolOpen); } else setStatus();
}
function poll() {
  if (!CFG.api || !me.pin || pending || polling) return Promise.resolve();
  polling = true;
  return call({action: "all"}).then(function (r) {
    if (!r.ok) throw new Error(r.error);
    if (!pending) applyAll(r.data);
  }).catch(function (e) {
    if (e.message === "bad_pin") { me.pin = ""; ls("pfk_pin", ""); showPin("That PIN was not accepted."); }
    else { st.err = "Can't reach the sheet right now. Showing the last saved list."; setStatus(); }
  }).then(function () { polling = false; if (st.loaded && !me.name && !st.gate) showWho(); });
}
function put(tab, id, data) {
  id = id || rid(); data.ts = Date.now();
  var o = byId(D[tab], id);
  if (o) Object.keys(data).forEach(function (k) { o[k] = data[k]; }); else { o = {id: id}; Object.keys(data).forEach(function (k) { o[k] = data[k]; }); D[tab].push(o); }
  var send = {}; Object.keys(data).forEach(function (k) { send[k] = data[k]; });
  if (tab === "recipes" || tab === "coffee") Object.keys(send).forEach(function (k) { if (send[k] && typeof send[k] === "object") send[k] = JSON.stringify(send[k]); });
  enqueue({action: "upsert", tab: tab, id: id, data: send}); lastJSON = ""; render(); return id;
}
function del(tab, id) { D[tab] = D[tab].filter(function (x) { return String(x.id) !== String(id); }); enqueue({action: "delete", tab: tab, id: id}); lastJSON = ""; render(); }
var BUILD = "v23";
function setStatus() {
  var when = st.lastSync ? new Date(st.lastSync).toLocaleTimeString([], {hour: "numeric", minute: "2-digit"}) : "";
  $("status").innerHTML = st.err ? esc(st.err) : (st.loaded ? (me.name ? "Using this phone as <b>" + esc(me.name) + "</b> &middot; " : "") + "synced " + when + ' &middot; <button class="linkbtn" style="min-height:24px;padding:0" data-act="who">Switch person</button> &middot; ' + BUILD : "Loading your kitchen...");
}

/* ---------- catalog: usual items, search, fuzzy ---------- */
function phon(w) { return w.toLowerCase().replace(/[^a-z0-9]/g, "").replace(/cks/g, "x").replace(/ks/g, "x").replace(/ck/g, "k").replace(/ph/g, "f").replace(/(.)\1+/g, "$1"); }
function lev(a, b) { var m = a.length, n = b.length, d = [], i, j; for (i = 0; i <= m; i++) d[i] = [i]; for (j = 0; j <= n; j++) d[0][j] = j;
  for (i = 1; i <= m; i++) for (j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[m][n]; }
function hay(c) { return (c.name + " " + (c.brand || "") + " " + (c.kw || "").replace(/\|/g, " ")).toLowerCase(); }
function suggest(q) {
  q = (q || "").toLowerCase().trim(); if (q.length < 2) return [];
  var toks = q.split(/\s+/), res = [];
  D.catalog.forEach(function (c) { var h = hay(c); if (toks.every(function (t) { return h.indexOf(t) > -1; })) res.push({c: c, s: 10 + (c.timesBought || 0) * 2 + (h.indexOf(q) === 0 ? 5 : 0)}); });
  if (res.length < 3) { // sounds-like pass: "cricks" finds "Crix"
    var pq = toks.map(phon);
    D.catalog.forEach(function (c) { if (res.some(function (r) { return r.c === c; })) return; var words = hay(c).split(/\s+/).map(phon);
      var ok = pq.every(function (p) { return words.some(function (w) { return w && p.length > 2 && (w.indexOf(p) === 0 || lev(w, p) <= 1); }); });
      if (ok) res.push({c: c, s: 3 + (c.timesBought || 0)}); });
  }
  return res.sort(function (a, b) { return b.s - a.s; }).slice(0, 5).map(function (r) { return r.c; });
}
function catalogMatch(name) {
  var n = name.toLowerCase().trim();
  for (var i = 0; i < D.catalog.length; i++) { var c = D.catalog[i];
    if (c.name.toLowerCase() === n || (c.brand || "").toLowerCase() === n) return c;
    var kw = kwList(c); for (var k = 0; k < kw.length; k++) if (n === kw[k] || (kw[k].length > 3 && n.indexOf(kw[k]) > -1)) return c; }
  return null;
}
function storeStats() { var d = byId(D.settings, "storestats"); return d ? safeParse(d.value, {}) : {}; }
var MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function fmtDay(ms) { var d = new Date(Number(ms)); if (isNaN(d)) return ""; var o = new Date().getFullYear() !== d.getFullYear() ? " " + d.getFullYear() : ""; return MON[d.getMonth()] + " " + d.getDate() + o; }
function boughtInfo(c) {
  if (!c) return ""; var s0 = storeStats()[c.id] || {}, lb = Number(c.lastBought) || 0, out = []; if (lb < 1e11) lb = 0;
  if (lb) { out.push("Last bought " + fmtDay(lb)); if (c.timesBought) out.push(c.timesBought + (Number(c.timesBought) === 1 ? " trip" : " trips")); }
  if (s0.p) out.push("usually $" + Number(s0.p).toFixed(2));
  return out.join(" \u00b7 ");
}
function listState(name) {
  var n = String(name || "").toLowerCase(), st2 = "";
  D.list.forEach(function (i) { if (i.status !== "ordered" && String(i.name).toLowerCase() === n) { if (i.status === "list") st2 = st2 || "list"; else st2 = "cart"; } });
  return st2;
}
function addPlain(o) {
  var n = String(o.name).toLowerCase(), dup = D.list.filter(function (i) { return i.store === o.store && i.status !== "ordered" && String(i.name).toLowerCase() === n; })[0];
  if (dup) { put("list", dup.id, {qty: (dup.qty || 1) + (o.qty || 1)}); return {id: dup.id, dup: true}; }
  return {id: addLine(o), dup: false};
}
function storeModeHtml() {
  var chk = safeParse(ls("pfk_chk") || "{}", {}), items = D.list.filter(function (i) { return i.store === st.store && i.status !== "ordered"; });
  var groups = {}; items.forEach(function (i) { var k = i.cat || "other"; (groups[k] = groups[k] || []).push(i); });
  var left = items.filter(function (i) { return !chk[i.id]; }).length;
  return '<h3 id="shT">At ' + esc(st.store) + '</h3><p class="sub">' + left + " left of " + items.length + ". Tap to check off.</p>" + (Object.keys(groups).sort().map(function (k) { return '<div class="sechead"><h4>' + esc(k) + "</h4></div>" + groups[k].map(function (i) { var c = catalogMatch(i.name), b = c && c.lastBought ? "last bought " + fmtDay(c.lastBought) : ""; return '<button class="item" data-act="chk" data-id="' + esc(i.id) + '" style="width:100%;text-align:left;' + (chk[i.id] ? "opacity:.45;text-decoration:line-through" : "") + '"><div class="grow"><b>' + esc(i.name) + ((i.qty || 1) > 1 ? " x" + i.qty : "") + '</b><div class="sub">' + esc([i.size, b].filter(Boolean).join(" \u00b7 ")) + '</div></div><span class="chip' + (chk[i.id] ? " ok" : "") + '">' + (chk[i.id] ? "Got it" : "Get") + "</span></button>"; }).join(""); }).join("") || '<p class="empty">Nothing on the list.</p>') + '<button class="linkbtn" data-act="chkreset" style="display:block;margin:8px auto 0">Uncheck all</button><button class="linkbtn" data-act="close" style="display:block;margin:6px auto 0">Close</button>';
}
function recapHtml() {
  var ss = storeStats(), by = {}, tot = 0;
  D.catalog.forEach(function (c) { var x = ss[c.id]; if (x && x.p && x.d) { var m = String(x.d).slice(0, 7), v = Number(x.p) * (Number(x.q) || 1); by[m] = (by[m] || 0) + v; tot += v; } });
  var top = D.catalog.filter(function (c) { return Number(c.timesBought) > 0; }).sort(function (a, b) { return b.timesBought - a.timesBought; }).slice(0, 8);
  var dated = D.catalog.filter(function (c) { return Number(c.lastBought); }).length;
  return '<h3 id="shT">Our Store recap</h3><p class="sub">' + D.catalog.length + " items in Our Store, " + dated + " with a purchase date.</p>" +
    '<div class="sechead"><h4>Bought most often</h4></div>' + (top.map(function (c) { return '<div class="ing"><span>' + esc(c.brand || c.name) + '</span><span class="chip">' + c.timesBought + (Number(c.timesBought) === 1 ? " trip" : " trips") + "</span></div>"; }).join("") || '<p class="empty">No trips recorded yet.</p>') +
    '<div class="sechead"><h4>Estimated spend by month</h4></div><p class="sub">Uses the latest price and quantity of each item, so it is a floor, not a total.</p>' + (Object.keys(by).sort().reverse().map(function (m) { return '<div class="ing"><span>' + MON[Number(m.slice(5, 7)) - 1] + " " + m.slice(0, 4) + '</span><span class="chip">$' + by[m].toFixed(0) + "</span></div>"; }).join("") || '<p class="empty">No prices yet.</p>') +
    '<button class="linkbtn" data-act="close" style="display:block;margin:8px auto 0">Close</button>';
}
function storeList() {
  var box = $("storeList"); if (!box) return; var qe = $("storeq"), q = qe ? qe.value.toLowerCase().trim() : "", toks = q.split(/\s+/).filter(Boolean);
  var rows = D.catalog.filter(function (c) { var h = hay(c); return toks.every(function (t) { return h.indexOf(t) > -1; }); });
  var sf = st.sf || "all", cut = Date.now() - 150 * 864e5;
  if (sf === "old") rows = rows.filter(function (c) { var l = Number(c.lastBought) || 0; return l && l < cut; });
  if (sf === "dups") {
    var nrm = function (c) { return String(c.brand || c.name).toLowerCase().replace(/[^a-z0-9]/g, ""); }, seen = {}, pairs = [];
    D.catalog.forEach(function (c) { var k = nrm(c); if (k.length < 3) return; (seen[k] = seen[k] || []).push(c); });
    Object.keys(seen).forEach(function (k) { if (seen[k].length > 1) { var g = seen[k].slice().sort(function (a, b) { return (Number(b.timesBought) || 0) - (Number(a.timesBought) || 0); }); for (var j = 1; j < g.length; j++) pairs.push([g[0], g[j]]); } });
    box.innerHTML = pairs.map(function (p) { return '<div class="item"><div class="grow"><div><b>' + esc(p[0].brand || p[0].name) + '</b></div><div class="sub">' + esc((p[0].size || "") + " + " + (p[1].size || "") + " \u00b7 same name listed twice") + '</div></div><button class="btn sm" data-act="storemerge" data-id="' + esc(p[0].id + "~" + p[1].id) + '">Merge</button></div>'; }).join("") || '<p class="empty">No obvious duplicates.</p>'; return;
  }
  rows.sort(function (a, b) { var x = Number(a.lastBought) || 0, y = Number(b.lastBought) || 0; if (!x && y) return 1; if (x && !y) return -1; return x - y; });
  var total = rows.length; rows = rows.slice(0, 60);
  box.innerHTML = (rows.map(function (c) { var arm = st.rmId === c.id; return '<div class="item">' + thumb(c.cat, c.brand || c.name) + '<div class="grow"><div><b>' + esc(c.brand || c.name) + '</b></div><div class="sub">' + esc([c.size, boughtInfo(c) || "Not dated yet"].filter(Boolean).join(" \u00b7 ")) + '</div></div><button class="btn sm' + (arm ? " danger" : "") + '" data-act="storerm" data-id="' + esc(c.id) + '">' + (arm ? "Tap to remove" : "Remove") + "</button></div>"; }).join("") || '<p class="empty">Nothing matches.</p>') + (total > 60 ? '<p class="sub">Showing 60 of ' + total + '. Search to narrow.</p>' : "");
}
function showSugg(id, q) {
  var box = $(id === "ask" ? "sugg" : id === "liain" ? "suggL" : "sugg2"); if (!box) return;
  var m = q; if (id === "ask") { var p = parseAdd(q); m = p.items[0] || ""; }
  if (id === "liain" && (/[?]/.test(m) || m.split(/\s+/).length > 4)) { box.innerHTML = ""; return; }
  var r = suggest(m);
  var nm = (m || "").trim(), extra = nm.length >= 2 && id !== "liain" ? '<button class="new" data-act="newitem" data-in="' + id + '"><div class="thumb" style="background-image:url(img/c/' + guessCat(nm) + '.jpg)"></div><span class="grow"><b>Add &ldquo;' + esc(nm) + '&rdquo; as a new item</b><div class="hint">New to the app. It will be remembered for next time.</div></span><span class="chip">New</span></button>' : "";
  box.innerHTML = r.map(function (c) { return '<button data-act="pickcat" data-id="' + esc(c.id) + '" data-in="' + id + '">' + thumb(c.cat, c.brand || c.name) + '<span class="grow"><b>' + esc(c.brand || c.name) + '</b><div class="hint">' + esc([c.size, boughtInfo(c)].filter(Boolean).join(" · ")) + '</div></span>' + (function () { var ls = listState(c.brand || c.name); return ls === "list" ? '<span class="chip">On list</span>' : ls === "cart" ? '<span class="chip">In cart</span>' : '<span class="chip ok">Add</span>'; })() + '</button>'; }).join("") + extra;
}

/* ---------- list actions ---------- */
function itemsFor(s) { return D.list.filter(function (i) { return i.store === s; }); }
function addLine(o) { var id = put("list", null, o); return id; }
function addFromCatalog(c, store) {
  var dup = D.list.filter(function (i) { return i.store === store && i.status !== "ordered" && i.name === (c.brand || c.name); })[0];
  if (dup) return put("list", dup.id, {qty: (dup.qty || 1) + 1});
  return addLine({name: c.brand || c.name, size: c.size || "", cat: c.cat || guessCat(c.name), store: store, qty: 1, status: "list", note: "Usual item", addedBy: me.name});
}
function addByName(name, store, note) {
  var c = catalogMatch(name); if (c) { var id = addFromCatalog(c, store); if (note) put("list", id, {note: note}); return id; }
  var nm = name.charAt(0).toUpperCase() + name.slice(1);
  var dup = D.list.filter(function (i) { return i.store === store && i.status !== "ordered" && i.name.toLowerCase() === nm.toLowerCase(); })[0];
  if (dup) return put("list", dup.id, {qty: (dup.qty || 1) + 1});
  return addLine({name: nm, size: "", cat: guessCat(name), store: store, qty: 1, status: "list", note: note || "", addedBy: me.name});
}
function parseAdd(text) {
  var m = text.match(/^\s*(?:please\s+)?add\s+(.+?)\s+(?:to|on|in|for)\s+(.+?)\s*$/i), what = m ? m[1] : text.replace(/^\s*(?:please\s+)?add\s+/i, ""), store = st.store;
  if (m) { var w = m[2].toLowerCase(); stores.forEach(function (s) { if (w.indexOf(s.toLowerCase().split(" ")[0]) === 0 || (s === "Stop & Shop" && /stop|s&s/.test(w))) store = s; }); }
  var items = what.split(/,|\band\b/i).map(function (x) { return x.trim(); }).filter(Boolean);
  return {items: items, store: store};
}
function recordPurchase(i) {
  var c = catalogMatch(i.name) || D.catalog.filter(function (x) { return x.name === i.name; })[0];
  if (c) put("catalog", c.id, {timesBought: (c.timesBought || 0) + 1, lastBought: today()});
  else put("catalog", null, {name: i.name, brand: i.name, size: i.size || "", cat: i.cat || guessCat(i.name), kw: "", store: i.store, lastBought: today(), timesBought: 1, source: "ordered"});
  var zone = i.cat === "frozen" ? "Freezer" : (i.cat === "dairy" || i.cat === "eggs" || i.cat === "bacon" || i.cat === "produce") ? "Fridge" : "Pantry";
  var p = D.pantry.filter(function (x) { return x.name.toLowerCase() === i.name.toLowerCase(); })[0];
  if (p) put("pantry", p.id, {status: "ok", note: "Ordered " + new Date().toLocaleDateString([], {month: "short", day: "numeric"})});
  else put("pantry", null, {name: i.name, zone: zone, size: i.size || "", status: "ok", note: "Ordered " + new Date().toLocaleDateString([], {month: "short", day: "numeric"})});
}

/* ---------- recipes / pantry state ---------- */
function pantryState(kw) {
  var best = "need";
  D.pantry.forEach(function (p) { var n = (p.name || "").toLowerCase();
    if (n.indexOf(kw) > -1 || (n.length > 3 && kw.indexOf(n) > -1)) {
      if (p.status === "ok") best = "have"; else if ((p.status === "low" || p.status === "unconfirmed") && best === "need") best = "check"; } });
  return best;
}
function recipeIngs(r) { return (r.ings || []).map(function (x) { var s = "need"; String(x.k || x.n).toLowerCase().split("|").forEach(function (k) { var v = pantryState(k); if (v === "have") s = "have"; else if (v === "check" && s === "need") s = "check"; }); return {n: x.n, q: x.q, s: s}; }); }
function dealsList() { var d = byId(D.settings, "deals"); return d ? safeParse(d.value, []) : []; }
function prefsList() { var d = byId(D.settings, "prefs"); return d ? safeParse(d.value, []) : []; }

/* ---------- views ---------- */
/* ---------- v8 shopping model: Needs (list) -> waiting to push (queued) -> in the real cart (cart) -> ordered ---------- */
var DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
function dayHero() { var d = new Date().getDay(); return '<div class="dayhero" role="img" aria-label="Lia cooking, ' + DAYS[d] + '" style="background-image:url(img/days/' + d + '.jpg)"></div><div class="dayline">' + DAYS[d] + "</div>"; }
function byStatus(s, st2) { return itemsFor(s).filter(function (i) { return (i.status || "list") === st2; }); }
function needsFor(s) { return byStatus(s, "list"); }
function queuedFor(s) { return byStatus(s, "queued"); }
function cartFor(s) { return byStatus(s, "cart"); }
function orderedFor(s) { return byStatus(s, "ordered"); }
function needsProduct(i) { return !catalogMatch(i.name); }
function qtyStep(i) { return '<div class="step sm"><button data-act="dec" data-id="' + esc(i.id) + '" aria-label="Less">&minus;</button><span>' + (i.qty || 1) + '</span><button data-act="inc" data-id="' + esc(i.id) + '" aria-label="More">+</button></div>'; }
function needRow(i) {
  var gen = st.store === "Stop & Shop" && needsProduct(i);
  return '<div class="item">' + thumb(i.cat, i.name) + '<div class="grow"><div><b>' + esc(i.name) + '</b></div><div class="sub">' + esc([i.size, i.note, i.addedBy ? "added by " + i.addedBy : ""].filter(Boolean).join(" · ")) + "</div>" + (function () { var b = boughtInfo(catalogMatch(i.name)); return b ? '<div class="sub last">' + esc(b) + "</div>" : ""; })() + tagsFor(i) +
    (gen ? '<button class="pickp" data-act="namep" data-id="' + esc(i.id) + '">Name a product once</button>' : "") + qtyStep(i) + "</div>" +
    '<button class="tocart" data-act="tocart" data-id="' + esc(i.id) + '">' + ic("cart", "") + 'To cart</button><button class="trash" data-act="del" data-id="' + esc(i.id) + '" aria-label="Remove ' + esc(i.name) + '">' + ic("x", "") + "</button></div>";
}
function cartRow(i, waiting) {
  var ss = st.store === "Stop & Shop";
  return '<div class="item">' + thumb(i.cat, i.name) + '<div class="grow"><div><b>' + esc(i.name) + '</b></div><div class="sub">' + esc([i.size, (i.qty || 1) > 1 ? "x" + i.qty : "", i.note].filter(Boolean).join(" · ")) + "</div>" + (function () { var b = boughtInfo(catalogMatch(i.name)); return b ? '<div class="sub last">' + esc(b) + "</div>" : ""; })() +
    (waiting ? '<span class="tag wait">Waiting to push</span> <button class="linkbtn" style="min-height:28px;padding:2px 6px;font-size:12px" data-act="toneeds" data-id="' + esc(i.id) + '">Back to Needs</button> <button class="linkbtn" style="min-height:28px;padding:2px 6px;font-size:12px;color:#b3261e" data-act="del" data-id="' + esc(i.id) + '">Remove</button>' : '<span class="tag sync">' + (ss ? "In your Stop &amp; Shop cart" : "On the " + esc(st.store) + " list") + "</span>") + "</div></div>";
}
function storeSeg() { return '<div class="seg" role="group" aria-label="Store">' + stores.map(function (s) { var n = itemsFor(s).filter(function (i) { return i.status !== "ordered"; }).length; return '<button data-act="store" data-v="' + esc(s) + '" aria-pressed="' + (st.store === s) + '">' + esc(s) + (n ? "<b>" + n + "</b>" : "") + "</button>"; }).join("") + "</div>"; }
function rc(r) { return '<button class="rcard" data-act="recipe" data-id="' + esc(r.id) + '"><div class="pic" style="background-image:url(' + recImg(r) + ')" role="img" aria-label="' + esc(r.name) + '"></div><div class="nm">' + esc(r.name) + "</div></button>"; }
function dealVerdict(d) {
  var c = catalogMatch(d.name || ""), u = c ? Number((storeStats()[c.id] || {}).p) : 0, sp = parseFloat(String(d.sale).replace(/[^0-9.]/g, ""));
  if (!u || !sp) return c ? ' &middot; <span style="color:var(--muted)">you buy this</span>' : "";
  var diff = u - sp;
  if (diff >= 0.5 || diff / u >= 0.15) return ' &middot; <b style="color:var(--ok)">Good deal: $' + diff.toFixed(2) + " under your usual $" + u.toFixed(2) + "</b>";
  if (diff > 0) return ' &middot; <span style="color:var(--muted)">Only $' + diff.toFixed(2) + " under usual</span>";
  return ' &middot; <span style="color:var(--warn,#b3261e)">Not cheaper than your usual $' + u.toFixed(2) + "</span>";
}
function dealFor(name) {
  var c = catalogMatch(name || ""), n = String(name || "").toLowerCase(), hit = null;
  dealsList().forEach(function (d) { if (hit) return; var dc = catalogMatch(d.name || ""); if ((c && dc && dc.id === c.id) || String(d.name).toLowerCase() === n) hit = d; });
  return hit;
}
function couponFor(name) {
  var c = catalogMatch(name || ""), cp = byId(D.settings, "coupons"), list = cp ? safeParse(cp.value, []) : [], kws = c ? kwList(c).filter(function (k) { return k.length > 3; }) : [], hit = null;
  var n = String(name || "").toLowerCase();
  list.forEach(function (x) { if (hit) return; var cn = String(x.name || "").toLowerCase(); if (kws.some(function (k) { return cn.indexOf(k) > -1; }) || (n.length > 3 && cn.indexOf(n) > -1)) hit = x; });
  return hit;
}
function tagsFor(i) {
  var d = dealFor(i.name), cp = couponFor(i.name), h = "";
  if (d) h += '<div class="sub last" style="color:var(--ok);font-weight:700">On sale $' + esc(d.sale) + (d.was ? " (was $" + esc(d.was) + ")" : "") + "</div>";
  if (cp) h += '<div class="sub last" style="color:var(--ok)">Coupon: ' + esc(cp.offer || cp.name) + "</div>";
  return h;
}
function alertHtml() {
  var hits = [];
  D.list.forEach(function (i) { if (i.status === "ordered" || i.status === "cart") return; var d = dealFor(i.name), cp = couponFor(i.name); if (d || cp) hits.push({i: i, d: d, cp: cp}); });
  if (!hits.length) return "";
  return '<div class="card" style="border-color:var(--ok)"><h3>Sale alert on your list</h3>' + hits.slice(0, 5).map(function (h) { return '<div class="deal"><div class="grow"><b>' + esc(h.i.name) + '</b><div class="sub">' + esc((h.d ? "On sale $" + h.d.sale + (h.d.was ? " (was $" + h.d.was + ")" : "") : "") + (h.d && h.cp ? " \u00b7 " : "") + (h.cp ? "Coupon: " + (h.cp.offer || h.cp.name) : "")) + "</div></div></div>"; }).join("") + "</div>";
}
function budgetVal() { var b = byId(D.settings, "budget"); return b ? Number(b.value) || 0 : 0; }
function budgetHtml() {
  var b = budgetVal(), pr = byId(D.settings, "push"), pv = pr ? String(pr.value || "") : "", sub = /^done\|/.test(pv) ? parseFloat(String(subtotalOf(pv) || "0").replace(/,/g, "")) || 0 : 0;
  if (!b) return '<div class="homelinks" style="margin:0 0 10px"><button class="linkbtn" data-act="budget">Set a weekly budget</button></div>';
  var pct = Math.min(100, Math.round(sub / b * 100)), over = sub > b;
  return '<div class="card"><div class="row"><h3 class="grow">Weekly budget</h3><button class="linkbtn" data-act="budget">Change</button></div><div style="height:10px;border-radius:6px;background:var(--line);overflow:hidden;margin:8px 0"><div style="height:100%;width:' + pct + "%;background:" + (over ? "#b3261e" : "var(--ok)") + '"></div></div><div class="sub">' + (sub ? "Cart $" + sub.toFixed(2) + " of $" + b.toFixed(2) + (over ? " \u00b7 over by $" + (sub - b).toFixed(2) : " \u00b7 $" + (b - sub).toFixed(2) + " left") : "Push to the cart and your running total shows here. Budget $" + b.toFixed(2)) + "</div></div>";
}
function adviceHtml() {
  var a = byId(D.settings, "advice"), cp = byId(D.settings, "coupons"), list = cp ? safeParse(cp.value, []) : [], h = "";
  if (!a && !list.length) return "";
  var txt = a ? String(a.value || "") : "";
  h += '<div class="card"><h3>Lia&rsquo;s weekly advice</h3>' + (txt ? '<p style="margin:6px 0">' + esc(txt) + "</p>" : "");
  if (list.length) h += '<div class="sub" style="margin:6px 0 4px">Coupons that match what you buy. Tap Clip and it goes on Hazel&rsquo;s account at the next weekly run.</div>' + list.slice(0, 8).map(function (c, i) { return '<div class="deal"><div class="grow"><b>' + esc(c.name) + '</b><div class="sub">' + esc(c.offer || "") + '</div></div>' + (c.state === "clipped" ? '<span class="chip ok">Clipped</span>' : c.state === "want" ? '<span class="chip">Queued</span>' : '<button class="btn sm" data-act="clip" data-id="' + i + '">Clip</button>') + "</div>"; }).join("");
  return h + "</div>";
}
function dealsHtml(max) {
  var ds = dealsList().slice(0, max); if (!ds.length) return "";
  return '<div class="card"><h3>On sale from your usual items</h3><p class="sub" style="margin:6px 0 4px">Seen on Stop &amp; Shop ' + esc(ds[0].seen || "") + ". Tap Add and it waits in your cart queue.</p>" +
    ds.map(function (d, i) { return '<div class="deal"><div class="grow"><b>' + esc(d.name) + '</b><div class="sub"><span style="color:var(--ok);font-weight:700">$' + esc(d.sale) + '</span> <span class="was">$' + esc(d.was) + "</span>" + (d.note ? " &middot; " + esc(d.note) : "") + dealVerdict(d) + '</div></div><button class="btn sm" data-act="adddeal" data-id="' + i + '">Add</button><button class="dealx" data-act="dismissdeal" data-id="' + i + '" aria-label="Not interested in ' + esc(d.name) + '">' + ic("x", "") + '</button></div>'; }).join("") + "</div>";
}
function meals() { var d = byId(D.settings, "meallog"); return d ? safeParse(d.value, {}) : {}; }
function ago(ymd) { if (!ymd) return "not logged yet"; var s = String(ymd), d = new Date(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8)), n = Math.round((new Date(new Date().toDateString()) - d) / 864e5); return n <= 0 ? "today" : n === 1 ? "yesterday" : n < 14 ? n + " days ago" : n < 60 ? Math.round(n / 7) + " weeks ago" : Math.round(n / 30) + " months ago"; }
function lastMade(id) { return ago(meals()[id]); }
function rpic(r) { return "background-image:url(" + recImg(r) + ")"; }
function voteCard() {
  var day = today(), vs = D.votes.filter(function (v) { return Number(v.day) === day; }), mine = vs.filter(function (v) { return v.voter === me.name; })[0], counts = {}, who = {};
  vs.forEach(function (v) { counts[v.recipeId] = (counts[v.recipeId] || 0) + 1; (who[v.recipeId] = who[v.recipeId] || []).push(v.voter || "?"); });
  var top = null; Object.keys(counts).forEach(function (k) { if (!top || counts[k] > counts[top]) top = k; });
  var tr = top ? byId(D.recipes, top) : null, tot = vs.length;
  var h = '<div class="card vcard"><div class="vtop"><h3>Dinner vote</h3><span class="chip">' + new Date().toLocaleDateString([], {weekday: "long"}) + '</span></div><p class="sub" style="margin:4px 0 0">One vote each. Change yours any time.</p>';
  if (tr) h += '<div class="lead"><div class="pic" style="' + rpic(tr) + '"></div><div><div class="made">Leading with ' + counts[top] + " vote" + (counts[top] === 1 ? "" : "s") + '</div><b>' + esc(tr.name) + '</b><div class="made">Last made ' + lastMade(tr.id) + '</div></div><button class="cookit" data-act="cookit" data-id="' + esc(tr.id) + '">Cook this</button></div>';
  D.recipes.slice(0, 5).forEach(function (r) {
    var v = who[r.id] || [], m = !!mine && mine.recipeId === r.id;
    h += '<button class="vopt" data-act="vote" data-id="' + esc(r.id) + '" aria-pressed="' + m + '"><div class="pic" style="' + rpic(r) + '"></div><div class="grow"><b>' + esc(r.name) + '</b><div class="vb"><i style="width:' + (tot ? Math.round(v.length / tot * 100) : 0) + '%"></i></div></div><div>' + v.map(function (n) { return '<span class="av">' + esc(String(n).charAt(0).toUpperCase()) + "</span>"; }).join("") + '</div><span class="rad">' + (m ? ic("check", "") : "") + "</span></button>";
  });
  return h + '<button class="linkbtn" data-act="suggest" style="margin-top:6px">Suggest a meal that is not on the list</button></div>';
}
/* ---------- push to cart (fills the cart only; never checks out) ---------- */
function pushInfo() {
  var rq = byId(D.settings, "pushreq"), pu = byId(D.settings, "push"), req = rq ? String(rq.value || "").split("|") : [], ms = Number(req[0]) || 0;
  var n = queuedFor("Stop & Shop").length, c = cartFor("Stop & Shop").length;
  var o = {n: n, c: c, s: "idle", t: "", k: ms, mode: req[1] || "go", tool: "idle"};
  if (ms && Date.now() - ms < 12 * 36e5) {
    var p = pu ? String(pu.value || "").split("|") : [];
    if (p[1] && Number(p[1]) === ms) { o.s = p[0] === "done" ? "done" : p[0] === "working" ? "working" : "bad"; o.t = p.slice(2).join("|"); }
    else o.s = (Date.now() - ms > 90 * 6e4) ? "late" : "sent";
  }
  if (o.mode === "times" || o.mode === "sales") { o.tool = o.s; o.s = "idle"; }
  return o;
}
function subtotalOf(t) { var m = /subtotal[^$]*\$([\d,]+\.\d\d)/i.exec(t || ""); return m ? m[1] : ""; }
function pushHtml() {
  var o = pushInfo(), d = '<span class="dots">...</span>', b, cls = "", dis = false, m, w = o.n + " item" + (o.n === 1 ? "" : "s");
  if (o.s === "idle") { if (o.n) { b = "Push " + w + " to cart"; m = "<b>" + w + "</b> waiting. " + o.c + " already in the cart."; } else { b = "Nothing waiting"; dis = true; m = "Move items from Needs to the cart first. " + o.c + " already in the cart."; } }
  else if (o.s === "sent") { b = "Sent"; dis = true; m = "Waiting for the kitchen PC to pick it up" + d + " It checks every hour, or right away when Ifoma types &ldquo;push&rdquo; in the Push chat."; }
  else if (o.s === "late") { b = o.n ? "Still waiting" : "Sent"; cls = "bad"; m = "The kitchen PC has not picked it up yet. Tap to send again, or ask Ifoma to say &ldquo;push&rdquo; in Claude for an instant fill."; if (!o.n) dis = true; }
  else if (o.s === "working") { b = "Filling your cart"; dis = true; m = "The kitchen PC is adding items now" + d + " You can close the app."; }
  else if (o.s === "done") { b = o.n ? "Push " + w + " to cart" : "Cart updated"; cls = o.n ? "" : "done"; dis = !o.n; m = "<b>" + esc(o.t || "Cart filled.") + "</b>" + (/pickup/i.test(o.t || "") ? "" : " Ifoma: pick a pickup time and place the order."); }
  else { b = o.n ? "Try again" : "Couldn&rsquo;t finish"; cls = "bad"; dis = !o.n; m = esc(o.t || "Something went wrong.") + " Tap to try again, or ask Ifoma to say &ldquo;push&rdquo; in Claude."; }
  return '<h3 id="shT">Push to Stop &amp; Shop</h3><button class="pgo ' + cls + '" data-act="pushgo"' + (dis ? " disabled" : "") + ">" + b + '</button><div class="pmsg">' + m + '</div><div class="pnever">The app only fills the cart. Ifoma picks the time and places every order.</div><button class="linkbtn" data-act="close" style="display:block;margin:6px auto 0">Close</button>';
}
function pushBar() {
  var o = pushInfo(), sub = o.s === "done" && !o.n ? "Cart updated. Open it to review." : o.s === "sent" || o.s === "working" ? "On its way" : o.n ? o.n + " waiting to push" : "Cart is up to date";
  return '<button class="pushbar" data-act="push"><span class="ic">' + ic("cart", "") + '</span><span><b>Push to Stop &amp; Shop</b><small>' + sub + '</small></span><span class="go">Push</span></button>';
}
function lastRes(mode) { var r = byId(D.settings, mode === "times" ? "lasttimes" : "lastsales"); return r ? safeParse(r.value, null) : null; }
function whenT(ms) {
  var d = new Date(ms), t = d.toLocaleTimeString([], {hour: "numeric", minute: "2-digit"}), n = Math.round((new Date(new Date().toDateString()) - new Date(d.toDateString())) / 864e5);
  return (n <= 0 ? "today" : n === 1 ? "yesterday" : d.toLocaleDateString([], {month: "short", day: "numeric"})) + " at " + t;
}
function saveLast(o) {
  if (o.tool !== "done" || (o.mode !== "times" && o.mode !== "sales") || !o.k) return;
  var l = lastRes(o.mode); if (l && l.k === o.k) return;
  put("settings", o.mode === "times" ? "lasttimes" : "lastsales", {value: JSON.stringify({k: o.k, t: o.t})});
}
function toolSub(mode) {
  var o = pushInfo(), l = lastRes(mode);
  if (o.mode === mode && (o.tool === "sent" || o.tool === "working")) return "On its way";
  if (mode === "sales") { var n = dealsList().length; if (l) return n + " on sale &middot; " + whenT(l.k); return n ? n + " on sale" : "Tap to check"; }
  return l ? "Checked " + whenT(l.k) : "Tap to check";
}
function toolBtns(all) {
  if (!all && st.store !== "Stop & Shop") return "";
  return '<div class="tools"><button class="tool" data-act="toolshow" data-v="times"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg><span><b>Pickup times</b><small>' + toolSub("times") + '</small></span></button><button class="tool" data-act="toolshow" data-v="sales"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12l-8 8-9-9V3h8l9 9z"/><circle cx="7.5" cy="7.5" r="1.3"/></svg><span><b>Sales</b><small>' + toolSub("sales") + '</small></span></button></div>';
}
function timesRows(t) {
  var segs = String(t || "").replace(/^\s*Pickup times:\s*/i, "").split(/;\s*|\.\s+/).map(function (x) { return x.trim().replace(/\.$/, ""); }).filter(function (x) { return x && !/^I did not pick/i.test(x); });
  return segs.map(function (x) { var m = /^([^:]{2,40}):\s*(.+)$/.exec(x); return m ? '<div class="trow"><b>' + esc(m[1].charAt(0).toUpperCase() + m[1].slice(1)) + "</b>" + esc(m[2]) + "</div>" : '<div class="trow">' + esc(x) + "</div>"; }).join("");
}
function toolHtml(mode) {
  var o = pushInfo(), s = o.mode === mode ? o.tool : "idle", times = mode === "times", d = '<span class="dots">...</span>', last = lastRes(mode);
  if (s === "done") last = {k: o.k, t: o.t};
  var h = '<h3 id="toolT">' + (times ? "Pickup times" : "Sales this week") + "</h3>";
  if (s === "sent") h += '<div class="pmsg">Request sent. Waiting for the kitchen PC' + d + ' It checks every hour, or right away when Ifoma types &ldquo;push&rdquo; in the Push chat.</div>';
  else if (s === "working") h += '<div class="pmsg">The kitchen PC is looking now' + d + " You can close the app. You will get an alert here when it is ready.</div>";
  else if (s === "late") h += '<div class="pmsg">The kitchen PC has not picked it up yet. Ifoma can type &ldquo;push&rdquo; in the Push chat for an instant answer.</div>';
  else if (s === "bad") h += '<div class="pmsg">' + esc(o.t || "Something went wrong.") + "</div>";
  if (!last && !times && dealsList().length) h += dealsHtml(12);
  if (last) {
    h += '<div class="stamp">Last checked ' + whenT(last.k) + "</div>";
    h += times ? '<div class="toolout">' + (timesRows(last.t) || "No times found.") + "</div>" : (dealsList().length ? dealsHtml(12) : '<div class="toolout">' + (esc(last.t) || "Nothing on sale right now.") + "</div>");
  } else if (s === "idle" && (times || !dealsList().length)) h += '<p class="sub">Nothing checked yet. The kitchen PC only reads Stop &amp; Shop. It never picks a time or buys anything.</p>';
  var busy = s === "sent" || s === "working";
  h += '<button class="pgo ' + (s === "bad" || s === "late" ? "bad" : last ? "done" : "") + '" data-act="tool" data-v="' + mode + '"' + (busy ? " disabled" : "") + ">" + (busy ? "Checking" : last ? "Check again" : "Check now") + "</button>";
  return h + '<div class="pnever">Read only. Ifoma picks the time and places every order.</div><button class="linkbtn" data-act="close" style="display:block;margin:6px auto 0">Close</button>';
}
function toolSheet(mode, send) {
  var bx = $("alertbox"); if (bx) bx.innerHTML = "";
  if (send) put("settings", "pushreq", {value: Date.now() + "|" + mode});
  st.toolOpen = mode; sheet(toolHtml(mode)); st.toolOpen = mode;
}
var alertTimer = 0;
function showAlert(title, small, act, v, ms) {
  var box = $("alertbox"); if (!box) return;
  box.innerHTML = '<button class="alert" data-act="' + (act || "hidealert") + '"' + (v ? ' data-v="' + v + '"' : "") + ">" + ic("check", "") + "<span><b>" + esc(title) + "</b><small>" + esc(small) + "</small></span></button>";
  clearTimeout(alertTimer); alertTimer = setTimeout(function () { box.innerHTML = ""; }, ms || 9000);
}
function checkPushDone() {
  var o = pushInfo(); saveLast(o);
  var done = o.s === "done" || o.tool === "done", seen = Number(ls("pfk_seen")) || 0;
  if (!done || !o.k || o.k <= seen) return;
  ls("pfk_seen", String(o.k));
  if (st.toolOpen === o.mode && !$("sheet").hidden) return;
  if (o.mode === "times") showAlert("Pickup times are ready", "Tap to see today and tomorrow.", "toolshow", "times", 15000);
  else if (o.mode === "sales") { var n = dealsList().length; showAlert(n ? n + " sale" + (n === 1 ? "" : "s") + " on your usual items" : "No new sales this week", n ? "Tap to see them and add what you like." : "Nothing on sale from your usual items.", "toolshow", "sales", 15000); }
  else { var sub = subtotalOf(o.t); showAlert("Your cart has been updated", (sub ? "Subtotal $" + sub + ". " : "") + "Ifoma: pick a time and place the order.", "hidealert", "", 12000); }
}
/* Lia: if what you moved to the cart has a better-priced sale match, say so (the item you asked for stays in the cart queue) */
function swapCheck(i) {
  if (!i || i.store !== "Stop & Shop") return;
  var toks = String(i.name).toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(function (x) { return x.length > 3; }), key = toks.slice(0, 2).join(" "), dl = dealsList(), hit = -1;
  dl.forEach(function (d, ix) { if (hit > -1 || String(d.name).toLowerCase() === String(i.name).toLowerCase()) return;
    var nt = String(d.note || "").toLowerCase(), dn = String(d.name).toLowerCase(), shared = toks.filter(function (x) { return dn.indexOf(x) > -1; }).length;
    if ((key && nt.indexOf(key) > -1) || (d.cat && i.cat && d.cat === i.cat && shared >= 2)) hit = ix; });
  if (hit < 0) return;
  var d = dl[hit]; st.swap = {id: i.id, deal: d.name};
  var box = $("alertbox"); if (!box) return;
  box.innerHTML = '<div class="alert swap" role="group"><span class="face sm"><img src="img/lia/f.png" alt=""></span><span><b>Lia: you like ' + esc(i.name) + ", but " + esc(d.name) + ' is on sale</b><small>$' + esc(d.sale) + (d.was ? " (was $" + esc(d.was) + ")" : "") + ". Want to switch?</small><span class=\"swbtns\"><button data-act=\"swapyes\">Switch</button><button data-act=\"swapno\">Keep mine</button></span></span></div>";
  clearTimeout(alertTimer); alertTimer = setTimeout(function () { box.innerHTML = ""; }, 30000);
}
function swapDo(yes) {
  var box = $("alertbox"); if (box) box.innerHTML = ""; var w = st.swap; st.swap = null; if (!w || !yes) return;
  var i = byId(D.list, w.id), dl = dealsList(), ix = -1; dl.forEach(function (d, k) { if (d.name === w.deal) ix = k; });
  if (!i || ix < 0) return; var d = dl[ix];
  put("list", i.id, {name: d.name, size: d.size || "", cat: d.cat || i.cat, note: "Sale $" + d.sale + " (Lia suggestion)"});
  dl.splice(ix, 1); put("settings", "deals", {value: JSON.stringify(dl)}); toast("Switched to " + d.name + ".");
}
/* ---------- Lia, the cooking buddy (runs on the family list, pantry and meal log; no account needed) ---------- */
function face() { return '<div class="face"><img class="a" src="img/lia/f.png" alt=""><img class="b" src="img/lia/f-b.png" alt=""></div>'; }
function tonight() {
  var ml = meals(), rs = D.recipes.map(function (r) { var ig = recipeIngs(r), need = ig.filter(function (x) { return x.s === "need"; }).length; return {r: r, has: ig.length > 0, need: need, last: ml[r.id] || 0}; });
  rs.sort(function (x, y) { return (x.has ? 0 : 1) - (y.has ? 0 : 1) || x.need - y.need || x.last - y.last; });
  return rs.slice(0, 3);
}
function miniRec(x) {
  var r = x.r;
  return '<div class="mini"><div class="pic" style="' + rpic(r) + '"></div><div class="grow"><b>' + esc(r.name) + '</b><div class="made">' + (x.has ? (x.need ? x.need + " to buy" : "You have everything") : "No ingredient list yet") + " &middot; last made " + lastMade(r.id) + '</div></div></div>' +
    '<div class="opts"><button class="opt fill" data-act="cookit" data-id="' + esc(r.id) + '">We&rsquo;re cooking this</button>' + (x.need ? '<button class="opt" data-act="addneed" data-id="' + esc(r.id) + '">Add ' + x.need + " to Needs</button>" : "") + "</div>";
}
function liaAnswer(q) {
  q = (q || "").toLowerCase();
  var m = q.match(/^\s*(?:add|need|get)\s+(.+)$/);
  if (m) { var p = parseAdd(q); p.items.forEach(function (n) { addByName(n, p.store); }); return "Done. I put " + esc(p.items.join(", ")) + " on your " + esc(p.store) + " list."; }
  var t = tonight(); if (!t.length) return "I do not have any recipes saved yet. Add a few to the Recipe Book and I can start suggesting dinners.";
  return "Here is what I would cook, based on what you have and what has not been made in a while:" + t.map(miniRec).join("");
}
function cook() {
  liaLoad();
  var h = '<div class="lhero"><div class="lia"><img class="a" src="img/lia/lia.png" alt="Lia, your cooking buddy"><img class="b" src="img/lia/lia-b.png" alt=""></div><div class="say">Hi' + (me.name ? " " + esc(me.name) : "") + ', I&rsquo;m Lia. Hungry?<small>Ask me anything about dinner.</small></div></div><div class="chat">';
  if (!st.chat.length) h += '<div class="aiRow">' + face() + '<div class="msg ai">Tap one to start, or tap the mic and talk.<div class="opts"><button class="opt fill" data-act="liaask" data-q="What can we cook tonight?">What can we cook tonight?</button><button class="opt" data-act="tool" data-v="sales">Check sales</button><button class="opt" data-act="tool" data-v="times">Check times</button><button class="opt" data-act="liasnap">Snap a recipe</button><button class="opt" data-act="tab" data-v="recipes">Open Recipe Book</button></div></div></div>';
  else h += '<div class="newchat"><button class="linkbtn" data-act="newchat">New chat</button></div>';
  st.chat.forEach(function (c) { h += c.who === "me" ? '<div class="msg me">' + (c.img ? '<img class="snapimg" src="' + c.img + '" alt="Your photo">' : esc(c.t)) + "</div>" : '<div class="aiRow">' + face() + '<div class="msg ai">' + c.t + "</div></div>"; });
  return h + '</div><div class="sugg" id="suggL"></div><div class="bar2"><input type="text" id="liain" placeholder="Ask Lia, or say: add butter" aria-label="Ask Lia" autocomplete="off" enterkeyhint="send"><button class="round cam3" data-act="liasnap" aria-label="Snap a recipe">' + ic("cam", "") + '</button><button class="round mic3" data-act="liamic" aria-label="Talk to Lia">' + ic("mic", "") + '</button><button class="round send" data-act="liasend" aria-label="Send">' + ic("send", "") + "</button></div>";
}
var liaBusy = false;
function liaKey() { return "lia_" + String(me.name || "family").toLowerCase().replace(/[^a-z0-9]/g, ""); }
function liaLoad() {
  if (st.chatLoaded || !st.loaded || st.chat.length) return; st.chatLoaded = true;
  var row = byId(D.settings, liaKey()); if (!row) return; var arr = safeParse(row.value, []), cut = Date.now() - 3 * 864e5;
  st.chat = arr.filter(function (c) { return c && c.t && (!c.ts || c.ts > cut); }).map(function (c) { return c.who === "me" ? {who: "me", t: String(c.t)} : {who: "ai", t: esc(c.t), raw: String(c.t)}; });
}
function liaSave() {
  var keep = st.chat.filter(function (c) { return !c.pending; }).slice(-24).map(function (c) { return {who: c.who, t: (c.who === "me" ? c.t : (c.raw || liaPlain(c.t))).slice(0, 700), ts: Date.now()}; });
  put("settings", liaKey(), {value: JSON.stringify(keep).slice(-9000) === JSON.stringify(keep) ? JSON.stringify(keep) : JSON.stringify(keep.slice(-10))});
}
function liaFix(o) {
  var r = String(o.reply || ""), k = r.indexOf("```"), j = null, out = {};
  if (k > -1) { var body = r.slice(k).replace(/^```(?:json)?/, "").replace(/```[\s\S]*$/, ""); try { j = JSON.parse(body.trim()); } catch (e) {} r = r.slice(0, k).trim(); }
  else if (/^\s*\{/.test(r)) { try { j = JSON.parse(r); } catch (e2) {} r = j && j.reply ? String(j.reply) : ""; }
  Object.keys(o).forEach(function (f) { out[f] = o[f]; });
  if (j) ["add", "cooked", "gear", "banger", "show", "tool"].forEach(function (f) { if (out[f] == null && j[f] != null) out[f] = j[f]; });
  out.reply = r || "Here you go."; return out;
}
function liaPlain(h) { return String(h).replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&rsquo;/g, "'").replace(/\s+/g, " ").trim(); }
function liaApply(o) {
  var done = [], html = esc(o.reply || "");
  (o.add || []).forEach(function (x) { var n = (x && x.name || "").trim(); if (n) { addByName(n, st.store, x.note || ""); done.push("Added " + n + " to " + st.store); } });
  (o.cooked || []).forEach(function (id) { var r = byId(D.recipes, id); if (r) { var ml = meals(); ml[id] = today(); put("settings", "meallog", {value: JSON.stringify(ml)}); done.push("Logged " + r.name + " as made today"); } });
  if (o.tool === "times" || o.tool === "sales") { put("settings", "pushreq", {value: Date.now() + "|" + o.tool}); html += '<div class="opts"><button class="opt fill" data-act="toolshow" data-v="' + o.tool + '">Show answer</button></div>'; }
  if (o.gear) { var g = byId(D.settings, "gear"), v = (g ? String(g.value || "") + "\n" : "") + String(o.gear).slice(0, 300); put("settings", "gear", {value: v.slice(-4000)}); done.push("Remembered that"); }
  if (o.banger && o.banger.name) { var bg = cleanRecipe(o.banger); put("recipes", null, {name: bg.name, cat: bg.cat, prep: bg.prep, cook: bg.cook, img: "", serves: bg.serves, ings: bg.ings, steps: bg.steps, note: bg.note, addedBy: me.name, kind: "banger", loves: [], notes: [], photos: []}); done.push("Saved " + bg.name + " to Ojazel's Recipe Book"); }
  (o.show || []).slice(0, 3).forEach(function (id) { var r = byId(D.recipes, id); if (r) { var ig = recipeIngs(r), need = ig.filter(function (x) { return x.s === "need"; }).length; html += miniRec({r: r, has: ig.length > 0, need: need}); } });
  if (done.length) html += '<div class="made" style="margin-top:8px">' + done.map(esc).join(" &middot; ") + "</div>";
  return html;
}
function liaTool(q) {
  var t = String(q || "").toLowerCase();
  if (/\b(pick ?up|delivery|deliver)\b/.test(t) && /\b(time|times|slot|slots|available|open|today|tonight|tomorrow)\b/.test(t)) return "times";
  if (/\b(sale|sales|deals?|on special)\b/.test(t) && /\b(check|any|what|find|look|show|are)\b/.test(t)) return "sales";
  return "";
}
function liaSay(q) {
  if (liaBusy) return;
  var tl = liaTool(q);
  if (tl) { st.chat.push({who: "me", t: q}); put("settings", "pushreq", {value: Date.now() + "|" + tl}); var msg = tl === "times" ? "I cannot see the store myself, so I asked the kitchen PC to check Stop &amp; Shop pickup and delivery times. It only looks and never picks one." : "I asked the kitchen PC to look through Stop &amp; Shop for sales on your usual items."; st.chat.push({who: "ai", t: msg + '<div class="opts"><button class="opt fill" data-act="toolshow" data-v="' + tl + '">Show answer</button></div>', raw: liaPlain(msg)}); liaSave(); render(); scrollDown(); return; }
  st.chat.push({who: "me", t: q}); liaBusy = true; st.chat.push({who: "ai", t: '<span class="dots">...</span>', pending: true}); render(); scrollDown();
  var hist = st.chat.filter(function (c) { return !c.pending; }).slice(-12).map(function (c) { return {role: c.who === "me" ? "user" : "assistant", content: c.who === "me" ? c.t : (c.raw || liaPlain(c.t))}; });
  call({action: "lia", who: me.name, messages: hist}).then(function (r) {
    if (!r.ok) throw new Error(r.error || "lia_failed");
    return r.out;
  }).then(function (o) { o = liaFix(o); st.chat.pop(); st.chat.push({who: "ai", t: liaApply(o), raw: o.reply || ""}); liaSave(); }, function (e) {
    st.chat.pop(); var msg = e.message === "no_key" ? "" : e.message === "daily_limit" ? "I have hit my chat limit for today, but here is what I can tell from your lists." : "I could not reach my brain just now, but here is what I can tell from your lists.";
    st.chat.push({who: "ai", t: (msg ? esc(msg) + "<br>" : "") + liaAnswer(q), raw: ""}); }).then(function () { liaBusy = false; render(); scrollDown(); });
}
function scrollDown() { setTimeout(function () { window.scrollTo(0, document.body.scrollHeight); }, 30); }
function pageTop(t, s) { return '<div class="top"><div><h1>' + t + "</h1><small>" + s + "</small></div></div>"; }
function voteMini() {
  var day = today(), vs = D.votes.filter(function (v) { return Number(v.day) === day; }), counts = {}, top = null;
  vs.forEach(function (v) { counts[v.recipeId] = (counts[v.recipeId] || 0) + 1; });
  Object.keys(counts).forEach(function (k) { if (!top || counts[k] > counts[top]) top = k; });
  var tr = top ? byId(D.recipes, top) : null;
  return '<div class="card"><div class="vmini"><div class="grow"><h3>Dinner vote</h3><div class="sub" style="margin-top:3px">' + (tr ? esc(tr.name) + " is leading with " + counts[top] + " vote" + (counts[top] === 1 ? "" : "s") : "No votes yet today") + '</div></div><button class="btn sm" data-act="votes">Vote</button></div></div>';
}
/* ---------- meal calendar (weeks start Sunday; Ifoma and Hazel plan, everyone else votes and suggests) ---------- */
var SLOTS = [["b", "Breakfast"], ["l", "Lunch"], ["d", "Dinner"], ["s", "Snack"]];
var QUICK = {b: ["Pancakes", "Waffles", "Eggs and toast", "Cereal", "Oatmeal"], l: ["Sandwiches", "Leftovers", "Mac and cheese", "Chicken nuggets"], d: ["Leftovers", "Takeout"], s: ["Fruit", "Crackers and cheese", "Yogurt", "Popcorn"]};
var DAY3 = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
var PARENTS = {ifoma: 1, hazel: 1};
function canPlan() { return !!PARENTS[String(me.name || "").toLowerCase()]; }
function isOji() { return String(me.name || "").toLowerCase() === "ifoma"; }
function dkey(d) { return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate(); }
function kdate(k) { k = Number(k); return new Date(Math.floor(k / 10000), Math.floor(k / 100) % 100 - 1, k % 100, 12); }
function weekDays(off) { var d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - d.getDay() + 7 * (off || 0)); var a = []; for (var i = 0; i < 7; i++) { var x = new Date(d); x.setDate(d.getDate() + i); a.push(x); } return a; }
function planAll() { var r = byId(D.settings, "mealplan"); return r ? safeParse(r.value, {}) : {}; }
function planSave(p) { var cut = dkey(new Date(Date.now() - 21 * 864e5)); Object.keys(p).forEach(function (k) { if (Number(k) < cut) delete p[k]; }); put("settings", "mealplan", {value: JSON.stringify(p)}); }
function slotName(e) { if (!e) return ""; if (e.r) { var r = byId(D.recipes, e.r); return r ? r.name : (e.t || "Recipe"); } return e.t || ""; }
function slotRec(e) { return e && e.r ? byId(D.recipes, e.r) : null; }
function avatar(n) { var cols = {ifoma: "#2f5a3d", hazel: "#c4694a", josh: "#2b6cb0", kayley: "#a8741a", joel: "#7a4f9a", celeste: "#3f8f8a", lia: "#9a8f80"}, k = String(n || "?").toLowerCase(); return '<span class="av" style="background:' + (cols[k] || "#8a7f70") + '" title="' + esc(n) + '">' + esc(String(n || "?").charAt(0).toUpperCase()) + "</span>"; }
function curDay() { var days = weekDays(st.wk || 0), tk = dkey(new Date()); if (st.pday == null) { st.pday = 0; days.forEach(function (d, i) { if (dkey(d) === tk) st.pday = i; }); } return st.pday; }
function weekStrip(sel, act) {
  var days = weekDays(st.wk || 0), p = planAll(), tk = dkey(new Date());
  return '<div class="strip">' + days.map(function (d, i) { var k = dkey(d), e = (p[k] || {}).d, r = slotRec(e);
    var pic = r ? '<i style="background-image:url(' + esc(recImg(r)) + ')"></i>' : (e ? '<i class="txt">' + esc(slotName(e).charAt(0)) + "</i>" : '<i class="empty"></i>');
    return '<button class="dy' + (k === tk ? " today" : "") + '" data-act="' + (act || "pday") + '" data-v="' + i + '" aria-pressed="' + (sel === i) + '" aria-label="' + esc(DAYS[d.getDay()] + " " + MON[d.getMonth()] + " " + d.getDate() + (e ? ", dinner " + slotName(e) : ", nothing planned")) + '"><small>' + (k === tk ? "Today" : DAY3[d.getDay()]) + "</small><b>" + d.getDate() + "</b>" + pic + "</button>"; }).join("") + "</div>";
}
function weekRange(off) { var d = weekDays(off); return MON[d[0].getMonth()] + " " + d[0].getDate() + " to " + (d[6].getMonth() !== d[0].getMonth() ? MON[d[6].getMonth()] + " " : "") + d[6].getDate(); }
function weekCard() {
  var keep = st.wk; st.wk = 0;
  var p = planAll(), tk = dkey(new Date()), e = (p[tk] || {}).d, r = slotRec(e), h;
  h = '<div class="card"><div class="row"><div class="grow"><h3>This week</h3><div class="sub">' + weekRange(0) + ' &middot; tap a day</div></div><button class="iconbtn" data-act="tab" data-v="plan" aria-label="Open the meal calendar">' + ic("cal", "") + "</button></div>" + weekStrip(-1, "hday");
  if (e) h += '<button class="tonight" data-act="hday" data-v="' + curTodayIdx() + '"><span class="ph" style="background-image:url(' + esc(r ? recImg(r) : "img/meals.jpg") + ')"></span><span class="grow"><span class="kick">Tonight</span><b>' + esc(slotName(e)) + '</b><span class="who">' + (e.by ? avatar(e.by) + " planned by " + esc(e.by) : (e.s ? avatar("Lia") + " Lia suggests" : "")) + (r && (Number(r.prep) || Number(r.cook)) ? " &middot; " + ((Number(r.prep) || 0) + (Number(r.cook) || 0)) + " min" : "") + "</span></span></button>";
  else h += '<p class="sub" style="margin:10px 0 0">Nothing planned for tonight.' + (canPlan() ? ' <button class="linkbtn" data-act="tab" data-v="plan" style="padding:0;min-height:0">Plan the week</button>' : "") + "</p>";
  st.wk = keep; return h + "</div>";
}
function curTodayIdx() { return new Date().getDay(); }
function plan() {
  var off = st.wk || 0, days = weekDays(off), p = planAll(), sel = curDay(), d = days[sel], k = dkey(d), day = p[k] || {}, e = day.d, r = slotRec(e), tk = dkey(new Date()), sug = 0, any = 0, h;
  days.forEach(function (x) { var dd = p[dkey(x)] || {}; SLOTS.forEach(function (sl) { if (dd[sl[0]]) { any++; if (dd[sl[0]].s) sug++; } }); });
  h = '<div class="top"><div class="grow"><small>Meal Calendar</small><h1>' + (off ? "Next week" : "This week") + "</h1></div></div>";
  h += '<div class="seg2" role="group"><button data-act="wk" data-v="0" aria-pressed="' + (off === 0) + '">' + weekRange(0) + '</button><button data-act="wk" data-v="1" aria-pressed="' + (off === 1) + '">' + weekRange(1) + "</button></div>";
  h += weekStrip(sel);
  if (e) {
    h += '<div class="dinner"><div class="ph" style="background-image:url(' + esc(r ? recImg(r) : "img/meals.jpg") + ')"><div class="cap"><small>' + DAYS[d.getDay()] + " dinner" + (e.s ? " &middot; Lia suggests" : "") + "</small><h2>" + esc(slotName(e)) + "</h2></div></div>" +
      '<div class="act"><span class="who grow">' + (e.s ? avatar("Lia") + " Lia picked this &middot; not approved yet" : e.by ? avatar(e.by) + " planned by " + esc(e.by) : "") + "</span></div>" +
      '<div class="act" style="padding-top:0">' + (r ? '<button class="btn sm" data-act="recipe" data-id="' + esc(r.id) + '">See recipe</button>' : "") +
      (canPlan() ? (e.s ? '<button class="btn sm okb" data-act="pok" data-id="' + k + '|d">Approve</button>' : "") + '<button class="btn sm ghost" data-act="pslot" data-id="' + k + '|d">Swap</button>' : '<button class="btn sm ghost" data-act="votes">Vote / suggest</button>') +
      (k <= tk && r ? '<button class="btn sm ghost" data-act="made" data-id="' + esc(r.id) + '">We made it</button>' : "") + "</div></div>";
  } else {
    h += '<div class="card dempty"><h3>' + DAYS[d.getDay()] + " dinner</h3>" + (canPlan() ? '<p class="sub">Nothing planned yet.</p><button class="btn" data-act="pslot" data-id="' + k + '|d">Pick dinner</button>' : '<p class="sub">Nothing planned yet. Vote or suggest something.</p><button class="btn ghost" data-act="votes">Vote / suggest</button>') + "</div>";
  }
  h += '<div class="card slots">' + SLOTS.filter(function (sl) { return sl[0] !== "d"; }).map(function (sl) { var x = day[sl[0]], xr = slotRec(x);
    return '<button class="slot" data-act="' + (canPlan() ? "pslot" : "votes") + '" data-id="' + k + "|" + sl[0] + '"><span class="lb">' + sl[1] + "</span>" + (xr ? '<span class="th" style="background-image:url(' + esc(recImg(xr)) + ')"></span>' : "") + '<span class="grow">' + (x ? "<b>" + esc(slotName(x)) + "</b>" + (x.s ? ' <span class="chip">Lia suggests</span>' : "") : '<span class="sub">' + (canPlan() ? "Tap to add" : "Nothing yet") + "</span>") + "</span></button>"; }).join("") + "</div>";
  if (canPlan()) h += '<div class="card"><button class="big" data-act="pauto">Lia, fill the empty spots</button>' + (sug ? '<button class="big alt" data-act="pokall">Approve all Lia picks (' + sug + ")</button>" : "") + '<button class="big alt" data-act="pgroc"' + (any ? "" : " disabled") + ">Groceries for this week</button>" + '<div class="sub" style="margin-top:8px">Only what we are missing goes to Needs, with our usual Stop &amp; Shop brands. Nothing goes to the cart until you Push.</div>' + (any ? '<button class="linkbtn" data-act="pclearwk" style="display:block;margin:6px auto 0">Clear this week</button>' : "") + "</div>";
  else h += '<div class="lock">' + ic("lock", "") + "Oji and Hazel set the calendar. You can vote and suggest meals.</div>";
  return h;
}
function pickList() {
  var box = $("pl"); if (!box) return; var qe = $("pq"), q = qe ? qe.value.toLowerCase().trim() : "", ml = meals();
  var rs = D.recipes.filter(function (r) { return !q || String(r.name).toLowerCase().indexOf(q) > -1; }).sort(function (a, b) { return (ml[a.id] || 0) - (ml[b.id] || 0); });
  box.innerHTML = rs.map(function (r) { return '<button class="item" data-act="ppick" data-id="' + esc(r.id) + '" style="width:100%;text-align:left"><div class="pic2" style="width:40px;height:40px;border-radius:10px;background:url(' + esc(recImg(r)) + ') center/cover"></div><div class="grow"><b>' + esc(r.name) + '</b><div class="sub">' + (rLoves(r).length ? rLoves(r).length + " love it &middot; " : "") + (ml[r.id] ? "last made " + esc(fmtDay(kdate(ml[r.id]).getTime())) : "not made yet") + "</div></div></button>"; }).join("") || '<p class="empty">No recipes match. Type a name below instead.</p>';
}
function pickSheet(id) {
  if (!canPlan()) { st.voteOpen = true; sheet(voteCard() + '<button class="big alt" data-act="close">Close</button>'); return; }
  var pr = id.split("|"), k = pr[0], sl = pr[1], dt = kdate(k), e = (planAll()[k] || {})[sl], nm = SLOTS.filter(function (x) { return x[0] === sl; })[0][1];
  st.pslot = id;
  sheet('<h3 id="shT">' + nm + " &middot; " + esc(DAYS[dt.getDay()] + " " + MON[dt.getMonth()] + " " + dt.getDate()) + "</h3>" + (e ? '<p class="sub">Now: <b>' + esc(slotName(e)) + "</b></p>" + (e.s ? '<button class="btn sm" data-act="pok" data-id="' + esc(id) + '">Looks good</button> ' : "") + '<button class="linkbtn" data-act="pclear">Clear this spot</button>' : "") +
    '<div class="sub" style="margin:10px 0 4px">Quick picks</div><div class="opts">' + QUICK[sl].map(function (q) { return '<button class="opt" data-act="pquick" data-v="' + esc(q) + '">' + esc(q) + "</button>"; }).join("") + "</div>" +
    '<div class="sub" style="margin:10px 0 4px">From Ojazel&rsquo;s Recipe Book</div><input type="text" id="pq" placeholder="Search recipes" autocomplete="off" aria-label="Search recipes"><div id="pl" style="max-height:34vh;overflow:auto;margin-top:6px"></div>' +
    '<div class="sub" style="margin:10px 0 4px">Or type something</div><div class="ask"><div class="grow"><input type="text" id="pt" placeholder="e.g. Jerk chicken" autocomplete="off" aria-label="Meal"></div><button class="btn" data-act="pfree">Add</button></div><button class="linkbtn" data-act="close" style="display:block;margin:6px auto 0">Close</button>'); pickList();
}
function setSlot(id, e) { var pr = id.split("|"), p = planAll(); p[pr[0]] = p[pr[0]] || {}; if (e) { if (!e.s) e.by = me.name || ""; p[pr[0]][pr[1]] = e; } else delete p[pr[0]][pr[1]]; planSave(p); }
function planAuto() {
  var off = st.wk || 0, days = weekDays(off), p = planAll(), tk = dkey(new Date()), ml = meals(), used = {}, n = 0;
  days.forEach(function (d) { var e = (p[dkey(d)] || {}).d; if (e && e.r) used[e.r] = 1; });
  var rs = D.recipes.filter(function (r) { return rCat(r) !== "Breakfast" && rCat(r) !== "Desserts"; }).map(function (r) { var ig = recipeIngs(r), need = ig.filter(function (x) { return x.s === "need"; }).length; return {r: r, has: ig.length > 0, need: need, last: ml[r.id] || 0, love: rLoves(r).length}; });
  rs.sort(function (x, y) { return x.last - y.last || y.love - x.love || (x.has ? 0 : 1) - (y.has ? 0 : 1) || x.need - y.need; });
  days.forEach(function (d, di) {
    var k = dkey(d); if (k < tk) return; p[k] = p[k] || {};
    SLOTS.forEach(function (sl) {
      if (p[k][sl[0]]) return;
      if (sl[0] === "d") { var pick = rs.filter(function (x) { return !used[x.r.id]; })[0]; if (!pick) return; used[pick.r.id] = 1; p[k].d = {r: pick.r.id, s: 1}; n++; }
      else { var q = QUICK[sl[0]]; p[k][sl[0]] = {t: q[(di + (sl[0] === "l" ? 1 : 0)) % q.length], s: 1}; n++; }
    });
  });
  planSave(p); return n;
}
function groceryItems() {
  var days = weekDays(st.wk || 0), p = planAll(), out = [], seen = {}, noList = [], tk = dkey(new Date());
  days.forEach(function (d) { var k = dkey(d); if (k < tk) return; SLOTS.forEach(function (sl) { var e = (p[k] || {})[sl[0]]; if (!e) return;
    if (e.r) { var r = byId(D.recipes, e.r); if (!r) return; var ig = recipeIngs(r); if (!ig.length) { noList.push(r.name); return; }
      ig.forEach(function (x) { if (x.s !== "need") return; var c = catalogMatch(x.n), key = String(c ? (c.brand || c.name) : x.n).toLowerCase(); if (seen[key] || listState(c ? (c.brand || c.name) : x.n)) return; seen[key] = 1; out.push({name: x.n, note: "For " + r.name}); }); }
    else if (e.t) { var c2 = catalogMatch(e.t); if (c2) { var key2 = String(c2.brand || c2.name).toLowerCase(); if (!seen[key2] && !listState(c2.brand || c2.name)) { seen[key2] = 1; out.push({name: e.t, note: "For " + e.t}); } } }
  }); });
  return {items: out, noList: noList.filter(function (v, i, a) { return a.indexOf(v) === i; })};
}
function planToday() { return ""; }

/* ---------- Ojazel's Recipe Book ---------- */
var RCATS = ["Dinners", "Quick", "Breakfast", "Trini Classics", "Weekend", "Sides", "Desserts", "Snacks"];
function arr(v, d) { return Array.isArray(v) ? v : safeParse(v, d || []); }
function rLoves(r) { return arr(r.loves); }
function rPhotos(r) { return arr(r.photos); }
function rCat(r) { if (r.cat) return r.cat; return /pancake|waffle|egg|breakfast|oatmeal|french toast/i.test(r.name) ? "Breakfast" : /hot ?dog|burger|nugget|sandwich/i.test(r.name) ? "Quick" : "Dinners"; }
function rTime(r) { var t = (Number(r.prep) || 0) + (Number(r.cook) || 0); return t ? t + " min" : ""; }
function rec() {
  var q = st.rq || "", ml = meals(), cat = st.rcat || "All";
  var all = D.recipes.slice(), bang = all.slice().sort(function (a, b) { return rLoves(b).length - rLoves(a).length || (ml[b.id] || 0) - (ml[a.id] || 0); }).slice(0, 6);
  var loved = bang.some(function (r) { return rLoves(r).length; });
  var cats = ["All"].concat(RCATS.filter(function (c) { return all.some(function (r) { return rCat(r) === c; }); }));
  var h = '<div class="top"><div class="grow"><small>Pierre Family Kitchen</small><h1>Ojazel&rsquo;s Recipe Book</h1></div><button class="iconbtn" data-act="tab" data-v="plan" aria-label="Meal calendar">' + ic("cal", "") + '</button><button class="iconbtn" data-act="addrec" aria-label="Add a recipe">' + ic("plus", "") + "</button></div>" +
    '<div class="search">' + ic("search", "") + '<input type="text" id="rq" placeholder="Search ' + all.length + ' recipes" autocomplete="off" aria-label="Search recipes" value="' + esc(q) + '"></div><div id="rbody">' + recBody() + "</div>";
  return h;
}
function recBody() {
  var q = (st.rq || "").toLowerCase().trim(), ml = meals(), cat = st.rcat || "All", all = D.recipes.slice(), h = "";
  if (!q) {
    var bang = all.slice().sort(function (a, b) { return rLoves(b).length - rLoves(a).length || (ml[b.id] || 0) - (ml[a.id] || 0); }).slice(0, 6), loved = bang.some(function (r) { return rLoves(r).length; });
    if (bang.length) h += '<div class="h2">Bangers <span class="sub">' + (loved ? "most-loved in the house" : "tap Love it on a recipe to rank them here") + '</span></div><div class="shelf">' + bang.map(function (r) { var n = rLoves(r).length; return '<button class="bcard" data-act="recipe" data-id="' + esc(r.id) + '" style="background-image:url(' + esc(recImg(r)) + ')"><span class="t"><b>' + esc(r.name) + "</b><span>" + (n ? HEART + " " + n + " love it" : esc(rCat(r))) + "</span></span></button>"; }).join("") + "</div>";
  }
  var cats = ["All"].concat(RCATS.filter(function (c) { return all.some(function (r) { return rCat(r) === c; }); }));
  var list = all.filter(function (r) { return (cat === "All" || rCat(r) === cat) && (!q || (r.name + " " + rCat(r) + " " + arr(r.ings).map(function (i) { return i.n; }).join(" ")).toLowerCase().indexOf(q) > -1); });
  h += '<div class="h2">' + (q ? "Results" : "All recipes") + '</div><div class="cats">' + cats.map(function (c) { return '<button data-act="rcat" data-v="' + esc(c) + '" aria-pressed="' + (cat === c) + '">' + esc(c) + "</button>"; }).join("") + "</div>";
  h += list.length ? '<div class="grid2">' + list.map(function (r) { var ig = recipeIngs(r), n = ig.filter(function (x) { return x.s === "need"; }).length; return '<button class="rcard" data-act="recipe" data-id="' + esc(r.id) + '"><div class="pic" style="background-image:url(' + esc(recImg(r)) + ')" role="img" aria-label="' + esc(r.name) + '"></div><div class="nm">' + esc(r.name) + '<div class="sub">' + [r.link ? "video" : "", rTime(r), ig.length ? (n ? n + " to buy" : "have it all") : (r.kind === "suggested" ? "suggested by " + esc(r.addedBy || "family") : "")].filter(Boolean).join(" &middot; ") + "</div></div></button>"; }).join("") + "</div>" : '<p class="empty">No recipes match.</p>';
  if (!q) h += '<div class="h2" style="margin-top:22px">Also in the kitchen</div><button class="ckb" data-act="tab" data-v="coffee" style="background-image:url(img/coffee.jpg)"><span class="t"><small>Kayley&rsquo;s drinks</small><b>Coffee Korner</b><span>' + D.coffee.length + " drink" + (D.coffee.length === 1 ? "" : "s") + " &middot; supplies</span></span></button>";
  return h;
}
var HEART = '<svg class="heart" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.3 3 4.5 6.7 4.5c2.2 0 3.6 1.3 5.3 3.2 1.7-1.9 3.1-3.2 5.3-3.2 3.7 0 5.8 3.8 4.3 7.3C19.5 16.4 12 21 12 21z"/></svg>';
function scaleQ(q, f) {
  if (!q || f === 1) return q;
  return String(q).replace(/^(\d+(?:\.\d+)?)(?:\s*(?:-|to)\s*(\d+(?:\.\d+)?))?(?:\s+(\d)\/(\d))?|^(\d)\/(\d)/, function (m, a, b, n1, d1, n2, d2) {
    var v = a ? Number(a) + (n1 ? Number(n1) / Number(d1) : 0) : Number(n2) / Number(d2);
    var fmt = function (x) { x = Math.round(x * f * 4) / 4; var w = Math.floor(x), fr = x - w, s = fr === 0.25 ? "1/4" : fr === 0.5 ? "1/2" : fr === 0.75 ? "3/4" : ""; return (w ? String(w) : "") + (w && s ? " " : "") + (s || (w ? "" : "0")); };
    return fmt(v) + (b ? " to " + fmt(Number(b)) : "");
  });
}
function rdetail() {
  var r = byId(D.recipes, st.rid); if (!r) { st.tab = "recipes"; return rec(); }
  var base = Number(r.serves) || 8, sv = st.rsv || base, f = sv / base, ig = recipeIngs(r), need = ig.filter(function (x) { return x.s === "need"; }), steps = arr(r.steps), notes = arr(r.notes), photos = rPhotos(r), loves = rLoves(r), mine = loves.indexOf(me.name) > -1, ml = meals();
  var tag = {have: '<span class="chip ok">Have</span>', check: '<span class="chip info">Check</span>', need: '<span class="chip warn">Need</span>'};
  var h = '<div class="rd"><div class="rhero" style="background-image:url(' + esc(recImg(r)) + ')"><button class="back" data-act="rback" aria-label="Back">' + ic("back", "") + "</button><span>" + esc(rCat(r)) + "</span></div>" +
    "<h1>" + esc(r.name) + "</h1>" + (r.note ? '<div class="sub">' + esc(r.note) + "</div>" : "") +
    (r.link ? '<a class="big alt watch" href="' + esc(safeLink(r.link)) + '" target="_blank" rel="noopener">' + ic("play", "") + " Watch the video on " + esc(linkSite(r.link)) + "</a>" + (canPlan() ? '<button class="linkbtn" data-act="rlink" style="display:block;margin:0 auto">Change the video link</button>' : "") : (canPlan() ? '<button class="linkbtn" data-act="rlink" style="padding-left:0">+ Add a video link</button>' : "")) +
    '<div class="row" style="margin-top:8px"><div class="avs">' + loves.map(avatar).join("") + '</div><div class="sub grow">' + (loves.length ? loves.length + " love it" : "Be the first to love it") + '</div><button class="btn sm ' + (mine ? "" : "ghost") + '" data-act="love" aria-pressed="' + mine + '">' + (mine ? "Loved" : "Love it") + "</button></div>" +
    '<div class="facts"><div class="fact"><small>Prep</small><b>' + (Number(r.prep) ? r.prep + " min" : "&ndash;") + '</b></div><div class="fact"><small>Cook</small><b>' + (Number(r.cook) ? r.cook + " min" : "&ndash;") + '</b></div><div class="fact"><small>Feeds</small><b>' + sv + '</b><div class="scale">' + [4, 8, 12].map(function (n) { return '<button data-act="rsv" data-v="' + n + '" aria-pressed="' + (sv === n) + '">' + n + "</button>"; }).join("") + "</div></div></div>";
  h += '<div class="card"><h3>Ingredients</h3>' + (ig.length ? ig.map(function (x) { var c = catalogMatch(x.n); return '<div class="ing"><span class="q">' + esc(scaleQ(x.q, f)) + '</span><span class="grow">' + esc(x.n) + (c ? '<span class="u">Usually ' + esc(c.brand || c.name) + "</span>" : "") + "</span>" + tag[x.s] + "</div>"; }).join("") +
    (need.length ? '<button class="big" data-act="addneed" data-id="' + esc(r.id) + '">Add ' + need.length + " missing to " + esc(st.store) + " Needs</button>" : '<p class="sub" style="margin:8px 0 0">We have everything.</p>') : '<p class="sub">No ingredient list yet. Snap the recipe in Ask Lia and she fills it in.</p>') + "</div>";
  if (steps.length) h += '<div class="card"><h3>Steps</h3><ol class="steps">' + steps.map(function (s) { return "<li><span>" + esc(s) + "</span></li>"; }).join("") + "</ol></div>";
  h += '<div class="card"><div class="row"><h3 class="grow">Family notes</h3><button class="btn sm ghost" data-act="addnote">Add a note</button></div>' + (notes.length ? notes.map(function (n) { return '<div class="note"><b>' + esc(n.by || "Family") + "</b>" + esc(n.t || "") + "</div>"; }).join("") : '<p class="sub" style="margin:8px 0 0">Tips like &ldquo;less spicy for the kids&rdquo; go here.</p>') + "</div>";
  h += '<div class="card"><h3>When we made it</h3><div class="gal">' + photos.map(function (p) { return '<div style="background-image:url(' + esc(imgSrc(p.u, "")) + ')"><small>' + esc(p.by || "") + (p.d ? (p.by ? " &middot; " : "") + esc(fmtDay(kdate(p.d).getTime())) : "") + "</small></div>"; }).join("") + '<button data-act="rphoto">' + ic("cam", "") + "Add our photo</button></div>" + '<div class="sub">' + (ml[r.id] ? "Last made " + esc(fmtDay(kdate(ml[r.id]).getTime())) : "Not made yet") + "</div></div>";
  h += '<div class="sticky">' + (canPlan() ? '<button class="big" data-act="planit">Put on the calendar</button>' : '<button class="big" data-act="vote" data-id="' + esc(r.id) + '">Vote for tonight</button>') + "</div>" + (canPlan() ? '<button class="linkbtn rdel" data-act="rdel">Remove this recipe</button>' : "") + "</div>";
  return h;
}

/* ---------- Coffee Korner (Kayley's drinks; Oji adds and edits, everyone sees and rates) ---------- */
var SUPDEF = ["Ground coffee", "Coffee mate Italian Sweet Creme", "International Delight Sweet & Creamy", "Sugar In The Raw", "Parrot Evaporated Milk", "Cups and lids"];
function supList() { var r = byId(D.settings, "coffeesup"); return r ? safeParse(r.value, []) : SUPDEF.map(function (n) { return {n: n, s: "ok"}; }); }
function supSave(l) { put("settings", "coffeesup", {value: JSON.stringify(l)}); }
var SCHIP = {ok: '<span class="chip ok">Have</span>', low: '<span class="chip warn">Low</span>', out: '<span class="chip out">Out</span>'};
function supFor(n) { var t = String(n || "").toLowerCase(), hit = null; supList().forEach(function (s) { var w = s.n.toLowerCase().split(/\s+/).filter(function (x) { return x.length > 3; }); if (!hit && w.some(function (x) { return t.indexOf(x) > -1; })) hit = s; }); return hit; }
function stars(c) { var o = c.stars && typeof c.stars === "object" && !Array.isArray(c.stars) ? c.stars : safeParse(c.stars, {}); return o || {}; }
function avgStars(c) { var o = stars(c), v = Object.keys(o).map(function (k) { return Number(o[k]) || 0; }).filter(Boolean); return v.length ? v.reduce(function (a, b) { return a + b; }, 0) / v.length : 0; }
function cupPic(h, u) { var src = u ? imgSrc(u, "") : ""; return src ? '<div class="pic" style="height:' + h + 'px;background-image:url(' + esc(src) + ')"></div>' : '<div class="cup" style="height:' + h + 'px">' + ic("cup", "") + "</div>"; }
function coffee() {
  var sl = supList(), low = sl.filter(function (x) { return x.s !== "ok"; }).length, cs = D.coffee.slice().sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); });
  var h = '<button class="ckb hero2" data-act="tab" data-v="recipes" style="background-image:url(img/coffee.jpg)" aria-label="Back to recipes"><span class="t"><small>Kayley&rsquo;s drinks</small><b>Coffee Korner</b><span>' + cs.length + " drink" + (cs.length === 1 ? "" : "s") + " &middot; " + (low ? low + " supplies low or out" : "supplies stocked") + "</span></span></button>" +
    '<button class="linkbtn" data-act="tab" data-v="recipes" style="padding-left:0">Back to Recipes</button>';
  if (isOji()) h += '<button class="big" data-act="ckcam">' + ic("cam", "") + ' Snap a new drink</button><button class="linkbtn" data-act="cktype" style="display:block;margin:2px auto 0">Or type Kayley&rsquo;s notes</button><div class="sub" style="text-align:center">Lia writes it up as a recipe here.</div>';
  h += '<div class="h2">Drinks</div>' + (cs.length ? '<div class="grid2">' + cs.map(function (c) { var a = avgStars(c); return '<button class="rcard" data-act="drink" data-id="' + esc(c.id) + '">' + cupPic(110, c.photo) + '<div class="nm">' + esc(c.name) + '<div class="sub">' + [esc(c.tag || ""), esc(c.ver || "v1"), a ? a.toFixed(1) + " stars" : ""].filter(Boolean).join(" &middot; ") + "</div></div></button>"; }).join("") + "</div>" : '<p class="empty">No drinks yet.' + (isOji() ? " Snap Kayley&rsquo;s first one." : "") + "</p>");
  h += '<div class="card"><div class="row"><h3 class="grow">Coffee supplies</h3><span class="sub">tap to change</span></div>' + sl.map(function (x, i) { return '<div class="ing"><span class="grow">' + esc(x.n) + '</span><button class="plain" data-act="supc" data-v="' + i + '" aria-label="' + esc(x.n) + ', tap to change">' + SCHIP[x.s || "ok"] + "</button></div>"; }).join("") +
    (low ? '<button class="big" data-act="suplist">Add ' + low + " low or out to Stop &amp; Shop Needs</button>" : '<p class="sub" style="margin:8px 0 0">All stocked.</p>') + (isOji() ? '<button class="linkbtn" data-act="supadd" style="display:block;margin:6px auto 0">Add a supply</button>' : "") + "</div>";
  return h;
}
function drink() {
  var c = byId(D.coffee, st.ck); if (!c) { st.tab = "coffee"; return coffee(); }
  var ings = arr(c.ings), steps = arr(c.steps), tw = arr(c.tweaks), mine = Number(stars(c)[me.name]) || 0, a = avgStars(c), nr = Object.keys(stars(c)).length;
  var h = '<div class="rd"><div class="dhero">' + cupPic(240, c.photo) + '<button class="back" data-act="tab" data-v="coffee" aria-label="Back">' + ic("back", "") + "</button></div>" +
    "<h1>" + esc(c.name) + '</h1><div class="sub">' + [esc(c.tag || ""), "version " + esc(String(c.ver || "v1").replace(/^v/, "")), "made by Kayley"].filter(Boolean).join(" &middot; ") + "</div>" +
    '<div class="card"><div class="row"><div class="grow"><h3>Rate it</h3><div class="sub">' + (nr ? a.toFixed(1) + " from " + nr + " rating" + (nr === 1 ? "" : "s") : "No ratings yet") + '</div></div><div class="stars">' + [1, 2, 3, 4, 5].map(function (n) { return '<button data-act="star" data-v="' + n + '" class="' + (n <= mine ? "on" : "") + '" aria-label="' + n + ' stars">&#9733;</button>'; }).join("") + "</div></div></div>" +
    '<div class="card"><h3>What goes in</h3>' + (ings.length ? ings.map(function (x) { var s = supFor(x.n), cm = catalogMatch(x.n); return '<div class="ing"><span class="q">' + esc(x.q || "") + '</span><span class="grow">' + esc(x.n) + (cm ? '<span class="u">Usually ' + esc(cm.brand || cm.name) + "</span>" : "") + "</span>" + (s ? SCHIP[s.s || "ok"] : "") + "</div>"; }).join("") : '<p class="sub">No ingredients yet.</p>') + "</div>" +
    (steps.length ? '<div class="card"><h3>How Kayley makes it</h3><ol class="steps">' + steps.map(function (s) { return "<li><span>" + esc(s) + "</span></li>"; }).join("") + "</ol></div>" : "") +
    (tw.length ? '<div class="card"><h3>Kayley&rsquo;s tweaks</h3>' + tw.map(function (t) { return '<div class="tw"><b>' + esc(t.v || "") + "</b>" + esc(t.t || "") + "</div>"; }).join("") + "</div>" : "") +
    (c.note ? '<p class="sub">' + esc(c.note) + "</p>" : "") +
    (isOji() ? '<div class="sticky"><button class="big" data-act="ckphoto">' + ic("cam", "") + ' Add a photo</button><button class="big alt" data-act="tweak">New version</button></div><button class="linkbtn" data-act="ckdel" style="display:block;margin:4px auto">Remove this drink</button>' : "") + "</div>";
  return h;
}

/* ---------- camera: shrink on the phone, then save to the family photos folder ---------- */
var camCb = null;
/* lib = true: the phone asks Take Photo or Photo Library (screenshots); otherwise it opens the camera. */
function camera(cb, lib) {
  camCb = cb; var inp = $("camin");
  if (!inp) { inp = document.createElement("input"); inp.type = "file"; inp.accept = "image/*"; inp.id = "camin"; inp.hidden = true; document.body.appendChild(inp);
    inp.addEventListener("change", function () { var f = inp.files && inp.files[0]; inp.value = ""; if (!f || !camCb) return; var cbk = camCb; camCb = null; shrink(f, 1600, 0.82).then(cbk, function () { toast("Could not read that photo. Try another."); }); }); }
  if (lib) inp.removeAttribute("capture"); else inp.setAttribute("capture", "environment");
  inp.click();
}
function shrink(file, max, q) {
  return new Promise(function (ok, bad) {
    var url = URL.createObjectURL(file), im = new Image();
    im.onload = function () { var w = im.naturalWidth, h = im.naturalHeight, s = Math.min(1, max / Math.max(w, h)), c = document.createElement("canvas"); c.width = Math.round(w * s); c.height = Math.round(h * s); c.getContext("2d").drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(url); ok(c.toDataURL("image/jpeg", q)); };
    im.onerror = function () { URL.revokeObjectURL(url); bad(new Error("img")); };
    im.src = url;
  });
}
function shrinkUrl(u, max, q) { return fetch(u).then(function (r) { return r.blob(); }).then(function (b) { return shrink(b, max, q); }); }
function upload(data, kind) {
  return shrinkUrl(data, 1000, 0.72).then(function (small) {
    return call({action: "photo", data: small, kind: kind, who: me.name || ""}).then(function (r) { if (!r.ok) throw new Error(r.error || "upload_failed"); IMGC[r.url] = small; return r.url; });
  });
}
/* Photos live inside the family sheet as "pfkimg:<id>"; fetched once, then kept in the phone's cache. */
var IMGC = {}, imgPend = {}, imgTimer = null;
function imgSrc(u, fb) { u = String(u || ""); if (u.indexOf("pfkimg:") !== 0) return u || (fb == null ? "img/meals.jpg" : fb); if (IMGC[u]) return IMGC[u]; loadImg(u); return fb == null ? "img/meals.jpg" : fb; }
function loadImg(u) {
  if (imgPend[u]) return; imgPend[u] = 1;
  var key = "https://pfk.local/img/" + u.slice(7);
  var fromCache = window.caches ? caches.open("pfk-img").then(function (c) { return c.match(key); }).then(function (r) { return r ? r.text() : null; }).catch(function () { return null; }) : Promise.resolve(null);
  fromCache.then(function (t) {
    if (t) return t;
    return call({action: "img", pid: u}).then(function (r) { if (!r.ok || !r.data) throw new Error(r.error || "img"); if (window.caches) caches.open("pfk-img").then(function (c) { return c.put(key, new Response(r.data)); }).catch(function () {}); return r.data; });
  }).then(function (t) { IMGC[u] = t; clearTimeout(imgTimer); imgTimer = setTimeout(function () { lastJSON = ""; render(); }, 150); }, function () { setTimeout(function () { delete imgPend[u]; }, 60000); });
}
function errMsg(e) { var m = e && e.message || ""; return m === "unknown_action" ? "The kitchen sheet needs its update first (Code.gs 1.2.0)." : m === "daily_limit" ? "Lia hit her limit for today." : m === "not_a_recipe" ? "Lia could not find a recipe in that." : "Something went wrong (" + m + "). Try again."; }
function liaRead(opts) {
  return call({action: "liarecipe", image: opts.image || "", text: opts.text || "", mode: opts.mode || "recipe", who: me.name || ""}).then(function (r) { if (!r.ok) throw new Error(r.error || "lia_failed"); return r.recipe; });
}
function cleanRecipe(o) {
  var cat = RCATS.indexOf(o.cat) > -1 ? o.cat : "Dinners";
  return {name: String(o.name || "New recipe").slice(0, 80), cat: cat, prep: Number(o.prep) || 0, cook: Number(o.cook) || 0, serves: Number(o.serves) || 8,
    ings: arr(o.ings).slice(0, 40).map(function (i) { return {n: String(i.n || "").slice(0, 80), q: String(i.q || "").slice(0, 30)}; }).filter(function (i) { return i.n; }),
    steps: arr(o.steps).slice(0, 15).map(function (s) { return String(s).slice(0, 300); }), note: String(o.note || "").slice(0, 300)};
}
function recipePreview(o, src) {
  st.draft = o;
  return '<h3 id="shT">' + esc(o.name) + '</h3><div class="sub">' + [esc(o.cat), o.prep + o.cook ? (o.prep + o.cook) + " min" : "", "feeds " + o.serves].filter(Boolean).join(" &middot; ") + "</div>" + (o.note ? '<p class="sub">' + esc(o.note) + "</p>" : "") +
    '<div style="margin:8px 0">' + o.ings.map(function (i) { return '<div class="ing"><span class="q">' + esc(i.q) + '</span><span class="grow">' + esc(i.n) + "</span></div>"; }).join("") + "</div>" +
    (o.steps.length ? '<ol class="steps">' + o.steps.map(function (s) { return "<li><span>" + esc(s) + "</span></li>"; }).join("") + "</ol>" : "") +
    '<label class="sub" for="dlink" style="display:block;margin-top:10px">Video link (optional): Facebook, YouTube, Instagram, TikTok</label><input type="url" id="dlink" inputmode="url" autocomplete="off" placeholder="Paste the video link" value="' + esc(st.draftLink || "") + '">' +
    '<button class="big" data-act="draftsave">Save to Ojazel&rsquo;s Recipe Book</button>' + (canPlan() ? '<button class="big alt" data-act="draftplan">Save and put on the calendar</button>' : "") + '<button class="linkbtn" data-act="close" style="display:block;margin:6px auto 0">Not this one</button>';
}
function saveDraft() {
  var o = st.draft; if (!o) return null; st.draft = null;
  var le = $("dlink"), link = safeLink(le ? le.value : (st.draftLink || "")); st.draftLink = "";
  return put("recipes", null, {link: link, name: o.name, cat: o.cat, prep: o.prep, cook: o.cook, serves: o.serves, ings: o.ings, steps: o.steps, note: o.note, img: "", addedBy: me.name || "", kind: "banger", loves: [], notes: [], photos: []});
}
function safeLink(u) { u = String(u || "").trim(); var m = u.match(/https?:\/\/[^\s<>"']+/i); return m ? m[0] : ""; }
function linkSite(u) { var h = (String(u).match(/^https?:\/\/([^\/?#]+)/i) || [])[1] || ""; h = h.replace(/^(www|m|web)\./i, "").toLowerCase(); return /facebook|fb\.watch|fb\.com/.test(h) ? "Facebook" : /youtu/.test(h) ? "YouTube" : /instagram/.test(h) ? "Instagram" : /tiktok/.test(h) ? "TikTok" : h || "the web"; }
function snapRecipe(mode) {
  st.draftLink = "";
  camera(function (data) {
    sheet('<h3 id="shT">Lia is reading it</h3><div class="readwrap"><img src="' + data + '" alt="Your photo"><p class="sub"><span class="dots">...</span> This takes about 15 seconds.</p></div>', true);
    liaRead({image: data, mode: "recipe"}).then(function (o) { closeSheet(true); sheet(recipePreview(cleanRecipe(o))); }, function (e) { closeSheet(true); sheet('<h3 id="shT">Hmm</h3><p>' + esc(errMsg(e)) + '</p><button class="big" data-act="addrec">Try again</button><button class="linkbtn" data-act="close">Close</button>'); });
  }, true);
}
function planPick() {
  st.wk = st.wk || 0; var keep = st.pday;
  sheet('<h3 id="shT">Put on the calendar</h3><div class="sub">Pick a night</div><div class="seg2" role="group"><button data-act="pwk" data-v="0" aria-pressed="' + (!st.wk) + '">' + weekRange(0) + '</button><button data-act="pwk" data-v="1" aria-pressed="' + (st.wk === 1) + '">' + weekRange(1) + "</button></div>" + weekStrip(-1, "pnight") + '<button class="linkbtn" data-act="close" style="display:block;margin:6px auto 0">Cancel</button>');
  st.pday = keep;
}

function dueItems() {
  var now = Date.now(), out = [];
  D.catalog.forEach(function (c) {
    var lb = Number(c.lastBought) || 0, q = Number(c.timesBought) || 0; if (!lb || q < 2) return;
    var gap = 180 / q, since = (now - lb) / 864e5; if (since < gap * 0.9 || since > 170) return;
    if (listState(c.brand || c.name)) return;
    out.push({c: c, over: since / gap, since: Math.round(since), gap: Math.round(gap)});
  });
  return out.sort(function (a, b) { return b.over - a.over; }).slice(0, 5);
}
function restockHtml() {
  var r = dueItems(); if (!r.length) return "";
  return '<div class="card"><h3>Time to restock?</h3><p class="sub" style="margin:6px 0 4px">Based on how often you usually buy these.</p>' + r.map(function (x) { var c = x.c; return '<div class="deal"><div class="grow"><b>' + esc(c.brand || c.name) + '</b><div class="sub">' + esc("Last bought " + fmtDay(c.lastBought) + " \u00b7 about every " + x.gap + " days") + '</div></div><button class="btn sm" data-act="pickcat" data-id="' + esc(c.id) + '" data-in="ask">Add</button></div>'; }).join("") + "</div>";
}
function home() {
  var n = needsFor(st.store).length, w = queuedFor(st.store).length, c = cartFor(st.store).length + w;
  return dayHero() +
    '<div class="qa"><input type="text" id="ask" placeholder="Add to the Needs list" aria-label="Add to the Needs list" autocomplete="off" enterkeyhint="send"><button class="btn sm addb" data-act="send" hidden>Add</button><button class="mic2" data-act="mic" aria-label="Tap to talk">' + ic("mic", "") + '</button></div><div class="sugg" id="sugg"></div><div class="qahint">Type it, or tap the mic and say &ldquo;add bacon to Stop &amp; Shop&rdquo;</div>' +
    '<div class="counts"><button class="cnt" data-act="goshop" data-v="needs"><span class="n">' + n + '</span><span class="l">On the Needs list</span><span class="s">Waiting to be moved to the cart</span></button>' +
    '<button class="cnt c2" data-act="goshop" data-v="cart"><span class="n">' + c + '</span><span class="l">In the cart</span><span class="s">' + (w ? w + " waiting to push" : "All synced with Stop &amp; Shop") + "</span></button></div>" +
    weekCard() + pushBar() + toolBtns(true) +
    '<button class="sc" data-act="tab" data-v="cook" style="width:100%;margin-bottom:14px"><span class="face"><img src="img/lia/f.png" alt=""></span><span><b>Ask Lia</b><small>What can we cook tonight?</small></span></button>' +
    voteMini() + alertHtml() + budgetHtml() + adviceHtml() + dealsHtml(3) + restockHtml() +
    '<div class="homelinks"><button class="linkbtn" data-act="recap">Our Store recap</button><button class="linkbtn" data-act="family">Usual brands and family preferences</button>' + (standalone() ? "" : '<button class="linkbtn" data-act="showinstall">Install this as an app on your phone</button>') + "</div>";
}
function shop() {
  var ss = st.store === "Stop & Shop", nd = needsFor(st.store), qd = queuedFor(st.store), cd = cartFor(st.store), od = orderedFor(st.store), v = st.shopView === "cart" ? "cart" : "needs";
  var seg = '<div class="seg2" role="group"><button data-act="shopview" data-v="needs" aria-pressed="' + (v === "needs") + '">Needs<b>' + nd.length + '</b></button><button data-act="shopview" data-v="cart" aria-pressed="' + (v === "cart") + '">Cart<b>' + (qd.length + cd.length) + "</b></button></div>";
  if (v === "needs") {
    return pageTop("Shop", "Needs list &middot; " + esc(st.store)) + seg + storeSeg() + toolBtns() +
      '<div class="card"><b>Add to Needs</b><div class="sub">Start typing and your usual items appear.</div><div class="ask" style="margin-top:8px"><div class="grow"><input type="text" id="ask2" placeholder="e.g. syrup" aria-label="Item" autocomplete="off" enterkeyhint="send"></div><button class="btn" data-act="send2">Add</button></div><div class="sugg" id="sugg2"></div><button class="big alt" data-act="atstore" style="margin-top:10px">I&rsquo;m at the store</button><button class="linkbtn" data-act="mystore" style="margin-top:6px">Manage Our Store (' + D.catalog.length + ' items)</button></div>' +
      '<div class="card"><div class="row"><h3 class="grow">Needs</h3><span class="sub">Holding list</span></div>' + (nd.length ? nd.map(needRow).join("") + '<button class="big" data-act="addall">Add all to cart (' + nd.length + ")</button>" : '<p class="empty">Nothing waiting. Add something above.</p>') + "</div>" +
      dealsHtml(6) + '<p class="sub">Moving an item to the cart does not buy anything. It waits there until someone taps Push.</p>';
  }
  var o = pushInfo(), sub = subtotalOf(o.t);
  return pageTop("Shop", "Cart &middot; " + esc(st.store)) + seg + storeSeg() + toolBtns() +
    '<div class="card"><div class="row"><h3 class="grow">' + (ss ? "Your Stop &amp; Shop cart" : "Your " + esc(st.store) + " list") + "</h3>" + (ss && o.s === "done" ? '<span class="chip ok">Updated</span>' : "") + "</div>" +
    (qd.length ? '<div class="sechead"><h4>Waiting to push</h4><span class="sub">' + qd.length + " item" + (qd.length === 1 ? "" : "s") + "</span></div>" + qd.map(function (i) { return cartRow(i, true); }).join("") : "") +
    '<div class="sechead"><h4>In the cart now</h4><span class="sub">' + cd.length + " item" + (cd.length === 1 ? "" : "s") + "</span></div>" + (cd.length ? cd.map(function (i) { return cartRow(i, false); }).join("") : '<p class="empty">Nothing in the cart yet.</p>') +
    (ss && sub ? '<div class="subtot"><span>Cart subtotal</span><span>$' + esc(sub) + "</span></div>" : "") + "</div>" +
    '<div class="cartbtns">' + (ss ? '<button class="pushbig" data-act="push">' + ic("up", "") + "<span>" + (qd.length ? "Push " + qd.length + " item" + (qd.length === 1 ? "" : "s") + " to cart" : "Cart is up to date") + "</span></button>" : "") +
    '<a href="' + esc(cartUrl[st.store]) + '" target="_blank" rel="noopener" style="text-decoration:none"><button class="big alt" type="button" style="margin:0">Open ' + esc(st.store) + "</button></a>" +
    (cd.length ? '<button class="linkbtn" data-act="iplaced">I placed this order</button>' : "") + "</div>" +
    (od.length ? '<div class="card"><div class="sechead" style="margin-top:0"><h4>Ordered by you</h4><span class="sub">' + od.length + '</span></div>' + od.map(function (i) { return '<div class="item">' + thumb(i.cat, i.name) + '<div class="grow"><b>' + esc(i.name) + '</b><div class="sub">' + esc(i.size || "") + "</div></div></div>"; }).join("") + '<button class="big alt" data-act="clearordered">Clear ordered items</button></div>' : "") +
    '<p class="sub" style="margin-top:12px">The app only fills the cart. Ifoma picks the pickup time and places every order.</p>';
}
function nameSheet(id) {
  var i = byId(D.list, id); if (!i) return;
  sheet('<h3 id="shT">Name a product once</h3><p class="sub">What should the cart get for <b>' + esc(i.name) + '</b>? Type the brand and size. The app remembers it, so next time it goes straight through.</p><input type="text" id="prodIn" placeholder="e.g. Goya Long Grain Rice 5 lb" autocomplete="off" aria-label="Product"><button class="big" data-act="namesave" data-id="' + esc(id) + '">Save and move to cart</button><button class="linkbtn" data-act="close" style="display:block;margin:6px auto 0">Cancel</button>');
  setTimeout(function () { var p = $("prodIn"); if (p) p.focus(); }, 60);
}
function startMic(target, after) {
  target = target || "ask"; var SR = window.SpeechRecognition || window.webkitSpeechRecognition, q = $(target);
  if (!SR) { if (q) q.focus(); toast("Tap the microphone on your keyboard to talk."); return; }
  try {
    var r = new SR(); r.lang = "en-US"; r.interimResults = false;
    r.onresult = function (e) { var t = e.results[0][0].transcript; var q2 = $(target); if (q2) { q2.value = t; if (after !== null) { showSugg("ask", t); toggleAdd(); } else q2.focus(); } };
    r.onerror = function () { toast("Could not hear that. Tap the mic on your keyboard instead."); var q3 = $(target); if (q3) q3.focus(); };
    r.start(); toast("Listening...");
  } catch (x) { if (q) q.focus(); toast("Tap the microphone on your keyboard to talk."); }
}
function toggleAdd() { var q = $("ask"), b = document.querySelector(".addb"); if (q && b) b.hidden = !q.value.trim(); }
function pan() {
  var h = pageTop("Pantry", "What we likely have") + '<div class="card"><h3>What can we make?</h3><p class="sub" style="margin:6px 0 10px">Recipes show what you have and what is missing, based on this list.</p><button class="btn" data-act="tab" data-v="recipes">See ideas</button> <button class="btn ghost" data-act="addpantry">Add to pantry</button></div>';
  ["Fridge", "Pantry", "Freezer"].forEach(function (z) {
    var its = D.pantry.filter(function (p) { return p.zone === z; });
    h += '<div class="banner-img" style="background-image:url(' + banners[z] + ')" role="img" aria-label="' + z + '"><span>' + z + '</span></div><div class="card" style="margin-top:0">' +
      (its.length ? its.map(function (p) { var cls = p.status === "ok" ? "ok" : p.status === "unconfirmed" ? "info" : "warn", txt = {ok: "OK", low: "Low", out: "Out", unconfirmed: "Check"}[p.status] || "Check";
        return '<div class="ing">' + (imgFor(p.name) ? thumb("pantry", p.name) : "") + '<div class="grow"><b>' + esc(p.name) + '</b><div class="sub">' + esc([p.size, p.note].filter(Boolean).join(" · ")) + "</div></div>" +
          ((p.status === "low" || p.status === "out") ? '<button class="btn sm" data-act="pantrylist" data-id="' + esc(p.id) + '">+ List</button>' : "") +
          '<button class="chip ' + cls + '" data-act="pcycle" data-id="' + esc(p.id) + '" aria-label="' + esc(p.name) + " status " + txt + ', tap to change">' + txt + "</button></div>"; }).join("") : '<p class="empty">Nothing here yet.</p>') + "</div>";
  });
  return h + '<p class="sub">&ldquo;Check&rdquo; means estimated from recent orders. Tap to confirm, then Low or Out as things run down. When you mark an order as placed, those items land here as OK.</p>';
}
var views = {home: home, shop: shop, cook: cook, pantry: pan, recipes: rec, plan: plan, rdetail: rdetail, coffee: coffee, drink: drink};
var tabs = [["home", "Home", "home"], ["shop", "Shop", "cart"], ["plan", "Calendar", "cal"], ["pantry", "Pantry", "pantry"], ["recipes", "Recipes", "book"]];
function navTab() { var t = st.tab; if (t === "cook") return "home"; if (t === "rdetail") return st.rfrom === "plan" ? "plan" : st.rfrom === "home" ? "home" : "recipes"; if (t === "coffee" || t === "drink") return "recipes"; return t; }
function render() {
  var a = document.activeElement, keep = a && a.id && /^(ask2?|liain|rq)$/.test(a.id) ? {id: a.id, v: a.value} : null, lk = $("liain"); if (!keep && lk && lk.value) keep = {id: "liain", v: lk.value, nf: 1};
  $("view").innerHTML = views[st.tab]();
  var qn = queuedFor("Stop & Shop").length;
  $("tabs").innerHTML = tabs.map(function (t) { return '<button class="tab" role="tab" style="position:relative" aria-selected="' + (navTab() === t[0]) + '" data-act="tab" data-v="' + t[0] + '">' + (t[0] === "shop" && qn ? '<span class="tbadge">' + qn + "</span>" : "") + ic(t[2]) + t[1] + "</button>"; }).join("");
  $("snap").hidden = st.tab !== "pantry";
  setStatus();
  if (keep) { var el = $(keep.id); if (el) { el.value = keep.v; if (!keep.nf) el.focus(); showSugg(keep.id, keep.v); } }
  toggleAdd();
}

/* ---------- gates: PIN and who-are-you ---------- */
function showPin(msg) { sheet('<h3 id="shT">Family PIN</h3><p class="sub">Enter the PIN you were given for Pierre Family Kitchen.</p><input type="text" id="pinIn" inputmode="numeric" autocomplete="off" placeholder="PIN" aria-label="PIN">' + (msg ? '<div class="err">' + esc(msg) + "</div>" : "") + '<button class="big" data-act="savepin">Open</button>', true); }
function showWho() {
  var names = D.members.map(function (m) { return m.name; }).filter(Boolean);
  sheet('<h3 id="shT">Who is using the app?</h3><p class="sub">Tap your name so we know who added things and who voted.</p><div class="who">' + names.map(function (n) { return '<button class="btn" data-act="iam" data-v="' + esc(n) + '">' + esc(n) + "</button>"; }).join("") + '</div><label class="sub" for="newName">Not here? Add your name</label><div class="ask" style="margin-top:6px"><div class="grow"><input type="text" id="newName" placeholder="Your name" autocomplete="off"></div><button class="btn" data-act="addme">Add</button></div>', true);
}
function setMe(n) { me.name = n; ls("pfk_name", n); closeSheet(true); render(); }

/* ---------- clicks ---------- */
document.addEventListener("click", function (e) {
  var el = e.target.closest("[data-act]"); if (!el) return; var a = el.getAttribute("data-act"), id = el.getAttribute("data-id"), i;
  if (a === "tab") { st.tab = el.getAttribute("data-v"); if (st.tab === "plan") { st.wk = 0; st.pday = null; } window.scrollTo(0, 0); closeSheet(); render(); }
  else if (a === "store") { st.store = el.getAttribute("data-v"); render(); }
  else if (a === "inc") { i = byId(D.list, id); if (i) put("list", id, {qty: (i.qty || 1) + 1}); }
  else if (a === "dec") { i = byId(D.list, id); if (i && (i.qty || 1) > 1) put("list", id, {qty: i.qty - 1}); }
  else if (a === "del") { del("list", id); }
  else if (a === "clearordered") { itemsFor(st.store).filter(function (x) { return x.status === "ordered"; }).forEach(function (x) { del("list", x.id); }); }
  else if (a === "typing") { st.typing = true; render(); var q = $("ask"); if (q) q.focus(); }
  else if (a === "send" || a === "send2") { var inp = $(a === "send" ? "ask" : "ask2"), v = inp ? inp.value.trim() : ""; if (!v) { toast("Type or dictate a request first."); return; }
    var p = a === "send" ? parseAdd(v) : {items: [v], store: st.store}; p.items.forEach(function (n) { addByName(n, p.store); }); st.store = p.store; inp.value = ""; render(); toast("Added " + p.items.join(", ") + " to " + p.store + "."); }
  else if (a === "mystore") { st.rmId = ""; st.sf = "all"; sheet('<h3 id="shT">Our Store</h3><p class="sub">Everything we buy. Oldest purchases first, so you can clear out what we no longer get.</p><input type="text" id="storeq" placeholder="Search Our Store" autocomplete="off" aria-label="Search Our Store"><div class="seg2" style="margin:8px 0"><button data-act="storefilter" data-v="all" aria-pressed="true">All</button><button data-act="storefilter" data-v="old" aria-pressed="false">Not bought in 5+ months</button><button data-act="storefilter" data-v="dups" aria-pressed="false">Possible duplicates</button></div><div id="storeList"></div><button class="linkbtn" data-act="close" style="display:block;margin:6px auto 0">Close</button>'); storeList(); }
  else if (a === "budget") { sheet('<h3 id="shT">Weekly budget</h3><p class="sub">Your running cart total shows against this on Home. Leave empty to turn it off.</p><input type="text" id="budIn" inputmode="decimal" placeholder="e.g. 250" value="' + (budgetVal() || "") + '" autocomplete="off" aria-label="Weekly budget"><button class="big" data-act="budsave">Save</button><button class="linkbtn" data-act="close" style="display:block;margin:6px auto 0">Cancel</button>'); }
  else if (a === "budsave") { var bi = $("budIn"), bv = bi ? parseFloat(bi.value.replace(/[^0-9.]/g, "")) : 0; put("settings", "budget", {value: String(bv > 0 ? bv : 0)}); closeSheet(true); toast(bv > 0 ? "Budget set to $" + bv.toFixed(0) + "." : "Budget turned off."); }
  else if (a === "wk") { st.wk = Number(el.getAttribute("data-v")) || 0; st.pday = null; render(); }
  else if (a === "pslot") { pickSheet(id); }
  else if (a === "ppick") { setSlot(st.pslot, {r: id}); closeSheet(true); render(); }
  else if (a === "pquick") { setSlot(st.pslot, {t: el.getAttribute("data-v")}); closeSheet(true); render(); }
  else if (a === "pfree") { var pt = $("pt"), pv = pt ? pt.value.trim() : ""; if (pv) { setSlot(st.pslot, {t: pv.charAt(0).toUpperCase() + pv.slice(1)}); closeSheet(true); render(); } }
  else if (a === "pclear") { setSlot(st.pslot, null); closeSheet(true); render(); }
  else if (a === "pok") { var psid = id || st.pslot, pe = (planAll()[psid.split("|")[0]] || {})[psid.split("|")[1]]; if (pe) { delete pe.s; setSlot(psid, pe); } closeSheet(true); render(); toast("Approved."); }
  else if (a === "pokall") { var pa = planAll(); Object.keys(pa).forEach(function (k) { Object.keys(pa[k]).forEach(function (sl) { if (pa[k][sl] && pa[k][sl].s) { delete pa[k][sl].s; pa[k][sl].by = me.name || ""; } }); }); planSave(pa); render(); toast("Approved."); }
  else if (a === "pclearwk") { var pw = planAll(); weekDays(st.wk || 0).forEach(function (d) { delete pw[dkey(d)]; }); planSave(pw); render(); toast("Week cleared."); }
  else if (a === "pauto") { var pn = planAuto(); render(); toast(pn ? "Lia filled " + pn + " spots. Tap any to swap." : "Nothing empty to fill."); }
  else if (a === "pmade") { var mm = meals(); mm[id] = today(); put("settings", "meallog", {value: JSON.stringify(mm)}); toast("Logged as made."); }
  else if (a === "pgroc") { var g = groceryItems(); sheet('<h3 id="shT">Groceries for the week</h3>' + (g.items.length ? '<p class="sub">Only what you are missing. Your usual brands are used where we know them.</p>' + g.items.map(function (x) { return '<div class="ing"><span>' + esc(x.name) + ' <span class="sub">' + esc(x.note) + "</span></span></div>"; }).join("") + '<button class="big" data-act="pgrocgo">Add ' + g.items.length + " to " + esc(st.store) + " Needs</button>" : '<p class="empty">Nothing missing. You already have what these meals need.</p>') + (g.noList.length ? '<p class="sub">No ingredient list yet for: ' + esc(g.noList.join(", ")) + ". Send Claude the recipe to fill it in.</p>" : "") + '<button class="linkbtn" data-act="close" style="display:block;margin:6px auto 0">Close</button>'); }
  else if (a === "pgrocgo") { var g2 = groceryItems(); g2.items.forEach(function (x) { addByName(x.name, st.store, x.note); }); closeSheet(true); toast("Added " + g2.items.length + " to Needs."); }
  else if (a === "atstore") { sheet(storeModeHtml()); }
  else if (a === "chk") { var ck = safeParse(ls("pfk_chk") || "{}", {}); if (ck[id]) delete ck[id]; else ck[id] = 1; ls("pfk_chk", JSON.stringify(ck)); $("sheetBody").innerHTML = storeModeHtml(); }
  else if (a === "chkreset") { ls("pfk_chk", "{}"); $("sheetBody").innerHTML = storeModeHtml(); }
  else if (a === "recap") { sheet(recapHtml()); }
  else if (a === "clip") { var cr = byId(D.settings, "coupons"), cl = cr ? safeParse(cr.value, []) : [], cc = cl[Number(id)]; if (cc) { cc.state = "want"; put("settings", "coupons", {value: JSON.stringify(cl)}); toast("Queued. Hazel's account gets it at the next weekly run."); } }
  else if (a === "storefilter") { st.sf = el.getAttribute("data-v"); document.querySelectorAll('[data-act="storefilter"]').forEach(function (b) { b.setAttribute("aria-pressed", String(b === el)); }); storeList(); }
  else if (a === "storemerge") { var pr = id.split("~"), keep = byId(D.catalog, pr[0]), drop = byId(D.catalog, pr[1]); if (keep && drop) { var tot = (Number(keep.timesBought) || 0) + (Number(drop.timesBought) || 0), lbm = Math.max(Number(keep.lastBought) || 0, Number(drop.lastBought) || 0); put("catalog", keep.id, {name: keep.name, brand: keep.brand || "", size: keep.size || "", cat: keep.cat || "", kw: keep.kw || "", store: keep.store || "Stop & Shop", lastBought: lbm || "", timesBought: tot || "", source: keep.source || "", ts: Date.now()}); del("catalog", drop.id); storeList(); toast("Merged into " + (keep.brand || keep.name) + "."); } }
  else if (a === "storerm") { if (st.rmId === id) { var cm = byId(D.catalog, id), nmx = cm ? (cm.brand || cm.name) : "item"; st.rmId = ""; del("catalog", id); var ss0 = byId(D.settings, "storestats"); if (ss0) { var sj = safeParse(ss0.value, {}); delete sj[id]; put("settings", "storestats", {value: JSON.stringify(sj)}); } storeList(); toast("Removed " + nmx + " from Our Store."); } else { st.rmId = id; storeList(); } }
  else if (a === "pickcat") { var c = byId(D.catalog, id), inEl = $(el.getAttribute("data-in")), store = st.store; if (c) { if (el.getAttribute("data-in") === "ask" && inEl) store = parseAdd(inEl.value).store; var was = listState(c.brand || c.name); addFromCatalog(c, store); st.store = store; if (inEl) inEl.value = ""; render(); toast(was ? (c.brand || c.name) + " was already there. Added one more." : "Added " + (c.brand || c.name) + " to " + store + "."); } }
  else if (a === "adddeal") { var dl = dealsList(), d = dl[Number(id)]; if (d) { var rd = addPlain({name: d.name, size: d.size || "", cat: d.cat || guessCat(d.name), store: "Stop & Shop", qty: 1, status: "queued", note: "On sale $" + d.sale, addedBy: me.name}); dl.splice(Number(id), 1); put("settings", "deals", {value: JSON.stringify(dl)}); toast("Queued. It goes into your Stop & Shop cart at the next push."); } }
  else if (a === "recipe") { st.rid = id; if (st.tab !== "rdetail") st.rfrom = st.tab; st.tab = "rdetail"; st.rsv = null; closeSheet(true); window.scrollTo(0, 0); render(); }
  else if (a === "addneed") { var r = byId(D.recipes, id); if (r) { var need = recipeIngs(r).filter(function (x) { return x.s === "need"; }); need.forEach(function (x) { addByName(x.n, st.store, "For " + r.name + " (" + x.q + ")"); }); closeSheet(); toast("Added " + need.length + " items to your " + st.store + " list."); } }
  else if (a === "pcycle") { var pp = byId(D.pantry, id), nx2 = {unconfirmed: "ok", ok: "low", low: "out", out: "ok"}; if (pp) put("pantry", id, {status: nx2[pp.status] || "ok"}); }
  else if (a === "pantrylist") { var p2 = byId(D.pantry, id); if (p2) { addByName(p2.name, st.store, "Running low"); toast("Added " + p2.name + " to " + st.store + "."); } }
  else if (a === "addpantry") { sheet('<h3 id="shT">Add to pantry</h3><label class="sub" for="pn">Item</label><input type="text" id="pn" placeholder="e.g. Rice" autocomplete="off"><label class="sub" for="pz" style="display:block;margin-top:10px">Where</label><select id="pz"><option>Fridge</option><option selected>Pantry</option><option>Freezer</option></select><button class="big" data-act="savepantry">Save</button><button class="linkbtn" data-act="close">Cancel</button>'); }
  else if (a === "savepantry") { var n = $("pn").value.trim(); if (!n) { toast("Type an item name."); return; } put("pantry", null, {name: n, zone: $("pz").value, size: "", note: "Added by " + (me.name || "hand"), status: "ok"}); closeSheet(); }
  else if (a === "vote") { var day = today(); put("votes", day + "_" + me.name, {day: day, recipeId: id, voter: me.name}); if (st.voteOpen && !$("sheet").hidden) $("sheetBody").innerHTML = voteCard() + '<button class="big alt" data-act="close">Close</button>'; }
  else if (a === "suggest") { sheet('<h3 id="shT">Suggest a meal</h3><label class="sub" for="sn">What should we eat?</label><input type="text" id="sn" placeholder="e.g. Jerk chicken and rice" autocomplete="off"><label class="sub" for="snote" style="display:block;margin-top:10px">Ingredients, a link, or a note (optional)</label><textarea class="f" id="snote"></textarea><button class="big" data-act="savesuggest">Add to recipes</button><button class="linkbtn" data-act="close">Cancel</button>'); }
  else if (a === "savesuggest") { var nm = $("sn").value.trim(); if (!nm) { toast("Give the meal a name."); return; } put("recipes", null, {name: nm, img: "", serves: 8, ings: [], note: $("snote").value.trim().slice(0, 1000), addedBy: me.name, kind: "suggested", cat: "Dinners", loves: [], notes: [], photos: [], steps: []}); closeSheet(); toast("Added to Ojazel's Recipe Book. Everyone can vote on it."); }
  else if (a === "photos") { sheet(photoHtml()); }
  else if (a === "family") { familySheet(); }
  else if (a === "savepin") { var pv = $("pinIn").value.trim(); if (!pv) return; me.pin = pv; ls("pfk_pin", pv); closeSheet(true); st.loaded = false; poll(); }
  else if (a === "who") { showWho(); }
  else if (a === "iam") { setMe(el.getAttribute("data-v")); }
  else if (a === "addme") { var nn = $("newName").value.trim(); if (!nn) return; if (!D.members.some(function (m) { return m.name.toLowerCase() === nn.toLowerCase(); })) put("members", null, {name: nn}); setMe(nn); }
  else if (a === "push") { st.pushOpen = true; sheet(pushHtml()); }
  else if (a === "pushgo") { put("settings", "pushreq", {value: Date.now() + "|go"}); $("sheetBody").innerHTML = pushHtml(); }
  else if (a === "cookit") { var rc2 = byId(D.recipes, id); if (rc2) { var ml = meals(); ml[id] = today(); put("settings", "meallog", {value: JSON.stringify(ml)}); st.chat.push({who: "ai", t: "Lovely. I logged " + esc(rc2.name) + " as made today. Enjoy it" + (me.name ? ", " + esc(me.name) : "") + "."}); st.tab = "cook"; render(); toast("Logged " + rc2.name + "."); } }
  else if (a === "liaask") { liaSay(el.getAttribute("data-q")); }
  else if (a === "liasend") { var li = $("liain"), lv = li ? li.value.trim() : ""; if (lv) { li.value = ""; liaSay(lv); } }
  else if (a === "newitem") { var ie = $(el.getAttribute("data-in")), iv = ie ? (el.getAttribute("data-in") === "ask" ? parseAdd(ie.value).items[0] : ie.value.trim()) : "", ist = el.getAttribute("data-in") === "ask" && ie ? parseAdd(ie.value).store : st.store; if (iv) { var nmN = iv.charAt(0).toUpperCase() + iv.slice(1); var rn = addPlain({name: nmN, size: "", cat: guessCat(iv), store: ist, qty: 1, status: "list", note: "New item", addedBy: me.name}); st.store = ist; if (ie) ie.value = ""; render(); toast(rn.dup ? nmN + " was already on the list. Made it 2." : "Added " + nmN + " to " + ist + "."); } }
  else if (a === "shopview") { st.shopView = el.getAttribute("data-v"); render(); }
  else if (a === "goshop") { st.tab = "shop"; st.shopView = el.getAttribute("data-v"); window.scrollTo(0, 0); closeSheet(); render(); }
  else if (a === "tocart") { i = byId(D.list, id); if (i) { var ssT = i.store === "Stop & Shop"; if (ssT && needsProduct(i)) nameSheet(id); else { put("list", id, {status: ssT ? "queued" : "cart"}); toast("Moved " + i.name + " to the cart."); swapCheck(i); } } }
  else if (a === "toneeds") { put("list", id, {status: "list"}); }
  else if (a === "addall") { var moved = 0, held = 0; needsFor(st.store).forEach(function (x) { if (st.store === "Stop & Shop" && needsProduct(x)) held++; else { put("list", x.id, {status: st.store === "Stop & Shop" ? "queued" : "cart"}); moved++; } }); toast("Moved " + moved + " to the cart." + (held ? " " + held + " still need a product named first." : "")); }
  else if (a === "namep") { nameSheet(id); }
  else if (a === "namesave") { i = byId(D.list, id); var pv2 = $("prodIn") ? $("prodIn").value.trim() : ""; if (!i || !pv2) { toast("Type the product first."); return; }
    put("catalog", null, {name: i.name, brand: pv2, size: "", cat: i.cat || guessCat(i.name), kw: String(i.name).toLowerCase(), store: i.store, lastBought: "", timesBought: 0, source: "named"});
    put("list", id, {name: pv2, status: i.store === "Stop & Shop" ? "queued" : "cart", note: "Product named once"}); closeSheet(); toast("Saved. " + pv2 + " is waiting to push."); }
  else if (a === "iplaced") { var cnt = cartFor(st.store).length; sheet('<h3 id="shT">Mark as ordered?</h3><p class="sub">Only do this after you place the order on the store site. The ' + cnt + ' item' + (cnt === 1 ? "" : "s") + ' in the cart move to Ordered by you, and the pantry updates.</p><button class="big" data-act="iplacedyes">Yes, I placed the order</button><button class="linkbtn" data-act="close" style="display:block;margin:6px auto 0">Not yet</button>'); }
  else if (a === "iplacedyes") { cartFor(st.store).forEach(function (x) { put("list", x.id, {status: "ordered"}); recordPurchase(x); }); closeSheet(); toast("Marked as ordered."); }
  else if (a === "mic") { startMic("ask"); }
  else if (a === "votes") { st.voteOpen = true; sheet(voteCard() + '<button class="big alt" data-act="close">Close</button>'); st.voteOpen = true; }
  else if (a === "dismissdeal") { var dl2 = dealsList(), d2 = dl2[Number(id)]; if (d2) { dl2.splice(Number(id), 1); put("settings", "deals", {value: JSON.stringify(dl2)}); var no = byId(D.settings, "dealsno"), nl = no ? safeParse(no.value, []) : [], cut2 = Date.now() - 21 * 864e5; nl = nl.filter(function (x) { return x && x.t > cut2; }); nl.push({n: d2.name, t: Date.now()}); put("settings", "dealsno", {value: JSON.stringify(nl.slice(-80))}); toast("Removed. I will not show that one again for a few weeks."); } }
  else if (a === "tool") { toolSheet(el.getAttribute("data-v"), true); }
  else if (a === "toolshow") { toolSheet(el.getAttribute("data-v"), false); }
  else if (a === "liamic") { startMic("liain", null); }
  else if (a === "newchat") { st.chat = []; liaSave(); render(); }
  else if (a === "hidealert") { $("alertbox").innerHTML = ""; }
  else if (a === "swapyes") { swapDo(true); }
  else if (a === "swapno") { swapDo(false); }
  else if (a === "close") { closeSheet(); }
});
document.addEventListener("input", function (e) { if (e.target.id === "ask" || e.target.id === "ask2" || e.target.id === "liain") showSugg(e.target.id, e.target.value); if (e.target.id === "storeq") storeList(); if (e.target.id === "pq") pickList(); if (e.target.id === "ask") toggleAdd(); });
document.addEventListener("keydown", function (e) {
  if (e.key === "Enter" && (e.target.id === "ask" || e.target.id === "ask2")) { var b = document.querySelector('[data-act="' + (e.target.id === "ask" ? "send" : "send2") + '"]'); if (b) b.click(); }
  if (e.key === "Enter" && e.target.id === "pinIn") { var s = document.querySelector('[data-act="savepin"]'); if (s) s.click(); }
  if (e.key === "Enter" && e.target.id === "liain") { var lb = document.querySelector('[data-act="liasend"]'); if (lb) lb.click(); }
  if (e.key === "Escape") closeSheet();
});
function photoHtml() { return '<h3 id="shT">Add photos</h3><p class="sub">Freezer, shelves, a store receipt, a recipe screenshot, or a photo of a meal you cooked. For now, send the pictures to Claude in the Claude app. It lists what it sees, you confirm, and then it lands in Pantry, Recipes, or your purchase history.</p><button class="big" data-act="close">Close</button>'; }
function familySheet() {
  var ch = prefsList(), m = D.catalog.filter(function (c) { return c.source === "usual" || (c.timesBought || 0) > 0; }).slice(0, 40);
  sheet('<h3 id="shT">Usual brands</h3>' + (m.length ? m.map(function (b) { return '<div class="ing"><span class="sub">' + esc(b.name) + '</span><b style="text-align:right">' + esc(b.brand || b.name) + "</b></div>"; }).join("") : '<p class="empty">None yet.</p>') +
    '<h3 style="margin-top:16px">Family preferences</h3>' + (ch.length ? ch.map(function (c) { return '<span class="chip">' + esc(c) + "</span> "; }).join("") : '<p class="empty">Tell Claude your preferences and they show here.</p>') +
    '<p class="sub" style="margin-top:10px">Built from your Stop &amp; Shop purchase history. New items you order are added automatically.</p><button class="big" data-act="close">Close</button>');
}
$("snap").addEventListener("click", function () { sheet(photoHtml()); });
$("sheet").addEventListener("click", function (e) { if (e.target.id === "sheet") closeSheet(); });

/* ---------- install as an app (home-screen icon) ---------- */
var deferred = null;
function standalone() { return (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || window.navigator.standalone === true; }
function isIOS() { return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1); }
function showInstall(force) {
  if ($("inst") || standalone()) return;
  var last = Number(ls("pfk_inst")); if (!force && last && Date.now() - last < 7 * 864e5) return;
  if (st.gate) { setTimeout(function () { showInstall(force); }, 500); return; }
  var ios = isIOS(), can = !!deferred; if (!ios && !can && !force) return;
  var ipad = /ipad/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1), steps = ios && !can;
  var d = document.createElement("div"); d.className = "instshade"; d.id = "inst"; d.setAttribute("role", "dialog"); d.setAttribute("aria-modal", "true"); d.setAttribute("aria-label", "Install the app");
  d.innerHTML = '<div class="instcard"><img src="img/lia-icon-192.png" alt=""><h3>Put Family Kitchen on your phone</h3>' +
    (steps ? '<div class="isteps"><div><span class="n">1</span><span>Tap the <b>Share</b> button ' + (ipad ? "at the top" : "below") + '</span></div><div><span class="n">2</span><span>Tap <b>Add to Home Screen</b></span></div><div><span class="n">3</span><span>Tap <b>Add</b></span></div></div>'
      : '<p>One tap. It opens full screen like a real app, with Lia right on your home screen.</p>') +
    (can ? '<button class="igo" data-act="doinstall">Install the app</button><button class="ilater" data-act="noinstall">Not now</button>' : '<button class="igo" data-act="noinstall">Got it</button>') + "</div>" +
    (steps ? '<div class="iarrow ' + (ipad ? "up" : "") + '">Share button is here<span>' + (ipad ? "&#8599;" : "&#8595;") + "</span></div>" : "");
  document.body.appendChild(d);
}
function hideInstall() { var d = $("inst"); if (d) d.remove(); }
window.addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); deferred = e; showInstall(); });
window.addEventListener("appinstalled", function () { hideInstall(); deferred = null; toast("Installed. Look for Family Kitchen on your home screen."); });
document.addEventListener("click", function (e) { var el = e.target.closest("[data-act]"); if (!el) return; var a = el.getAttribute("data-act");
  if (a === "doinstall" && deferred) { deferred.prompt(); deferred.userChoice.then(function () { deferred = null; hideInstall(); }); }
  else if (a === "noinstall") { ls("pfk_inst", String(Date.now())); hideInstall(); }
  else if (a === "showinstall") { ls("pfk_inst", "0"); if (deferred || isIOS()) showInstall(true); else sheet('<h3 id="shT">Install the app</h3><p class="sub">On Android Chrome: tap the three dots, then Install app (or Add to Home screen). On iPhone Safari: tap Share, then Add to Home Screen.</p><button class="big" data-act="close">Close</button>'); } });
if ("serviceWorker" in navigator) window.addEventListener("load", function () { navigator.serviceWorker.register("sw.js").catch(function () {}); });
if (isIOS()) setTimeout(function () { showInstall(); }, 0);

/* ---------- new version notice ---------- */
var lastUpd = 0;
function showUpdate() {
  if ($("updbar")) return;
  var d = document.createElement("div"); d.className = "updbar"; d.id = "updbar"; d.setAttribute("role", "status");
  d.innerHTML = '<span class="grow"><b>New version ready</b><small>Tap Refresh to get the latest.</small></span><button class="updgo" data-act="doupdate">Refresh</button>';
  document.body.appendChild(d);
}
function checkUpdate() {
  if (st.upd || Date.now() - lastUpd < 60000) return; lastUpd = Date.now();
  fetch("app.js?c=" + Date.now(), {cache: "no-store"}).then(function (r) { return r.text(); }).then(function (t) {
    var m = /var BUILD = "(v\d+)"/.exec(t); if (m && m[1] !== BUILD) { st.upd = m[1]; showUpdate(); }
  }).catch(function () {});
}
document.addEventListener("click", function (e) { var el = e.target.closest("[data-act]"); if (!el || el.getAttribute("data-act") !== "doupdate") return;
  el.textContent = "Updating..."; el.disabled = true;
  Promise.all(["./", "index.html", "app.js", "sw.js", "manifest.webmanifest"].map(function (u) { return fetch(u, {cache: "reload"}).catch(function () {}); }))
    .then(function () { return navigator.serviceWorker && navigator.serviceWorker.getRegistration ? navigator.serviceWorker.getRegistration() : null; })
    .then(function (reg) { return reg && reg.update ? reg.update().catch(function () {}) : null; })
    .then(function () { location.reload(); }, function () { location.reload(); });
});

/* ---------- v21: calendar, recipe book, camera, Coffee Korner ---------- */
document.addEventListener("click", function (e) {
  var el = e.target.closest("[data-act]"); if (!el) return; var a = el.getAttribute("data-act"), id = el.getAttribute("data-id"), v = el.getAttribute("data-v"), r, c;
  if (a === "hday") { st.tab = "plan"; st.wk = 0; st.pday = Number(v) || 0; window.scrollTo(0, 0); render(); }
  else if (a === "pday") { st.pday = Number(v) || 0; render(); }
  else if (a === "rback") { st.tab = st.rfrom || "recipes"; window.scrollTo(0, 0); render(); }
  else if (a === "rcat") { st.rcat = v; var rb = $("rbody"); if (rb) rb.innerHTML = recBody(); }
  else if (a === "rsv") { st.rsv = Number(v) || 8; render(); }
  else if (a === "love") { r = byId(D.recipes, st.rid); if (r && me.name) { var L = rLoves(r).slice(), i = L.indexOf(me.name); if (i > -1) L.splice(i, 1); else L.push(me.name); put("recipes", r.id, {loves: L}); } }
  else if (a === "addnote") { sheet('<h3 id="shT">Add a family note</h3><textarea class="f" id="noteIn" placeholder="e.g. Hazel&rsquo;s way: a squeeze of lime at the end"></textarea><button class="big" data-act="notesave">Save note</button><button class="linkbtn" data-act="close">Cancel</button>'); }
  else if (a === "notesave") { r = byId(D.recipes, st.rid); var nt = $("noteIn") ? $("noteIn").value.trim() : ""; if (!nt) { toast("Type the note first."); return; } if (r) { var N = arr(r.notes).slice(); N.push({by: me.name || "Family", t: nt.slice(0, 300)}); put("recipes", r.id, {notes: N}); } closeSheet(true); toast("Note saved."); }
  else if (a === "rphoto" || a === "rphoto2") { var rid0 = id || st.rid; closeSheet(true); camera(function (data) { toast("Saving your photo..."); upload(data, "recipe").then(function (u) { var rr = byId(D.recipes, rid0); if (!rr) return; var P0 = rPhotos(rr).slice(); P0.unshift({u: u, by: me.name || "", d: today()}); put("recipes", rr.id, {photos: P0.slice(0, 30)}); toast("Photo added to " + rr.name + "."); }, function (er) { toast(errMsg(er)); }); }); }
  else if (a === "made") { r = byId(D.recipes, id); if (!r) return; var mm = meals(); mm[id] = today(); put("settings", "meallog", {value: JSON.stringify(mm)}); sheet('<h3 id="shT">Logged: ' + esc(r.name) + '</h3><p class="sub">Snap tonight&rsquo;s plate? It goes into the recipe&rsquo;s &ldquo;When we made it&rdquo; photos.</p><button class="big" data-act="rphoto2" data-id="' + esc(r.id) + '">' + ic("cam", "") + ' Take a photo</button><button class="linkbtn" data-act="close" style="display:block;margin:6px auto 0">Not now</button>'); }
  else if (a === "planit") { st.planRid = st.rid; st.wk = 0; planPick(); }
  else if (a === "pwk") { st.wk = Number(v) || 0; planPick(); }
  else if (a === "pnight") { var dd = weekDays(st.wk || 0)[Number(v) || 0]; setSlot(dkey(dd) + "|d", {r: st.planRid}); closeSheet(true); st.pday = Number(v) || 0; toast("On the calendar for " + DAYS[dd.getDay()] + "."); render(); }
  else if (a === "rvote") { var day = today(); put("votes", day + "_" + me.name, {day: day, recipeId: id, voter: me.name}); toast("Voted for tonight."); }
  else if (a === "addrec") { sheet('<h3 id="shT">Add a recipe</h3><button class="big" data-act="rsnap">' + ic("cam", "") + ' Photo or screenshot of a recipe</button><button class="big alt" data-act="rtext">Paste the recipe text</button>' + '<button class="big alt" data-act="suggest">Just suggest a meal by name</button><p class="sub" style="margin-top:10px">You can also send it to Claude in the Claude app with &ldquo;add to the recipe book.&rdquo;</p><button class="linkbtn" data-act="close" style="display:block;margin:0 auto">Close</button>'); }
  else if (a === "rsnap") { closeSheet(true); snapRecipe(); }
  else if (a === "rtext") { sheet('<h3 id="shT">Paste the recipe</h3><p class="sub">Paste the caption or recipe text. A link alone is not enough; Lia cannot open web pages.</p><textarea class="f" id="rtIn" style="min-height:160px"></textarea><label class="sub" for="rtLink" style="display:block;margin-top:10px">Video link (optional)</label><input type="url" id="rtLink" inputmode="url" autocomplete="off" placeholder="Paste the Facebook or YouTube link"><button class="big" data-act="rtextgo">Lia, read it</button><button class="linkbtn" data-act="close">Cancel</button>'); }
  else if (a === "rtextgo") { var tx = $("rtIn") ? $("rtIn").value.trim() : ""; if (!tx) { toast("Paste the recipe first."); return; } st.draftLink = safeLink(($("rtLink") ? $("rtLink").value : "") || tx); sheet('<h3 id="shT">Lia is reading it</h3><p class="sub"><span class="dots">...</span> About 15 seconds.</p>', true); liaRead({text: tx}).then(function (o) { closeSheet(true); sheet(recipePreview(cleanRecipe(o))); }, function (er) { closeSheet(true); sheet('<h3 id="shT">Hmm</h3><p>' + esc(errMsg(er)) + '</p><button class="big" data-act="close">Close</button>'); }); }
  else if (a === "draftsave") { var nid = saveDraft(); closeSheet(true); if (nid) { st.rid = nid; st.rfrom = st.tab === "rdetail" ? "recipes" : (st.tab === "cook" ? "cook" : "recipes"); st.tab = "rdetail"; st.rsv = null; window.scrollTo(0, 0); render(); toast("Saved to Ojazel's Recipe Book."); } }
  else if (a === "draftplan") { var nid2 = saveDraft(); if (nid2) { st.planRid = nid2; st.wk = 0; planPick(); } }
  else if (a === "rlink") { r = byId(D.recipes, st.rid); sheet('<h3 id="shT">Video link</h3><p class="sub">Paste the Facebook, YouTube, Instagram or TikTok link. Tapping Watch opens it in that app.</p><input type="url" id="rlIn" inputmode="url" autocomplete="off" placeholder="https://..." value="' + esc(r && r.link || "") + '"><button class="big" data-act="rlinksave">Save link</button>' + (r && r.link ? '<button class="linkbtn" data-act="rlinkdel">Remove the link</button>' : "") + '<button class="linkbtn" data-act="close">Cancel</button>'); }
  else if (a === "rlinksave") { var lk = safeLink($("rlIn") ? $("rlIn").value : ""); if (!lk) { toast("That does not look like a link."); return; } put("recipes", st.rid, {link: lk}); closeSheet(true); toast("Video link saved."); }
  else if (a === "rdel") { r = byId(D.recipes, st.rid); if (!r) return; sheet('<h3 id="shT">Remove ' + esc(r.name) + '?</h3><p class="sub">It leaves Ojazel&rsquo;s Recipe Book for everyone, along with its notes and photos, and comes off any days it is planned on the calendar. This cannot be undone.</p><button class="big danger" data-act="rdelyes">Remove recipe</button><button class="linkbtn" data-act="close" style="display:block;margin:6px auto 0">Keep it</button>'); }
  else if (a === "rdelyes") { var rid1 = st.rid, rr1 = byId(D.recipes, rid1), nm1 = rr1 ? rr1.name : "Recipe", pl = planAll(), ch = 0;
    Object.keys(pl).forEach(function (k) { Object.keys(pl[k] || {}).forEach(function (sl) { if (pl[k][sl] && pl[k][sl].r === rid1) { delete pl[k][sl]; ch++; } }); });
    if (ch) planSave(pl); del("recipes", rid1); closeSheet(true); st.tab = st.rfrom === "plan" ? "plan" : "recipes"; window.scrollTo(0, 0); render(); toast("Removed " + nm1 + (ch ? " and took it off the calendar." : ".")); }
  else if (a === "rlinkdel") { put("recipes", st.rid, {link: ""}); closeSheet(true); toast("Link removed."); }
  else if (a === "liasnap") { camera(function (data) {
      st.chat.push({who: "me", t: "[photo]", img: data}); st.chat.push({who: "ai", t: '<span class="dots">...</span>', pending: true}); render(); scrollDown();
      liaRead({image: data}).then(function (o) { var rc = cleanRecipe(o); st.chat.pop(); st.chat.push({who: "ai", t: "I read it: <b>" + esc(rc.name) + "</b>, " + rc.ings.length + " ingredients and " + rc.steps.length + " steps, scaled for " + rc.serves + '.<div class="opts"><button class="opt fill" data-act="draftshow">Look and save</button></div>', raw: "I read it: " + rc.name}); st.draft = rc; render(); scrollDown(); sheet(recipePreview(rc)); },
        function (er) { st.chat.pop(); st.chat.push({who: "ai", t: esc(errMsg(er)), raw: ""}); render(); scrollDown(); }); }, true); }
  else if (a === "draftshow") { if (st.draft) sheet(recipePreview(st.draft)); else toast("Already saved. Look in the Recipe Book."); }
  /* Coffee Korner */
  else if (a === "drink") { st.ck = id; st.tab = "drink"; window.scrollTo(0, 0); render(); }
  else if (a === "star") { c = byId(D.coffee, st.ck); if (c && me.name) { var so = JSON.parse(JSON.stringify(stars(c))); so[me.name] = Number(v); put("coffee", c.id, {stars: so}); toast("Thanks. Kayley will see it."); } }
  else if (a === "supc") { var sl = supList(), x = sl[Number(v)], o = ["ok", "low", "out"]; if (x) { x.s = o[(o.indexOf(x.s || "ok") + 1) % 3]; supSave(sl); } }
  else if (a === "suplist") { var lows = supList().filter(function (s) { return s.s !== "ok"; }); lows.forEach(function (s) { addByName(s.n, "Stop & Shop", "Coffee Korner"); }); toast("Added " + lows.length + " to Stop & Shop Needs."); }
  else if (a === "supadd") { sheet('<h3 id="shT">Add a coffee supply</h3><input type="text" id="supIn" placeholder="e.g. Caramel sauce" autocomplete="off"><button class="big" data-act="supsave">Add</button><button class="linkbtn" data-act="close">Cancel</button>'); }
  else if (a === "supsave") { var sn = $("supIn") ? $("supIn").value.trim() : ""; if (!sn) return; var sl2 = supList(); sl2.push({n: sn.slice(0, 60), s: "ok"}); supSave(sl2); closeSheet(true); }
  else if (a === "tweak") { c = byId(D.coffee, st.ck); if (!c) return; var nv = "v" + ((parseInt(String(c.ver || "v1").replace(/\D/g, ""), 10) || 1) + 1); sheet('<h3 id="shT">New version (' + nv + ')</h3><p class="sub">What did Kayley change?</p><textarea class="f" id="twIn" placeholder="e.g. Half the creamer, added cinnamon"></textarea><button class="big" data-act="tweaksave" data-v="' + nv + '">Save as ' + nv + '</button><button class="linkbtn" data-act="close">Cancel</button>'); }
  else if (a === "tweaksave") { c = byId(D.coffee, st.ck); var tt = $("twIn") ? $("twIn").value.trim() : ""; if (!c || !tt) { toast("Type what changed."); return; } var T = arr(c.tweaks).slice(); T.push({v: v, t: tt.slice(0, 300)}); put("coffee", c.id, {ver: v, tweaks: T}); closeSheet(true); toast("Saved as " + v + "."); }
  else if (a === "ckphoto") { var cid = st.ck; camera(function (data) { toast("Saving your photo..."); upload(data, "coffee").then(function (u) { put("coffee", cid, {photo: u}); toast("Photo added."); }, function (er) { toast(errMsg(er)); }); }); }
  else if (a === "ckdel") { if (st.ckdel !== st.ck) { st.ckdel = st.ck; toast("Tap Remove again to delete this drink."); return; } del("coffee", st.ck); st.ckdel = null; st.tab = "coffee"; render(); toast("Removed."); }
  else if (a === "ckcam") { camera(function (data) {
      sheet('<h3 id="shT">Lia is writing it up</h3><div class="readwrap"><img src="' + data + '" alt="Your photo"><p class="sub"><span class="dots">...</span> About 15 seconds.</p></div>', true);
      Promise.all([liaRead({image: data, mode: "drink"}), upload(data, "coffee").catch(function () { return ""; })]).then(function (res) { closeSheet(true); newDrink(res[0], res[1]); }, function (er) { closeSheet(true); sheet('<h3 id="shT">Hmm</h3><p>' + esc(errMsg(er)) + '</p><button class="big" data-act="close">Close</button>'); }); }, true); }
  else if (a === "cktype") { sheet('<h3 id="shT">Kayley&rsquo;s notes</h3><p class="sub">Type or dictate how she made it. Lia turns it into a recipe.</p><textarea class="f" id="ckIn" style="min-height:140px"></textarea><button class="big" data-act="cktypego">Lia, write it up</button><button class="linkbtn" data-act="close">Cancel</button>'); }
  else if (a === "cktypego") { var ct = $("ckIn") ? $("ckIn").value.trim() : ""; if (!ct) { toast("Type the notes first."); return; } sheet('<h3 id="shT">Lia is writing it up</h3><p class="sub"><span class="dots">...</span> About 15 seconds.</p>', true); liaRead({text: ct, mode: "drink"}).then(function (o) { closeSheet(true); newDrink(o, ""); }, function (er) { closeSheet(true); sheet('<h3 id="shT">Hmm</h3><p>' + esc(errMsg(er)) + '</p><button class="big" data-act="close">Close</button>'); }); }
});
function newDrink(o, photo) {
  var nid = put("coffee", null, {name: String(o.name || "New drink").slice(0, 80), tag: String(o.tag || "").slice(0, 30), ver: "v1",
    ings: arr(o.ings).slice(0, 20).map(function (i) { return {n: String(i.n || "").slice(0, 80), q: String(i.q || "").slice(0, 30)}; }).filter(function (i) { return i.n; }),
    steps: arr(o.steps).slice(0, 12).map(function (s) { return String(s).slice(0, 300); }), tweaks: [], stars: {}, photo: photo || "", addedBy: me.name || ""});
  st.ck = nid; st.tab = "drink"; window.scrollTo(0, 0); render(); toast("Added to Coffee Korner.");
}
document.addEventListener("input", function (e) { if (e.target.id === "rq") { st.rq = e.target.value; var rb = $("rbody"); if (rb) rb.innerHTML = recBody(); } });

/* ---------- boot ---------- */
function boot() {
  render();
  if (!CFG.api) { $("status").textContent = "Not connected yet. Add the Apps Script address to config.js."; return; }
  if (!me.pin) showPin(); else poll();
  setInterval(function () { if (!document.hidden) poll(); }, 8000);
  document.addEventListener("visibilitychange", function () { if (!document.hidden) { poll(); checkUpdate(); } });
  setTimeout(checkUpdate, 15000); setInterval(function () { if (!document.hidden) checkUpdate(); }, 300000);
}
window.__pfk = {D: D, st: st, put: put, poll: poll};
boot();
})();
