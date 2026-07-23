/**
 * QuickPDF Tools — PDF Compress
 * Client-side compression via page re-render at lower quality.
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
  var compressionSection = document.getElementById('compressionSection');
  var actionBar = document.getElementById('actionBar');
  var compressBtn = document.getElementById('compressBtn');
  var resultSection = document.getElementById('resultSection');
  var originalSizeEl = document.getElementById('originalSize');
  var compressedSizeEl = document.getElementById('compressedSize');
  var savedPercentEl = document.getElementById('savedPercent');
  var downloadBtn = document.getElementById('downloadBtn');
  var resetBtn = document.getElementById('resetBtn');
  var adSpace = document.getElementById('adSpace');
  var processingOverlay = document.getElementById('processingOverlay');
  var processingText = document.getElementById('processingText');

  var uploadedFile = null;
  var compressionLevel = 2; // 1=Max, 2=Recommended, 3=Minimal
  var compressedBlob = null;
  var compressedBytes = 0;

  // Quality config per level: { jpegQuality, renderScale }
  var qualityConfig = {
    1: { jpeg: 0.3, scale: 0.7,  name: 'Maximum' },
    2: { jpeg: 0.5, scale: 0.85, name: 'Recommended' },
    3: { jpeg: 0.7, scale: 1.0,  name: 'Minimal' },
  };

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
    compressedBlob = null;
    compressedBytes = 0;
    fileInfo.classList.add('hidden');
    uploadArea.classList.remove('hidden');
    compressionSection.classList.add('hidden');
    actionBar.classList.add('hidden');
    resultSection.classList.add('hidden');
    adSpace.classList.add('hidden');
    fileInput.value = '';
  }

  async function loadFile(file) {
    if (file.size > 50 * 1024 * 1024) {
      toast('File is larger than 50MB. Compression may be slow or fail. Consider splitting first.', 'error');
    }

    uploadedFile = file;
    fileNameEl.textContent = file.name;
    fileSizeEl.textContent = formatSize(file.size);

    fileInfo.classList.remove('hidden');
    uploadArea.classList.add('hidden');
    compressionSection.classList.remove('hidden');
    actionBar.classList.remove('hidden');
    resultSection.classList.add('hidden');
    adSpace.classList.remove('hidden');

    toast('PDF loaded — ' + formatSize(file.size), 'success');
  }

  async function compressPDF() {
    if (!uploadedFile) return;

    var config = qualityConfig[compressionLevel];
    showProcessing('Compressing PDF (' + config.name + ' level)...');

    try {
      var arrayBuffer = await readFileAsArrayBuffer(uploadedFile);

      // Load with pdfjs to render pages
      processingText.textContent = 'Loading PDF...';
      var pdfJsDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      var totalPages = pdfJsDoc.numPages;

      // Create new PDF with pdf-lib
      var { PDFDocument, PageSizes } = PDFLib;
      var newPdf = await PDFDocument.create();

      for (var i = 1; i <= totalPages; i++) {
        processingText.textContent = 'Compressing page ' + i + ' of ' + totalPages + '...';

        var page = await pdfJsDoc.getPage(i);
        var viewport = page.getViewport({ scale: config.scale });

        var canvas = document.createElement('canvas');
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        var ctx = canvas.getContext('2d');

        await page.render({ canvasContext: ctx, viewport: viewport }).promise;

        // Convert to JPEG
        var jpegDataUrl = canvas.toDataURL('image/jpeg', config.jpeg);
        var jpegBytes = dataUrlToUint8Array(jpegDataUrl);

        // Embed in new PDF
        var embeddedImage;
        try {
          embeddedImage = await newPdf.embedJpg(jpegBytes);
        } catch (e) {
          // Fallback: embed as PNG if JPG embedding fails
          var pngDataUrl = canvas.toDataURL('image/png');
          var pngBytes = dataUrlToUint8Array(pngDataUrl);
          embeddedImage = await newPdf.embedPng(pngBytes);
        }

        var newPage = newPdf.addPage([viewport.width, viewport.height]);
        newPage.drawImage(embeddedImage, {
          x: 0,
          y: 0,
          width: viewport.width,
          height: viewport.height,
        });
      }

      processingText.textContent = 'Saving compressed PDF...';
      var pdfBytes = await newPdf.save();
      compressedBytes = pdfBytes.length;
      compressedBlob = new Blob([pdfBytes], { type: 'application/pdf' });

      // Show results
      originalSizeEl.textContent = formatSize(uploadedFile.size);
      compressedSizeEl.textContent = formatSize(compressedBytes);

      var savedPct = Math.round((1 - compressedBytes / uploadedFile.size) * 100);
      if (savedPct > 0) {
        savedPercentEl.textContent = 'Saved ' + savedPct + '%';
      } else {
        savedPercentEl.textContent = 'No size reduction possible for this file';
        savedPercentEl.style.color = '#D97706';
      }

      resultSection.classList.remove('hidden');
      actionBar.classList.add('hidden');

      hideProcessing();
      toast('Compression complete! ' + (savedPct > 0 ? savedPct + '% smaller' : 'Best quality preserved'), savedPct > 0 ? 'success' : 'success');
    } catch (err) {
      hideProcessing();
      console.error('Compression error:', err);
      toast('Error: ' + (err.message || 'Failed to compress PDF'), 'error');
    }
  }

  function downloadResult() {
    if (!compressedBlob) return;
    var baseName = uploadedFile.name.replace(/\.pdf$/i, '');
    var filename = baseName + '_compressed.pdf';
    var url = URL.createObjectURL(compressedBlob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
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

  function dataUrlToUint8Array(dataUrl) {
    var base64 = dataUrl.split(',')[1];
    var binary = atob(base64);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
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
    if (e.dataTransfer.files.length > 0) {
      loadFile(e.dataTransfer.files[0]);
    }
  });

  // Compression level selection
  document.getElementById('compressionOptions').addEventListener('click', function (e) {
    var option = e.target.closest('.compression-option');
    if (!option) return;
    var level = parseInt(option.dataset.level);
    compressionLevel = level;
    var allOptions = this.querySelectorAll('.compression-option');
    for (var i = 0; i < allOptions.length; i++) {
      allOptions[i].classList.remove('active');
    }
    option.classList.add('active');
  });

  removeFileBtn.addEventListener('click', resetAll);
  compressBtn.addEventListener('click', compressPDF);
  downloadBtn.addEventListener('click', downloadResult);
  resetBtn.addEventListener('click', resetAll);
})();
