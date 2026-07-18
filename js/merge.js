/**
 * QuickPDF Tools — PDF Merge
 * Pure client-side merge using pdf-lib. No uploads.
 */

(function () {
  'use strict';

  // DOM refs
  const uploadArea = document.getElementById('uploadArea');
  const fileInput = document.getElementById('fileInput');
  const fileList = document.getElementById('fileList');
  const actionBar = document.getElementById('actionBar');
  const mergeBtn = document.getElementById('mergeBtn');
  const clearBtn = document.getElementById('clearBtn');
  const processingOverlay = document.getElementById('processingOverlay');
  const processingText = document.getElementById('processingText');

  // State — store files with drag metadata
  let pdfFiles = []; // { file: File, id: string, order: number }

  // Generate unique ID
  function uid() {
    return Math.random().toString(36).substring(2, 10);
  }

  // Show toast
  function toast(msg, type) {
    var el = document.createElement('div');
    el.className = 'toast ' + type;
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(function () { el.remove(); }, 3000);
  }

  // Format bytes
  function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  }

  // Show processing overlay
  function showProcessing(msg) {
    processingText.textContent = msg;
    processingOverlay.classList.remove('hidden');
  }

  function hideProcessing() {
    processingOverlay.classList.add('hidden');
  }

  // Add files to state
  function addFiles(newFiles) {
    var added = 0;
    for (var i = 0; i < newFiles.length; i++) {
      var file = newFiles[i];
      // Validate PDF
      if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
        toast('Skipped: "' + file.name + '" is not a PDF file', 'error');
        continue;
      }
      // Check duplicate
      if (pdfFiles.some(function (f) { return f.file.name === file.name && f.file.size === file.size; })) {
        continue;
      }
      pdfFiles.push({
        file: file,
        id: uid(),
      });
      added++;
    }
    if (added > 0) {
      toast('Added ' + added + ' file' + (added > 1 ? 's' : ''), 'success');
    }
    renderFileList();
  }

  // Remove file
  function removeFile(id) {
    pdfFiles = pdfFiles.filter(function (f) { return f.id !== id; });
    renderFileList();
  }

  // Clear all
  function clearAll() {
    pdfFiles = [];
    fileInput.value = '';
    renderFileList();
  }

  // Move file up/down in order
  function moveFile(id, direction) {
    var idx = -1;
    for (var i = 0; i < pdfFiles.length; i++) {
      if (pdfFiles[i].id === id) { idx = i; break; }
    }
    if (idx === -1) return;
    var newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= pdfFiles.length) return;
    var tmp = pdfFiles[idx];
    pdfFiles[idx] = pdfFiles[newIdx];
    pdfFiles[newIdx] = tmp;
    renderFileList();
  }

  // Render file list with drag handles
  function renderFileList() {
    fileList.innerHTML = '';

    if (pdfFiles.length === 0) {
      fileList.innerHTML = '';
      actionBar.classList.add('hidden');
      return;
    }

    actionBar.classList.remove('hidden');

    for (var i = 0; i < pdfFiles.length; i++) {
      var item = pdfFiles[i];
      var div = document.createElement('div');
      div.className = 'file-item';
      div.draggable = true;
      div.dataset.id = item.id;
      div.dataset.index = i;

      div.innerHTML =
        '<span class="drag-handle" title="Drag to reorder">&#9776;</span>' +
        '<span class="file-icon">&#128196;</span>' +
        '<div class="file-info">' +
          '<div class="file-name">' + escapeHtml(item.file.name) + '</div>' +
          '<div class="file-size">' + formatSize(item.file.size) + '</div>' +
        '</div>' +
        '<button class="file-remove" title="Remove" data-remove="' + item.id + '" aria-label="Remove file">&times;</button>';

      fileList.appendChild(div);
    }

    // Attach remove handlers
    var removeBtns = fileList.querySelectorAll('[data-remove]');
    for (var r = 0; r < removeBtns.length; r++) {
      removeBtns[r].addEventListener('click', function (e) {
        e.stopPropagation();
        removeFile(this.dataset.remove);
      });
    }

    // Attach drag handlers
    attachDragHandlers();
  }

  // HTML escape
  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // Drag & drop reorder
  var dragSrcIndex = -1;

  function attachDragHandlers() {
    var items = fileList.querySelectorAll('.file-item');

    for (var i = 0; i < items.length; i++) {
      items[i].addEventListener('dragstart', function (e) {
        dragSrcIndex = parseInt(this.dataset.index);
        this.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', this.dataset.id);
      });

      items[i].addEventListener('dragend', function (e) {
        this.classList.remove('dragging');
        var allItems = fileList.querySelectorAll('.file-item');
        for (var j = 0; j < allItems.length; j++) {
          allItems[j].classList.remove('dragging');
        }
        dragSrcIndex = -1;
      });

      items[i].addEventListener('dragover', function (e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      });

      items[i].addEventListener('drop', function (e) {
        e.preventDefault();
        var targetIndex = parseInt(this.dataset.index);
        if (dragSrcIndex === -1 || dragSrcIndex === targetIndex) return;

        // Swap
        var tmp = pdfFiles[dragSrcIndex];
        pdfFiles[dragSrcIndex] = pdfFiles[targetIndex];
        pdfFiles[targetIndex] = tmp;

        renderFileList();
      });
    }
  }

  // === Merge Logic ===
  async function mergePDFs() {
    if (pdfFiles.length === 0) {
      toast('Please add at least one PDF file', 'error');
      return;
    }

    if (pdfFiles.length === 1) {
      // Just download the single file
      downloadBlob(pdfFiles[0].file, pdfFiles[0].file.name);
      toast('Only one file — downloaded directly', 'success');
      return;
    }

    showProcessing('Merging ' + pdfFiles.length + ' PDF files...');

    try {
      var { PDFDocument } = PDFLib;
      var mergedPdf = await PDFDocument.create();

      for (var i = 0; i < pdfFiles.length; i++) {
        processingText.textContent = 'Processing file ' + (i + 1) + ' of ' + pdfFiles.length + '...';

        var arrayBuffer = await readFileAsArrayBuffer(pdfFiles[i].file);
        var srcDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });

        var pageIndices = srcDoc.getPageIndices();
        var copiedPages = await mergedPdf.copyPages(srcDoc, pageIndices);

        for (var j = 0; j < copiedPages.length; j++) {
          mergedPdf.addPage(copiedPages[j]);
        }
      }

      processingText.textContent = 'Saving merged PDF...';
      var pdfBytes = await mergedPdf.save();

      // Generate filename
      var firstFile = pdfFiles[0].file.name.replace(/\.pdf$/i, '');
      var filename = firstFile + '_merged.pdf';

      var blob = new Blob([pdfBytes], { type: 'application/pdf' });
      downloadBlob(blob, filename);

      hideProcessing();
      toast('PDFs merged successfully!', 'success');
    } catch (err) {
      hideProcessing();
      console.error('Merge error:', err);
      toast('Error: ' + (err.message || 'Failed to merge PDFs'), 'error');
    }
  }

  // Read file as ArrayBuffer
  function readFileAsArrayBuffer(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function (e) { resolve(e.target.result); };
      reader.onerror = function (e) { reject(e); };
      reader.readAsArrayBuffer(file);
    });
  }

  // Download blob
  function downloadBlob(blobOrFile, filename) {
    var url;
    if (blobOrFile instanceof File) {
      url = URL.createObjectURL(blobOrFile);
    } else {
      url = URL.createObjectURL(blobOrFile);
    }
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  // === Event Listeners ===

  // File input change
  fileInput.addEventListener('change', function () {
    if (fileInput.files.length > 0) {
      var files = [];
      for (var i = 0; i < fileInput.files.length; i++) {
        files.push(fileInput.files[i]);
      }
      addFiles(files);
      fileInput.value = '';
    }
  });

  // Click on upload area
  uploadArea.addEventListener('click', function () {
    fileInput.click();
  });

  // Drag and drop onto upload area
  uploadArea.addEventListener('dragover', function (e) {
    e.preventDefault();
    e.stopPropagation();
    uploadArea.classList.add('drag-over');
  });

  uploadArea.addEventListener('dragleave', function (e) {
    e.preventDefault();
    e.stopPropagation();
    uploadArea.classList.remove('drag-over');
  });

  uploadArea.addEventListener('drop', function (e) {
    e.preventDefault();
    e.stopPropagation();
    uploadArea.classList.remove('drag-over');
    if (e.dataTransfer.files.length > 0) {
      var files = [];
      for (var i = 0; i < e.dataTransfer.files.length; i++) {
        files.push(e.dataTransfer.files[i]);
      }
      addFiles(files);
    }
  });

  // Paste support
  document.addEventListener('paste', function (e) {
    var items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    var files = [];
    for (var i = 0; i < items.length; i++) {
      if (items[i].kind === 'file') {
        files.push(items[i].getAsFile());
      }
    }
    if (files.length > 0) {
      e.preventDefault();
      addFiles(files);
    }
  });

  // Buttons
  mergeBtn.addEventListener('click', mergePDFs);
  clearBtn.addEventListener('click', clearAll);

})();
