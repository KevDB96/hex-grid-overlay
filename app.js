(() => {
  const fileInput = document.getElementById('image-file');
  const fileStatus = document.getElementById('file-status');
  const appMessage = document.getElementById('app-message');
  const dropZone = document.getElementById('drop-zone');
  const canvas = document.getElementById('workspace-canvas');
  const context = canvas.getContext('2d');
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
  }

  function setStateFromControls() {
    const n = (key, fallback) => Number.isFinite(Number(controls[key].value)) ? Number(controls[key].value) : fallback;
    state.hexSize = Math.min(1000, Math.max(4, n('hexSize', 40)));
    state.offsetX = n('offsetX', 0);
    state.offsetY = n('offsetY', 0);
    state.gridColor = controls.gridColor.value;
    state.gridOpacity = Math.min(1, Math.max(0, n('gridOpacity', 0.8)));
    state.lineWidth = Math.min(20, Math.max(0.25, n('lineWidth', 2)));
    state.orientation = controls.orientation.value === 'flat' ? 'flat' : 'pointy';
  }

  Object.values(controls).forEach((control) => control.addEventListener('input', () => {
    setStateFromControls();
    draw();
  }));

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
      draw();
      canvas.style.display = 'block';
      dropZone.classList.add('has-image');
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
