document.addEventListener('DOMContentLoaded', () => {
  const themeSelect = document.getElementById('theme');
  const layoutSelect = document.getElementById('layout');
  const fontSizeInput = document.getElementById('fontSize');
  const fontSizeValue = document.getElementById('fontSizeValue');
  const toggleBtn = document.getElementById('toggleReader');
  const exitBtn = document.getElementById('exitReader');
  const toggleAnnotateBtn = document.getElementById('toggleAnnotate');
  const exportHTMLBtn = document.getElementById('exportHTML');
  const exportPDFBtn = document.getElementById('exportPDF');

  function isUnsupportedPage(urlString = '') {
    if (!urlString) return true;

    try {
      const parsedUrl = new URL(urlString);
      const blockedProtocols = new Set([
        'about:',
        'chrome:',
        'chrome-extension:',
        'devtools:',
        'edge:',
        'moz-extension:',
        'view-source:'
      ]);

      if (blockedProtocols.has(parsedUrl.protocol)) {
        return true;
      }

      if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
        return true;
      }

      if (parsedUrl.hostname === 'chrome.google.com' && parsedUrl.pathname.startsWith('/webstore')) {
        return true;
      }

      return false;
    } catch {
      return true;
    }
  }

  // Load saved settings
  chrome.storage.sync.get(['theme', 'layout', 'fontSize'], (data) => {
    if (data.theme) themeSelect.value = data.theme;
    if (data.layout) layoutSelect.value = data.layout;
    if (data.fontSize) {
      fontSizeInput.value = data.fontSize;
      fontSizeValue.textContent = `${data.fontSize}px`;
    }
  });

  // Save settings and notify content script
  themeSelect.addEventListener('change', (e) => {
    const theme = e.target.value;
    chrome.storage.sync.set({ theme });
    notifyContentScript({ action: 'updateTheme', theme });
  });

  layoutSelect.addEventListener('change', (e) => {
    const layout = e.target.value;
    chrome.storage.sync.set({ layout });
    notifyContentScript({ action: 'updateLayout', layout });
  });

  fontSizeInput.addEventListener('input', (e) => {
    const fontSize = e.target.value;
    fontSizeValue.textContent = `${fontSize}px`;
    chrome.storage.sync.set({ fontSize });
    notifyContentScript({ action: 'updateFontSize', fontSize });
  });

  toggleBtn.addEventListener('click', () => {
    notifyContentScript({ action: 'toggleReader' });
  });

  exitBtn.addEventListener('click', () => {
    notifyContentScript({ action: 'exitReader' });
  });

  toggleAnnotateBtn.addEventListener('click', () => {
    notifyContentScript({ action: 'toggleAnnotate' });
  });

  exportHTMLBtn.addEventListener('click', () => {
    notifyContentScript({ action: 'exportHTML' });
  });

  exportPDFBtn.addEventListener('click', () => {
    notifyContentScript({ action: 'exportPDF' });
  });

  function notifyContentScript(message) {
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      const activeTab = tabs[0];
      if (activeTab) {
        const tabId = activeTab.id;
        
        // Check if we can inject into this URL
        const url = activeTab.url || '';
        if (isUnsupportedPage(url)) {
          console.warn("Cannot inject content script into browser internal pages.");
          alert("Readmd 无法在当前页面运行，请切换到普通网页后重试。");
          return;
        }

        try {
          // Try to send the message first
          await chrome.tabs.sendMessage(tabId, message);
        } catch (err) {
          console.log("Content script not found, injecting now...", err);
          
          try {
            // Inject all scripts in dependency order
            const scripts = [
              'content_scripts/Readability.js',
              'node_modules/html2canvas/dist/html2canvas.min.js',
              'node_modules/jspdf/dist/jspdf.umd.min.js',
              'content_scripts/annotate.js',
              'content_scripts/content.js'
            ];
            for (const script of scripts) {
              await chrome.scripting.executeScript({
                target: { tabId: tabId },
                files: [script]
              });
            }

            // Inject CSS
            await chrome.scripting.insertCSS({
              target: { tabId: tabId },
              files: ['content_scripts/content.css']
            });
            await chrome.scripting.insertCSS({
              target: { tabId: tabId },
              files: ['content_scripts/annotate.css']
            });

            // Wait a tiny bit for the script to initialize its listener
            setTimeout(async () => {
              try {
                await chrome.tabs.sendMessage(tabId, message);
              } catch (retryErr) {
                console.error("Failed to send message even after injection:", retryErr);
              }
            }, 100);

          } catch (injectErr) {
            console.error("Failed to inject content scripts:", injectErr);
            alert("Failed to initialize Readmd on this page.");
          }
        }
      }
    });
  }
});
