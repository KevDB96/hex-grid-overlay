(() => {
  const fileInput = document.getElementById('image-file');
  const fileStatus = document.getElementById('file-status');
  const appMessage = document.getElementById('app-message');
  const dropZone = document.getElementById('drop-zone');
  const uploadDropTarget = document.getElementById('upload-drop-target');
  const canvas = document.getElementById('workspace-canvas');
  const resizeHandle = document.getElementById('resize-handle');
  const resetButton = document.getElementById('reset-grid');
  const exportButton = document.getElementById('export-png');
  const exportZipButton = document.getElementById('export-zip');
  const applyToAllButton = document.getElementById('apply-to-all');
  const setHexSizeAllButton = document.getElementById('set-hex-size-all');
  const splitVerticalButton = document.getElementById('split-vertical');
  const splitHorizontalButton = document.getElementById('split-horizontal');
  const splitFourButton = document.getElementById('split-four');
  const previousButton = document.getElementById('previous-image');
  const nextButton = document.getElementById('next-image');
  const removeImageButton = document.getElementById('remove-image');
  const imageSelector = document.getElementById('image-selector');
  const context = canvas.getContext('2d');
  const opacityValue = document.getElementById('opacity-value');
  const lineWidthValue = document.getElementById('line-width-value');
  const controls = {
    hexSize: document.getElementById('hex-size'),
    offsetX: document.getElementById('offset-x'),
    offsetY: document.getElementById('offset-y'),
    gridColor: document.getElementById('grid-color'),
    gridOpacity: document.getElementById('grid-opacity'),
    lineWidth: document.getElementById('line-width'),
    orientation: document.getElementById('orientation')
  };

  const state = {
    image: null,
    filename: '',
    hexSize: 40,
    offsetX: 0,
    offsetY: 0,
    gridColor: '#ffffff',
    gridOpacity: 0.8,
    lineWidth: 2,
    orientation: 'pointy',
    batch: [],
    activeIndex: -1
  };

  const gridKeys = ['hexSize', 'offsetX', 'offsetY', 'gridColor', 'gridOpacity', 'lineWidth', 'orientation'];
  const preferenceKey = 'hex-grid-overlay.preferences.v1';
  const maxCells = 100000;
  let activePointerId = null;
  let dragStart = null;
  let resizeStart = null;
  let drawFrame = 0;
  let loading = false;
  let exporting = false;

  function copyGrid(source = state) {
    return Object.fromEntries(gridKeys.map((key) => [key, source[key]]));
  }

  function applyGrid(target, grid) {
    gridKeys.forEach((key) => {
      target[key] = grid[key];
    });
  }

  function activeItem() {
    return state.activeIndex >= 0 ? state.batch[state.activeIndex] : null;
  }

  function syncActiveEntry() {
    const item = activeItem();
    if (!item) return;
    item.grid = copyGrid();
  }

  function readPreferences() {
    try {
      const saved = JSON.parse(window.localStorage.getItem(preferenceKey) || 'null');
      if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return;
      if (typeof saved.gridColor === 'string' && /^#[0-9a-f]{6}$/i.test(saved.gridColor)) state.gridColor = saved.gridColor;
      if (Number.isFinite(saved.gridOpacity) && saved.gridOpacity >= 0 && saved.gridOpacity <= 1) state.gridOpacity = saved.gridOpacity;
      if (Number.isFinite(saved.lineWidth) && saved.lineWidth >= 0.5 && saved.lineWidth <= 10) state.lineWidth = saved.lineWidth;
      if (saved.orientation === 'pointy' || saved.orientation === 'flat') state.orientation = saved.orientation;
      if (Number.isFinite(saved.hexSize) && saved.hexSize >= 5 && saved.hexSize <= 1000) state.hexSize = saved.hexSize;
    } catch (_) {
      // Storage is optional; invalid or unavailable storage falls back to defaults.
    }
  }

  function savePreferences() {
    try {
      window.localStorage.setItem(preferenceKey, JSON.stringify({
        gridColor: state.gridColor,
        gridOpacity: state.gridOpacity,
        lineWidth: state.lineWidth,
        orientation: state.orientation,
        hexSize: state.hexSize
      }));
    } catch (_) {
      // Storage is optional; the editor continues with in-memory settings.
    }
  }

  function syncControlsFromState() {
    controls.hexSize.value = String(state.hexSize);
    controls.offsetX.value = String(state.offsetX);
    controls.offsetY.value = String(state.offsetY);
    controls.gridColor.value = state.gridColor;
    controls.gridOpacity.value = String(Math.round(state.gridOpacity * 100));
    controls.lineWidth.value = String(state.lineWidth);
    controls.orientation.value = state.orientation;
    opacityValue.value = `${Math.round(state.gridOpacity * 100)}%`;
    lineWidthValue.value = `${state.lineWidth} px`;
  }

  function defaultHexSize(image) {
    if (!image) return 40;
    return Math.min(1000, Math.max(5, Math.sqrt(image.naturalWidth * image.naturalHeight) / 40));
  }

  function setBatchControls() {
    const count = state.batch.length;
    const hasImages = count > 0;
    imageSelector.disabled = !hasImages;
    previousButton.disabled = !hasImages || count < 2;
    nextButton.disabled = !hasImages || count < 2;
    removeImageButton.disabled = !hasImages || exporting;
    applyToAllButton.disabled = count < 2 || exporting;
    setHexSizeAllButton.disabled = count < 2 || exporting;
    splitVerticalButton.disabled = !hasImages || exporting;
    splitHorizontalButton.disabled = !hasImages || exporting;
    splitFourButton.disabled = !hasImages || exporting;
    exportButton.disabled = !hasImages || exporting;
    exportZipButton.disabled = !hasImages || exporting;
  }

  function rebuildImageSelector() {
    imageSelector.replaceChildren();
    state.batch.forEach((item, index) => {
      const option = document.createElement('option');
      option.value = String(index);
      option.textContent = `${index + 1}. ${item.filename}`;
      imageSelector.appendChild(option);
    });
    if (state.activeIndex >= 0) imageSelector.value = String(state.activeIndex);
    setBatchControls();
  }

  function updateFileStatus() {
    const item = activeItem();
    if (!item) {
      fileStatus.textContent = 'No images selected';
      return;
    }
    fileStatus.textContent = `${state.activeIndex + 1}/${state.batch.length} · ${item.filename} · ${item.image.naturalWidth} × ${item.image.naturalHeight}`;
  }

  function clearActiveWorkspace() {
    state.image = null;
    state.filename = '';
    state.activeIndex = -1;
    canvas.style.display = 'none';
    canvas.style.width = '';
    canvas.style.height = '';
    if (context) context.clearRect(0, 0, canvas.width || 0, canvas.height || 0);
    dropZone.classList.remove('has-image');
    resizeHandle.hidden = true;
    updateFileStatus();
    rebuildImageSelector();
  }

  function removeCurrentImage() {
    const item = activeItem();
    if (!item || exporting) return;

    const removedName = item.filename;
    state.batch.splice(state.activeIndex, 1);

    if (!state.batch.length) {
      clearActiveWorkspace();
      appMessage.textContent = `${removedName} removed. No PNGs remain in the batch.`;
      return;
    }

    activateImage(Math.min(state.activeIndex, state.batch.length - 1));
    appMessage.textContent = `${removedName} removed from the batch.`;
  }

  function activateImage(index) {
    if (!state.batch.length) return;
    syncActiveEntry();
    const count = state.batch.length;
    state.activeIndex = ((index % count) + count) % count;
    const item = activeItem();
    state.image = item.image;
    state.filename = item.filename;
    applyGrid(state, item.grid);
    syncControlsFromState();
    rebuildImageSelector();
    updateFileStatus();
    canvas.style.display = 'block';
    dropZone.classList.add('has-image');
    draw();
  }

  readPreferences();
  syncControlsFromState();
  setBatchControls();

  function canvasPoint(event) {
    const bounds = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - bounds.left) * canvas.width / bounds.width,
      y: (event.clientY - bounds.top) * canvas.height / bounds.height
    };
  }

  function resizeAnchor() {
    return { x: state.offsetX, y: state.offsetY };
  }

  function fitCanvasToWorkspace() {
    if (!state.image || canvas.style.display === 'none') return;

    const naturalWidth = state.image.naturalWidth;
    const naturalHeight = state.image.naturalHeight;
    const availableWidth = Math.max(1, dropZone.clientWidth - 2);
    const availableHeight = Math.max(1, dropZone.clientHeight - 2);
    const scale = Math.min(
      1,
      availableWidth / naturalWidth,
      availableHeight / naturalHeight
    );

    canvas.style.width = `${Math.max(1, Math.floor(naturalWidth * scale))}px`;
    canvas.style.height = `${Math.max(1, Math.floor(naturalHeight * scale))}px`;
  }

  function positionResizeHandle() {
    if (!state.image) return;
    const canvasBounds = canvas.getBoundingClientRect();
    const zoneBounds = dropZone.getBoundingClientRect();
    const anchor = resizeAnchor();
    const handleX = anchor.x + state.hexSize;
    const handleY = anchor.y + state.hexSize;
    resizeHandle.style.left = `${canvasBounds.left - zoneBounds.left + handleX * canvasBounds.width / canvas.width}px`;
    resizeHandle.style.top = `${canvasBounds.top - zoneBounds.top + handleY * canvasBounds.height / canvas.height}px`;
    resizeHandle.hidden = false;
  }

  function applyHexSize(value) {
    state.hexSize = Math.min(1000, Math.max(5, Number(value)));
    controls.hexSize.value = String(Number(state.hexSize.toFixed(2)));
    syncActiveEntry();
    savePreferences();
    draw();
  }

  canvas.addEventListener('pointerdown', (event) => {
    if (!state.image || resizeStart || (event.pointerType === 'mouse' && event.button !== 0)) return;
    const point = canvasPoint(event);
    activePointerId = event.pointerId;
    dragStart = { pointerX: point.x, pointerY: point.y, offsetX: state.offsetX, offsetY: state.offsetY };
    canvas.setPointerCapture(event.pointerId);
    event.preventDefault();
  });

  canvas.addEventListener('pointermove', (event) => {
    if (event.pointerId !== activePointerId || !dragStart) return;
    const point = canvasPoint(event);
    state.offsetX = dragStart.offsetX + point.x - dragStart.pointerX;
    state.offsetY = dragStart.offsetY + point.y - dragStart.pointerY;
    controls.offsetX.value = String(state.offsetX);
    controls.offsetY.value = String(state.offsetY);
    syncActiveEntry();
    draw();
  });

  function finishDrag(event) {
    if (event.pointerId !== activePointerId) return;
    activePointerId = null;
    dragStart = null;
  }

  canvas.addEventListener('pointerup', finishDrag);
  canvas.addEventListener('pointercancel', finishDrag);
  canvas.addEventListener('lostpointercapture', finishDrag);

  resizeHandle.addEventListener('pointerdown', (event) => {
    if (!state.image || (event.pointerType === 'mouse' && event.button !== 0)) return;
    const pointer = canvasPoint(event);
    const anchor = resizeAnchor();
    const dx = pointer.x - anchor.x;
    const dy = pointer.y - anchor.y;
    resizeStart = {
      pointerId: event.pointerId,
      anchor,
      startingSize: state.hexSize,
      startingDistance: Math.max(0.001, Math.hypot(dx, dy))
    };
    resizeHandle.setPointerCapture(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
  });

  resizeHandle.addEventListener('pointermove', (event) => {
    if (!resizeStart || event.pointerId !== resizeStart.pointerId) return;
    const pointer = canvasPoint(event);
    const distance = Math.hypot(pointer.x - resizeStart.anchor.x, pointer.y - resizeStart.anchor.y);
    applyHexSize(resizeStart.startingSize * distance / resizeStart.startingDistance);
  });

  function finishResize(event) {
    if (!resizeStart || event.pointerId !== resizeStart.pointerId) return;
    resizeStart = null;
  }

  resizeHandle.addEventListener('pointerup', finishResize);
  resizeHandle.addEventListener('pointercancel', finishResize);
  resizeHandle.addEventListener('lostpointercapture', finishResize);

  function drawGrid(targetContext, width, height, grid = state) {
    targetContext.save();
    const pointy = grid.orientation === 'pointy';
    const densityFactor = 2.598076211;
    const spacing = Math.max(grid.hexSize, Math.sqrt(width * height / (maxCells * densityFactor)) * 1.15);
    const stepX = pointy ? Math.sqrt(3) * spacing : 1.5 * spacing;
    const stepY = pointy ? 1.5 * spacing : Math.sqrt(3) * spacing;
    const marginX = spacing * 2;
    const marginY = spacing * 2;
    const colStart = Math.floor((-marginX - grid.offsetX) / stepX) - 1;
    const colEnd = Math.ceil((width + marginX - grid.offsetX) / stepX) + 1;
    const rowStart = Math.floor((-marginY - grid.offsetY) / stepY) - 1;
    const rowEnd = Math.ceil((height + marginY - grid.offsetY) / stepY) + 1;

    const edges = new Map();
    const vertexAt = (cx, cy, vertex) => {
      const angle = (Math.PI / 3) * vertex + (pointy ? -Math.PI / 2 : 0);
      const x = cx + spacing * Math.cos(angle);
      const y = cy + spacing * Math.sin(angle);
      const qx = Math.round(x * 1000000) / 1000000;
      const qy = Math.round(y * 1000000) / 1000000;
      return { x: qx, y: qy, key: `${Math.round(qx * 1000000)},${Math.round(qy * 1000000)}` };
    };

    for (let row = rowStart; row <= rowEnd; row += 1) {
      const staggerX = pointy && Math.abs(row % 2) === 1 ? stepX / 2 : 0;
      for (let col = colStart; col <= colEnd; col += 1) {
        const staggerY = !pointy && Math.abs(col % 2) === 1 ? stepY / 2 : 0;
        const cx = grid.offsetX + col * stepX + staggerX;
        const cy = grid.offsetY + row * stepY + staggerY;
        for (let vertex = 0; vertex < 6; vertex += 1) {
          const a = vertexAt(cx, cy, vertex);
          const b = vertexAt(cx, cy, (vertex + 1) % 6);
          const key = a.key < b.key ? `${a.key}|${b.key}` : `${b.key}|${a.key}`;
          if (!edges.has(key)) edges.set(key, [a, b]);
        }
      }
    }

    targetContext.beginPath();
    edges.forEach(([a, b]) => {
      targetContext.moveTo(a.x, a.y);
      targetContext.lineTo(b.x, b.y);
    });
    targetContext.strokeStyle = grid.gridColor;
    targetContext.globalAlpha = grid.gridOpacity;
    targetContext.lineWidth = grid.lineWidth;
    targetContext.lineJoin = 'round';
    targetContext.stroke();
    targetContext.restore();
    return spacing;
  }

  function drawNow() {
    if (!state.image) return;
    try {
      drawImageToCanvas();
    } catch (_) {
      appMessage.textContent = 'This image is too large for your browser to process as one canvas.';
    }
  }

  function drawImageToCanvas() {
    if (!state.image) return;
    const width = state.image.naturalWidth;
    const height = state.image.naturalHeight;
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    if (canvas.width !== width || canvas.height !== height || !context) throw new Error('Canvas dimensions are unavailable.');
    context.clearRect(0, 0, width, height);
    context.drawImage(state.image, 0, 0);
    const spacing = drawGrid(context, width, height);
    fitCanvasToWorkspace();
    appMessage.textContent = spacing > state.hexSize ? 'Ready · grid detail limited for image size' : 'Ready';
    positionResizeHandle();
  }

  function draw() {
    if (drawFrame) return;
    drawFrame = window.requestAnimationFrame(() => {
      drawFrame = 0;
      drawNow();
    });
  }

  function resetGrid() {
    if (!state.image) return;
    state.offsetX = 0;
    state.offsetY = 0;
    state.gridColor = '#ffffff';
    state.gridOpacity = 0.8;
    state.lineWidth = 2;
    state.orientation = 'pointy';
    state.hexSize = defaultHexSize(state.image);
    syncControlsFromState();
    syncActiveEntry();
    savePreferences();
    draw();
  }

  function isFormFocus(target) {
    return target instanceof Element && !!target.closest('input, select, textarea, button, [contenteditable="true"], [role="textbox"]');
  }

  document.addEventListener('keydown', (event) => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || isFormFocus(event.target) || !state.image) return;
    let handled = true;
    const step = event.shiftKey ? 10 : 1;
    if (event.key === 'ArrowLeft') state.offsetX -= step;
    else if (event.key === 'ArrowRight') state.offsetX += step;
    else if (event.key === 'ArrowUp') state.offsetY -= step;
    else if (event.key === 'ArrowDown') state.offsetY += step;
    else if (event.key === '+' || event.key === '=') applyHexSize(state.hexSize + Math.max(0.5, state.hexSize * 0.025));
    else if (event.key === '-' || event.key === '_') applyHexSize(state.hexSize - Math.max(0.5, state.hexSize * 0.025));
    else if (event.key.toLowerCase() === 'r') resetGrid();
    else handled = false;
    if (!handled) return;
    event.preventDefault();
    if (event.key.startsWith('Arrow')) {
      controls.offsetX.value = String(state.offsetX);
      controls.offsetY.value = String(state.offsetY);
      syncActiveEntry();
      draw();
    }
  });

  function reportExportError(error) {
    appMessage.textContent = 'The PNG could not be exported. Please try again.';
    window.dispatchEvent(new CustomEvent('hexgrid:export-error', { detail: { error } }));
  }

  function renderItemToBlob(item) {
    return new Promise((resolve, reject) => {
      try {
        const exportCanvas = document.createElement('canvas');
        exportCanvas.width = item.image.naturalWidth;
        exportCanvas.height = item.image.naturalHeight;
        const exportContext = exportCanvas.getContext('2d');
        if (!exportContext || exportCanvas.width !== item.image.naturalWidth || exportCanvas.height !== item.image.naturalHeight) {
          throw new Error('Canvas dimensions are unavailable.');
        }
        exportContext.drawImage(item.image, 0, 0);
        drawGrid(exportContext, exportCanvas.width, exportCanvas.height, item.grid);
        if (typeof exportCanvas.toBlob !== 'function') throw new Error('PNG encoding is unavailable.');
        exportCanvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('PNG encoding returned no data.')), 'image/png');
      } catch (error) {
        reject(error);
      }
    });
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = filename;
    link.href = url;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  function outputPngName(filename) {
    const base = filename.replace(/\.png$/i, '') || 'image';
    return `${base}_hexgrid.png`;
  }

  function splitName(filename, suffix) {
    const base = filename.replace(/\.png$/i, '') || 'image';
    return `${base}_${suffix}.png`;
  }

  function blobToImage(blob) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      const objectUrl = URL.createObjectURL(blob);
      image.onload = () => {
        URL.revokeObjectURL(objectUrl);
        resolve(image);
      };
      image.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('Split image could not be decoded.'));
      };
      image.src = objectUrl;
    });
  }

  async function cropImageToItem(item, crop) {
    const cropCanvas = document.createElement('canvas');
    cropCanvas.width = crop.w;
    cropCanvas.height = crop.h;
    const cropContext = cropCanvas.getContext('2d');
    if (!cropContext || cropCanvas.width !== crop.w || cropCanvas.height !== crop.h) {
      throw new Error('Split canvas dimensions are unavailable.');
    }
    cropContext.drawImage(item.image, crop.x, crop.y, crop.w, crop.h, 0, 0, crop.w, crop.h);
    const blob = await new Promise((resolve, reject) => {
      cropCanvas.toBlob((result) => result ? resolve(result) : reject(new Error('Split PNG encoding returned no data.')), 'image/png');
    });
    const image = await blobToImage(blob);
    return {
      filename: crop.filename,
      image,
      grid: {
        ...item.grid,
        offsetX: item.grid.offsetX - crop.x,
        offsetY: item.grid.offsetY - crop.y
      }
    };
  }

  async function splitCurrentImage(mode) {
    const item = activeItem();
    if (!item || exporting) return;
    syncActiveEntry();
    exporting = true;
    setBatchControls();

    try {
      const width = item.image.naturalWidth;
      const height = item.image.naturalHeight;
      const leftWidth = Math.floor(width / 2);
      const rightWidth = width - leftWidth;
      const topHeight = Math.floor(height / 2);
      const bottomHeight = height - topHeight;
      let crops;

      if (mode === 'vertical') {
        crops = [
          { x: 0, y: 0, w: leftWidth, h: height, filename: splitName(item.filename, 'left') },
          { x: leftWidth, y: 0, w: rightWidth, h: height, filename: splitName(item.filename, 'right') }
        ];
      } else if (mode === 'horizontal') {
        crops = [
          { x: 0, y: 0, w: width, h: topHeight, filename: splitName(item.filename, 'top') },
          { x: 0, y: topHeight, w: width, h: bottomHeight, filename: splitName(item.filename, 'bottom') }
        ];
      } else {
        crops = [
          { x: 0, y: 0, w: leftWidth, h: topHeight, filename: splitName(item.filename, 'top_left') },
          { x: leftWidth, y: 0, w: rightWidth, h: topHeight, filename: splitName(item.filename, 'top_right') },
          { x: 0, y: topHeight, w: leftWidth, h: bottomHeight, filename: splitName(item.filename, 'bottom_left') },
          { x: leftWidth, y: topHeight, w: rightWidth, h: bottomHeight, filename: splitName(item.filename, 'bottom_right') }
        ];
      }

      appMessage.textContent = `Splitting ${item.filename}…`;
      const children = [];
      for (let index = 0; index < crops.length; index += 1) {
        appMessage.textContent = `Creating split ${index + 1}/${crops.length}…`;
        children.push(await cropImageToItem(item, crops[index]));
      }

      const insertIndex = state.activeIndex + 1;
      state.batch.splice(insertIndex, 0, ...children);
      rebuildImageSelector();
      activateImage(insertIndex);
      appMessage.textContent = `Created ${children.length} split PNGs with seam-aligned grid offsets.`;
    } catch (error) {
      appMessage.textContent = 'The PNG could not be split. Please try again.';
      window.dispatchEvent(new CustomEvent('hexgrid:split-error', { detail: { error } }));
    } finally {
      exporting = false;
      setBatchControls();
    }
  }

  exportButton.addEventListener('click', async () => {
    const item = activeItem();
    if (!item || exporting) return;
    syncActiveEntry();
    try {
      exporting = true;
      setBatchControls();
      appMessage.textContent = 'Rendering current PNG…';
      const blob = await renderItemToBlob(item);
      downloadBlob(blob, outputPngName(item.filename));
      appMessage.textContent = 'PNG exported.';
    } catch (error) {
      reportExportError(error);
    } finally {
      exporting = false;
      setBatchControls();
    }
  });

  function crc32(bytes) {
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i += 1) {
      crc ^= bytes[i];
      for (let bit = 0; bit < 8; bit += 1) {
        crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
      }
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function dosDateTime(date = new Date()) {
    const year = Math.max(1980, date.getFullYear());
    return {
      time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
      date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
    };
  }

  function writeUint16(view, offset, value) {
    view.setUint16(offset, value, true);
  }

  function writeUint32(view, offset, value) {
    view.setUint32(offset, value >>> 0, true);
  }

  function createStoredZip(entries) {
    const encoder = new TextEncoder();
    const localParts = [];
    const centralParts = [];
    let localOffset = 0;
    let centralSize = 0;
    const stamp = dosDateTime();

    entries.forEach((entry) => {
      const nameBytes = encoder.encode(entry.name);
      const data = entry.data;
      const crc = crc32(data);

      const localHeader = new Uint8Array(30 + nameBytes.length);
      const localView = new DataView(localHeader.buffer);
      writeUint32(localView, 0, 0x04034b50);
      writeUint16(localView, 4, 20);
      writeUint16(localView, 6, 0x0800);
      writeUint16(localView, 8, 0);
      writeUint16(localView, 10, stamp.time);
      writeUint16(localView, 12, stamp.date);
      writeUint32(localView, 14, crc);
      writeUint32(localView, 18, data.length);
      writeUint32(localView, 22, data.length);
      writeUint16(localView, 26, nameBytes.length);
      writeUint16(localView, 28, 0);
      localHeader.set(nameBytes, 30);
      localParts.push(localHeader, data);

      const centralHeader = new Uint8Array(46 + nameBytes.length);
      const centralView = new DataView(centralHeader.buffer);
      writeUint32(centralView, 0, 0x02014b50);
      writeUint16(centralView, 4, 20);
      writeUint16(centralView, 6, 20);
      writeUint16(centralView, 8, 0x0800);
      writeUint16(centralView, 10, 0);
      writeUint16(centralView, 12, stamp.time);
      writeUint16(centralView, 14, stamp.date);
      writeUint32(centralView, 16, crc);
      writeUint32(centralView, 20, data.length);
      writeUint32(centralView, 24, data.length);
      writeUint16(centralView, 28, nameBytes.length);
      writeUint16(centralView, 30, 0);
      writeUint16(centralView, 32, 0);
      writeUint16(centralView, 34, 0);
      writeUint16(centralView, 36, 0);
      writeUint32(centralView, 38, 0);
      writeUint32(centralView, 42, localOffset);
      centralHeader.set(nameBytes, 46);
      centralParts.push(centralHeader);
      centralSize += centralHeader.length;
      localOffset += localHeader.length + data.length;
    });

    const end = new Uint8Array(22);
    const endView = new DataView(end.buffer);
    writeUint32(endView, 0, 0x06054b50);
    writeUint16(endView, 4, 0);
    writeUint16(endView, 6, 0);
    writeUint16(endView, 8, entries.length);
    writeUint16(endView, 10, entries.length);
    writeUint32(endView, 12, centralSize);
    writeUint32(endView, 16, localOffset);
    writeUint16(endView, 20, 0);

    return new Blob([...localParts, ...centralParts, end], { type: 'application/zip' });
  }

  function uniqueOutputNames(items) {
    const used = new Map();
    return items.map((item) => {
      const original = outputPngName(item.filename);
      const stem = original.replace(/\.png$/i, '');
      const count = used.get(original.toLowerCase()) || 0;
      used.set(original.toLowerCase(), count + 1);
      return count ? `${stem}_${count + 1}.png` : original;
    });
  }

  exportZipButton.addEventListener('click', async () => {
    if (!state.batch.length || exporting) return;
    syncActiveEntry();
    exporting = true;
    setBatchControls();
    const names = uniqueOutputNames(state.batch);
    const entries = [];
    try {
      for (let index = 0; index < state.batch.length; index += 1) {
        appMessage.textContent = `Rendering ${index + 1}/${state.batch.length}: ${state.batch[index].filename}`;
        const blob = await renderItemToBlob(state.batch[index]);
        entries.push({ name: names[index], data: new Uint8Array(await blob.arrayBuffer()) });
        await new Promise((resolve) => window.setTimeout(resolve, 0));
      }
      appMessage.textContent = 'Building ZIP…';
      const zip = createStoredZip(entries);
      const date = new Date().toISOString().slice(0, 10);
      downloadBlob(zip, `hexgrid_batch_${date}.zip`);
      appMessage.textContent = `${state.batch.length} PNGs exported in one ZIP.`;
    } catch (error) {
      appMessage.textContent = 'The ZIP could not be exported. Please try again.';
      window.dispatchEvent(new CustomEvent('hexgrid:export-error', { detail: { error } }));
    } finally {
      exporting = false;
      setBatchControls();
    }
  });

  function setStateFromControls() {
    const n = (key, fallback) => Number.isFinite(Number(controls[key].value)) ? Number(controls[key].value) : fallback;
    state.hexSize = Math.min(1000, Math.max(5, n('hexSize', 40)));
    controls.hexSize.value = String(Number(state.hexSize.toFixed(2)));
    state.offsetX = n('offsetX', 0);
    state.offsetY = n('offsetY', 0);
    state.gridColor = controls.gridColor.value;
    state.gridOpacity = Math.min(100, Math.max(0, n('gridOpacity', 80))) / 100;
    state.lineWidth = Math.min(10, Math.max(0.5, n('lineWidth', 2)));
    opacityValue.value = `${Math.round(state.gridOpacity * 100)}%`;
    lineWidthValue.value = `${state.lineWidth} px`;
    state.orientation = controls.orientation.value === 'flat' ? 'flat' : 'pointy';
    syncActiveEntry();
    savePreferences();
  }

  Object.values(controls).forEach((control) => control.addEventListener('input', () => {
    setStateFromControls();
    draw();
  }));

  controls.hexSize.addEventListener('change', () => {
    setStateFromControls();
    draw();
  });

  resetButton.addEventListener('click', resetGrid);

  applyToAllButton.addEventListener('click', () => {
    if (state.batch.length < 2) return;
    syncActiveEntry();
    const grid = copyGrid();
    state.batch.forEach((item) => {
      item.grid = { ...grid };
    });
    appMessage.textContent = `Current grid copied to all ${state.batch.length} PNGs. You can still adjust every PNG individually.`;
  });

  setHexSizeAllButton.addEventListener('click', () => {
    if (state.batch.length < 2) return;
    syncActiveEntry();
    const sharedHexSize = state.hexSize;
    state.batch.forEach((item) => {
      item.grid.hexSize = sharedHexSize;
    });
    appMessage.textContent = `Hex size ${Number(sharedHexSize.toFixed(2))} px applied to all ${state.batch.length} PNGs. Other grid settings stayed unchanged.`;
  });

  splitVerticalButton.addEventListener('click', () => splitCurrentImage('vertical'));
  splitHorizontalButton.addEventListener('click', () => splitCurrentImage('horizontal'));
  splitFourButton.addEventListener('click', () => splitCurrentImage('four'));
  removeImageButton.addEventListener('click', removeCurrentImage);

  previousButton.addEventListener('click', () => activateImage(state.activeIndex - 1));
  nextButton.addEventListener('click', () => activateImage(state.activeIndex + 1));
  imageSelector.addEventListener('change', () => activateImage(Number(imageSelector.value)));

  function isPngFile(file) {
    return !!file && (file.type ? file.type === 'image/png' : /\.png$/i.test(file.name));
  }

  async function hasPngSignature(file) {
    const signature = new Uint8Array(await file.slice(0, 8).arrayBuffer());
    return [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => signature[index] === byte);
  }

  function decodePng(file) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      let objectUrl;
      try {
        objectUrl = URL.createObjectURL(file);
      } catch (error) {
        reject(error);
        return;
      }
      image.onload = () => {
        URL.revokeObjectURL(objectUrl);
        if (!image.naturalWidth || !image.naturalHeight) {
          reject(new Error('Image has invalid dimensions.'));
          return;
        }
        resolve(image);
      };
      image.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('Image decode failed.'));
      };
      image.src = objectUrl;
    });
  }

  async function loadPngs(fileList) {
    if (loading) return;
    const files = Array.from(fileList || []);
    if (!files.length) return;
    loading = true;
    appMessage.textContent = `Loading ${files.length} file${files.length === 1 ? '' : 's'}…`;
    const firstNewIndex = state.batch.length;
    let added = 0;
    let skipped = 0;
    const template = copyGrid();

    try {
      for (const file of files) {
        if (!isPngFile(file)) {
          skipped += 1;
          continue;
        }
        try {
          if (!(await hasPngSignature(file))) {
            skipped += 1;
            continue;
          }
          const image = await decodePng(file);
          const grid = { ...template };
          if (!state.image && added === 0) grid.hexSize = defaultHexSize(image);
          state.batch.push({
            filename: file.name,
            image,
            grid
          });
          added += 1;
        } catch (_) {
          skipped += 1;
        }
      }

      if (added) {
        activateImage(firstNewIndex);
        rebuildImageSelector();
        appMessage.textContent = `${added} PNG${added === 1 ? '' : 's'} added${skipped ? ` · ${skipped} skipped` : ''}.`;
      } else {
        appMessage.textContent = skipped ? 'No valid PNG images were added.' : 'Please select PNG images.';
      }
    } finally {
      loading = false;
      fileInput.value = '';
      setBatchControls();
    }
  }

  fileInput.addEventListener('change', () => loadPngs(fileInput.files));

  function dragHasPng(dataTransfer) {
    if (!dataTransfer) return false;
    const items = Array.from(dataTransfer.items || []);
    if (items.some((item) => item.kind === 'file' && item.type === 'image/png')) return true;
    return Array.from(dataTransfer.files || []).some(isPngFile);
  }

  const refitWorkspace = () => {
    if (!state.image) return;
    fitCanvasToWorkspace();
    positionResizeHandle();
  };

  if ('ResizeObserver' in window) {
    const workspaceObserver = new ResizeObserver(refitWorkspace);
    workspaceObserver.observe(dropZone);
  } else {
    window.addEventListener('resize', refitWorkspace);
  }

  [dropZone, uploadDropTarget].forEach((target) => {
    let dragDepth = 0;
    target.addEventListener('dragenter', (event) => {
      event.preventDefault();
      if (!dragHasPng(event.dataTransfer)) return;
      dragDepth += 1;
      target.classList.add('drag-over');
    });
    target.addEventListener('dragover', (event) => {
      event.preventDefault();
      if (event.dataTransfer && dragHasPng(event.dataTransfer)) event.dataTransfer.dropEffect = 'copy';
    });
    target.addEventListener('dragleave', (event) => {
      event.preventDefault();
      if (dragHasPng(event.dataTransfer)) dragDepth = Math.max(0, dragDepth - 1);
      if (!dragDepth) target.classList.remove('drag-over');
    });
    target.addEventListener('drop', (event) => {
      event.preventDefault();
      dragDepth = 0;
      target.classList.remove('drag-over');
      loadPngs(event.dataTransfer && event.dataTransfer.files);
    });
  });
})();
