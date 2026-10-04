// HEX-001 provides the static editor shell only. Image and grid behavior is not implemented yet.
(() => {
  const fileInput = document.getElementById('image-file');
  const fileStatus = document.getElementById('file-status');
  const appMessage = document.getElementById('app-message');
  const dropZone = document.getElementById('drop-zone');

  fileInput.addEventListener('change', () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;
    fileStatus.textContent = file.name;
    appMessage.textContent = 'Image processing is not available yet.';
    fileInput.value = '';
  });

  dropZone.addEventListener('dragover', (event) => event.preventDefault());
  dropZone.addEventListener('drop', (event) => {
    event.preventDefault();
    appMessage.textContent = 'Image processing is not available yet.';
  });
})();
