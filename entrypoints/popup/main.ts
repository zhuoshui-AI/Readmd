import './style.css';
import { theme, layout, fontSize, penColor, penSize, penTool } from '../../components/storage';
import type { Theme, Layout, PenTool } from '../../components/storage';

// ── Helpers ──────────────────────────────────────

function isUnsupportedPage(urlString = ''): boolean {
  if (!urlString) return true;
  try {
    const parsedUrl = new URL(urlString);
    const blockedProtocols = new Set([
      'about:', 'chrome:', 'chrome-extension:', 'devtools:',
      'edge:', 'moz-extension:', 'view-source:',
    ]);
    if (blockedProtocols.has(parsedUrl.protocol)) return true;
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') return true;
    if (parsedUrl.hostname === 'chrome.google.com' && parsedUrl.pathname.startsWith('/webstore')) return true;
    return false;
  } catch {
    return true;
  }
}

async function getActiveTab() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function sendToContentScript(message: Record<string, unknown>) {
  const tab = await getActiveTab();
  if (!tab?.id) return null;

  if (isUnsupportedPage(tab.url || '')) {
    alert('Readmd 无法在当前页面运行，请切换到普通网页后重试。');
    return null;
  }

  try {
    return await browser.tabs.sendMessage(tab.id, message);
  } catch {
    // Content script may not be injected yet — WXT handles this automatically
    // for defined content scripts. Just alert if it fails.
    alert('请刷新页面后重试。');
    return null;
  }
}

// ── DOM References ────────────────────────────────

const $ = (sel: string) => document.querySelector(sel)!;

const toggleReaderCheckbox = $('#toggleReader') as HTMLInputElement;
const toggleAnnotateCheckbox = $('#toggleAnnotate') as HTMLInputElement;
const exportHTMLBtn = $('#exportHTML') as HTMLButtonElement;
const exportPDFBtn = $('#exportPDF') as HTMLButtonElement;

const themeSelect = $('#theme') as HTMLSelectElement;
const layoutSelect = $('#layout') as HTMLSelectElement;
const fontSizeInput = $('#fontSize') as HTMLInputElement;
const fontSizeValue = $('#fontSizeValue') as HTMLSpanElement;

const colorSwatches = $('#colorSwatches');
const sizeBtns = $('#sizeBtns');
const toolToggles = $('#toolToggles');

// ── Initialize UI from Storage ────────────────────

async function initUI() {
  const t = await theme.getValue();
  const l = await layout.getValue();
  const fz = await fontSize.getValue();
  const pc = await penColor.getValue();
  const ps = await penSize.getValue();
  const pt = await penTool.getValue();

  themeSelect.value = t;
  layoutSelect.value = l;
  fontSizeInput.value = String(fz);
  fontSizeValue.textContent = `${fz}px`;

  // Color
  colorSwatches.querySelectorAll('.color-swatch').forEach((el) => {
    el.classList.toggle('active', (el as HTMLElement).dataset.color === pc);
  });

  // Size
  sizeBtns.querySelectorAll('.size-btn').forEach((el) => {
    el.classList.toggle('active', Number((el as HTMLElement).dataset.size) === ps);
  });

  // Tool
  toolToggles.querySelectorAll('.tool-btn').forEach((el) => {
    el.classList.toggle('active', (el as HTMLElement).dataset.tool === pt);
  });
}

initUI();

// ── Event Handlers ────────────────────────────────

// Reader mode toggle
toggleReaderCheckbox.addEventListener('change', async () => {
  if (toggleReaderCheckbox.checked) {
    await sendToContentScript({ action: 'toggleReader' });
  } else {
    await sendToContentScript({ action: 'exitReader' });
  }
});

// Annotation mode toggle
toggleAnnotateCheckbox.addEventListener('change', async () => {
  const response = await sendToContentScript({ action: 'toggleAnnotate' });
  // Sync toggle state with actual annotation mode from content script
  if (response?.annotateMode === 'on') {
    toggleAnnotateCheckbox.checked = true;
  } else if (response?.annotateMode === 'off') {
    toggleAnnotateCheckbox.checked = false;
  }
});

exportHTMLBtn.addEventListener('click', () => sendToContentScript({ action: 'exportHTML' }));
exportPDFBtn.addEventListener('click', () => sendToContentScript({ action: 'exportPDF' }));

// Settings
themeSelect.addEventListener('change', async (e) => {
  const val = (e.target as HTMLSelectElement).value as Theme;
  await theme.setValue(val);
  sendToContentScript({ action: 'updateTheme', theme: val });
});

layoutSelect.addEventListener('change', async (e) => {
  const val = (e.target as HTMLSelectElement).value as Layout;
  await layout.setValue(val);
  sendToContentScript({ action: 'updateLayout', layout: val });
});

fontSizeInput.addEventListener('input', async (e) => {
  const val = Number((e.target as HTMLInputElement).value);
  fontSizeValue.textContent = `${val}px`;
  await fontSize.setValue(val);
  sendToContentScript({ action: 'updateFontSize', fontSize: val });
});

// Color swatches
colorSwatches.addEventListener('click', async (e) => {
  const target = (e.target as HTMLElement).closest('.color-swatch') as HTMLElement | null;
  if (!target) return;
  const color = target.dataset.color!;
  colorSwatches.querySelectorAll('.color-swatch').forEach((el) => el.classList.remove('active'));
  target.classList.add('active');
  await penColor.setValue(color);
  sendToContentScript({ action: 'updatePenColor', color });
});

// Size buttons
sizeBtns.addEventListener('click', async (e) => {
  const target = (e.target as HTMLElement).closest('.size-btn') as HTMLElement | null;
  if (!target) return;
  const size = Number(target.dataset.size);
  sizeBtns.querySelectorAll('.size-btn').forEach((el) => el.classList.remove('active'));
  target.classList.add('active');
  await penSize.setValue(size);
  sendToContentScript({ action: 'updatePenSize', size });
});

// Tool toggles
toolToggles.addEventListener('click', async (e) => {
  const target = (e.target as HTMLElement).closest('.tool-btn') as HTMLElement | null;
  if (!target) return;
  const tool = target.dataset.tool! as PenTool;
  toolToggles.querySelectorAll('.tool-btn').forEach((el) => el.classList.remove('active'));
  target.classList.add('active');
  await penTool.setValue(tool);
  sendToContentScript({ action: 'updatePenTool', tool });
});
