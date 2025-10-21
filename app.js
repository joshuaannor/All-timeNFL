const LIBRARIES = [
  {
    id: "nflverse",
    label: "nflverse roster (1999-present)",
    tag: "nflverse",
    urls: [
      "https://cdn.jsdelivr.net/gh/nflverse/nflfastR-roster/data/roster.csv",
      "https://raw.githubusercontent.com/nflverse/nflfastR-roster/master/data/roster.csv",
      "https://raw.githubusercontent.com/nflverse/nflfastR-roster/master/data/players.csv",
      "https://cdn.jsdelivr.net/gh/nflverse/nflfastR-roster/data/players.csv"
    ],
    fetchOptions: { cache: "force-cache", mode: "cors" }
  },
  {
    id: "legacy90s",
    label: "Legacy 1990s greats",
    tag: "90s legacy",
    urls: ["data/legacy_roster.csv"],
    fetchOptions: { cache: "no-cache" }
  }
];

const SEASON_FILTERS = [
  { id: "all", label: "All seasons" },
  { id: "1990s", label: "1990s standouts", from: 1990, to: 1999 },
  { id: "2000s", label: "2000s (2000-2009)", from: 2000, to: 2009 },
  { id: "2010s", label: "2010s (2010-2019)", from: 2010, to: 2019 },
  { id: "2020s", label: "2020s (2020-present)", from: 2020 },
  { id: "pre1990", label: "Pre-1990 legends", to: 1989 }
];

const CACHE_KEY_BASE = "nfl_lineup_players_v3";
const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days
const FALLBACK_CSV = `full_name,position,seasons
Tom Brady,QB,2000-2022
Joe Montana,QB,1979-1994
Peyton Manning,QB,1998-2015
Dan Marino,QB,1983-1999
John Elway,QB,1983-1998
Brett Favre,QB,1991-2010
Patrick Mahomes,QB,2017-2023
Barry Sanders,RB,1989-1998
Emmitt Smith,RB,1990-2004
Walter Payton,RB,1975-1987
Marshall Faulk,RB,1994-2005
LaDainian Tomlinson,RB,2001-2011
Jerry Rice,WR,1985-2004
Randy Moss,WR,1998-2012
Calvin Johnson,WR,2007-2015
Larry Fitzgerald,WR,2004-2020
Andre Reed,WR,1985-2000
Tony Gonzalez,TE,1997-2013
Rob Gronkowski,TE,2010-2021
Jason Kelce,C,2011-2023
Dermontti Dawson,C,1988-2000
Anthony Munoz,T,1980-1992
Jonathan Ogden,T,1996-2007
Larry Allen,G,1994-2007
Randall McDaniel,G,1988-2002
Shannon Sharpe,TE,1990-2003
Deion Sanders,DB,1989-2005
Reggie White,DE,1985-2000
Junior Seau,LB,1990-2009`;

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
  wired: false,
  library: null,
  seasonFilter: "all",
  libraryToken: 0
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
  librarySelect: $("#librarySelect"),
  seasonFilter: $("#seasonFilter"),
  lineupList: $("#lineupList"),
  exportBtn: $("#exportBtn"),
  clearBtn: $("#clearBtn")
};

const EMPTY_SET = new Set();
let searchTimer = null;

function getLibraryById(id) {
  return LIBRARIES.find((library) => library.id === id) || null;
}

function getSeasonFilterById(id) {
  return SEASON_FILTERS.find((filter) => filter.id === id) || null;
}

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
  if (els.librarySelect && state.library) {
    els.librarySelect.value = state.library.id;
  }
  if (els.seasonFilter) {
    els.seasonFilter.value = state.seasonFilter;
  }
  updatePoolCount();
  els.searchInput.value = "";
  els.results.innerHTML = "";
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
    const metaParts = [player.position || "—"];
    if (player.seasons) metaParts.push(player.seasons);
    if (player.libraryLabel) metaParts.push(player.libraryLabel);
    const metaText = metaParts.filter(Boolean).join(" • ");
    row.innerHTML = `
      <div>
        <div class="font-medium">${player.name}</div>
        <div class="text-xs text-neutral-400">${metaText}</div>
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
    if (!matchesSeasonFilter(player)) return false;
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

  if (els.librarySelect) {
    els.librarySelect.addEventListener("change", (event) => {
      const libraryId = event.target.value;
      switchLibrary(libraryId).catch((error) => {
        console.error(error);
        els.status.textContent = "Failed to load roster data.";
        els.status.classList.remove("hidden");
      });
    });
  }

  if (els.seasonFilter) {
    els.seasonFilter.addEventListener("change", (event) => {
      state.seasonFilter = event.target.value;
      if (state.currentSlot && els.searchInput.value.length >= 2) {
        doSearch(els.searchInput.value, state.currentSlot);
      }
    });
  }

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

function parseSeasonBounds(value) {
  if (!value) return null;
  const matches = Array.from(value.toString().matchAll(/(?:19|20)\d{2}/g));
  if (!matches.length) return null;
  const years = matches.map((match) => Number(match[0])).filter((year) => !Number.isNaN(year));
  if (!years.length) return null;
  return {
    start: Math.min(...years),
    end: Math.max(...years)
  };
}

function matchesSeasonFilter(player) {
  const filter = getSeasonFilterById(state.seasonFilter);
  if (!filter || filter.id === "all") return true;
  if (!player) return false;
  const start = typeof player.seasonStart === "number" ? player.seasonStart : null;
  const end = typeof player.seasonEnd === "number" ? player.seasonEnd : start;
  if (start == null && end == null) return true;
  if (filter.from != null && (end == null || end < filter.from)) return false;
  if (filter.to != null && (start == null || start > filter.to)) return false;
  return true;
}

function normalizeRows(rows, libraryId) {
  const map = new Map();
  const library = getLibraryById(libraryId);
  const libraryLabel = library ? library.tag || library.label : "";

  for (const row of rows) {
    const name = (row.full_name || row.player_name || row.name || "").trim();
    const position = (row.position || row.pos || "").trim().toUpperCase();
    const seasons = (row.season || row.seasons || row.years_active || "").toString();
    const bounds = parseSeasonBounds(seasons);

    if (!name) continue;

    const player = {
      name,
      position: position || "—",
      seasons,
      name_l: name.toLowerCase(),
      libraryId,
      libraryLabel,
      seasonStart: bounds ? bounds.start : null,
      seasonEnd: bounds ? bounds.end : null
    };

    const key = `${player.name}|${player.position}`;
    if (!map.has(key)) {
      map.set(key, player);
    }
  }

  return [...map.values()];
}

function getCacheKey(libraryId) {
  return `${CACHE_KEY_BASE}_${libraryId}`;
}

function readCache(libraryId) {
  if (!libraryId) return null;
  try {
    const raw = localStorage.getItem(getCacheKey(libraryId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.pool)) return null;
    if (Date.now() - parsed.ts > CACHE_TTL_MS) return null;
    return parsed.pool;
  } catch (error) {
    console.warn(`Unable to read roster cache for ${libraryId}`, error);
    return null;
  }
}

function writeCache(libraryId, pool) {
  if (!libraryId) return;
  try {
    localStorage.setItem(getCacheKey(libraryId), JSON.stringify({ ts: Date.now(), pool }));
  } catch (error) {
    console.warn(`Unable to persist roster cache for ${libraryId}`, error);
  }
}

async function fetchFirstWorking(urls, options = {}) {
  let lastError;
  for (const url of urls) {
    try {
      const fetchOptions = { cache: "force-cache", ...options };
      if (fetchOptions.mode == null && /^https?:/i.test(url)) {
        fetchOptions.mode = "cors";
      }
      const response = await fetch(url, fetchOptions);
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

function getLibraryLabel(library = state.library) {
  return library ? library.label : "Player library";
}

function updatePoolCount(extra) {
  if (!els.poolCount) return;
  const libraryLabel = getLibraryLabel();
  const count = state.pool.length ? state.pool.length.toLocaleString() : "0";
  let suffix = "";
  if (typeof extra === "string") {
    suffix = extra;
  } else if (!state.pool.length && state.library) {
    suffix = " • loading…";
  }
  els.poolCount.textContent = `${libraryLabel} • ${count} players${suffix}`;
}

function populateLibrarySelect() {
  if (!els.librarySelect) return;
  const current = state.library ? state.library.id : null;
  els.librarySelect.innerHTML = "";
  LIBRARIES.forEach((library) => {
    const option = document.createElement("option");
    option.value = library.id;
    option.textContent = library.label;
    if (library.id === current) {
      option.selected = true;
    }
    els.librarySelect.appendChild(option);
  });
}

function populateSeasonFilter() {
  if (!els.seasonFilter) return;
  const current = state.seasonFilter;
  els.seasonFilter.innerHTML = "";
  SEASON_FILTERS.forEach((filter) => {
    const option = document.createElement("option");
    option.value = filter.id;
    option.textContent = filter.label;
    if (filter.id === current) {
      option.selected = true;
    }
    els.seasonFilter.appendChild(option);
  });
}

function getSourceHost(source) {
  if (!source) return "";
  try {
    const url = new URL(source, window.location.href);
    return url.host;
  } catch (error) {
    console.warn("Unable to parse source host", error);
    return "";
  }
}

async function loadRoster(library = state.library) {
  if (!library) {
    throw new Error("No library selected");
  }

  const cached = readCache(library.id);
  if (cached) {
    return { pool: cached, cached: true };
  }

  try {
    const { text, source } = await fetchFirstWorking(library.urls, library.fetchOptions);
    const rows = parseCSV(text);
    const pool = normalizeRows(rows, library.id);
    writeCache(library.id, pool);
    return { pool, source, cached: false };
  } catch (error) {
    console.warn(`Library ${library.id} failed, using fallback`, error);
    const rows = parseCSV(FALLBACK_CSV);
    const pool = normalizeRows(rows, library.id);
    return { pool, fallback: true, error };
  }
}

async function switchLibrary(libraryId) {
  const library = getLibraryById(libraryId) || LIBRARIES[0];
  if (!library) {
    throw new Error(`Unknown library: ${libraryId}`);
  }

  const token = (state.libraryToken += 1);
  state.library = library;
  if (els.librarySelect && els.librarySelect.value !== library.id) {
    els.librarySelect.value = library.id;
  }
  state.pool = [];
  updatePoolCount();

  if (els.status) {
    els.status.textContent = `Loading ${library.label}…`;
    els.status.classList.remove("hidden");
  }

  const result = await loadRoster(library);
  if (token !== state.libraryToken) {
    return result;
  }

  state.pool = result.pool || [];

  if (result.cached) {
    updatePoolCount(" (cached)");
    els.status.classList.add("hidden");
  } else if (result.fallback) {
    updatePoolCount(" • fallback");
    els.status.textContent = "Loaded fallback roster data.";
    els.status.classList.remove("hidden");
  } else {
    const host = library.id === "legacy90s" ? "local asset" : getSourceHost(result.source);
    updatePoolCount(host ? ` • ${host}` : "");
    els.status.classList.add("hidden");
  }

  if (state.currentSlot && els.searchInput.value.length >= 2) {
    doSearch(els.searchInput.value, state.currentSlot);
  }

  return result;
}

function bootstrap() {
  if (!LIBRARIES.length) {
    console.error("No data libraries configured.");
    return;
  }

  state.library = LIBRARIES[0];
  state.seasonFilter = SEASON_FILTERS[0]?.id || "all";
  populateLibrarySelect();
  populateSeasonFilter();
  attachStaticListeners();
  updateLineupList();
  updatePoolCount();
  switchLibrary(state.library.id).catch((error) => {
    console.error(error);
    els.status.textContent = "Failed to load roster data.";
    els.status.classList.remove("hidden");
  });
}

bootstrap();
