/* Pierre Family Kitchen - app. Talks to the Google Sheet through the Apps Script web app (Code.gs). */
(function () {
"use strict";
var CFG = window.PFK_CONFIG || {};
var stores = ["Stop & Shop", "Instacart", "Costco", "Target"];
var cartUrl = {"Stop & Shop": "https://stopandshop.com/cart", "Instacart": "https://www.instacart.com/", "Costco": "https://www.costco.com/CheckoutCartDisplayView", "Target": "https://www.target.com/cart"};
var order = ["list", "cart", "ordered"], lab = {list: "On list", cart: "In cart", ordered: "Ordered by you"};
var banners = {"Fridge": "img/fridge.jpg", "Pantry": "img/pantry.jpg", "Freezer": "img/freezer.jpg"};
var TABS = ["list", "catalog", "pantry", "recipes", "votes", "members", "settings"];
var D = {list: [], catalog: [], pantry: [], recipes: [], votes: [], members: [], settings: []};
var st = {tab: "home", store: "Stop & Shop", typing: false, loaded: false, gate: false, err: "", lastSync: 0};
var me = {name: ls("pfk_name") || "", pin: ls("pfk_pin") || ""};

/* ---------- small utils ---------- */
function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }
function esc(t) { return String(t == null ? "" : t).replace(/[&<>"]/g, function (c) { return {"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"}[c]; }); }
function $(id) { return document.getElementById(id); }
function rid() { var s = ""; while (s.length < 12) s += Math.random().toString(36).slice(2); return s.slice(0, 12); }
function today() { var d = new Date(); return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate(); }
function byId(arr, id) { for (var i = 0; i < arr.length; i++) if (String(arr[i].id) === String(id)) return arr[i]; return null; }
function toast(m) { var t = $("toast"); t.textContent = m; t.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(function () { t.hidden = true; }, 4200); }
function sheet(h, gate) { st.gate = !!gate; $("sheetBody").innerHTML = h; $("sheet").hidden = false; }
function closeSheet(force) { if (st.gate && !force) return; st.gate = false; $("sheet").hidden = true; }
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
  st.loaded = true; st.lastSync = Date.now(); st.err = "";
  if (j !== lastJSON) { lastJSON = j; render(); } else setStatus();
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
function setStatus() {
  var t = me.name ? "Hi " + esc(me.name) + " &middot; " : "";
  var when = st.lastSync ? new Date(st.lastSync).toLocaleTimeString([], {hour: "numeric", minute: "2-digit"}) : "";
  $("status").innerHTML = st.err ? esc(st.err) : (st.loaded ? t + "synced " + when + ' &middot; <button class="linkbtn" style="min-height:24px;padding:0" data-act="who">switch person</button>' : "Loading your kitchen...");
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
function showSugg(id, q) {
  var box = $(id === "ask" ? "sugg" : "sugg2"); if (!box) return;
  var m = q; if (id === "ask") { var p = parseAdd(q); m = p.items[0] || ""; }
  var r = suggest(m);
  box.innerHTML = r.map(function (c) { return '<button data-act="pickcat" data-id="' + esc(c.id) + '" data-in="' + id + '">' + thumb(c.cat, c.brand || c.name) + '<span class="grow"><b>' + esc(c.brand || c.name) + '</b><div class="hint">' + esc([c.size, c.timesBought ? "bought " + c.timesBought + "x" : ""].filter(Boolean).join(" · ")) + '</div></span><span class="hint">+ add</span></button>'; }).join("");
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
function itemRows(items) {
  if (!items.length) return '<p class="empty">Nothing on this list yet. Type what you need above.</p>';
  return items.map(function (i) { return '<div class="item">' + thumb(i.cat, i.name) + '<div class="grow"><div><b>' + esc(i.name) + '</b></div><div class="sub">' + esc([i.size, i.note, i.addedBy ? "added by " + i.addedBy : ""].filter(Boolean).join(" · ")) + '</div>' +
    '<button class="pill" data-s="' + esc(i.status) + '" data-act="cycle" data-id="' + esc(i.id) + '" aria-label="Status ' + (lab[i.status] || "") + ', tap to change">' + (lab[i.status] || "On list") + '</button></div>' +
    '<div class="step"><button data-act="dec" data-id="' + esc(i.id) + '" aria-label="Less">&minus;</button><span>' + (i.qty || 1) + '</span><button data-act="inc" data-id="' + esc(i.id) + '" aria-label="More">+</button></div>' +
    '<button class="trash" data-act="del" data-id="' + esc(i.id) + '" aria-label="Remove ' + esc(i.name) + '">&#128465;</button></div>'; }).join("");
}
function storeSeg() { return '<div class="seg" role="group" aria-label="Store">' + stores.map(function (s) { var n = itemsFor(s).filter(function (i) { return i.status !== "ordered"; }).length; return '<button data-act="store" data-v="' + esc(s) + '" aria-pressed="' + (st.store === s) + '">' + esc(s) + (n ? "<b>" + n + "</b>" : "") + "</button>"; }).join("") + "</div>"; }
function reviewBtn() { var n = itemsFor(st.store).length; return '<button class="big" data-act="review">Review cart (' + n + " item" + (n === 1 ? "" : "s") + ") &rsaquo;</button>"; }
function rc(r) { return '<button class="rcard" data-act="recipe" data-id="' + esc(r.id) + '"><div class="pic" style="background-image:url(' + recImg(r) + ')" role="img" aria-label="' + esc(r.name) + '"></div><div class="nm">' + esc(r.name) + "</div></button>"; }
function dealsHtml(max) {
  var ds = dealsList().slice(0, max); if (!ds.length) return "";
  return '<div class="card"><h3>On sale from your usual items</h3><p class="sub" style="margin:6px 0 4px">Seen on Stop &amp; Shop ' + esc(ds[0].seen || "") + ". You decide what goes on the list.</p>" +
    ds.map(function (d, i) { return '<div class="deal"><div class="grow"><b>' + esc(d.name) + '</b><div class="sub"><span style="color:var(--ok);font-weight:700">$' + esc(d.sale) + '</span> <span class="was">$' + esc(d.was) + "</span>" + (d.note ? " &middot; " + esc(d.note) : "") + '</div></div><button class="btn sm" data-act="adddeal" data-id="' + i + '">+ List</button></div>'; }).join("") + "</div>";
}
function voteCard() {
  var day = today(), vs = D.votes.filter(function (v) { return Number(v.day) === day; }), mine = vs.filter(function (v) { return v.voter === me.name; })[0], counts = {};
  vs.forEach(function (v) { counts[v.recipeId] = (counts[v.recipeId] || 0) + 1; });
  var top = null; Object.keys(counts).forEach(function (k) { if (!top || counts[k] > counts[top]) top = k; });
  var tr = top ? byId(D.recipes, top) : null;
  return '<div class="card"><div class="row"><h3 class="grow">What&rsquo;s for dinner?</h3><button class="linkbtn" data-act="suggest">Suggest a meal</button></div>' +
    '<p class="sub" style="margin:6px 0 0">' + (tr ? "Leading: <b>" + esc(tr.name) + "</b> with " + counts[top] + " vote" + (counts[top] === 1 ? "" : "s") + "." : "Tap your pick. One vote each, change it any time.") + "</p>" +
    '<div class="votes">' + D.recipes.slice(0, 12).map(function (r) { return '<button class="vote" data-act="vote" data-id="' + esc(r.id) + '" aria-pressed="' + (!!mine && mine.recipeId === r.id) + '">' + esc(r.name) + (counts[r.id] ? "<b>" + counts[r.id] + "</b>" : "") + "</button>"; }).join("") + "</div></div>";
}
function home() {
  return '<section class="hero"><img class="logo" src="img/logo.png" alt="Pierre Family Kitchen"><h2>What does the family need today?</h2>' +
    '<div class="micwrap"><button class="mic" data-act="typing" aria-label="Tap to talk or type">&#127908;</button><div class="t">Tap to talk</div><div class="e">&ldquo;Add bacon to Stop &amp; Shop&rdquo;</div>' +
    (st.typing ? '<div class="ask"><div class="grow"><input type="text" id="ask" placeholder="Add milk to Instacart" aria-label="Request" autocomplete="off" enterkeyhint="send"></div><button class="btn" data-act="send">Add</button></div><div class="sugg" id="sugg"></div><div class="e" style="font-size:13px;margin-top:6px">Tap the microphone on your keyboard to speak it.</div>' : '<button class="linkbtn" data-act="typing">or type it instead</button>') + "</div></section>" +
    '<div class="card"><div class="row"><h3 class="grow">Shopping</h3><button class="linkbtn" data-act="tab" data-v="shop">Open &rsaquo;</button></div>' + storeSeg() + itemRows(itemsFor(st.store).slice(0, 3)) + reviewBtn() + "</div>" +
    voteCard() +
    '<div class="tiles"><button class="tile" style="background-image:url(img/pantry.jpg)" data-act="tab" data-v="pantry"><div class="tx"><h3>Pantry</h3><div class="sub">' + D.pantry.length + ' items tracked</div></div></button>' +
    '<button class="tile" style="background-image:url(img/meals.jpg)" data-act="tab" data-v="recipes"><div class="tx"><h3>Tonight&rsquo;s meals</h3><div class="sub">For a family of 8</div></div></button></div>' +
    '<div class="card"><div class="row"><h3 class="grow">Saved recipes</h3><button class="linkbtn" data-act="tab" data-v="recipes">See all &rsaquo;</button></div>' + (D.recipes.length ? '<div class="scroller">' + D.recipes.map(rc).join("") + "</div>" : '<p class="empty">No recipes yet.</p>') + "</div>" +
    dealsHtml(3) + '<button class="big" style="background:var(--terra);color:var(--terra-ink)" data-act="family">Usual brands and family preferences</button>';
}
function pageTop(t, s) { return '<div class="top"><div><h1>' + t + "</h1><small>" + s + "</small></div></div>"; }
function shop() {
  var any = itemsFor(st.store).some(function (i) { return i.status === "ordered"; });
  return pageTop("Shopping", "You review and place every order") + '<div class="card">' + storeSeg() + itemRows(itemsFor(st.store)) + reviewBtn() + (any ? '<button class="big alt" data-act="clearordered">Clear ordered items</button>' : "") + "</div>" +
    '<div class="card"><b>Add an item</b><div class="sub">To ' + esc(st.store) + '. Start typing and your usual items appear.</div><div class="ask" style="margin-top:8px"><div class="grow"><input type="text" id="ask2" placeholder="e.g. syrup" aria-label="Item" autocomplete="off" enterkeyhint="send"></div><button class="btn" data-act="send2">Add</button></div><div class="sugg" id="sugg2"></div></div>' +
    dealsHtml(6) + '<p class="sub">Only you move an item to &ldquo;Ordered by you.&rdquo; Tell Claude when you are ready for a cart to be filled. Claude never places the order.</p>';
}
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
  return pageTop("Recipes", "Family favorites and new finds") +
    '<div class="card row"><div class="grow"><h3>Suggest a meal</h3><div class="sub">Anyone can add one. Send Claude a screenshot to turn it into a full recipe.</div></div><button class="btn" data-act="suggest">Add</button></div>' +
    (D.recipes.length ? '<div class="grid2">' + D.recipes.map(function (r) { var n = recipeIngs(r).filter(function (x) { return x.s === "need"; }).length; return '<button class="rcard" data-act="recipe" data-id="' + esc(r.id) + '"><div class="pic" style="background-image:url(' + recImg(r) + ')" role="img" aria-label="' + esc(r.name) + '"></div><div class="nm">' + esc(r.name) + '<div class="sub">' + (r.ings && r.ings.length ? n + " to buy" : (r.addedBy ? "suggested by " + esc(r.addedBy) : "suggested")) + "</div></div></button>"; }).join("") + "</div>" : '<p class="empty">No recipes yet.</p>') +
    '<p class="sub" style="margin-top:12px">Starter recipes are for a family of 8. Tell Claude your real versions and they replace them.</p>';
}
function recipeSheet(id) {
  var r = byId(D.recipes, id); if (!r) return "";
  var ings = recipeIngs(r), need = ings.filter(function (x) { return x.s === "need"; }), tag = {have: '<span class="chip ok">Have</span>', check: '<span class="chip info">Check</span>', need: '<span class="chip warn">Need</span>'};
  return '<div class="banner-img" style="background-image:url(' + recImg(r) + ');margin-top:0" role="img" aria-label="' + esc(r.name) + '"></div><h3 id="shT">' + esc(r.name) + '</h3><div class="sub">Feeds ' + (r.serves || 8) + (r.note ? " &middot; " + esc(r.note) : "") + (r.addedBy ? " &middot; suggested by " + esc(r.addedBy) : "") + "</div>" +
    (ings.length ? '<div style="margin:10px 0">' + ings.map(function (x) { return '<div class="ing"><span>' + esc(x.n) + ' <span class="sub">' + esc(x.q) + "</span></span>" + tag[x.s] + "</div>"; }).join("") + "</div>" +
      (need.length ? '<button class="big" data-act="addneed" data-id="' + esc(r.id) + '">Add ' + need.length + " missing to " + esc(st.store) + " list</button>" : "<p>You have everything.</p>") : '<p class="sub" style="margin:10px 0">No ingredient list yet. Send Claude the recipe and it will fill this in.</p>') +
    '<button class="linkbtn" data-act="close">Close</button>';
}
var views = {home: home, shop: shop, pantry: pan, recipes: rec};
var tabs = [["home", "Home", "⌂"], ["shop", "Shopping", "🛒"], ["pantry", "Pantry", "🥫"], ["recipes", "Recipes", "📖"]];
function render() {
  var a = document.activeElement, keep = a && a.id && /^ask2?$/.test(a.id) ? {id: a.id, v: a.value} : null;
  $("view").innerHTML = views[st.tab]();
  $("tabs").innerHTML = tabs.map(function (t) { return '<button class="tab" role="tab" aria-selected="' + (st.tab === t[0]) + '" data-act="tab" data-v="' + t[0] + '"><i aria-hidden="true">' + t[2] + "</i>" + t[1] + "</button>"; }).join("");
  setStatus();
  if (keep) { var el = $(keep.id); if (el) { el.value = keep.v; el.focus(); showSugg(keep.id, keep.v); } }
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
  else if (a === "cycle") { i = byId(D.list, id); if (i) { var nx = order[(order.indexOf(i.status) + 1) % 3]; put("list", id, {status: nx}); if (nx === "ordered") recordPurchase(i); } }
  else if (a === "inc") { i = byId(D.list, id); if (i) put("list", id, {qty: (i.qty || 1) + 1}); }
  else if (a === "dec") { i = byId(D.list, id); if (i && (i.qty || 1) > 1) put("list", id, {qty: i.qty - 1}); }
  else if (a === "del") { del("list", id); }
  else if (a === "clearordered") { itemsFor(st.store).filter(function (x) { return x.status === "ordered"; }).forEach(function (x) { del("list", x.id); }); }
  else if (a === "typing") { st.typing = true; render(); var q = $("ask"); if (q) q.focus(); }
  else if (a === "send" || a === "send2") { var inp = $(a === "send" ? "ask" : "ask2"), v = inp ? inp.value.trim() : ""; if (!v) { toast("Type or dictate a request first."); return; }
    var p = a === "send" ? parseAdd(v) : {items: [v], store: st.store}; p.items.forEach(function (n) { addByName(n, p.store); }); st.store = p.store; inp.value = ""; render(); toast("Added " + p.items.join(", ") + " to " + p.store + "."); }
  else if (a === "pickcat") { var c = byId(D.catalog, id), inEl = $(el.getAttribute("data-in")), store = st.store; if (c) { if (el.getAttribute("data-in") === "ask" && inEl) store = parseAdd(inEl.value).store; addFromCatalog(c, store); st.store = store; if (inEl) inEl.value = ""; render(); toast("Added " + (c.brand || c.name) + " to " + store + "."); } }
  else if (a === "adddeal") { var d = dealsList()[Number(id)]; if (d) { addLine({name: d.name, size: d.size || "", cat: d.cat || guessCat(d.name), store: "Stop & Shop", qty: 1, status: "list", note: "On sale $" + d.sale, addedBy: me.name}); toast("Added to your list."); } }
  else if (a === "recipe") { sheet(recipeSheet(id)); }
  else if (a === "addneed") { var r = byId(D.recipes, id); if (r) { var need = recipeIngs(r).filter(function (x) { return x.s === "need"; }); need.forEach(function (x) { addByName(x.n, st.store, "For " + r.name + " (" + x.q + ")"); }); closeSheet(); toast("Added " + need.length + " items to your " + st.store + " list."); } }
  else if (a === "pcycle") { var pp = byId(D.pantry, id), nx2 = {unconfirmed: "ok", ok: "low", low: "out", out: "ok"}; if (pp) put("pantry", id, {status: nx2[pp.status] || "ok"}); }
  else if (a === "pantrylist") { var p2 = byId(D.pantry, id); if (p2) { addByName(p2.name, st.store, "Running low"); toast("Added " + p2.name + " to " + st.store + "."); } }
  else if (a === "addpantry") { sheet('<h3 id="shT">Add to pantry</h3><label class="sub" for="pn">Item</label><input type="text" id="pn" placeholder="e.g. Rice" autocomplete="off"><label class="sub" for="pz" style="display:block;margin-top:10px">Where</label><select id="pz"><option>Fridge</option><option selected>Pantry</option><option>Freezer</option></select><button class="big" data-act="savepantry">Save</button><button class="linkbtn" data-act="close">Cancel</button>'); }
  else if (a === "savepantry") { var n = $("pn").value.trim(); if (!n) { toast("Type an item name."); return; } put("pantry", null, {name: n, zone: $("pz").value, size: "", note: "Added by " + (me.name || "hand"), status: "ok"}); closeSheet(); }
  else if (a === "vote") { var day = today(); put("votes", day + "_" + me.name, {day: day, recipeId: id, voter: me.name}); }
  else if (a === "suggest") { sheet('<h3 id="shT">Suggest a meal</h3><label class="sub" for="sn">What should we eat?</label><input type="text" id="sn" placeholder="e.g. Jerk chicken and rice" autocomplete="off"><label class="sub" for="snote" style="display:block;margin-top:10px">Ingredients, a link, or a note (optional)</label><textarea class="f" id="snote"></textarea><button class="big" data-act="savesuggest">Add to recipes</button><button class="linkbtn" data-act="close">Cancel</button>'); }
  else if (a === "savesuggest") { var nm = $("sn").value.trim(); if (!nm) { toast("Give the meal a name."); return; } put("recipes", null, {name: nm, img: "", serves: 8, ings: [], note: $("snote").value.trim().slice(0, 1000), addedBy: me.name, kind: "suggested"}); closeSheet(); toast("Added. Everyone can vote on it."); }
  else if (a === "review") { reviewSheet(); }
  else if (a === "copylist") { var t = $("copybox"); try { navigator.clipboard.writeText(t.value).then(function () { toast("List copied."); }, function () { t.select(); toast("Press copy on your keyboard."); }); } catch (x) { t.select(); toast("Press copy on your keyboard."); } }
  else if (a === "photos") { sheet(photoHtml()); }
  else if (a === "family") { familySheet(); }
  else if (a === "savepin") { var pv = $("pinIn").value.trim(); if (!pv) return; me.pin = pv; ls("pfk_pin", pv); closeSheet(true); st.loaded = false; poll(); }
  else if (a === "who") { showWho(); }
  else if (a === "iam") { setMe(el.getAttribute("data-v")); }
  else if (a === "addme") { var nn = $("newName").value.trim(); if (!nn) return; if (!D.members.some(function (m) { return m.name.toLowerCase() === nn.toLowerCase(); })) put("members", null, {name: nn}); setMe(nn); }
  else if (a === "close") { closeSheet(); }
});
document.addEventListener("input", function (e) { if (e.target.id === "ask" || e.target.id === "ask2") showSugg(e.target.id, e.target.value); });
document.addEventListener("keydown", function (e) {
  if (e.key === "Enter" && (e.target.id === "ask" || e.target.id === "ask2")) { var b = document.querySelector('[data-act="' + (e.target.id === "ask" ? "send" : "send2") + '"]'); if (b) b.click(); }
  if (e.key === "Enter" && e.target.id === "pinIn") { var s = document.querySelector('[data-act="savepin"]'); if (s) s.click(); }
  if (e.key === "Escape") closeSheet();
});
function reviewSheet() {
  var its = itemsFor(st.store).filter(function (i) { return i.status !== "ordered"; }), txt = its.map(function (i) { return (i.qty || 1) + " x " + i.name + (i.size ? " (" + i.size + ")" : ""); }).join("\n");
  sheet('<h3 id="shT">Review your ' + esc(st.store) + ' cart</h3><p class="sub">Tell Claude when you want this cart filled. You choose the pickup or delivery time, check every item, and place the order yourself. Nothing here ever checks out.</p>' +
    (its.length ? '<label class="sub" for="copybox">Your list</label><textarea class="f" id="copybox" readonly style="font-family:ui-monospace,Menlo,Consolas,monospace;font-size:14px">' + esc(txt) + '</textarea><button class="big alt" data-act="copylist">Copy list</button>' : '<p class="empty">Nothing on this list.</p>') +
    '<a href="' + esc(cartUrl[st.store]) + '" target="_blank" rel="noopener" style="text-decoration:none"><button class="big" type="button">Open ' + esc(st.store) + ' cart</button></a><button class="linkbtn" data-act="close">Close</button>');
}
function photoHtml() { return '<h3 id="shT">Add photos</h3><p class="sub">Freezer, shelves, a store receipt, a recipe screenshot, or a photo of a meal you cooked. For now, send the pictures to Claude in the Claude app. It lists what it sees, you confirm, and then it lands in Pantry, Recipes, or your purchase history.</p><button class="big" data-act="close">Close</button>'; }
function familySheet() {
  var ch = prefsList(), m = D.catalog.filter(function (c) { return c.source === "usual" || (c.timesBought || 0) > 0; }).slice(0, 40);
  sheet('<h3 id="shT">Usual brands</h3>' + (m.length ? m.map(function (b) { return '<div class="ing"><span class="sub">' + esc(b.name) + '</span><b style="text-align:right">' + esc(b.brand || b.name) + "</b></div>"; }).join("") : '<p class="empty">None yet.</p>') +
    '<h3 style="margin-top:16px">Family preferences</h3>' + (ch.length ? ch.map(function (c) { return '<span class="chip">' + esc(c) + "</span> "; }).join("") : '<p class="empty">Tell Claude your preferences and they show here.</p>') +
    '<p class="sub" style="margin-top:10px">Built from your Stop &amp; Shop purchase history. New items you order are added automatically.</p><button class="big" data-act="close">Close</button>');
}
$("snap").addEventListener("click", function () { sheet(photoHtml()); });
$("sheet").addEventListener("click", function (e) { if (e.target.id === "sheet") closeSheet(); });

/* ---------- boot ---------- */
function boot() {
  render();
  if (!CFG.api) { $("status").textContent = "Not connected yet. Add the Apps Script address to config.js."; return; }
  if (!me.pin) showPin(); else poll();
  setInterval(function () { if (!document.hidden) poll(); }, 8000);
  document.addEventListener("visibilitychange", function () { if (!document.hidden) poll(); });
}
window.__pfk = {D: D, st: st, put: put, poll: poll};
boot();
})();
