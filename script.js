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
    currentTool: 'select',   // select, pan, text, highlight, draw, whiteout, rectangle, circle, line, arrow
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
    mergeFiles: [],
    searchResults: [],
    searchIndex: -1,
    panState: null,
    pinchState: null,
    imagePdfFiles: [],
    lastOcrBytes: null,
    lastOcrText: '',
    lastOcrFileName: ''
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
      if (val === 'page-fit') applyFitScale('page');
      else if (val === 'page-width') applyFitScale('width');
      else if (!isNaN(parseFloat(val))) setZoom(parseFloat(val));
    });

    // Page Navigation Controls
    document.getElementById('btn-prev-page').addEventListener('click', () => changePage(-1));
    document.getElementById('btn-next-page').addEventListener('click', () => changePage(1));
    DOM.currentPageInput.addEventListener('change', (e) => {
      const page = parseInt(e.target.value, 10);
      if (page >= 1 && page <= state.totalPages) renderPage(page);
    });
    // Document search
    document.getElementById('btn-search-toggle').addEventListener('click', toggleSearch);
    document.getElementById('btn-search-close').addEventListener('click', () => {
      document.getElementById('search-bar').classList.add('hidden');
    });
    document.getElementById('search-input').addEventListener('input', performSearch);
    document.getElementById('search-input').addEventListener('keydown', e => {
      if (e.key === 'Enter') e.shiftKey ? previousSearchResult() : nextSearchResult();
    });
    document.getElementById('btn-search-next').addEventListener('click', nextSearchResult);
    document.getElementById('btn-search-prev').addEventListener('click', previousSearchResult);

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
    DOM.hiddenImageInput.addEventListener('click', () => { DOM.hiddenImageInput.value = ''; });

    // Export Trigger
    DOM.btnExport.addEventListener('click', exportPDF);

    // Convert / OCR / Compress
    const imageToPdfBtn = document.getElementById('btn-image-to-pdf');
    const imageToPdfInput = document.getElementById('image-to-pdf-input');
    if (imageToPdfBtn && imageToPdfInput) {
      imageToPdfBtn.addEventListener('click', () => {
        state.imagePdfFiles = [];
        renderImagePdfList();
        document.getElementById('btn-create-image-pdf').disabled = true;
        openModal('modal-image-to-pdf');
      });
      imageToPdfInput.addEventListener('change', handleImagesToPDF);
    }
    const selectImagesBtn = document.getElementById('btn-select-images');
    if (selectImagesBtn) selectImagesBtn.addEventListener('click', () => imageToPdfInput.click());
    const createImagePdfBtn = document.getElementById('btn-create-image-pdf');
    if (createImagePdfBtn) createImagePdfBtn.addEventListener('click', createImagesPDF);
    const copyOcrBtn = document.getElementById('btn-copy-ocr');
    if (copyOcrBtn) copyOcrBtn.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(state.lastOcrText || ''); showToast('OCR text copied', 'success'); }
      catch (_) { const ta=document.getElementById('ocr-text-output'); ta.classList.remove('hidden'); ta.focus(); ta.select(); document.execCommand('copy'); showToast('OCR text copied', 'success'); }
    });
    const downloadOcrTxtBtn = document.getElementById('btn-download-ocr-txt');
    if (downloadOcrTxtBtn) downloadOcrTxtBtn.addEventListener('click', () => downloadBytes(new TextEncoder().encode(state.lastOcrText || ''), `SSPDF-OCR-${state.fileName.replace(/\.pdf$/i,'')}.txt`, 'text/plain;charset=utf-8'));
    const ocrBtn = document.getElementById('btn-ocr');
    if (ocrBtn) ocrBtn.addEventListener('click', () => {
      if (!state.pdfDoc) { showToast('Open a PDF first', 'warning'); return; }
      openModal('modal-ocr');
    });
    const executeOcrBtn = document.getElementById('btn-execute-ocr');
    if (executeOcrBtn) executeOcrBtn.addEventListener('click', runOCR);
    const compressBtn = document.getElementById('btn-compress');
    if (compressBtn) compressBtn.addEventListener('click', () => {
      if (!state.pdfDoc) { showToast('Open a PDF first', 'warning'); return; }
      openModal('modal-compress');
    });
    const executeCompressBtn = document.getElementById('btn-execute-compress');
    if (executeCompressBtn) executeCompressBtn.addEventListener('click', compressPDF);

    // Page management
    const rotateBtn = document.getElementById('btn-sidebar-rotate');
    const deletePageBtn = document.getElementById('btn-sidebar-delete');
    const addBlankPageBtn = document.getElementById('btn-add-blank-page');
    if (rotateBtn) rotateBtn.addEventListener('click', () => rotateCurrentPage());
    if (deletePageBtn) deletePageBtn.addEventListener('click', () => deleteCurrentPage());
    if (addBlankPageBtn) addBlankPageBtn.addEventListener('click', () => addBlankPage());
    const addPdfBtn = document.getElementById('btn-add-pdf-page');
    const addPdfInput = document.getElementById('add-pdf-input');
    if (addPdfBtn && addPdfInput) addPdfBtn.addEventListener('click', () => addPdfInput.click());
    if (addPdfInput) addPdfInput.addEventListener('change', handleAddPdfToCurrent);

    // Merge / Split
    const mergeInput = document.getElementById('merge-file-input');
    const addMergeBtn = document.getElementById('btn-add-merge-files');
    const executeMergeBtn = document.getElementById('btn-execute-merge');
    if (addMergeBtn && mergeInput) addMergeBtn.addEventListener('click', () => mergeInput.click());
    if (mergeInput) mergeInput.addEventListener('change', handleMergeFiles);
    if (executeMergeBtn) executeMergeBtn.addEventListener('click', executeMerge);
    const executeSplitBtn = document.getElementById('btn-execute-split');
    if (executeSplitBtn) executeSplitBtn.addEventListener('click', executeSplit);
    const splitMode = document.getElementById('split-mode-select');
    if (splitMode) splitMode.addEventListener('change', () => {
      document.getElementById('split-range-group').classList.toggle('hidden', splitMode.value !== 'range');
    });

    // Modals Close setup
    document.querySelectorAll('[data-close]').forEach(btn => {
      btn.addEventListener('click', () => closeModal(btn.dataset.close));
    });

    // Mobile side-panel toggles: sidebars stay closed until requested.
    const mobilePages = document.getElementById('btn-mobile-pages');
    const mobileProps = document.getElementById('btn-mobile-properties');
    if (mobilePages) mobilePages.addEventListener('click', () => {
      document.getElementById('sidebar-thumbnails')?.classList.toggle('mobile-open');
      document.getElementById('sidebar-properties')?.classList.remove('mobile-open');
    });
    if (mobileProps) mobileProps.addEventListener('click', () => {
      document.getElementById('sidebar-properties')?.classList.toggle('mobile-open');
      document.getElementById('sidebar-thumbnails')?.classList.remove('mobile-open');
    });
    document.querySelectorAll('[data-mobile-close]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.preventDefault(); e.stopPropagation();
        btn.closest('.sidebar-thumbnails, .sidebar-properties')?.classList.remove('mobile-open');
      });
    });
    // Tap the dimmed workspace to close an open mobile sidebar.
    DOM.canvasScrollContainer.addEventListener('pointerdown', e => {
      if (!window.matchMedia('(max-width: 768px)').matches) return;
      if (e.target !== DOM.canvasScrollContainer) return;
      document.querySelectorAll('.sidebar-thumbnails.mobile-open, .sidebar-properties.mobile-open').forEach(el => el.classList.remove('mobile-open'));
    }, { passive: true });

    // Keyboard Shortcuts Listener
    document.addEventListener('keydown', handleKeyboardShortcuts);

    // Merge & Split Modals Setup
    document.getElementById('btn-merge-mode').addEventListener('click', () => openModal('modal-merge'));
    document.getElementById('btn-split-mode').addEventListener('click', () => openModal('modal-split'));
    document.getElementById('btn-shortcuts').addEventListener('click', () => openModal('modal-shortcuts'));
    document.getElementById('btn-about').addEventListener('click', () => openModal('modal-about'));

    // Hand-tool drag scrolling (mouse + touch/pointer)
    const startPan = e => {
      if (state.currentTool !== 'pan') return;
      state.panState = { pointerId: e.pointerId, x: e.clientX, y: e.clientY, left: DOM.canvasScrollContainer.scrollLeft, top: DOM.canvasScrollContainer.scrollTop };
      DOM.canvasScrollContainer.classList.add('panning');
      try { DOM.canvasScrollContainer.setPointerCapture(e.pointerId); } catch (_) {}
      e.preventDefault();
    };
    const movePan = e => {
      if (!state.panState || e.pointerId !== state.panState.pointerId) return;
      const p = state.panState;
      DOM.canvasScrollContainer.scrollLeft = p.left - (e.clientX - p.x);
      DOM.canvasScrollContainer.scrollTop = p.top - (e.clientY - p.y);
      e.preventDefault();
    };
    const endPan = e => {
      if (!state.panState || (e.pointerId != null && e.pointerId !== state.panState.pointerId)) return;
      try { DOM.canvasScrollContainer.releasePointerCapture(state.panState.pointerId); } catch (_) {}
      state.panState = null;
      DOM.canvasScrollContainer.classList.remove('panning');
    };
    DOM.canvasScrollContainer.addEventListener('pointerdown', startPan, { passive: false });
    DOM.canvasScrollContainer.addEventListener('pointermove', movePan, { passive: false });
    DOM.canvasScrollContainer.addEventListener('pointerup', endPan);
    DOM.canvasScrollContainer.addEventListener('pointercancel', endPan);

    // Mobile pinch-to-zoom and two-finger pan while Select is active.
    // This is implemented inside the PDF workspace so it zooms the PDF, not the whole webpage.
    const gesturePointers = new Map();
    let lastGestureDistance = 0;
    let lastGestureCenter = null;
    let gestureBusy = false;
    const isTouchPointer = e => e.pointerType === 'touch';
    const gestureStart = e => {
      if (!isTouchPointer(e) || state.currentTool !== 'select') return;
      gesturePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (gesturePointers.size === 2) {
        const pts = [...gesturePointers.values()];
        lastGestureDistance = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
        lastGestureCenter = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
        gestureBusy = true;
        e.preventDefault();
      }
    };
    const gestureMove = e => {
      if (!isTouchPointer(e) || !gesturePointers.has(e.pointerId) || state.currentTool !== 'select') return;
      gesturePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (gesturePointers.size !== 2) return;
      const pts = [...gesturePointers.values()];
      const distance = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      const center = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
      if (!lastGestureDistance) lastGestureDistance = distance;
      const ratio = distance / lastGestureDistance;
      if (Math.abs(ratio - 1) > 0.008 && !gestureBusy) {
        const next = Math.min(Math.max(state.zoomScale * ratio, 0.4), 3.0);
        gestureBusy = true;
        setZoom(next, center.x, center.y).finally(() => { gestureBusy = false; });
        lastGestureDistance = distance;
      }
      // Two-finger translation also pans the zoomed PDF.
      if (lastGestureCenter) {
        DOM.canvasScrollContainer.scrollLeft -= (center.x - lastGestureCenter.x);
        DOM.canvasScrollContainer.scrollTop -= (center.y - lastGestureCenter.y);
      }
      lastGestureCenter = center;
      e.preventDefault();
    };
    const gestureEnd = e => {
      if (!isTouchPointer(e)) return;
      gesturePointers.delete(e.pointerId);
      if (gesturePointers.size < 2) {
        lastGestureDistance = 0;
        lastGestureCenter = null;
        gestureBusy = false;
      }
    };
    DOM.canvasScrollContainer.addEventListener('pointerdown', gestureStart, { passive: false });
    DOM.canvasScrollContainer.addEventListener('pointermove', gestureMove, { passive: false });
    DOM.canvasScrollContainer.addEventListener('pointerup', gestureEnd);
    DOM.canvasScrollContainer.addEventListener('pointercancel', gestureEnd);

    // Signature Modal Setup
    initSignaturePad();
    document.querySelectorAll('[data-tab]').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('[data-tab]').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
        tab.classList.add('active');
        const target = document.getElementById(tab.dataset.tab);
        if (target) target.classList.remove('hidden');
      });
    });
    const typeSig = document.getElementById('type-sig-input');
    const typePreview = document.getElementById('sig-type-preview');
    if (typeSig && typePreview) typeSig.addEventListener('input', () => {
      typePreview.textContent = typeSig.value || 'Signature Preview';
    });
    const passwordBtn = document.getElementById('btn-submit-password');
    if (passwordBtn) passwordBtn.addEventListener('click', () => {
      const input = document.getElementById('pdf-password-input');
      const password = input.value;
      if (!password || !state._passwordCallback) {
        showToast('Enter the PDF password', 'warning'); return;
      }
      state._passwordCallback(password);
      state._passwordCallback = null;
      input.value = '';
      closeModal('modal-password');
    });
    const aiBtn = document.getElementById('btn-ai-config');
    if (aiBtn) aiBtn.addEventListener('click', () => showToast('AI features are not connected. Add your own local/API proxy to enable them.', 'info'));

    // Ensure Select is not only visually active but fully initialized before the
    // first PDF is opened. This enables mobile pinch-zoom/selection immediately.
    setTool('select');
  }

  // TOOL SETTING
  function setTool(toolName) {
    state.currentTool = toolName;
    DOM.toolBtns.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tool === toolName);
    });

    if (toolName === 'pan') {
      DOM.annotCanvas.style.pointerEvents = 'none';
      DOM.annotCanvas.style.touchAction = 'none';
      DOM.canvasScrollContainer.style.touchAction = 'none';
      DOM.canvasScrollContainer.style.cursor = 'grab';
    } else {
      DOM.annotCanvas.style.pointerEvents = 'auto';
      DOM.annotCanvas.style.touchAction = (toolName === 'select') ? 'auto' : 'none';
      DOM.canvasScrollContainer.style.touchAction = 'auto';
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

      // Parse with PDF.js. The password callback keeps encrypted PDFs usable.
      const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer.slice(0)) });
      loadingTask.onPassword = (callback, reason) => {
        state._passwordCallback = callback;
        state._passwordReason = reason;
        openModal('modal-password');
        const input = document.getElementById('pdf-password-input');
        if (input) setTimeout(() => input.focus(), 50);
      };
      state._loadingTask = loadingTask;
      state.pdfDoc = await loadingTask.promise;
      
      // Parse with pdf-lib for modification
      state.pdfLibDoc = await PDFLib.PDFDocument.load(arrayBuffer, { ignoreEncryption: true });

      state.totalPages = state.pdfDoc.numPages;
      state.currentPage = 1;
      state.annotations = {};
      state.overlayElements = {};
      state.pageRotations = {};
      state.history = [];
      state.redoStack = [];

      DOM.welcomeScreen.classList.add('hidden');
      DOM.editorLayout.classList.remove('hidden');
      DOM.btnExport.disabled = false;

      DOM.totalPagesCount.textContent = state.totalPages;
      DOM.currentPageInput.max = state.totalPages;
      DOM.pageCountBadge.textContent = state.totalPages;

      if (window.matchMedia('(max-width: 768px)').matches) {
        state.zoomScale = await calculateFitScale('width');
        DOM.zoomSelect.value = state.zoomScale.toString();
      }
      setTool('select');
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
      state.pageRotations = {};
      state.history = [];
      state.redoStack = [];

      DOM.welcomeScreen.classList.add('hidden');
      DOM.editorLayout.classList.remove('hidden');
      DOM.btnExport.disabled = false;

      DOM.totalPagesCount.textContent = 1;
      DOM.pageCountBadge.textContent = 1;

      if (window.matchMedia('(max-width: 768px)').matches) {
        state.zoomScale = await calculateFitScale('width');
        DOM.zoomSelect.value = state.zoomScale.toString();
      }
      setTool('select');
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
    document.querySelectorAll('.thumb-item').forEach(el => {
      el.classList.toggle('selected', Number(el.dataset.page) === pageNum);
    });

    const page = await state.pdfDoc.getPage(pageNum);
    // PDF.js honors the page's native /Rotate value.
    const viewport = page.getViewport({ scale: state.zoomScale, rotation: page.rotate || 0 });

    // Render at device-pixel resolution so mobile screens are not blurry.
    // Keep CSS dimensions at the logical PDF size so annotations/overlays remain aligned.
    const deviceDpr = window.devicePixelRatio || 1;
    // Keep v7's stable rendering pipeline, but render above CSS resolution on
    // desktop too so PDF text does not look soft on normal-DPI monitors.
    const dpr = Math.min(Math.max(deviceDpr, 1.5), 2.5);
    const canvas = DOM.pdfCanvas;
    const ctx = canvas.getContext('2d', { alpha: false });
    canvas.width = Math.max(1, Math.round(viewport.width * dpr));
    canvas.height = Math.max(1, Math.round(viewport.height * dpr));
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // Annotation canvas uses the same high-DPI backing store while drawing in logical pixels.
    const annot = DOM.annotCanvas;
    annot.width = Math.max(1, Math.round(viewport.width * dpr));
    annot.height = Math.max(1, Math.round(viewport.height * dpr));
    annot.style.width = `${viewport.width}px`;
    annot.style.height = `${viewport.height}px`;
    const annotCtx = annot.getContext('2d');
    annotCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

    DOM.pageWrapper.style.width = `${viewport.width}px`;
    DOM.pageWrapper.style.height = `${viewport.height}px`;

    const renderContext = {
      canvasContext: ctx,
      viewport: viewport,
      transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null
    };

    await page.render(renderContext).promise;
    // page.render() can reset the PDF canvas transform; restore the annotation transform.
    annotCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
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
      
      thumbItem.draggable = true;
      thumbItem.addEventListener('click', () => {
        document.querySelectorAll('.thumb-item').forEach(el => el.classList.remove('selected'));
        thumbItem.classList.add('selected');
        renderPage(i);
      });
      thumbItem.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', String(i)); e.dataTransfer.effectAllowed = 'move'; });
      thumbItem.addEventListener('dragover', e => { e.preventDefault(); thumbItem.classList.add('drag-over'); });
      thumbItem.addEventListener('dragleave', () => thumbItem.classList.remove('drag-over'));
      thumbItem.addEventListener('drop', async e => {
        e.preventDefault(); thumbItem.classList.remove('drag-over');
        const from = Number(e.dataTransfer.getData('text/plain'));
        if (from && from !== i) await reorderPage(from, i);
      });

      DOM.thumbnailContainer.appendChild(thumbItem);
    }
  }

  // ANNOTATION ENGINE & CANVAS DRAWING
  function initAnnotationEngine() {
    const canvas = DOM.annotCanvas;
    const ctx = canvas.getContext('2d');

    canvas.addEventListener('pointerdown', (e) => {
      if (state.currentTool === 'select' || state.currentTool === 'pan') return;
      isDrawing = true;
      try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      if (state.currentTool === 'draw' || state.currentTool === 'highlight') {
        currentPath = [{ x, y }];
      } else if (state.currentTool === 'text') {
        createTextOverlay(x, y);
        isDrawing = false;
      } else if (['rectangle', 'circle', 'line', 'arrow', 'whiteout'].includes(state.currentTool)) {
        currentPath = [{ x, y }, { x, y }];
      }
    });

    canvas.addEventListener('pointermove', (e) => {
      if (!isDrawing) return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      if (state.currentTool === 'draw' || state.currentTool === 'highlight') {
        currentPath.push({ x, y });
        redrawAnnotations();
        drawPath(ctx, currentPath, state.activeColor, state.strokeWidth, state.currentTool === 'highlight' ? 0.4 : state.opacity);
      } else if (['rectangle', 'circle', 'line', 'arrow', 'whiteout'].includes(state.currentTool)) {
        currentPath[1] = { x, y };
        redrawAnnotations();
        drawShapePreview(ctx, currentPath[0], currentPath[1], state.currentTool);
      }
    });

    canvas.addEventListener('pointerup', (e) => {
      if (!isDrawing) return;
      try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
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
    } else if (tool === 'line' || tool === 'arrow') {
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
      if (tool === 'arrow') {
        const angle = Math.atan2(end.y - start.y, end.x - start.x);
        const head = Math.max(10, width * 5);
        const a1 = angle - Math.PI / 7;
        const a2 = angle + Math.PI / 7;
        ctx.beginPath();
        ctx.moveTo(end.x, end.y);
        ctx.lineTo(end.x - head * Math.cos(a1), end.y - head * Math.sin(a1));
        ctx.moveTo(end.x, end.y);
        ctx.lineTo(end.x - head * Math.cos(a2), end.y - head * Math.sin(a2));
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // OVERLAY ELEMENTS (TEXT, STAMPS, SIGNATURES, IMAGES)
  function createTextOverlay(x, y, initialText = 'Double click to edit text') {
    const el = document.createElement('div');
    el.className = 'overlay-element selected';
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    setOverlayLogicalPosition(el, x, y);

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
    setTool('select');
    textInput.focus();
    try { document.execCommand('selectAll', false, null); } catch (_) {}
  }

  function addStampOverlay() {
    if (!state.pdfDoc) return;
    const el = document.createElement('div');
    el.className = 'overlay-element selected';
    el.style.left = '100px';
    el.style.top = '100px';
    setOverlayLogicalPosition(el, 100, 100);
    el.innerHTML = `<svg viewBox="0 0 32 32" width="56" height="56" fill="none" stroke="${state.activeColor}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 17 L12 24 L27 7"/></svg>`;
    
    DOM.overlayContainer.appendChild(el);
    makeElementDraggable(el);
    selectElement(el);

    if (!state.overlayElements[state.currentPage]) state.overlayElements[state.currentPage] = [];
    state.overlayElements[state.currentPage].push(el);
    saveStateToHistory();
    setTool('select');
  }

  function handleImageUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const img = document.createElement('img');
      img.src = evt.target.result;
      img.style.display = 'block';
      img.style.width = '200px';
      img.style.height = 'auto';
      img.style.maxWidth = 'none';

      const el = document.createElement('div');
      el.className = 'overlay-element selected image-overlay';
      el.style.left = '100px';
      el.style.top = '100px';
      setOverlayLogicalPosition(el, 100, 100);
      el.appendChild(img);
      DOM.overlayContainer.appendChild(el);
      const finalizeImage = () => {
        const naturalW = img.naturalWidth || 200;
        const naturalH = img.naturalHeight || 100;
        const displayW = 200;
        const displayH = Math.max(30, displayW * naturalH / Math.max(1, naturalW));
        el.style.width = `${displayW}px`; el.style.height = `${displayH}px`;
        el.dataset.pdfW = String(displayW / state.zoomScale);
        el.dataset.pdfH = String(displayH / state.zoomScale);
        addResizeHandle(el);
        renderOverlayElements();
      };
      if (img.complete) finalizeImage(); else img.onload = finalizeImage;
      makeElementDraggable(el);
      selectElement(el);

      if (!state.overlayElements[state.currentPage]) state.overlayElements[state.currentPage] = [];
      state.overlayElements[state.currentPage].push(el);
      saveStateToHistory();
      showToast('Image inserted onto canvas', 'success');
    };
    reader.readAsDataURL(file);
  }

  function setOverlayLogicalPosition(el, x, y) {
    el.dataset.pdfX = String(x / state.zoomScale);
    el.dataset.pdfY = String(y / state.zoomScale);
  }

  function addResizeHandle(el) {
    if (!el || el.querySelector('.resize-handle') || !el.querySelector('img')) return;
    const handle = document.createElement('span');
    handle.className = 'resize-handle';
    handle.title = 'Drag to resize';
    handle.onpointerdown = (e) => {
      if (state.currentTool !== 'select') return;
      e.preventDefault(); e.stopPropagation(); selectElement(el);
      const startX = e.clientX, startW = el.offsetWidth || 180, startH = el.offsetHeight || 100;
      const ratio = startH / Math.max(1, startW);
      const move = ev => {
        const w = Math.max(30, startW + ev.clientX - startX);
        const h = Math.max(20, w * ratio);
        el.style.width = `${w}px`; el.style.height = `${h}px`;
        el.dataset.pdfW = String(w / state.zoomScale);
        el.dataset.pdfH = String(h / state.zoomScale);
        const img = el.querySelector('img');
        if (img) { img.style.width = '100%'; img.style.height = '100%'; img.style.maxWidth = 'none'; }
      };
      const up = () => { document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up); saveStateToHistory(); };
      document.addEventListener('pointermove', move); document.addEventListener('pointerup', up);
    };
    el.appendChild(handle);
  }

  function removeResizeHandles(root) { root.querySelectorAll('.resize-handle').forEach(h => h.remove()); }

  function renderOverlayElements() {
    DOM.overlayContainer.innerHTML = '';
    const elements = state.overlayElements[state.currentPage] || [];
    elements.forEach(el => {
      const x = parseFloat(el.dataset.pdfX);
      const y = parseFloat(el.dataset.pdfY);
      if (Number.isFinite(x)) el.style.left = `${x * state.zoomScale}px`;
      if (Number.isFinite(y)) el.style.top = `${y * state.zoomScale}px`;
      const w = parseFloat(el.dataset.pdfW), h = parseFloat(el.dataset.pdfH);
      if (Number.isFinite(w)) el.style.width = `${w * state.zoomScale}px`;
      if (Number.isFinite(h)) el.style.height = `${h * state.zoomScale}px`;
      DOM.overlayContainer.appendChild(el);
      addResizeHandle(el);
    });
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
    if (!el) return;
    let dragging = false, startX = 0, startY = 0, startLeft = 0, startTop = 0;
    el.onpointerdown = (e) => {
      if (state.currentTool !== 'select' || e.target.closest('.resize-handle')) return;
      // Do not drag while typing in a text box.
      if (e.target.isContentEditable) return;
      dragging = true;
      selectElement(el);
      e.preventDefault(); e.stopPropagation();
      startX = e.clientX; startY = e.clientY;
      startLeft = el.offsetLeft; startTop = el.offsetTop;
      try { el.setPointerCapture(e.pointerId); } catch (_) {}
    };
    el.onpointermove = (e) => {
      if (!dragging) return;
      const dx = e.clientX - startX, dy = e.clientY - startY;
      el.style.left = `${Math.max(0, startLeft + dx)}px`;
      el.style.top = `${Math.max(0, startTop + dy)}px`;
    };
    el.onpointerup = (e) => {
      if (!dragging) return;
      dragging = false;
      try { el.releasePointerCapture(e.pointerId); } catch (_) {}
      setOverlayLogicalPosition(el, el.offsetLeft, el.offsetTop);
      saveStateToHistory();
    };
    el.onpointercancel = () => { dragging = false; };
  }

  // SEARCH
  function toggleSearch() {
    const bar = document.getElementById('search-bar');
    bar.classList.toggle('hidden');
    if (!bar.classList.contains('hidden')) {
      const input = document.getElementById('search-input');
      input.focus();
      performSearch();
    }
  }

  async function performSearch() {
    const q = document.getElementById('search-input').value.trim().toLowerCase();
    state.searchResults = [];
    state.searchIndex = -1;
    if (!q || !state.pdfDoc) {
      document.getElementById('search-count').textContent = '0 / 0';
      return;
    }
    for (let i = 1; i <= state.totalPages; i++) {
      try {
        const page = await state.pdfDoc.getPage(i);
        const content = await page.getTextContent();
        const text = content.items.map(item => item.str || '').join(' ').toLowerCase();
        if (text.includes(q)) state.searchResults.push(i);
      } catch (_) {}
    }
    if (state.searchResults.length) {
      state.searchIndex = 0;
      await renderPage(state.searchResults[0]);
    }
    updateSearchCount();
  }

  function updateSearchCount() {
    const count = document.getElementById('search-count');
    count.textContent = state.searchResults.length
      ? `${state.searchIndex + 1} / ${state.searchResults.length}` : '0 / 0';
  }

  async function nextSearchResult() {
    if (!state.searchResults.length) return;
    state.searchIndex = (state.searchIndex + 1) % state.searchResults.length;
    await renderPage(state.searchResults[state.searchIndex]);
    updateSearchCount();
  }

  async function previousSearchResult() {
    if (!state.searchResults.length) return;
    state.searchIndex = (state.searchIndex - 1 + state.searchResults.length) % state.searchResults.length;
    await renderPage(state.searchResults[state.searchIndex]);
    updateSearchCount();
  }

  // ZOOM & PAGE NAVIGATION
  function calculateFitScale(mode = 'width') {
    if (!state.pdfDoc) return 1;
    const page = state.pdfDoc.getPage(state.currentPage);
    return page.then(p => {
      const base = p.getViewport({ scale: 1, rotation: p.rotate || 0 });
      const area = DOM.canvasScrollContainer.getBoundingClientRect();
      const horizontalPadding = window.matchMedia('(max-width: 768px)').matches ? 16 : 64;
      const verticalPadding = window.matchMedia('(max-width: 768px)').matches ? 80 : 64;
      const widthScale = Math.max(0.25, (area.width - horizontalPadding) / base.width);
      if (mode === 'width') return Math.min(widthScale, 3);
      const heightScale = Math.max(0.25, (area.height - verticalPadding) / base.height);
      return Math.min(Math.min(widthScale, heightScale), 3);
    });
  }

  async function applyFitScale(mode) {
    const scale = await calculateFitScale(mode);
    setZoom(scale);
  }

  function adjustZoom(delta) {
    setZoom(Math.min(Math.max(state.zoomScale + delta, 0.4), 3.0));
  }

  async function setZoom(newScale, focusClientX = null, focusClientY = null) {
    const oldScale = state.zoomScale || 1;
    const nextScale = Math.min(Math.max(Number(newScale) || 1, 0.4), 3.0);
    if (Math.abs(nextScale - oldScale) < 0.001) return;

    const area = DOM.canvasScrollContainer;
    const rect = area.getBoundingClientRect();
    let contentX = null, contentY = null;
    if (focusClientX != null && focusClientY != null) {
      contentX = area.scrollLeft + (focusClientX - rect.left);
      contentY = area.scrollTop + (focusClientY - rect.top);
    }

    state.zoomScale = nextScale;
    // Do not leave the select blank when pinch zoom produces a value between presets.
    const options = [...DOM.zoomSelect.options].filter(o => !['auto','page-fit','page-width'].includes(o.value));
    let closest = options.reduce((best, o) => Math.abs(parseFloat(o.value) - nextScale) < Math.abs(parseFloat(best.value) - nextScale) ? o : best, options[0]);
    if (closest && Math.abs(parseFloat(closest.value) - nextScale) < 0.08) DOM.zoomSelect.value = closest.value;
    else DOM.zoomSelect.value = 'auto';

    await renderPage(state.currentPage);
    if (contentX != null && contentY != null) {
      const ratio = nextScale / oldScale;
      requestAnimationFrame(() => {
        area.scrollLeft = Math.max(0, contentX * ratio - (focusClientX - rect.left));
        area.scrollTop = Math.max(0, contentY * ratio - (focusClientY - rect.top));
      });
    }
  }

  function changePage(delta) {
    const target = state.currentPage + delta;
    if (target >= 1 && target <= state.totalPages) {
      renderPage(target);
    }
  }

  // UNDO / REDO SYSTEM
  function serializeOverlays() {
    const result = {};
    Object.keys(state.overlayElements).forEach(page => {
      result[page] = (state.overlayElements[page] || []).map(el => { const c = el.cloneNode(true); removeResizeHandles(c); return c.outerHTML; });
    });
    return result;
  }

  function restoreOverlays(serialized) {
    state.overlayElements = {};
    Object.keys(serialized || {}).forEach(page => {
      state.overlayElements[page] = (serialized[page] || []).map(html => {
        const temp = document.createElement('div');
        temp.innerHTML = html;
        const el = temp.firstElementChild;
        if (!el) return null;
        makeElementDraggable(el);
        addResizeHandle(el);
        el.addEventListener('click', e => { e.stopPropagation(); selectElement(el); });
        return el;
      }).filter(Boolean);
    });
    renderOverlayElements();
    selectElement(null);
  }

  function saveStateToHistory() {
    state.history.push({
      pdfBytes: state.pdfBytes ? Array.from(new Uint8Array(state.pdfBytes)) : null,
      annotations: JSON.parse(JSON.stringify(state.annotations)),
      overlays: serializeOverlays(),
      rotations: JSON.parse(JSON.stringify(state.pageRotations))
    });
    if (state.history.length > 50) state.history.shift();
    state.redoStack = [];
    updateHistoryButtons();
  }

  async function restoreHistoryState(snapshot) {
    state.annotations = JSON.parse(JSON.stringify(snapshot.annotations || {}));
    state.pageRotations = JSON.parse(JSON.stringify(snapshot.rotations || {}));
    restoreOverlays(snapshot.overlays || {});
    if (snapshot.pdfBytes) {
      state.pdfBytes = new Uint8Array(snapshot.pdfBytes).buffer;
      state.pdfLibDoc = await PDFLib.PDFDocument.load(state.pdfBytes, { ignoreEncryption: true });
      state.pdfDoc = await pdfjsLib.getDocument({ data: new Uint8Array(state.pdfBytes.slice(0)) }).promise;
      state.totalPages = state.pdfDoc.numPages;
      DOM.totalPagesCount.textContent = state.totalPages;
      DOM.pageCountBadge.textContent = state.totalPages;
      DOM.currentPageInput.max = state.totalPages;
    }
    await renderThumbnails();
    await renderPage(state.currentPage);
  }

  function undo() {
    if (state.history.length <= 1) return;
    state.redoStack.push(state.history.pop());
    restoreHistoryState(state.history[state.history.length - 1]);
    showToast('Action undone', 'info');
    updateHistoryButtons();
  }

  function redo() {
    if (state.redoStack.length === 0) return;
    const nextState = state.redoStack.pop();
    state.history.push(nextState);
    restoreHistoryState(nextState);
    showToast('Action redone', 'info');
    updateHistoryButtons();
  }

  function updateHistoryButtons() {
    DOM.btnUndo.disabled = state.history.length <= 1;
    DOM.btnRedo.disabled = state.redoStack.length === 0;
  }

  // EXPORT ENGINE — writes every annotation and overlay into the PDF
  function hexToRgb(hex) {
    const n = parseInt(String(hex || '#000000').replace('#', ''), 16);
    return PDFLib.rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
  }

  function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }

  async function elementToPng(el) {
    const text = el.querySelector('.overlay-text');
    if (text) {
      const rect = text.getBoundingClientRect();
      const w = Math.max(80, Math.ceil(rect.width + 12));
      const h = Math.max(30, Math.ceil(rect.height + 12));
      const c = document.createElement('canvas');
      c.width = w * 2; c.height = h * 2;
      const ctx = c.getContext('2d');
      ctx.scale(2, 2);
      const cs = getComputedStyle(text);
      ctx.globalAlpha = parseFloat(cs.opacity) || 1;
      ctx.fillStyle = cs.color || '#000';
      ctx.font = `${cs.fontStyle || 'normal'} ${cs.fontWeight || '400'} ${cs.fontSize || '16px'} ${cs.fontFamily || 'sans-serif'}`;
      ctx.textBaseline = 'top';
      const lines = String(text.innerText || text.textContent || '').split(/\n/);
      const lineHeight = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2 || 19;
      lines.forEach((line, i) => ctx.fillText(line, 6, 6 + i * lineHeight));
      return { dataUrl: c.toDataURL('image/png'), width: w, height: h };
    }

    const img = el.querySelector('img');
    const svg = el.querySelector('svg');
    let source = img;
    let revoke = null;
    if (!source && svg) {
      const svgText = new XMLSerializer().serializeToString(svg);
      const blob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      revoke = () => URL.revokeObjectURL(url);
      source = new Image();
      source.src = url;
      await new Promise((resolve, reject) => {
        source.onload = resolve; source.onerror = reject;
      });
    }
    if (!source) return null;
    if (source.complete === false) {
      await new Promise((resolve, reject) => { source.onload = resolve; source.onerror = reject; });
    }
    const w = Math.max(1, Math.ceil(source.naturalWidth || source.width || el.offsetWidth || 100));
    const h = Math.max(1, Math.ceil(source.naturalHeight || source.height || el.offsetHeight || 100));
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d').drawImage(source, 0, 0, w, h);
    if (revoke) revoke();
    return { dataUrl: c.toDataURL('image/png'), width: w, height: h };
  }

  function dataUrlToBytes(dataUrl) {
    const b64 = dataUrl.split(',')[1];
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  function pdfPoint(page, x, y, scale) {
    const { height } = page.getSize();
    return { x: x / scale, y: height - y / scale };
  }

  async function burnInAnnotations(pdfDoc, pageNum, page, scale) {
    const items = state.annotations[pageNum] || [];
    const { height } = page.getSize();

    for (const item of items) {
      if (!item.path || item.path.length < 2) continue;
      const a = pdfPoint(page, item.path[0].x, item.path[0].y, scale);
      const b = pdfPoint(page, item.path[1].x, item.path[1].y, scale);
      const opacity = clamp(item.opacity == null ? 1 : item.opacity, 0, 1);
      const color = hexToRgb(item.tool === 'whiteout' ? '#FFFFFF' : item.color);

      if (item.tool === 'draw' || item.tool === 'highlight') {
        const path = item.path.map(p => pdfPoint(page, p.x, p.y, scale));
        for (let j = 1; j < path.length; j++) {
          page.drawLine({
            start: path[j - 1], end: path[j],
            thickness: Math.max(0.5, item.width / scale),
            color, opacity,
          });
        }
      } else if (item.tool === 'rectangle') {
        const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
        page.drawRectangle({
          x, y, width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y),
          borderColor: color, borderWidth: Math.max(0.5, item.width / scale), opacity
        });
      } else if (item.tool === 'circle') {
        const x = (a.x + b.x) / 2, y = (a.y + b.y) / 2;
        page.drawEllipse({
          x, y, xScale: Math.abs(b.x - a.x) / 2, yScale: Math.abs(b.y - a.y) / 2,
          borderColor: color, borderWidth: Math.max(0.5, item.width / scale), opacity
        });
      } else if (item.tool === 'line') {
        page.drawLine({
          start: a, end: b,
          thickness: Math.max(0.5, item.width / scale), color, opacity
        });
        // Arrow head
        const angle = Math.atan2(b.y - a.y, b.x - a.x);
        const len = 8 / scale;
        const left = { x: b.x - len * Math.cos(angle - Math.PI / 6), y: b.y - len * Math.sin(angle - Math.PI / 6) };
        const right = { x: b.x - len * Math.cos(angle + Math.PI / 6), y: b.y - len * Math.sin(angle + Math.PI / 6) };
        page.drawLine({ start: b, end: left, thickness: Math.max(0.5, item.width / scale), color, opacity });
        page.drawLine({ start: b, end: right, thickness: Math.max(0.5, item.width / scale), color, opacity });
      } else if (item.tool === 'whiteout') {
        const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
        page.drawRectangle({
          x, y, width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y),
          color: PDFLib.rgb(1, 1, 1), opacity: 1
        });
      }
    }

    // Overlay DOM objects (text, image, signature and stamp)
    const overlays = state.overlayElements[pageNum] || [];
    const baseViewport = await state.pdfDoc.getPage(pageNum).then(p => p.getViewport({ scale: 1, rotation: 0 }));
    const visualScale = baseViewport.width ? (baseViewport.width / page.getSize().width) : 1;
    for (const el of overlays) {
      const png = await elementToPng(el);
      if (!png) continue;
      const embedded = await pdfDoc.embedPng(dataUrlToBytes(png.dataUrl));
      const logicalX = Number.isFinite(parseFloat(el.dataset.pdfX)) ? parseFloat(el.dataset.pdfX) : (parseFloat(el.style.left) || 0) / state.zoomScale;
      const logicalY = Number.isFinite(parseFloat(el.dataset.pdfY)) ? parseFloat(el.dataset.pdfY) : (parseFloat(el.style.top) || 0) / state.zoomScale;
      const widthPdf = Number.isFinite(parseFloat(el.dataset.pdfW)) ? parseFloat(el.dataset.pdfW) : (el.offsetWidth || png.width) / state.zoomScale;
      const heightPdf = Number.isFinite(parseFloat(el.dataset.pdfH)) ? parseFloat(el.dataset.pdfH) : (el.offsetHeight || png.height) / state.zoomScale;
      page.drawImage(embedded, {
        x: logicalX / visualScale,
        y: height - (logicalY + heightPdf),
        width: widthPdf,
        height: heightPdf,
        opacity: 1
      });
    }
  }

  async function buildEditedPdfBytes() {
    if (!state.pdfLibDoc) throw new Error('No PDF loaded');
    const pdfDoc = await PDFLib.PDFDocument.load(state.pdfBytes, { ignoreEncryption: true });
    const pages = pdfDoc.getPages();
    for (let i = 1; i <= pages.length; i++) {
      const page = pages[i - 1];
      const pdfSize = page.getSize();
      const renderPageObj = await state.pdfDoc.getPage(i);
      const viewport = renderPageObj.getViewport({ scale: state.zoomScale, rotation: 0 });
      const scale = viewport.width / pdfSize.width;
      await burnInAnnotations(pdfDoc, i, page, scale);
    }
    return await pdfDoc.save();
  }

  function downloadBytes(bytes, filename, mime = 'application/pdf') {
    const blob = new Blob([bytes], { type: mime });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    setTimeout(() => { URL.revokeObjectURL(link.href); link.remove(); }, 1500);
  }

  async function exportPDF() {
    if (!state.pdfLibDoc) {
      showToast('Open or create a PDF first', 'warning');
      return;
    }
    try {
      DOM.statusText.textContent = 'Exporting PDF...';
      const modifiedBytes = await buildEditedPdfBytes();
      downloadBytes(modifiedBytes, `SSPDF-Edited-${state.fileName.replace(/\.pdf$/i, '')}.pdf`);
      showToast('Exported PDF successfully!', 'success');
      DOM.statusText.textContent = 'Ready';
    } catch (err) {
      console.error('Export error:', err);
      showToast(`Export failed: ${err.message || 'unknown error'}`, 'danger');
      DOM.statusText.textContent = 'Export error';
    }
  }

  // IMAGE -> PDF
  async function handleImagesToPDF(e) {
    const files = Array.from(e.target.files || []).filter(f => /^image\/(png|jpeg|webp)$/i.test(f.type));
    e.target.value = '';
    if (!files.length) return;
    state.imagePdfFiles.push(...files);
    renderImagePdfList();
    const btn = document.getElementById('btn-create-image-pdf');
    if (btn) btn.disabled = !state.imagePdfFiles.length;
  }

  function renderImagePdfList() {
    const list = document.getElementById('image-pdf-list');
    if (!list) return;
    if (!state.imagePdfFiles.length) { list.innerHTML = '<div class="modal-desc">No images selected.</div>'; return; }
    list.innerHTML = state.imagePdfFiles.map((f,i) => `<div class="image-file-row" draggable="true" data-index="${i}"><span class="drag-handle">☰</span><span class="file-name">${escapeHtml(f.name)}</span><button type="button" data-remove-image="${i}" title="Remove">×</button></div>`).join('');
    list.querySelectorAll('[data-remove-image]').forEach(b => b.addEventListener('click', () => { state.imagePdfFiles.splice(Number(b.dataset.removeImage),1); renderImagePdfList(); document.getElementById('btn-create-image-pdf').disabled=!state.imagePdfFiles.length; }));
    let dragIndex = null;
    list.querySelectorAll('.image-file-row').forEach(row => {
      row.addEventListener('dragstart', () => { dragIndex=Number(row.dataset.index); row.classList.add('dragging'); });
      row.addEventListener('dragend', () => { row.classList.remove('dragging'); dragIndex=null; });
      row.addEventListener('dragover', e => e.preventDefault());
      row.addEventListener('drop', e => { e.preventDefault(); const to=Number(row.dataset.index); if(dragIndex===null || dragIndex===to) return; const [item]=state.imagePdfFiles.splice(dragIndex,1); state.imagePdfFiles.splice(to,0,item); renderImagePdfList(); });
    });
  }

  function escapeHtml(v) { return String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  async function createImagesPDF() {
    const files = state.imagePdfFiles.slice();
    if (!files.length) return;
    const btn=document.getElementById('btn-create-image-pdf');
    try {
      btn.disabled=true; DOM.statusText.textContent='Creating PDF from images...';
      const out=await PDFLib.PDFDocument.create();
      const sizeKey=document.getElementById('image-pdf-size').value;
      const orientation=document.getElementById('image-pdf-orientation').value;
      const margin=Number(document.getElementById('image-pdf-margin').value)||0;
      const fit=document.getElementById('image-pdf-fit').value;
      const sizes={a4:[595.28,841.89],letter:[612,792]};
      for(const file of files){
        const bytes=new Uint8Array(await file.arrayBuffer());
        let image;
        if(file.type==='image/jpeg') image=await out.embedJpg(bytes);
        else if(file.type==='image/png') image=await out.embedPng(bytes);
        else { const dataUrl=await fileToDataURL(file); image=await out.embedPng(dataUrlToBytes(await convertDataUrlToPng(dataUrl))); }
        const dims=image.scale(1);
        let pageW,pageH;
        if(sizeKey==='original'){ pageW=dims.width+margin*2; pageH=dims.height+margin*2; }
        else { [pageW,pageH]=sizes[sizeKey]||sizes.a4; }
        if(orientation==='portrait'){ if(pageW>pageH)[pageW,pageH]=[pageH,pageW]; }
        else if(orientation==='landscape'){ if(pageH>pageW)[pageW,pageH]=[pageH,pageW]; }
        else if(orientation==='auto' && sizeKey!=='original'){ if(dims.width>dims.height && pageH>pageW)[pageW,pageH]=[pageH,pageW]; }
        const availW=Math.max(1,pageW-margin*2), availH=Math.max(1,pageH-margin*2);
        let scaleX=availW/dims.width, scaleY=availH/dims.height;
        let scale=fit==='cover'?Math.max(scaleX,scaleY):fit==='original'?1:Math.min(scaleX,scaleY);
        const w=dims.width*scale,h=dims.height*scale;
        const page=out.addPage([pageW,pageH]);
        page.drawImage(image,{x:(pageW-w)/2,y:(pageH-h)/2,width:w,height:h});
      }
      const bytes=await out.save(); downloadBytes(bytes,'SSPDF-Images.pdf'); closeModal('modal-image-to-pdf'); showToast(`${files.length} image(s) converted to PDF`,'success'); DOM.statusText.textContent='Ready';
    } catch(err){ console.error(err); showToast('Image to PDF failed: '+(err.message||''),'danger'); DOM.statusText.textContent='Error'; }
    finally{ btn.disabled=false; }
  }

  function fileToDataURL(file) {
    return new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(file); });
  }
  function convertDataUrlToPng(dataUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image(); img.onload = () => { const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; c.getContext('2d').drawImage(img, 0, 0); resolve(c.toDataURL('image/png')); }; img.onerror = reject; img.src = dataUrl;
    });
  }

  // COMPRESS PDF
  async function compressPDF() {
    if (!state.pdfDoc) return;
    const btn=document.getElementById('btn-execute-compress');
    try {
      btn.disabled=true; DOM.statusText.textContent='Compressing PDF...';
      const level=document.getElementById('compress-level').value;
      const textMode=document.getElementById('compress-text-mode').value;
      const settings={low:{scale:1.35,quality:.78},medium:{scale:1.10,quality:.62},high:{scale:.82,quality:.46}}[level];
      const out=await PDFLib.PDFDocument.create();
      let textFont=null;
      if(textMode==='selectable' && typeof fontkit!=='undefined'){
        try {
          out.registerFontkit(fontkit);
          const fb=await fetch('https://cdn.jsdelivr.net/gh/Darksorrow/pdfmake-font-vfs@main/fonts/NotoSansDevanagari-Regular.ttf').then(r=>{if(!r.ok) throw new Error('font');return r.arrayBuffer();});
          textFont=await out.embedFont(fb,{subset:true});
        } catch(e){ console.warn('Selectable text font unavailable',e); }
      }
      for(let i=1;i<=state.totalPages;i++){
        const src=await state.pdfDoc.getPage(i); const base=src.getViewport({scale:1,rotation:0}); const vp=src.getViewport({scale:settings.scale,rotation:0});
        const c=document.createElement('canvas'); c.width=Math.ceil(vp.width); c.height=Math.ceil(vp.height);
        await src.render({canvasContext:c.getContext('2d',{alpha:false}),viewport:vp}).promise;
        const image=await out.embedJpg(dataUrlToBytes(c.toDataURL('image/jpeg',settings.quality)));
        const page=out.addPage([base.width,base.height]); page.drawImage(image,{x:0,y:0,width:base.width,height:base.height});
        if(textMode==='selectable'){
          try {
            const content=await src.getTextContent();
            const font=textFont;
            for(const item of content.items||[]){
              const txt=String(item.str||'').trim(); if(!txt) continue;
              const tx=item.transform||[1,0,0,1,0,0]; const x=(tx[4]||0); const y=(tx[5]||0); const size=Math.max(5,Math.abs(tx[3]||tx[0]||10));
              if(!font) continue;
              page.drawText(txt,{x,y,size,font,color:PDFLib.rgb(1,1,1),opacity:.001,maxWidth:base.width});
            }
          } catch(e){ console.warn('Text layer copy failed on page '+i,e); }
        }
        c.width=c.height=1;
      }
      const bytes=await out.save({useObjectStreams:true});
      downloadBytes(bytes,`SSPDF-Compressed-${state.fileName.replace(/\.pdf$/i,'')}.pdf`);
      closeModal('modal-compress');
      showToast(textMode==='selectable'?'PDF compressed with a selectable/copyable text layer.':'PDF compressed successfully.','success'); DOM.statusText.textContent='Ready';
    } catch(err){ console.error(err); showToast('Compression failed: '+(err.message||''),'danger'); DOM.statusText.textContent='Compression error'; }
    finally{ btn.disabled=false; }
  }

  // OCR -> searchable/copyable PDF. Uses Tesseract.js in the browser.
  async function runOCR() {
    if (!state.pdfDoc || typeof Tesseract === 'undefined') { showToast('OCR engine is unavailable', 'danger'); return; }
    const btn=document.getElementById('btn-execute-ocr'), progress=document.getElementById('ocr-progress'), outText=document.getElementById('ocr-text-output');
    const copyBtn=document.getElementById('btn-copy-ocr'), txtBtn=document.getElementById('btn-download-ocr-txt');
    try {
      btn.disabled=true; copyBtn.classList.add('hidden'); txtBtn.classList.add('hidden'); outText.classList.add('hidden');
      const lang=document.getElementById('ocr-language').value; progress.textContent='Starting OCR engine...';
      const worker=await Tesseract.createWorker(lang,1,{logger:m=>{if(m.status) progress.textContent=`${m.status} ${m.progress?Math.round(m.progress*100)+'%':''}`;}});
      const out=await PDFLib.PDFDocument.create();
      let font=null;
      try {
        if(typeof fontkit!=='undefined'){
          out.registerFontkit(fontkit);
          const fontUrl='https://cdn.jsdelivr.net/gh/Darksorrow/pdfmake-font-vfs@main/fonts/NotoSansDevanagari-Regular.ttf';
          const fontBytes=await fetch(fontUrl).then(r=>{if(!r.ok) throw new Error('Font download failed'); return r.arrayBuffer();});
          font=await out.embedFont(fontBytes,{subset:true});
        }
      } catch(e){ console.warn('Devanagari font unavailable; using Helvetica for OCR layer.',e); }
      const allText=[];
      for(let i=1;i<=state.totalPages;i++){
        progress.textContent=`OCR page ${i} of ${state.totalPages}...`;
        const src=await state.pdfDoc.getPage(i); const base=src.getViewport({scale:1,rotation:0}); const scale=2; const vp=src.getViewport({scale});
        const c=document.createElement('canvas'); c.width=Math.ceil(vp.width); c.height=Math.ceil(vp.height);
        await src.render({canvasContext:c.getContext('2d'),viewport:vp}).promise;
        const result=await Tesseract.recognize(c,lang);
        allText.push(`--- Page ${i} ---\n${result.data.text||''}`);
        const page=out.addPage([base.width,base.height]);
        const img=await out.embedJpg(dataUrlToBytes(c.toDataURL('image/jpeg',0.86))); page.drawImage(img,{x:0,y:0,width:base.width,height:base.height});
        if(font && result.data && Array.isArray(result.data.words)){
          for(const word of result.data.words){
            const text=String(word.text||'').trim(); if(!text) continue; const box=word.bbox||{};
            const x=(box.x0||0)/scale, yTop=(box.y0||0)/scale; const h=Math.max(5,((box.y1||box.y0||0)-(box.y0||0))/scale); const size=Math.max(6,h*.82);
            try { page.drawText(text,{x,y:base.height-yTop-h,size,font,color:PDFLib.rgb(1,1,1),opacity:0.001}); } catch(_) {}
          }
        }
        c.width=c.height=1;
      }
      await worker.terminate();
      state.lastOcrText=allText.join('\n\n'); state.lastOcrBytes=await out.save({useObjectStreams:true}); state.lastOcrFileName=`SSPDF-OCR-${state.fileName.replace(/\.pdf$/i,'')}.pdf`;
      downloadBytes(state.lastOcrBytes,state.lastOcrFileName);
      outText.value=state.lastOcrText; outText.classList.remove('hidden'); copyBtn.classList.remove('hidden'); txtBtn.classList.remove('hidden');
      progress.textContent='OCR complete. The PDF contains a selectable/copyable OCR text layer.';
      showToast('OCR PDF created. Text can be selected/copied from the PDF or downloaded as TXT.','success'); DOM.statusText.textContent='Ready';
    } catch(err){ console.error(err); progress.textContent='OCR failed.'; showToast('OCR failed: '+(err.message||''),'danger'); DOM.statusText.textContent='OCR error'; }
    finally{ btn.disabled=false; }
  }

  // PAGE MANAGEMENT
  async function refreshPdfViewer() {
    const bytes = await state.pdfLibDoc.save();
    state.pdfBytes = bytes;
    state.pdfDoc = await pdfjsLib.getDocument({ data: new Uint8Array(bytes.slice(0)) }).promise;
    state.totalPages = state.pdfDoc.numPages;
    DOM.totalPagesCount.textContent = state.totalPages;
    DOM.pageCountBadge.textContent = state.totalPages;
    DOM.currentPageInput.max = state.totalPages;
    state.currentPage = clamp(state.currentPage, 1, state.totalPages);
    await renderThumbnails();
    await renderPage(state.currentPage);
  }

  async function rotateCurrentPage() {
    if (!state.pdfLibDoc) return;
    const page = state.pdfLibDoc.getPages()[state.currentPage - 1];
    page.setRotation(PDFLib.degrees((page.getRotation().angle + 90) % 360));
    state.pageRotations[state.currentPage] = (state.pageRotations[state.currentPage] || 0) + 90;
    await refreshPdfViewer();
    saveStateToHistory();
    showToast('Page rotated 90°', 'success');
  }

  async function deleteCurrentPage() {
    if (!state.pdfLibDoc || state.totalPages <= 1) {
      showToast('A PDF must contain at least one page', 'warning');
      return;
    }
    state.pdfLibDoc.removePage(state.currentPage - 1);
    delete state.annotations[state.currentPage];
    delete state.overlayElements[state.currentPage];
    delete state.pageRotations[state.currentPage];
    // Re-index per-page state after deletion
    const shift = obj => {
      const out = {};
      Object.keys(obj).forEach(k => {
        const n = Number(k);
        if (n < state.currentPage) out[n] = obj[k];
        else if (n > state.currentPage) out[n - 1] = obj[k];
      });
      return out;
    };
    state.annotations = shift(state.annotations);
    state.overlayElements = shift(state.overlayElements);
    state.pageRotations = shift(state.pageRotations);
    state.currentPage = Math.min(state.currentPage, state.totalPages - 1);
    await refreshPdfViewer();
    saveStateToHistory();
    showToast('Page deleted', 'success');
  }

  async function addBlankPage() {
    if (!state.pdfLibDoc) return;
    const insertAt = state.currentPage; // after current page
    // pdf-lib has no insertBlankPage; rebuild the document with the new page in order.
    const newDoc = await PDFLib.PDFDocument.create();
    const oldPages = state.pdfLibDoc.getPages();
    const copied = await newDoc.copyPages(state.pdfLibDoc, oldPages.map((_, i) => i));
    copied.forEach((p, i) => { if (i === insertAt) newDoc.addPage([595.28, 841.89]); newDoc.addPage(p); });
    if (insertAt >= copied.length) newDoc.addPage([595.28, 841.89]);
    state.pdfLibDoc = newDoc;
    state.currentPage = insertAt + 1;
    state.annotations = Object.fromEntries(Object.entries(state.annotations).map(([k,v]) => [Number(k) >= state.currentPage ? Number(k)+1 : Number(k), v]));
    state.overlayElements = Object.fromEntries(Object.entries(state.overlayElements).map(([k,v]) => [Number(k) >= state.currentPage ? Number(k)+1 : Number(k), v]));
    state.pageRotations = Object.fromEntries(Object.entries(state.pageRotations).map(([k,v]) => [Number(k) >= state.currentPage ? Number(k)+1 : Number(k), v]));
    await refreshPdfViewer();
    saveStateToHistory();
    showToast('Blank page added', 'success');
  }

  async function reorderPage(fromPage, toPage) {
    if (!state.pdfLibDoc || fromPage === toPage) return;
    try {
      const oldDoc = state.pdfLibDoc, count = oldDoc.getPageCount();
      const order = Array.from({length: count}, (_, i) => i);
      const moved = order.splice(fromPage - 1, 1)[0]; order.splice(toPage - 1, 0, moved);
      const newDoc = await PDFLib.PDFDocument.create();
      const copied = await newDoc.copyPages(oldDoc, order); copied.forEach(p => newDoc.addPage(p));
      state.pdfLibDoc = newDoc;
      state.annotations = reorderPageMap(state.annotations, fromPage, toPage);
      state.overlayElements = reorderPageMap(state.overlayElements, fromPage, toPage);
      state.pageRotations = reorderPageMap(state.pageRotations, fromPage, toPage);
      state.currentPage = toPage;
      await refreshPdfViewer(); saveStateToHistory(); showToast('Pages reordered', 'success');
    } catch (err) { console.error(err); showToast('Could not reorder pages', 'danger'); }
  }

  function reorderPageMap(obj, from, to) {
    const arr = []; for (let i = 1; i <= state.totalPages; i++) arr.push(obj[i]);
    const moved = arr.splice(from - 1, 1)[0]; arr.splice(to - 1, 0, moved);
    const out = {}; arr.forEach((v, i) => { if (v !== undefined) out[i + 1] = v; }); return out;
  }

  async function handleAddPdfToCurrent(e) {
    const files = Array.from(e.target.files || []).filter(f => f.type === 'application/pdf'); e.target.value = '';
    if (!files.length || !state.pdfLibDoc) return;
    try {
      const oldDoc = state.pdfLibDoc, insertAfter = state.currentPage;
      const newDoc = await PDFLib.PDFDocument.create();
      const base = await newDoc.copyPages(oldDoc, oldDoc.getPageIndices());
      let inserted = 0;
      for (let i = 0; i < base.length; i++) {
        newDoc.addPage(base[i]);
        if (i === insertAfter - 1) {
          for (const file of files) {
            const src = await PDFLib.PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
            const cp = await newDoc.copyPages(src, src.getPageIndices()); cp.forEach(p => newDoc.addPage(p)); inserted += cp.length;
          }
        }
      }
      state.pdfLibDoc = newDoc;
      state.annotations = shiftPageMapForInsert(state.annotations, insertAfter + 1, inserted);
      state.overlayElements = shiftPageMapForInsert(state.overlayElements, insertAfter + 1, inserted);
      state.pageRotations = shiftPageMapForInsert(state.pageRotations, insertAfter + 1, inserted);
      state.currentPage = Math.min(insertAfter + 1, newDoc.getPageCount());
      await refreshPdfViewer(); saveStateToHistory(); showToast(`${inserted} page(s) added after current page`, 'success');
    } catch (err) { console.error(err); showToast('Could not add PDF: ' + (err.message || ''), 'danger'); }
  }

  function shiftPageMapForInsert(obj, startPage, amount) {
    const out = {}; Object.keys(obj || {}).forEach(k => { const n = Number(k); out[n >= startPage ? n + amount : n] = obj[k]; }); return out;
  }

  // MERGE
  function handleMergeFiles(e) {
    const files = Array.from(e.target.files || []);
    files.forEach(file => {
      if (file.type === 'application/pdf') state.mergeFiles.push(file);
    });
    e.target.value = '';
    renderMergeList();
  }

  function renderMergeList() {
    const list = document.getElementById('merge-file-list');
    const btn = document.getElementById('btn-execute-merge');
    if (!list || !btn) return;
    list.innerHTML = '';
    if (!state.mergeFiles.length) {
      list.innerHTML = '<div class="empty-merge-state">No files added yet. Click below to append PDFs.</div>';
      btn.disabled = true;
      return;
    }
    state.mergeFiles.forEach((file, i) => {
      const row = document.createElement('div');
      row.className = 'merge-file-row';
      row.innerHTML = `<span>${i + 1}. ${file.name}</span><button type="button" class="sm-icon-btn danger" title="Remove">×</button>`;
      row.querySelector('button').addEventListener('click', () => {
        state.mergeFiles.splice(i, 1); renderMergeList();
      });
      list.appendChild(row);
    });
    btn.disabled = state.mergeFiles.length < 2;
  }

  async function executeMerge() {
    if (state.mergeFiles.length < 2) return;
    try {
      const merged = await PDFLib.PDFDocument.create();
      for (const file of state.mergeFiles) {
        const src = await PDFLib.PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
        const copied = await merged.copyPages(src, src.getPageIndices());
        copied.forEach(p => merged.addPage(p));
      }
      state.pdfLibDoc = merged;
      state.fileName = 'Merged.pdf';
      state.annotations = {};
      state.overlayElements = {};
      state.pageRotations = {};
      state.currentPage = 1;
      state.mergeFiles = [];
      await refreshPdfViewer();
      closeModal('modal-merge');
      saveStateToHistory();
      showToast('PDFs merged successfully', 'success');
    } catch (err) {
      console.error(err);
      showToast('Merge failed: ' + (err.message || ''), 'danger');
    }
  }

  function parsePageRanges(input, max) {
    const pages = new Set();
    String(input || '').split(',').map(s => s.trim()).filter(Boolean).forEach(part => {
      if (/^\d+$/.test(part)) {
        const n = Number(part); if (n >= 1 && n <= max) pages.add(n);
      } else if (/^\d+\s*-\s*\d+$/.test(part)) {
        let [a,b] = part.split('-').map(Number);
        if (a > b) [a,b] = [b,a];
        for (let n = a; n <= b; n++) if (n >= 1 && n <= max) pages.add(n);
      }
    });
    return [...pages].sort((a,b) => a-b);
  }

  async function executeSplit() {
    if (!state.pdfLibDoc) { showToast('Open a PDF first', 'warning'); return; }
    try {
      const mode = document.getElementById('split-mode-select').value;
      let indices = [];
      if (mode === 'all') indices = state.pdfLibDoc.getPageIndices();
      else indices = parsePageRanges(document.getElementById('split-range-input').value, state.totalPages).map(n => n - 1);
      if (!indices.length) { showToast('Enter a valid page range', 'warning'); return; }

      const zip = new JSZip();
      for (const idx of indices) {
        const out = await PDFLib.PDFDocument.create();
        const [p] = await out.copyPages(state.pdfLibDoc, [idx]);
        out.addPage(p);
        zip.file(`page-${idx + 1}.pdf`, await out.save());
      }
      const blob = await zip.generateAsync({ type: 'blob' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${state.fileName.replace(/\.pdf$/i, '')}-split.zip`;
      document.body.appendChild(link); link.click();
      setTimeout(() => { URL.revokeObjectURL(link.href); link.remove(); }, 1000);
      closeModal('modal-split');
      showToast('PDF split successfully', 'success');
    } catch (err) {
      console.error(err);
      showToast('Split failed: ' + (err.message || ''), 'danger');
    }
  }

  // SIGNATURE PAD MODAL ENGINE
  function initSignaturePad() {
    const canvas = document.getElementById('signature-pad');
    const ctx = canvas.getContext('2d');
    let sigDrawing = false;
    let sigColor = '#000000';

    canvas.addEventListener('pointerdown', (e) => {
      sigDrawing = true;
      ctx.beginPath();
      ctx.moveTo(e.offsetX, e.offsetY);
    });

    canvas.addEventListener('pointermove', (e) => {
      if (!sigDrawing) return;
      ctx.strokeStyle = sigColor;
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.lineTo(e.offsetX, e.offsetY);
      ctx.stroke();
    });

    canvas.addEventListener('pointerup', () => sigDrawing = false);
    canvas.addEventListener('pointercancel', () => sigDrawing = false);

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
      const activeTab = document.querySelector('#modal-signature .tab-btn.active')?.dataset.tab || 'tab-sig-draw';
      if (activeTab === 'tab-sig-upload') {
        const file = document.getElementById('sig-image-file').files[0];
        if (!file) { showToast('Choose a signature image first', 'warning'); return; }
        const reader = new FileReader();
        reader.onload = () => insertSignatureImage(reader.result);
        reader.readAsDataURL(file);
        return;
      }

      let dataUrl = canvas.toDataURL('image/png');
      if (activeTab === 'tab-sig-type') {
        const name = document.getElementById('type-sig-input').value.trim();
        if (!name) { showToast('Type your signature first', 'warning'); return; }
        const c = document.createElement('canvas');
        c.width = 700; c.height = 180;
        const cctx = c.getContext('2d');
        cctx.clearRect(0, 0, c.width, c.height);
        cctx.fillStyle = '#000';
        cctx.font = 'italic 64px "Brush Script MT", "Segoe Script", cursive';
        cctx.textBaseline = 'middle';
        cctx.fillText(name, 20, 90);
        dataUrl = c.toDataURL('image/png');
      }
      insertSignatureImage(dataUrl);
    });

    function insertSignatureImage(dataUrl) {
      const img = document.createElement('img');
      img.src = dataUrl;
      img.style.width = '160px';
      const el = document.createElement('div');
      el.className = 'overlay-element selected';
      el.style.left = '150px';
      el.style.top = '150px';
      setOverlayLogicalPosition(el, 150, 150);
      el.appendChild(img);
      el.dataset.pdfW = String(160 / state.zoomScale);
      el.dataset.pdfH = String(90 / state.zoomScale);
      DOM.overlayContainer.appendChild(el);
      makeElementDraggable(el);
      addResizeHandle(el);
      selectElement(el);
      if (!state.overlayElements[state.currentPage]) state.overlayElements[state.currentPage] = [];
      state.overlayElements[state.currentPage].push(el);
      closeModal('modal-signature');
      saveStateToHistory();
      showToast('Signature added to page', 'success');
    }
  }

  // KEYBOARD SHORTCUTS HANDLER
  function handleKeyboardShortcuts(e) {
    if (e.target.tagName === 'INPUT' || e.target.isContentEditable) return;

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') {
      e.preventDefault();
      DOM.hiddenFileInput.click();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      toggleSearch();
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
    } else if (e.key === '+' || e.key === '=') {
      adjustZoom(0.15);
    } else if (e.key === '-') {
      adjustZoom(-0.15);
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
