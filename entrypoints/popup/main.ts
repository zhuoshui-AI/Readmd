import './style.css';
import { theme, layout, fontSize, penColor, penSize, penOpacity, penTool, readerMode, annotateMode } from '../../components/storage';
import type { Theme, Layout } from '../../components/storage';

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

async function sendToContentScript(message: Record<string, unknown>): Promise<Record<string, unknown> | null> {
  const tab = await getActiveTab();
  if (!tab?.id) return null;

  if (isUnsupportedPage(tab.url || '')) {
    alert('Readmd 无法在当前页面运行，请切换到普通网页后重试。');
    return null;
  }

  try {
    return await browser.tabs.sendMessage(tab.id, message) as Record<string, unknown>;
  } catch {
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

// ── Initialize UI from Storage ────────────────────

async function initUI() {
  const t = await theme.getValue();
  const l = await layout.getValue();
  const fz = await fontSize.getValue();
  const rm = await readerMode.getValue();
  const am = await annotateMode.getValue();

  themeSelect.value = t;
  layoutSelect.value = l;
  fontSizeInput.value = String(fz);
  fontSizeValue.textContent = `${fz}px`;
  toggleReaderCheckbox.checked = rm;
  toggleAnnotateCheckbox.checked = am;
}

initUI();

// ── Event Handlers ────────────────────────────────

// Reader mode toggle
toggleReaderCheckbox.addEventListener('change', async () => {
  const checked = toggleReaderCheckbox.checked;
  // Write intent to storage — content script will confirm after applying
  await readerMode.setValue(checked);
  if (!checked) {
    // When disabling reader, also disable annotation
    await annotateMode.setValue(false);
  }
  await sendToContentScript({ action: 'setReader', enabled: checked });
  window.close();
});

// Annotation mode toggle
toggleAnnotateCheckbox.addEventListener('change', async () => {
  const checked = toggleAnnotateCheckbox.checked;
  // Write intent to storage — content script will confirm after applying
  await annotateMode.setValue(checked);

  if (checked) {
    const [color, size, opacity, tool] = await Promise.all([
      penColor.getValue(),
      penSize.getValue(),
      penOpacity.getValue(),
      penTool.getValue(),
    ]);
    const response = await sendToContentScript({
      action: 'setAnnotate',
      enabled: true,
      penColor: color,
      penSize: size,
      penOpacity: opacity,
      penTool: tool,
    });
    // If content script failed to enable, revert
    if (response?.annotateMode !== 'on') {
      toggleAnnotateCheckbox.checked = false;
      await annotateMode.setValue(false);
    }
  } else {
    await sendToContentScript({ action: 'setAnnotate', enabled: false });
  }
  window.close();
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
