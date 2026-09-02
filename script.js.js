/**
 * SSPDF — Client-Side Browser PDF Engine
 * Pure static JavaScript implementation powered by PDF.js & pdf-lib.
 */

(function () {
  'use strict';

  // Set worker path for PDF.js CDN
  if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }

  // GLOBAL STATE MANAGEMENT
  const state = {
    pdfDoc: null,            // PDF.js instance for rendering
    pdfBytes: null,          // ArrayBuffer of loaded PDF
    pdfLibDoc: null,         // pdf-lib instance for modifications
    fileName: 'document.pdf',
    currentPage: 1,
    totalPages: 0,
    zoomScale: 1.0,
    currentTool: 'select',   // select, pan, text, highlight, draw, whiteout, rectangle, circle, line
    annotations: {},         // pageNum -> array of drawn paths/shapes
    overlayElements: {},     // pageNum -> array of text/image DOM objects
    history: [],             // Undo stack
    redoStack: [],           // Redo stack
    pageRotations: {},       // pageNum -> degrees
    selectedElement: null,
    
    // Properties configuration
    activeColor: '#000000',
    strokeWidth: 3,
    opacity: 1.0,
    fontSize: 16,
    fontFamily: 'Inter, sans-serif',

    // Merge state
    mergeFiles: []
  };

  // DOM CACHE REFERENCES
  const DOM = {
    welcomeScreen: document.getElementById('welcome-screen'),
    editorLayout: document.getElementById('editor-layout'),
    welcomeDropzone: document.getElementById('welcome-dropzone'),
    hiddenFileInput: document.getElementById('hidden-file-input'),
    hiddenImageInput: document.getElementById('hidden-image-input'),
    
    // Canvases & Overlay
    pdfCanvas: document.getElementById('pdf-render-canvas'),
    annotCanvas: document.getElementById('annotation-canvas'),
    overlayContainer: document.getElementById('overlay-container'),
    pageWrapper: document.getElementById('page-wrapper'),
    canvasScrollContainer: document.getElementById('canvas-scroll-container'),

    // Thumbnails & Sidebars
    thumbnailContainer: document.getElementById('thumbnail-container'),
    pageCountBadge: document.getElementById('page-count-badge'),
    
    // Tool buttons & Navigation
    toolBtns: document.querySelectorAll('.tool-btn'),
    btnExport: document.getElementById('btn-export'),
    btnUndo: document.getElementById('btn-undo'),
    btnRedo: document.getElementById('btn-redo'),
    currentPageInput: document.getElementById('current-page-input'),
    totalPagesCount: document.getElementById('total-pages-count'),
    zoomSelect: document.getElementById('zoom-select'),
    statusText: document.getElementById('status-text'),
    
    // Property Controls
    colorSwatches: document.querySelectorAll('.color-swatch'),
    customColorInput: document.getElementById('custom-color-input'),
    strokeWidthInput: document.getElementById('prop-stroke-width'),
    strokeWidthVal: document.getElementById('prop-stroke-val'),
    opacityInput: document.getElementById('prop-opacity'),
    opacityVal: document.getElementById('prop-opacity-val'),
    fontSizeInput: document.getElementById('prop-font-size'),
    fontSizeVal: document.getElementById('prop-font-val'),
    fontFamilySelect: document.getElementById('prop-font-family'),
    btnDeleteSelected: document.getElementById('btn-delete-selected'),

    // Toast Container
    toastContainer: document.getElementById('toast-container')
  };

  let isDrawing = false;
  let currentPath = [];

  // INITIALIZATION
  document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initEventListeners();
    initAnnotationEngine();
    registerServiceWorker();
  });

  // SERVICE WORKER REGISTRATION
  function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./service-worker.js').catch(err => {
        console.warn('Service Worker registration skipped/failed:', err);
      });
    }
  }

  // THEME MANAGEMENT
  function initTheme() {
    const savedTheme = localStorage.getItem('sspdf_theme') || 'light';
    if (savedTheme === 'dark') {
      document.documentElement.classList.add('dark');
    }
  }

  document.getElementById('btn-theme-toggle').addEventListener('click', () => {
    const isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('sspdf_theme', isDark ? 'dark' : 'light');
  });

  // TOAST NOTIFICATIONS
  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    DOM.toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 200);
    }, 3000);
  }

  // EVENT LISTENERS SETUP
  function initEventListeners() {
    // Open PDF Triggers
    document.getElementById('btn-file-open').addEventListener('click', () => DOM.hiddenFileInput.click());
    document.getElementById('btn-welcome-open').addEventListener('click', () => DOM.hiddenFileInput.click());
    DOM.hiddenFileInput.addEventListener('change', handleFileSelect);

    // Create Blank PDF Trigger
    document.getElementById('btn-blank-pdf').addEventListener('click', createBlankPDF);
    document.getElementById('btn-welcome-blank').addEventListener('click', createBlankPDF);

    // Drag & Drop
    const dropzone = DOM.welcomeDropzone;
    ['dragenter', 'dragover'].forEach(name => {
      dropzone.addEventListener(name, (e) => { e.preventDefault(); dropzone.classList.add('dragover'); });
    });
    ['dragleave', 'drop'].forEach(name => {
      dropzone.addEventListener(name, (e) => { e.preventDefault(); dropzone.classList.remove('dragover'); });
    });
    dropzone.addEventListener('drop', (e) => {
      const files = e.dataTransfer.files;
      if (files.length > 0 && files[0].type === 'application/pdf') {
        loadPDFFile(files[0]);
      } else {
        showToast('Please drop a valid PDF file', 'danger');
      }
    });

    // Tool switching
    DOM.toolBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const tool = btn.dataset.tool;
        if (tool) setTool(tool);
      });
    });

    // Color swatches
    DOM.colorSwatches.forEach(swatch => {
      swatch.addEventListener('click', () => {
        DOM.colorSwatches.forEach(s => s.classList.remove('active'));
        swatch.classList.add('active');
        state.activeColor = swatch.dataset.color;
        updateSelectedElementStyle();
      });
    });

    DOM.customColorInput.addEventListener('input', (e) => {
      state.activeColor = e.target.value;
      updateSelectedElementStyle();
    });

    // Property Range Controls
    DOM.strokeWidthInput.addEventListener('input', (e) => {
      state.strokeWidth = parseInt(e.target.value, 10);
      DOM.strokeWidthVal.textContent = `${state.strokeWidth}px`;
      updateSelectedElementStyle();
    });

    DOM.opacityInput.addEventListener('input', (e) => {
      state.opacity = parseFloat(e.target.value);
      DOM.opacityVal.textContent = `${Math.round(state.opacity * 100)}%`;
      updateSelectedElementStyle();
    });

    DOM.fontSizeInput.addEventListener('input', (e) => {
      state.fontSize = parseInt(e.target.value, 10);
      DOM.fontSizeVal.textContent = `${state.fontSize}px`;
      updateSelectedElementStyle();
    });

    DOM.fontFamilySelect.addEventListener('change', (e) => {
      state.fontFamily = e.target.value;
      updateSelectedElementStyle();
    });

    // Zoom Controls
    document.getElementById('btn-zoom-in').addEventListener('click', () => adjustZoom(0.15));
    document.getElementById('btn-zoom-out').addEventListener('click', () => adjustZoom(-0.15));
    DOM.zoomSelect.addEventListener('change', (e) => {
      const val = e.target.value;
      if (val === 'page-fit') setZoom(1.0);
      else if (val === 'page-width') setZoom(1.25);
      else if (!isNaN(parseFloat(val))) setZoom(parseFloat(val));
    });

    // Page Navigation Controls
    document.getElementById('btn-prev-page').addEventListener('click', () => changePage(-1));
    document.getElementById('btn-next-page').addEventListener('click', () => changePage(1));
    DOM.currentPageInput.addEventListener('change', (e) => {
      const page = parseInt(e.target.value, 10);
      if (page >= 1 && page <= state.totalPages) renderPage(page);
    });

    // Undo / Redo
    DOM.btnUndo.addEventListener('click', undo);
    DOM.btnRedo.addEventListener('click', redo);

    // Delete selected element
    DOM.btnDeleteSelected.addEventListener('click', deleteSelectedElement);

    // Stamp & Signature & Image Triggers
    document.getElementById('btn-tool-stamp').addEventListener('click', addStampOverlay);
    document.getElementById('btn-tool-signature').addEventListener('click', () => openModal('modal-signature'));
    document.getElementById('btn-tool-image').addEventListener('click', () => DOM.hiddenImageInput.click());
    DOM.hiddenImageInput.addEventListener('change', handleImageUpload);

    // Export Trigger
    DOM.btnExport.addEventListener('click', exportPDF);

    // Modals Close setup
    document.querySelectorAll('[data-close]').forEach(btn => {
      btn.addEventListener('click', () => closeModal(btn.dataset.close));
    });

    // Keyboard Shortcuts Listener
    document.addEventListener('keydown', handleKeyboardShortcuts);

    // Merge & Split Modals Setup
    document.getElementById('btn-merge-mode').addEventListener('click', () => openModal('modal-merge'));
    document.getElementById('btn-split-mode').addEventListener('click', () => openModal('modal-split'));
    document.getElementById('btn-shortcuts').addEventListener('click', () => openModal('modal-shortcuts'));
    document.getElementById('btn-about').addEventListener('click', () => openModal('modal-about'));

    // Signature Modal Setup
    initSignaturePad();
  }

  // TOOL SETTING
  function setTool(toolName) {
    state.currentTool = toolName;
    DOM.toolBtns.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tool === toolName);
    });

    if (toolName === 'pan') {
      DOM.annotCanvas.style.pointerEvents = 'none';
      DOM.canvasScrollContainer.style.cursor = 'grab';
    } else {
      DOM.annotCanvas.style.pointerEvents = 'auto';
      DOM.canvasScrollContainer.style.cursor = 'default';
    }
  }

  // FILE SELECTION HANDLER
  function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file && file.type === 'application/pdf') {
      loadPDFFile(file);
    }
  }

  // LOAD PDF FILE INTO MEMORY
  async function loadPDFFile(file) {
    try {
      DOM.statusText.textContent = 'Loading PDF...';
      state.fileName = file.name;
      const arrayBuffer = await file.arrayBuffer();
      state.pdfBytes = arrayBuffer;

      // Parse with PDF.js
      const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer.slice(0)) });
      state.pdfDoc = await loadingTask.promise;
      
      // Parse with pdf-lib for modification
      state.pdfLibDoc = await PDFLib.PDFDocument.load(arrayBuffer, { ignoreEncryption: true });

      state.totalPages = state.pdfDoc.numPages;
      state.currentPage = 1;
      state.annotations = {};
      state.overlayElements = {};
      state.history = [];
      state.redoStack = [];

      DOM.welcomeScreen.classList.add('hidden');
      DOM.editorLayout.classList.remove('hidden');
      DOM.btnExport.disabled = false;

      DOM.totalPagesCount.textContent = state.totalPages;
      DOM.currentPageInput.max = state.totalPages;
      DOM.pageCountBadge.textContent = state.totalPages;

      renderThumbnails();
      await renderPage(1);
      
      saveStateToHistory();
      showToast(`Successfully loaded ${file.name}`, 'success');
      DOM.statusText.textContent = 'Ready';
    } catch (err) {
      console.error(err);
      if (err.name === 'PasswordException') {
        openModal('modal-password');
      } else {
        showToast('Error opening PDF document', 'danger');
      }
      DOM.statusText.textContent = 'Error loading file';
    }
  }

  // CREATE BLANK PDF
  async function createBlankPDF() {
    try {
      const pdfDoc = await PDFLib.PDFDocument.create();
      pdfDoc.addPage([595.28, 841.89]); // A4 Size
      const bytes = await pdfDoc.save();
      
      state.pdfBytes = bytes.buffer;
      state.fileName = 'Untitled-Document.pdf';

      const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(bytes) });
      state.pdfDoc = await loadingTask.promise;
      state.pdfLibDoc = pdfDoc;

      state.totalPages = 1;
      state.currentPage = 1;
      state.annotations = {};
      state.overlayElements = {};

      DOM.welcomeScreen.classList.add('hidden');
      DOM.editorLayout.classList.remove('hidden');
      DOM.btnExport.disabled = false;

      DOM.totalPagesCount.textContent = 1;
      DOM.pageCountBadge.textContent = 1;

      renderThumbnails();
      await renderPage(1);
      showToast('Created new blank A4 PDF', 'success');
    } catch (err) {
      console.error(err);
      showToast('Failed to create blank PDF', 'danger');
    }
  }

  // RENDER MAIN PAGE CANVAS
  async function renderPage(pageNum) {
    if (!state.pdfDoc || pageNum < 1 || pageNum > state.totalPages) return;
    state.currentPage = pageNum;
    DOM.currentPageInput.value = pageNum;

    const page = await state.pdfDoc.getPage(pageNum);
    const rotation = (state.pageRotations[pageNum] || 0);
    const viewport = page.getViewport({ scale: state.zoomScale, rotation });

    const canvas = DOM.pdfCanvas;
    const ctx = canvas.getContext('2d');
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    // Annotation canvas sizing
    DOM.annotCanvas.width = viewport.width;
    DOM.annotCanvas.height = viewport.height;
    DOM.pageWrapper.style.width = `${viewport.width}px`;
    DOM.pageWrapper.style.height = `${viewport.height}px`;

    const renderContext = {
      canvasContext: ctx,
      viewport: viewport
    };

    await page.render(renderContext).promise;
    redrawAnnotations();
    renderOverlayElements();
  }

  // RENDER THUMBNAILS SIDEBAR
  async function renderThumbnails() {
    DOM.thumbnailContainer.innerHTML = '';
    for (let i = 1; i <= state.totalPages; i++) {
      const page = await state.pdfDoc.getPage(i);
      const viewport = page.getViewport({ scale: 0.2 });

      const thumbItem = document.createElement('div');
      thumbItem.className = `thumb-item ${i === state.currentPage ? 'selected' : ''}`;
      thumbItem.dataset.page = i;

      const thumbCanvas = document.createElement('canvas');
      thumbCanvas.className = 'thumb-canvas';
      thumbCanvas.width = viewport.width;
      thumbCanvas.height = viewport.height;

      const ctx = thumbCanvas.getContext('2d');
      await page.render({ canvasContext: ctx, viewport }).promise;

      const label = document.createElement('span');
      label.className = 'thumb-label';
      label.textContent = `Page ${i}`;

      thumbItem.appendChild(thumbCanvas);
      thumbItem.appendChild(label);
      
      thumbItem.addEventListener('click', () => {
        document.querySelectorAll('.thumb-item').forEach(el => el.classList.remove('selected'));
        thumbItem.classList.add('selected');
        renderPage(i);
      });

      DOM.thumbnailContainer.appendChild(thumbItem);
    }
  }

  // ANNOTATION ENGINE & CANVAS DRAWING
  function initAnnotationEngine() {
    const canvas = DOM.annotCanvas;
    const ctx = canvas.getContext('2d');

    canvas.addEventListener('mousedown', (e) => {
      if (state.currentTool === 'select' || state.currentTool === 'pan') return;
      isDrawing = true;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      if (state.currentTool === 'draw' || state.currentTool === 'highlight') {
        currentPath = [{ x, y }];
      } else if (state.currentTool === 'text') {
        createTextOverlay(x, y);
        isDrawing = false;
      } else if (['rectangle', 'circle', 'line', 'whiteout'].includes(state.currentTool)) {
        currentPath = [{ x, y }, { x, y }];
      }
    });

    canvas.addEventListener('mousemove', (e) => {
      if (!isDrawing) return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      if (state.currentTool === 'draw' || state.currentTool === 'highlight') {
        currentPath.push({ x, y });
        redrawAnnotations();
        drawPath(ctx, currentPath, state.activeColor, state.strokeWidth, state.currentTool === 'highlight' ? 0.4 : state.opacity);
      } else if (['rectangle', 'circle', 'line', 'whiteout'].includes(state.currentTool)) {
        currentPath[1] = { x, y };
        redrawAnnotations();
        drawShapePreview(ctx, currentPath[0], currentPath[1], state.currentTool);
      }
    });

    canvas.addEventListener('mouseup', () => {
      if (!isDrawing) return;
      isDrawing = false;
      if (currentPath.length > 0) {
        if (!state.annotations[state.currentPage]) state.annotations[state.currentPage] = [];
        state.annotations[state.currentPage].push({
          tool: state.currentTool,
          path: [...currentPath],
          color: state.currentTool === 'whiteout' ? '#FFFFFF' : state.activeColor,
          width: state.strokeWidth,
          opacity: state.currentTool === 'highlight' ? 0.4 : state.opacity
        });
        currentPath = [];
        redrawAnnotations();
        saveStateToHistory();
      }
    });
  }

  function redrawAnnotations() {
    const canvas = DOM.annotCanvas;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const items = state.annotations[state.currentPage] || [];
    items.forEach(item => {
      if (item.tool === 'draw' || item.tool === 'highlight') {
        drawPath(ctx, item.path, item.color, item.width, item.opacity);
      } else {
        drawShapePreview(ctx, item.path[0], item.path[1], item.tool, item.color, item.width, item.opacity);
      }
    });
  }

  function drawPath(ctx, path, color, width, opacity) {
    if (path.length < 2) return;
    ctx.save();
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.globalAlpha = opacity;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.moveTo(path[0].x, path[0].y);
    for (let i = 1; i < path.length; i++) {
      ctx.lineTo(path[i].x, path[i].y);
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawShapePreview(ctx, start, end, tool, color = state.activeColor, width = state.strokeWidth, opacity = state.opacity) {
    ctx.save();
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = width;
    ctx.globalAlpha = opacity;

    const w = end.x - start.x;
    const h = end.y - start.y;

    if (tool === 'rectangle') {
      ctx.strokeRect(start.x, start.y, w, h);
    } else if (tool === 'whiteout') {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(start.x, start.y, w, h);
    } else if (tool === 'circle') {
      ctx.beginPath();
      ctx.arc(start.x + w / 2, start.y + h / 2, Math.abs(Math.max(w, h) / 2), 0, 2 * Math.PI);
      ctx.stroke();
    } else if (tool === 'line') {
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  // OVERLAY ELEMENTS (TEXT, STAMPS, SIGNATURES, IMAGES)
  function createTextOverlay(x, y, initialText = 'Double click to edit text') {
    const el = document.createElement('div');
    el.className = 'overlay-element selected';
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;

    const textInput = document.createElement('div');
    textInput.className = 'overlay-text';
    textInput.contentEditable = true;
    textInput.textContent = initialText;
    textInput.style.color = state.activeColor;
    textInput.style.fontSize = `${state.fontSize}px`;
    textInput.style.fontFamily = state.fontFamily;
    textInput.style.opacity = state.opacity;

    el.appendChild(textInput);
    DOM.overlayContainer.appendChild(el);

    makeElementDraggable(el);
    selectElement(el);

    if (!state.overlayElements[state.currentPage]) state.overlayElements[state.currentPage] = [];
    state.overlayElements[state.currentPage].push(el);
    saveStateToHistory();
  }

  function addStampOverlay() {
    if (!state.pdfDoc) return;
    const el = document.createElement('div');
    el.className = 'overlay-element selected';
    el.style.left = '100px';
    el.style.top = '100px';
    el.innerHTML = `<svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="${state.activeColor}" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>`;
    
    DOM.overlayContainer.appendChild(el);
    makeElementDraggable(el);
    selectElement(el);

    if (!state.overlayElements[state.currentPage]) state.overlayElements[state.currentPage] = [];
    state.overlayElements[state.currentPage].push(el);
    saveStateToHistory();
  }

  function handleImageUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const img = document.createElement('img');
      img.src = evt.target.result;
      img.style.maxWidth = '200px';

      const el = document.createElement('div');
      el.className = 'overlay-element selected';
      el.style.left = '100px';
      el.style.top = '100px';
      el.appendChild(img);

      DOM.overlayContainer.appendChild(el);
      makeElementDraggable(el);
      selectElement(el);

      if (!state.overlayElements[state.currentPage]) state.overlayElements[state.currentPage] = [];
      state.overlayElements[state.currentPage].push(el);
      saveStateToHistory();
      showToast('Image inserted onto canvas', 'success');
    };
    reader.readAsDataURL(file);
  }

  function renderOverlayElements() {
    DOM.overlayContainer.innerHTML = '';
    const elements = state.overlayElements[state.currentPage] || [];
    elements.forEach(el => DOM.overlayContainer.appendChild(el));
  }

  function selectElement(el) {
    if (state.selectedElement) state.selectedElement.classList.remove('selected');
    state.selectedElement = el;
    if (el) {
      el.classList.add('selected');
      DOM.btnDeleteSelected.disabled = false;
    } else {
      DOM.btnDeleteSelected.disabled = true;
    }
  }

  function updateSelectedElementStyle() {
    if (!state.selectedElement) return;
    const txt = state.selectedElement.querySelector('.overlay-text');
    if (txt) {
      txt.style.color = state.activeColor;
      txt.style.fontSize = `${state.fontSize}px`;
      txt.style.fontFamily = state.fontFamily;
      txt.style.opacity = state.opacity;
    }
  }

  function deleteSelectedElement() {
    if (!state.selectedElement) return;
    state.selectedElement.remove();
    const arr = state.overlayElements[state.currentPage] || [];
    state.overlayElements[state.currentPage] = arr.filter(item => item !== state.selectedElement);
    selectElement(null);
    saveStateToHistory();
    showToast('Element deleted', 'info');
  }

  function makeElementDraggable(el) {
    let posX = 0, posY = 0, mouseX = 0, mouseY = 0;
    el.onmousedown = (e) => {
      if (state.currentTool !== 'select') return;
      selectElement(el);
      e.stopPropagation();
      mouseX = e.clientX;
      mouseY = e.clientY;

      document.onmousemove = (eMove) => {
        posX = mouseX - eMove.clientX;
        posY = mouseY - eMove.clientY;
        mouseX = eMove.clientX;
        mouseY = eMove.clientY;
        el.style.top = `${el.offsetTop - posY}px`;
        el.style.left = `${el.offsetLeft - posX}px`;
      };

      document.onmouseup = () => {
        document.onmousemove = null;
        document.onmouseup = null;
        saveStateToHistory();
      };
    };
  }

  // ZOOM & PAGE NAVIGATION
  function adjustZoom(delta) {
    setZoom(Math.min(Math.max(state.zoomScale + delta, 0.4), 3.0));
  }

  function setZoom(newScale) {
    state.zoomScale = newScale;
    DOM.zoomSelect.value = newScale.toString();
    renderPage(state.currentPage);
  }

  function changePage(delta) {
    const target = state.currentPage + delta;
    if (target >= 1 && target <= state.totalPages) {
      renderPage(target);
    }
  }

  // UNDO / REDO SYSTEM
  function saveStateToHistory() {
    state.history.push({
      annotations: JSON.parse(JSON.stringify(state.annotations)),
      overlayHTML: DOM.overlayContainer.innerHTML
    });
    state.redoStack = [];
    updateHistoryButtons();
  }

  function undo() {
    if (state.history.length <= 1) return;
    state.redoStack.push(state.history.pop());
    const prevState = state.history[state.history.length - 1];
    state.annotations = JSON.parse(JSON.stringify(prevState.annotations));
    redrawAnnotations();
    showToast('Action undone', 'info');
    updateHistoryButtons();
  }

  function redo() {
    if (state.redoStack.length === 0) return;
    const nextState = state.redoStack.pop();
    state.history.push(nextState);
    state.annotations = JSON.parse(JSON.stringify(nextState.annotations));
    redrawAnnotations();
    showToast('Action redone', 'info');
    updateHistoryButtons();
  }

  function updateHistoryButtons() {
    DOM.btnUndo.disabled = state.history.length <= 1;
    DOM.btnRedo.disabled = state.redoStack.length === 0;
  }

  // EXPORT ENGINE (EMBED ANNOTATIONS & DOWNLOAD)
  async function exportPDF() {
    try {
      DOM.statusText.textContent = 'Exporting PDF...';
      const pdfDoc = await PDFLib.PDFDocument.load(state.pdfBytes);
      const pages = pdfDoc.getPages();

      // Burn in annotations per page
      for (let i = 1; i <= state.totalPages; i++) {
        const page = pages[i - 1];
        const pageAnnots = state.annotations[i] || [];
        const { height } = page.getSize();

        pageAnnots.forEach(item => {
          if (item.tool === 'whiteout') {
            const start = item.path[0];
            const end = item.path[1];
            page.drawRectangle({
              x: start.x,
              y: height - end.y,
              width: end.x - start.x,
              height: end.y - start.y,
              color: PDFLib.rgb(1, 1, 1)
            });
          }
        });
      }

      const modifiedBytes = await pdfDoc.save();
      const blob = new Blob([modifiedBytes], { type: 'application/pdf' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `SSPDF-Edited-${state.fileName}`;
      link.click();

      showToast('Exported PDF successfully!', 'success');
      DOM.statusText.textContent = 'Ready';
    } catch (err) {
      console.error(err);
      showToast('Export failed', 'danger');
      DOM.statusText.textContent = 'Export error';
    }
  }

  // SIGNATURE PAD MODAL ENGINE
  function initSignaturePad() {
    const canvas = document.getElementById('signature-pad');
    const ctx = canvas.getContext('2d');
    let sigDrawing = false;
    let sigColor = '#000000';

    canvas.addEventListener('mousedown', (e) => {
      sigDrawing = true;
      ctx.beginPath();
      ctx.moveTo(e.offsetX, e.offsetY);
    });

    canvas.addEventListener('mousemove', (e) => {
      if (!sigDrawing) return;
      ctx.strokeStyle = sigColor;
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.lineTo(e.offsetX, e.offsetY);
      ctx.stroke();
    });

    canvas.addEventListener('mouseup', () => sigDrawing = false);

    document.getElementById('btn-clear-sig').addEventListener('click', () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    });

    document.querySelectorAll('[data-sig-color]').forEach(dot => {
      dot.addEventListener('click', () => {
        document.querySelectorAll('[data-sig-color]').forEach(d => d.classList.remove('active'));
        dot.classList.add('active');
        sigColor = dot.dataset.sigColor;
      });
    });

    document.getElementById('btn-apply-signature').addEventListener('click', () => {
      const dataUrl = canvas.toDataURL();
      const img = document.createElement('img');
      img.src = dataUrl;
      img.style.width = '160px';

      const el = document.createElement('div');
      el.className = 'overlay-element selected';
      el.style.left = '150px';
      el.style.top = '150px';
      el.appendChild(img);

      DOM.overlayContainer.appendChild(el);
      makeElementDraggable(el);
      selectElement(el);

      if (!state.overlayElements[state.currentPage]) state.overlayElements[state.currentPage] = [];
      state.overlayElements[state.currentPage].push(el);

      closeModal('modal-signature');
      saveStateToHistory();
      showToast('Signature added to page', 'success');
    });
  }

  // KEYBOARD SHORTCUTS HANDLER
  function handleKeyboardShortcuts(e) {
    if (e.target.tagName === 'INPUT' || e.target.isContentEditable) return;

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') {
      e.preventDefault();
      DOM.hiddenFileInput.click();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      exportPDF();
    } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      redo();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      undo();
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      deleteSelectedElement();
    } else if (e.key.toLowerCase() === 'v') {
      setTool('select');
    } else if (e.key.toLowerCase() === 'h') {
      setTool('pan');
    } else if (e.key.toLowerCase() === 't') {
      setTool('text');
    } else if (e.key.toLowerCase() === 'p') {
      setTool('draw');
    }
  }

  // MODAL HELPERS
  function openModal(id) {
    document.getElementById(id).classList.remove('hidden');
  }

  function closeModal(id) {
    document.getElementById(id).classList.add('hidden');
  }

})();