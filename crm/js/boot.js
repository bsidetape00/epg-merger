"use strict";
/* Boot: apply theme, register the service worker (offline), draw the first screen. */

applyTheme(DB.settings.theme);

if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
if (!location.hash) history.replaceState(null, "", "#/home");
render();
