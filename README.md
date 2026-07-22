# Hex Box

Hex Box is a browser-based tool for building three- or five-swatch hexadecimal color sets, evaluating their steps, staging individual swatches, and assembling sets into reusable palettes.

Use Hex Box at [cgoss-dev.github.io/hex-box](https://cgoss-dev.github.io/hex-box/).

## Run locally

Hex Box is a static site with no build step.

```bash
python3 -m http.server 8766
```

## Workflow

1. Edit a three- or five-color **Set** in **Staging**.
2. Review adjacent swatch changes in **Stats**.
3. Use the **Stats** controls to independently show or hide Steps and Temp.
4. Select **Save to Palette**, then confirm or edit the hex-based name in the **Name** dialog.
5. Use the inline **Palette** card on larger screens, or open its drawer with the arrow tab on small screens.
6. Select **Save to Library**, then confirm or edit the hex-based name in the **Name** dialog.
7. Open **Palette Library** in the header to edit or delete saved palettes.

## Set controls

- Choose **3** or **5** under **Swatches** to set the set size.
- Choose `#3` or `#6` to work with three- or six-digit hex values.
- Use the arrows above and below each digit to increment or decrement it.
- Select a digit and use the keyboard to edit it directly.
- **Shade** and **Tint** adjust value.
- **Mute** and **Vivid** adjust chroma.
- **Cooler** and **Warmer** adjust color temperature.
- **Clear** resets every set swatch to `000` and returns to three-digit hex mode.

### Keyboard shortcuts

- `Enter` or `E`: enter digit-editing mode.
- Arrow Left/Right: move between digits.
- Arrow Up/Down: increment or decrement the active digit.
- `Escape`, `Q`, or Backspace: leave digit-editing mode.
- Ctrl/Cmd+Z: undo.
- Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y: redo.

## Standby

Standby holds swatches for later in responsive square slots. Slots scale from 5 × 5rem to 10 × 10rem and reflow from left to right, then top to bottom.

- Drag Set swatches into Standby and drag Standby swatches back into Set.
- Drag within Standby to reorder swatches while preserving their sequence.
- Select a Standby swatch to reveal its circular × delete control.
- Standby starts with three rows and adds another only when its existing rows are at least 75% full.
- Internal scrolling begins only when those occupancy-driven rows exceed the card's visible height.

## Palette

Palette wraps fixed-width set cards into as many columns as the available width permits.

- Above 768px, Staging, Standby, and Controls form the left column, while Palette spans the two right columns.
- At 768px and below, use the arrow tab on the right edge to open or close the drawer.
- In drawer mode, clicking outside the drawer or pressing Escape closes it.
- Palette swatches display their hex values with C/N/W temperature markers beneath them and a green = or red ≠ showing whether all adjacent steps are equal.
- Use a set's + menu to rename, edit, or delete it.
- Drag a palette set into the **Set** card to load and edit it.
- Drag populated set cards onto any Palette slot to rearrange them.
- **Compress** removes empty gaps; **Clear** empties the current palette.

The Library includes a permanent, editable **Starter** palette with 24 named Shade/Base/Tint sets. Starter can be renamed or replaced like other palettes.
Saving a palette with an existing name automatically creates the next version, such as `Name v1`, `Name v2`, and so on.
Palettes whose set contents exactly match an existing Library entry are rejected and identify the matching saved palette.

## Data storage

Saved palettes and staged swatches are stored in the browser's `localStorage`. Data is local to the browser and origin being used; clearing site data removes it.

## Project files

- `index.html` — application structure and Bootstrap markup.
- `styles.css` — layout, responsive behavior, drawers, swatches, and controls.
- `script.js` — color editing, analysis, drag-and-drop, history, responsive slot sizing, and persistence.
- `vendor/bootstrap/` — locally bundled Bootstrap assets.
