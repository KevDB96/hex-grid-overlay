# Hex Grid Overlay

Hex Grid Overlay is a browser-based workspace for preparing images for hex-grid overlays. This initial version provides the responsive editor shell only; image rendering and grid tools are planned for later work.

## Architecture and privacy

The site is built with HTML5, CSS3, vanilla JavaScript, and the Canvas 2D API. It is a static site with no backend, database, authentication, serverless functions, or runtime dependencies. Image processing is intended to happen locally in the browser, and image data must never leave the browser.

## Run locally

Open `index.html` directly in a modern browser. No package installation or build step is required. The PNG picker and drop area are visible in this shell; image decoding and rendering are not implemented yet.

## Hosting

The project is designed for static GitHub Pages hosting. Publish the repository's static files from GitHub Pages when hosting is configured.
