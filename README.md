# Hex Grid Overlay

Hex Grid Overlay is a browser-based editor for adding a pointy-top or flat-top hex grid to a PNG. Set the grid size, position, color, opacity, and line width, then export a clean PNG at the source image's dimensions.

## Architecture and privacy

The site is built with HTML5, CSS3, vanilla JavaScript, and the Canvas 2D API. It is a static site with no backend, database, authentication, serverless functions, or runtime dependencies. Image processing is intended to happen locally in the browser, and image data must never leave the browser.

## Run locally

Open `index.html` directly in a modern browser. No package installation or build step is required. Select or drop a PNG to display it at native canvas resolution. Drag the image to move the grid, drag the yellow handle to resize it, or use the numeric controls. Arrow keys move the grid by one pixel; Shift+Arrow moves it by ten. `+` and `-` adjust hex size, and `R` resets the grid when focus is outside a control. Export saves a PNG at the source dimensions. Image bytes remain in the browser and are not uploaded.

## Hosting

The project is designed for static GitHub Pages hosting. The hosted URL is `https://kevdb96.github.io/hex-grid-overlay/` once Pages is enabled for the `main` branch, repository root.
