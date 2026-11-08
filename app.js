/* Pierre Family Kitchen - app. Talks to the Google Sheet through the Apps Script web app (Code.gs). */
(function () {
"use strict";
var CFG = window.PFK_CONFIG || {};
var stores = ["Stop & Shop", "Instacart", "Target"];
var cartUrl = {"Stop & Shop": "https://stopandshop.com/cart", "Instacart": "https://www.instacart.com/", "Target": "https://www.target.com/cart"};
var order = ["list", "cart", "ordered"], lab = {list: "On list", cart: "In cart", ordered: "Ordered by you"};
var banners = {"Fridge": "img/fridge.jpg", "Pantry": "img/pantry.jpg", "Freezer": "img/freezer.jpg"};
var TABS = ["list", "catalog", "pantry", "recipes", "votes", "members", "settings"];
var D = {list: [], catalog: [], pantry: [], recipes: [], votes: [], members: [], settings: []};
var st = {chat: [], chatLoaded: false, toolOpen: "", pushOpen: false, voteOpen: false, shopView: "needs", pushKey: undefined, tab: "home", store: "Stop & Shop", typing: false, loaded: false, gate: false, err: "", lastSync: 0};
var me = {name: ls("pfk_name") || "", pin: ls("pfk_pin") || ""};

var P={home:'<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',cart:'<circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2.5 3.5h3l2.4 11.2a1 1 0 0 0 1 .8h8.7a1 1 0 0 0 1-.7L20.5 8H6.2"/>',cook:'<path d="M5 10h14v7a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3z"/><path d="M3 10h18M9 6.5c0-1.6 1-1.6 1-3.2M14 6.5c0-1.6 1-1.6 1-3.2"/>',pantry:'<rect x="6.5" y="3" width="11" height="3" rx="1"/><path d="M7.5 6v14a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V6M7.5 11h9"/>',book:'<path d="M4 5a2 2 0 0 1 2-2h13v15H6a2 2 0 0 0-2 2z"/><path d="M4 20a2 2 0 0 1 2-2h13v3H6a2 2 0 0 1-2-1zM9 7h6"/>',mic:'<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M9 21h6"/>',send:'<path d="M4 12L20 4l-6 16-3-7z"/>',x:'<path d="M6 6l12 12M18 6L6 18"/>',check:'<path d="M5 12.5l4.5 4.5L19 7.5"/>'};
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
function recImg(r) { return r.img ? "img/r/" + r.img + ".jpg" : "img/meals.jpg"; }

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
  D.recipes.forEach(function (r) { r.ings = Array.isArray(r.ings) ? r.ings : safeParse(r.ings, []); });
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
  if (tab === "recipes" && Array.isArray(send.ings)) send.ings = JSON.stringify(send.ings);
  enqueue({action: "upsert", tab: tab, id: id, data: send}); lastJSON = ""; render(); return id;
}
function del(tab, id) { D[tab] = D[tab].filter(function (x) { return String(x.id) !== String(id); }); enqueue({action: "delete", tab: tab, id: id}); lastJSON = ""; render(); }
var BUILD = "v20";
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
  var t = tonight(); if (!t.length) return "I do not have any bangers saved yet. Add a few on the Bangers tab and I can start suggesting dinners.";
  return "Here is what I would cook, based on what you have and what has not been made in a while:" + t.map(miniRec).join("");
}
function cook() {
  liaLoad();
  var h = '<div class="lhero"><div class="lia"><img class="a" src="img/lia/lia.png" alt="Lia, your cooking buddy"><img class="b" src="img/lia/lia-b.png" alt=""></div><div class="say">Hi' + (me.name ? " " + esc(me.name) : "") + ', I&rsquo;m Lia. Hungry?<small>Ask me anything about dinner.</small></div></div><div class="chat">';
  if (!st.chat.length) h += '<div class="aiRow">' + face() + '<div class="msg ai">Tap one to start, or tap the mic and talk.<div class="opts"><button class="opt fill" data-act="liaask" data-q="What can we cook tonight?">What can we cook tonight?</button><button class="opt" data-act="tool" data-v="sales">Check sales</button><button class="opt" data-act="tool" data-v="times">Check times</button><button class="opt" data-act="tab" data-v="recipes">Open Bangers</button></div></div></div>';
  else h += '<div class="newchat"><button class="linkbtn" data-act="newchat">New chat</button></div>';
  st.chat.forEach(function (c) { h += c.who === "me" ? '<div class="msg me">' + esc(c.t) + "</div>" : '<div class="aiRow">' + face() + '<div class="msg ai">' + c.t + "</div></div>"; });
  return h + '</div><div class="sugg" id="suggL"></div><div class="bar2"><input type="text" id="liain" placeholder="Ask Lia, or say: add butter" aria-label="Ask Lia" autocomplete="off" enterkeyhint="send"><button class="round mic3" data-act="liamic" aria-label="Talk to Lia">' + ic("mic", "") + '</button><button class="round send" data-act="liasend" aria-label="Send">' + ic("send", "") + "</button></div>";
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
  if (o.banger && o.banger.name) { put("recipes", null, {name: String(o.banger.name).slice(0, 80), img: "", serves: 8, ings: (o.banger.ings || []).slice(0, 40).map(function (i) { return {n: String(i.n || ""), q: String(i.q || "")}; }), note: String(o.banger.note || "").slice(0, 500), addedBy: me.name, kind: "banger"}); done.push("Saved " + o.banger.name + " to Bangers"); }
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
/* ---------- meal planner ---------- */
var SLOTS = [["b", "Breakfast"], ["l", "Lunch"], ["d", "Dinner"], ["s", "Snack"]];
var QUICK = {b: ["Pancakes", "Waffles", "Eggs and toast", "Cereal", "Oatmeal"], l: ["Sandwiches", "Leftovers", "Mac and cheese", "Chicken nuggets"], d: ["Leftovers", "Takeout"], s: ["Fruit", "Crackers and cheese", "Yogurt", "Popcorn"]};
function dkey(d) { return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate(); }
function weekDays(off) { var d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + 7 * (off || 0)); var a = []; for (var i = 0; i < 7; i++) { var x = new Date(d); x.setDate(d.getDate() + i); a.push(x); } return a; }
function planAll() { var r = byId(D.settings, "mealplan"); return r ? safeParse(r.value, {}) : {}; }
function planSave(p) { var cut = dkey(new Date(Date.now() - 21 * 864e5)); Object.keys(p).forEach(function (k) { if (Number(k) < cut) delete p[k]; }); put("settings", "mealplan", {value: JSON.stringify(p)}); }
function slotName(e) { if (!e) return ""; if (e.r) { var r = byId(D.recipes, e.r); return r ? r.name : (e.t || "Recipe"); } return e.t || ""; }
function plan() {
  var off = st.wk || 0, days = weekDays(off), p = planAll(), tk = dkey(new Date()), sug = 0, any = 0;
  var h = pageTop("Meal plan", esc(fmtDay(days[0].getTime()) + " to " + fmtDay(days[6].getTime())));
  h += '<div class="seg2" role="group"><button data-act="wk" data-v="0" aria-pressed="' + (off === 0) + '">This week</button><button data-act="wk" data-v="1" aria-pressed="' + (off === 1) + '">Next week</button></div>';
  var body = days.map(function (d) {
    var k = dkey(d), day = p[k] || {}, rows = SLOTS.map(function (sl) { var e = day[sl[0]]; if (e) { any++; if (e.s) sug++; }
      return '<button class="pslot" data-act="pslot" data-id="' + k + "|" + sl[0] + '"><span class="pl">' + sl[1] + '</span><span class="grow">' + (e ? "<b>" + esc(slotName(e)) + "</b>" : '<span class="sub">Tap to add</span>') + "</span>" + (e && e.s ? '<span class="chip">Lia suggests</span>' : "") + "</button>"; }).join("");
    return '<div class="card pday' + (k === tk ? " today" : "") + '"><h3>' + DAYS[d.getDay()] + ' <span class="sub">' + esc(MON[d.getMonth()] + " " + d.getDate()) + "</span></h3>" + rows + "</div>";
  }).join("");
  h += '<div class="card"><button class="big" data-act="pauto">Lia, fill my week</button><div class="row" style="margin-top:8px;gap:8px">' + (sug ? '<button class="btn sm" data-act="pokall">Approve all (' + sug + ")</button>" : "") + '<button class="btn sm" data-act="pgroc"' + (any ? "" : " disabled") + '>Groceries for this week</button>' + (any ? '<button class="linkbtn" data-act="pclearwk">Clear week</button>' : "") + '</div><div class="sub" style="margin-top:6px">Lia fills the empty spots from your recipes and what you made least recently. Tap any spot to swap it. Nothing goes on your Needs list until you tap Groceries and approve.</div></div>';
  return h + body + '<button class="linkbtn" data-act="tab" data-v="home" style="display:block;margin:10px auto">Back to Home</button>';
}
function pickList() {
  var box = $("pl"); if (!box) return; var qe = $("pq"), q = qe ? qe.value.toLowerCase().trim() : "", ml = meals();
  var rs = D.recipes.filter(function (r) { return !q || String(r.name).toLowerCase().indexOf(q) > -1; }).sort(function (a, b) { return (ml[a.id] || 0) - (ml[b.id] || 0); });
  box.innerHTML = rs.map(function (r) { return '<button class="item" data-act="ppick" data-id="' + esc(r.id) + '" style="width:100%;text-align:left"><div class="pic2" style="width:36px;height:36px;border-radius:8px;background:url(' + recImg(r) + ') center/cover"></div><div class="grow"><b>' + esc(r.name) + "</b>" + (ml[r.id] ? '<div class="sub">Last made ' + esc(fmtDay(new Date(Math.floor(ml[r.id] / 10000), Math.floor(ml[r.id] / 100) % 100 - 1, ml[r.id] % 100, 12).getTime())) + "</div>" : '<div class="sub">Not made yet</div>') + "</div></button>"; }).join("") || '<p class="empty">No recipes match. Type a name below instead.</p>';
}
function pickSheet(id) {
  var pr = id.split("|"), k = pr[0], sl = pr[1], dt = new Date(Math.floor(k / 10000), Math.floor(k / 100) % 100 - 1, k % 100, 12), e = (planAll()[k] || {})[sl], nm = SLOTS.filter(function (x) { return x[0] === sl; })[0][1];
  st.pslot = id;
  sheet('<h3 id="shT">' + nm + " &middot; " + esc(DAYS[dt.getDay()] + " " + MON[dt.getMonth()] + " " + dt.getDate()) + "</h3>" + (e ? '<p class="sub">Now: <b>' + esc(slotName(e)) + "</b></p>" + (e.s ? '<button class="btn sm" data-act="pok">Looks good</button> ' : "") + '<button class="linkbtn" data-act="pclear">Clear this spot</button>' : "") +
    '<div class="sub" style="margin:10px 0 4px">Quick picks</div><div class="opts">' + QUICK[sl].map(function (q) { return '<button class="opt" data-act="pquick" data-v="' + esc(q) + '">' + esc(q) + "</button>"; }).join("") + "</div>" +
    '<div class="sub" style="margin:10px 0 4px">Your recipes</div><input type="text" id="pq" placeholder="Search recipes" autocomplete="off" aria-label="Search recipes"><div id="pl" style="max-height:34vh;overflow:auto;margin-top:6px"></div>' +
    '<div class="sub" style="margin:10px 0 4px">Or type something</div><div class="ask"><div class="grow"><input type="text" id="pt" placeholder="e.g. Jerk chicken" autocomplete="off" aria-label="Meal"></div><button class="btn" data-act="pfree">Add</button></div><button class="linkbtn" data-act="close" style="display:block;margin:6px auto 0">Close</button>'); pickList();
}
function setSlot(id, e) { var pr = id.split("|"), p = planAll(); p[pr[0]] = p[pr[0]] || {}; if (e) p[pr[0]][pr[1]] = e; else delete p[pr[0]][pr[1]]; planSave(p); }
function planAuto() {
  var off = st.wk || 0, days = weekDays(off), p = planAll(), tk = dkey(new Date()), ml = meals(), used = {}, n = 0;
  days.forEach(function (d) { var e = (p[dkey(d)] || {}).d; if (e && e.r) used[e.r] = 1; });
  var rs = D.recipes.map(function (r) { var ig = recipeIngs(r), need = ig.filter(function (x) { return x.s === "need"; }).length; return {r: r, has: ig.length > 0, need: need, last: ml[r.id] || 0}; });
  rs.sort(function (x, y) { return x.last - y.last || (x.has ? 0 : 1) - (y.has ? 0 : 1) || x.need - y.need; });
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
function planToday() {
  var p = planAll(), day = p[dkey(new Date())] || {}, rows = SLOTS.filter(function (sl) { return day[sl[0]]; }).map(function (sl) { return '<div class="ing"><span><span class="sub">' + sl[1] + "</span> " + esc(slotName(day[sl[0]])) + "</span>" + (sl[0] === "d" && day.d.r ? '<button class="btn sm" data-act="pmade" data-id="' + esc(day.d.r) + '">Made it</button>' : "") + "</div>"; }).join("");
  return '<div class="card"><div class="row"><h3 class="grow">Meal plan</h3><button class="btn sm" data-act="tab" data-v="plan">' + (rows ? "Open" : "Plan the week") + "</button></div>" + (rows || '<p class="sub" style="margin:6px 0 0">Nothing planned for today. Let Lia fill the week.</p>') + "</div>";
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
    pushBar() + toolBtns(true) +
    '<button class="sc" data-act="tab" data-v="cook" style="width:100%;margin-bottom:14px"><span class="face"><img src="img/lia/f.png" alt=""></span><span><b>Ask Lia</b><small>What can we cook tonight?</small></span></button>' +
    voteMini() + planToday() + alertHtml() + budgetHtml() + adviceHtml() + dealsHtml(3) + restockHtml() +
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
function rec() {
  return pageTop("Bangers", "Family favorites and new finds") +
    '<div class="card row"><div class="grow"><h3>Meal plan</h3><div class="sub">Plan breakfast, lunch, dinner and snacks for the week.</div></div><button class="btn" data-act="tab" data-v="plan">Open</button></div><div class="card row"><div class="grow"><h3>Suggest a meal</h3><div class="sub">Anyone can add one. Send Claude a screenshot to turn it into a full recipe.</div></div><button class="btn" data-act="suggest">Add</button></div>' +
    (D.recipes.length ? '<div class="grid2">' + D.recipes.map(function (r) { var n = recipeIngs(r).filter(function (x) { return x.s === "need"; }).length; return '<button class="rcard" data-act="recipe" data-id="' + esc(r.id) + '"><div class="pic" style="background-image:url(' + recImg(r) + ')" role="img" aria-label="' + esc(r.name) + '"></div><div class="nm">' + esc(r.name) + '<div class="sub">' + (r.ings && r.ings.length ? n + " to buy" : (r.addedBy ? "suggested by " + esc(r.addedBy) : "suggested")) + " &middot; made " + lastMade(r.id) + "</div></div></button>"; }).join("") + "</div>" : '<p class="empty">No recipes yet.</p>') +
    '<p class="sub" style="margin-top:12px">Starter recipes are for a family of 8. Tell Claude your real versions and they replace them.</p>';
}
function recipeSheet(id) {
  var r = byId(D.recipes, id); if (!r) return "";
  var ings = recipeIngs(r), need = ings.filter(function (x) { return x.s === "need"; }), tag = {have: '<span class="chip ok">Have</span>', check: '<span class="chip info">Check</span>', need: '<span class="chip warn">Need</span>'};
  return '<div class="banner-img" style="background-image:url(' + recImg(r) + ');margin-top:0" role="img" aria-label="' + esc(r.name) + '"></div><h3 id="shT">' + esc(r.name) + '</h3><div class="sub">Feeds ' + (r.serves || 8) + (r.note ? " &middot; " + esc(r.note) : "") + (r.addedBy ? " &middot; suggested by " + esc(r.addedBy) : "") + "</div>" +
    (ings.length ? '<div style="margin:10px 0">' + ings.map(function (x) { return '<div class="ing"><span>' + esc(x.n) + ' <span class="sub">' + esc(x.q) + "</span>" + (function () { var c = catalogMatch(x.n); return c ? '<div class="sub last">Usually ' + esc(c.brand || c.name) + (c.lastBought ? " \u00b7 last bought " + fmtDay(c.lastBought) : "") + "</div>" : ""; })() + "</span>" + tag[x.s] + "</div>"; }).join("") + "</div>" +
      (need.length ? '<button class="big" data-act="addneed" data-id="' + esc(r.id) + '">Add ' + need.length + " missing to " + esc(st.store) + " list</button>" : "<p>You have everything.</p>") : '<p class="sub" style="margin:10px 0">No ingredient list yet. Send Claude the recipe and it will fill this in.</p>') +
    '<button class="linkbtn" data-act="close">Close</button>';
}
var views = {home: home, shop: shop, cook: cook, pantry: pan, recipes: rec, plan: plan};
var tabs = [["home", "Home", "home"], ["shop", "Shop", "cart"], ["cook", "Cook", "cook"], ["pantry", "Pantry", "pantry"], ["recipes", "Bangers", "book"]];
function render() {
  var a = document.activeElement, keep = a && a.id && /^(ask2?|liain)$/.test(a.id) ? {id: a.id, v: a.value} : null, lk = $("liain"); if (!keep && lk && lk.value) keep = {id: "liain", v: lk.value, nf: 1};
  $("view").innerHTML = views[st.tab]();
  var qn = queuedFor("Stop & Shop").length;
  $("tabs").innerHTML = tabs.map(function (t) { return '<button class="tab" role="tab" style="position:relative" aria-selected="' + (st.tab === t[0]) + '" data-act="tab" data-v="' + t[0] + '">' + (t[0] === "shop" && qn ? '<span class="tbadge">' + qn + "</span>" : "") + ic(t[2]) + t[1] + "</button>"; }).join("");
  $("snap").hidden = !(st.tab === "pantry" || st.tab === "recipes");
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
  if (a === "tab") { st.tab = el.getAttribute("data-v"); window.scrollTo(0, 0); closeSheet(); render(); }
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
  else if (a === "wk") { st.wk = Number(el.getAttribute("data-v")) || 0; render(); }
  else if (a === "pslot") { pickSheet(id); }
  else if (a === "ppick") { setSlot(st.pslot, {r: id}); closeSheet(true); render(); }
  else if (a === "pquick") { setSlot(st.pslot, {t: el.getAttribute("data-v")}); closeSheet(true); render(); }
  else if (a === "pfree") { var pt = $("pt"), pv = pt ? pt.value.trim() : ""; if (pv) { setSlot(st.pslot, {t: pv.charAt(0).toUpperCase() + pv.slice(1)}); closeSheet(true); render(); } }
  else if (a === "pclear") { setSlot(st.pslot, null); closeSheet(true); render(); }
  else if (a === "pok") { var pe = (planAll()[st.pslot.split("|")[0]] || {})[st.pslot.split("|")[1]]; if (pe) { delete pe.s; setSlot(st.pslot, pe); } closeSheet(true); render(); }
  else if (a === "pokall") { var pa = planAll(); Object.keys(pa).forEach(function (k) { Object.keys(pa[k]).forEach(function (sl) { if (pa[k][sl] && pa[k][sl].s) delete pa[k][sl].s; }); }); planSave(pa); render(); toast("Approved."); }
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
  else if (a === "recipe") { sheet(recipeSheet(id)); }
  else if (a === "addneed") { var r = byId(D.recipes, id); if (r) { var need = recipeIngs(r).filter(function (x) { return x.s === "need"; }); need.forEach(function (x) { addByName(x.n, st.store, "For " + r.name + " (" + x.q + ")"); }); closeSheet(); toast("Added " + need.length + " items to your " + st.store + " list."); } }
  else if (a === "pcycle") { var pp = byId(D.pantry, id), nx2 = {unconfirmed: "ok", ok: "low", low: "out", out: "ok"}; if (pp) put("pantry", id, {status: nx2[pp.status] || "ok"}); }
  else if (a === "pantrylist") { var p2 = byId(D.pantry, id); if (p2) { addByName(p2.name, st.store, "Running low"); toast("Added " + p2.name + " to " + st.store + "."); } }
  else if (a === "addpantry") { sheet('<h3 id="shT">Add to pantry</h3><label class="sub" for="pn">Item</label><input type="text" id="pn" placeholder="e.g. Rice" autocomplete="off"><label class="sub" for="pz" style="display:block;margin-top:10px">Where</label><select id="pz"><option>Fridge</option><option selected>Pantry</option><option>Freezer</option></select><button class="big" data-act="savepantry">Save</button><button class="linkbtn" data-act="close">Cancel</button>'); }
  else if (a === "savepantry") { var n = $("pn").value.trim(); if (!n) { toast("Type an item name."); return; } put("pantry", null, {name: n, zone: $("pz").value, size: "", note: "Added by " + (me.name || "hand"), status: "ok"}); closeSheet(); }
  else if (a === "vote") { var day = today(); put("votes", day + "_" + me.name, {day: day, recipeId: id, voter: me.name}); if (st.voteOpen && !$("sheet").hidden) $("sheetBody").innerHTML = voteCard() + '<button class="big alt" data-act="close">Close</button>'; }
  else if (a === "suggest") { sheet('<h3 id="shT">Suggest a meal</h3><label class="sub" for="sn">What should we eat?</label><input type="text" id="sn" placeholder="e.g. Jerk chicken and rice" autocomplete="off"><label class="sub" for="snote" style="display:block;margin-top:10px">Ingredients, a link, or a note (optional)</label><textarea class="f" id="snote"></textarea><button class="big" data-act="savesuggest">Add to recipes</button><button class="linkbtn" data-act="close">Cancel</button>'); }
  else if (a === "savesuggest") { var nm = $("sn").value.trim(); if (!nm) { toast("Give the meal a name."); return; } put("recipes", null, {name: nm, img: "", serves: 8, ings: [], note: $("snote").value.trim().slice(0, 1000), addedBy: me.name, kind: "suggested"}); closeSheet(); toast("Added. Everyone can vote on it."); }
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
