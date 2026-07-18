/**
 * QuickPDF Tools — PDF Split
 * Pure client-side split using pdf-lib + pdfjs-dist for thumbnails.
 */

(function () {
  'use strict';

  // Configure pdfjs worker
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js';

  // DOM refs
  var uploadArea = document.getElementById('uploadArea');
  var fileInput = document.getElementById('fileInput');
  var fileInfo = document.getElementById('fileInfo');
  var fileName = document.getElementById('fileName');
  var fileSize = document.getElementById('fileSize');
  var removeFileBtn = document.getElementById('removeFileBtn');
  var rangeControls = document.getElementById('rangeControls');
  var rangeFrom = document.getElementById('rangeFrom');
  var rangeTo = document.getElementById('rangeTo');
  var totalPagesLabel = document.getElementById('totalPagesLabel');
  var rangeSelectBtn = document.getElementById('rangeSelectBtn');
  var thumbnailGrid = document.getElementById('thumbnailGrid');
  var adSpace = document.getElementById('adSpace');
  var actionBar = document.getElementById('actionBar');
  var selectedCount = document.getElementById('selectedCount');
  var extractBtn = document.getElementById('extractBtn');
  var extractAllBtn = document.getElementById('extractAllBtn');
  var processingOverlay = document.getElementById('processingOverlay');
  var processingText = document.getElementById('processingText');

  // State
  var uploadedFile = null;
  var pdfDoc = null; // pdf-lib document
  var pdfJsDoc = null; // pdfjs document
  var totalPages = 0;
  var selectedPages = new Set(); // zero-indexed

  // Format bytes
  function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  }

  // Toast
  function toast(msg, type) {
    var el = document.createElement('div');
    el.className = 'toast ' + type;
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(function () { el.remove(); }, 3000);
  }

  // Processing overlay
  function showProcessing(msg) {
    processingText.textContent = msg;
    processingOverlay.classList.remove('hidden');
  }

  function hideProcessing() {
    processingOverlay.classList.add('hidden');
  }

  // Load file
  async function loadFile(file) {
    showProcessing('Loading PDF...');

    try {
      // Load with pdf-lib
      var arrayBuffer = await readFileAsArrayBuffer(file);
      var { PDFDocument } = PDFLib;
      pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
      totalPages = pdfDoc.getPageCount();

      // Load with pdfjs for thumbnails
      var uint8 = new Uint8Array(arrayBuffer);
      pdfJsDoc = await pdfjsLib.getDocument({ data: uint8 }).promise;

      uploadedFile = file;

      // Update UI
      fileName.textContent = file.name;
      fileSize.textContent = formatSize(file.size);
      fileInfo.classList.remove('hidden');
      uploadArea.classList.add('hidden');

      // Setup range inputs
      rangeFrom.max = totalPages;
      rangeFrom.value = 1;
      rangeTo.max = totalPages;
      rangeTo.value = totalPages;
      totalPagesLabel.textContent = '(of ' + totalPages + ' pages)';
      rangeControls.classList.remove('hidden');

      // Render thumbnails
      selectedPages.clear();
      renderThumbnails();

      // Show ad
      adSpace.classList.remove('hidden');
      actionBar.classList.remove('hidden');
      updateSelectedCount();

      hideProcessing();
      toast('PDF loaded — ' + totalPages + ' pages', 'success');
    } catch (err) {
      hideProcessing();
      console.error('Load error:', err);
      toast('Error loading PDF: ' + (err.message || 'Unknown error'), 'error');
    }
  }

  // Render thumbnails
  async function renderThumbnails() {
    thumbnailGrid.innerHTML = '';

    for (var i = 1; i <= totalPages; i++) {
      var item = document.createElement('div');
      item.className = 'thumbnail-item';
      item.dataset.page = i;

      item.innerHTML =
        '<div class="check-mark">&#10003;</div>' +
        '<div class="page-placeholder" style="aspect-ratio:0.75;background:#f1f5f9;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:0.8rem;">Page ' + i + '</div>' +
        '<div class="page-number">Page ' + i + '</div>';

      item.addEventListener('click', function () {
        var pageNum = parseInt(this.dataset.page);
        togglePage(pageNum - 1); // zero-indexed
        this.classList.toggle('selected');
        updateSelectedCount();
      });

      thumbnailGrid.appendChild(item);
    }

    // Start rendering thumbnails async
    renderThumbnailPreviews();

    // Select all by default
    selectAllPages();
  }

  // Render thumbnail previews using pdfjs
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
          if (placeholder) {
            placeholder.replaceWith(canvas);
          }
        }
      } catch (e) {
        console.warn('Thumbnail render failed for page', i, e);
      }
    }
  }

  // Toggle page selection
  function togglePage(zeroIndex) {
    if (selectedPages.has(zeroIndex)) {
      selectedPages.delete(zeroIndex);
    } else {
      selectedPages.add(zeroIndex);
    }
  }

  // Select all pages
  function selectAllPages() {
    for (var i = 0; i < totalPages; i++) {
      selectedPages.add(i);
    }
    var items = thumbnailGrid.querySelectorAll('.thumbnail-item');
    for (var j = 0; j < items.length; j++) {
      items[j].classList.add('selected');
    }
    updateSelectedCount();
  }

  // Select range
  function selectRange(from, to) {
    selectedPages.clear();
    for (var i = from; i <= to; i++) {
      selectedPages.add(i);
    }
    var items = thumbnailGrid.querySelectorAll('.thumbnail-item');
    for (var j = 0; j < items.length; j++) {
      var pageNum = parseInt(items[j].dataset.page);
      if (pageNum >= from + 1 && pageNum <= to + 1) {
        items[j].classList.add('selected');
      } else {
        items[j].classList.remove('selected');
      }
    }
    updateSelectedCount();
  }

  // Update count label
  function updateSelectedCount() {
    var count = selectedPages.size;
    selectedCount.textContent = count + ' page' + (count !== 1 ? 's' : '') + ' selected';
    if (count === 0) {
      extractBtn.disabled = true;
      extractBtn.style.opacity = '0.5';
    } else {
      extractBtn.disabled = false;
      extractBtn.style.opacity = '1';
    }
  }

  // Extract selected pages
  async function extractSelectedPages() {
    if (selectedPages.size === 0) {
      toast('Please select at least one page', 'error');
      return;
    }

    showProcessing('Extracting pages...');

    try {
      var { PDFDocument } = PDFLib;
      var newPdf = await PDFDocument.create();

      // Sort selected pages
      var sorted = Array.from(selectedPages).sort(function (a, b) { return a - b; });

      var copiedPages = await newPdf.copyPages(pdfDoc, sorted);
      for (var i = 0; i < copiedPages.length; i++) {
        newPdf.addPage(copiedPages[i]);
      }

      var pdfBytes = await newPdf.save();
      var baseName = uploadedFile.name.replace(/\.pdf$/i, '');
      var filename = baseName + '_extracted.pdf';

      var blob = new Blob([pdfBytes], { type: 'application/pdf' });
      downloadBlob(blob, filename);

      hideProcessing();
      toast('Extracted ' + sorted.length + ' page(s) successfully!', 'success');
    } catch (err) {
      hideProcessing();
      console.error('Extract error:', err);
      toast('Error: ' + (err.message || 'Failed to extract pages'), 'error');
    }
  }

  // Extract all pages as separate files
  async function extractAllPages() {
    showProcessing('Splitting into ' + totalPages + ' files...');

    try {
      var { PDFDocument } = PDFLib;
      var zip = new JSZip();

      for (var i = 0; i < totalPages; i++) {
        processingText.textContent = 'Processing page ' + (i + 1) + ' of ' + totalPages + '...';
        var newPdf = await PDFDocument.create();
        var copiedPages = await newPdf.copyPages(pdfDoc, [i]);
        for (var j = 0; j < copiedPages.length; j++) {
          newPdf.addPage(copiedPages[j]);
        }
        var pdfBytes = await newPdf.save();
        var pageNum = (i + 1).toString().padStart(2, '0');
        var baseName = uploadedFile.name.replace(/\.pdf$/i, '');
        zip.file(baseName + '_page_' + pageNum + '.pdf', pdfBytes);
      }

      processingText.textContent = 'Creating ZIP archive...';
      var zipBlob = await zip.generateAsync({ type: 'blob' });

      var baseName = uploadedFile.name.replace(/\.pdf$/i, '');
      downloadBlob(zipBlob, baseName + '_all_pages.zip');

      hideProcessing();
      toast('Created ' + totalPages + ' separate PDF files!', 'success');
    } catch (err) {
      hideProcessing();
      console.error('Split error:', err);
      toast('Error: ' + (err.message || 'Failed to split PDF'), 'error');
    }
  }

  // Reset state
  function resetAll() {
    uploadedFile = null;
    pdfDoc = null;
    pdfJsDoc = null;
    totalPages = 0;
    selectedPages.clear();
    fileInfo.classList.add('hidden');
    uploadArea.classList.remove('hidden');
    rangeControls.classList.add('hidden');
    thumbnailGrid.innerHTML = '';
    adSpace.classList.add('hidden');
    actionBar.classList.add('hidden');
    fileInput.value = '';
  }

  // Helpers
  function readFileAsArrayBuffer(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function (e) { resolve(e.target.result); };
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  }

  function downloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  // === Event Listeners ===

  // File input
  fileInput.addEventListener('change', function () {
    if (fileInput.files.length > 0) {
      loadFile(fileInput.files[0]);
      fileInput.value = '';
    }
  });

  // Upload area click
  uploadArea.addEventListener('click', function (e) {
    if (e.target === uploadArea || e.target.closest('.upload-area') === uploadArea) {
      fileInput.click();
    }
  });

  // Drag drop
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
    if (e.dataTransfer.files.length > 0) {
      loadFile(e.dataTransfer.files[0]);
    }
  });

  // Remove file
  removeFileBtn.addEventListener('click', resetAll);

  // Range selection
  rangeSelectBtn.addEventListener('click', function () {
    var from = parseInt(rangeFrom.value) - 1;
    var to = parseInt(rangeTo.value) - 1;
    if (isNaN(from) || isNaN(to) || from < 0 || to >= totalPages || from > to) {
      toast('Please enter a valid page range', 'error');
      return;
    }
    selectRange(from, to);
    toast('Selected pages ' + (from + 1) + ' to ' + (to + 1), 'success');
  });

  // Extract buttons
  extractBtn.addEventListener('click', extractSelectedPages);
  extractAllBtn.addEventListener('click', extractAllPages);

})();
