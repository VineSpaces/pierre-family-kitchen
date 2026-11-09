/**
 * Pierre Family Kitchen - backend (Google Apps Script, bound to the family Google Sheet).
 *
 * One-time setup:
 *   1. Put your family PIN in INITIAL_PIN below.
 *   2. Run setup() once (Run menu). Approve the permission prompt.
 *   3. Replace INITIAL_PIN with '' again (the PIN now lives in Script Properties).
 *   4. Deploy > New deployment > Web app. Execute as: Me. Who has access: Anyone.
 *   5. Copy the /exec URL into config.js in the app.
 *
 * 1.2.0 (Nov 2026): photos (kept inside this sheet, tab "photos", no extra permissions), Lia reads a
 * snapped recipe, recipe book fields (category, times, steps, loves, notes, photos), Coffee Korner tab.
 * After pasting a new version: Deploy > Manage deployments > Edit > Version: New version > Deploy
 * (the /exec URL stays the same).
 *
 * Every request must carry the PIN. The sheet itself stays private to your Google account.
 */
var INITIAL_PIN = '';
var VERSION = '1.2.0';
var MAX_BATCH = 2000;
var MAX_CELL = 20000;
var MAX_PHOTO = 8000000; // base64 characters (about 6 MB) for Lia to read
var MAX_STORE = 600000;  // base64 characters for a stored photo (the app sends about 150 KB)
var CHUNK = 45000;       // a sheet cell holds 50,000 characters

/** Tab name -> column headers. Column A is always id. New columns are only ever added at the end. */
var TABS = {
  list:     ['id', 'name', 'size', 'cat', 'store', 'qty', 'status', 'note', 'addedBy', 'ts'],
  catalog:  ['id', 'name', 'brand', 'size', 'cat', 'kw', 'store', 'lastBought', 'timesBought', 'source', 'ts'],
  pantry:   ['id', 'name', 'zone', 'size', 'status', 'note', 'ts'],
  recipes:  ['id', 'name', 'img', 'serves', 'ings', 'note', 'addedBy', 'kind', 'ts', 'cat', 'prep', 'cook', 'steps', 'loves', 'notes', 'photos'],
  votes:    ['id', 'day', 'recipeId', 'voter', 'ts'],
  members:  ['id', 'name', 'ts'],
  settings: ['id', 'value', 'ts'],
  coffee:   ['id', 'name', 'tag', 'ver', 'ings', 'steps', 'tweaks', 'stars', 'photo', 'addedBy', 'ts'],
  photos:   ['id', 'pid', 'part', 'data', 'ts']
};
var NO_READALL = { photos: 1 }; // heavy; fetched one at a time with action 'img'
var NUMERIC = { qty: 1, ts: 1, timesBought: 1, lastBought: 1, serves: 1, day: 1, prep: 1, cook: 1 };

/* ---------- one-time setup ---------- */
function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(TABS).forEach(function (name) {
    var sh = ss.getSheetByName(name) || ss.insertSheet(name);
    var heads = TABS[name];
    sh.getRange(1, 1, 1, heads.length).setValues([heads]);
    // Plain text for text columns so "1/2" or "3-4" never turns into a date.
    heads.forEach(function (h, i) {
      if (!NUMERIC[h]) sh.getRange(2, i + 1, Math.max(sh.getMaxRows() - 1, 1), 1).setNumberFormat('@');
    });
    if (sh.setFrozenRows) sh.setFrozenRows(1);
  });
  var props = PropertiesService.getScriptProperties();
  if (INITIAL_PIN && INITIAL_PIN !== 'CHANGE-ME') {
    props.setProperty('PIN', String(INITIAL_PIN));
    Logger.log('PIN saved. Now replace INITIAL_PIN in the code with an empty string.');
  } else if (!props.getProperty('PIN')) {
    throw new Error('Set INITIAL_PIN to your family PIN, then run setup() again.');
  }
  Logger.log('Setup complete, version ' + VERSION);
}

/* ---------- web entry points ---------- */
function doGet(e) {
  // Health check only. No data is returned without a PIN.
  var p = (e && e.parameter) || {};
  if (p.action === 'ping') return json_({ ok: true, version: VERSION });
  return json_({ ok: false, error: 'Use POST' });
}

function doPost(e) {
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (!pinOk_(body.pin)) return json_({ ok: false, error: 'bad_pin' });
    switch (body.action) {
      case 'ping':   return json_({ ok: true, version: VERSION });
      case 'all':    return json_({ ok: true, version: VERSION, data: readAll_() });
      case 'upsert': return write_(function () { return { row: upsert_(body.tab, body.id, body.data) }; });
      case 'delete': return write_(function () { return { deleted: remove_(body.tab, body.id) }; });
      case 'append': return write_(function () { return { added: append_(body.tab, body.rows) }; });
      case 'batch':  return write_(function () { return { results: batch_(body.ops) }; });
      case 'lia':    return json_(lia_(body));
      case 'photo':  return write_(function () { return photo_(body); });
      case 'img':    return json_(img_(body));
      case 'liarecipe': return json_(liaRecipe_(body));
      default:       return json_({ ok: false, error: 'unknown_action' });
    }
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

/* ---------- helpers ---------- */
function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function pinOk_(pin) {
  var real = PropertiesService.getScriptProperties().getProperty('PIN');
  return !!real && String(pin || '') === real;
}

function write_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var out = fn();
    out.ok = true;
    return json_(out);
  } finally {
    lock.releaseLock();
  }
}

/** Returns the tab, creating it or adding new header columns when the code is newer than the sheet. */
function sheet_(tab) {
  if (!TABS[tab]) throw new Error('unknown_tab');
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(tab);
  var heads = TABS[tab];
  if (!sh) {
    sh = ss.insertSheet(tab);
    if (sh.setFrozenRows) sh.setFrozenRows(1);
  }
  if (sh.getLastColumn() < heads.length || sh.getLastRow() < 1) {
    if (sh.getMaxColumns() < heads.length) sh.insertColumnsAfter(sh.getMaxColumns(), heads.length - sh.getMaxColumns());
    sh.getRange(1, 1, 1, heads.length).setValues([heads]);
    heads.forEach(function (h, i) {
      sh.getRange(2, i + 1, Math.max(sh.getMaxRows() - 1, 1), 1).setNumberFormat(NUMERIC[h] ? '0' : '@');
    });
  }
  return sh;
}

function clean_(tab, key, val) {
  if (val === null || val === undefined) return '';
  if (NUMERIC[key]) {
    var n = Number(val);
    return isFinite(n) ? n : '';
  }
  var s = typeof val === 'string' ? val : JSON.stringify(val);
  if (s.length > MAX_CELL) throw new Error('value_too_long');
  return s;
}

/** Per-column formats: text columns are '@' so Sheets never reinterprets "1/2" or "007". */
function fmts_(heads) {
  return heads.map(function (h) { return NUMERIC[h] ? '0' : '@'; });
}

function newId_() {
  return Utilities.getUuid().replace(/-/g, '').slice(0, 12);
}

function rowToObj_(heads, row) {
  var o = {};
  heads.forEach(function (h, i) {
    var v = row[i];
    o[h] = (v === '' || v === null || v === undefined) ? (NUMERIC[h] ? null : '') : v;
  });
  return o;
}

function readAll_() {
  var out = {};
  Object.keys(TABS).forEach(function (tab) {
    if (NO_READALL[tab]) return;
    var heads = TABS[tab];
    var sh = sheet_(tab);
    var last = sh.getLastRow();
    var vals = last > 1 ? sh.getRange(2, 1, last - 1, heads.length).getValues() : [];
    out[tab] = vals
      .filter(function (r) { return r[0] !== '' && r[0] !== null && r[0] !== undefined; })
      .map(function (r) { return rowToObj_(heads, r); });
  });
  return out;
}

function findRow_(sh, id) {
  var last = sh.getLastRow();
  if (last < 2) return -1;
  var ids = sh.getRange(2, 1, last - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) if (String(ids[i][0]) === String(id)) return i + 2;
  return -1;
}

function upsert_(tab, id, data) {
  var sh = sheet_(tab), heads = TABS[tab];
  data = data || {};
  var rowNum = id ? findRow_(sh, id) : -1;
  var current = {};
  if (rowNum > 0) {
    current = rowToObj_(heads, sh.getRange(rowNum, 1, 1, heads.length).getValues()[0]);
  } else {
    id = id || newId_();
    current = { id: id };
  }
  heads.forEach(function (h) { if (h !== 'id' && Object.prototype.hasOwnProperty.call(data, h)) current[h] = data[h]; });
  if (heads.indexOf('ts') > -1 && !Object.prototype.hasOwnProperty.call(data, 'ts')) current.ts = Date.now();
  var row = heads.map(function (h) { return h === 'id' ? String(current.id) : clean_(tab, h, current[h]); });
  // Format first, then write. appendRow() would parse "1/2" as a date, so it is not used.
  var target = rowNum > 0 ? rowNum : sh.getLastRow() + 1;
  if (target > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), target - sh.getMaxRows());
  var rg = sh.getRange(target, 1, 1, heads.length);
  rg.setNumberFormats([fmts_(heads)]);
  rg.setValues([row]);
  return rowToObj_(heads, row);
}

function remove_(tab, id) {
  var sh = sheet_(tab), rowNum = findRow_(sh, id);
  if (rowNum < 0) return false;
  sh.deleteRow(rowNum);
  return true;
}

function append_(tab, rows) {
  var sh = sheet_(tab), heads = TABS[tab];
  if (!rows || !rows.length) return 0;
  if (rows.length > MAX_BATCH) throw new Error('too_many_rows');
  var now = Date.now();
  var needed = sh.getLastRow() + rows.length - sh.getMaxRows();
  if (needed > 0) sh.insertRowsAfter(sh.getMaxRows(), needed);
  var vals = rows.map(function (r) {
    return heads.map(function (h) {
      if (h === 'id') return String(r.id || newId_());
      if (h === 'ts' && r.ts === undefined) return now;
      return clean_(tab, h, r[h]);
    });
  });
  var rg = sh.getRange(sh.getLastRow() + 1, 1, vals.length, heads.length);
  var f = fmts_(heads);
  rg.setNumberFormats(vals.map(function () { return f; }));
  rg.setValues(vals);
  return vals.length;
}

function batch_(ops) {
  if (!ops || ops.length > 100) throw new Error('too_many_ops');
  return ops.map(function (op) {
    if (op.action === 'upsert') return { row: upsert_(op.tab, op.id, op.data) };
    if (op.action === 'delete') return { deleted: remove_(op.tab, op.id) };
    throw new Error('unknown_op');
  });
}

/* ---------- photos (stored inside this sheet, split across rows of the "photos" tab) ---------- */
function photo_(body) {
  var data = String(body.data || '');
  var m = data.match(/^data:(image\/(jpeg|png|webp));base64,([A-Za-z0-9+\/=]+)$/);
  if (!m) throw new Error('bad_image');
  if (m[3].length > MAX_STORE) throw new Error('image_too_big');
  var sh = sheet_('photos'), pid = newId_(), now = Date.now(), rows = [];
  var full = 'data:' + m[1] + ';base64,' + m[3];
  for (var i = 0, p = 0; i < full.length; i += CHUNK, p++) rows.push([pid + '_' + p, pid, p, full.slice(i, i + CHUNK), now]);
  var start = sh.getLastRow() + 1;
  if (start + rows.length - 1 > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), start + rows.length - 1 - sh.getMaxRows());
  var rg = sh.getRange(start, 1, rows.length, 5);
  rg.setNumberFormats(rows.map(function () { return ['@', '@', '0', '@', '0']; }));
  rg.setValues(rows);
  return { pid: pid, url: 'pfkimg:' + pid };
}

function img_(body) {
  var pid = String(body.pid || '').replace(/^pfkimg:/, '');
  if (!pid) return { ok: false, error: 'no_pid' };
  var sh = sheet_('photos'), last = sh.getLastRow();
  if (last < 2) return { ok: false, error: 'not_found' };
  var vals = sh.getRange(2, 2, last - 1, 3).getValues(), parts = [];
  vals.forEach(function (r) { if (String(r[0]) === pid) parts.push(r); });
  if (!parts.length) return { ok: false, error: 'not_found' };
  parts.sort(function (a, b) { return Number(a[1]) - Number(b[1]); });
  return { ok: true, data: parts.map(function (r) { return String(r[2]); }).join('') };
}

/* ---------- Lia, the cooking buddy (Anthropic API) ----------
 * The key lives ONLY in Script Properties (ANTHROPIC_KEY). It is never sent to the app or the sheet.
 * Optional Script Properties: LIA_MODEL (default below), LIA_DAILY_CAP (default 200 chats a day).
 */
var LIA_MODEL = 'claude-sonnet-5-5';
var LIA_MAX_TOKENS = 1400;
var LIA_HISTORY = 10;

/** Counts one Lia call against the daily cap. Returns the API key, or null when over the cap / no key. */
function liaKey_(out) {
  var props = PropertiesService.getScriptProperties();
  var key = props.getProperty('ANTHROPIC_KEY');
  if (!key) { out.error = 'no_key'; return null; }
  var cap = Number(props.getProperty('LIA_DAILY_CAP')) || 200;
  var day = new Date().toISOString().slice(0, 10), used = props.getProperty('LIA_DAY') === day ? Number(props.getProperty('LIA_COUNT')) || 0 : 0;
  if (used >= cap) { out.error = 'daily_limit'; return null; }
  props.setProperty('LIA_DAY', day); props.setProperty('LIA_COUNT', String(used + 1));
  return key;
}

function liaCall_(key, system, msgs, maxTokens) {
  var props = PropertiesService.getScriptProperties();
  var res = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    payload: JSON.stringify({ model: props.getProperty('LIA_MODEL') || LIA_MODEL, max_tokens: maxTokens || LIA_MAX_TOKENS, system: system, messages: msgs })
  });
  var code = res.getResponseCode(), txt = res.getContentText();
  if (code !== 200) return { error: 'api_' + code };
  try { return { text: JSON.parse(txt).content.map(function (b) { return b.text || ''; }).join('') }; } catch (e) { return { error: 'bad_reply' }; }
}

function lia_(body) {
  var out = { ok: false };
  var key = liaKey_(out);
  if (!key) return out;
  var msgs = (body.messages || []).slice(-LIA_HISTORY).map(function (m) {
    return { role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '').slice(0, 1500) };
  });
  while (msgs.length && msgs[0].role !== 'user') msgs.shift();
  if (!msgs.length) return { ok: false, error: 'empty' };
  var r = liaCall_(key, liaSystem_(String(body.who || '')), msgs);
  if (r.error) return { ok: false, error: r.error };
  return { ok: true, out: liaParse_(r.text) };
}

function liaParse_(t) {
  t = String(t || '').trim();
  var a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a > -1 && b > a) { try { var o = JSON.parse(t.slice(a, b + 1)); if (o && typeof o.reply === 'string') return o; } catch (e) {} }
  var m = t.match(/"reply"\s*:\s*"((?:[^"\\]|\\.)*)/);
  if (m) { try { return { reply: JSON.parse('"' + m[1] + '"') }; } catch (e) { return { reply: m[1] }; } }
  var cut = t.search(/\x60{3}|\{\s*"reply"/);
  return { reply: (cut > 0 ? t.slice(0, cut) : t).trim() };
}

/**
 * Lia reads a recipe from a photo / screenshot and/or pasted text or link.
 * body.image: data URL (optional), body.text: string (optional), body.mode: 'recipe' | 'drink'.
 * Returns { ok, recipe: {name, cat, prep, cook, serves, ings:[{n,q}], steps:[], note} } (drink: {name, tag, ings, steps, note}).
 */
function liaRecipe_(body) {
  var out = { ok: false };
  var drink = body.mode === 'drink';
  var content = [];
  var img = String(body.image || '');
  var m = img.match(/^data:(image\/(jpeg|png|webp|gif));base64,(.+)$/);
  if (img && !m) return { ok: false, error: 'bad_image' };
  if (m && m[3].length > MAX_PHOTO) return { ok: false, error: 'image_too_big' };
  if (m) content.push({ type: 'image', source: { type: 'base64', media_type: m[1], data: m[3] } });
  var text = String(body.text || '').slice(0, 6000);
  content.push({ type: 'text', text: (text ? 'Here is the ' + (drink ? 'drink' : 'recipe') + ' (text, notes or a link the family pasted):\n' + text + '\n\n' : '') + 'Read it and return the JSON.' });
  if (!m && !text) return { ok: false, error: 'empty' };
  var key = liaKey_(out);
  if (!key) return out;
  var cats = 'Dinners, Quick, Breakfast, Trini Classics, Weekend, Sides, Desserts, Snacks';
  var sys = drink
    ? 'You turn photos or notes of a coffee drink into a clean recipe for a family coffee corner. Return ONLY one JSON object, no code fences: ' +
      '{"name":"drink name","tag":"one to three words, e.g. Iced, Hot, Trini style","ings":[{"n":"ingredient","q":"amount"}],"steps":["short step"],"note":"one short line or empty"}. ' +
      'If the photo is just the drink with no recipe, give your best guess and say so in note. Plain words, no emoji.'
    : 'You turn a photo, screenshot (often Facebook or Instagram), cookbook page or pasted text into a clean recipe for the Pierre family (a family of 8). ' +
      'Scale amounts to feed 8. Return ONLY one JSON object, no code fences: ' +
      '{"name":"dish name","cat":"one of: ' + cats + '","prep":minutes,"cook":minutes,"serves":8,"ings":[{"n":"ingredient","q":"amount for 8"}],"steps":["short step"],"note":"one short line or empty"}. ' +
      'Use plain grocery names for ingredients (e.g. "Ground beef 80/20", "Shredded Mexican cheese"). Steps: short, one action each, max 12. ' +
      'If it is not a recipe, return {"error":"not_a_recipe"}. Plain words, no emoji.';
  var r = liaCall_(key, sys, [{ role: 'user', content: content }], 2000);
  if (r.error) return { ok: false, error: r.error };
  var t = String(r.text || ''), a = t.indexOf('{'), b = t.lastIndexOf('}');
  try {
    var o = JSON.parse(t.slice(a, b + 1));
    if (o.error) return { ok: false, error: String(o.error) };
    if (!o.name) return { ok: false, error: 'bad_reply' };
    return { ok: true, recipe: o };
  } catch (e) { return { ok: false, error: 'bad_reply' }; }
}

function liaSystem_(who) {
  var d = readAll_(), byKey = {};
  d.settings.forEach(function (s) { byKey[s.id] = s.value; });
  var meals = {}; try { meals = JSON.parse(byKey.meallog || '{}'); } catch (e) {}
  var recipes = d.recipes.map(function (r) {
    var ings = []; try { ings = JSON.parse(r.ings || '[]'); } catch (e) {}
    return r.id + ' | ' + r.name + (r.cat ? ' [' + r.cat + ']' : '') + ' | ingredients: ' + ings.map(function (i) { return i.n + (i.q ? ' (' + i.q + ')' : ''); }).join(', ') + ' | last made: ' + (meals[r.id] || 'never logged') + (r.note ? ' | note: ' + String(r.note).slice(0, 200) : '');
  }).join('\n');
  var pantry = d.pantry.map(function (p) { return p.name + ' [' + p.zone + ', ' + p.status + ']'; }).join('; ');
  var need = d.list.filter(function (i) { return i.status !== 'ordered'; }).map(function (i) { return i.name + ' x' + (i.qty || 1) + ' (' + i.store + ', ' + i.status + ')'; }).join('; ');
  var usual = d.catalog.filter(function (c) { return (c.timesBought || 0) > 1; }).slice(0, 40).map(function (c) { return c.brand || c.name; }).join('; ');
  var plan = '';
  try {
    var p = JSON.parse(byKey.mealplan || '{}'), names = {};
    d.recipes.forEach(function (r) { names[r.id] = r.name; });
    plan = Object.keys(p).sort().slice(-14).map(function (k) {
      var day = p[k] || {};
      return k + ': ' + ['b', 'l', 'd', 's'].filter(function (s) { return day[s]; }).map(function (s) { var e = day[s]; return s + '=' + (e.r ? (names[e.r] || 'recipe') : e.t); }).join(', ');
    }).join('; ');
  } catch (e) {}
  var today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return 'You are Lia, the warm, practical cooking buddy for the Pierre family (a family of 8) in their kitchen app. ' +
    (who ? 'You are talking with ' + who + '. ' : '') + 'Today is ' + today + ' (yyyymmdd).\n' +
    'Be brief and friendly: usually 1 to 4 short sentences. Plain words, no emoji, no markdown. Prefer meals made from what they already have and meals not made recently. Feed 8 people.\n' +
    'You never place orders or check out; you can only add things to the Needs list. Never invent what is in the pantry. If you are unsure, say so.\n\n' +
    'OJAZEL\'S RECIPE BOOK (saved recipes), format id | name [category] | ingredients | last made:\n' + (recipes || '(none yet)') + '\n\n' +
    'MEAL CALENDAR (yyyymmdd: b=breakfast l=lunch d=dinner s=snack): ' + (plan || '(nothing planned)') + '\n\n' +
    'PANTRY: ' + (pantry || '(unknown)') + '\n\nNEEDS LIST: ' + (need || '(empty)') + '\n\nUSUAL ITEMS: ' + (usual || '(none)') + '\n\n' +
    'KITCHEN GEAR AND NOTES THEY TOLD YOU: ' + (byKey.gear || '(nothing yet; ask once if it matters)') + '\n\n' +
    'Your ENTIRE response must be exactly one JSON object and nothing else: start with { and end with }, no text before or after it, no code fences. Shape (omit keys you do not need):\n' +
    '{"reply":"what you say","show":["recipeId", ...up to 3 recipes to display],"add":[{"name":"item","note":"why"}],"cooked":["recipeId"],"gear":"one short note to remember about their kitchen or tastes","banger":{"name":"dish","cat":"Dinners|Quick|Breakfast|Trini Classics|Weekend|Sides|Desserts|Snacks","prep":minutes,"cook":minutes,"note":"short","ings":[{"n":"ingredient","q":"amount for 8"}],"steps":["short step"]}}\n' +
    'Use "add" only when they ask you to add something or agree to your suggestion. Use "cooked" only when they say they cooked or are cooking it now. Use "banger" only when they ask you to save a recipe (include steps). Use "gear" only for lasting facts they just told you.';
}
