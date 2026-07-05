import { Readability } from '@mozilla/readability';
import {
  theme,
  layout,
  fontSize,
  getProgressStorageKey,
  createProgressStorage,
  type ReadingProgressSnapshot,
} from './storage';

export class ReaderMode {
  private overlay: HTMLElement | null = null;
  private contentContainer: HTMLElement | null = null;
  private isActive = false;
  private cachedExtractedHtml = '';
  private cachedContentKey = '';
  private readingProgressSnapshot: ReadingProgressSnapshot | null = null;
  private scrollSaveTimer: ReturnType<typeof setTimeout> | null = null;
  private scrollbarHideTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingPersistSnapshot: ReadingProgressSnapshot | null = null;
  private persistHandle: number | ReturnType<typeof setTimeout> | null = null;

  // ── Progress Helpers ──────────────────────

  private getCurrentLayout(): string {
    if (!this.overlay) return 'single';
    return this.overlay.getAttribute('data-layout') || 'single';
  }

  private getScrollAxis(layoutStr = this.getCurrentLayout()): 'x' | 'y' {
    return layoutStr === 'double' ? 'x' : 'y';
  }

  private clampProgressRatio(value: number): number {
    if (Number.isNaN(value)) return 0;
    return Math.max(0, Math.min(1, value));
  }

  private getReadingProgressSnapshot(layoutStr = this.getCurrentLayout()): ReadingProgressSnapshot | null {
    if (!this.overlay) return null;
    const axis = this.getScrollAxis(layoutStr);
    const max =
      axis === 'x'
        ? Math.max(this.overlay.scrollWidth - this.overlay.clientWidth, 0)
        : Math.max(this.overlay.scrollHeight - this.overlay.clientHeight, 0);
    const position = axis === 'x' ? this.overlay.scrollLeft : this.overlay.scrollTop;
    const ratio = max > 0 ? position / max : 0;
    return {
      ratio: this.clampProgressRatio(ratio),
      layout: layoutStr as ReadingProgressSnapshot['layout'],
      updatedAt: Date.now(),
    };
  }

  private getPageProgressSnapshot(): ReadingProgressSnapshot | null {
    const el = document.scrollingElement || document.documentElement || document.body;
    if (!el) return null;
    const max = Math.max(el.scrollHeight - el.clientHeight, 0);
    const ratio = max > 0 ? el.scrollTop / max : 0;
    return { ratio: this.clampProgressRatio(ratio), layout: 'page', updatedAt: Date.now() };
  }

  private flushPendingProgressPersist(): void {
    if (!this.pendingPersistSnapshot) return;
    const snapshot = this.pendingPersistSnapshot;
    this.pendingPersistSnapshot = null;
    const key = getProgressStorageKey(location);
    const storage = createProgressStorage(key);
    storage.setValue(snapshot);
  }

  private scheduleProgressPersist(): void {
    if (this.persistHandle) return;
    if ('requestIdleCallback' in window) {
      this.persistHandle = window.requestIdleCallback(
        () => {
          this.persistHandle = null;
          this.flushPendingProgressPersist();
        },
        { timeout: 500 },
      );
      return;
    }
    this.persistHandle = setTimeout(() => {
      this.persistHandle = null;
      this.flushPendingProgressPersist();
    }, 160);
  }

  persistReadingProgress(snapshot: ReadingProgressSnapshot | null): void {
    if (!snapshot) return;
    this.readingProgressSnapshot = snapshot;
    this.pendingPersistSnapshot = snapshot;
    this.scheduleProgressPersist();
  }

  saveReadingProgress(): void {
    if (!this.overlay) return;
    const snapshot = this.getReadingProgressSnapshot();
    this.persistReadingProgress(snapshot);
  }

  applyReadingProgress(snapshot: ReadingProgressSnapshot, targetLayout = this.getCurrentLayout()): void {
    if (!this.overlay || !snapshot) return;
    const axis = this.getScrollAxis(targetLayout);
    const max =
      axis === 'x'
        ? Math.max(this.overlay.scrollWidth - this.overlay.clientWidth, 0)
        : Math.max(this.overlay.scrollHeight - this.overlay.clientHeight, 0);
    const target = Math.round(this.clampProgressRatio(snapshot.ratio) * max);
    if (axis === 'x') {
      this.overlay.scrollLeft = target;
    } else {
      this.overlay.scrollTop = target;
    }
  }

  applyPageProgress(snapshot: ReadingProgressSnapshot | null): void {
    if (!snapshot) return;
    const el = document.scrollingElement || document.documentElement || document.body;
    if (!el) return;
    const max = Math.max(el.scrollHeight - el.clientHeight, 0);
    const target = Math.round(this.clampProgressRatio(snapshot.ratio) * max);
    el.scrollTop = target;
  }

  async restoreReadingProgress(preferredSnapshot?: ReadingProgressSnapshot | null): Promise<void> {
    if (!this.overlay) return;

    const applyAsync = (snap: ReadingProgressSnapshot) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          this.applyReadingProgress(snap);
        });
      });
    };

    if (preferredSnapshot) {
      applyAsync(preferredSnapshot);
      return;
    }

    if (this.readingProgressSnapshot) {
      applyAsync(this.readingProgressSnapshot);
      return;
    }

    const key = getProgressStorageKey(location);
    const storage = createProgressStorage(key);
    const snapshot = await storage.getValue();
    if (!snapshot) return;
    this.readingProgressSnapshot = snapshot;
    applyAsync(snapshot);
  }

  // ── SVG Normalization ──────────────────────

  private isSvgResourceUrl(url = ''): boolean {
    if (!url) return false;
    const normalized = url.trim().toLowerCase();
    return normalized.startsWith('data:image/svg+xml') || /\.svg([?#].*)?$/.test(normalized);
  }

  private normalizeEmbeddedSvgElements(docRoot: Element): void {
    const candidates = docRoot.querySelectorAll('object[data], embed[src]');
    candidates.forEach((node) => {
      const sourceAttr = node.tagName === 'OBJECT' ? 'data' : 'src';
      const source = node.getAttribute(sourceAttr) || '';
      const type = (node.getAttribute('type') || '').toLowerCase();
      const isSvg = type.includes('image/svg+xml') || this.isSvgResourceUrl(source);
      if (!isSvg) return;

      const img = document.createElement('img');
      img.setAttribute('src', source);
      const altText = node.getAttribute('alt') || node.getAttribute('title') || node.getAttribute('aria-label') || '';
      if (altText) img.setAttribute('alt', altText);
      const width = node.getAttribute('width');
      const height = node.getAttribute('height');
      if (width) img.setAttribute('width', width);
      if (height) img.setAttribute('height', height);
      if (node.className) img.className = node.className;
      const style = node.getAttribute('style');
      if (style) img.setAttribute('style', style);
      node.replaceWith(img);
    });
  }

  private normalizeInlineSvgElements(docRoot: Element): void {
    const svgs = docRoot.querySelectorAll('svg');
    svgs.forEach((svg) => {
      if (!svg.getAttribute('xmlns')) svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      if (!svg.getAttribute('xmlns:xlink')) svg.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
      const linkedNodes = svg.querySelectorAll('[xlink\\:href], [href]');
      linkedNodes.forEach((lnode) => {
        const href = lnode.getAttribute('href');
        const xlinkHref = lnode.getAttribute('xlink:href');
        if (xlinkHref && !href) lnode.setAttribute('href', xlinkHref);
        if (href && !xlinkHref) lnode.setAttribute('xlink:href', href);
      });
    });
  }

  private stabilizeComplexInlineSvgElements(docRoot: Element): void {
    const svgs = docRoot.querySelectorAll('svg');
    svgs.forEach((svg) => {
      const hasRefGraph =
        svg.querySelector('defs, symbol, use') ||
        svg.querySelector('[xlink\\:href], [href^="#"]');
      if (!hasRefGraph) return;
      try {
        if (!svg.getAttribute('xmlns')) svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        if (!svg.getAttribute('xmlns:xlink')) svg.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
        const serialized = new XMLSerializer().serializeToString(svg);
        const dataUri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(serialized)}`;
        const img = document.createElement('img');
        img.setAttribute('src', dataUri);
        const className = svg.getAttribute('class');
        if (className) img.setAttribute('class', className);
        const width = svg.getAttribute('width');
        const height = svg.getAttribute('height');
        const styleParts: string[] = [];
        const isPlainNumber = (v: string) => /^\d+(\.\d+)?$/.test(v);
        if (width) {
          if (isPlainNumber(width)) img.setAttribute('width', width);
          else styleParts.push(`width:${width}`);
        }
        if (height) {
          if (isPlainNumber(height)) img.setAttribute('height', height);
          else styleParts.push(`height:${height}`);
        }
        const role = svg.getAttribute('role');
        if (role) img.setAttribute('role', role);
        const ariaLabel = svg.getAttribute('aria-label') || '';
        const titleNode = svg.querySelector('title');
        const titleText = titleNode ? (titleNode.textContent || '').trim() : '';
        img.setAttribute('alt', ariaLabel || titleText || '');
        const styleStr = svg.getAttribute('style');
        const normalizedStyle = 'max-width:100%;height:auto;';
        const sizeStyle = styleParts.length > 0 ? `${styleParts.join(';')};` : '';
        const mergedStyle = `${sizeStyle}${styleStr ? `${styleStr};` : ''}${normalizedStyle}`;
        img.setAttribute('style', mergedStyle);
        svg.replaceWith(img);
      } catch (error) {
        console.warn('Failed to stabilize inline SVG:', error);
      }
    });
  }

  // ── Content Extraction ────────────────────

  extractContentHtml(): string {
    try {
      const documentClone = document.cloneNode(true) as Document;
      this.normalizeEmbeddedSvgElements(documentClone);
      this.normalizeInlineSvgElements(documentClone);
      this.stabilizeComplexInlineSvgElements(documentClone);

      const reader = new Readability(documentClone, {
        serializer: (el: Element) => el.cloneNode(true) as Element,
      });
      const article = reader.parse();

      if (article?.content) {
        const container = documentClone.createElement('div');
        if (article.title) {
          const titleEl = documentClone.createElement('h1');
          titleEl.textContent = article.title;
          container.appendChild(titleEl);
        }
        if (typeof article.content === 'object' && article.content.nodeType === Node.ELEMENT_NODE) {
          container.appendChild(article.content);
          this.normalizeEmbeddedSvgElements(container);
          this.normalizeInlineSvgElements(container);
          this.stabilizeComplexInlineSvgElements(container);
          return container.innerHTML;
        }
        if (typeof article.content === 'string') {
          return (article.title ? `<h1>${article.title}</h1>` : '') + article.content;
        }
      }
    } catch (error) {
      console.error('Readability extraction failed:', error);
    }

    // Fallback
    let article = document.querySelector('article');
    if (!article) {
      const candidates = document.querySelectorAll('main, div.content, div.post, div.article, div.entry-content');
      let maxTextLength = 0;
      candidates.forEach((el) => {
        const len = (el as HTMLElement).innerText.length;
        if (len > maxTextLength) {
          maxTextLength = len;
          article = el;
        }
      });
    }
    if (!article) article = document.body;

    const clone = article.cloneNode(true) as HTMLElement;
    this.normalizeEmbeddedSvgElements(clone);
    this.normalizeInlineSvgElements(clone);
    this.stabilizeComplexInlineSvgElements(clone);

    const toRemove = clone.querySelectorAll('script, style, nav, aside, header, footer, iframe, noscript, .sidebar, .comments, .ad');
    toRemove.forEach((el) => el.remove());

    return clone.innerHTML;
  }

  // ── Code Block Normalization ──────────────

  private dedentCodeText(rawText: string): string {
    if (!rawText) return rawText;
    const lines = rawText.replace(/\r\n?/g, '\n').split('\n');
    let start = 0;
    let end = lines.length - 1;
    while (start <= end && lines[start].trim() === '') start += 1;
    while (end >= start && lines[end].trim() === '') end -= 1;
    if (start > end) return '';

    const contentLines = lines.slice(start, end + 1);
    let minIndent = Infinity;
    for (const line of contentLines) {
      if (line.trim() === '') continue;
      const match = line.match(/^[\t ]*/);
      const indent = match ? match[0].length : 0;
      if (indent < minIndent) minIndent = indent;
    }
    if (!Number.isFinite(minIndent) || minIndent <= 0) return contentLines.join('\n');
    return contentLines.map((line) => line.slice(minIndent)).join('\n');
  }

  private flattenPreRichText(pre: Element): string | null {
    const blockTags = new Set(['P', 'DIV', 'LI', 'TR', 'SECTION', 'ARTICLE']);
    const blockChildren = Array.from(pre.children).filter((node) => blockTags.has(node.tagName));
    if (blockChildren.length === 0) return null;
    return blockChildren.map((node) => (node.textContent || '').replace(/\r\n?/g, '\n')).join('\n');
  }

  normalizeCodeBlocks(container: Element): void {
    if (!container) return;
    const codeRoots = container.querySelectorAll('pre');
    codeRoots.forEach((pre) => {
      (pre as HTMLElement).style.textIndent = '0';
      (pre as HTMLElement).style.marginLeft = '0';
      (pre as HTMLElement).style.maxWidth = '100%';

      const flattenedText = this.flattenPreRichText(pre);
      let code = pre.querySelector('code');
      if (!code) {
        code = document.createElement('code');
        code.textContent = flattenedText ?? (pre.textContent || '');
        pre.replaceChildren(code);
      } else if (flattenedText !== null) {
        code.textContent = flattenedText;
        pre.replaceChildren(code);
      }
      code.textContent = this.dedentCodeText(code.textContent || '');
    });
  }

  // ── Content Cache ──────────────────────────

  private getContentCacheKey(): string {
    return `${location.origin}${location.pathname}${location.search}::${document.title}`;
  }

  // ── Overlay ────────────────────────────────

  initOverlay(): void {
    if (this.overlay) return;
    this.overlay = document.createElement('div');
    this.overlay.id = 'readmd-overlay';

    this.contentContainer = document.createElement('div');
    this.contentContainer.id = 'readmd-content';
    this.overlay.appendChild(this.contentContainer);
    document.body.appendChild(this.overlay);

    this.overlay.addEventListener(
      'scroll',
      () => {
        if (!this.isActive) return;
        this.overlay!.classList.add('is-scrolling');
        if (this.scrollbarHideTimer) clearTimeout(this.scrollbarHideTimer);
        this.scrollbarHideTimer = setTimeout(() => {
          this.overlay!.classList.remove('is-scrolling');
        }, 650);
        if (this.scrollSaveTimer) clearTimeout(this.scrollSaveTimer);
        this.scrollSaveTimer = setTimeout(() => {
          this.saveReadingProgress();
        }, 180);
      },
      { passive: true },
    );

    // Load initial settings
    Promise.all([theme.getValue(), layout.getValue(), fontSize.getValue()]).then(
      ([t, l, fz]) => {
        if (this.overlay) {
          this.overlay.setAttribute('data-theme', t);
          this.overlay.setAttribute('data-layout', l);
          this.overlay.style.setProperty('--readmd-font-size', `${fz}px`);
        }
      },
    );

    window.addEventListener('pagehide', () => {
      this.flushPendingProgressPersist();
    });
  }

  // ── Toggle ──────────────────────────────────

  toggleReader(): void {
    this.initOverlay();
    if (!this.isActive) {
      const pageSnapshot = this.getPageProgressSnapshot();
      this.isActive = true;
      document.body.style.overflow = 'hidden';
      const contentContainer = this.overlay!.querySelector('#readmd-content')!;

      const currentContentKey = this.getContentCacheKey();
      if (this.cachedContentKey !== currentContentKey || !this.cachedExtractedHtml) {
        this.cachedExtractedHtml = this.extractContentHtml();
        this.cachedContentKey = currentContentKey;
      }

      contentContainer.innerHTML = this.cachedExtractedHtml;
      this.normalizeCodeBlocks(contentContainer);
      this.overlay!.classList.add('active');
      this.restoreReadingProgress(pageSnapshot || undefined);
    } else {
      const snapshot = this.getReadingProgressSnapshot();
      this.persistReadingProgress(snapshot);
      this.isActive = false;
      document.body.style.overflow = '';
      this.overlay!.classList.remove('active');
      this.overlay!.classList.remove('is-scrolling');
      if (snapshot) {
        requestAnimationFrame(() => {
          this.applyPageProgress(snapshot);
        });
      }
    }
  }

  exitReader(): void {
    this.initOverlay();
    let snapshot: ReadingProgressSnapshot | null = null;
    if (this.isActive) {
      snapshot = this.getReadingProgressSnapshot();
      this.persistReadingProgress(snapshot);
    }
    this.isActive = false;
    document.body.style.overflow = '';
    this.overlay!.classList.remove('active');
    this.overlay!.classList.remove('is-scrolling');
    if (this.scrollSaveTimer) {
      clearTimeout(this.scrollSaveTimer);
      this.scrollSaveTimer = null;
    }
    if (this.scrollbarHideTimer) {
      clearTimeout(this.scrollbarHideTimer);
      this.scrollbarHideTimer = null;
    }
    if (snapshot) {
      requestAnimationFrame(() => {
        this.applyPageProgress(snapshot);
      });
    }
  }

  // ── Settings ─────────────────────────────────

  applyTheme(t: string): void {
    if (this.overlay) this.overlay.setAttribute('data-theme', t);
  }

  async applyLayout(l: string): Promise<void> {
    if (!this.overlay) return;
    const beforeSwitch = this.isActive ? this.getReadingProgressSnapshot() : null;
    this.overlay.setAttribute('data-layout', l);
    if (beforeSwitch) {
      const targetSnapshot: ReadingProgressSnapshot = {
        ...beforeSwitch,
        layout: l as ReadingProgressSnapshot['layout'],
        updatedAt: Date.now(),
      };
      this.persistReadingProgress(targetSnapshot);
      this.restoreReadingProgress(targetSnapshot);
    }
  }

  applyFontSize(fz: number): void {
    if (!this.overlay) return;
    const beforeResize = this.isActive ? this.getReadingProgressSnapshot() : null;
    this.overlay.style.setProperty('--readmd-font-size', `${fz}px`);
    if (beforeResize) {
      this.restoreReadingProgress(beforeResize);
    }
  }

  // ── Getters ──────────────────────────────────

  getOverlay(): HTMLElement | null {
    return this.overlay;
  }

  getContentContainer(): HTMLElement | null {
    return this.contentContainer;
  }

  isReaderActive(): boolean {
    return this.isActive;
  }
}
