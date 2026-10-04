(() => {
  const fileInput = document.getElementById('image-file');
  const fileStatus = document.getElementById('file-status');
  const appMessage = document.getElementById('app-message');
  const dropZone = document.getElementById('drop-zone');
  const canvas = document.getElementById('workspace-canvas');
  const resizeHandle = document.getElementById('resize-handle');
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
  const maxCells = 100000;
  let activePointerId = null;
  let dragStart = null;
  let resizeStart = null;

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
    draw();
  });

  function finishDrag(event) {
    if (event.pointerId !== activePointerId) return;
    activePointerId = null;
    dragStart = null;
  }

  canvas.addEventListener('pointerup', finishDrag);
  canvas.addEventListener('pointercancel', finishDrag);

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

  function draw() {
    if (!state.image) return;
    const width = state.image.naturalWidth;
    const height = state.image.naturalHeight;
    canvas.width = width;
    canvas.height = height;
    context.clearRect(0, 0, width, height);
    context.drawImage(state.image, 0, 0);

    const pointy = state.orientation === 'pointy';
    const densityFactor = 2.598076211;
    const spacing = Math.max(state.hexSize, Math.sqrt(width * height / (maxCells * densityFactor)) * 1.15);
    const stepX = pointy ? Math.sqrt(3) * spacing : 1.5 * spacing;
    const stepY = pointy ? 1.5 * spacing : Math.sqrt(3) * spacing;
    const marginX = pointy ? stepX * 3 : spacing * 2;
    const marginY = pointy ? spacing * 2 : stepY * 3;
    const colStart = Math.floor((-marginX - state.offsetX) / stepX) - 3;
    const colEnd = Math.ceil((width + marginX - state.offsetX) / stepX) + 3;
    const rowStart = Math.floor((-marginY - state.offsetY) / stepY) - 3;
    const rowEnd = Math.ceil((height + marginY - state.offsetY) / stepY) + 3;

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
    context.beginPath();
    edges.forEach(([a, b]) => {
      context.moveTo(a.x, a.y);
      context.lineTo(b.x, b.y);
    });
    context.strokeStyle = state.gridColor;
    context.globalAlpha = state.gridOpacity;
    context.lineWidth = state.lineWidth;
    context.lineJoin = 'round';
    context.stroke();
    context.globalAlpha = 1;
    appMessage.textContent = spacing > state.hexSize ? 'Ready · grid detail limited for image size' : 'Ready';
    positionResizeHandle();
  }

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
  }

  Object.values(controls).forEach((control) => control.addEventListener('input', () => {
    setStateFromControls();
    draw();
  }));

  controls.hexSize.addEventListener('change', () => {
    setStateFromControls();
    draw();
  });

  function loadPng(file) {
    if (!file) return;
    if (file.type ? file.type !== 'image/png' : !/\.png$/i.test(file.name)) {
      appMessage.textContent = 'Choose a PNG image.';
      return;
    }
    file.slice(0, 8).arrayBuffer().then((buffer) => {
      const signature = new Uint8Array(buffer);
      const isPng = [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => signature[index] === byte);
      if (!isPng) { appMessage.textContent = 'Choose a PNG image.'; return; }
      decodePng(file);
    }).catch(() => { appMessage.textContent = 'Could not read this PNG.'; });
  }

  function decodePng(file) {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      state.image = image;
      state.filename = file.name;
      setStateFromControls();
      canvas.style.display = 'block';
      dropZone.classList.add('has-image');
      draw();
      fileStatus.textContent = `${state.filename} · ${image.naturalWidth} × ${image.naturalHeight}`;
    };
    image.onerror = () => { URL.revokeObjectURL(objectUrl); appMessage.textContent = 'Could not read this PNG.'; };
    image.src = objectUrl;
  }

  fileInput.addEventListener('change', () => {
    loadPng(fileInput.files && fileInput.files[0]);
    fileInput.value = '';
  });
  dropZone.addEventListener('dragover', (event) => event.preventDefault());
  dropZone.addEventListener('drop', (event) => {
    event.preventDefault();
    loadPng(event.dataTransfer.files && event.dataTransfer.files[0]);
  });
})();
