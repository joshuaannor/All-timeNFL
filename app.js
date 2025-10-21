const ROSTER_URLS = [
  "https://cdn.jsdelivr.net/gh/nflverse/nflfastR-roster/data/roster.csv",
  "https://raw.githubusercontent.com/nflverse/nflfastR-roster/master/data/roster.csv",
  "https://raw.githubusercontent.com/nflverse/nflfastR-roster/master/data/players.csv",
  "https://cdn.jsdelivr.net/gh/nflverse/nflfastR-roster/data/players.csv"
];

const CACHE_KEY = "nfl_lineup_players_v2";
const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days
const FALLBACK_CSV = `full_name,position,season
Tom Brady,QB,2000-2022
Joe Montana,QB,1979-1994
Peyton Manning,QB,1998-2015
Jerry Rice,WR,1985-2004
Randy Moss,WR,1998-2012
Jim Brown,RB,1957-1965
Walter Payton,RB,1975-1987
Rob Gronkowski,TE,2010-2021
Jason Kelce,C,2011-2023
Anthony Munoz,T,1980-1992
Larry Allen,G,1994-2007`;

const acceptMap = {
  QB: new Set(["QB"]),
  HB: new Set(["RB", "HB"]),
  FB: new Set(["FB"]),
  WR1: new Set(["WR"]),
  WR2: new Set(["WR"]),
  TE: new Set(["TE"]),
  LT: new Set(["T", "OT"]),
  LG: new Set(["G", "OG"]),
  C: new Set(["C"]),
  RG: new Set(["G", "OG"]),
  RT: new Set(["T", "OT"])
};

const state = {
  pool: [],
  bySlot: {},
  currentSlot: null,
  wired: false
};

const $ = (selector) => document.querySelector(selector);

const els = {
  picker: $("#picker"),
  pickerTitle: $("#pickerTitle"),
  acceptLabel: $("#acceptLabel"),
  poolCount: $("#poolCount"),
  status: $("#status"),
  searchInput: $("#searchInput"),
  results: $("#results"),
  closePicker: $("#closePicker"),
  lineupList: $("#lineupList"),
  exportBtn: $("#exportBtn"),
  clearBtn: $("#clearBtn")
};

const EMPTY_SET = new Set();
let searchTimer = null;

function updateLineupList() {
  els.lineupList.innerHTML = "";
  const slots = ["LT", "LG", "C", "RG", "RT", "TE", "WR1", "WR2", "QB", "FB", "HB"];
  for (const slot of slots) {
    const li = document.createElement("li");
    const value = state.bySlot[slot] || "—";
    li.innerHTML = `<span class="text-neutral-400">${slot}</span>: <span class="font-medium">${value}</span>`;
    els.lineupList.appendChild(li);
  }
}

function setSlotName(slot, name) {
  state.bySlot[slot] = name;
  const chip = document.querySelector(`.pos[data-slot="${slot}"] [data-name]`);
  if (chip) {
    chip.textContent = name;
  }
  updateLineupList();
}

function openPicker(slot) {
  state.currentSlot = slot;
  els.pickerTitle.textContent = `Pick for ${slot}`;
  const allowed = acceptMap[slot] || EMPTY_SET;
  const allowedList = allowed.size ? [...allowed].join(", ") : "Any";
  els.acceptLabel.textContent = `Allowed positions: ${allowedList}`;
  const poolLoadedText = state.pool.length
    ? `Loaded players: ${state.pool.length.toLocaleString()}`
    : "Player pool loading…";
  els.poolCount.textContent = poolLoadedText;
  els.searchInput.value = "";
  els.results.innerHTML = "";
  els.status.classList.add("hidden");
  els.picker.classList.add("open");
  els.picker.setAttribute("aria-hidden", "false");
  setTimeout(() => els.searchInput.focus(), 0);
}

function closePicker() {
  els.picker.classList.remove("open");
  els.picker.setAttribute("aria-hidden", "true");
  els.searchInput.value = "";
  els.results.innerHTML = "";
  state.currentSlot = null;
}

function renderResults(items) {
  els.results.innerHTML = "";
  if (!items.length) {
    els.results.innerHTML = '<div class="px-3 py-3 text-sm text-neutral-400">No matches.</div>';
    return;
  }

  const fragment = document.createDocumentFragment();
  items.slice(0, 200).forEach((player) => {
    const row = document.createElement("div");
    row.className = "listItem px-3 py-2 flex items-center justify-between";
    row.innerHTML = `
      <div>
        <div class="font-medium">${player.name}</div>
        <div class="text-xs text-neutral-400">${player.position}${player.seasons ? ` • ${player.seasons}` : ""}</div>
      </div>
      <button class="px-2 py-1 text-xs rounded bg-[var(--brand)] hover:bg-[var(--brand-dark)]">Select</button>
    `;
    row.querySelector("button").addEventListener("click", () => {
      setSlotName(state.currentSlot, player.name);
      closePicker();
    });
    fragment.appendChild(row);
  });

  els.results.appendChild(fragment);
}

function doSearch(query, slot) {
  if (!slot || !query || query.length < 2) {
    els.results.innerHTML = "";
    return;
  }

  const normalizedQuery = query.toLowerCase();
  const allowed = acceptMap[slot] || EMPTY_SET;
  const results = state.pool.filter((player) => {
    if (!player.name_l.includes(normalizedQuery)) return false;
    if (!allowed.size) return true;
    return allowed.has(player.position);
  });

  renderResults(results);
}

function handleSearchInput(event) {
  const value = event.target.value;
  const slot = state.currentSlot;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => doSearch(value, slot), 120);
}

function attachStaticListeners() {
  if (state.wired) return;

  document.querySelectorAll(".pos").forEach((el) =>
    el.addEventListener("click", () => openPicker(el.dataset.slot))
  );

  els.searchInput.addEventListener("input", handleSearchInput);
  els.closePicker.addEventListener("click", closePicker);
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closePicker();
    }
  });
  els.picker.addEventListener("click", (event) => {
    if (event.target === els.picker) {
      closePicker();
    }
  });

  els.exportBtn.addEventListener("click", () => {
    const data = JSON.stringify(state.bySlot, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "all_time_lineup.json";
    anchor.click();
    URL.revokeObjectURL(url);
  });

  els.clearBtn.addEventListener("click", () => {
    if (!confirm("Clear all selections?")) return;
    state.bySlot = {};
    document.querySelectorAll("[data-name]").forEach((node) => {
      node.textContent = "Empty";
    });
    updateLineupList();
  });

  state.wired = true;
}

function parseCSV(text) {
  const lines = text.split(/\r?\n/);
  const header = lines.shift()?.split(",") || [];
  const output = [];

  for (const line of lines) {
    if (!line) continue;
    const cells = [];
    let current = "";
    let quoted = false;

    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      if (char === '"') {
        if (quoted && line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          quoted = !quoted;
        }
      } else if (char === "," && !quoted) {
        cells.push(current);
        current = "";
      } else {
        current += char;
      }
    }

    cells.push(current);
    const row = {};
    header.forEach((key, index) => {
      row[key] = cells[index] ?? "";
    });
    output.push(row);
  }

  return output;
}

function normalizeRows(rows) {
  const map = new Map();

  for (const row of rows) {
    const name = (row.full_name || row.player_name || row.name || "").trim();
    const position = (row.position || row.pos || "").trim().toUpperCase();
    const seasons = (row.season || row.seasons || row.years_active || "").toString();

    if (!name) continue;

    const player = {
      name,
      position: position || "—",
      seasons,
      name_l: name.toLowerCase()
    };

    const key = `${player.name}|${player.position}`;
    if (!map.has(key)) {
      map.set(key, player);
    }
  }

  return [...map.values()];
}

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.pool)) return null;
    if (Date.now() - parsed.ts > CACHE_TTL_MS) return null;
    return parsed.pool;
  } catch (error) {
    console.warn("Unable to read roster cache", error);
    return null;
  }
}

function writeCache(pool) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), pool }));
  } catch (error) {
    console.warn("Unable to persist roster cache", error);
  }
}

async function fetchFirstWorking(urls) {
  let lastError;
  for (const url of urls) {
    try {
      const response = await fetch(url, { cache: "force-cache", mode: "cors" });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const text = await response.text();
      if (!text || text.length < 500) {
        throw new Error("Unexpected small file");
      }
      return { text, source: url };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("All sources failed");
}

function updatePoolCount(extra = "") {
  if (!els.poolCount) return;
  const base = state.pool.length
    ? `Loaded players: ${state.pool.length.toLocaleString()}`
    : "Loaded players: 0";
  els.poolCount.textContent = `${base}${extra}`;
}

async function loadRoster() {
  const cached = readCache();
  if (cached) {
    state.pool = cached;
    updatePoolCount(" (cached)");
    return;
  }

  els.status.textContent = "Loading roster…";
  els.status.classList.remove("hidden");

  try {
    const { text, source } = await fetchFirstWorking(ROSTER_URLS);
    const rows = parseCSV(text);
    state.pool = normalizeRows(rows);
    writeCache(state.pool);
    const host = source ? new URL(source).hostname : "";
    updatePoolCount(host ? ` • ${host}` : "");
    els.status.classList.add("hidden");
  } catch (error) {
    console.warn("Remote roster failed, using fallback", error);
    const rows = parseCSV(FALLBACK_CSV);
    state.pool = normalizeRows(rows);
    updatePoolCount(" • fallback");
    els.status.textContent = "Loaded fallback roster data.";
  }
}

function bootstrap() {
  attachStaticListeners();
  updateLineupList();
  updatePoolCount();
  loadRoster().catch((error) => {
    console.error(error);
    els.status.textContent = "Failed to load roster data.";
    els.status.classList.remove("hidden");
  });
}

bootstrap();
