(() => {
  const fileInput = document.getElementById('image-file');
  const fileStatus = document.getElementById('file-status');
  const appMessage = document.getElementById('app-message');
  const dropZone = document.getElementById('drop-zone');
  const canvas = document.getElementById('workspace-canvas');
  const context = canvas.getContext('2d');

  function loadPng(file) {
    if (!file) return;

    if (file.type ? file.type !== 'image/png' : !/\.png$/i.test(file.name)) {
      appMessage.textContent = 'Choose a PNG image.';
      return;
    }

    file.slice(0, 8).arrayBuffer().then((buffer) => {
      const signature = new Uint8Array(buffer);
      const isPng = [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => signature[index] === byte);
      if (!isPng) {
        appMessage.textContent = 'Choose a PNG image.';
        return;
      }

      decodePng(file);
    }).catch(() => {
      appMessage.textContent = 'Could not read this PNG.';
    });
  }

  function decodePng(file) {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0);
      canvas.style.display = 'block';
      dropZone.classList.add('has-image');
      fileStatus.textContent = `${file.name} · ${image.naturalWidth} × ${image.naturalHeight}`;
      appMessage.textContent = 'Ready';
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      appMessage.textContent = 'Could not read this PNG.';
    };
    image.src = objectUrl;
  }

  fileInput.addEventListener('change', () => {
    const file = fileInput.files && fileInput.files[0];
    loadPng(file);
    fileInput.value = '';
  });

  dropZone.addEventListener('dragover', (event) => event.preventDefault());
  dropZone.addEventListener('drop', (event) => {
    event.preventDefault();
    loadPng(event.dataTransfer.files && event.dataTransfer.files[0]);
  });
})();
