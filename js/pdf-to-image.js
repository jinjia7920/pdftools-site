/**
 * QuickPDF Tools — PDF to Image
 * Client-side conversion using pdfjs to render pages to canvas.
 */

(function () {
  'use strict';

  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js';

  var uploadArea = document.getElementById('uploadArea');
  var fileInput = document.getElementById('fileInput');
  var fileInfo = document.getElementById('fileInfo');
  var fileNameEl = document.getElementById('fileName');
  var fileSizeEl = document.getElementById('fileSize');
  var removeFileBtn = document.getElementById('removeFileBtn');
  var conversionSettings = document.getElementById('conversionSettings');
  var thumbnailGrid = document.getElementById('thumbnailGrid');
  var adSpace = document.getElementById('adSpace');
  var actionBar = document.getElementById('actionBar');
  var selectedCount = document.getElementById('selectedCount');
  var downloadSelectedBtn = document.getElementById('downloadSelectedBtn');
  var downloadAllBtn = document.getElementById('downloadAllBtn');
  var processingOverlay = document.getElementById('processingOverlay');
  var processingText = document.getElementById('processingText');
  var qualityRange = document.getElementById('qualityRange');
  var qualityLabel = document.getElementById('qualityLabel');

  var uploadedFile = null;
  var pdfJsDoc = null;
  var totalPages = 0;
  var selectedPages = new Set();
  var outputFormat = 'jpg';

  function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(2) + ' MB';
  }

  function toast(msg, type) {
    var el = document.createElement('div');
    el.className = 'toast ' + type;
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(function () { el.remove(); }, 3000);
  }

  function showProcessing(msg) {
    processingText.textContent = msg;
    processingOverlay.classList.remove('hidden');
  }

  function hideProcessing() {
    processingOverlay.classList.add('hidden');
  }

  function resetAll() {
    uploadedFile = null;
    pdfJsDoc = null;
    totalPages = 0;
    selectedPages.clear();
    fileInfo.classList.add('hidden');
    uploadArea.classList.remove('hidden');
    conversionSettings.classList.add('hidden');
    thumbnailGrid.innerHTML = '';
    adSpace.classList.add('hidden');
    actionBar.classList.add('hidden');
    fileInput.value = '';
  }

  async function loadFile(file) {
    showProcessing('Loading PDF...');

    try {
      var arrayBuffer = await readFileAsArrayBuffer(file);
      pdfJsDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      totalPages = pdfJsDoc.numPages;
      uploadedFile = file;

      fileNameEl.textContent = file.name;
      fileSizeEl.textContent = formatSize(file.size);
      fileInfo.classList.remove('hidden');
      uploadArea.classList.add('hidden');
      conversionSettings.classList.remove('hidden');
      adSpace.classList.remove('hidden');
      actionBar.classList.remove('hidden');

      renderThumbnails();
      hideProcessing();
      toast('PDF loaded — ' + totalPages + ' pages', 'success');
    } catch (err) {
      hideProcessing();
      console.error(err);
      toast('Error loading PDF: ' + (err.message || 'Unknown error'), 'error');
    }
  }

  async function renderThumbnails() {
    thumbnailGrid.innerHTML = '';
    selectedPages.clear();

    for (var i = 1; i <= totalPages; i++) {
      var item = document.createElement('div');
      item.className = 'thumbnail-item selected';
      item.dataset.page = i;
      item.innerHTML =
        '<div class="check-mark">&#10003;</div>' +
        '<div class="page-placeholder" style="aspect-ratio:0.75;background:#f1f5f9;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:0.8rem;">Page ' + i + '</div>' +
        '<div class="page-number">Page ' + i + '</div>';

      item.addEventListener('click', function () {
        var pageNum = parseInt(this.dataset.page);
        if (selectedPages.has(pageNum)) {
          selectedPages.delete(pageNum);
          this.classList.remove('selected');
        } else {
          selectedPages.add(pageNum);
          this.classList.add('selected');
        }
        updateSelectedCount();
      });

      selectedPages.add(i);
      thumbnailGrid.appendChild(item);
    }

    updateSelectedCount();
    renderThumbnailPreviews();
  }

  async function renderThumbnailPreviews() {
    for (var i = 1; i <= totalPages; i++) {
      try {
        var page = await pdfJsDoc.getPage(i);
        var viewport = page.getViewport({ scale: 0.3 });
        var canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = '100%';
        canvas.style.height = 'auto';
        canvas.style.display = 'block';
        var ctx = canvas.getContext('2d');
        await page.render({ canvasContext: ctx, viewport: viewport }).promise;

        var items = thumbnailGrid.querySelectorAll('.thumbnail-item');
        var target = items[i - 1];
        if (target) {
          var placeholder = target.querySelector('.page-placeholder');
          if (placeholder) placeholder.replaceWith(canvas);
        }
      } catch (e) {
        console.warn('Thumbnail failed for page', i, e);
      }
    }
  }

  function updateSelectedCount() {
    var count = selectedPages.size;
    selectedCount.textContent = count + ' page' + (count !== 1 ? 's' : '') + ' selected';
    downloadSelectedBtn.disabled = count === 0;
    downloadSelectedBtn.style.opacity = count === 0 ? '0.5' : '1';
  }

  async function renderPageToImage(pageNum) {
    var page = await pdfJsDoc.getPage(pageNum);
    var viewport = page.getViewport({ scale: 2.0 });
    var canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    var ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport: viewport }).promise;

    var quality = parseInt(qualityRange.value) / 100;
    if (outputFormat === 'jpg') {
      return canvas.toDataURL('image/jpeg', quality);
    } else {
      return canvas.toDataURL('image/png');
    }
  }

  function dataUrlToBlob(dataUrl) {
    var parts = dataUrl.split(',');
    var mime = parts[0].match(/:(.*?);/)[1];
    var bytes = atob(parts[1]);
    var arr = new Uint8Array(bytes.length);
    for (var i = 0; i < bytes.length; i++) {
      arr[i] = bytes.charCodeAt(i);
    }
    return new Blob([arr], { type: mime });
  }

  function triggerDownload(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }

  async function downloadSelected() {
    if (selectedPages.size === 0) {
      toast('Select at least one page', 'error');
      return;
    }

    var sorted = Array.from(selectedPages).sort(function (a, b) { return a - b; });
    var baseName = uploadedFile.name.replace(/\.pdf$/i, '');
    var ext = outputFormat;

    if (sorted.length === 1) {
      showProcessing('Converting page ' + sorted[0] + '...');
      try {
        var dataUrl = await renderPageToImage(sorted[0]);
        var blob = dataUrlToBlob(dataUrl);
        triggerDownload(blob, baseName + '_page_' + sorted[0] + '.' + ext);
        hideProcessing();
        toast('Downloaded 1 image', 'success');
      } catch (err) {
        hideProcessing();
        toast('Error: ' + err.message, 'error');
      }
      return;
    }

    showProcessing('Converting ' + sorted.length + ' pages...');

    try {
      var zip = new JSZip();
      for (var i = 0; i < sorted.length; i++) {
        processingText.textContent = 'Converting page ' + sorted[i] + ' of ' + totalPages + '...';
        var dataUrl = await renderPageToImage(sorted[i]);
        var blob = dataUrlToBlob(dataUrl);
        zip.file(baseName + '_page_' + sorted[i] + '.' + ext, blob);
      }
      processingText.textContent = 'Creating ZIP...';
      var zipBlob = await zip.generateAsync({ type: 'blob' });
      triggerDownload(zipBlob, baseName + '_images.zip');
      hideProcessing();
      toast('Downloaded ' + sorted.length + ' images as ZIP', 'success');
    } catch (err) {
      hideProcessing();
      toast('Error: ' + err.message, 'error');
    }
  }

  async function downloadAll() {
    showProcessing('Converting all ' + totalPages + ' pages...');
    try {
      var baseName = uploadedFile.name.replace(/\.pdf$/i, '');
      var ext = outputFormat;
      var zip = new JSZip();

      for (var i = 1; i <= totalPages; i++) {
        processingText.textContent = 'Converting page ' + i + ' of ' + totalPages + '...';
        var dataUrl = await renderPageToImage(i);
        var blob = dataUrlToBlob(dataUrl);
        var pageNum = i.toString().padStart(2, '0');
        zip.file(baseName + '_page_' + pageNum + '.' + ext, blob);
      }

      processingText.textContent = 'Creating ZIP...';
      var zipBlob = await zip.generateAsync({ type: 'blob' });
      triggerDownload(zipBlob, baseName + '_all_images.zip');
      hideProcessing();
      toast('Downloaded ' + totalPages + ' images as ZIP', 'success');
    } catch (err) {
      hideProcessing();
      toast('Error: ' + err.message, 'error');
    }
  }

  function readFileAsArrayBuffer(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function (e) { resolve(e.target.result); };
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  }

  // Events
  fileInput.addEventListener('change', function () {
    if (fileInput.files.length > 0) {
      loadFile(fileInput.files[0]);
      fileInput.value = '';
    }
  });

  uploadArea.addEventListener('click', function (e) {
    if (e.target === uploadArea || e.target.closest('.upload-area') === uploadArea) {
      fileInput.click();
    }
  });

  uploadArea.addEventListener('dragover', function (e) {
    e.preventDefault();
    uploadArea.classList.add('drag-over');
  });

  uploadArea.addEventListener('dragleave', function () {
    uploadArea.classList.remove('drag-over');
  });

  uploadArea.addEventListener('drop', function (e) {
    e.preventDefault();
    uploadArea.classList.remove('drag-over');
    if (e.dataTransfer.files.length > 0) loadFile(e.dataTransfer.files[0]);
  });

  // Format selector
  document.getElementById('formatSelector').addEventListener('click', function (e) {
    var btn = e.target.closest('.format-btn');
    if (!btn) return;
    outputFormat = btn.dataset.format;
    var all = this.querySelectorAll('.format-btn');
    for (var i = 0; i < all.length; i++) all[i].classList.remove('active');
    btn.classList.add('active');
    // Hide quality slider for PNG (lossless)
    document.getElementById('qualitySlider').style.display = outputFormat === 'png' ? 'none' : 'flex';
  });

  qualityRange.addEventListener('input', function () {
    qualityLabel.textContent = qualityRange.value + '%';
  });

  removeFileBtn.addEventListener('click', resetAll);
  downloadSelectedBtn.addEventListener('click', downloadSelected);
  downloadAllBtn.addEventListener('click', downloadAll);
})();
