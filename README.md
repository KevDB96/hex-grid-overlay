# Hex Grid Overlay

Hex Grid Overlay is a static browser editor for adding pointy-top or flat-top hex grids to PNG maps.

## Batch workflow

- Select or drop one or more PNGs.
- Use Previous / Next or the image selector to move through the loaded batch.
- Every PNG has its own independent grid size, position, color, opacity, line width, and orientation.
- **Apply Current Grid to All** copies the active PNG's grid settings to every loaded PNG as a starting point. After that, each PNG can still be adjusted independently.
- **Export Current PNG** downloads only the active image.
- **Export All ZIP** renders every loaded PNG with its own stored grid settings and downloads them together in one ZIP file.

## Architecture and privacy

The site uses HTML5, CSS3, vanilla JavaScript, and the Canvas 2D API only. ZIP generation is implemented in-browser with no runtime dependency. There is no backend, database, authentication, serverless function, or image-upload API. Image data stays in the browser.

## Run locally

Open `index.html` directly in a modern browser. No package installation or build step is required.

Drag the map to move its grid, drag the yellow handle to resize it, or use the numeric controls. Arrow keys move the active grid by one pixel; Shift+Arrow moves it by ten. `+` and `-` adjust hex size, and `R` resets the active grid when focus is outside a control.

## Hosting

The project is designed for static GitHub Pages hosting from the `main` branch repository root.
