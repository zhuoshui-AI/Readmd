let overlay = null;
let isActive = false;
let readingProgressSnapshot = null;
let scrollSaveTimer = null;
let scrollbarHideTimer = null;
let cachedExtractedHtml = '';
let cachedContentKey = '';
let pendingPersistSnapshot = null;
let persistHandle = null;
let annotateEngine = null;

function getProgressStorageKey() {
  return `readmd-progress:${location.origin}${location.pathname}${location.search}${location.hash}`;
}

function getContentCacheKey() {
  return `${location.origin}${location.pathname}${location.search}::${document.title}`;
}

function flushPendingProgressPersist() {
  if (!pendingPersistSnapshot) return;
  const snapshot = pendingPersistSnapshot;
  pendingPersistSnapshot = null;
  chrome.storage.local.set({ [getProgressStorageKey()]: snapshot });
}

function scheduleProgressPersist() {
  if (persistHandle) return;

  if ('requestIdleCallback' in window) {
    persistHandle = window.requestIdleCallback(() => {
      persistHandle = null;
      flushPendingProgressPersist();
    }, { timeout: 500 });
    return;
  }

  persistHandle = setTimeout(() => {
    persistHandle = null;
    flushPendingProgressPersist();
  }, 160);
}

function clampProgressRatio(value) {
  const num = Number(value);
  if (Number.isNaN(num)) return 0;
  return Math.max(0, Math.min(1, num));
}

function getCurrentLayout() {
  if (!overlay) return 'single';
  return overlay.getAttribute('data-layout') || 'single';
}

function getScrollAxis(layout = getCurrentLayout()) {
  return layout === 'double' ? 'x' : 'y';
}

function getReadingProgressSnapshot(layout = getCurrentLayout()) {
  if (!overlay) return null;

  const axis = getScrollAxis(layout);
  const max = axis === 'x'
    ? Math.max(overlay.scrollWidth - overlay.clientWidth, 0)
    : Math.max(overlay.scrollHeight - overlay.clientHeight, 0);

  const position = axis === 'x' ? overlay.scrollLeft : overlay.scrollTop;
  const ratio = max > 0 ? position / max : 0;

  return {
    ratio: clampProgressRatio(ratio),
    layout,
    updatedAt: Date.now()
  };
}

function getPageProgressSnapshot() {
  const scrollingElement = document.scrollingElement || document.documentElement || document.body;
  if (!scrollingElement) return null;

  const max = Math.max(scrollingElement.scrollHeight - scrollingElement.clientHeight, 0);
  const ratio = max > 0 ? scrollingElement.scrollTop / max : 0;

  return {
    ratio: clampProgressRatio(ratio),
    layout: 'page',
    updatedAt: Date.now()
  };
}

function persistReadingProgress(snapshot) {
  if (!snapshot) return;
  readingProgressSnapshot = snapshot;
  pendingPersistSnapshot = snapshot;
  scheduleProgressPersist();
}

function saveReadingProgress() {
  if (!overlay) return;
  const snapshot = getReadingProgressSnapshot();
  persistReadingProgress(snapshot);
}

function applyReadingProgress(snapshot, targetLayout = getCurrentLayout()) {
  if (!overlay || !snapshot) return;

  const axis = getScrollAxis(targetLayout);
  const max = axis === 'x'
    ? Math.max(overlay.scrollWidth - overlay.clientWidth, 0)
    : Math.max(overlay.scrollHeight - overlay.clientHeight, 0);

  const target = Math.round(clampProgressRatio(snapshot.ratio) * max);

  if (axis === 'x') {
    overlay.scrollLeft = target;
  } else {
    overlay.scrollTop = target;
  }
}

function applyPageProgress(snapshot) {
  if (!snapshot) return;

  const scrollingElement = document.scrollingElement || document.documentElement || document.body;
  if (!scrollingElement) return;

  const max = Math.max(scrollingElement.scrollHeight - scrollingElement.clientHeight, 0);
  const target = Math.round(clampProgressRatio(snapshot.ratio) * max);
  scrollingElement.scrollTop = target;
}

function restoreReadingProgress(preferredSnapshot = null) {
  if (!overlay) return;

  const applyAsync = (snapshot) => {
    if (!snapshot) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        applyReadingProgress(snapshot);
      });
    });
  };

  if (preferredSnapshot) {
    applyAsync(preferredSnapshot);
    return;
  }

  if (readingProgressSnapshot) {
    applyAsync(readingProgressSnapshot);
    return;
  }

  chrome.storage.local.get(getProgressStorageKey(), (data) => {
    const snapshot = data ? data[getProgressStorageKey()] : null;
    if (!snapshot) return;
    readingProgressSnapshot = snapshot;
    applyAsync(snapshot);
  });
}

function isSvgResourceUrl(url = '') {
  if (!url) return false;
  const normalized = url.trim().toLowerCase();
  return normalized.startsWith('data:image/svg+xml') || /\.svg([?#].*)?$/.test(normalized);
}

function normalizeEmbeddedSvgElements(docRoot) {
  const doc = docRoot.ownerDocument || docRoot;
  const candidates = docRoot.querySelectorAll('object[data], embed[src]');
  candidates.forEach((node) => {
    const sourceAttr = node.tagName === 'OBJECT' ? 'data' : 'src';
    const source = node.getAttribute(sourceAttr) || '';
    const type = (node.getAttribute('type') || '').toLowerCase();
    const isSvg = type.includes('image/svg+xml') || isSvgResourceUrl(source);

    if (!isSvg) return;

    const img = doc.createElement('img');
    img.setAttribute('src', source);

    const altText = node.getAttribute('alt') || node.getAttribute('title') || node.getAttribute('aria-label') || '';
    if (altText) {
      img.setAttribute('alt', altText);
    }

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

function normalizeInlineSvgElements(docRoot) {
  const svgs = docRoot.querySelectorAll('svg');
  svgs.forEach((svg) => {
    if (!svg.getAttribute('xmlns')) {
      svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    }
    if (!svg.getAttribute('xmlns:xlink')) {
      svg.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
    }

    const linkedNodes = svg.querySelectorAll('[xlink\\:href], [href]');
    linkedNodes.forEach((node) => {
      const href = node.getAttribute('href');
      const xlinkHref = node.getAttribute('xlink:href');

      if (xlinkHref && !href) {
        node.setAttribute('href', xlinkHref);
      }

      if (href && !xlinkHref) {
        node.setAttribute('xlink:href', href);
      }
    });
  });
}

function stabilizeComplexInlineSvgElements(docRoot) {
  const doc = docRoot.ownerDocument || docRoot;
  const svgs = docRoot.querySelectorAll('svg');

  svgs.forEach((svg) => {
    const hasReferenceGraph =
      svg.querySelector('defs, symbol, use') ||
      svg.querySelector('[xlink\\:href], [href^="#"]');

    if (!hasReferenceGraph) return;

    try {
      if (!svg.getAttribute('xmlns')) {
        svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      }
      if (!svg.getAttribute('xmlns:xlink')) {
        svg.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
      }

      const serialized = new XMLSerializer().serializeToString(svg);
      const dataUri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(serialized)}`;

      const img = doc.createElement('img');
      img.setAttribute('src', dataUri);

      const className = svg.getAttribute('class');
      if (className) img.setAttribute('class', className);

      const width = svg.getAttribute('width');
      const height = svg.getAttribute('height');
      const styleParts = [];
      const isPlainNumber = (value) => /^\d+(\.\d+)?$/.test(value);

      if (width) {
        if (isPlainNumber(width)) {
          img.setAttribute('width', width);
        } else {
          styleParts.push(`width:${width}`);
        }
      }

      if (height) {
        if (isPlainNumber(height)) {
          img.setAttribute('height', height);
        } else {
          styleParts.push(`height:${height}`);
        }
      }

      const role = svg.getAttribute('role');
      if (role) img.setAttribute('role', role);

      const ariaLabel = svg.getAttribute('aria-label') || '';
      const titleNode = svg.querySelector('title');
      const titleText = titleNode ? (titleNode.textContent || '').trim() : '';
      img.setAttribute('alt', ariaLabel || titleText || '');

      const style = svg.getAttribute('style');
      const normalizedStyle = 'max-width:100%;height:auto;';
      const sizeStyle = styleParts.length > 0 ? `${styleParts.join(';')};` : '';
      const mergedStyle = `${sizeStyle}${style ? `${style};` : ''}${normalizedStyle}`;
      img.setAttribute('style', mergedStyle);

      svg.replaceWith(img);
    } catch (error) {
      console.warn('Failed to stabilize inline SVG:', error);
    }
  });
}

function initOverlay() {
  if (overlay) return;

  overlay = document.createElement('div');
  overlay.id = 'readmd-overlay';
  
  const contentContainer = document.createElement('div');
  contentContainer.id = 'readmd-content';
  overlay.appendChild(contentContainer);
  
  document.body.appendChild(overlay);

  overlay.addEventListener('scroll', () => {
    if (!isActive) return;

    overlay.classList.add('is-scrolling');
    if (scrollbarHideTimer) {
      clearTimeout(scrollbarHideTimer);
    }
    scrollbarHideTimer = setTimeout(() => {
      overlay.classList.remove('is-scrolling');
    }, 650);

    if (scrollSaveTimer) {
      clearTimeout(scrollSaveTimer);
    }
    scrollSaveTimer = setTimeout(() => {
      saveReadingProgress();
    }, 180);
  }, { passive: true });

  // Load initial settings
  chrome.storage.sync.get(['theme', 'layout', 'fontSize'], (data) => {
    overlay.setAttribute('data-theme', data.theme || 'light');
    overlay.setAttribute('data-layout', data.layout || 'single');
    if (data.fontSize) {
      overlay.style.setProperty('--readmd-font-size', `${data.fontSize}px`);
    }
  });
}

function extractContent() {
  try {
    // Clone the document to avoid modifying the original page
    const documentClone = document.cloneNode(true);

    // Preserve SVG assets embedded via object/embed before Readability cleanup
    normalizeEmbeddedSvgElements(documentClone);
    normalizeInlineSvgElements(documentClone);
    stabilizeComplexInlineSvgElements(documentClone);
    
    // Use Mozilla's Readability to parse the document
    const reader = new Readability(documentClone, {
      serializer: (el) => el.cloneNode(true)
    });
    const article = reader.parse();
    
    if (article && article.content) {
      const container = documentClone.createElement('div');

      if (article.title) {
        const titleEl = documentClone.createElement('h1');
        titleEl.textContent = article.title;
        container.appendChild(titleEl);
      }

      if (article.content && typeof article.content === 'object' && article.content.nodeType === Node.ELEMENT_NODE) {
        container.appendChild(article.content);
        normalizeEmbeddedSvgElements(container);
        normalizeInlineSvgElements(container);
        stabilizeComplexInlineSvgElements(container);
        return container;
      }

      if (typeof article.content === 'string') {
        const titleHtml = article.title ? `<h1>${article.title}</h1>` : '';
        return titleHtml + article.content;
      }
    }
  } catch (error) {
    console.error("Readability extraction failed:", error);
  }

  // Fallback to simple extraction if Readability fails
  let article = document.querySelector('article');
  
  if (!article) {
    // Try to find the element with the most text content
    const candidates = document.querySelectorAll('main, div.content, div.post, div.article, div.entry-content');
    let maxTextLength = 0;
    
    candidates.forEach(el => {
      const textLength = el.innerText.length;
      if (textLength > maxTextLength) {
        maxTextLength = textLength;
        article = el;
      }
    });
  }

  if (!article) {
    article = document.body;
  }
  
  // Clone to avoid modifying original DOM
  const clone = article.cloneNode(true);

  normalizeEmbeddedSvgElements(clone);
  normalizeInlineSvgElements(clone);
  stabilizeComplexInlineSvgElements(clone);
  
  // Basic cleanup (remove scripts, styles, nav, aside, etc.)
  const elementsToRemove = clone.querySelectorAll('script, style, nav, aside, header, footer, iframe, noscript, .sidebar, .comments, .ad');
  elementsToRemove.forEach(el => el.remove());

  return clone.innerHTML;
}

function extractContentHtml() {
  const extractedContent = extractContent();
  if (typeof extractedContent === 'string') {
    return extractedContent;
  }
  if (extractedContent && extractedContent.nodeType === Node.ELEMENT_NODE) {
    return extractedContent.innerHTML;
  }
  return '';
}

function dedentCodeText(rawText) {
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

  if (!Number.isFinite(minIndent) || minIndent <= 0) {
    return contentLines.join('\n');
  }

  return contentLines.map((line) => line.slice(minIndent)).join('\n');
}

function flattenPreRichText(pre) {
  if (!pre) return null;

  const blockTags = new Set(['P', 'DIV', 'LI', 'TR', 'SECTION', 'ARTICLE']);
  const blockChildren = Array.from(pre.children).filter((node) => blockTags.has(node.tagName));
  if (blockChildren.length === 0) return null;

  return blockChildren
    .map((node) => (node.textContent || '').replace(/\r\n?/g, '\n'))
    .join('\n');
}

function normalizeCodeBlocks(container) {
  if (!container) return;

  const codeRoots = container.querySelectorAll('pre');

  codeRoots.forEach((pre) => {
    pre.style.textIndent = '0';
    pre.style.marginLeft = '0';
    pre.style.maxWidth = '100%';

    const flattenedText = flattenPreRichText(pre);
    let code = pre.querySelector('code');

    if (!code) {
      code = document.createElement('code');
      code.textContent = flattenedText ?? (pre.textContent || '');
      pre.replaceChildren(code);
    } else if (flattenedText !== null) {
      code.textContent = flattenedText;
      pre.replaceChildren(code);
    }

    code.textContent = dedentCodeText(code.textContent || '');
  });
}

function toggleReader() {
  initOverlay();
  
  if (!isActive) {
    const pageSnapshot = getPageProgressSnapshot();
    isActive = true;
    document.body.style.overflow = 'hidden'; // Hide original scrollbar
    const contentContainer = overlay.querySelector('#readmd-content');

    const currentContentKey = getContentCacheKey();
    if (cachedContentKey !== currentContentKey || !cachedExtractedHtml) {
      cachedExtractedHtml = extractContentHtml();
      cachedContentKey = currentContentKey;
    }

    contentContainer.innerHTML = cachedExtractedHtml;
    normalizeCodeBlocks(contentContainer);
    overlay.classList.add('active');
    restoreReadingProgress(pageSnapshot || undefined);

    // Initialize annotation engine
    initAnnotationEngine();
  } else {
    const snapshot = getReadingProgressSnapshot();
    persistReadingProgress(snapshot);
    isActive = false;
    document.body.style.overflow = '';
    overlay.classList.remove('active');
    overlay.classList.remove('is-scrolling');
    if (annotateEngine) annotateEngine.hide();
    requestAnimationFrame(() => {
      applyPageProgress(snapshot);
    });
  }
}

window.addEventListener('pagehide', () => {
  flushPendingProgressPersist();
});

function exitReader() {
  initOverlay();
  let snapshot = null;
  if (isActive) {
    snapshot = getReadingProgressSnapshot();
    persistReadingProgress(snapshot);
  }
  isActive = false;
  document.body.style.overflow = '';
  overlay.classList.remove('active');
  overlay.classList.remove('is-scrolling');
  if (scrollSaveTimer) {
    clearTimeout(scrollSaveTimer);
    scrollSaveTimer = null;
  }
  if (scrollbarHideTimer) {
    clearTimeout(scrollbarHideTimer);
    scrollbarHideTimer = null;
  }
  if (annotateEngine) {
    annotateEngine.hide();
  }
  if (snapshot) {
    requestAnimationFrame(() => {
      applyPageProgress(snapshot);
    });
  }
}

function initAnnotationEngine() {
  const contentContainer = overlay.querySelector('#readmd-content');
  if (!contentContainer) return;

  if (!annotateEngine) {
    annotateEngine = new AnnotationEngine(overlay, contentContainer);
  } else {
    annotateEngine.syncSize();
  }
}

function destroyAnnotationEngine() {
  if (annotateEngine) {
    annotateEngine.destroy();
    annotateEngine = null;
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  initOverlay();
  if (request.action === 'toggleReader') {
    toggleReader();
  } else if (request.action === 'exitReader') {
    exitReader();
    destroyAnnotationEngine();
  } else if (request.action === 'updateTheme') {
    overlay.setAttribute('data-theme', request.theme);
  } else if (request.action === 'updateLayout') {
    const beforeSwitch = isActive ? getReadingProgressSnapshot() : null;
    overlay.setAttribute('data-layout', request.layout);
    if (beforeSwitch) {
      const targetSnapshot = {
        ...beforeSwitch,
        layout: request.layout,
        updatedAt: Date.now()
      };
      persistReadingProgress(targetSnapshot);
      restoreReadingProgress(targetSnapshot);
    }
    // Sync annotation canvas after layout change
    if (annotateEngine) {
      setTimeout(() => annotateEngine.syncSize(), 100);
    }
  } else if (request.action === 'updateFontSize') {
    const beforeResize = isActive ? getReadingProgressSnapshot() : null;
    overlay.style.setProperty('--readmd-font-size', `${request.fontSize}px`);
    if (beforeResize) {
      restoreReadingProgress(beforeResize);
    }
    // Sync annotation canvas after font size change
    if (annotateEngine) {
      setTimeout(() => annotateEngine.syncSize(), 100);
    }
  } else if (request.action === 'toggleAnnotate') {
    // Toggle annotation (doodle) mode on/off.
    // Requires the reader overlay to be active first.
    if (!isActive) {
      // Auto-activate reader mode first, then enable annotation
      toggleReader();
      // toggleReader sets isActive synchronously when activating;
      // initAnnotationEngine creates the engine.
      // If isActive is still false, the page couldn't be parsed.
      if (!isActive || !annotateEngine) {
        sendResponse({ status: "error", reason: "Cannot activate reader mode on this page" });
        return;
      }
    }

    if (annotateEngine.mode === 'canvas') {
      // Currently doodling → return to reading mode
      annotateEngine.hide();
      sendResponse({ status: "ok", annotateMode: "off" });
    } else {
      // Currently reading → enter doodle mode
      annotateEngine.show().then(() => {
        sendResponse({ status: "ok", annotateMode: "on" });
      }).catch((err) => {
        console.error('Failed to enter annotation mode:', err);
        sendResponse({ status: "error", reason: "Failed to enter annotation mode" });
      });
    }
    return true; // Will send response asynchronously
  } else if (request.action === 'exportHTML') {
    if (annotateEngine) {
      annotateEngine.exportHTML();
    } else {
      sendResponse({ status: "error", reason: "Annotation engine not initialized. Enter reader mode first." });
      return;
    }
  } else if (request.action === 'exportPDF') {
    if (annotateEngine) {
      annotateEngine.exportPDF();
    } else {
      sendResponse({ status: "error", reason: "Annotation engine not initialized. Enter reader mode first." });
      return;
    }
  }
  // Return true to indicate we will send a response asynchronously if needed,
  // or just send a simple response to acknowledge receipt.
  sendResponse({ status: "ok" });
});
