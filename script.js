const DIGITS = "0123456789ABCDEF";
const KEYS = {
  sets: "hex-box-saved-sets",
  swatches: "hex-box-saved-swatches",
  palettes: "hex-box-saved-palettes"
};
const DEFAULT_SETS = [
  { name: "Default Gray", colors: ["000", "888", "FFF"], hexMode: 3, permanent: true },
  { name: "Default RGB", colors: ["F00", "0F0", "F0F"], hexMode: 3, permanent: true }
];

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const read = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
};
const write = (key, value) => localStorage.setItem(key, JSON.stringify(value));
const normalize = (color) => String(color || "").replace("#", "").toUpperCase();
const six = (color) => {
  const value = normalize(color);
  return value.length === 3 ? value.split("").map((digit) => digit + digit).join("") : value;
};
const three = (color) => {
  const value = six(color);
  return value[0] + value[2] + value[4];
};
const convert = (color, mode) => mode === 3 ? three(color) : six(color);
const cssColor = (color) => `#${six(color)}`;
const escapeHtml = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

let hexMode = 3;
let builderColor = "888";
let activeDigit = 0;
let editing = false;
const setSize = 5;
let setSlots = ["000", "444", "888", "BBB", "FFF"];
let selectedSetIndex = 2;
let paletteSlots = Array(8).fill(null);
let savedSets = read(KEYS.sets, []);
let savedSwatches = read(KEYS.swatches, []);
let savedPalettes = read(KEYS.palettes, []);
let editingSetIndex = null;
let editingPaletteSetIndex = null;
let editingPaletteIndex = null;
let undoStack = [];
let redoStack = [];
let selectedTrayIndex = null;
let selectedPaletteIndex = null;
let selectedPaletteColor = null;

if (!Array.isArray(savedSwatches)) savedSwatches = [];
savedSets = savedSets.map((set, index) => Array.isArray(set)
  ? { name: set.map((color) => `#${normalize(color)}`).join(" "), colors: set, hexMode: normalize(set[0]).length || 3 }
  : { name: set.name || `Set ${index + 1}`, colors: set.colors || [], hexMode: set.hexMode || normalize(set.colors?.[0]).length || 3 });
savedPalettes = savedPalettes.map((palette, index) => {
  if (Array.isArray(palette.sets)) return palette;
  const colors = (palette.colors || []).filter(Boolean);
  return {
    name: palette.name || `Palette ${index + 1}`,
    sets: colors.length ? [{ name: "Imported Set", colors, hexMode: normalize(colors[0]).length || 3 }] : []
  };
});

function textColor(color) {
  const [r, g, b] = six(color).match(/../g).map((part) => parseInt(part, 16));
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance > .55 ? "#000" : "#fff";
}

function rgb(color) {
  return six(color).match(/../g).map((part) => parseInt(part, 16));
}

function fromRgb(channels) {
  const value = channels.map((channel) => Math.max(0, Math.min(255, Math.round(channel))).toString(16).padStart(2, "0")).join("").toUpperCase();
  return convert(value, hexMode);
}

function rgbToHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  const d = max - min;
  if (d) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  return [(h + 360) % 360, s, l];
}

function hslToRgb([h, s, l]) {
  s = Math.max(0, Math.min(1, s)); l = Math.max(0, Math.min(1, l));
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = l - c / 2;
  let values = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return values.map((value) => (value + m) * 255);
}

function snapshot() {
  return { builderColor, hexMode, activeDigit };
}

function record() {
  undoStack.push(snapshot());
  if (undoStack.length > 100) undoStack.shift();
  redoStack = [];
}

function restore(state) {
  builderColor = state.builderColor;
  setSlots[selectedSetIndex] = builderColor;
  hexMode = state.hexMode;
  activeDigit = Math.min(state.activeDigit, hexMode - 1);
  renderBuilder();
  renderSetBuilder();
  updateControls();
}

function alertUser(message) {
  $("#warning-message").textContent = message;
  bootstrap.Modal.getOrCreateInstance($("#warning-modal")).show();
}

function pulse(element) {
  element.classList.remove("pulse");
  void element.offsetWidth;
  element.classList.add("pulse");
  setTimeout(() => element.classList.remove("pulse"), 650);
}

function dragData(event, data) {
  event.dataTransfer.effectAllowed = "copyMove";
  event.dataTransfer.setData("text/plain", JSON.stringify(data));
}

function getDrag(event) {
  try { return JSON.parse(event.dataTransfer.getData("text/plain")); }
  catch { return null; }
}

function setBuilderColor(nextColor, shouldRecord = true) {
  const next = convert(nextColor, hexMode);
  if (next === builderColor) return;
  if (shouldRecord) record();
  builderColor = next;
  setSlots[selectedSetIndex] = next;
  renderBuilder();
  renderSetBuilder();
}

function stepDigit(index, amount) {
  record();
  const parts = builderColor.split("");
  parts[index] = DIGITS[(DIGITS.indexOf(parts[index]) + amount + 16) % 16];
  builderColor = parts.join("");
  setSlots[selectedSetIndex] = builderColor;
  activeDigit = index;
  renderBuilder();
  renderSetBuilder();
}

function enterEdit(index = activeDigit) {
  editing = true;
  activeDigit = Math.max(0, Math.min(hexMode - 1, index));
  renderSetBuilder();
  renderBuilder();
  const input = $(`[data-set-digit="${selectedSetIndex}-${activeDigit}"]`);
  input?.focus();
  input?.select();
}

function exitEdit() {
  editing = false;
  renderSetBuilder();
  $(`[data-set-slot="${selectedSetIndex}"]`)?.focus();
}

function renderBuilder() {
  renderAnalysis();
}

function handleBuilderKeys(event) {
  const key = event.key.toUpperCase();
  if (!editing && (key === "E" || event.key === "Enter")) {
    event.preventDefault(); enterEdit(); return;
  }
  if (!editing) return;
  if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
    event.preventDefault();
    activeDigit = (activeDigit + (event.key === "ArrowRight" ? 1 : -1) + hexMode) % hexMode;
    enterEdit(activeDigit);
  } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
    event.preventDefault();
    stepDigit(activeDigit, event.key === "ArrowUp" ? 1 : -1);
    enterEdit(activeDigit);
  } else if (key === "Q" || event.key === "Escape" || event.key === "Backspace") {
    event.preventDefault(); exitEdit();
  } else if (DIGITS.includes(key) && key.length === 1) {
    event.preventDefault();
    record();
    const parts = builderColor.split("");
    parts[activeDigit] = key;
      builderColor = parts.join("");
      setSlots[selectedSetIndex] = builderColor;
      activeDigit = (activeDigit + 1) % hexMode;
      renderBuilder();
      renderSetBuilder();
    enterEdit(activeDigit);
  }
}

function traySlotLayout() {
  const grid = $("#standby-grid");
  const cell = window.innerWidth <= 500 ? 48 : 64;
  const gap = window.innerWidth <= 500 ? 4 : 8;
  const columnWidth = cell;
  const drawerWidth = Math.min(576, window.innerWidth - 32) - 32;
  const contentWidth = grid.clientWidth || Math.max(columnWidth, drawerWidth);
  const columns = Math.max(1, Math.floor((contentWidth + gap) / (columnWidth + gap)));
  const rows = 3;
  return { columns, rows };
}

function sizeTrayToViewport(shouldCompress = false) {
  const { columns, rows } = traySlotLayout();
  const capacity = columns * rows;
  if (shouldCompress) {
    const colors = savedSwatches.filter(Boolean);
    const required = Math.max(capacity, colors.length);
    const length = Math.ceil(required / columns) * columns;
    savedSwatches = Array.from({ length }, (_, index) => colors[index] || null);
    selectedTrayIndex = null;
    write(KEYS.swatches, savedSwatches);
    return;
  }
  let lastColorIndex = -1;
  savedSwatches.forEach((color, index) => { if (color) lastColorIndex = index; });
  const required = Math.max(capacity, lastColorIndex + 1);
  const length = Math.ceil(required / columns) * columns;
  savedSwatches = Array.from({ length }, (_, index) => savedSwatches[index] || null);
  if (selectedTrayIndex !== null && !savedSwatches[selectedTrayIndex]) selectedTrayIndex = null;
}

function renderStandby(shouldCompress = false) {
  sizeTrayToViewport(shouldCompress);
  $("#standby-grid").className = "swatch-slots";
  $("#standby-grid").innerHTML = savedSwatches.map((color, index) => {
    if (!color) return `<div class="swatch-slot" data-standby-slot="${index}" aria-label="Empty standby slot ${index + 1}"></div>`;
    const display = convert(color, hexMode);
    return `<div class="swatch-slot has-color ${index === selectedTrayIndex ? "is-selected" : ""}" data-standby-slot="${index}" draggable="true" style="background:${cssColor(color)};color:${textColor(color)}">${display}${index === selectedTrayIndex ? `<button class="slot-delete" type="button" data-delete-standby="${index}" aria-label="Delete swatch ${index + 1}">×</button>` : ""}</div>`;
  }).join("");
  $$("[data-standby-slot]").forEach((slot) => {
    const index = Number(slot.dataset.standbySlot);
    slot.addEventListener("dragstart", (event) => {
      if (!savedSwatches[index] || event.target.matches("button")) return event.preventDefault();
      dragData(event, { type: "standby", index, color: savedSwatches[index] });
    });
    slot.addEventListener("dragover", over);
    slot.addEventListener("dragleave", leave);
    slot.addEventListener("drop", (event) => {
      event.preventDefault(); leave(event);
      const data = getDrag(event);
      if (!data) return;
      if (data.type === "standby") {
        [savedSwatches[index], savedSwatches[data.index]] = [savedSwatches[data.index], savedSwatches[index]];
      } else if (data.type === "builder") {
        savedSwatches[index] = data.color;
      } else if (data.type === "set-color") {
        savedSwatches[index] = data.color;
      }
      write(KEYS.swatches, savedSwatches);
      renderStandby();
    });
    slot.addEventListener("click", () => {
      if (!savedSwatches[index]) return;
      selectedTrayIndex = index;
      renderStandby();
    });
  });
  $$('[data-delete-standby]').forEach((button) => button.addEventListener("click", (event) => {
    event.stopPropagation();
    savedSwatches[Number(button.dataset.deleteStandby)] = null;
    selectedTrayIndex = null;
    write(KEYS.swatches, savedSwatches);
    renderStandby();
  }));
  $("#delete-swatch").disabled = selectedTrayIndex === null || !savedSwatches[selectedTrayIndex];
}

let trayResizeTimer;
window.addEventListener("resize", () => {
  clearTimeout(trayResizeTimer);
  trayResizeTimer = setTimeout(() => {
    renderStandby(true);
    renderPalette();
  }, 100);
});

function renderSetBuilder() {
  $("#set-builder").style.setProperty("--set-size", setSize);
  $("#set-builder").innerHTML = setSlots.map((color, index) => {
    if (!color) return `<div class="set-slot ${index === selectedSetIndex ? "is-selected" : ""}" data-set-slot="${index}" tabindex="0" aria-label="Empty set slot ${index + 1}"></div>`;
    const controls = convert(color, hexMode).split("").map((digit, digitIndex) => `
      <span class="digit-control ${editing && index === selectedSetIndex && digitIndex === activeDigit ? "is-active" : ""}">
        <input value="${digit}" readonly draggable="false" data-set-digit="${index}-${digitIndex}" data-set-index="${index}" data-digit-index="${digitIndex}" aria-label="Swatch ${index + 1}, hex digit ${digitIndex + 1}">
      </span>`).join("");
    return `<div class="set-slot has-color ${index === selectedSetIndex ? "is-selected" : ""}" data-set-slot="${index}" tabindex="0" draggable="true" style="background:${cssColor(color)};color:${textColor(color)}"><div class="set-swatch-controls">${controls}</div></div>`;
  }).join("");
  const renderArrowRow = (step, symbol, action) => setSlots.map((color, index) => {
    const digits = convert(color || "0".repeat(hexMode), hexMode).split("");
    return `<div class="swatch-arrow-controls">${digits.map((_, digitIndex) => `
      <span class="digit-arrows">
        <button type="button" data-set-step="${index}" data-digit-index="${digitIndex}" data-step="${step}" aria-label="${action} swatch ${index + 1}, digit ${digitIndex + 1}">${symbol}</button>
      </span>`).join("")}</div>`;
  }).join("");
  ["#set-arrows-up", "#set-arrows-down"].forEach((selector) => $(selector).style.setProperty("--set-size", setSize));
  $("#set-arrows-up").innerHTML = renderArrowRow(1, "▲", "Increase");
  $("#set-arrows-down").innerHTML = renderArrowRow(-1, "▼", "Decrease");
  $$("[data-set-slot]").forEach((slot) => {
    const index = Number(slot.dataset.setSlot);
    slot.addEventListener("dragstart", (event) => {
      if (!setSlots[index] || event.target.matches("button, input")) return event.preventDefault();
      dragData(event, { type: "set-color", index, color: setSlots[index] });
    });
    slot.addEventListener("dragover", over);
    slot.addEventListener("dragleave", leave);
    slot.addEventListener("drop", (event) => {
      event.preventDefault(); leave(event);
      const data = getDrag(event);
      if (!data) return;
      if (data.type === "set-color") [setSlots[index], setSlots[data.index]] = [setSlots[data.index], setSlots[index]];
      else if (data.type === "standby") {
        setSlots[index] = data.color;
        savedSwatches[data.index] = null;
        if (selectedTrayIndex === data.index) selectedTrayIndex = null;
        write(KEYS.swatches, savedSwatches);
        renderStandby();
      } else if (data.type === "builder") setSlots[index] = data.color;
      selectedSetIndex = index;
      builderColor = convert(setSlots[index] || "0".repeat(hexMode), hexMode);
      renderSetBuilder();
      renderBuilder();
    });
    slot.addEventListener("click", () => {
      selectedSetIndex = index;
      builderColor = setSlots[index] || "0".repeat(hexMode);
      renderSetBuilder();
      renderBuilder();
    });
    slot.addEventListener("keydown", (event) => {
      selectedSetIndex = index;
      builderColor = setSlots[index] || "0".repeat(hexMode);
      handleBuilderKeys(event);
    });
  });
  $$("[data-set-step]").forEach((button) => button.addEventListener("click", (event) => {
    event.stopPropagation();
    selectedSetIndex = Number(button.dataset.setStep);
    builderColor = setSlots[selectedSetIndex] || "0".repeat(hexMode);
    stepDigit(Number(button.dataset.digitIndex), Number(button.dataset.step));
  }));
  $$("[data-set-digit]").forEach((input) => {
    input.addEventListener("click", (event) => {
      event.stopPropagation();
      selectedSetIndex = Number(input.dataset.setIndex);
      builderColor = setSlots[selectedSetIndex];
      activeDigit = Number(input.dataset.digitIndex);
      editing = true;
      input.select();
      renderAnalysis();
    });
    input.addEventListener("focus", () => {
      selectedSetIndex = Number(input.dataset.setIndex);
      builderColor = setSlots[selectedSetIndex];
      activeDigit = Number(input.dataset.digitIndex);
      editing = true;
      renderAnalysis();
    });
    input.addEventListener("keydown", handleBuilderKeys);
  });
}

function setPreview(set, setIndex = null) {
  return `<div class="mini-set" style="--color-count:${set.colors.length}">${set.colors.map((color, colorIndex) => {
    const selectable = setIndex !== null;
    const selected = selectable && selectedPaletteColor?.setIndex === setIndex && selectedPaletteColor?.colorIndex === colorIndex;
    return `<span class="mini-color ${selected ? "is-selected" : ""}" ${selectable ? `data-palette-color="${setIndex}-${colorIndex}"` : ""} style="background:${cssColor(color)};color:${textColor(color)}">#${normalize(color)}${selected ? `<button class="slot-delete" type="button" data-delete-palette-color="${setIndex}-${colorIndex}" aria-label="Delete color ${colorIndex + 1}">×</button>` : ""}</span>`;
  }).join("")}</div>`;
}

function renderPalette() {
  sizePaletteToCard();
  $("#palette-builder").innerHTML = paletteSlots.map((set, index) => set
    ? `<div class="palette-set-slot has-set ${index === selectedPaletteIndex ? "is-selected" : ""}" data-palette-slot="${index}" draggable="true">${setPreview(set, index)}<span class="palette-set-name" data-palette-name="${index}">${escapeHtml(set.name)}</span>${index === selectedPaletteIndex ? `<button class="slot-delete" type="button" data-delete-palette-slot="${index}" aria-label="Delete set ${index + 1}">×</button>` : ""}</div>`
    : `<div class="palette-set-slot" data-palette-slot="${index}" aria-label="Empty palette set slot ${index + 1}"></div>`).join("");
  $$("[data-palette-slot]").forEach((slot) => {
    const index = Number(slot.dataset.paletteSlot);
    slot.addEventListener("dragstart", (event) => {
      if (!paletteSlots[index] || event.target.matches("button, input")) return event.preventDefault();
      dragData(event, { type: "palette-set", index });
    });
    slot.addEventListener("dragover", over);
    slot.addEventListener("dragleave", leave);
    slot.addEventListener("drop", (event) => {
      event.preventDefault(); leave(event);
      const data = getDrag(event);
      if (!data) return;
      if (data.type === "saved-set") paletteSlots[index] = structuredClone([...savedSets, ...DEFAULT_SETS][data.index]);
      if (data.type === "palette-set") [paletteSlots[index], paletteSlots[data.index]] = [paletteSlots[data.index], paletteSlots[index]];
      renderPalette();
    });
    slot.addEventListener("click", () => {
      if (!paletteSlots[index]) return;
      selectedPaletteIndex = index;
      selectedPaletteColor = null;
      renderPalette();
    });
  });
  $$('[data-delete-palette-slot]').forEach((button) => button.addEventListener("click", (event) => {
    event.stopPropagation();
    paletteSlots[Number(button.dataset.deletePaletteSlot)] = null;
    selectedPaletteIndex = null;
    selectedPaletteColor = null;
    renderPalette();
  }));
  $$('[data-palette-color]').forEach((color) => color.addEventListener("click", (event) => {
    event.stopPropagation();
    const [setIndex, colorIndex] = color.dataset.paletteColor.split("-").map(Number);
    selectedPaletteIndex = null;
    selectedPaletteColor = { setIndex, colorIndex };
    renderPalette();
  }));
  $$('[data-delete-palette-color]').forEach((button) => button.addEventListener("click", (event) => {
    event.stopPropagation();
    const [setIndex, colorIndex] = button.dataset.deletePaletteColor.split("-").map(Number);
    paletteSlots[setIndex].colors.splice(colorIndex, 1);
    if (!paletteSlots[setIndex].colors.length) paletteSlots[setIndex] = null;
    selectedPaletteColor = null;
    renderPalette();
  }));
  $$('[data-palette-name]').forEach((label) => {
    let clickTimer;
    label.addEventListener("click", (event) => {
      event.stopPropagation();
      const index = Number(label.dataset.paletteName);
      clearTimeout(clickTimer);
      clickTimer = setTimeout(() => {
        selectedPaletteIndex = index;
        selectedPaletteColor = null;
        renderPalette();
      }, 250);
    });
    label.addEventListener("dblclick", (event) => {
    event.preventDefault();
    event.stopPropagation();
    clearTimeout(clickTimer);
    const index = Number(label.dataset.paletteName);
    const original = paletteSlots[index].name;
    const input = document.createElement("input");
    input.className = "palette-set-name palette-set-name-input";
    input.value = original;
    input.setAttribute("aria-label", `Rename set ${index + 1}`);
    input.draggable = false;
    label.replaceWith(input);
    input.focus();
    input.select();
    let finished = false;
    const finish = (save) => {
      if (finished) return;
      finished = true;
      if (save) paletteSlots[index].name = input.value.trim() || original;
      renderPalette();
    };
    input.addEventListener("blur", () => finish(true));
    input.addEventListener("keydown", (keyEvent) => {
      if (keyEvent.key === "Enter") { keyEvent.preventDefault(); finish(true); }
      if (keyEvent.key === "Escape") { keyEvent.preventDefault(); finish(false); }
    });
    });
  });
}

function sizePaletteToCard() {
  const grid = $("#palette-builder");
  const gap = 8;
  const slotHeight = 80;
  const height = grid.clientHeight || Math.max(slotHeight * 3 + gap * 2, window.innerHeight * .45);
  const columns = 1;
  const rows = Math.max(3, Math.floor((height + gap) / (slotHeight + gap)));
  let lastSetIndex = -1;
  paletteSlots.forEach((set, index) => { if (set) lastSetIndex = index; });
  const required = Math.max(columns * rows, lastSetIndex + 1);
  const length = Math.ceil(required / columns) * columns;
  paletteSlots = Array.from({ length }, (_, index) => paletteSlots[index] || null);
}

function renderSavedSets() {
  if (!$("#saved-sets")) return;
  const all = [...savedSets, ...DEFAULT_SETS];
  $("#saved-sets").innerHTML = all.length ? all.map((set, index) => `
    <div class="saved-item">
      <div class="saved-item-heading">
        <span class="saved-item-name">${escapeHtml(set.name)}</span>
        <span class="btn-group">
          <button class="btn btn-outline-secondary" data-add-set="${index}">Add</button>
          <button class="btn btn-outline-secondary" data-edit-set="${index}">Edit</button>
          ${set.permanent ? "" : `<button class="btn btn-outline-secondary" data-delete-set="${index}">Delete</button>`}
        </span>
      </div>
      <button class="saved-set-swatches" style="--color-count:${set.colors.length}" draggable="true" data-saved-set="${index}" aria-label="Drag ${escapeHtml(set.name)} to Palette Builder">
        ${set.colors.map((color) => `<span class="saved-color" style="background:${cssColor(color)}"></span>`).join("")}
      </button>
    </div>`).join("") : `<div class="empty-message">No saved sets.</div>`;
  $$("[data-saved-set]").forEach((button) => {
    button.addEventListener("dragstart", (event) => dragData(event, { type: "saved-set", index: Number(button.dataset.savedSet) }));
    button.addEventListener("click", () => loadSet(all[Number(button.dataset.savedSet)]));
  });
  $$("[data-edit-set]").forEach((button) => button.addEventListener("click", () => {
    const index = Number(button.dataset.editSet);
    loadSet(all[index]);
    editingSetIndex = index < savedSets.length ? index : null;
  }));
  $$("[data-add-set]").forEach((button) => button.addEventListener("click", () => {
    const emptyIndex = paletteSlots.findIndex((set) => !set);
    if (emptyIndex < 0) return alertUser("Palette Builder is full.");
    paletteSlots[emptyIndex] = structuredClone(all[Number(button.dataset.addSet)]);
    renderPalette();
  }));
  $$("[data-delete-set]").forEach((button) => button.addEventListener("click", () => {
    savedSets.splice(Number(button.dataset.deleteSet), 1);
    write(KEYS.sets, savedSets);
    renderSavedSets();
  }));
}

function loadSet(set) {
  editingPaletteSetIndex = null;
  hexMode = set.hexMode || normalize(set.colors[0]).length || 3;
  setSlots = Array.from({ length: setSize }, (_, index) => set.colors[index] ? convert(set.colors[index], hexMode) : null);
  selectedSetIndex = Math.min(Math.floor(setSize / 2), setSize - 1);
  builderColor = convert(setSlots[selectedSetIndex] || "0".repeat(hexMode), hexMode);
  $("#set-name").value = set.name;
  renderSetBuilder();
  renderBuilder();
  renderStandby();
  updateControls();
}

function renderSavedPalettes() {
  if (!$("#saved-palettes")) return;
  $("#saved-palettes").innerHTML = savedPalettes.length ? savedPalettes.map((palette, index) => `
    <div class="saved-item">
      <div class="saved-item-heading"><span>${escapeHtml(palette.name)}</span><span class="btn-group"><button class="btn btn-outline-secondary" data-load-palette="${index}">Edit</button><button class="btn btn-outline-secondary" data-delete-palette="${index}">Delete</button></span></div>
      <div>${palette.sets.filter(Boolean).map(setPreview).join("")}</div>
    </div>`).join("") : `<div class="empty-message">No saved palettes.</div>`;
  $$("[data-load-palette]").forEach((button) => button.addEventListener("click", () => {
    const index = Number(button.dataset.loadPalette);
    const palette = savedPalettes[index];
    const lastUsed = palette.sets.reduce((last, set, slot) => set ? slot : last, -1);
    paletteSlots = Array.from({ length: Math.max(8, lastUsed + 1) }, (_, slot) => palette.sets[slot] ? structuredClone(palette.sets[slot]) : null);
    $("#palette-name").value = palette.name;
    editingPaletteIndex = index;
    renderPalette();
  }));
  $$("[data-delete-palette]").forEach((button) => button.addEventListener("click", () => {
    savedPalettes.splice(Number(button.dataset.deletePalette), 1);
    write(KEYS.palettes, savedPalettes);
    renderSavedPalettes();
  }));
}

function over(event) { event.preventDefault(); event.currentTarget.classList.add("is-over"); }
function leave(event) { event.currentTarget.classList.remove("is-over"); }

const setCard = $(".builder-card");
setCard.addEventListener("dragover", over);
setCard.addEventListener("dragleave", leave);
setCard.addEventListener("drop", (event) => {
  event.preventDefault();
  leave(event);
  const data = getDrag(event);
  if (data?.type !== "palette-set" || !paletteSlots[data.index]) return;
  loadSet(structuredClone(paletteSlots[data.index]));
  editingSetIndex = null;
  editingPaletteSetIndex = data.index;
  setPaletteOpen(false);
});

function updateControls() {
  $$("[data-hex-mode]").forEach((button) => button.classList.toggle("active", Number(button.dataset.hexMode) === hexMode));
}

function performUndo() {
  if (!undoStack.length) return;
  redoStack.push(snapshot());
  restore(undoStack.pop());
  updateControls();
}

function performRedo() {
  if (!redoStack.length) return;
  undoStack.push(snapshot());
  restore(redoStack.pop());
  updateControls();
}

function colorMetrics(color) {
  if (!color) return null;
  const [, s, l] = rgbToHsl(rgb(color));
  return { s: s * 100, l: l * 100 };
}

function renderAnalysis() {
  const metrics = setSlots.map(colorMetrics);
  $("#set-column-labels").style.setProperty("--set-size", setSize);
  $("#set-column-labels").innerHTML = metrics.map((_, index) => `<span>Swatch ${index + 1}</span>`).join("");
  $("#set-metrics").style.setProperty("--set-size", setSize);
  $("#set-metrics").innerHTML = metrics.map((item, index) => item ? `
    <div class="swatch-metrics ${index === selectedSetIndex ? "is-selected" : ""}">
      <span>Value <strong>${Math.round(item.l)}%</strong></span>
      <span>Chroma <strong>${Math.round(item.s)}%</strong></span>
    </div>` : `
    <div class="swatch-metrics is-empty">
      <span>Value <strong>—</strong></span>
      <span>Chroma <strong>—</strong></span>
    </div>`).join("");

  $("#set-differences").style.setProperty("--difference-count", Math.max(1, setSize - 1));
  $("#comparison-labels").style.setProperty("--difference-count", Math.max(1, setSize - 1));
  $("#comparison-labels").innerHTML = Array.from(
    { length: setSize - 1 },
    (_, index) => `<span>Swatch ${index + 1} vs. ${index + 2}</span>`
  ).join("");
  $("#set-differences").innerHTML = Array.from({ length: setSize - 1 }, (_, index) => {
    const from = setSlots[index] ? convert(setSlots[index], hexMode) : null;
    const to = setSlots[index + 1] ? convert(setSlots[index + 1], hexMode) : null;
    if (!from || !to) return `
      <div class="swatch-difference is-empty">
        <span>Complete both swatches to compare.</span>
      </div>`;
    const signed = (value) => value > 0 ? `+${value}` : value < 0 ? `−${Math.abs(value)}` : "0";
    const deltas = from.split("").map((digit, digitIndex) => (
      DIGITS.indexOf(to[digitIndex]) - DIGITS.indexOf(digit)
    ));
    return `
      <div class="swatch-difference">
        <div class="digit-differences" style="--hex-digits:${hexMode}" aria-label="Hex digit changes ${deltas.map(signed).join(", ")}">
          ${deltas.map((delta) => `<b>${signed(delta)}</b>`).join("")}
        </div>
      </div>`;
  }).join("");
}

function applyHelper(action) {
  record();
  let channels = rgb(builderColor);
  if (action === "shade") channels = channels.map((value) => value * .9);
  else if (action === "tint") channels = channels.map((value) => value + (255 - value) * .1);
  else {
    const hsl = rgbToHsl(channels);
    if (action === "chroma-down") hsl[1] -= .1;
    if (action === "chroma-up") hsl[1] += .1;
    channels = hslToRgb(hsl);
  }
  builderColor = fromRgb(channels);
  setSlots[selectedSetIndex] = builderColor;
  renderBuilder(); renderSetBuilder(); updateControls();
}

function setPaletteOpen(open) {
  $("#palette-drawer").classList.toggle("is-open", open);
  $("#palette-toggle").setAttribute("aria-expanded", String(open));
  $("#palette-toggle").setAttribute("aria-label", open ? "Close palette staging" : "Open palette staging");
  $("#palette-toggle").textContent = open ? "›" : "‹";
  document.body.classList.toggle("palette-open", open);
}

$("#palette-toggle").addEventListener("click", () => setPaletteOpen(!$("#palette-drawer").classList.contains("is-open")));
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && $("#palette-drawer").classList.contains("is-open")) {
    setPaletteOpen(false);
    $("#palette-toggle").focus();
  }
});
document.addEventListener("click", (event) => {
  if (
    $("#palette-drawer").classList.contains("is-open") &&
    !$("#palette-drawer").contains(event.target) &&
    !$("#palette-toggle").contains(event.target)
  ) {
    setPaletteOpen(false);
  }
});

$("#clear-standby").addEventListener("click", () => { savedSwatches.fill(null); selectedTrayIndex = null; write(KEYS.swatches, savedSwatches); renderStandby(); });
$("#compress-standby").addEventListener("click", () => renderStandby(true));
$("#clear-set").addEventListener("click", () => {
  hexMode = 3;
  activeDigit = 0;
  editing = false;
  setSlots = Array(setSize).fill("F".repeat(hexMode));
  selectedSetIndex = Math.floor(setSize / 2);
  builderColor = "F".repeat(hexMode);
  $("#set-name").value = "";
  editingSetIndex = null;
  editingPaletteSetIndex = null;
  renderSetBuilder();
  renderBuilder();
  renderStandby();
  updateControls();
});
$("#clear-palette").addEventListener("click", () => { paletteSlots.fill(null); selectedPaletteIndex = null; selectedPaletteColor = null; $("#palette-name").value = ""; editingPaletteIndex = null; renderPalette(); });

$("#delete-swatch").addEventListener("click", () => {
  if (selectedTrayIndex === null || !savedSwatches[selectedTrayIndex]) return;
  savedSwatches[selectedTrayIndex] = null;
  selectedTrayIndex = null;
  write(KEYS.swatches, savedSwatches);
  renderStandby();
});

$$("[data-hex-mode]").forEach((button) => button.addEventListener("click", () => {
  const mode = Number(button.dataset.hexMode);
  if (mode === hexMode) return;
  record(); hexMode = mode; builderColor = convert(builderColor, mode); activeDigit = Math.min(activeDigit, mode - 1);
  setSlots = setSlots.map((color) => color ? convert(color, mode) : null);
  setSlots[selectedSetIndex] = builderColor;
  renderBuilder(); renderStandby(); renderSetBuilder(); updateControls();
}));
$$("[data-helper]").forEach((button) => button.addEventListener("click", () => applyHelper(button.dataset.helper)));
document.addEventListener("keydown", (event) => {
  const modifier = event.ctrlKey || event.metaKey;
  const key = event.key.toLowerCase();
  const redo = modifier && (key === "y" || (key === "z" && event.shiftKey));
  const undo = modifier && key === "z" && !event.shiftKey;
  if (!undo && !redo) return;
  event.preventDefault();
  if (redo) performRedo();
  else performUndo();
});

$("#save-set").addEventListener("click", (event) => {
  event.stopPropagation();
  if (setSlots.some((color) => !color)) return alertUser("Fill every Set Builder slot before adding it to the palette.");
  const targetIndex = editingPaletteSetIndex ?? paletteSlots.findIndex((set) => !set);
  if (targetIndex < 0) return alertUser("Palette Builder is full.");
  const name = $("#set-name").value.trim() || setSlots.map((color) => `#${convert(color, hexMode)}`).join(" ");
  paletteSlots[targetIndex] = { name, colors: setSlots.slice(), hexMode };
  editingSetIndex = null;
  editingPaletteSetIndex = null;
  renderPalette();
  setPaletteOpen(true);
});

$("#save-palette").addEventListener("click", () => {
  const sets = paletteSlots.filter(Boolean);
  if (!sets.length) return alertUser("Add at least one saved set to Palette Builder.");
  const name = $("#palette-name").value.trim() || `Palette ${savedPalettes.length + 1}`;
  const signature = sets.map((set) => set.colors.map(six).join("|")).join("||");
  const others = savedPalettes.filter((_, index) => index !== editingPaletteIndex);
  if (others.some((palette) => palette.name.toLowerCase() === name.toLowerCase())) return alertUser("A saved palette already uses this name.");
  if (others.some((palette) => palette.sets.filter(Boolean).map((set) => set.colors.map(six).join("|")).join("||") === signature)) return alertUser("This exact palette is already saved.");
  const next = { name, sets: paletteSlots.map((set) => set ? structuredClone(set) : null) };
  if (editingPaletteIndex === null) savedPalettes.unshift(next); else savedPalettes[editingPaletteIndex] = next;
  editingPaletteIndex = null; write(KEYS.palettes, savedPalettes); renderSavedPalettes(); pulse($("#library-button"));
});

renderBuilder();
renderStandby();
renderSetBuilder();
renderPalette();
renderSavedSets();
renderSavedPalettes();
updateControls();
