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
    image: null, filename: '', hexSize: 40, offsetX: 0, offsetY: 0,
    gridColor: '#ffffff', gridOpacity: 0.8, lineWidth: 2, orientation: 'pointy'
  };
  const preferenceKey = 'hex-grid-overlay.preferences.v1';
  const maxCells = 100000;
  let activePointerId = null;
  let dragStart = null;
  let resizeStart = null;
  let loadGeneration = 0;
  let drawFrame = 0;

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
      // Storage may be unavailable or contain invalid JSON; use the defaults.
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

  readPreferences();
  syncControlsFromState();

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
    savePreferences();
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

  function drawGrid(targetContext, width, height) {
    targetContext.save();
    const pointy = state.orientation === 'pointy';
    const densityFactor = 2.598076211;
    const spacing = Math.max(state.hexSize, Math.sqrt(width * height / (maxCells * densityFactor)) * 1.15);
    const stepX = pointy ? Math.sqrt(3) * spacing : 1.5 * spacing;
    const stepY = pointy ? 1.5 * spacing : Math.sqrt(3) * spacing;
    const marginX = spacing * 2;
    const marginY = spacing * 2;
    const colStart = Math.floor((-marginX - state.offsetX) / stepX) - 1;
    const colEnd = Math.ceil((width + marginX - state.offsetX) / stepX) + 1;
    const rowStart = Math.floor((-marginY - state.offsetY) / stepY) - 1;
    const rowEnd = Math.ceil((height + marginY - state.offsetY) / stepY) + 1;

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
        const cx = state.offsetX + col * stepX + staggerX;
        const cy = state.offsetY + row * stepY + staggerY;
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
    targetContext.strokeStyle = state.gridColor;
    targetContext.globalAlpha = state.gridOpacity;
    targetContext.lineWidth = state.lineWidth;
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
      failLargeImage();
    }
  }

  function failLargeImage() {
    state.image = null;
    state.filename = '';
    exportButton.disabled = true;
    resizeHandle.hidden = true;
    canvas.style.display = 'none';
    dropZone.classList.remove('has-image');
    fileStatus.textContent = 'No image selected';
    appMessage.textContent = 'This image is too large for your browser to process as one canvas.';
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
    state.offsetX = 0;
    state.offsetY = 0;
    state.gridColor = '#ffffff';
    state.gridOpacity = 0.8;
    state.lineWidth = 2;
    state.orientation = 'pointy';
    state.hexSize = defaultHexSize(state.image);
    syncControlsFromState();
    savePreferences();
    draw();
  }

  function isFormFocus(target) {
    return target instanceof Element && !!target.closest('input, select, textarea, button, [contenteditable="true"], [role="textbox"]');
  }

  document.addEventListener('keydown', (event) => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || isFormFocus(event.target)) return;
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
      savePreferences();
      draw();
    }
  });

  function reportExportError(error) {
    appMessage.textContent = 'The PNG could not be exported. Please try again.';
    window.dispatchEvent(new CustomEvent('hexgrid:export-error', { detail: { error } }));
  }

  exportButton.addEventListener('click', () => {
    if (!state.image) return;
    try {
      const exportCanvas = document.createElement('canvas');
      exportCanvas.width = state.image.naturalWidth;
      exportCanvas.height = state.image.naturalHeight;
      const exportContext = exportCanvas.getContext('2d');
      if (!exportContext || exportCanvas.width !== state.image.naturalWidth || exportCanvas.height !== state.image.naturalHeight) throw new Error('Canvas dimensions are unavailable.');
      exportContext.drawImage(state.image, 0, 0);
      drawGrid(exportContext, exportCanvas.width, exportCanvas.height);
      if (typeof exportCanvas.toBlob !== 'function') throw new Error('PNG encoding is unavailable.');
      exportCanvas.toBlob((blob) => {
        if (!blob) {
          failLargeImage();
          return;
        }
        try {
          const downloadUrl = URL.createObjectURL(blob);
          const link = document.createElement('a');
          const baseName = state.filename.replace(/\.png$/i, '');
          link.download = `${baseName || 'image'}_hexgrid.png`;
          link.href = downloadUrl;
          link.click();
          window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 0);
          appMessage.textContent = 'PNG exported.';
        } catch (error) {
          reportExportError(error);
        }
      }, 'image/png');
    } catch (error) {
      if (!exportButton.disabled) failLargeImage();
      else reportExportError(error);
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

  resetButton.addEventListener('click', () => {
    resetGrid();
  });

  function loadPng(file) {
    if (!file) return;
    if (file.type ? file.type !== 'image/png' : !/\.png$/i.test(file.name)) {
      appMessage.textContent = 'Please select a PNG image.';
      return;
    }
    const generation = ++loadGeneration;
    file.slice(0, 8).arrayBuffer().then((buffer) => {
      if (generation !== loadGeneration) return;
      const signature = new Uint8Array(buffer);
      const isPng = [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => signature[index] === byte);
      if (!isPng) { appMessage.textContent = 'Please select a PNG image.'; return; }
      decodePng(file, generation);
    }).catch(() => {
      if (generation === loadGeneration) appMessage.textContent = 'The image could not be opened.';
    });
  }

  function decodePng(file, generation) {
    const image = new Image();
    let objectUrl;
    try {
      objectUrl = URL.createObjectURL(file);
    } catch (_) {
      appMessage.textContent = 'The image could not be opened.';
      return;
    }
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      if (generation !== loadGeneration) return;
      if (!image.naturalWidth || !image.naturalHeight) {
        appMessage.textContent = 'The image could not be opened.';
        return;
      }
      state.image = image;
      state.filename = file.name;
      exportButton.disabled = false;
      state.offsetX = 0;
      state.offsetY = 0;
      controls.offsetX.value = '0';
      controls.offsetY.value = '0';
      setStateFromControls();
      canvas.style.display = 'block';
      dropZone.classList.add('has-image');
      draw();
      fileStatus.textContent = `${state.filename} · ${image.naturalWidth} × ${image.naturalHeight}`;
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      if (generation === loadGeneration) appMessage.textContent = 'The image could not be opened.';
    };
    image.src = objectUrl;
  }

  fileInput.addEventListener('change', () => {
    loadPng(fileInput.files && fileInput.files[0]);
    fileInput.value = '';
  });
  function dragHasPng(dataTransfer) {
    if (!dataTransfer) return false;
    const items = Array.from(dataTransfer.items || []);
    if (items.some((item) => item.kind === 'file' && item.type === 'image/png')) return true;
    return Array.from(dataTransfer.files || []).some((file) => file.type === 'image/png' || (!file.type && /\.png$/i.test(file.name)));
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
      loadPng(event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0]);
    });
  });
})();
