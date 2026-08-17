// Category taxonomy for abandoned-place classification.
// `minutes` is the default on-site visit duration used by the itinerary planner.
const CATEGORIES = {
  industrial: { label: "Industriale", color: "#b8551f", glyph: "factory", minutes: 90 },
  hospital: { label: "Ospedale / Manicomio", color: "#7c8a5e", glyph: "cross", minutes: 120 },
  military: { label: "Militare / Bunker", color: "#5c6b73", glyph: "shield", minutes: 75 },
  villa: { label: "Villa / Residenza", color: "#a8763e", glyph: "home", minutes: 60 },
  religious: { label: "Religioso", color: "#8a7ab5", glyph: "church", minutes: 45 },
  rural: { label: "Rurale / Casolare", color: "#8a9a5b", glyph: "barn", minutes: 45 },
  infrastructure: { label: "Infrastruttura", color: "#4f7a8a", glyph: "bridge", minutes: 60 },
  underground: { label: "Sotterraneo", color: "#4a4640", glyph: "cave", minutes: 90 },
  leisure: { label: "Parco / Svago", color: "#c48a3c", glyph: "ferris", minutes: 90 },
  other: { label: "Altro", color: "#8b96a1", glyph: "pin", minutes: 60 }
};

const ACCESS_LEVELS = {
  unknown: { label: "Da verificare", color: "#8b96a1" },
  easy: { label: "Facile", color: "#7c8a5e" },
  medium: { label: "Media", color: "#d9a441" },
  hard: { label: "Difficile", color: "#b8551f" },
  sealed: { label: "Murato / Sorvegliato", color: "#a83232" }
};

function categoryList() {
  return Object.entries(CATEGORIES).map(([id, c]) => ({ id, ...c }));
}

function accessList() {
  return Object.entries(ACCESS_LEVELS).map(([id, a]) => ({ id, ...a }));
}
