const HEX_DIGITS = "0123456789ABCDEF";
const STORAGE_KEY = "hex-box-saved-sets";
const SWATCH_STORAGE_KEY = "hex-box-saved-swatches";
const PALETTE_STORAGE_KEY = "hex-box-saved-palettes";
const PALETTE_STAGE_KEY = "hex-box-palette-staging";
const LEGACY_STORAGE_KEY = "hue-box-saved-sets";
const LEGACY_SWATCH_STORAGE_KEY = "hue-box-saved-swatches";
const LEGACY_PALETTE_STORAGE_KEY = "hue-box-saved-palettes";
const LEGACY_PALETTE_STAGE_KEY = "hue-box-palette-staging";
const DEFAULT_SETS = [
  {
    name: "Default Gray",
    colors: ["000", "888", "FFF"],
    hexMode: 3
  },
  {
    name: "Default RGB",
    colors: ["F00", "0F0", "F0F"],
    hexMode: 3
  }
];

let hexMode = 3;
let swatchCount = 3;
let compareMode = false;
let analyzeMode = false;
let analyzedColorIndexes = [];
let selectedEditorIndex = 1;
let comparisonColors = ["000", "888", "FFF"];
let editorColors = ["000", "888", "FFF"];
let savedSets = loadSavedSets();
let savedSwatches = loadSavedSwatches();
let savedPalettes = loadSavedPalettes();
let paletteSlots = loadPaletteStage();
let standbyFormat = "square";
let pointerDragIndex = null;
let undoStack = [];
let redoStack = [];
let editingSavedSetIndex = null;
let editingSavedPaletteIndex = null;

const colorGrid = document.querySelector("#color-grid");
const savedSetsPanel = document.querySelector("#saved-sets");
const savedSwatchesPanel = document.querySelector("#saved-swatches");
const paletteStagingPanel = document.querySelector("#palette-staging");
const savedPalettesPanel = document.querySelector("#saved-palettes");
const setNameInput = document.querySelector("#set-name");
const paletteNameInput = document.querySelector("#palette-name");
const savedMenuButton = document.querySelector("#saved-menu-button");
const savedPalettesButton = document.querySelector("#saved-palettes-button");
const duplicateWarning = document.querySelector("#duplicate-warning");
const duplicateWarningMessage = document.querySelector("#duplicate-warning-message");
const analysisDropdown = document.querySelector("#analysis-dropdown");

function pulseButton(button) {
  button.classList.remove("is-pulsing");
  void button.offsetWidth;
  button.classList.add("is-pulsing");
  window.setTimeout(function () {
    button.classList.remove("is-pulsing");
  }, 650);
}

function colorCombinationSignature(colors) {
  return colors.map(function (color) {
    return fullHex(color).toUpperCase();
  }).join("|");
}

function showDuplicateWarning(message) {
  duplicateWarningMessage.textContent = message;
  bootstrap.Modal.getOrCreateInstance(duplicateWarning).show();
}

function captureEditorState() {
  return {
    editorColors: editorColors.slice(),
    comparisonColors: comparisonColors.slice(),
    hexMode: hexMode,
    swatchCount: swatchCount,
    selectedEditorIndex: selectedEditorIndex
  };
}

function restoreEditorState(state) {
  editorColors = state.editorColors.slice();
  comparisonColors = state.comparisonColors.slice();
  hexMode = state.hexMode;
  swatchCount = state.swatchCount;
  selectedEditorIndex = state.selectedEditorIndex;
  renderColorEditors();
  renderSavedSwatches();
}

function recordEditorState() {
  undoStack.push(captureEditorState());
  if (undoStack.length > 100) undoStack.shift();
  redoStack = [];
}

function updateHistoryButtons() {
  const undoButton = document.querySelector("[data-undo]");
  const redoButton = document.querySelector("[data-redo]");
  if (undoButton) undoButton.disabled = undoStack.length === 0;
  if (redoButton) redoButton.disabled = redoStack.length === 0;
}

function fullHex(color) {
  if (color.length === 6) return "#" + color;

  return "#" + color
    .split("")
    .map(function (digit) {
      return digit + digit;
    })
    .join("");
}

function displayHex(color) {
  return "#" + color;
}

function recommendedTextColor(hex) {
  const channels = [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16)
  ].map(function (channel) {
    const value = channel / 255;
    return value <= 0.03928
      ? value / 12.92
      : Math.pow((value + 0.055) / 1.055, 2.4);
  });

  const luminance =
    channels[0] * 0.2126 +
    channels[1] * 0.7152 +
    channels[2] * 0.0722;

  return luminance > 0.179 ? "#000000" : "#FFFFFF";
}

function colorMetrics(color) {
  const rgb = toRgb(color).map(function (channel) {
    const value = channel / 255;
    return value <= 0.04045
      ? value / 12.92
      : Math.pow((value + 0.055) / 1.055, 2.4);
  });
  const l = 0.4122214708 * rgb[0] + 0.5363325363 * rgb[1] + 0.0514459929 * rgb[2];
  const m = 0.2119034982 * rgb[0] + 0.6806995451 * rgb[1] + 0.1073969566 * rgb[2];
  const s = 0.0883024619 * rgb[0] + 0.2817188376 * rgb[1] + 0.6299787005 * rgb[2];
  const lRoot = Math.cbrt(l);
  const mRoot = Math.cbrt(m);
  const sRoot = Math.cbrt(s);
  const lightness =
    0.2104542553 * lRoot +
    0.793617785 * mRoot -
    0.0040720468 * sRoot;
  const a =
    1.9779984951 * lRoot -
    2.428592205 * mRoot +
    0.4505937099 * sRoot;
  const b =
    0.0259040371 * lRoot +
    0.7827717662 * mRoot -
    0.808675766 * sRoot;
  const chroma = Math.sqrt(a * a + b * b);
  const hue = ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
  const temperature =
    chroma < 0.025
      ? "Neutral"
      : hue < 110 || hue >= 330
        ? "Warm"
        : "Cool";

  return {
    lightness: lightness,
    a: a,
    b: b,
    chroma: chroma,
    hue: hue,
    temperature: temperature,
    warmth: Math.cos(((hue - 50) * Math.PI) / 180) * chroma
  };
}

function signedNumber(value, digits) {
  const rounded = Number(value.toFixed(digits));
  return (rounded > 0 ? "+" : "") + rounded.toFixed(digits);
}

function renderFloatingAnalysis() {
  analysisDropdown.classList.toggle("d-none", !analyzeMode);
  if (!analyzeMode) return;

  analyzedColorIndexes = analyzedColorIndexes.filter(function (colorIndex) {
    return colorIndex < editorColors.length;
  });

  if (!analyzedColorIndexes.length) {
    analysisDropdown.innerHTML =
      `<div class="analysis-empty">Select up to 7 Staging swatches.</div>`;
    return;
  }

  const selectedColors = analyzedColorIndexes.map(function (colorIndex) {
    return editorColors[colorIndex];
  });
  const items = selectedColors.map(function (color) {
    const metrics = colorMetrics(color);
    const hex = fullHex(color);

    return `
      <div class="floating-analysis-item">
        <div
          class="floating-analysis-swatch"
          style="background-color:${hex};color:${recommendedTextColor(hex)}">
          ${color}
        </div>
        <span>Value ${Math.round(metrics.lightness * 100)}</span>
        <span>Chroma ${metrics.chroma.toFixed(2)}</span>
        <span>Temp ${metrics.temperature}</span>
      </div>
    `;
  }).join("");
  const spans = selectedColors.slice(0, -1).map(function (color, index) {
    const first = colorMetrics(color);
    const second = colorMetrics(selectedColors[index + 1]);
    const deltaE =
      Math.sqrt(
        Math.pow(second.lightness - first.lightness, 2) +
        Math.pow(second.a - first.a, 2) +
        Math.pow(second.b - first.b, 2)
      ) * 100;
    const warmthChange = second.warmth - first.warmth;
    const temperatureChange =
      Math.abs(warmthChange) < 0.01
        ? "same temp"
        : warmthChange > 0
          ? "warmer"
          : "cooler";

    return `
      <div class="floating-analysis-span">
        <span>ΔV ${signedNumber((second.lightness - first.lightness) * 100, 0)}</span>
        <span>ΔC ${signedNumber(second.chroma - first.chroma, 2)}</span>
        <span>${temperatureChange}</span>
        <span>ΔE ${deltaE.toFixed(1)}</span>
      </div>
    `;
  }).join("");

  analysisDropdown.innerHTML = `
    <div
      class="floating-analysis-items"
      style="--analysis-count:${selectedColors.length}">
      ${items}
    </div>
    ${spans
      ? `<div class="floating-analysis-spans" style="--analysis-span-count:${selectedColors.length - 1};--analysis-color-count:${selectedColors.length}">${spans}</div>`
      : ""}
  `;
}

function toggleAnalyzedColor(colorIndex) {
  const selectedPosition = analyzedColorIndexes.indexOf(colorIndex);

  if (selectedPosition !== -1) {
    analyzedColorIndexes.splice(selectedPosition, 1);
  } else if (analyzedColorIndexes.length < 7) {
    analyzedColorIndexes.push(colorIndex);
  }

  renderFloatingAnalysis();
}

function analysisMarkup(color) {
  if (!analyzeMode) return "";
  const metrics = colorMetrics(color);

  return `
    <div class="swatch-analysis">
      <span>Value ${Math.round(metrics.lightness * 100)}</span>
      <span>Chroma ${metrics.chroma.toFixed(2)}</span>
      <span>Temp ${metrics.temperature}</span>
    </div>
  `;
}

function differenceMarkup(colors) {
  if (!analyzeMode || colors.length < 2) return "";

  const differences = colors.slice(0, -1).map(function (color, index) {
    const first = colorMetrics(color);
    const second = colorMetrics(colors[index + 1]);
    const deltaE =
      Math.sqrt(
        Math.pow(second.lightness - first.lightness, 2) +
        Math.pow(second.a - first.a, 2) +
        Math.pow(second.b - first.b, 2)
      ) * 100;
    const warmthChange = second.warmth - first.warmth;
    const temperatureChange =
      Math.abs(warmthChange) < 0.01
        ? "similar"
        : warmthChange > 0
          ? "warmer"
          : "cooler";

    return `
      <div class="difference-cell">
        ΔV ${signedNumber((second.lightness - first.lightness) * 100, 0)}
        · ΔC ${signedNumber(second.chroma - first.chroma, 2)}
        · ${temperatureChange}
        · ΔE ${Math.round(deltaE)}
      </div>
    `;
  }).join("");

  return `
    <div
      class="difference-row"
      style="--swatch-count:${colors.length};--difference-count:${colors.length - 1}">
      ${differences}
    </div>
  `;
}

function toRgb(color) {
  const hex = fullHex(color);
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16)
  ];
}

function fromRgb(rgb) {
  if (hexMode === 3) {
    return rgb.map(function (channel) {
      return Math.round(channel / 17).toString(16).toUpperCase();
    }).join("");
  }

  return rgb.map(function (channel) {
    return Math.round(channel).toString(16).toUpperCase().padStart(2, "0");
  }).join("");
}

function rgbToHsl(rgb) {
  const red = rgb[0] / 255;
  const green = rgb[1] / 255;
  const blue = rgb[2] / 255;
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  const difference = maximum - minimum;
  let hue = 0;

  if (difference !== 0) {
    if (maximum === red) hue = 60 * (((green - blue) / difference) % 6);
    if (maximum === green) hue = 60 * ((blue - red) / difference + 2);
    if (maximum === blue) hue = 60 * ((red - green) / difference + 4);
  }

  if (hue < 0) hue += 360;

  const lightness = (maximum + minimum) / 2;
  const saturation =
    difference === 0
      ? 0
      : difference / (1 - Math.abs(2 * lightness - 1));

  return [hue, saturation, lightness];
}

function hslToRgb(hsl) {
  const hue = ((hsl[0] % 360) + 360) % 360;
  const saturation = Math.max(0, Math.min(1, hsl[1]));
  const lightness = Math.max(0, Math.min(1, hsl[2]));
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const section = hue / 60;
  const secondary = chroma * (1 - Math.abs((section % 2) - 1));
  let rgb = [0, 0, 0];

  if (section < 1) rgb = [chroma, secondary, 0];
  else if (section < 2) rgb = [secondary, chroma, 0];
  else if (section < 3) rgb = [0, chroma, secondary];
  else if (section < 4) rgb = [0, secondary, chroma];
  else if (section < 5) rgb = [secondary, 0, chroma];
  else rgb = [chroma, 0, secondary];

  const match = lightness - chroma / 2;
  return rgb.map(function (channel) {
    return (channel + match) * 255;
  });
}

function moveHueToward(hue, target) {
  const difference = ((target - hue + 540) % 360) - 180;
  return hue + difference * 0.12;
}

function convertColors(colors, mode) {
  return colors.map(function (color) {
    const rgb = toRgb(color);

    if (mode === 3) {
      return rgb.map(function (channel) {
        return Math.round(channel / 17).toString(16).toUpperCase();
      }).join("");
    }

    return rgb.map(function (channel) {
      return channel.toString(16).toUpperCase().padStart(2, "0");
    }).join("");
  });
}

function resizeColors(colors, targetCount) {
  if (colors.length === targetCount) return colors.slice();

  return Array.from({ length: targetCount }, function (_, targetIndex) {
    const position = targetCount === 1 ? 0 : targetIndex / (targetCount - 1);
    const sourcePosition = position * (colors.length - 1);
    const leftIndex = Math.floor(sourcePosition);
    const rightIndex = Math.min(colors.length - 1, Math.ceil(sourcePosition));
    const amount = sourcePosition - leftIndex;
    const left = toRgb(colors[leftIndex]);
    const right = toRgb(colors[rightIndex]);

    return fromRgb(left.map(function (channel, channelIndex) {
      return channel + (right[channelIndex] - channel) * amount;
    }));
  });
}

function loadSavedSets() {
  const saved =
    localStorage.getItem(STORAGE_KEY) ||
    localStorage.getItem(LEGACY_STORAGE_KEY);
  if (!saved) return [];

  try {
    return JSON.parse(saved);
  } catch (error) {
    return [];
  }
}

function saveSetsLocally() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(savedSets));
}

function loadSavedPalettes() {
  const saved =
    localStorage.getItem(PALETTE_STORAGE_KEY) ||
    localStorage.getItem(LEGACY_PALETTE_STORAGE_KEY);
  if (!saved) return [];

  try {
    return JSON.parse(saved);
  } catch (error) {
    return [];
  }
}

function savePalettesLocally() {
  localStorage.setItem(PALETTE_STORAGE_KEY, JSON.stringify(savedPalettes));
}

function loadPaletteStage() {
  const saved =
    localStorage.getItem(PALETTE_STAGE_KEY) ||
    localStorage.getItem(LEGACY_PALETTE_STAGE_KEY);
  if (!saved) return Array(60).fill(null);

  try {
    const colors = JSON.parse(saved);
    return Array.from({ length: 60 }, function (_, index) {
      return colors[index] || null;
    });
  } catch (error) {
    return Array(60).fill(null);
  }
}

function savePaletteStageLocally() {
  localStorage.setItem(PALETTE_STAGE_KEY, JSON.stringify(paletteSlots));
}

function loadSavedSwatches() {
  const saved =
    localStorage.getItem(SWATCH_STORAGE_KEY) ||
    localStorage.getItem(LEGACY_SWATCH_STORAGE_KEY);
  if (!saved) return Array(60).fill(null);

  try {
    const colors = JSON.parse(saved);
    return Array.from({ length: 60 }, function (_, index) {
      return colors[index] || null;
    });
  } catch (error) {
    return Array(60).fill(null);
  }
}

function saveSwatchesLocally() {
  localStorage.setItem(SWATCH_STORAGE_KEY, JSON.stringify(savedSwatches));
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function previewMarkup(color, previewType, colorIndex) {
  const hex = fullHex(color);
  const selectedClass =
    previewType === "editor" && colorIndex === selectedEditorIndex
      ? " is-selected"
      : "";
  const codeMarkup = previewType === "editor"
    ? `
      <input
        class="color-code color-code-input"
        value="${color}"
        maxlength="${hexMode}"
        data-direct-color="${colorIndex}"
        draggable="false"
        aria-label="Edit color ${color}">`
    : `<code class="color-code">${color}</code>`;

  return `
    <div
      class="color-preview${selectedClass}"
      data-${previewType}-preview="${colorIndex}"
      data-drag-row="${previewType}"
      data-drag-index="${colorIndex}"
      draggable="true"
      style="background-color:${hex};color:${recommendedTextColor(hex)}"
      aria-label="Color preview ${color}">
      ${codeMarkup}
    </div>
  `;
}

function channelValue(color, channelIndex) {
  return color[channelIndex];
}

function editorMarkup(color, colorIndex) {
  const channels = hexMode === 3
    ? ["red", "green", "blue"]
    : [
        "red first digit",
        "red second digit",
        "green first digit",
        "green second digit",
        "blue first digit",
        "blue second digit"
      ];

  const controls = channels.map(function (channel, channelIndex) {
    return `
      <div class="hex-stepper">
        <button
          class="btn btn-outline-secondary"
          type="button"
          data-color="${colorIndex}"
          data-channel="${channelIndex}"
          data-step="1"
          aria-label="Increase ${channel}">
          ▲
        </button>
        <button
          class="btn btn-outline-secondary"
          type="button"
          data-color="${colorIndex}"
          data-channel="${channelIndex}"
          data-step="-1"
          aria-label="Decrease ${channel}">
          ▼
        </button>
      </div>
    `;
  }).join("");

  return `
    <article class="color-unit">
      ${previewMarkup(color, "editor", colorIndex)}
      <div class="hex-controls" style="--hex-control-count:${hexMode}">
        ${controls}
      </div>
    </article>
  `;
}

function renderColorEditors() {
  if (selectedEditorIndex !== null) {
    selectedEditorIndex = Math.min(
      selectedEditorIndex,
      editorColors.length - 1
    );
  }
  colorGrid.style.setProperty("--swatch-count", swatchCount);

  const comparisonRow = comparisonColors.map(function (color, colorIndex) {
    return `
      <article class="color-unit">
        ${previewMarkup(color, "comparison", colorIndex)}
      </article>
    `;
  }).join("");

  const editorRow = editorColors.map(function (color, colorIndex) {
    return editorMarkup(color, colorIndex);
  }).join("");

  colorGrid.innerHTML = `
    ${compareMode ? `<div class="color-row comparison-row">${comparisonRow}</div>` : ""}
    <div class="color-row editor-row">${editorRow}</div>
  `;

  document.querySelector(".comparison-toolbar").classList.toggle(
    "d-none",
    !compareMode
  );

  document.querySelector("#comparison-summary").textContent =
    comparisonColors.join("  ");

  document.querySelectorAll("[data-hex-mode]").forEach(function (button) {
    const selected = Number(button.dataset.hexMode) === hexMode;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-pressed", selected);
  });

  document.querySelectorAll("[data-swatch-count]").forEach(function (button) {
    const selected = Number(button.dataset.swatchCount) === swatchCount;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-pressed", selected);
  });

  const compareButton = document.querySelector("[data-compare-toggle]");
  compareButton.classList.toggle("active", compareMode);
  compareButton.setAttribute("aria-pressed", compareMode);

  const analyzeButton = document.querySelector("[data-analyze-toggle]");
  analyzeButton.classList.toggle("active", analyzeMode);
  analyzeButton.setAttribute("aria-pressed", analyzeMode);

  updateHistoryButtons();
  renderFloatingAnalysis();
  addEditorEvents();
  addDragEvents();
}

function updateEditorChannel(colorIndex, channelIndex, value) {
  if (editorColors[colorIndex][channelIndex] === value) return;
  recordEditorState();
  const digits = editorColors[colorIndex].split("");
  digits[channelIndex] = value;
  editorColors[colorIndex] = digits.join("");
  selectedEditorIndex = null;

  renderColorEditors();
}

function updateEditorColor(colorIndex, value) {
  if (editorColors[colorIndex] === value) return;
  recordEditorState();
  editorColors[colorIndex] = value;
  selectedEditorIndex = colorIndex;
  renderColorEditors();
}

function addEditorEvents() {
  colorGrid.querySelectorAll("[data-editor-preview]").forEach(function (preview) {
    function activateDirectEntry() {
      selectedEditorIndex = Number(preview.dataset.editorPreview);
      const input = preview.querySelector("[data-direct-color]");
      input.focus();
      input.select();
    }

    preview.addEventListener("pointerdown", function (event) {
      if (analyzeMode) {
        event.preventDefault();
        return;
      }
      if (event.button !== 0 || event.target.matches("[data-direct-color]")) return;
      event.preventDefault();
      activateDirectEntry();
    });

    preview.addEventListener("click", function () {
      if (analyzeMode) {
        toggleAnalyzedColor(Number(preview.dataset.editorPreview));
        return;
      }
      activateDirectEntry();
    });
  });

  colorGrid.querySelectorAll("[data-step]").forEach(function (button) {
    button.addEventListener("click", function () {
      const colorIndex = Number(button.dataset.color);
      const channelIndex = Number(button.dataset.channel);
      const current = channelValue(editorColors[colorIndex], channelIndex);
      const next =
        (parseInt(current, 16) + Number(button.dataset.step) + 16) % 16;
      const nextValue = next
        .toString(16)
        .toUpperCase();

      updateEditorChannel(colorIndex, channelIndex, nextValue);
    });
  });

  colorGrid.querySelectorAll("[data-direct-color]").forEach(function (input) {
    input.addEventListener("pointerdown", function (event) {
      if (analyzeMode) event.preventDefault();
    });

    input.addEventListener("focus", function () {
      selectedEditorIndex = Number(input.dataset.directColor);
      colorGrid.querySelectorAll(".color-preview.is-selected").forEach(function (preview) {
        preview.classList.remove("is-selected");
      });
      input.closest(".color-preview").classList.add("is-selected");
      input.select();
    });

    input.addEventListener("click", function (event) {
      event.stopPropagation();
      if (analyzeMode) {
        toggleAnalyzedColor(Number(input.dataset.directColor));
        return;
      }
      input.select();
    });

    input.addEventListener("keydown", function (event) {
      if (event.key === "Enter") {
        event.preventDefault();
        input.blur();
      }
    });

    input.addEventListener("change", function () {
      const value = input.value.toUpperCase();
      const singleDigit = /^[0-9A-F]$/.test(value);
      const completeCode = new RegExp(`^[0-9A-F]{${hexMode}}$`).test(value);

      if (singleDigit || completeCode) {
        const nextColor = singleDigit ? value.repeat(hexMode) : value;
        updateEditorColor(Number(input.dataset.directColor), nextColor);
      } else {
        renderColorEditors();
      }
    });
  });
}

function applyHelper(action) {
  if (selectedEditorIndex === null) return;
  recordEditorState();
  const currentRgb = toRgb(editorColors[selectedEditorIndex]);
  let nextRgb = currentRgb.slice();

  if (action === "shade") {
    nextRgb = currentRgb.map(function (channel) {
      return channel * 0.9;
    });
  } else if (action === "tint") {
    nextRgb = currentRgb.map(function (channel) {
      return channel + (255 - channel) * 0.1;
    });
  } else {
    const hsl = rgbToHsl(currentRgb);

    if (action === "chroma-down") hsl[1] -= 0.1;
    if (action === "chroma-up") hsl[1] += 0.1;
    if (action === "cooler") hsl[0] = moveHueToward(hsl[0], 220);
    if (action === "warmer") hsl[0] = moveHueToward(hsl[0], 40);
    nextRgb = hslToRgb(hsl);
  }

  editorColors[selectedEditorIndex] = fromRgb(nextRgb);
  renderColorEditors();
}

function addDragEvents() {
  colorGrid.querySelectorAll(".color-preview[draggable='true']").forEach(function (preview) {
    preview.addEventListener("dragstart", function (event) {
      if (event.target.matches("[data-direct-color]")) {
        event.preventDefault();
        return;
      }
      preview.classList.add("is-dragging");
      event.dataTransfer.effectAllowed = "copyMove";
      event.dataTransfer.setData(
        "text/plain",
        JSON.stringify({
          row: preview.dataset.dragRow,
          index: Number(preview.dataset.dragIndex)
        })
      );
    });

    preview.addEventListener("dragend", function () {
      preview.classList.remove("is-dragging");
    });

    preview.addEventListener("dragover", function (event) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
    });

    preview.addEventListener("drop", function (event) {
      event.preventDefault();
      const draggedData = event.dataTransfer.getData("text/plain");
      if (!draggedData) return;

      const source = JSON.parse(draggedData);
      const targetRow = preview.dataset.dragRow;
      const targetIndex = Number(preview.dataset.dragIndex);

      if (source.row === "standby" && targetRow === "editor") {
        const standbyColor = savedSwatches[source.index];
        if (!standbyColor) return;
        recordEditorState();
        editorColors[targetIndex] = convertColors([standbyColor], hexMode)[0];
        selectedEditorIndex = targetIndex;
        renderColorEditors();
        return;
      }

      if (source.row !== targetRow || source.index === targetIndex) return;

      const colors = targetRow === "comparison"
        ? comparisonColors
        : editorColors;
      if (targetRow === "editor") recordEditorState();
      const movedColor = colors.splice(source.index, 1)[0];
      colors.splice(targetIndex, 0, movedColor);
      renderColorEditors();
    });
  });
}

function renderSavedSwatches() {
  savedSwatchesPanel.classList.toggle(
    "is-hexagon",
    standbyFormat === "hexagon"
  );
  paletteStagingPanel.classList.toggle(
    "is-hexagon",
    standbyFormat === "hexagon"
  );
  document.querySelectorAll("[data-standby-format]").forEach(function (button) {
    const selected = button.dataset.standbyFormat === standbyFormat;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-pressed", selected);
  });

  const slots = savedSwatches.map(function (color, slotIndex) {
    if (!color) {
      return `
        <div
          class="swatch-slot"
          data-swatch-slot="${slotIndex}"
          aria-label="Empty saved swatch slot ${slotIndex + 1}">
        </div>
      `;
    }

    const hex = fullHex(color);
    const displayedColor = convertColors([color], hexMode)[0];
    const displayedCode = displayedColor.length === 6
      ? `<span>${displayedColor.slice(0, 3)}</span><span>${displayedColor.slice(3)}</span>`
      : `<span>${displayedColor}</span>`;
    return `
      <div
        class="swatch-slot has-color"
        data-swatch-slot="${slotIndex}"
        data-standby-drag="${slotIndex}"
        draggable="true"
        style="background-color:${hex};color:${recommendedTextColor(hex)}"
        aria-label="Saved swatch ${displayedColor}">
        <code class="standby-code">${displayedCode}</code>
      </div>
    `;
  }).join("");

  savedSwatchesPanel.innerHTML = slots;

  savedSwatchesPanel.querySelectorAll("[data-standby-drag]").forEach(function (swatch) {
    swatch.addEventListener("dragstart", function (event) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData(
        "text/plain",
        JSON.stringify({
          row: "standby",
          index: Number(swatch.dataset.standbyDrag)
        })
      );
    });

    swatch.addEventListener("pointerdown", function (event) {
      if (event.pointerType === "mouse") return;
      pointerDragIndex = Number(swatch.dataset.standbyDrag);
      swatch.setPointerCapture(event.pointerId);
      swatch.classList.add("is-dragging");
    });

    swatch.addEventListener("pointermove", function (event) {
      if (pointerDragIndex === null) return;
      document.querySelectorAll("[data-swatch-slot].is-over, [data-swatch-trash].is-over").forEach(function (target) {
        target.classList.remove("is-over");
      });
      const target = document
        .elementFromPoint(event.clientX, event.clientY)
        ?.closest("[data-swatch-slot], [data-palette-slot], [data-swatch-trash]");
      if (target) target.classList.add("is-over");
    });

    swatch.addEventListener("pointerup", function (event) {
      if (pointerDragIndex === null) return;
      const sourceIndex = pointerDragIndex;
      pointerDragIndex = null;
      const target = document
        .elementFromPoint(event.clientX, event.clientY)
        ?.closest("[data-swatch-slot], [data-palette-slot], [data-swatch-trash], .editor-row .color-preview");

      if (target?.hasAttribute("data-swatch-trash")) {
        savedSwatches[sourceIndex] = null;
      } else if (target?.matches(".editor-row .color-preview")) {
        recordEditorState();
        editorColors[Number(target.dataset.dragIndex)] =
          convertColors([savedSwatches[sourceIndex]], hexMode)[0];
        selectedEditorIndex = Number(target.dataset.dragIndex);
      } else if (target?.hasAttribute("data-palette-slot")) {
        paletteSlots[Number(target.dataset.paletteSlot)] =
          savedSwatches[sourceIndex];
        savePaletteStageLocally();
      } else if (target?.hasAttribute("data-swatch-slot")) {
        const targetIndex = Number(target.dataset.swatchSlot);
        const targetColor = savedSwatches[targetIndex];
        savedSwatches[targetIndex] = savedSwatches[sourceIndex];
        savedSwatches[sourceIndex] = targetColor;
      }

      saveSwatchesLocally();
      renderSavedSwatches();
      renderPaletteSlots();
      renderColorEditors();
    });
  });

  savedSwatchesPanel.querySelectorAll("[data-swatch-slot]").forEach(function (slot) {
    slot.addEventListener("dragover", function (event) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
      slot.classList.add("is-over");
    });

    slot.addEventListener("dragleave", function () {
      slot.classList.remove("is-over");
    });

    slot.addEventListener("drop", function (event) {
      event.preventDefault();
      slot.classList.remove("is-over");
      const draggedData = event.dataTransfer.getData("text/plain");
      if (!draggedData) return;

      const source = JSON.parse(draggedData);
      const targetIndex = Number(slot.dataset.swatchSlot);

      if (source.row === "standby") {
        const targetColor = savedSwatches[targetIndex];
        savedSwatches[targetIndex] = savedSwatches[source.index];
        savedSwatches[source.index] = targetColor;
      } else if (source.row === "palette") {
        savedSwatches[targetIndex] = paletteSlots[source.index];
      } else {
        const colors = source.row === "comparison"
          ? comparisonColors
          : editorColors;
        savedSwatches[targetIndex] = colors[source.index];
      }

      saveSwatchesLocally();
      renderSavedSwatches();
    });
  });

  const trash = document.querySelector("[data-swatch-trash]");

  trash.ondragover = function (event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    trash.classList.add("is-over");
  };

  trash.ondragleave = function () {
    trash.classList.remove("is-over");
  };

  trash.ondrop = function (event) {
    event.preventDefault();
    trash.classList.remove("is-over");
    const draggedData = event.dataTransfer.getData("text/plain");
    if (!draggedData) return;

    const source = JSON.parse(draggedData);
    if (source.row === "standby") {
      savedSwatches[source.index] = null;
      saveSwatchesLocally();
      renderSavedSwatches();
    } else if (source.row === "palette") {
      paletteSlots[source.index] = null;
      savePaletteStageLocally();
      renderPaletteSlots();
    }
  };
}

function renderPaletteSlots() {
  paletteStagingPanel.classList.toggle(
    "is-hexagon",
    standbyFormat === "hexagon"
  );

  paletteStagingPanel.innerHTML = paletteSlots.map(function (color, slotIndex) {
    if (!color) {
      return `
        <div
          class="swatch-slot"
          data-palette-slot="${slotIndex}"
          aria-label="Empty palette slot ${slotIndex + 1}">
        </div>
      `;
    }

    const hex = fullHex(color);
    const displayedColor = convertColors([color], hexMode)[0];
    const displayedCode = displayedColor.length === 6
      ? `<span>${displayedColor.slice(0, 3)}</span><span>${displayedColor.slice(3)}</span>`
      : `<span>${displayedColor}</span>`;

    return `
      <div
        class="swatch-slot has-color"
        data-palette-slot="${slotIndex}"
        data-palette-drag="${slotIndex}"
        draggable="true"
        style="background-color:${hex};color:${recommendedTextColor(hex)}"
        aria-label="Palette swatch ${displayedColor}">
        <code class="standby-code">${displayedCode}</code>
      </div>
    `;
  }).join("");

  paletteStagingPanel.querySelectorAll("[data-palette-drag]").forEach(function (swatch) {
    swatch.addEventListener("dragstart", function (event) {
      event.dataTransfer.effectAllowed = "copyMove";
      event.dataTransfer.setData(
        "text/plain",
        JSON.stringify({
          row: "palette",
          index: Number(swatch.dataset.paletteDrag)
        })
      );
    });
  });

  paletteStagingPanel.querySelectorAll("[data-palette-slot]").forEach(function (slot) {
    slot.addEventListener("dragover", function (event) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
      slot.classList.add("is-over");
    });

    slot.addEventListener("dragleave", function () {
      slot.classList.remove("is-over");
    });

    slot.addEventListener("drop", function (event) {
      event.preventDefault();
      slot.classList.remove("is-over");
      const draggedData = event.dataTransfer.getData("text/plain");
      if (!draggedData) return;

      const source = JSON.parse(draggedData);
      const targetIndex = Number(slot.dataset.paletteSlot);

      if (source.row === "palette") {
        const targetColor = paletteSlots[targetIndex];
        paletteSlots[targetIndex] = paletteSlots[source.index];
        paletteSlots[source.index] = targetColor;
      } else if (source.row === "standby") {
        paletteSlots[targetIndex] = savedSwatches[source.index];
      } else if (source.row === "set") {
        source.colors.forEach(function (color, colorIndex) {
          const destinationIndex = targetIndex + colorIndex;
          if (destinationIndex < paletteSlots.length) {
            paletteSlots[destinationIndex] = color;
          }
        });
      } else {
        const colors = source.row === "comparison"
          ? comparisonColors
          : editorColors;
        paletteSlots[targetIndex] = colors[source.index];
      }

      savePaletteStageLocally();
      renderPaletteSlots();
    });
  });
}

function renderSavedSets() {
  const displayedSets = savedSets.concat(DEFAULT_SETS);

  savedSetsPanel.innerHTML = displayedSets.map(function (set, setIndex) {
    const colors = set.colors || set;
    const isPermanent = setIndex >= savedSets.length;
    const displayName =
      set.name && set.name.trim()
        ? set.name
        : colors.map(displayHex).join(" ");
    const swatches = colors.map(function (color) {
      const hex = fullHex(color);

      return `
        <span
          class="saved-set-swatch"
          style="background-color:${hex};color:${recommendedTextColor(hex)}">
          ${displayHex(color)}
        </span>
      `;
    }).join("");

    return `
      <div class="saved-set">
        <div class="saved-set-heading">
          <span class="saved-set-name">${escapeHtml(displayName)}</span>
          <div class="btn-group saved-set-actions" role="group" aria-label="Actions for ${escapeHtml(displayName)}">
            <button class="btn btn-outline-secondary" type="button" data-edit-saved-set="${setIndex}">Edit</button>
            ${isPermanent
              ? `<button class="btn btn-outline-secondary" type="button" disabled aria-label="${escapeHtml(displayName)} cannot be deleted">Delete</button>`
              : `<button class="btn btn-outline-secondary" type="button" data-delete-saved-set="${setIndex}">Delete</button>`}
          </div>
        </div>
        <button
          class="saved-set-swatches"
          type="button"
          data-saved-set="${setIndex}"
          data-saved-set-drag="${setIndex}"
          draggable="true"
          style="--swatch-count:${colors.length}"
          aria-label="Load ${escapeHtml(displayName)}">
          ${swatches}
        </button>
      </div>
    `;
  }).join("");

  savedSetsPanel.querySelectorAll("[data-saved-set]").forEach(function (button) {
    button.addEventListener("click", function () {
      const set = displayedSets[Number(button.dataset.savedSet)];
      const colors = set.colors || set;
      editingSavedSetIndex = null;
      hexMode = set.hexMode || colors[0].length;
      swatchCount = colors.length;
      comparisonColors = colors.slice();
      setNameInput.value = set.name || colors.map(displayHex).join(" ");
      renderColorEditors();
      renderSavedSwatches();
    });
  });

  savedSetsPanel.querySelectorAll("[data-saved-set-drag]").forEach(function (button) {
    button.addEventListener("dragstart", function (event) {
      const set = displayedSets[Number(button.dataset.savedSetDrag)];
      event.dataTransfer.effectAllowed = "copy";
      event.dataTransfer.setData(
        "text/plain",
        JSON.stringify({
          row: "set",
          colors: (set.colors || set).slice()
        })
      );
    });
  });

  savedSetsPanel.querySelectorAll("[data-edit-saved-set]").forEach(function (button) {
    button.addEventListener("click", function () {
      const setIndex = Number(button.dataset.editSavedSet);
      const set = displayedSets[setIndex];
      const colors = set.colors || set;
      recordEditorState();
      editingSavedSetIndex = setIndex < savedSets.length ? setIndex : null;
      hexMode = set.hexMode || colors[0].length;
      swatchCount = colors.length;
      comparisonColors = colors.slice();
      editorColors = colors.slice();
      selectedEditorIndex = null;
      setNameInput.value = set.name || colors.map(displayHex).join(" ");
      renderColorEditors();
      renderSavedSwatches();
    });
  });

  savedSetsPanel.querySelectorAll("[data-delete-saved-set]").forEach(function (button) {
    button.addEventListener("click", function () {
      const setIndex = Number(button.dataset.deleteSavedSet);
      const set = savedSets[setIndex];
      const colors = set.colors || set;
      const name =
        set.name && set.name.trim()
          ? set.name
          : colors.map(displayHex).join(" ");
      if (!window.confirm(`Delete "${name}"?`)) return;
      savedSets.splice(setIndex, 1);
      editingSavedSetIndex = null;
      saveSetsLocally();
      renderSavedSets();
    });
  });
}

function paletteSignature(colors) {
  return colors.map(function (color) {
    return color ? fullHex(color).toUpperCase() : "";
  }).join("|");
}

function renderSavedPalettes() {
  if (!savedPalettes.length) {
    savedPalettesPanel.innerHTML =
      `<div class="saved-items-empty">No saved palettes.</div>`;
    return;
  }

  savedPalettesPanel.innerHTML = savedPalettes.map(function (palette, paletteIndex) {
    const preview = palette.colors.map(function (color) {
      const style = color ? `background-color:${fullHex(color)}` : "";
      return `<span class="saved-palette-swatch" style="${style}"></span>`;
    }).join("");

    return `
      <div class="saved-set">
        <div class="saved-set-heading">
          <span class="saved-set-name">${escapeHtml(palette.name)}</span>
          <div class="btn-group saved-set-actions" role="group" aria-label="Actions for ${escapeHtml(palette.name)}">
            <button class="btn btn-outline-secondary" type="button" data-edit-palette="${paletteIndex}">Edit</button>
            <button class="btn btn-outline-secondary" type="button" data-delete-palette="${paletteIndex}">Delete</button>
          </div>
        </div>
        <button
          class="saved-palette-preview"
          type="button"
          data-load-palette="${paletteIndex}"
          aria-label="Load ${escapeHtml(palette.name)}">
          ${preview}
        </button>
      </div>
    `;
  }).join("");

  savedPalettesPanel.querySelectorAll("[data-load-palette]").forEach(function (button) {
    button.addEventListener("click", function () {
      const palette = savedPalettes[Number(button.dataset.loadPalette)];
      paletteSlots = Array.from({ length: 60 }, function (_, index) {
        return palette.colors[index] || null;
      });
      paletteNameInput.value = palette.name;
      editingSavedPaletteIndex = null;
      savePaletteStageLocally();
      renderPaletteSlots();
    });
  });

  savedPalettesPanel.querySelectorAll("[data-edit-palette]").forEach(function (button) {
    button.addEventListener("click", function () {
      const paletteIndex = Number(button.dataset.editPalette);
      const palette = savedPalettes[paletteIndex];
      paletteSlots = Array.from({ length: 60 }, function (_, index) {
        return palette.colors[index] || null;
      });
      paletteNameInput.value = palette.name;
      editingSavedPaletteIndex = paletteIndex;
      savePaletteStageLocally();
      renderPaletteSlots();
    });
  });

  savedPalettesPanel.querySelectorAll("[data-delete-palette]").forEach(function (button) {
    button.addEventListener("click", function () {
      const paletteIndex = Number(button.dataset.deletePalette);
      const palette = savedPalettes[paletteIndex];
      if (!window.confirm(`Delete "${palette.name}"?`)) return;
      savedPalettes.splice(paletteIndex, 1);
      editingSavedPaletteIndex = null;
      savePalettesLocally();
      renderSavedPalettes();
    });
  });
}

function extrapolateStandby() {
  const anchors = savedSwatches.reduce(function (result, color, index) {
    if (color) result.push({ index: index, color: color });
    return result;
  }, []);

  if (!anchors.length) {
    showDuplicateWarning("Add at least one swatch to Standby before extrapolating.");
    return;
  }

  savedSwatches = savedSwatches.map(function (color, slotIndex) {
    if (color) return color;
    if (anchors.length === 1) return anchors[0].color;

    let rightAnchor = anchors.find(function (anchor) {
      return anchor.index > slotIndex;
    });
    let leftAnchor = anchors.slice().reverse().find(function (anchor) {
      return anchor.index < slotIndex;
    });

    if (!leftAnchor) return rightAnchor.color;
    if (!rightAnchor) return leftAnchor.color;

    const amount =
      (slotIndex - leftAnchor.index) /
      (rightAnchor.index - leftAnchor.index);
    const leftRgb = toRgb(leftAnchor.color);
    const rightRgb = toRgb(rightAnchor.color);
    const mixed = leftRgb.map(function (channel, channelIndex) {
      return channel + (rightRgb[channelIndex] - channel) * amount;
    });

    return mixed.map(function (channel) {
      return Math.round(channel)
        .toString(16)
        .toUpperCase()
        .padStart(2, "0");
    }).join("");
  });

  saveSwatchesLocally();
  renderSavedSwatches();
}

document.querySelectorAll("[data-hex-mode]").forEach(function (button) {
  button.addEventListener("click", function () {
    const nextMode = Number(button.dataset.hexMode);
    if (nextMode === hexMode) return;
    recordEditorState();
    comparisonColors = convertColors(comparisonColors, nextMode);
    editorColors = convertColors(editorColors, nextMode);
    hexMode = nextMode;
    renderColorEditors();
    renderSavedSwatches();
  });
});

document.querySelectorAll("[data-swatch-count]").forEach(function (button) {
  button.addEventListener("click", function () {
    const nextCount = Number(button.dataset.swatchCount);
    if (nextCount === swatchCount) return;
    recordEditorState();
    comparisonColors = resizeColors(comparisonColors, nextCount);
    editorColors = resizeColors(editorColors, nextCount);
    swatchCount = nextCount;
    renderColorEditors();
  });
});

document.querySelector("[data-compare-toggle]").addEventListener("click", function () {
  compareMode = !compareMode;
  renderColorEditors();
});

document.querySelector("[data-analyze-toggle]").addEventListener("click", function () {
  analyzeMode = !analyzeMode;
  if (!analyzeMode) analyzedColorIndexes = [];
  renderColorEditors();
});

document.querySelectorAll("[data-standby-format]").forEach(function (button) {
  button.addEventListener("click", function () {
    standbyFormat = button.dataset.standbyFormat;
    renderSavedSwatches();
    renderPaletteSlots();
  });
});

document.querySelector("[data-extrapolate]").addEventListener("click", function () {
  extrapolateStandby();
});

document.querySelectorAll("[data-helper]").forEach(function (button) {
  button.addEventListener("click", function () {
    applyHelper(button.dataset.helper);
  });
});

document.querySelector("#edit-set").addEventListener("click", function () {
  recordEditorState();
  editorColors = comparisonColors.slice();
  renderColorEditors();
});

document.querySelector("[data-undo]").addEventListener("click", function () {
  if (!undoStack.length) return;
  redoStack.push(captureEditorState());
  restoreEditorState(undoStack.pop());
});

document.querySelector("[data-redo]").addEventListener("click", function () {
  if (!redoStack.length) return;
  undoStack.push(captureEditorState());
  restoreEditorState(redoStack.pop());
});

document.querySelector("[data-complement]").addEventListener("click", function () {
  if (selectedEditorIndex === null) return;
  recordEditorState();
  const hsl = rgbToHsl(toRgb(editorColors[selectedEditorIndex]));
  hsl[0] = (hsl[0] + 180) % 360;
  editorColors[selectedEditorIndex] = fromRgb(hslToRgb(hsl));
  renderColorEditors();
});

document.querySelector("[data-reset]").addEventListener("click", function () {
  recordEditorState();
  editorColors = resizeColors(
    convertColors(["000", "888", "FFF"], hexMode),
    swatchCount
  );
  selectedEditorIndex = Math.floor(editorColors.length / 2);
  renderColorEditors();
});

document.querySelector("#save-set").addEventListener("click", function () {
  const name =
    setNameInput.value.trim() ||
    editorColors.map(displayHex).join(" ");
  const allSavedSets = savedSets
    .filter(function (_, setIndex) {
      return setIndex !== editingSavedSetIndex;
    })
    .concat(DEFAULT_SETS);
  const duplicateName = allSavedSets.some(function (set) {
    const colors = set.colors || set;
    const savedName =
      set.name && set.name.trim()
        ? set.name.trim()
        : colors.map(displayHex).join(" ");
    return savedName.toLowerCase() === name.toLowerCase();
  });
  const signature = colorCombinationSignature(editorColors);
  const duplicateColors = allSavedSets.some(function (set) {
    return colorCombinationSignature(set.colors || set) === signature;
  });

  if (duplicateName && duplicateColors) {
    showDuplicateWarning("A saved set already has this name and exact color combination.");
    return;
  }

  if (duplicateName) {
    showDuplicateWarning("A saved set already uses this name. Choose a different name.");
    return;
  }

  if (duplicateColors) {
    showDuplicateWarning("This exact color combination is already saved.");
    return;
  }

  const savedSet = {
    name: name,
    colors: editorColors.slice(),
    hexMode: hexMode
  };

  if (editingSavedSetIndex === null) {
    savedSets.unshift(savedSet);
  } else {
    savedSets[editingSavedSetIndex] = savedSet;
  }
  editingSavedSetIndex = null;
  saveSetsLocally();
  renderSavedSets();
  pulseButton(savedMenuButton);
});

document.querySelector("#save-palette").addEventListener("click", function () {
  const name =
    paletteNameInput.value.trim() ||
    "Palette " + (savedPalettes.length + 1);
  const comparablePalettes = savedPalettes.filter(function (_, paletteIndex) {
    return paletteIndex !== editingSavedPaletteIndex;
  });
  const duplicateName = comparablePalettes.some(function (palette) {
    return palette.name.trim().toLowerCase() === name.toLowerCase();
  });
  const signature = paletteSignature(paletteSlots);
  const duplicateColors = comparablePalettes.some(function (palette) {
    return paletteSignature(palette.colors) === signature;
  });

  if (duplicateName && duplicateColors) {
    showDuplicateWarning("A saved palette already has this name and exact slot arrangement.");
    return;
  }

  if (duplicateName) {
    showDuplicateWarning("A saved palette already uses this name. Choose a different name.");
    return;
  }

  if (duplicateColors) {
    showDuplicateWarning("This exact palette slot arrangement is already saved.");
    return;
  }

  const palette = {
    name: name,
    colors: paletteSlots.slice()
  };

  if (editingSavedPaletteIndex === null) {
    savedPalettes.unshift(palette);
  } else {
    savedPalettes[editingSavedPaletteIndex] = palette;
  }
  editingSavedPaletteIndex = null;
  savePalettesLocally();
  renderSavedPalettes();
  pulseButton(savedPalettesButton);
});

document.querySelector("#clear-set").addEventListener("click", function () {
  recordEditorState();
  editorColors = resizeColors(
    convertColors(["000", "888", "FFF"], hexMode),
    swatchCount
  );
  comparisonColors = editorColors.slice();
  selectedEditorIndex = null;
  editingSavedSetIndex = null;
  setNameInput.value = "";
  renderColorEditors();
});

document.querySelector("#clear-palette").addEventListener("click", function () {
  if (!paletteSlots.some(Boolean)) {
    paletteNameInput.value = "";
    return;
  }
  if (!window.confirm("Clear every swatch from Staging?")) return;
  paletteSlots = Array(60).fill(null);
  editingSavedPaletteIndex = null;
  paletteNameInput.value = "";
  savePaletteStageLocally();
  renderPaletteSlots();
});

document.querySelector("#clear-standby").addEventListener("click", function () {
  if (!savedSwatches.some(Boolean)) return;
  if (!window.confirm("Clear every swatch from Standby?")) return;
  savedSwatches = Array(60).fill(null);
  saveSwatchesLocally();
  renderSavedSwatches();
});

document.addEventListener("click", function (event) {
  if (event.target.closest(".editor-row .color-unit")) return;
  if (selectedEditorIndex === null) return;
  selectedEditorIndex = null;
  renderColorEditors();
});

renderColorEditors();
renderSavedSwatches();
renderPaletteSlots();
renderSavedSets();
renderSavedPalettes();
