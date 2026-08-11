const PAGE_SIZE = 25;

const elements = {
  results: document.querySelector("#results"),
  input: document.querySelector("#search-input"),
  clear: document.querySelector("#clear-search"),
  count: document.querySelector("#result-count"),
  date: document.querySelector("#data-date"),
  context: document.querySelector("#search-context"),
  sort: document.querySelector("#sort-select"),
  pagination: document.querySelector("#pagination"),
  previous: document.querySelector("#previous-page"),
  next: document.querySelector("#next-page"),
  pageInfo: document.querySelector("#page-info"),
  empty: document.querySelector("#empty-state"),
  error: document.querySelector("#error-state"),
  install: document.querySelector("#install-app"),
  installDialog: document.querySelector("#install-dialog"),
  installInstructions: document.querySelector("#install-instructions"),
  closeInstall: document.querySelector("#close-install"),
  networkStatus: document.querySelector("#network-status"),
};

const state = { medicines: [], filtered: [], page: 1, query: "", sort: "name-asc" };

function searchable(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("de")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function matchesQuery(medicine, query) {
  if (!query) return true;
  const terms = searchable(query).split(/\s+/).filter(Boolean);
  const haystack = searchable([
    medicine.name,
    medicine.inn,
    ...(medicine.areas || []),
    medicine.indication,
  ].join(" "));
  return terms.every((term) => haystack.includes(term));
}

function sortMedicines(medicines, sort) {
  const copy = [...medicines];
  const field = sort.startsWith("inn") ? "inn" : "name";
  const direction = sort.endsWith("desc") ? -1 : 1;
  return copy.sort((a, b) =>
    direction * String(a[field] || "").localeCompare(String(b[field] || ""), "de", { sensitivity: "base" }),
  );
}

function splitIndications(value) {
  const text = String(value ?? "")
    .replace("\ufeff", "")
    .replace(/\u00a0/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\be\.g\./gi, "for example")
    .replace(/\bi\.e\./gi, "that is")
    .replace(/\s+/g, " ")
    .trim();

  if (!text) return [];

  const parts = [];
  const boundary = /;|\.(?=[A-Za-z])|\.\s+/g;
  let start = 0;
  let match;

  while ((match = boundary.exec(text)) !== null) {
    const isPeriod = match[0].startsWith(".");
    const end = match.index + (isPeriod ? 1 : 0);
    const part = text.slice(start, end).trim();
    if (part) parts.push(part);
    start = match.index + match[0].length;
  }

  const remainder = text.slice(start).trim();
  if (remainder) parts.push(remainder);
  return parts.length ? parts : [text];
}

function appendHighlightedText(container, text, query) {
  const terms = String(query ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);

  if (!terms.length) {
    container.textContent = text;
    return;
  }

  const escapedTerms = [...new Set(terms)]
    .map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const matcher = new RegExp(`(${escapedTerms.join("|")})`, "gi");

  for (const part of String(text).split(matcher)) {
    if (!part) continue;
    if (terms.some((term) => term.toLocaleLowerCase("de") === part.toLocaleLowerCase("de"))) {
      const mark = document.createElement("mark");
      mark.className = "search-highlight";
      mark.textContent = part;
      container.append(mark);
    } else {
      container.append(document.createTextNode(part));
    }
  }
}

function medicineCard(medicine) {
  const article = document.createElement("article");
  article.className = "medicine";

  const identity = document.createElement("div");
  const name = document.createElement("h2");
  name.textContent = medicine.name;
  const nameLabel = label("Handelsname");
  identity.append(nameLabel, name);

  const innWrap = document.createElement("div");
  const innLabel = label("Wirkstoff / INN");
  const inn = document.createElement("p");
  inn.className = "medicine__inn";
  inn.textContent = medicine.inn || "Nicht angegeben";
  innWrap.append(innLabel, inn);

  const details = document.createElement("div");
  const areasLabel = label("Therapiegebiet & Indikation");
  const tags = document.createElement("div");
  tags.className = "tags";
  for (const area of medicine.areas || []) {
    const tag = document.createElement("span");
    tag.className = "tag";
    tag.textContent = area;
    tags.append(tag);
  }
  details.append(areasLabel, tags);

  if (medicine.indication) {
    const indicationDetails = document.createElement("details");
    indicationDetails.className = "medicine__details";

    const summary = document.createElement("summary");
    const closedLabel = document.createElement("span");
    closedLabel.className = "summary__closed";
    closedLabel.textContent = "Vollständige Indikation anzeigen";
    const openLabel = document.createElement("span");
    openLabel.className = "summary__open";
    openLabel.textContent = "Indikation einklappen";
    summary.append(closedLabel, openLabel);

    const preview = document.createElement("p");
    preview.className = "medicine__indication medicine__indication--preview";
    appendHighlightedText(preview, medicine.indication, state.query);

    const fullIndication = document.createElement("div");
    fullIndication.className = "medicine__indication medicine__indication--full";
    for (const indicationPart of splitIndications(medicine.indication)) {
      const paragraph = document.createElement("p");
      appendHighlightedText(paragraph, indicationPart, state.query);
      fullIndication.append(paragraph);
    }

    indicationDetails.append(preview, summary, fullIndication);
    details.append(indicationDetails);
  } else {
    const indication = document.createElement("p");
    indication.className = "medicine__indication";
    indication.textContent = "Keine Indikation angegeben.";
    details.append(indication);
  }

  const link = document.createElement("a");
  link.className = "medicine__link";
  link.href = medicine.url;
  link.target = "_blank";
  link.rel = "noreferrer";
  link.textContent = "Bei der EMA";
  link.setAttribute("aria-label", `${medicine.name} bei der EMA öffnen`);

  article.append(identity, innWrap, details, link);
  return article;
}

function label(text) {
  const element = document.createElement("span");
  element.className = "medicine__label";
  element.textContent = text;
  return element;
}

function update() {
  state.filtered = sortMedicines(
    state.medicines.filter((medicine) => matchesQuery(medicine, state.query)),
    state.sort,
  );
  const pageCount = Math.max(1, Math.ceil(state.filtered.length / PAGE_SIZE));
  state.page = Math.min(state.page, pageCount);
  render(pageCount);
}

function render(pageCount) {
  elements.results.replaceChildren();
  const start = (state.page - 1) * PAGE_SIZE;
  const pageItems = state.filtered.slice(start, start + PAGE_SIZE);
  const fragment = document.createDocumentFragment();
  pageItems.forEach((medicine) => fragment.append(medicineCard(medicine)));
  elements.results.append(fragment);
  elements.results.setAttribute("aria-busy", "false");

  elements.count.textContent = `${state.filtered.length.toLocaleString("de-DE")} Arzneimittel`;
  elements.context.textContent = state.query
    ? `Ergebnisse für „${state.query}“`
    : "Alle zugelassenen Präparate";
  elements.empty.hidden = state.filtered.length !== 0;
  elements.results.hidden = state.filtered.length === 0;
  elements.pagination.hidden = state.filtered.length <= PAGE_SIZE;
  elements.previous.disabled = state.page === 1;
  elements.next.disabled = state.page === pageCount;
  elements.pageInfo.textContent = `Seite ${state.page} von ${pageCount}`;
  elements.clear.hidden = !state.query;
}

function showSkeletons() {
  for (let index = 0; index < 5; index += 1) {
    const skeleton = document.createElement("div");
    skeleton.className = "skeleton";
    skeleton.setAttribute("aria-hidden", "true");
    elements.results.append(skeleton);
  }
}

async function load() {
  showSkeletons();
  try {
    const response = await fetch("data/medicines.json");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    state.medicines = payload.medicines || [];
    const timestamp = payload.meta?.sourceTimestamp;
    elements.date.textContent = timestamp
      ? `EMA-Datenstand: ${new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Berlin" }).format(new Date(timestamp))}`
      : "";
    update();
  } catch (error) {
    console.error(error);
    elements.results.replaceChildren();
    elements.results.hidden = true;
    elements.error.hidden = false;
    elements.count.textContent = "Daten nicht verfügbar";
  }
}

let inputTimer;
elements.input.addEventListener("input", () => {
  clearTimeout(inputTimer);
  inputTimer = setTimeout(() => {
    state.query = elements.input.value.trim();
    state.page = 1;
    update();
  }, 120);
});

elements.clear.addEventListener("click", () => {
  elements.input.value = "";
  state.query = "";
  state.page = 1;
  elements.input.focus();
  update();
});

elements.sort.addEventListener("change", () => {
  state.sort = elements.sort.value;
  state.page = 1;
  update();
});

elements.previous.addEventListener("click", () => {
  state.page -= 1;
  update();
  document.querySelector("#main-content").scrollIntoView({ behavior: "smooth" });
});

elements.next.addEventListener("click", () => {
  state.page += 1;
  update();
  document.querySelector("#main-content").scrollIntoView({ behavior: "smooth" });
});

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches
    || window.navigator.standalone === true;
}

function isIos() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent)
    || (window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1);
}

function updateNetworkStatus() {
  elements.networkStatus.hidden = window.navigator.onLine;
}

let installPrompt;

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  installPrompt = event;
  if (!isStandalone()) elements.install.hidden = false;
});

window.addEventListener("appinstalled", () => {
  installPrompt = undefined;
  elements.install.hidden = true;
  elements.installDialog.close();
});

elements.install.addEventListener("click", async () => {
  if (installPrompt) {
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") elements.install.hidden = true;
    installPrompt = undefined;
    return;
  }

  elements.installInstructions.innerHTML = isIos()
    ? "<p>Öffne diese Seite gegebenenfalls in Safari. Tippe dort auf <strong>Teilen</strong> <span aria-hidden=\"true\">□↑</span> und anschließend auf <strong>Zum Home-Bildschirm</strong>.</p>"
    : "<p>Öffne das Browsermenü und wähle <strong>App installieren</strong> oder <strong>Zum Startbildschirm hinzufügen</strong>.</p>";
  elements.installDialog.showModal();
});

elements.closeInstall.addEventListener("click", () => elements.installDialog.close());
elements.installDialog.addEventListener("click", (event) => {
  if (event.target === elements.installDialog) elements.installDialog.close();
});

window.addEventListener("online", updateNetworkStatus);
window.addEventListener("offline", updateNetworkStatus);
updateNetworkStatus();

if (isIos() && !isStandalone()) elements.install.hidden = false;

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch((error) => {
      console.error("Service Worker konnte nicht registriert werden:", error);
    });
  });
}

load();
