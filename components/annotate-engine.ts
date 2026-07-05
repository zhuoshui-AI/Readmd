import html2canvas from 'html2canvas';
import '../styles/annotate.css';

// ── Constants ────────────────────────────────────

const ANNOTATION_COLORS = [
  '#e74c3c99', '#e67e2299', '#f1c40f99', '#2ecc7199',
  '#3498db99', '#9b59b699', '#2c3e5099', '#ecf0f199',
];

/** Maps theme names to their background colors (from content.css) */
const THEME_BG_COLORS: Record<string, string> = {
  light: '#fbfbf9',
  yellow: '#fbf0d9',
  green: '#cce8cf',
  purple: '#efe9fb',
  gray: '#f1f3f5',
  blue: '#eaf4ff',
  dark: '#1e1e1e',
  'dark-purple': '#341664',
  'dark-gray': '#60615f',
  'dark-blue': '#315a99',
};

const PEN_SIZES = [
  { label: 'S', value: 4 },
  { label: 'M', value: 8 },
  { label: 'L', value: 16 },
];

const MAX_UNDO = 50;

const HIGHLIGHTER_WIDTH = 18; // wider than pen for highlighter feel

interface DOMHighlight {
  id: string;
  color: string;
  startPath: number[];
  startOffset: number;
  endPath: number[];
  endOffset: number;
  text: string;
}

interface UndoSnapshot {
  canvasData: ImageData;
  textState: Array<{ x: number; y: number; text: string; noteId: string }>;
  canvasTextNotes?: CanvasTextNote[];
  domHighlights?: DOMHighlight[];
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

  tool: 'pen' | 'eraser' | 'text' | 'highlight' | 'none' = 'pen';
  color = ANNOTATION_COLORS[0];
  lineWidth = PEN_SIZES[1].value;
  opacity = 1; // 0–1, applied to pen strokes
  cursorMode: 'draw' | 'pan' = 'draw';

  private isDrawing = false;
  private lastPoint: { x: number; y: number } | null = null;
  private isPanning = false;
  private panStart: { x: number; y: number; scrollX: number; scrollY: number } | null = null;

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

  // ── Highlight state ───────────────────────
  private _domHighlights: DOMHighlight[] = [];
  private _highlightIdCounter = 0;
  private _floatingPalette: HTMLElement | null = null;
  private _onContentMouseUp: ((e: MouseEvent) => void) | null = null;
  private _dismissPaletteHandler: ((e: MouseEvent) => void) | null = null;

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

    const opacityPct = Math.round(this.opacity * 100);

    return `
      <button class="annotate-tool-btn active" data-tool="pen" data-tooltip="Pen (A)">✏️</button>
      <button class="annotate-tool-btn" data-tool="eraser" data-tooltip="Eraser (E)">🧹</button>
      <button class="annotate-tool-btn" data-tool="text" data-tooltip="Text (T)">💬</button>
      <button class="annotate-tool-btn" data-tool="highlight" data-tooltip="Highlight (H)">🖍️</button>
      <span class="annotate-separator"></span>
      <button class="annotate-cursor-btn active" data-action="toggleCursor" data-tooltip="Draw (D)">✚</button>
      <span class="annotate-separator"></span>
      <div class="annotate-colors">${colorSwatches}</div>
      <div class="annotate-color-pick-group">
        <span class="annotate-color-dot" style="background:${this.color};opacity:${this.opacity}"></span>
        <label class="annotate-color-pick-btn" data-tooltip="取色盘">
          🎨
          <input type="color" class="annotate-color-pick-input" value="${this.color}">
        </label>
      </div>
      <span class="annotate-separator"></span>
      <div class="annotate-sizes">${sizeBtns}</div>
      <span class="annotate-separator"></span>
      <div class="annotate-opacity-group">
        <span class="annotate-opacity-label">透明</span>
        <input type="range" class="annotate-opacity-slider" min="10" max="100" value="${opacityPct}" data-tooltip="不透明度">
        <span class="annotate-opacity-val">${opacityPct}%</span>
      </div>
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

    // ── Color picker: label wraps hidden input, click triggers native picker ──
    const colorDot = this.toolbar.querySelector('.annotate-color-dot') as HTMLElement;
    const colorPickInput = this.toolbar.querySelector('.annotate-color-pick-input') as HTMLInputElement;

    // Clicking the color dot also opens the picker via the label
    if (colorDot) {
      colorDot.addEventListener('click', () => {
        const label = this.toolbar.querySelector('.annotate-color-pick-btn') as HTMLElement;
        if (label) label.click();
      });
    }

    if (colorPickInput) {
      colorPickInput.addEventListener('input', () => {
        this.setColor(colorPickInput.value);
      });
    }

    // ── Opacity slider ──
    const opacitySlider = this.toolbar.querySelector('.annotate-opacity-slider') as HTMLInputElement;
    const opacityVal = this.toolbar.querySelector('.annotate-opacity-val') as HTMLElement;
    if (opacitySlider) {
      opacitySlider.addEventListener('input', () => {
        const val = Number(opacitySlider.value);
        this.setOpacity(val);
        if (opacityVal) opacityVal.textContent = `${val}%`;
        if (colorDot) colorDot.style.opacity = String(val / 100);
      });
    }

    // ── Action buttons ──
    this.toolbar.querySelectorAll('[data-action]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const action = (btn as HTMLElement).dataset.action;
        switch (action) {
          case 'undo': this.undo(); break;
          case 'redo': this.redo(); break;
          case 'clear': this.clearAll(); break;
          case 'toggleCursor':
            this._toggleCursorMode();
            break;
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

  // ── Theme Background ───────────────────────

  /** Read the current theme's background color from the overlay's data-theme attribute */
  private _getThemeBackgroundColor(): string {
    const theme = this.overlay.getAttribute('data-theme') || 'light';
    return THEME_BG_COLORS[theme] || '#fbfbf9';
  }

  // ── Canvas Mode ────────────────────────────

  private async enterCanvasMode(): Promise<void> {
    if (this.mode === 'canvas') return;

    try {
      const bgColor = this._getThemeBackgroundColor();
      const snapshotCanvas = await html2canvas(this.contentContainer, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: bgColor,
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
      this._applyCursor();
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
    this.layer.style.cursor = '';
    this.setTool('none');
  }

  private _redrawCanvasModeTexts(): void {
    if (!this._annotCanvas) return;
    const ctx = this._annotCanvas.getContext('2d')!;
    this._canvasModeTextNotes.forEach((n) => {
      ctx.save();
      ctx.font = '14px system-ui, -apple-system, sans-serif';
      ctx.fillStyle = n.color || '#333';
      const lines = (n.text || '').split('\n');
      const lineHeight = 20;
      lines.forEach((line, i) => {
        // ctx is already scaled by dpr, so use CSS coordinates directly
        ctx.fillText(line, n.x, n.y + (i + 1) * lineHeight);
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
          // ctx is already scaled by dpr, so use CSS coordinates directly
          ctx.fillText(line, x, y + (i + 1) * lineHeight);
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

    // MouseUp listener on content container for highlight text selection
    this._onContentMouseUp = this._onContentMouseUpHandler.bind(this);
    this.contentContainer.addEventListener('mouseup', this._onContentMouseUp);

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
    // rect is already in viewport coordinates — clientX/Y minus rect position
    // gives canvas-relative coordinates directly (scroll is already factored in)
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  }

  private _getScrollContainer(): HTMLElement | null {
    if (this.mode === 'canvas') return this._canvasWrapper;
    return this.overlay;
  }

  private _onPointerDownHandler(e: PointerEvent): void {
    // ── Pan mode ──
    if (this.cursorMode === 'pan') {
      const scrollEl = this._getScrollContainer();
      if (!scrollEl) return;
      this.isPanning = true;
      this.panStart = {
        x: e.clientX,
        y: e.clientY,
        scrollX: scrollEl.scrollLeft,
        scrollY: scrollEl.scrollTop,
      };
      scrollEl.style.cursor = 'grabbing';
      return;
    }

    // ── Draw mode ──
    if (this.tool === 'none') return;

    if (this.tool === 'text') {
      const pos = this._getCanvasPos(e);
      this._addTextNote(pos.x, pos.y);
      return;
    }

    if (this.tool === 'highlight' && this.mode !== 'canvas') {
      // In DOM mode, highlight uses text selection — not freehand drawing
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
    // ── Pan mode ──
    if (this.isPanning && this.panStart) {
      const scrollEl = this._getScrollContainer();
      if (!scrollEl) return;
      const dx = this.panStart.x - e.clientX;
      const dy = this.panStart.y - e.clientY;
      scrollEl.scrollLeft = this.panStart.scrollX + dx;
      scrollEl.scrollTop = this.panStart.scrollY + dy;
      return;
    }

    // ── Draw mode ──
    if (!this.isDrawing) return;
    if (this.tool === 'none' || this.tool === 'text') return;

    const pos = this._getCanvasPos(e);
    const ctx = this.ctx;

    if (this.tool === 'highlight') {
      // Fluorescent highlighter: wide, very translucent
      ctx.globalAlpha = this.opacity * 0.25;
      ctx.lineWidth = HIGHLIGHTER_WIDTH;
      ctx.strokeStyle = this.color;
      ctx.globalCompositeOperation = 'source-over';
    } else {
      ctx.lineWidth = this.lineWidth;
      ctx.strokeStyle = this.color;

      if (this.tool === 'eraser') {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.strokeStyle = 'rgba(0,0,0,1)';
        ctx.globalAlpha = 1;
      } else {
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = this.opacity;
      }
    }

    ctx.beginPath();
    ctx.moveTo(this.lastPoint!.x, this.lastPoint!.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();

    this.lastPoint = pos;
  }

  private _onPointerUpHandler(_e: PointerEvent): void {
    // ── Pan mode ──
    if (this.isPanning) {
      this.isPanning = false;
      this.panStart = null;
      const scrollEl = this._getScrollContainer();
      if (scrollEl) scrollEl.style.cursor = 'grab';
      return;
    }

    // ── Draw mode ──
    if (!this.isDrawing) return;
    this.isDrawing = false;
    this.lastPoint = null;
    this.ctx.globalCompositeOperation = 'source-over';
    this.ctx.globalAlpha = 1.0;
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
    else if (e.key === 'h' || e.key === 'H') this.setTool('highlight');
    else if (e.key === 'd' || e.key === 'D') this._toggleCursorMode();
    else if (e.key === 'Escape') this.setTool('none');
  }

  // ── Tool / Color / Size ────────────────────

  setTool(tool: string): void {
    const prevTool = this.tool;
    this.tool = tool as 'pen' | 'eraser' | 'text' | 'highlight' | 'none';
    this._updateToolbarActive();

    // Hide floating palette when switching away from highlight
    if (prevTool === 'highlight' && tool !== 'highlight') {
      this._hideHighlightPalette();
    }

    if (tool === 'none') {
      this.layer.classList.remove('active');
    } else {
      this.layer.classList.add('active');
    }

    // Handle DOM ↔ Canvas mode transitions
    // Switching from highlight (DOM mode) to a canvas tool → enter canvas mode
    if (prevTool === 'highlight' && tool !== 'highlight' && tool !== 'none' && this.mode !== 'canvas') {
      this.enterCanvasMode().catch((err: Error) => {
        console.error('Failed to enter canvas mode on tool switch:', err);
      });
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

  setOpacity(opacity: number): void {
    this.opacity = Math.max(0.1, Math.min(1, opacity / 100));
  }

  private _toggleCursorMode(): void {
    this.cursorMode = this.cursorMode === 'draw' ? 'pan' : 'draw';
    this._applyCursor();
    this._updateToolbarActive();
    // Exit drawing state when switching to pan
    if (this.cursorMode === 'pan') {
      this.isDrawing = false;
      this.lastPoint = null;
    }
  }

  private _applyCursor(): void {
    const activeCanvas = this.mode === 'canvas' ? this._annotCanvas : this.canvas;
    if (this.cursorMode === 'pan') {
      if (activeCanvas) activeCanvas.style.cursor = 'grab';
      this.layer.style.cursor = 'grab';
      if (this._canvasWrapper) this._canvasWrapper.style.cursor = 'grab';
    } else {
      // draw mode — keep default cursor, unchanged from original behavior
      if (activeCanvas) activeCanvas.style.cursor = '';
      this.layer.style.cursor = '';
      if (this._canvasWrapper) this._canvasWrapper.style.cursor = '';
    }
  }

  private _updateToolbarActive(): void {
    if (!this.toolbar) return;

    // Cursor mode button
    const cursorBtn = this.toolbar.querySelector('.annotate-cursor-btn') as HTMLElement;
    if (cursorBtn) {
      cursorBtn.classList.toggle('active', this.cursorMode === 'draw');
      cursorBtn.textContent = this.cursorMode === 'draw' ? '✚' : '🖐';
      cursorBtn.setAttribute('data-tooltip', this.cursorMode === 'draw' ? 'Draw (D)' : 'Pan (D)');
    }

    this.toolbar.querySelectorAll('[data-tool]').forEach((btn) => {
      btn.classList.toggle('active', (btn as HTMLElement).dataset.tool === this.tool);
    });

    this.toolbar.querySelectorAll('.annotate-color-swatch').forEach((s) => {
      s.classList.toggle('active', (s as HTMLElement).dataset.color === this.color && this.tool !== 'eraser');
    });

    this.toolbar.querySelectorAll('.annotate-size-btn').forEach((b) => {
      b.classList.toggle('active', Number((b as HTMLElement).dataset.size) === this.lineWidth);
    });

    // Refresh color dot & hidden input
    const colorDot = this.toolbar.querySelector('.annotate-color-dot') as HTMLElement;
    const colorPickInput = this.toolbar.querySelector('.annotate-color-pick-input') as HTMLInputElement;
    if (colorDot) {
      colorDot.style.background = this.color;
      colorDot.style.opacity = String(this.opacity);
    }
    if (colorPickInput) colorPickInput.value = this.color;

    // Refresh opacity slider
    const opacitySlider = this.toolbar.querySelector('.annotate-opacity-slider') as HTMLInputElement;
    const opacityVal = this.toolbar.querySelector('.annotate-opacity-val') as HTMLElement;
    if (opacitySlider) opacitySlider.value = String(Math.round(this.opacity * 100));
    if (opacityVal) opacityVal.textContent = `${Math.round(this.opacity * 100)}%`;

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

  // ── DOM Highlight Engine ───────────────────

  /** Walk from node up to root, recording childNode indices at each level */
  private _getNodePath(node: Node, root: Node): number[] {
    const path: number[] = [];
    let current: Node | null = node;
    while (current && current !== root) {
      const parent: Node | null = current.parentNode;
      if (!parent) break;
      path.unshift(Array.from(parent.childNodes).indexOf(current as ChildNode));
      current = parent;
    }
    return path;
  }

  /** Walk from root following indices to resolve a node */
  private _resolveNodePath(path: number[], root: Node): Node | null {
    let current: Node = root;
    for (const idx of path) {
      if (idx >= current.childNodes.length) return null;
      current = current.childNodes[idx];
    }
    return current;
  }

  /** Core algorithm: wrap selected portions of text nodes in &lt;mark&gt; elements */
  private _highlightRange(range: Range, color: string, id: string): void {
    // Try surroundContents for simple cases (selection within a single element)
    try {
      const mark = document.createElement('mark');
      mark.setAttribute('data-highlight-id', id);
      mark.setAttribute('data-highlight-color', color);
      mark.style.backgroundColor = color;
      mark.style.color = 'inherit';
      range.surroundContents(mark);
      return;
    } catch {
      // Range crosses element boundaries — use text-node iteration
    }

    const textNodes: Text[] = [];
    const walker = document.createTreeWalker(
      range.commonAncestorContainer,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) =>
          range.intersectsNode(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT,
      },
    );
    let node: Text | null;
    while ((node = walker.nextNode() as Text | null)) {
      textNodes.push(node);
    }

    if (textNodes.length === 0) return;

    for (const textNode of textNodes) {
      let startOffset = 0;
      let endOffset = textNode.length;

      if (textNode === range.startContainer) {
        startOffset = range.startOffset;
      }
      if (textNode === range.endContainer) {
        endOffset = range.endOffset;
      }

      if (startOffset >= endOffset) continue;

      // Split at end first (preserves start offset)
      const afterSplit = textNode.splitText(endOffset);
      // Split at start — middleSplit holds exactly the selected portion
      const middleSplit = textNode.splitText(startOffset);

      const mark = document.createElement('mark');
      mark.setAttribute('data-highlight-id', id);
      mark.setAttribute('data-highlight-color', color);
      mark.style.backgroundColor = color;
      mark.style.color = 'inherit';
      mark.textContent = middleSplit.textContent;
      middleSplit.replaceWith(mark);
    }

    // Merge adjacent marks of the same color
    this._normalizeHighlights(range.commonAncestorContainer as HTMLElement);
  }

  /** Merge adjacent &lt;mark&gt; siblings that share the same color */
  private _normalizeHighlights(root: HTMLElement): void {
    const marks = root.querySelectorAll('mark[data-highlight-id]');
    marks.forEach((mark) => {
      const next = mark.nextElementSibling;
      if (
        next &&
        next.tagName === 'MARK' &&
        next.getAttribute('data-highlight-color') === mark.getAttribute('data-highlight-color')
      ) {
        // Move children from next into mark
        while (next.firstChild) {
          mark.appendChild(next.firstChild);
        }
        next.remove();
      }
    });
  }

  /** Serialize highlights for undo snapshot */
  private _serializeHighlights(): DOMHighlight[] {
    return this._domHighlights.map((h) => ({
      id: h.id,
      color: h.color,
      startPath: [...h.startPath],
      startOffset: h.startOffset,
      endPath: [...h.endPath],
      endOffset: h.endOffset,
      text: h.text,
    }));
  }

  /** Remove all &lt;mark&gt; elements from the content container */
  private _removeAllHighlightsFromDOM(): void {
    if (!this.contentContainer) return;
    const marks = this.contentContainer.querySelectorAll('mark[data-highlight-id]');
    marks.forEach((mark) => {
      const parent = mark.parentNode;
      if (!parent) return;
      while (mark.firstChild) {
        parent.insertBefore(mark.firstChild, mark);
      }
      parent.removeChild(mark);
    });
    // Normalize text nodes after unwrapping
    if (this.contentContainer.normalize) {
      this.contentContainer.normalize();
    }
  }

  /** Restore highlights from stored data */
  private _applyHighlightsToDOM(highlights: DOMHighlight[]): void {
    if (!highlights.length) return;
    if (!this.contentContainer) return;

    for (const hl of highlights) {
      const startNode = this._resolveNodePath(hl.startPath, this.contentContainer);
      const endNode = this._resolveNodePath(hl.endPath, this.contentContainer);

      let range: Range | null = null;

      if (startNode && endNode) {
        try {
          range = document.createRange();
          range.setStart(startNode, Math.min(hl.startOffset, (startNode as Text).length || 0));
          range.setEnd(endNode, Math.min(hl.endOffset, (endNode as Text).length || 0));
        } catch {
          range = null;
        }
      }

      // Fallback: search by text content
      if (!range) {
        const found = this._findTextRange(hl.text, this.contentContainer);
        if (found) {
          range = found;
        }
      }

      if (range) {
        try {
          this._highlightRange(range, hl.color, hl.id);
        } catch {
          // Skip if highlighting fails
        }
      }
    }
  }

  /** Fallback: find a text range by searching for matching text content */
  private _findTextRange(text: string, root: Element): Range | null {
    if (!text || text.length < 2) return null;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node: Text | null;
    while ((node = walker.nextNode() as Text | null)) {
      const idx = (node.textContent || '').indexOf(text);
      if (idx !== -1) {
        const range = document.createRange();
        range.setStart(node, idx);
        range.setEnd(node, idx + text.length);
        return range;
      }
    }
    return null;
  }

  /** Apply DOM highlight from current text selection */
  private _applyDOMHighlight(color: string): void {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;

    const id = `hl-${this._highlightIdCounter++}`;
    const range = selection.getRangeAt(0);

    // Check selection is within content container
    if (!this.contentContainer) return;
    if (
      !this.contentContainer.contains(range.commonAncestorContainer)
    ) {
      return;
    }

    const text = selection.toString().trim();
    if (!text) return;

    this._pushUndo({ type: 'highlight' });

    this._highlightRange(range, color, id);

    this._domHighlights.push({
      id,
      color,
      startPath: this._getNodePath(range.startContainer, this.contentContainer),
      startOffset: range.startOffset,
      endPath: this._getNodePath(range.endContainer, this.contentContainer),
      endOffset: range.endOffset,
      text,
    });

    selection.removeAllRanges();
    this._updateToolbarActive();
  }

  /** Remove a single highlight mark */
  private _removeHighlightMark(markEl: HTMLElement): void {
    const id = markEl.getAttribute('data-highlight-id');
    if (!id) return;

    this._pushUndo({ type: 'highlight' });

    const parent = markEl.parentNode;
    if (parent) {
      while (markEl.firstChild) {
        parent.insertBefore(markEl.firstChild, markEl);
      }
      parent.removeChild(markEl);
      (parent as Node).normalize();
    }

    this._domHighlights = this._domHighlights.filter((h) => h.id !== id);
    this._updateToolbarActive();
  }

  // ── Floating Highlight Palette ─────────────

  private _onContentMouseUpHandler(e: MouseEvent): void {
    if (this.tool !== 'highlight') return;

    // Small delay to let the selection settle
    setTimeout(() => {
      if (this.tool !== 'highlight') return;

      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) {
        this._hideHighlightPalette();
        return;
      }

      const range = selection.getRangeAt(0);
      if (!this.contentContainer) return;

      // Check if selection is within content container
      if (!this.contentContainer.contains(range.commonAncestorContainer)) {
        this._hideHighlightPalette();
        return;
      }

      // Check if click is on an existing highlight mark
      const target = e.target as HTMLElement;
      const mark = target.closest('mark[data-highlight-id]');
      if (mark && this.contentContainer.contains(mark)) {
        // In highlight mode, clicking a mark shows remove option in palette
        this._showHighlightPalette(range.getBoundingClientRect(), mark as HTMLElement);
        return;
      }

      const text = selection.toString().trim();
      if (!text) {
        this._hideHighlightPalette();
        return;
      }

      this._showHighlightPalette(range.getBoundingClientRect(), null);
    }, 10);
  }

  private _showHighlightPalette(rect: DOMRect, existingMark: HTMLElement | null): void {
    this._hideHighlightPalette();

    const palette = document.createElement('div');
    palette.id = 'readmd-highlight-palette';

    // Color swatches
    ANNOTATION_COLORS.forEach((c) => {
      const swatch = document.createElement('span');
      swatch.className = 'hl-color-swatch';
      swatch.style.backgroundColor = c;
      swatch.title = c;
      swatch.addEventListener('mousedown', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        if (existingMark) {
          // If clicking on an existing mark, recolor it
          existingMark.style.backgroundColor = c;
          existingMark.setAttribute('data-highlight-color', c);
          const id = existingMark.getAttribute('data-highlight-id');
          if (id) {
            const hl = this._domHighlights.find((h) => h.id === id);
            if (hl) hl.color = c;
          }
        } else {
          this._applyDOMHighlight(c);
        }
        this._hideHighlightPalette();
      });
      palette.appendChild(swatch);
    });

    // Remove button
    if (existingMark) {
      const sep = document.createElement('span');
      sep.style.cssText = 'width:1px;height:20px;background:#ddd;margin:0 2px;';
      palette.appendChild(sep);

      const removeBtn = document.createElement('span');
      removeBtn.className = 'hl-remove-btn';
      removeBtn.textContent = '×';
      removeBtn.title = 'Remove highlight';
      removeBtn.addEventListener('mousedown', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        this._removeHighlightMark(existingMark);
        this._hideHighlightPalette();
      });
      palette.appendChild(removeBtn);
    }

    // Position palette
    document.body.appendChild(palette);

    const paletteW = palette.offsetWidth;
    const paletteH = palette.offsetHeight;
    const margin = 10;

    let left = rect.left + rect.width / 2 - paletteW / 2;
    let top = rect.bottom + 8;

    // Clamp horizontally
    if (left < margin) left = margin;
    if (left + paletteW > window.innerWidth - margin) {
      left = window.innerWidth - paletteW - margin;
    }

    // If too close to bottom, show above
    if (top + paletteH > window.innerHeight - margin) {
      top = rect.top - paletteH - 8;
    }
    if (top < margin) top = margin;

    palette.style.cssText += `left:${left}px;top:${top}px;`;

    this._floatingPalette = palette;

    // Dismiss on outside click
    this._dismissPaletteHandler = (ev: MouseEvent) => {
      if (!palette.contains(ev.target as Node)) {
        this._hideHighlightPalette();
      }
    };
    setTimeout(() => {
      if (this._floatingPalette === palette) {
        document.addEventListener('mousedown', this._dismissPaletteHandler!);
      }
    }, 0);
  }

  private _hideHighlightPalette(): void {
    if (this._floatingPalette) {
      this._floatingPalette.remove();
      this._floatingPalette = null;
    }
    if (this._dismissPaletteHandler) {
      document.removeEventListener('mousedown', this._dismissPaletteHandler);
      this._dismissPaletteHandler = null;
    }
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
      // Also snapshot canvas-mode text notes so undo/redo tracks them
      canvasTextNotes: this._canvasModeTextNotes.map((n) => ({ ...n })),
      domHighlights: this._serializeHighlights(),
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
      canvasTextNotes: this._canvasModeTextNotes.map((n) => ({ ...n })),
      domHighlights: this._serializeHighlights(),
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
      canvasTextNotes: this._canvasModeTextNotes.map((n) => ({ ...n })),
      domHighlights: this._serializeHighlights(),
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

    // Restore DOM text notes
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

    // Restore canvas-mode text notes
    this._canvasModeTextNotes = (snapshot.canvasTextNotes || []).map((n) => ({ ...n }));

    // Restore DOM highlights
    this._removeAllHighlightsFromDOM();
    this._domHighlights = (snapshot.domHighlights || []).map((h) => ({
      id: h.id, color: h.color,
      startPath: [...h.startPath], startOffset: h.startOffset,
      endPath: [...h.endPath], endOffset: h.endOffset,
      text: h.text,
    }));
    this._applyHighlightsToDOM(this._domHighlights);
  }

  // ── Clear ──────────────────────────────────

  clearAll(): void {
    this._pushUndo({ type: 'clear' });
    const { w, h } = this._activeCanvasSize();
    this.ctx.clearRect(0, 0, w, h);
    this.textNotes.forEach((n) => n.el.remove());
    this.textNotes = [];
    this._canvasModeTextNotes = [];
    this._removeAllHighlightsFromDOM();
    this._domHighlights = [];
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
      const bgColor = this._getThemeBackgroundColor();
      const wrapper = document.createElement('div');
      wrapper.style.cssText =
        `position:fixed;left:-9999px;top:0;width:900px;background:${bgColor};padding:20px;` +
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
        backgroundColor: this._getThemeBackgroundColor(),
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

  async show(initialTool: string = 'pen', initialColor?: string, initialSize?: number, initialOpacity?: number): Promise<void> {
    if (this._enteringCanvasMode) return;
    this._enteringCanvasMode = true;
    this.toolbar.classList.remove('hidden');
    if (initialColor) this.color = initialColor;
    if (initialSize) this.lineWidth = initialSize;
    if (initialOpacity !== undefined) this.setOpacity(initialOpacity);
    this.tool = initialTool as 'pen' | 'eraser' | 'text' | 'highlight' | 'none';
    this._updateToolbarActive();
    this._applyCursor();

    if (initialTool === 'highlight') {
      // Stay in DOM mode for text selection highlighting
      this.layer.classList.add('active');
    } else {
      await this.enterCanvasMode();
    }
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

    // Clean up highlights
    this._hideHighlightPalette();
    this._removeAllHighlightsFromDOM();
    this._domHighlights = [];
    if (this._onContentMouseUp && this.contentContainer) {
      this.contentContainer.removeEventListener('mouseup', this._onContentMouseUp);
      this._onContentMouseUp = null;
    }

    if (this.toolbar) { this.toolbar.remove(); this.toolbar = null!; }
    if (this.layer) { this.layer.remove(); this.layer = null!; }
    if (this._canvasWrapper) { this._canvasWrapper.remove(); this._canvasWrapper = null; }

    this._contentCanvas = null;
    this._annotCanvas = null;
    this._canvasModeTextNotes = [];
    this.undoStack = [];
    this.redoStack = [];
    this.isDrawing = false;
    this.isPanning = false;
    this.panStart = null;
    this.lastPoint = null;
    this.cursorMode = 'draw';
    this.mode = 'dom';
    this.tool = 'none';
    this._enteringCanvasMode = false;
  }
}
