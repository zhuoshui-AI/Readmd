import html2canvas from 'html2canvas';
import '../styles/annotate.css';

// ── Constants ────────────────────────────────────

const ANNOTATION_COLORS = [
  '#e74c3c', '#e67e22', '#f1c40f', '#2ecc71',
  '#3498db', '#9b59b6', '#2c3e50', '#ecf0f1',
];

const PEN_SIZES = [
  { label: 'S', value: 2 },
  { label: 'M', value: 4 },
  { label: 'L', value: 8 },
];

const MAX_UNDO = 50;

interface UndoSnapshot {
  canvasData: ImageData;
  textState: Array<{ x: number; y: number; text: string; noteId: string }>;
  type?: string;
}

interface TextNote {
  el: HTMLDivElement;
  x: number;
  y: number;
  text: string;
}

interface CanvasTextNote {
  x: number;
  y: number;
  text: string;
  color: string;
}

export class AnnotationEngine {
  private overlay: HTMLElement;
  private contentContainer: HTMLElement;

  tool: 'pen' | 'eraser' | 'text' | 'none' = 'pen';
  color = ANNOTATION_COLORS[0];
  lineWidth = PEN_SIZES[1].value;

  private isDrawing = false;
  private lastPoint: { x: number; y: number } | null = null;

  private undoStack: UndoSnapshot[] = [];
  private redoStack: UndoSnapshot[] = [];

  private textNotes: TextNote[] = [];
  private nextNoteId = 0;

  mode: 'dom' | 'canvas' = 'dom';
  private _enteringCanvasMode = false;
  private _canvasWrapper: HTMLElement | null = null;
  private _contentCanvas: HTMLCanvasElement | null = null;
  private _annotCanvas: HTMLCanvasElement | null = null;
  private _canvasModeTextNotes: CanvasTextNote[] = [];
  private _textInputEl: HTMLTextAreaElement | null = null;

  private layer!: HTMLDivElement;
  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private toolbar!: HTMLDivElement;

  private _onPointerDown!: (e: PointerEvent) => void;
  private _onPointerMove!: (e: PointerEvent) => void;
  private _onPointerUp!: (e: PointerEvent) => void;
  private _onKeyDown!: (e: KeyboardEvent) => void;
  private _onDocumentClick!: (e: MouseEvent) => void;
  private _resizeObserver: ResizeObserver | null = null;

  constructor(overlay: HTMLElement, contentContainer: HTMLElement) {
    this.overlay = overlay;
    this.contentContainer = contentContainer;
    this._setupDOM();
    this._bindEvents();
  }

  // ── DOM Setup ──────────────────────────────

  private _setupDOM(): void {
    this.layer = document.createElement('div');
    this.layer.id = 'readmd-annotation-layer';

    this.canvas = document.createElement('canvas');
    this.canvas.id = 'readmd-annotation-canvas';
    this.layer.appendChild(this.canvas);

    this.overlay.appendChild(this.layer);
    this._syncCanvasSize();
    this._createToolbar();
  }

  private _createToolbar(): void {
    this.toolbar = document.createElement('div');
    this.toolbar.id = 'readmd-annotate-toolbar';
    this.toolbar.classList.add('hidden');
    this.toolbar.innerHTML = this._toolbarHTML();
    document.body.appendChild(this.toolbar);
    this._bindToolbarEvents();
  }

  private _toolbarHTML(): string {
    const colorSwatches = ANNOTATION_COLORS.map(
      (c) =>
        `<span class="annotate-color-swatch${c === this.color ? ' active' : ''}" data-color="${c}" style="background:${c}" data-tooltip="${c}"></span>`,
    ).join('');

    const sizeBtns = PEN_SIZES.map(
      (s) =>
        `<button class="annotate-size-btn${s.value === this.lineWidth ? ' active' : ''}" data-size="${s.value}" data-tooltip="${s.label}">${s.label}</button>`,
    ).join('');

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
      </div>`;
  }

  private _bindToolbarEvents(): void {
    this.toolbar.querySelectorAll('[data-tool]').forEach((btn) => {
      btn.addEventListener('click', () => this.setTool((btn as HTMLElement).dataset.tool!));
    });

    this.toolbar.querySelectorAll('.annotate-color-swatch').forEach((swatch) => {
      swatch.addEventListener('click', () => this.setColor((swatch as HTMLElement).dataset.color!));
    });

    this.toolbar.querySelectorAll('.annotate-size-btn').forEach((btn) => {
      btn.addEventListener('click', () => this.setSize(Number((btn as HTMLElement).dataset.size)));
    });

    this.toolbar.querySelectorAll('[data-action]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const action = (btn as HTMLElement).dataset.action;
        switch (action) {
          case 'undo': this.undo(); break;
          case 'redo': this.redo(); break;
          case 'clear': this.clearAll(); break;
          case 'toggleExport':
            e.stopPropagation();
            this._toggleExportMenu();
            break;
        }
      });
    });

    this.toolbar.querySelectorAll('.annotate-export-menu button').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._closeExportMenu();
        if ((btn as HTMLElement).dataset.action === 'exportHTML') this.exportHTML();
        if ((btn as HTMLElement).dataset.action === 'exportPDF') this.exportPDF();
      });
    });

    this._onDocumentClick = () => this._closeExportMenu();
    document.addEventListener('click', this._onDocumentClick);
  }

  private _toggleExportMenu(): void {
    const menu = this.toolbar.querySelector('.annotate-export-menu')!;
    menu.classList.toggle('open');
  }

  private _closeExportMenu(): void {
    const menu = this.toolbar.querySelector('.annotate-export-menu')!;
    menu.classList.remove('open');
  }

  // ── Canvas Sizing ──────────────────────────

  private _activeCanvas(): HTMLCanvasElement {
    return this.mode === 'canvas' ? this._annotCanvas! : this.canvas;
  }

  private _activeCanvasSize(): { w: number; h: number } {
    const c = this._activeCanvas();
    return c ? { w: c.width, h: c.height } : { w: 0, h: 0 };
  }

  private _canvasModeDPR(): number {
    return 2; // html2canvas snapshot is always at scale 2
  }

  private _syncCanvasSize(): void {
    if (this.mode === 'canvas') {
      if (!this._annotCanvas) return;
      const dpr = this._canvasModeDPR();
      this.ctx = this._annotCanvas.getContext('2d', { willReadFrequently: true })!;
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

    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })!;
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.scale(dpr, dpr);
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';

    if (this.layer) {
      this.layer.style.width = w + 'px';
      this.layer.style.height = h + 'px';
      this.layer.style.top = '0';
      this.layer.style.left = '0';
    }
  }

  // ── Canvas Mode ────────────────────────────

  private async enterCanvasMode(): Promise<void> {
    if (this.mode === 'canvas') return;

    try {
      const snapshotCanvas = await html2canvas(this.contentContainer, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
      });

      if (!this._enteringCanvasMode || this.mode === 'canvas') return;

      this._canvasWrapper = document.createElement('div');
      this._canvasWrapper.id = 'readmd-canvas-wrapper';
      this._canvasWrapper.style.cssText = 'position:relative;width:100%;overflow:auto;';

      const cssW = Math.round(snapshotCanvas.width / 2);
      const cssH = Math.round(snapshotCanvas.height / 2);

      this._contentCanvas = document.createElement('canvas');
      this._contentCanvas.id = 'readmd-content-canvas';
      this._contentCanvas.style.cssText = `display:block;max-width:100%;width:${cssW}px;height:${cssH}px;`;
      this._contentCanvas.width = snapshotCanvas.width;
      this._contentCanvas.height = snapshotCanvas.height;
      this._contentCanvas.getContext('2d')!.drawImage(snapshotCanvas, 0, 0);
      this._canvasWrapper.appendChild(this._contentCanvas);

      this._annotCanvas = document.createElement('canvas');
      this._annotCanvas.id = 'readmd-annot-canvas';
      this._annotCanvas.style.cssText = `position:absolute;top:0;left:0;display:block;width:${cssW}px;height:${cssH}px;`;
      this._annotCanvas.width = snapshotCanvas.width;
      this._annotCanvas.height = snapshotCanvas.height;
      this._canvasWrapper.appendChild(this._annotCanvas);

      this.contentContainer.style.display = 'none';
      this.layer.style.display = 'none';
      this.overlay.appendChild(this._canvasWrapper);

      // Switch pointer events to annotation canvas
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

      this.mode = 'canvas';
      this._syncCanvasSize();
      this._redrawCanvasModeTexts();
    } catch (err) {
      console.error('Failed to enter canvas mode:', err);
      this._enteringCanvasMode = false;
      this.mode = 'dom';
      this.tool = 'none';
      this.layer.classList.remove('active');
      this.toolbar.classList.add('hidden');
    }
  }

  private exitCanvasMode(): void {
    if (this.mode !== 'canvas') return;

    if (this._annotCanvas) {
      this._annotCanvas.removeEventListener('pointerdown', this._onPointerDown);
      this._annotCanvas.removeEventListener('pointermove', this._onPointerMove);
      this._annotCanvas.removeEventListener('pointerup', this._onPointerUp);
      this._annotCanvas.removeEventListener('pointerleave', this._onPointerUp);
      this._annotCanvas.removeEventListener('pointercancel', this._onPointerUp);
    }

    this.canvas.addEventListener('pointerdown', this._onPointerDown);
    this.canvas.addEventListener('pointermove', this._onPointerMove);
    this.canvas.addEventListener('pointerup', this._onPointerUp);
    this.canvas.addEventListener('pointerleave', this._onPointerUp);
    this.canvas.addEventListener('pointercancel', this._onPointerUp);

    if (this._canvasWrapper) {
      this._canvasWrapper.remove();
      this._canvasWrapper = null;
    }
    this._contentCanvas = null;
    this._annotCanvas = null;

    this.contentContainer.style.display = '';
    this.layer.style.display = '';
    this.mode = 'dom';
    this._syncCanvasSize();
    this._canvasModeTextNotes = [];
    this.setTool('none');
  }

  private _redrawCanvasModeTexts(): void {
    if (!this._annotCanvas) return;
    const dpr = this._canvasModeDPR();
    const ctx = this._annotCanvas.getContext('2d')!;
    this._canvasModeTextNotes.forEach((n) => {
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

  private _showCanvasTextInput(x: number, y: number): void {
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
        const dpr = this._canvasModeDPR();
        const ctx = this._annotCanvas!.getContext('2d')!;
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

    this._canvasWrapper!.appendChild(input);
    this._textInputEl = input;
    requestAnimationFrame(() => input.focus());
  }

  // ── Event Binding ──────────────────────────

  private _bindEvents(): void {
    this._onPointerDown = this._onPointerDownHandler.bind(this);
    this._onPointerMove = this._onPointerMoveHandler.bind(this);
    this._onPointerUp = this._onPointerUpHandler.bind(this);
    this._onKeyDown = this._onKeyDownHandler.bind(this);

    this.canvas.addEventListener('pointerdown', this._onPointerDown);
    this.canvas.addEventListener('pointermove', this._onPointerMove);
    this.canvas.addEventListener('pointerup', this._onPointerUp);
    this.canvas.addEventListener('pointerleave', this._onPointerUp);
    this.canvas.addEventListener('pointercancel', this._onPointerUp);
    document.addEventListener('keydown', this._onKeyDown);

    if (window.ResizeObserver) {
      this._resizeObserver = new ResizeObserver(() => {
        this._syncCanvasSize();
      });
      this._resizeObserver.observe(this.contentContainer);
    }
  }

  private _getCanvasPos(e: PointerEvent): { x: number; y: number } {
    const activeCanvas = this.mode === 'canvas' ? this._annotCanvas : this.canvas;
    const rect = activeCanvas!.getBoundingClientRect();
    const scrollLeft = this.overlay.scrollLeft;
    const scrollTop = this.overlay.scrollTop;
    return {
      x: e.clientX - rect.left + scrollLeft,
      y: e.clientY - rect.top + scrollTop,
    };
  }

  private _onPointerDownHandler(e: PointerEvent): void {
    if (this.tool === 'none') return;

    if (this.tool === 'text') {
      const pos = this._getCanvasPos(e);
      this._addTextNote(pos.x, pos.y);
      return;
    }

    this.isDrawing = true;
    const pos = this._getCanvasPos(e);
    this.lastPoint = pos;

    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    this._pushUndo({ type: 'stroke' });
  }

  private _onPointerMoveHandler(e: PointerEvent): void {
    if (!this.isDrawing) return;
    if (this.tool === 'none' || this.tool === 'text') return;

    const pos = this._getCanvasPos(e);
    const ctx = this.ctx;

    ctx.lineWidth = this.lineWidth;
    ctx.strokeStyle = this.color;

    if (this.tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,1)';
    } else {
      ctx.globalCompositeOperation = 'source-over';
    }

    ctx.beginPath();
    ctx.moveTo(this.lastPoint!.x, this.lastPoint!.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();

    this.lastPoint = pos;
  }

  private _onPointerUpHandler(_e: PointerEvent): void {
    if (!this.isDrawing) return;
    this.isDrawing = false;
    this.lastPoint = null;
    this.ctx.globalCompositeOperation = 'source-over';
  }

  private _onKeyDownHandler(e: KeyboardEvent): void {
    const target = e.target as HTMLElement;
    if (target.isContentEditable || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
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

    if (this.toolbar.classList.contains('hidden')) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    if (e.key === 'a' || e.key === 'A') this.setTool('pen');
    else if (e.key === 'e' || e.key === 'E') this.setTool('eraser');
    else if (e.key === 't' || e.key === 'T') this.setTool('text');
    else if (e.key === 'Escape') this.setTool('none');
  }

  // ── Tool / Color / Size ────────────────────

  setTool(tool: string): void {
    this.tool = tool as 'pen' | 'eraser' | 'text' | 'none';
    this._updateToolbarActive();
    if (tool === 'none') {
      this.layer.classList.remove('active');
    } else {
      this.layer.classList.add('active');
    }
  }

  setColor(color: string): void {
    this.color = color;
    if (this.tool === 'eraser') this.setTool('pen');
    this._updateToolbarActive();
  }

  setSize(size: number): void {
    this.lineWidth = size;
    this._updateToolbarActive();
  }

  private _updateToolbarActive(): void {
    if (!this.toolbar) return;

    this.toolbar.querySelectorAll('[data-tool]').forEach((btn) => {
      btn.classList.toggle('active', (btn as HTMLElement).dataset.tool === this.tool);
    });

    this.toolbar.querySelectorAll('.annotate-color-swatch').forEach((s) => {
      s.classList.toggle('active', (s as HTMLElement).dataset.color === this.color && this.tool !== 'eraser');
    });

    this.toolbar.querySelectorAll('.annotate-size-btn').forEach((b) => {
      b.classList.toggle('active', Number((b as HTMLElement).dataset.size) === this.lineWidth);
    });

    const undoBtn = this.toolbar.querySelector('[data-action="undo"]') as HTMLButtonElement;
    const redoBtn = this.toolbar.querySelector('[data-action="redo"]') as HTMLButtonElement;
    if (undoBtn) undoBtn.disabled = this.undoStack.length === 0;
    if (redoBtn) redoBtn.disabled = this.redoStack.length === 0;
  }

  // ── Text Notes ─────────────────────────────

  private _addTextNote(x: number, y: number): void {
    if (this.mode === 'canvas') {
      this._showCanvasTextInput(x, y);
      return;
    }

    this._pushUndo({ type: 'text' });

    const note = document.createElement('div');
    note.className = 'readmd-text-note';
    note.contentEditable = 'true';
    note.style.left = x + 'px';
    note.style.top = y + 'px';
    note.dataset.noteId = String(this.nextNoteId++);

    const delBtn = document.createElement('span');
    delBtn.className = 'note-delete-btn';
    delBtn.textContent = '×';
    delBtn.addEventListener('mousedown', (ev) => {
      ev.stopPropagation();
      ev.preventDefault();
      this._removeTextNote(note);
    });
    note.appendChild(delBtn);

    note.addEventListener('blur', () => {
      if (note.textContent!.trim() === '') {
        this._removeTextNote(note);
      } else {
        note.classList.add('confirmed');
        note.contentEditable = 'false';
      }
    });

    note.addEventListener('pointerdown', (ev) => {
      ev.stopPropagation();
    });

    this.layer.appendChild(note);
    this.textNotes.push({ el: note, x, y, text: '' });

    requestAnimationFrame(() => {
      note.focus();
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(note);
      selection!.removeAllRanges();
      selection!.addRange(range);
    });
  }

  private _removeTextNote(noteEl: HTMLDivElement): void {
    this._pushUndo({ type: 'text' });
    noteEl.remove();
    this.textNotes = this.textNotes.filter((n) => n.el !== noteEl);
  }

  // ── Undo / Redo ────────────────────────────

  private _pushUndo(meta: { type: string }): void {
    const { w, h } = this._activeCanvasSize();
    const snapshot: UndoSnapshot = {
      canvasData: this.ctx.getImageData(0, 0, w, h),
      textState: this.textNotes.map((n) => ({
        x: n.x,
        y: n.y,
        text: n.el.textContent || '',
        noteId: n.el.dataset.noteId || '',
      })),
      ...meta,
    };

    this.undoStack.push(snapshot);
    if (this.undoStack.length > MAX_UNDO) {
      this.undoStack.shift();
    }
    this.redoStack = [];
    this._updateToolbarActive();
  }

  undo(): void {
    if (this.undoStack.length === 0) return;

    const { w, h } = this._activeCanvasSize();
    const current: UndoSnapshot = {
      canvasData: this.ctx.getImageData(0, 0, w, h),
      textState: this.textNotes.map((n) => ({
        x: n.x, y: n.y,
        text: n.el.textContent || '',
        noteId: n.el.dataset.noteId || '',
      })),
      type: 'undo-point',
    };
    this.redoStack.push(current);

    const snapshot = this.undoStack.pop()!;
    this._restoreSnapshot(snapshot);
    this._updateToolbarActive();
  }

  redo(): void {
    if (this.redoStack.length === 0) return;

    const { w, h } = this._activeCanvasSize();
    const current: UndoSnapshot = {
      canvasData: this.ctx.getImageData(0, 0, w, h),
      textState: this.textNotes.map((n) => ({
        x: n.x, y: n.y,
        text: n.el.textContent || '',
        noteId: n.el.dataset.noteId || '',
      })),
      type: 'redo-point',
    };
    this.undoStack.push(current);

    const snapshot = this.redoStack.pop()!;
    this._restoreSnapshot(snapshot);
    this._updateToolbarActive();
  }

  private _restoreSnapshot(snapshot: UndoSnapshot): void {
    if (snapshot.canvasData) {
      this.ctx.putImageData(snapshot.canvasData, 0, 0);
    }

    this.textNotes.forEach((n) => n.el.remove());
    this.textNotes = [];

    if (snapshot.textState) {
      snapshot.textState.forEach((ts) => {
        const note = document.createElement('div');
        note.className = 'readmd-text-note confirmed';
        note.contentEditable = 'false';
        note.style.left = ts.x + 'px';
        note.style.top = ts.y + 'px';
        note.textContent = ts.text;
        note.dataset.noteId = ts.noteId;

        const delBtn = document.createElement('span');
        delBtn.className = 'note-delete-btn';
        delBtn.textContent = '×';
        delBtn.addEventListener('mousedown', (ev) => {
          ev.stopPropagation();
          ev.preventDefault();
          this._removeTextNote(note);
        });
        note.appendChild(delBtn);

        this.layer.appendChild(note);
        this.textNotes.push({ el: note, x: ts.x, y: ts.y, text: ts.text });
      });
    }
  }

  // ── Clear ──────────────────────────────────

  clearAll(): void {
    this._pushUndo({ type: 'clear' });
    const { w, h } = this._activeCanvasSize();
    this.ctx.clearRect(0, 0, w, h);
    this.textNotes.forEach((n) => n.el.remove());
    this.textNotes = [];
    this._canvasModeTextNotes = [];
    this._updateToolbarActive();
  }

  // ── Export: HTML ───────────────────────────

  async exportHTML(): Promise<void> {
    if (this.mode === 'canvas') {
      await this._exportCanvasHTML();
    } else {
      await this._exportDOMHTML();
    }
  }

  private async _exportCanvasHTML(): Promise<void> {
    const merged = document.createElement('canvas');
    merged.width = this._contentCanvas!.width;
    merged.height = this._contentCanvas!.height;
    const mctx = merged.getContext('2d')!;
    mctx.drawImage(this._contentCanvas!, 0, 0);
    mctx.drawImage(this._annotCanvas!, 0, 0);
    const imgDataUrl = merged.toDataURL('image/png');

    await browser.runtime.sendMessage({
      action: 'generateHTML',
      canvasDataURL: imgDataUrl,
      title: document.title,
      sourceUrl: location.href,
      contentHTML: '',
      textNotes: [],
      mode: 'canvas',
    });
  }

  private async _exportDOMHTML(): Promise<void> {
    const contentHTML = this.contentContainer.innerHTML;
    const canvasDataUrl = this.canvas.toDataURL('image/png');
    const canvasRect = this.canvas.getBoundingClientRect();

    const notes = this.textNotes.map((n) => {
      const el = n.el;
      return {
        x: n.x,
        y: n.y,
        text: el.textContent || '',
        style: el.getAttribute('style') || '',
      };
    });

    await browser.runtime.sendMessage({
      action: 'generateHTML',
      canvasDataURL: canvasDataUrl,
      title: document.title,
      sourceUrl: location.href,
      contentHTML,
      textNotes: notes,
      mode: 'dom',
      canvasWidth: canvasRect.width,
      canvasHeight: canvasRect.height,
    });
  }

  // ── Export: PDF ────────────────────────────

  async exportPDF(): Promise<void> {
    if (this.mode === 'canvas') {
      await this._exportCanvasPDF();
    } else {
      await this._exportDOMPDF();
    }
  }

  private async _exportCanvasPDF(): Promise<void> {
    const merged = document.createElement('canvas');
    merged.width = this._contentCanvas!.width;
    merged.height = this._contentCanvas!.height;
    const mctx = merged.getContext('2d')!;
    mctx.drawImage(this._contentCanvas!, 0, 0);
    mctx.drawImage(this._annotCanvas!, 0, 0);
    const imgDataUrl = merged.toDataURL('image/png');

    await browser.runtime.sendMessage({
      action: 'generatePDF',
      canvasDataURL: imgDataUrl,
      title: document.title,
      canvasWidth: merged.width,
      canvasHeight: merged.height,
    });
  }

  private async _exportDOMPDF(): Promise<void> {
    // Build composite canvas in content script (needs html2canvas DOM access),
    // then send to background for jspdf + download.
    try {
      const wrapper = document.createElement('div');
      wrapper.style.cssText =
        'position:fixed;left:-9999px;top:0;width:900px;background:#fff;padding:20px;' +
        'font-family:system-ui,-apple-system,sans-serif;font-size:16px;line-height:1.6;color:#333;';

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

      const contentArea = document.createElement('div');
      contentArea.style.cssText = 'position:relative;width:100%;';
      contentArea.innerHTML = this.contentContainer.innerHTML;

      this.textNotes.forEach((n) => {
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

      const images = wrapper.querySelectorAll('img');
      await Promise.all(
        Array.from(images).map(
          (img) =>
            new Promise<void>((resolve) => {
              if (img.complete) { resolve(); return; }
              img.onload = () => resolve();
              img.onerror = () => resolve();
            }),
        ),
      );

      const contentCanvas = await html2canvas(wrapper, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
      });

      const contentAreaRect = contentArea.getBoundingClientRect();
      const wrapperRect = wrapper.getBoundingClientRect();
      const offsetX = (contentAreaRect.left - wrapperRect.left) * 2;
      const offsetY = (contentAreaRect.top - wrapperRect.top) * 2;

      const compositeCtx = contentCanvas.getContext('2d')!;
      compositeCtx.drawImage(this.canvas, offsetX, offsetY, this.canvas.width, this.canvas.height);

      document.body.removeChild(wrapper);

      const imgDataUrl = contentCanvas.toDataURL('image/png');

      await browser.runtime.sendMessage({
        action: 'generatePDF',
        canvasDataURL: imgDataUrl,
        title: document.title,
        canvasWidth: contentCanvas.width,
        canvasHeight: contentCanvas.height,
      });
    } catch (err) {
      console.error('PDF export failed:', err);
      alert('PDF export failed. See console for details.');
    }
  }

  // ── Helpers ────────────────────────────────

  private _downloadFile(filename: string, content: string, mimeType: string): void {
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

  // ── Lifecycle ──────────────────────────────

  syncSize(): void {
    if (this.mode === 'canvas') {
      this._syncCanvasWrapperSize();
    } else {
      this._syncCanvasSize();
    }
  }

  async show(): Promise<void> {
    if (this._enteringCanvasMode) return;
    this._enteringCanvasMode = true;
    this.toolbar.classList.remove('hidden');
    this.tool = 'pen';
    this._updateToolbarActive();
    await this.enterCanvasMode();
    this._enteringCanvasMode = false;
  }

  hide(): void {
    this._enteringCanvasMode = false;
    this.toolbar.classList.add('hidden');
    if (this.mode === 'canvas') {
      this.exitCanvasMode();
    }
    this.setTool('none');
    this.layer.classList.remove('active');
  }

  private _syncCanvasWrapperSize(): void {
    if (!this._canvasWrapper || !this._contentCanvas) return;
    this._syncCanvasSize();
  }

  destroy(): void {
    const removeCanvasListeners = (c: HTMLCanvasElement | null) => {
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
      this._onDocumentClick = null!;
    }

    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }

    if (this._textInputEl) {
      this._textInputEl.remove();
      this._textInputEl = null;
    }

    this.textNotes.forEach((n) => n.el.remove());
    this.textNotes = [];

    if (this.toolbar) { this.toolbar.remove(); this.toolbar = null!; }
    if (this.layer) { this.layer.remove(); this.layer = null!; }
    if (this._canvasWrapper) { this._canvasWrapper.remove(); this._canvasWrapper = null; }

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
