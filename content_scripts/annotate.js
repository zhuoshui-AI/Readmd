/**
 * Readmd Annotation Engine
 *
 * Provides freehand drawing, eraser, text notes, undo/redo,
 * and export to HTML / PDF on top of the Readmd reading overlay.
 *
 * Depends on html2canvas and jspdf (loaded via manifest content_scripts).
 */

const ANNOTATION_COLORS = [
  '#e74c3c', '#e67e22', '#f1c40f', '#2ecc71',
  '#3498db', '#9b59b6', '#2c3e50', '#ecf0f1'
];

const PEN_SIZES = [
  { label: 'S', value: 2 },
  { label: 'M', value: 4 },
  { label: 'L', value: 8 }
];

const MAX_UNDO = 50;

// ──────────────────────────────────
//  AnnotationEngine
// ──────────────────────────────────

class AnnotationEngine {
  constructor(overlay, contentContainer) {
    this.overlay = overlay;
    this.contentContainer = contentContainer;

    this.tool = 'pen';           // pen | eraser | text | none
    this.color = ANNOTATION_COLORS[0];
    this.lineWidth = PEN_SIZES[1].value;

    this.isDrawing = false;
    this.lastPoint = null;

    this.undoStack = [];
    this.redoStack = [];

    this.textNotes = [];         // { el, x, y, text }
    this.nextNoteId = 0;

    // Canvas mode state: 'dom' | 'canvas'
    this.mode = 'dom';
    this._enteringCanvasMode = false;
    this._canvasWrapper = null;
    this._contentCanvas = null;
    this._annotCanvas = null;
    this._canvasModeTextNotes = [];  // { x, y, text, color } for canvas mode
    this._textInputEl = null;

    this._setupDOM();
    this._bindEvents();
  }

  // ── DOM Setup ──────────────────

  _setupDOM() {
    // Layer that holds canvas + text notes
    this.layer = document.createElement('div');
    this.layer.id = 'readmd-annotation-layer';

    this.canvas = document.createElement('canvas');
    this.canvas.id = 'readmd-annotation-canvas';
    this.layer.appendChild(this.canvas);

    // Insert the layer into the overlay, positioned relative to content
    // We'll size it to match the content
    this.overlay.appendChild(this.layer);

    this._syncCanvasSize();
    this._createToolbar();
  }

  _createToolbar() {
    const toolbar = document.createElement('div');
    toolbar.id = 'readmd-annotate-toolbar';
    toolbar.classList.add('hidden'); // Start hidden — only shown when annotation is toggled
    toolbar.innerHTML = this._toolbarHTML();
    document.body.appendChild(toolbar);
    this.toolbar = toolbar;

    this._bindToolbarEvents();
  }

  _toolbarHTML() {
    const colorSwatches = ANNOTATION_COLORS
      .map(c => `<span class="annotate-color-swatch${c === this.color ? ' active' : ''}" data-color="${c}" style="background:${c}" data-tooltip="${c}"></span>`)
      .join('');

    const sizeBtns = PEN_SIZES
      .map(s => `<button class="annotate-size-btn${s.value === this.lineWidth ? ' active' : ''}" data-size="${s.value}" data-tooltip="${s.label}">${s.label}</button>`)
      .join('');

    return `
      <button class="annotate-tool-btn active" data-tool="pen" data-tooltip="Pen (A)">✏️</button>
      <button class="annotate-tool-btn" data-tool="eraser" data-tooltip="Eraser (E)">🧹</button>
      <button class="annotate-tool-btn" data-tool="text" data-tooltip="Text (T)">💬</button>
      <span class="annotate-separator"></span>
      <div class="annotate-colors">${colorSwatches}</div>
      <span class="annotate-separator"></span>
      <div class="annotate-sizes">${sizeBtns}</div>
      <span class="annotate-separator"></span>
      <button class="annotate-action-btn" data-action="undo" data-tooltip="Undo (Ctrl+Z)" disabled>↩</button>
      <button class="annotate-action-btn" data-action="redo" data-tooltip="Redo (Ctrl+Y)" disabled>↪</button>
      <button class="annotate-action-btn danger" data-action="clear" data-tooltip="Clear All">🗑</button>
      <span class="annotate-separator"></span>
      <div class="annotate-export-group">
        <button class="annotate-action-btn" data-action="toggleExport" data-tooltip="Export">💾</button>
        <div class="annotate-export-menu">
          <button data-action="exportHTML">📄 Export HTML</button>
          <button data-action="exportPDF">📑 Export PDF</button>
        </div>
      </div>
    `;
  }

  _bindToolbarEvents() {
    // Tool selection
    this.toolbar.querySelectorAll('[data-tool]').forEach(btn => {
      btn.addEventListener('click', () => this.setTool(btn.dataset.tool));
    });

    // Color selection
    this.toolbar.querySelectorAll('.annotate-color-swatch').forEach(swatch => {
      swatch.addEventListener('click', () => this.setColor(swatch.dataset.color));
    });

    // Size selection
    this.toolbar.querySelectorAll('.annotate-size-btn').forEach(btn => {
      btn.addEventListener('click', () => this.setSize(Number(btn.dataset.size)));
    });

    // Actions
    this.toolbar.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const action = btn.dataset.action;
        switch (action) {
          case 'undo': this.undo(); break;
          case 'redo': this.redo(); break;
          case 'clear': this.clearAll(); break;
          case 'toggleExport':
            e.stopPropagation(); // Prevent global click from closing menu immediately
            this._toggleExportMenu();
            break;
        }
      });
    });

    // Export menu items
    this.toolbar.querySelectorAll('.annotate-export-menu button').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._closeExportMenu();
        if (btn.dataset.action === 'exportHTML') this.exportHTML();
        if (btn.dataset.action === 'exportPDF') this.exportPDF();
      });
    });

    // Close export menu on outside click (save reference for cleanup)
    this._onDocumentClick = () => this._closeExportMenu();
    document.addEventListener('click', this._onDocumentClick);
  }

  _toggleExportMenu() {
    const menu = this.toolbar.querySelector('.annotate-export-menu');
    menu.classList.toggle('open');
  }

  _closeExportMenu() {
    const menu = this.toolbar.querySelector('.annotate-export-menu');
    menu.classList.remove('open');
  }

  // ── Canvas Sizing ──────────────

  _activeCanvas() {
    return this.mode === 'canvas' ? this._annotCanvas : this.canvas;
  }

  _activeCanvasSize() {
    const c = this._activeCanvas();
    return c ? { w: c.width, h: c.height } : { w: 0, h: 0 };
  }

  _canvasModeDPR() {
    // html2canvas snapshot is always at scale 2
    return 2;
  }

  _syncCanvasSize() {
    // In canvas mode, canvas dimensions are fixed to the html2canvas snapshot.
    // Resizing would clear all drawings — only re-initialize the context.
    if (this.mode === 'canvas') {
      if (!this._annotCanvas) return;
      const dpr = this._canvasModeDPR();
      this.ctx = this._annotCanvas.getContext('2d', { willReadFrequently: true });
      this.ctx.setTransform(1, 0, 0, 1, 0, 0);
      this.ctx.scale(dpr, dpr);
      this.ctx.lineCap = 'round';
      this.ctx.lineJoin = 'round';
      return;
    }

    const rect = this.contentContainer.getBoundingClientRect();
    const scrollW = this.contentContainer.scrollWidth;
    const scrollH = this.contentContainer.scrollHeight;

    const w = Math.max(rect.width, scrollW);
    const h = Math.max(rect.height, scrollH);

    const dpr = window.devicePixelRatio || 1;

    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);

    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.scale(dpr, dpr);
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';

    // Layer covers the scrollable content area
    if (this.layer) {
      this.layer.style.width = w + 'px';
      this.layer.style.height = h + 'px';
      this.layer.style.top = '0';
      this.layer.style.left = '0';
    }
  }

  // ── Canvas Mode (static content snapshot + annotation overlay) ──

  async enterCanvasMode() {
    if (this.mode === 'canvas') return;

    try {
      // ── Step 1: Take html2canvas snapshot of the content ──
      const snapshotCanvas = await html2canvas(this.contentContainer, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff'
      });

      // Guard: user might have exited canvas mode while we were snapshotting
      if (!this._enteringCanvasMode || this.mode === 'canvas') return;

    // ── Step 2: Create wrapper structure ──
    this._canvasWrapper = document.createElement('div');
    this._canvasWrapper.id = 'readmd-canvas-wrapper';
    this._canvasWrapper.style.cssText =
      'position:relative;width:100%;overflow:auto;';

    // Content canvas (static snapshot)
    // html2canvas rendered at scale 2 — CSS size = physical / 2
    const cssW = Math.round(snapshotCanvas.width / 2);
    const cssH = Math.round(snapshotCanvas.height / 2);

    this._contentCanvas = document.createElement('canvas');
    this._contentCanvas.id = 'readmd-content-canvas';
    this._contentCanvas.style.cssText =
      `display:block;max-width:100%;width:${cssW}px;height:${cssH}px;`;
    this._contentCanvas.width = snapshotCanvas.width;
    this._contentCanvas.height = snapshotCanvas.height;
    this._contentCanvas
      .getContext('2d')
      .drawImage(snapshotCanvas, 0, 0);
    this._canvasWrapper.appendChild(this._contentCanvas);

    // Annotation canvas (transparent overlay for drawings)
    this._annotCanvas = document.createElement('canvas');
    this._annotCanvas.id = 'readmd-annot-canvas';
    this._annotCanvas.style.cssText =
      `position:absolute;top:0;left:0;display:block;width:${cssW}px;height:${cssH}px;`;
    this._annotCanvas.width = snapshotCanvas.width;
    this._annotCanvas.height = snapshotCanvas.height;
    this._canvasWrapper.appendChild(this._annotCanvas);

    // ── Step 3: Switch DOM ──
    this.contentContainer.style.display = 'none';
    this.layer.style.display = 'none';
    this.overlay.appendChild(this._canvasWrapper);

    // ── Step 4: Unbind from old canvas, bind to annotation canvas ──
    this.canvas.removeEventListener('pointerdown', this._onPointerDown);
    this.canvas.removeEventListener('pointermove', this._onPointerMove);
    this.canvas.removeEventListener('pointerup', this._onPointerUp);
    this.canvas.removeEventListener('pointerleave', this._onPointerUp);
    this.canvas.removeEventListener('pointercancel', this._onPointerUp);

    this._annotCanvas.addEventListener('pointerdown', this._onPointerDown);
    this._annotCanvas.addEventListener('pointermove', this._onPointerMove);
    this._annotCanvas.addEventListener('pointerup', this._onPointerUp);
    this._annotCanvas.addEventListener('pointerleave', this._onPointerUp);
    this._annotCanvas.addEventListener('pointercancel', this._onPointerUp);

    // ── Step 5: Point active canvas at the annotation canvas ──
    this.mode = 'canvas';
    this._syncCanvasSize();

    // ── Step 6: Restore any existing canvas-mode text notes ──
    this._redrawCanvasModeTexts();
    } catch (err) {
      console.error('Failed to enter canvas mode:', err);
      // Always reset the guard so future show() calls can retry
      this._enteringCanvasMode = false;
      this.mode = 'dom';
      this.tool = 'none';
      this.layer.classList.remove('active');
      this.toolbar.classList.add('hidden');
    }
  }

  exitCanvasMode() {
    if (this.mode !== 'canvas') return;

    // ── Unbind from annotation canvas ──
    if (this._annotCanvas) {
      this._annotCanvas.removeEventListener('pointerdown', this._onPointerDown);
      this._annotCanvas.removeEventListener('pointermove', this._onPointerMove);
      this._annotCanvas.removeEventListener('pointerup', this._onPointerUp);
      this._annotCanvas.removeEventListener('pointerleave', this._onPointerUp);
      this._annotCanvas.removeEventListener('pointercancel', this._onPointerUp);
    }

    // ── Re-bind to DOM canvas ──
    this.canvas.addEventListener('pointerdown', this._onPointerDown);
    this.canvas.addEventListener('pointermove', this._onPointerMove);
    this.canvas.addEventListener('pointerup', this._onPointerUp);
    this.canvas.addEventListener('pointerleave', this._onPointerUp);
    this.canvas.addEventListener('pointercancel', this._onPointerUp);

    // ── Remove canvas wrapper ──
    if (this._canvasWrapper) {
      this._canvasWrapper.remove();
      this._canvasWrapper = null;
    }
    this._contentCanvas = null;
    this._annotCanvas = null;

    // ── Restore DOM content ──
    this.contentContainer.style.display = '';
    this.layer.style.display = '';

    this.mode = 'dom';
    this._syncCanvasSize();

    // ── Clear canvas-mode text notes ──
    this._canvasModeTextNotes = [];

    // Switch tool to none
    this.setTool('none');
  }

  _redrawCanvasModeTexts() {
    if (!this._annotCanvas) return;
    const dpr = this._canvasModeDPR();
    const ctx = this._annotCanvas.getContext('2d');
    this._canvasModeTextNotes.forEach(n => {
      ctx.save();
      ctx.font = '14px system-ui, -apple-system, sans-serif';
      ctx.fillStyle = n.color || '#333';
      const lines = (n.text || '').split('\n');
      const lineHeight = 20;
      lines.forEach((line, i) => {
        ctx.fillText(line, n.x * dpr, n.y * dpr + (i + 1) * lineHeight);
      });
      ctx.restore();
    });
  }

  _showCanvasTextInput(x, y) {
    // Remove existing input if any
    if (this._textInputEl) {
      this._textInputEl.remove();
      this._textInputEl = null;
    }

    const input = document.createElement('textarea');
    input.style.cssText =
      `position:absolute;left:${x}px;top:${y}px;z-index:100;` +
      `min-width:120px;min-height:28px;padding:4px 6px;` +
      `border:2px dashed #3498db;border-radius:4px;` +
      `background:rgba(255,255,200,0.92);font-size:14px;` +
      `line-height:1.4;resize:both;outline:none;` +
      `font-family:system-ui,-apple-system,sans-serif;`;
    input.placeholder = 'Type note...';

    const confirm = () => {
      const text = input.value.trim();
      if (text) {
        this._pushUndo({ type: 'text' });
        this._canvasModeTextNotes.push({ x, y, text, color: this.color });
        // Draw text onto the annotation canvas
        const dpr = this._canvasModeDPR();
        const ctx = this._annotCanvas.getContext('2d');
        ctx.save();
        ctx.font = '14px system-ui, -apple-system, sans-serif';
        ctx.fillStyle = this.color;
        const lines = text.split('\n');
        const lineHeight = 20;
        lines.forEach((line, i) => {
          ctx.fillText(line, x * dpr, y * dpr + (i + 1) * lineHeight);
        });
        ctx.restore();
      }
      input.remove();
      this._textInputEl = null;
    };

    input.addEventListener('blur', confirm);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        confirm();
      }
      if (e.key === 'Escape') {
        input.value = '';
        confirm();
      }
    });

    this._canvasWrapper.appendChild(input);
    this._textInputEl = input;
    requestAnimationFrame(() => input.focus());
  }

  // ── Event Binding ──────────────

  _bindEvents() {
    this._onPointerDown = this._onPointerDown.bind(this);
    this._onPointerMove = this._onPointerMove.bind(this);
    this._onPointerUp = this._onPointerUp.bind(this);
    this._onKeyDown = this._onKeyDown.bind(this);

    this.canvas.addEventListener('pointerdown', this._onPointerDown);
    this.canvas.addEventListener('pointermove', this._onPointerMove);
    this.canvas.addEventListener('pointerup', this._onPointerUp);
    this.canvas.addEventListener('pointerleave', this._onPointerUp);
    this.canvas.addEventListener('pointercancel', this._onPointerUp);
    document.addEventListener('keydown', this._onKeyDown);

    // Resize observer for content changes
    if (window.ResizeObserver) {
      this._resizeObserver = new ResizeObserver(() => {
        this._syncCanvasSize();
      });
      this._resizeObserver.observe(this.contentContainer);
    }
  }

  _getCanvasPos(e) {
    const activeCanvas = this.mode === 'canvas' ? this._annotCanvas : this.canvas;
    const rect = activeCanvas.getBoundingClientRect();
    // In both modes, scrolling happens on the overlay (the fixed 100vh container).
    // _canvasWrapper may not have its own scroll; the overlay handles it.
    const scrollLeft = this.overlay.scrollLeft;
    const scrollTop = this.overlay.scrollTop;
    return {
      x: e.clientX - rect.left + scrollLeft,
      y: e.clientY - rect.top + scrollTop
    };
  }

  _onPointerDown(e) {
    if (this.tool === 'none') return;

    // Text tool: place a text note on click
    if (this.tool === 'text') {
      const pos = this._getCanvasPos(e);
      this._addTextNote(pos.x, pos.y);
      return;
    }

    // Pen / Eraser: start drawing
    this.isDrawing = true;
    const pos = this._getCanvasPos(e);
    this.lastPoint = pos;

    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);

    // Save state before the stroke starts
    this._pushUndo({ type: 'stroke' });
  }

  _onPointerMove(e) {
    if (!this.isDrawing) return;
    if (this.tool === 'none' || this.tool === 'text') return;

    const pos = this._getCanvasPos(e);
    const ctx = this.ctx;

    ctx.lineWidth = this.lineWidth;
    ctx.strokeStyle = this.color;

    if (this.tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,1)'; // any opaque color works for erase
    } else {
      ctx.globalCompositeOperation = 'source-over';
    }

    ctx.beginPath();
    ctx.moveTo(this.lastPoint.x, this.lastPoint.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();

    this.lastPoint = pos;
  }

  _onPointerUp(e) {
    if (!this.isDrawing) return;
    this.isDrawing = false;
    this.lastPoint = null;

    const ctx = this.ctx;
    ctx.globalCompositeOperation = 'source-over';
  }

  _onKeyDown(e) {
    // Don't intercept when typing inside a text note
    if (e.target.isContentEditable || e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
      return;
    }

    const ctrl = e.ctrlKey || e.metaKey;

    if (ctrl && e.key === 'z') {
      e.preventDefault();
      this.undo();
      return;
    }
    if (ctrl && e.key === 'y') {
      e.preventDefault();
      this.redo();
      return;
    }
    if (ctrl && e.key === 's' && e.shiftKey) {
      e.preventDefault();
      this.exportPDF();
      return;
    }
    if (ctrl && e.key === 's') {
      e.preventDefault();
      this.exportHTML();
      return;
    }

    // Tool shortcuts only active when annotation mode is on (toolbar visible)
    if (this.toolbar && this.toolbar.classList.contains('hidden')) {
      return;
    }

    // Single-key tool shortcuts: require NO modifier keys
    if (e.ctrlKey || e.metaKey || e.altKey) {
      return;
    }

    if (e.key === 'a' || e.key === 'A') {
      this.setTool('pen');
    } else if (e.key === 'e' || e.key === 'E') {
      this.setTool('eraser');
    } else if (e.key === 't' || e.key === 'T') {
      this.setTool('text');
    } else if (e.key === 'Escape') {
      this.setTool('none');
    }
  }

  // ── Tool / Color / Size setters ─

  setTool(tool) {
    this.tool = tool;
    this._updateToolbarActive();
    if (tool === 'none') {
      this.layer.classList.remove('active');
    } else {
      this.layer.classList.add('active');
    }
  }

  setColor(color) {
    this.color = color;
    // If we're on eraser, switch back to pen
    if (this.tool === 'eraser') this.setTool('pen');
    this._updateToolbarActive();
  }

  setSize(size) {
    this.lineWidth = size;
    this._updateToolbarActive();
  }

  _updateToolbarActive() {
    if (!this.toolbar) return;

    // Tool buttons
    this.toolbar.querySelectorAll('[data-tool]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tool === this.tool);
    });

    // Color swatches (only relevant for pen)
    this.toolbar.querySelectorAll('.annotate-color-swatch').forEach(swatch => {
      swatch.classList.toggle('active', swatch.dataset.color === this.color && this.tool !== 'eraser');
    });

    // Size buttons
    this.toolbar.querySelectorAll('.annotate-size-btn').forEach(btn => {
      btn.classList.toggle('active', Number(btn.dataset.size) === this.lineWidth);
    });

    // Undo/Redo state
    const undoBtn = this.toolbar.querySelector('[data-action="undo"]');
    const redoBtn = this.toolbar.querySelector('[data-action="redo"]');
    if (undoBtn) undoBtn.disabled = this.undoStack.length === 0;
    if (redoBtn) redoBtn.disabled = this.redoStack.length === 0;
  }

  // ── Text Notes ──────────────────

  _addTextNote(x, y) {
    // Canvas mode: use canvas-based text input
    if (this.mode === 'canvas') {
      this._showCanvasTextInput(x, y);
      return;
    }

    // DOM mode: create DOM text note element
    this._pushUndo({ type: 'text' });

    const note = document.createElement('div');
    note.className = 'readmd-text-note';
    note.contentEditable = true;
    note.style.left = x + 'px';
    note.style.top = y + 'px';
    note.dataset.noteId = this.nextNoteId++;

    // Delete button
    const delBtn = document.createElement('span');
    delBtn.className = 'note-delete-btn';
    delBtn.textContent = '×';
    delBtn.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      this._removeTextNote(note);
    });
    note.appendChild(delBtn);

    note.addEventListener('blur', () => {
      if (note.textContent.trim() === '') {
        this._removeTextNote(note);
      } else {
        note.classList.add('confirmed');
        note.contentEditable = false;
      }
    });

    // Prevent dragging from interfering with drawing
    note.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
    });

    this.layer.appendChild(note);
    this.textNotes.push({ el: note, x, y, text: '' });

    // Focus and select all
    requestAnimationFrame(() => {
      note.focus();
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(note);
      selection.removeAllRanges();
      selection.addRange(range);
    });
  }

  _removeTextNote(noteEl) {
    this._pushUndo({ type: 'text' });
    noteEl.remove();
    this.textNotes = this.textNotes.filter(n => n.el !== noteEl);
  }

  // ── Undo / Redo ────────────────

  _pushUndo(meta = {}) {
    const { w, h } = this._activeCanvasSize();
    const snapshot = {
      canvasData: this.ctx.getImageData(0, 0, w, h),
      textState: this.textNotes.map(n => ({
        x: n.x,
        y: n.y,
        text: n.el.textContent || '',
        noteId: n.el.dataset.noteId
      })),
      ...meta
    };

    this.undoStack.push(snapshot);
    if (this.undoStack.length > MAX_UNDO) {
      this.undoStack.shift();
    }

    // Clear redo stack on new action
    this.redoStack = [];
    this._updateToolbarActive();
  }

  undo() {
    if (this.undoStack.length === 0) return;

    // Save current state to redo
    const { w, h } = this._activeCanvasSize();
    const current = {
      canvasData: this.ctx.getImageData(0, 0, w, h),
      textState: this.textNotes.map(n => ({
        x: n.x,
        y: n.y,
        text: n.el.textContent || '',
        noteId: n.el.dataset.noteId
      })),
      type: 'undo-point'
    };
    this.redoStack.push(current);

    const snapshot = this.undoStack.pop();
    this._restoreSnapshot(snapshot);
    this._updateToolbarActive();
  }

  redo() {
    if (this.redoStack.length === 0) return;

    // Save current to undo
    const { w, h } = this._activeCanvasSize();
    const current = {
      canvasData: this.ctx.getImageData(0, 0, w, h),
      textState: this.textNotes.map(n => ({
        x: n.x,
        y: n.y,
        text: n.el.textContent || '',
        noteId: n.el.dataset.noteId
      })),
      type: 'redo-point'
    };
    this.undoStack.push(current);

    const snapshot = this.redoStack.pop();
    this._restoreSnapshot(snapshot);
    this._updateToolbarActive();
  }

  _restoreSnapshot(snapshot) {
    // Restore canvas
    if (snapshot.canvasData) {
      this.ctx.putImageData(snapshot.canvasData, 0, 0);
    }

    // Restore text notes
    this.textNotes.forEach(n => n.el.remove());
    this.textNotes = [];

    if (snapshot.textState) {
      snapshot.textState.forEach(ts => {
        const note = document.createElement('div');
        note.className = 'readmd-text-note confirmed';
        note.contentEditable = false;
        note.style.left = ts.x + 'px';
        note.style.top = ts.y + 'px';
        note.textContent = ts.text;
        note.dataset.noteId = ts.noteId;

        const delBtn = document.createElement('span');
        delBtn.className = 'note-delete-btn';
        delBtn.textContent = '×';
        delBtn.addEventListener('mousedown', (e) => {
          e.stopPropagation();
          e.preventDefault();
          this._removeTextNote(note);
        });
        note.appendChild(delBtn);

        this.layer.appendChild(note);
        this.textNotes.push({ el: note, x: ts.x, y: ts.y, text: ts.text });
      });
    }
  }

  // ── Clear ──────────────────────

  clearAll() {
    this._pushUndo({ type: 'clear' });
    const { w, h } = this._activeCanvasSize();
    const ctx = this.ctx;
    ctx.clearRect(0, 0, w, h);
    this.textNotes.forEach(n => n.el.remove());
    this.textNotes = [];
    this._canvasModeTextNotes = [];
    this._updateToolbarActive();
  }

  // ── Export: HTML ───────────────

  exportHTML() {
    if (this.mode === 'canvas') {
      this._exportCanvasHTML();
      return;
    }
    this._exportDOMHTML();
  }

  _exportCanvasHTML() {
    // Merge content canvas + annotation canvas into one
    const merged = document.createElement('canvas');
    merged.width = this._contentCanvas.width;
    merged.height = this._contentCanvas.height;
    const mctx = merged.getContext('2d');
    mctx.drawImage(this._contentCanvas, 0, 0);
    mctx.drawImage(this._annotCanvas, 0, 0);

    const imgDataUrl = merged.toDataURL('image/png');

    const fullHTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Readmd Export - ${document.title}</title>
<style>
  body {
    max-width: 100%;
    margin: 0 auto;
    padding: 10px;
    font-family: system-ui, -apple-system, sans-serif;
    background: #fbfbf9;
  }
  img { max-width: 100%; height: auto; display: block; }
</style>
</head>
<body>
<h1>${document.title || 'Readmd Export'}</h1>
<p><small>Exported from: ${location.href}</small></p>
<hr>
<img src="${imgDataUrl}" alt="Annotated page" />
</body>
</html>`;

    this._downloadFile('readmd-export.html', fullHTML, 'text/html');
  }

  _exportDOMHTML() {
    const contentHTML = this.contentContainer.innerHTML;

    // Get canvas as data URL
    const canvasDataUrl = this.canvas.toDataURL('image/png');

    // Build text notes HTML
    const notesHTML = this.textNotes.map(n => {
      const el = n.el;
      const style = el.getAttribute('style') || '';
      return `<div class="readmd-text-note confirmed" style="${style}" contenteditable="false">${el.textContent || ''}</div>`;
    }).join('\n');

    const canvasRect = this.canvas.getBoundingClientRect();

    // Get the content container's scroll dimensions for the wrapper
    const contentScrollW = this.contentContainer.scrollWidth;
    const contentScrollH = this.contentContainer.scrollHeight;

    const fullHTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Readmd Export - ${document.title}</title>
<style>
  body {
    max-width: 900px;
    margin: 0 auto;
    padding: 20px;
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 16px;
    line-height: 1.6;
    color: #333;
    background: #fbfbf9;
  }
  img { max-width: 100%; height: auto; }
  pre {
    padding: 1rem;
    overflow-x: auto;
    background: rgba(128,128,128,0.05);
    border: 1px solid rgba(128,128,128,0.1);
    border-radius: 4px;
    font-family: "Fira Code", Consolas, monospace;
  }
  code { padding: 0.2em 0.4em; background: rgba(128,128,128,0.1); border-radius: 3px; }
  pre code { padding: 0; background: transparent; }

  .export-wrapper {
    position: relative;
    width: 100%;
  }
  .export-content {
    position: relative;
    z-index: 1;
  }
  .export-annotation-canvas {
    position: absolute;
    top: 0;
    left: 0;
    z-index: 2;
    pointer-events: none;
  }
  .readmd-text-note {
    position: absolute;
    z-index: 3;
    min-width: 60px;
    padding: 4px 8px;
    border: 1px solid rgba(0,0,0,0.15);
    border-radius: 4px;
    background: rgba(255,255,180,0.75);
    font-size: 14px;
    line-height: 1.4;
    color: #333;
    white-space: pre-wrap;
    word-break: break-word;
  }
</style>
</head>
<body>
<h1>${document.title || 'Readmd Export'}</h1>
<p><small>Exported from: ${location.href}</small></p>
<hr>
<div class="export-wrapper">
  <div class="export-content">
    ${contentHTML}
  </div>
  <img class="export-annotation-canvas" src="${canvasDataUrl}" alt="Drawing annotations" style="width:${canvasRect.width}px;height:${canvasRect.height}px;" />
  ${notesHTML}
</div>
</body>
</html>`;

    this._downloadFile('readmd-export.html', fullHTML, 'text/html');
  }

  // ── Export: PDF ────────────────

  async exportPDF() {
    if (this.mode === 'canvas') {
      await this._exportCanvasPDF();
      return;
    }
    await this._exportDOMPDF();
  }

  async _exportCanvasPDF() {
    try {
      // Merge content + annotation canvases
      const merged = document.createElement('canvas');
      merged.width = this._contentCanvas.width;
      merged.height = this._contentCanvas.height;
      const mctx = merged.getContext('2d');
      mctx.drawImage(this._contentCanvas, 0, 0);
      mctx.drawImage(this._annotCanvas, 0, 0);

      const imgData = merged.toDataURL('image/png');

      const { jsPDF } = window.jspdf;
      const imgWidth = 210;
      const pageHeight = 297;
      const imgHeight = (merged.height * imgWidth) / merged.width;

      const pdf = new jsPDF('p', 'mm', 'a4');
      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;

      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      pdf.save('readmd-export.pdf');
    } catch (err) {
      console.error('PDF export failed:', err);
      alert('PDF export failed. See console for details.');
    }
  }

  async _exportDOMPDF() {
    try {
      // ── Step 1: Build a clone container with content + text notes ──
      const wrapper = document.createElement('div');
      wrapper.style.cssText =
        'position:fixed;left:-9999px;top:0;width:900px;background:#fff;padding:20px;' +
        'font-family:system-ui,-apple-system,sans-serif;font-size:16px;line-height:1.6;color:#333;';

      // Title + source line
      const titleEl = document.createElement('h1');
      titleEl.textContent = document.title || 'Readmd Export';
      wrapper.appendChild(titleEl);

      const sourceEl = document.createElement('p');
      const sourceSmall = document.createElement('small');
      sourceSmall.textContent = `Exported from: ${location.href}`;
      sourceEl.appendChild(sourceSmall);
      wrapper.appendChild(sourceEl);

      const hr = document.createElement('hr');
      wrapper.appendChild(hr);

      // Content + text notes in a relative container
      const contentArea = document.createElement('div');
      contentArea.style.cssText = 'position:relative;width:100%;';
      contentArea.innerHTML = this.contentContainer.innerHTML;

      // Append text notes as absolutely positioned children of contentArea
      this.textNotes.forEach(n => {
        const noteEl = document.createElement('div');
        noteEl.textContent = n.el.textContent || '';
        noteEl.style.cssText =
          `position:absolute;left:${n.x}px;top:${n.y}px;z-index:10;` +
          `min-width:60px;padding:4px 8px;` +
          `border:1px solid rgba(0,0,0,0.15);border-radius:4px;` +
          `background:rgba(255,255,180,0.85);` +
          `font-size:14px;line-height:1.4;color:#333;` +
          `white-space:pre-wrap;word-break:break-word;`;
        contentArea.appendChild(noteEl);
      });

      wrapper.appendChild(contentArea);
      document.body.appendChild(wrapper);

      // ── Step 2: Wait for all images inside the clone to load ──
      const images = wrapper.querySelectorAll('img');
      await Promise.all(
        Array.from(images).map(img => {
          if (img.complete) return Promise.resolve();
          return new Promise(resolve => {
            img.onload = resolve;
            img.onerror = resolve;
          });
        })
      );

      // ── Step 3: Render content + text notes with html2canvas ──
      const contentCanvas = await html2canvas(wrapper, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff'
      });

      // ── Step 4: Composite the annotation canvas (drawings) on top ──
      // The annotation canvas origin is at the contentArea's top-left.
      // We need to find where contentArea is in the rendered html2canvas output.
      const contentAreaRect = contentArea.getBoundingClientRect();
      const wrapperRect = wrapper.getBoundingClientRect();
      const offsetX = (contentAreaRect.left - wrapperRect.left) * 2;  // ×2 for scale
      const offsetY = (contentAreaRect.top - wrapperRect.top) * 2;

      const compositeCtx = contentCanvas.getContext('2d');
      // Draw the annotation canvas (drawings) at the correct offset
      // The source annotation canvas is already at the right DPR scale
      compositeCtx.drawImage(
        this.canvas,
        offsetX, offsetY,
        this.canvas.width, this.canvas.height
      );

      // ── Step 5: Clean up temp DOM ──
      document.body.removeChild(wrapper);

      // ── Step 6: Generate PDF ──
      const { jsPDF } = window.jspdf;
      const imgData = contentCanvas.toDataURL('image/png');

      const imgWidth = 210; // A4 mm
      const pageHeight = 297; // A4 mm
      const imgHeight = (contentCanvas.height * imgWidth) / contentCanvas.width;

      const pdf = new jsPDF('p', 'mm', 'a4');
      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;

      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      pdf.save('readmd-export.pdf');
    } catch (err) {
      console.error('PDF export failed:', err);
      alert('PDF export failed. See console for details.');
    }
  }

  // ── Helpers ────────────────────

  _downloadFile(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ── Lifecycle ──────────────────

  syncSize() {
    if (this.mode === 'canvas') {
      // Re-snapshot on resize in canvas mode
      this._syncCanvasWrapperSize();
    } else {
      this._syncCanvasSize();
    }
  }

  async show() {
    if (this._enteringCanvasMode) return;
    this._enteringCanvasMode = true;
    this.toolbar.classList.remove('hidden');
    this.tool = 'pen';
    this._updateToolbarActive();
    await this.enterCanvasMode();
    this._enteringCanvasMode = false;
  }

  hide() {
    this._enteringCanvasMode = false;
    this.toolbar.classList.add('hidden');
    if (this.mode === 'canvas') {
      this.exitCanvasMode();
    }
    // Always deactivate the tool so drawing is disabled,
    // and deactivate the annotation layer so it doesn't intercept clicks.
    this.setTool('none');
    this.layer.classList.remove('active');
  }

  _syncCanvasWrapperSize() {
    // Refresh the content snapshot after layout changes
    if (!this._canvasWrapper || !this._contentCanvas) return;
    // In canvas mode, resize is handled by re-entering canvas mode
    // For simplicity, we just sync the annotation canvas
    this._syncCanvasSize();
  }

  destroy() {
    // Remove event listeners from both canvases
    const removeCanvasListeners = (c) => {
      if (!c) return;
      c.removeEventListener('pointerdown', this._onPointerDown);
      c.removeEventListener('pointermove', this._onPointerMove);
      c.removeEventListener('pointerup', this._onPointerUp);
      c.removeEventListener('pointerleave', this._onPointerUp);
      c.removeEventListener('pointercancel', this._onPointerUp);
    };
    removeCanvasListeners(this.canvas);
    removeCanvasListeners(this._annotCanvas);
    document.removeEventListener('keydown', this._onKeyDown);
    if (this._onDocumentClick) {
      document.removeEventListener('click', this._onDocumentClick);
      this._onDocumentClick = null;
    }

    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }

    // Clean up canvas-mode text input
    if (this._textInputEl) {
      this._textInputEl.remove();
      this._textInputEl = null;
    }

    // Clean up text notes
    this.textNotes.forEach(n => n.el.remove());
    this.textNotes = [];

    // Remove DOM elements
    if (this.toolbar) { this.toolbar.remove(); this.toolbar = null; }
    if (this.layer) { this.layer.remove(); this.layer = null; }
    if (this._canvasWrapper) { this._canvasWrapper.remove(); this._canvasWrapper = null; }

    // Reset all state
    this._contentCanvas = null;
    this._annotCanvas = null;
    this._canvasModeTextNotes = [];
    this.undoStack = [];
    this.redoStack = [];
    this.isDrawing = false;
    this.lastPoint = null;
    this.mode = 'dom';
    this.tool = 'none';
    this._enteringCanvasMode = false;
  }
}

// ──────────────────────────────────
//  Global integration hook
// ──────────────────────────────────

// The engine instance is managed by content.js.
// content.js sets window.__readmdAnnotationEngine when it creates one.
