document.head.insertAdjacentHTML("beforeend",`<style>.topline{display:flex;align-items:center;justify-content:space-between;gap:20px}.topline .eyebrow{margin:0}.install{padding:9px 13px;border:1px solid rgba(255,255,255,.4);border-radius:999px;color:#fff;background:rgba(255,255,255,.08);font-weight:700;cursor:pointer}dialog{width:min(420px,calc(100% - 32px));padding:30px;border:0;border-radius:16px;color:var(--ink);box-shadow:0 24px 80px rgba(7,26,61,.35)}dialog::backdrop{background:rgba(7,26,61,.68)}dialog h2{margin:0 0 12px;font:600 2rem "Newsreader",Georgia,serif}.close{position:absolute;top:10px;right:14px;border:0;color:var(--muted);background:transparent;font-size:1.6rem;cursor:pointer}@media(max-width:480px){.topline{align-items:flex-start;flex-direction:column}}</style>`);
let installPrompt;const installButton=document.querySelector("#install-app"),dialog=document.querySelector("#install-dialog"),instructions=document.querySelector("#install-instructions");const isIos=/iphone|ipad|ipod/i.test(navigator.userAgent)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1),isStandalone=matchMedia("(display-mode: standalone)").matches||navigator.standalone===true;window.addEventListener("beforeinstallprompt",event=>{event.preventDefault();installPrompt=event;installButton.hidden=false});installButton.addEventListener("click",async()=>{if(installPrompt){await installPrompt.prompt();await installPrompt.userChoice;installPrompt=undefined;return}instructions.innerHTML=isIos?"<p>Tippe in Safari auf <strong>Teilen</strong> und anschließend auf <strong>Zum Home-Bildschirm</strong>.</p>":"<p>Öffne das Browsermenü und wähle <strong>App installieren</strong> oder <strong>Zum Startbildschirm hinzufügen</strong>.</p>";dialog.showModal()});document.querySelector("#close-install").addEventListener("click",()=>dialog.close());dialog.addEventListener("click",event=>{if(event.target===dialog)dialog.close()});if(isStandalone)installButton.hidden=true;

document.head.insertAdjacentHTML("beforeend", `<style>
.app-actions{display:flex;flex-wrap:wrap;gap:10px}
.app-actions button{min-height:44px}
.app-actions button:focus-visible{outline:3px solid #fff;outline-offset:3px}
.app-actions button:disabled{opacity:.65;cursor:wait}
#refresh-status{font-size:.9rem;color:#fff}
#refresh-status:empty{display:none}
</style>`);
const refreshButton = document.querySelector("#refresh-app");
const refreshStatus = document.querySelector("#refresh-status");
const appBase = new URL("./", location.href);
let registrationPromise;
function registerWorker() {
  if (!("serviceWorker" in navigator)) return Promise.resolve(null);
  if (!registrationPromise) {
    registrationPromise = navigator.serviceWorker.register(new URL("service-worker.js", appBase), {updateViaCache:"none"})
      .catch(error => { registrationPromise = undefined; throw error; });
  }
  return registrationPromise;
}
function waitForActivation(worker) {
  if (!worker || worker.state === "activated") return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => finish(new Error("Update dauert zu lange.")), 15000);
    function finish(error) {
      clearTimeout(timer);
      worker.removeEventListener("statechange", changed);
      error ? reject(error) : resolve();
    }
    function changed() {
      if (worker.state === "activated") finish();
      if (worker.state === "redundant") finish(new Error("Update fehlgeschlagen."));
    }
    worker.addEventListener("statechange", changed);
    changed();
  });
}
registerWorker().catch(() => {});
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") registerWorker().then(reg => reg && reg.update()).catch(() => {});
});
refreshButton.addEventListener("click", async () => {
  refreshButton.disabled = true;
  refreshButton.textContent = "↻ Wird aktualisiert …";
  refreshStatus.textContent = "Aktuelle App wird geladen …";
  try {
    if (navigator.onLine === false) throw new Error("offline");
    const target = new URL(location.href);
    target.searchParams.set("_refresh", Date.now().toString());
    // Verify connectivity before removing the offline copy.
    const response = await fetch(target, {cache:"no-store", signal:AbortSignal.timeout(15000)});
    if (!response.ok || !response.headers.get("content-type")?.includes("text/html")) throw new Error("Laden fehlgeschlagen");
    const reg = await registerWorker();
    if (reg) {
      await reg.update();
      await waitForActivation(reg.installing || reg.waiting);
    }
    if ("caches" in window) {
      const names = await caches.keys();
      await Promise.all(names.filter(name => name.startsWith("medical-search-tools-")).map(name => caches.delete(name)));
    }
    location.replace(target.href);
  } catch (error) {
    refreshStatus.textContent = "Aktualisierung nicht möglich. Bitte Internetverbindung prüfen und erneut versuchen.";
    refreshButton.disabled = false;
    refreshButton.textContent = "↻ App aktualisieren";
  }
});

if (new URL(location.href).searchParams.has("_refresh")) {
  const cleanURL = new URL(location.href);
  cleanURL.searchParams.delete("_refresh");
  history.replaceState(history.state, "", cleanURL);
}
