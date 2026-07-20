# Hex Box

Hex Box is a browser-based tool for building five-swatch hexadecimal color sets, comparing their value and chroma, staging individual swatches, and assembling sets into reusable palettes.

## Run locally

Hex Box is a static site with no build step.

```bash
python3 -m http.server 8766
```

Open [http://localhost:8766](http://localhost:8766) in a browser.

## Workflow

1. Edit the five colors in **Set**.
2. Review each swatch's value and chroma in **Stats**.
3. Review changes between adjacent swatches in **Comp**.
4. Enter an optional set name and select **Save to Palette**.
5. Open the right-side **Palette** drawer with the arrow tab.
6. Enter an optional palette name and select **Save to Library**.
7. Open **Palette Library** in the header to edit or delete saved palettes.

## Set controls

- Choose `#3` or `#6` to work with three- or six-digit hex values.
- Use the arrows above and below each digit to increment or decrement it.
- Select a digit and use the keyboard to edit it directly.
- **Shade** and **Tint** adjust value.
- **Mute** and **Vivid** adjust chroma.
- **Clear** empties all five set slots.

### Keyboard shortcuts

- `Enter` or `E`: enter digit-editing mode.
- Arrow Left/Right: move between digits.
- Arrow Up/Down: increment or decrement the active digit.
- `Escape`, `Q`, or Backspace: leave digit-editing mode.
- Ctrl/Cmd+Z: undo.
- Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y: redo.

## Staging

Staging provides three rows of square swatch slots. Its column count responds to available width.

- Drag Set swatches into empty Staging slots.
- Drag Staging swatches into Set slots to move them back into the set.
- Drag Staging swatches between slots to rearrange them.
- Select a swatch and use **Delete** to remove it.
- **Compress** packs colors left to right and top to bottom.
- Resizing recomputes the available cells and automatically compresses the arrangement.
- **Clear** removes every staged swatch.

## Palette drawer

Palette uses one full-width set per row and always provides at least three rows.

- Use the arrow tab on the right edge to open or close the drawer.
- Clicking outside the drawer or pressing Escape closes it.
- Drag populated palette rows to reorder them.
- **Clear** empties the current palette.

## Data storage

Saved palettes and staged swatches are stored in the browser's `localStorage`. Data is local to the browser and origin being used; clearing site data removes it.

## Project files

- `index.html` — application structure and Bootstrap markup.
- `styles.css` — layout, responsive behavior, drawers, swatches, and controls.
- `script.js` — color editing, analysis, drag-and-drop, history, responsive slot sizing, and persistence.
- `vendor/bootstrap/` — locally bundled Bootstrap assets.
