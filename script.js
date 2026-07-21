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
const STARTER_PALETTE = {
  name: "Starter",
  permanent: true,
  sets: [
    ["Ruby", "300", "600", "900"], ["Gold / Topaz", "FA0", "FC0", "FF0"], ["Emerald", "030", "060", "090"],
    ["Sapphire", "003", "006", "009"], ["Amethyst", "309", "60C", "90F"], ["Ice / Diamond", "ADE", "CDE", "DEF"],
    ["Onyx", "111", "112", "223"], ["Silver", "778", "AAA", "DDE"], ["Bronze", "930", "B52", "D74"],
    ["Bark", "420", "642", "864"], ["Wood", "754", "975", "B96"], ["Sand", "A86", "CA8", "ECA"],
    ["Leaf", "470", "8B2", "CF4"], ["Foliage", "252", "474", "696"], ["Shrub", "032", "254", "476"],
    ["Tomato", "A02", "C03", "E04"], ["Orange", "F10", "F50", "F90"], ["Teal", "066", "088", "0AA"],
    ["Peach", "F55", "F88", "FBB"], ["Pink", "F6A", "F8C", "FAF"], ["Lavender", "A5D", "C7E", "E9F"],
    ["Sky", "159", "37B", "59D"], ["Grass", "063", "0A5", "4D8"], ["Plum", "603", "906", "C39"]
  ].map(([name, ...colors]) => ({ name, colors, hexMode: 3 }))
};

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

function syncAriaTooltips(root = document) {
  const elements = [];
  if (root.nodeType === Node.ELEMENT_NODE && root.matches("[aria-label]")) elements.push(root);
  elements.push(...root.querySelectorAll?.("[aria-label]") || []);
  elements.forEach((element) => element.setAttribute("title", element.getAttribute("aria-label")));
}

const ariaTooltipObserver = new MutationObserver((mutations) => {
  mutations.forEach((mutation) => {
    if (mutation.type === "attributes") syncAriaTooltips(mutation.target);
    mutation.addedNodes.forEach((node) => {
      if (node.nodeType === Node.ELEMENT_NODE) syncAriaTooltips(node);
    });
  });
});

let hexMode = 3;
let builderColor = "888";
let activeDigit = 0;
let editing = false;
let setSize = 3;
let setSlots = Array(setSize).fill("000");
let selectedSetIndex = 1;
let paletteSlots = Array(8).fill(null);
let savedSets = read(KEYS.sets, []);
let savedSwatches = read(KEYS.swatches, []);
let savedPalettes = read(KEYS.palettes, []);
let schemeName = "";
let paletteName = "";
let showStats = true;
let showComp = true;
let editingSetIndex = null;
let editingPaletteSetIndex = null;
let editingPaletteIndex = null;
let undoStack = [];
let redoStack = [];
let selectedTrayIndex = null;
let selectedPaletteIndex = null;
let selectedPaletteColor = null;
let selectedSavedPaletteIndex = null;
let openPaletteActionsIndex = null;
let openSavedPaletteActionsIndex = null;

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

function requestName(initialValue = "", kind = null, findConflict = null) {
  return new Promise((resolve) => {
    const element = $("#name-modal");
    const modal = bootstrap.Modal.getOrCreateInstance(element);
    const form = $("#name-form");
    const input = $("#name-input");
    const normalActions = form.querySelector(".name-modal-actions");
    const conflictBox = $("#name-conflict");
    const replaceButton = conflictBox.querySelector('[data-name-conflict-action="replace"]');
    input.value = initialValue;
    conflictBox.hidden = true;
    normalActions.hidden = false;
    let pendingConflict = null;
    let settled = false;
    const updateConflict = () => {
      const value = input.value.trim();
      pendingConflict = value ? findConflict?.(value) || null : null;
      if (!pendingConflict) {
        conflictBox.hidden = true;
        normalActions.hidden = false;
        return null;
      }
      $("#name-conflict-title").textContent = `${kind} name already exists`;
      $("#name-conflict-message").textContent = `A ${kind.toLowerCase()} named “${value}” already exists. Would you like to replace it or rename this one?`;
      replaceButton.hidden = pendingConflict.canReplace === false;
      conflictBox.hidden = false;
      normalActions.hidden = true;
      return pendingConflict;
    };
    const inputChanged = () => updateConflict();
    const finish = (value) => {
      if (settled) return;
      settled = true;
      form.removeEventListener("submit", submit);
      input.removeEventListener("input", inputChanged);
      conflictBox.removeEventListener("click", chooseConflictAction);
      element.removeEventListener("hidden.bs.modal", cancel);
      resolve(value);
    };
    const submit = (event) => {
      event.preventDefault();
      const value = input.value.trim();
      if (!value) return input.reportValidity();
      if (updateConflict()) return;
      finish({ name: value, replaceIndex: null });
      modal.hide();
    };
    const chooseConflictAction = (event) => {
      const button = event.target.closest("[data-name-conflict-action]");
      if (!button) return;
      if (button.dataset.nameConflictAction === "rename") {
        conflictBox.hidden = true;
        normalActions.hidden = true;
        input.focus();
        input.select();
        return;
      }
      finish({ name: input.value.trim(), replaceIndex: pendingConflict.index });
      modal.hide();
    };
    const cancel = () => finish(null);
    form.addEventListener("submit", submit);
    input.addEventListener("input", inputChanged);
    conflictBox.addEventListener("click", chooseConflictAction);
    element.addEventListener("hidden.bs.modal", cancel, { once: true });
    element.addEventListener("shown.bs.modal", () => { updateConflict(); input.focus(); input.select(); }, { once: true });
    modal.show();
  });
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
  const cellWidth = Math.min(160, Math.max(80, window.innerWidth * .06));
  const cellHeight = cellWidth;
  const gap = 8;
  const contentWidth = grid.clientWidth || cellWidth;
  const contentHeight = grid.clientHeight || cellHeight;
  const columns = Math.max(1, Math.floor((contentWidth + gap) / (cellWidth + gap)));
  const rows = Math.max(1, Math.floor((contentHeight + gap) / (cellHeight + gap)));
  return { columns, rows, cellWidth, cellHeight, gap };
}

function insertSlot(slots, fromIndex, toIndex, value, insertAfter = false) {
  const next = slots.slice();
  let insertionIndex = toIndex + (insertAfter ? 1 : 0);
  if (fromIndex !== null) {
    next.splice(fromIndex, 1);
    if (fromIndex < insertionIndex) insertionIndex -= 1;
  }
  next.splice(insertionIndex, 0, value);
  return next;
}

function isAfterDrop(event, element) {
  const bounds = element.getBoundingClientRect();
  return event.clientX >= bounds.left + bounds.width / 2;
}

function isAfterVerticalDrop(event, element) {
  const bounds = element.getBoundingClientRect();
  return event.clientY >= bounds.top + bounds.height / 2;
}

function sizeTrayToViewport(shouldCompress = false) {
  const { columns, rows: visibleRows, cellWidth, cellHeight, gap } = traySlotLayout();
  if (shouldCompress) savedSwatches = savedSwatches.filter(Boolean);
  const minimumCapacity = columns * 3;
  const requiredCapacity = Math.max(minimumCapacity, savedSwatches.length);
  const occupiedSlots = savedSwatches.filter(Boolean).length;
  let renderedRows = Math.max(3, Math.ceil(requiredCapacity / columns));
  while (occupiedSlots >= renderedRows * columns * .75) renderedRows += 1;
  const renderedCapacity = columns * renderedRows;
  savedSwatches = Array.from({ length: renderedCapacity }, (_, index) => savedSwatches[index] || null);
  const grid = $("#standby-grid");
  grid.style.setProperty("--standby-columns", columns);
  grid.style.setProperty("--standby-cell-width", `${cellWidth}px`);
  grid.style.setProperty("--standby-cell-height", `${cellHeight}px`);
  grid.style.setProperty("--standby-gap", `${gap}px`);
  grid.style.overflowY = renderedRows > visibleRows ? "auto" : "hidden";
  if (shouldCompress) selectedTrayIndex = null;
  if (selectedTrayIndex !== null && !savedSwatches[selectedTrayIndex]) selectedTrayIndex = null;
  write(KEYS.swatches, savedSwatches);
}

function renderStandby(shouldCompress = false) {
  if (!$("#standby-grid")) return;
  sizeTrayToViewport(shouldCompress);
  $("#standby-grid").className = "swatch-slots standby-slots";
  $("#standby-grid").innerHTML = savedSwatches.map((color, index) => {
    if (!color) return `<div class="swatch-slot" data-standby-slot="${index}" aria-label="Empty standby slot ${index + 1}"></div>`;
    const display = convert(color, hexMode);
    return `<div class="swatch-slot has-color ${index === selectedTrayIndex ? "is-selected" : ""}" data-standby-slot="${index}" draggable="true" style="background:${cssColor(color)};color:${textColor(color)}" aria-label="Standby swatch ${index + 1}, ${display}">${display}<button class="slot-delete" type="button" data-delete-standby="${index}" aria-label="Delete standby swatch ${index + 1}">×</button></div>`;
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
        [savedSwatches[data.index], savedSwatches[index]] = [savedSwatches[index], savedSwatches[data.index]];
      } else if (["builder", "set-color", "palette-color"].includes(data.type)) {
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
  $("#scheme-swatches").style.setProperty("--set-size", setSize);
  $("#scheme-swatches").innerHTML = setSlots.map((color, index) => {
    if (!color) return `<div class="set-slot ${index === selectedSetIndex ? "is-selected" : ""}" data-set-slot="${index}" tabindex="0" aria-label="Empty scheme swatch ${index + 1}"></div>`;
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
  ["#scheme-arrows-up", "#scheme-arrows-down"].forEach((selector) => $(selector).style.setProperty("--set-size", setSize));
  $("#scheme-arrows-up").innerHTML = renderArrowRow(1, "+", "Increase");
  $("#scheme-arrows-down").innerHTML = renderArrowRow(-1, "−", "Decrease");
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
      let nextSelectedIndex = index;
      if (data.type === "set-color") {
        nextSelectedIndex = index + (isAfterDrop(event, slot) ? 1 : 0);
        if (data.index < nextSelectedIndex) nextSelectedIndex -= 1;
        setSlots = insertSlot(setSlots, data.index, index, data.color, isAfterDrop(event, slot));
      } else if (data.type === "standby") {
        setSlots[index] = data.color;
        savedSwatches[data.index] = null;
        if (selectedTrayIndex === data.index) selectedTrayIndex = null;
        write(KEYS.swatches, savedSwatches);
        renderStandby();
      } else if (data.type === "builder" || data.type === "palette-color") setSlots[index] = data.color;
      selectedSetIndex = nextSelectedIndex;
      builderColor = convert(setSlots[nextSelectedIndex] || "0".repeat(hexMode), hexMode);
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
    return `<span class="mini-color ${selected ? "is-selected" : ""}" ${selectable ? `data-palette-color="${setIndex}-${colorIndex}" draggable="true"` : ""} style="background:${cssColor(color)};color:${textColor(color)}">#${normalize(color)}${selectable ? `<button class="slot-delete" type="button" data-delete-palette-color="${setIndex}-${colorIndex}" aria-label="Delete swatch ${colorIndex + 1} from scheme ${setIndex + 1}">×</button>` : ""}</span>`;
  }).join("")}</div>`;
}

function renderPalette() {
  sizePaletteToCard();
  $("#palette-schemes").innerHTML = paletteSlots.map((set, index) => set
    ? `<div class="palette-set-slot has-set ${index === selectedPaletteIndex ? "is-selected" : ""}" data-palette-slot="${index}"><span class="palette-set-name" data-drag-palette-set="${index}" draggable="true">${escapeHtml(set.name)}</span>${setPreview(set, index)}<button class="corner-action" type="button" data-toggle-palette-actions="${index}" aria-label="Edit scheme ${index + 1}" aria-expanded="${index === openPaletteActionsIndex}">+</button>${index === openPaletteActionsIndex ? `<div class="corner-action-menu"><button type="button" data-rename-palette-slot="${index}">Edit name</button><button type="button" data-edit-palette-swatches="${index}">Edit swatches</button><button type="button" data-delete-palette-slot="${index}">Delete</button></div>` : ""}</div>`
    : `<div class="palette-set-slot" data-palette-slot="${index}" aria-label="Empty palette scheme slot ${index + 1}"></div>`).join("");
  $$("[data-palette-slot]").forEach((slot) => {
    const index = Number(slot.dataset.paletteSlot);
    slot.addEventListener("dragover", over);
    slot.addEventListener("dragleave", leave);
    slot.addEventListener("drop", (event) => {
      event.preventDefault(); leave(event);
      const data = getDrag(event);
      if (!data) return;
      if (data.type === "saved-set") paletteSlots = insertSlot(paletteSlots, null, index, structuredClone([...savedSets, ...DEFAULT_SETS][data.index]), isAfterVerticalDrop(event, slot));
      if (data.type === "palette-set") paletteSlots = insertSlot(paletteSlots, data.index, index, paletteSlots[data.index], isAfterVerticalDrop(event, slot));
      renderPalette();
    });
    slot.addEventListener("click", () => {
      if (!paletteSlots[index]) return;
      selectedPaletteIndex = index;
      selectedPaletteColor = null;
      openPaletteActionsIndex = null;
      renderPalette();
    });
  });
  $$('[data-drag-palette-set]').forEach((name) => name.addEventListener("dragstart", (event) => {
    event.stopPropagation();
    dragData(event, { type: "palette-set", index: Number(name.dataset.dragPaletteSet) });
  }));
  $$('[data-toggle-palette-actions]').forEach((button) => button.addEventListener("click", (event) => {
    event.stopPropagation();
    const index = Number(button.dataset.togglePaletteActions);
    openPaletteActionsIndex = openPaletteActionsIndex === index ? null : index;
    renderPalette();
  }));
  $$('[data-rename-palette-slot]').forEach((button) => button.addEventListener("click", (event) => {
    event.stopPropagation();
    const index = Number(button.dataset.renamePaletteSlot);
    const label = document.querySelector(`[data-palette-slot="${index}"] .palette-set-name`);
    const original = paletteSlots[index].name;
    const input = document.createElement("input");
    input.className = "palette-set-name palette-set-name-input";
    input.value = original;
    input.setAttribute("aria-label", `Rename scheme ${index + 1}`);
    input.draggable = false;
    label.replaceWith(input);
    openPaletteActionsIndex = null;
    input.focus();
    input.select();
    let finished = false;
    const finish = (save) => {
      if (finished) return;
      finished = true;
      if (save) paletteSlots[index].name = input.value.trim() || original;
      renderPalette();
    };
    input.addEventListener("click", (inputEvent) => inputEvent.stopPropagation());
    input.addEventListener("blur", () => finish(true));
    input.addEventListener("keydown", (keyEvent) => {
      if (keyEvent.key === "Enter") { keyEvent.preventDefault(); finish(true); }
      if (keyEvent.key === "Escape") { keyEvent.preventDefault(); finish(false); }
    });
  }));
  $$('[data-edit-palette-swatches]').forEach((button) => button.addEventListener("click", (event) => {
    event.stopPropagation();
    const index = Number(button.dataset.editPaletteSwatches);
    loadSet(structuredClone(paletteSlots[index]));
    editingSetIndex = null;
    editingPaletteSetIndex = index;
    openPaletteActionsIndex = null;
    setPaletteOpen(false);
  }));
  $$('[data-delete-palette-slot]').forEach((button) => button.addEventListener("click", (event) => {
    event.stopPropagation();
    paletteSlots[Number(button.dataset.deletePaletteSlot)] = null;
    selectedPaletteIndex = null;
    selectedPaletteColor = null;
    openPaletteActionsIndex = null;
    renderPalette();
  }));
  $$('[data-palette-color]').forEach((color) => {
    color.addEventListener("dragstart", (event) => {
      event.stopPropagation();
      const [setIndex, colorIndex] = color.dataset.paletteColor.split("-").map(Number);
      dragData(event, { type: "palette-color", setIndex, colorIndex, color: paletteSlots[setIndex].colors[colorIndex] });
    });
    color.addEventListener("dragover", (event) => { event.stopPropagation(); over(event); });
    color.addEventListener("dragleave", (event) => { event.stopPropagation(); leave(event); });
    color.addEventListener("drop", (event) => {
      event.preventDefault();
      event.stopPropagation();
      leave(event);
      const data = getDrag(event);
      if (data?.type !== "palette-color") return;
      const [setIndex, colorIndex] = color.dataset.paletteColor.split("-").map(Number);
      if (data.setIndex === setIndex) {
        paletteSlots[setIndex].colors = insertSlot(paletteSlots[setIndex].colors, data.colorIndex, colorIndex, data.color, isAfterDrop(event, color));
      } else {
        paletteSlots[data.setIndex].colors.splice(data.colorIndex, 1);
        paletteSlots[setIndex].colors = insertSlot(paletteSlots[setIndex].colors, null, colorIndex, data.color, isAfterDrop(event, color));
        if (!paletteSlots[data.setIndex].colors.length) paletteSlots[data.setIndex] = null;
      }
      selectedPaletteColor = null;
      renderPalette();
    });
    color.addEventListener("click", (event) => {
      event.stopPropagation();
      const [setIndex, colorIndex] = color.dataset.paletteColor.split("-").map(Number);
      selectedPaletteIndex = null;
      selectedPaletteColor = { setIndex, colorIndex };
      renderPalette();
    });
  });
  $$('[data-delete-palette-color]').forEach((button) => button.addEventListener("click", (event) => {
    event.stopPropagation();
    const [setIndex, colorIndex] = button.dataset.deletePaletteColor.split("-").map(Number);
    paletteSlots[setIndex].colors.splice(colorIndex, 1);
    if (!paletteSlots[setIndex].colors.length) paletteSlots[setIndex] = null;
    selectedPaletteColor = null;
    renderPalette();
  }));
}

function sizePaletteToCard() {
  const grid = $("#palette-schemes");
  const gap = 4;
  const slotHeight = 56;
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
      <button class="saved-set-swatches" style="--color-count:${set.colors.length}" draggable="true" data-saved-set="${index}" aria-label="Drag ${escapeHtml(set.name)} to Palette">
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
    if (emptyIndex < 0) return alertUser("Palette is full.");
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
  setSize = set.colors.length === 3 ? 3 : 5;
  hexMode = set.hexMode || normalize(set.colors[0]).length || 3;
  setSlots = Array.from({ length: setSize }, (_, index) => set.colors[index] ? convert(set.colors[index], hexMode) : null);
  selectedSetIndex = Math.min(Math.floor(setSize / 2), setSize - 1);
  builderColor = convert(setSlots[selectedSetIndex] || "0".repeat(hexMode), hexMode);
  schemeName = set.name;
  renderSetBuilder();
  renderBuilder();
  renderStandby();
  updateControls();
}

function renderSavedPalettes() {
  if (!$("#saved-palettes")) return;
  const all = [STARTER_PALETTE, ...savedPalettes];
  $("#saved-palettes").innerHTML = all.map((palette, index) => `
    <div class="saved-item saved-palette-item ${index === selectedSavedPaletteIndex ? "is-selected" : ""}" data-saved-palette="${index}">
      <div class="saved-item-heading"><span class="saved-item-name">${escapeHtml(palette.name)}</span></div>
      <div>${palette.sets.filter(Boolean).map((set) => setPreview(set)).join("")}</div>
      <button class="corner-action" type="button" data-toggle-saved-palette-actions="${index}" aria-label="${palette.permanent ? "Load" : "Edit"} palette ${escapeHtml(palette.name)}" aria-expanded="${index === openSavedPaletteActionsIndex}">+</button>${index === openSavedPaletteActionsIndex ? `<div class="corner-action-menu"><button type="button" data-rename-saved-palette="${index - 1}">Edit name</button><button type="button" data-load-palette="${index}">Edit swatches</button><button type="button" data-delete-palette="${index - 1}">Delete</button></div>` : ""}
    </div>`).join("");
  $$("[data-saved-palette]").forEach((item) => item.addEventListener("click", () => {
    selectedSavedPaletteIndex = Number(item.dataset.savedPalette);
    openSavedPaletteActionsIndex = null;
    renderSavedPalettes();
  }));
  $$("[data-toggle-saved-palette-actions]").forEach((button) => button.addEventListener("click", (event) => {
    event.stopPropagation();
    const index = Number(button.dataset.toggleSavedPaletteActions);
    if (all[index].permanent) {
      const palette = all[index];
      const lastUsed = palette.sets.reduce((last, set, slot) => set ? slot : last, -1);
      paletteSlots = Array.from({ length: Math.max(8, lastUsed + 1) }, (_, slot) => palette.sets[slot] ? structuredClone(palette.sets[slot]) : null);
      paletteName = palette.name;
      editingPaletteIndex = null;
      renderPalette();
      bootstrap.Dropdown.getOrCreateInstance($("#library-button")).hide();
      return;
    }
    openSavedPaletteActionsIndex = openSavedPaletteActionsIndex === index ? null : index;
    renderSavedPalettes();
  }));
  $$("[data-load-palette]").forEach((button) => button.addEventListener("click", (event) => {
    event.stopPropagation();
    const index = Number(button.dataset.loadPalette);
    const palette = all[index];
    const lastUsed = palette.sets.reduce((last, set, slot) => set ? slot : last, -1);
    paletteSlots = Array.from({ length: Math.max(8, lastUsed + 1) }, (_, slot) => palette.sets[slot] ? structuredClone(palette.sets[slot]) : null);
    paletteName = palette.name;
    editingPaletteIndex = palette.permanent ? null : index - 1;
    openSavedPaletteActionsIndex = null;
    renderPalette();
    bootstrap.Dropdown.getOrCreateInstance($("#library-button")).hide();
  }));
  $$("[data-delete-palette]").forEach((button) => button.addEventListener("click", (event) => {
    event.stopPropagation();
    savedPalettes.splice(Number(button.dataset.deletePalette), 1);
    selectedSavedPaletteIndex = null;
    openSavedPaletteActionsIndex = null;
    write(KEYS.palettes, savedPalettes);
    renderSavedPalettes();
  }));
  $$("[data-rename-saved-palette]").forEach((button) => button.addEventListener("click", (event) => {
    event.stopPropagation();
    const index = Number(button.dataset.renameSavedPalette);
    const original = savedPalettes[index].name;
    const label = document.querySelector(`[data-saved-palette="${index + 1}"] .saved-item-name`);
    const input = document.createElement("input");
    input.className = "saved-item-name saved-palette-name-input";
    input.value = original;
    input.setAttribute("aria-label", `Rename palette ${original}`);
    label.replaceWith(input);
    openSavedPaletteActionsIndex = null;
    input.focus();
    input.select();
    let finished = false;
    const finish = (save) => {
      if (finished) return;
      finished = true;
      if (save) savedPalettes[index].name = input.value.trim() || original;
      write(KEYS.palettes, savedPalettes);
      renderSavedPalettes();
    };
    input.addEventListener("click", (inputEvent) => inputEvent.stopPropagation());
    input.addEventListener("blur", () => finish(true));
    input.addEventListener("keydown", (keyEvent) => {
      if (keyEvent.key === "Enter") { keyEvent.preventDefault(); finish(true); }
      if (keyEvent.key === "Escape") { keyEvent.preventDefault(); finish(false); }
    });
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
  $$("[data-set-size]").forEach((button) => button.classList.toggle("active", Number(button.dataset.setSize) === setSize));
  $$("[data-display-row]").forEach((button) => {
    const visible = button.dataset.displayRow === "stats" ? showStats : showComp;
    button.classList.toggle("active", visible);
    button.setAttribute("aria-pressed", String(visible));
  });
}

function updateDisplayRows() {
  $(".attributes-row").hidden = !showStats;
  $(".comparisons-row").hidden = !showComp;
  updateControls();
  requestAnimationFrame(() => renderStandby());
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
  $("#scheme-column-labels").style.setProperty("--set-size", setSize);
  $("#scheme-column-labels").innerHTML = metrics.map((_, index) => `<span>Swatch ${index + 1}</span>`).join("");
  $("#scheme-metrics").style.setProperty("--set-size", setSize);
  $("#scheme-metrics").innerHTML = metrics.map((item, index) => item ? `
    <div class="swatch-metrics ${index === selectedSetIndex ? "is-selected" : ""}">
      <span>Value <strong>${Math.round(item.l)}%</strong></span>
      <span>Chroma <strong>${Math.round(item.s)}%</strong></span>
    </div>` : `
    <div class="swatch-metrics is-empty">
      <span>Value <strong>—</strong></span>
      <span>Chroma <strong>—</strong></span>
    </div>`).join("");

  $("#scheme-differences").style.setProperty("--difference-count", Math.max(1, setSize - 1));
  $("#scheme-differences").style.setProperty("--comparison-width", `${(setSize - 1) / setSize * 100}%`);
  $("#comparison-labels").style.setProperty("--difference-count", Math.max(1, setSize - 1));
  $("#comparison-labels").style.setProperty("--comparison-width", `${(setSize - 1) / setSize * 100}%`);
  $("#comparison-labels").innerHTML = Array.from(
    { length: setSize - 1 },
    (_, index) => `<span>${index + 1} vs. ${index + 2}</span>`
  ).join("");
  $("#scheme-differences").innerHTML = Array.from({ length: setSize - 1 }, (_, index) => {
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
          <b>${deltas.map(signed).join(", ")}</b>
        </div>
      </div>`;
  }).join("");
}

function applyHelper(action) {
  record();
  let channels = rgb(builderColor);
  if (action === "shade") channels = channels.map((value) => value * .9);
  else if (action === "tint") channels = channels.map((value) => value + (255 - value) * .1);
  else if (action === "cooler") channels = [channels[0] * .9, channels[1] + (102 - channels[1]) * .1, channels[2] + (255 - channels[2]) * .1];
  else if (action === "warmer") channels = [channels[0] + (255 - channels[0]) * .1, channels[1] + (102 - channels[1]) * .1, channels[2] * .9];
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
  $("#palette-toggle").setAttribute("aria-label", open ? "Close palette" : "Open palette");
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
document.addEventListener("pointerdown", (event) => {
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
$("#clear-scheme").addEventListener("click", () => {
  hexMode = 3;
  activeDigit = 0;
  editing = false;
  setSlots = Array(setSize).fill("0".repeat(hexMode));
  selectedSetIndex = Math.floor(setSize / 2);
  builderColor = "0".repeat(hexMode);
  schemeName = "";
  editingSetIndex = null;
  editingPaletteSetIndex = null;
  renderSetBuilder();
  renderBuilder();
  renderStandby();
  updateControls();
});
$("#clear-palette").addEventListener("click", () => { paletteSlots.fill(null); selectedPaletteIndex = null; selectedPaletteColor = null; paletteName = ""; editingPaletteIndex = null; renderPalette(); });

$$("[data-hex-mode]").forEach((button) => button.addEventListener("click", () => {
  const mode = Number(button.dataset.hexMode);
  if (mode === hexMode) return;
  record(); hexMode = mode; builderColor = convert(builderColor, mode); activeDigit = Math.min(activeDigit, mode - 1);
  setSlots = setSlots.map((color) => color ? convert(color, mode) : null);
  setSlots[selectedSetIndex] = builderColor;
  renderBuilder(); renderStandby(); renderSetBuilder(); updateControls();
}));
$$("[data-set-size]").forEach((button) => button.addEventListener("click", () => {
  const nextSize = Number(button.dataset.setSize);
  if (nextSize === setSize) return;
  setSize = nextSize;
  setSlots = Array.from({ length: setSize }, (_, index) => setSlots[index] || "0".repeat(hexMode));
  selectedSetIndex = Math.min(selectedSetIndex, setSize - 1);
  builderColor = setSlots[selectedSetIndex];
  renderSetBuilder();
  renderBuilder();
  updateControls();
}));
$$("[data-display-row]").forEach((button) => button.addEventListener("click", () => {
  if (button.dataset.displayRow === "stats") showStats = !showStats;
  else showComp = !showComp;
  updateDisplayRows();
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

$("#save-scheme").addEventListener("click", async (event) => {
  event.stopPropagation();
  if (setSlots.some((color) => !color)) return alertUser("Fill every Scheme swatch before adding it to the palette.");
  const suggestedName = schemeName || setSlots.map((color) => `#${convert(color, hexMode)}`).join(" ");
  const result = await requestName(suggestedName, "Scheme", (name) => {
    const index = paletteSlots.findIndex((set, slot) => set && slot !== editingPaletteSetIndex && set.name.toLowerCase() === name.toLowerCase());
    return index < 0 ? null : { index };
  });
  if (result === null) return;
  const { name } = result;
  let targetIndex = editingPaletteSetIndex ?? paletteSlots.findIndex((set) => !set);
  if (result.replaceIndex !== null) {
    if (editingPaletteSetIndex !== null && editingPaletteSetIndex !== result.replaceIndex) paletteSlots[editingPaletteSetIndex] = null;
    targetIndex = result.replaceIndex;
  }
  if (targetIndex < 0) return alertUser("Palette is full.");
  schemeName = name;
  paletteSlots[targetIndex] = { name, colors: setSlots.slice(), hexMode };
  editingSetIndex = null;
  editingPaletteSetIndex = null;
  renderPalette();
  setPaletteOpen(true);
});

$("#save-palette").addEventListener("click", async () => {
  const sets = paletteSlots.filter(Boolean);
  if (!sets.length) return alertUser("Add at least one scheme to Palette.");
  const signature = sets.map((set) => set.colors.map(six).join("|")).join("||");
  const suggestedName = paletteName || sets.flatMap((set) => set.colors.map((color) => `#${normalize(color)}`)).join(" ");
  const result = await requestName(suggestedName, "Palette", (name) => {
    const duplicateIndex = savedPalettes.findIndex((palette, index) => index !== editingPaletteIndex && palette.name.toLowerCase() === name.toLowerCase());
    const matchesStarter = STARTER_PALETTE.name.toLowerCase() === name.toLowerCase();
    if (duplicateIndex >= 0) return { index: duplicateIndex };
    return matchesStarter ? { index: null, canReplace: false } : null;
  });
  if (result === null) return;
  const { name } = result;
  const targetIndex = result.replaceIndex ?? editingPaletteIndex;
  const comparisonPalettes = [STARTER_PALETTE, ...savedPalettes.filter((_, index) => index !== targetIndex && index !== editingPaletteIndex)];
  const duplicate = comparisonPalettes.find((palette) => (
    palette.sets.filter(Boolean).map((set) => set.colors.map(six).join("|")).join("||") === signature
  ));
  if (duplicate) return alertUser(`A duplicate is already saved as ${duplicate.name}.`);
  paletteName = name;
  const next = { name, sets: paletteSlots.map((set) => set ? structuredClone(set) : null) };
  if (targetIndex === null) {
    savedPalettes.unshift(next);
  } else {
    savedPalettes[targetIndex] = next;
    if (editingPaletteIndex !== null && editingPaletteIndex !== targetIndex) savedPalettes.splice(editingPaletteIndex, 1);
  }
  editingPaletteIndex = null; write(KEYS.palettes, savedPalettes); renderSavedPalettes(); pulse($("#library-button"));
});

renderBuilder();
renderStandby();
renderSetBuilder();
renderPalette();
renderSavedSets();
renderSavedPalettes();
updateDisplayRows();
syncAriaTooltips();
ariaTooltipObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-label"] });
