/* Pierre Family Kitchen service worker: makes the app installable and opens fast.
   Network first for the app files (so updates arrive right away), cache as the offline fallback.
   Never touches the sheet/Apps Script calls. */
var V = "pfk-v9";
var SHELL = ["./", "index.html", "app.js", "config.js", "img/logo.png", "img/icon-192.png", "img/lia/lia.png", "img/lia/lia-b.png", "img/lia/f.png", "img/lia/f-b.png"];
self.addEventListener("install", function (e) { e.waitUntil(caches.open(V).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); })); });
self.addEventListener("activate", function (e) { e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k !== V; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); })); });
self.addEventListener("fetch", function (e) {
  var r = e.request, u = new URL(r.url);
  if (r.method !== "GET" || u.origin !== location.origin) return;
  e.respondWith(fetch(r).then(function (res) { var cp = res.clone(); caches.open(V).then(function (c) { c.put(r, cp); }); return res; }).catch(function () { return caches.match(r).then(function (m) { return m || caches.match("index.html"); }); }));
});
