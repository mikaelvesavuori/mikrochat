closeImagePreview.addEventListener('click', () => {
  imagePreviewModal.classList.remove('active');

  const objectUrl = previewImage.getAttribute('data-object-url');
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl);
    previewImage.removeAttribute('data-object-url');
  }
});
