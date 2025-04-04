imageUpload.addEventListener('change', (e) => {
  if (e.target.files.length > 0) {
    handleAddImages(e.target.files);
    e.target.value = '';
  }
});
