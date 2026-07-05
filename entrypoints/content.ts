import { ReaderMode } from '../components/reader-mode';
import { AnnotationEngine } from '../components/annotate-engine';
import { theme, layout, fontSize, penColor, penSize, penTool } from '../components/storage';
import '../styles/content.css';

export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    const readerMode = new ReaderMode();
    let annotateEngine: AnnotationEngine | null = null;
    // Pending pen settings applied when engine initializes
    let pendingPenColor: string | null = null;
    let pendingPenSize: number | null = null;
    let pendingPenTool: string | null = null;

    function initOverlay() {
      readerMode.initOverlay();
    }

    function initAnnotationEngine() {
      const contentContainer = readerMode.getContentContainer();
      if (!contentContainer) return;

      if (!annotateEngine) {
        annotateEngine = new AnnotationEngine(
          readerMode.getOverlay()!,
          contentContainer,
        );
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

    // ── Restore settings on load ──────────────

    async function restoreSettings() {
      const [t, l, fz] = await Promise.all([
        theme.getValue(),
        layout.getValue(),
        fontSize.getValue(),
      ]);
      initOverlay();
      readerMode.applyTheme(t);
      readerMode.applyLayout(l);
      readerMode.applyFontSize(fz);
    }

    restoreSettings();

    // ── Message Handling ──────────────────────

    browser.runtime.onMessage.addListener((request: any) => {
      initOverlay();

      switch (request.action) {
        case 'toggleReader': {
          readerMode.toggleReader();
          // Initialize annotation engine when reader activates
          if (readerMode.isReaderActive()) {
            initAnnotationEngine();
          }
          break;
        }

        case 'exitReader': {
          readerMode.exitReader();
          destroyAnnotationEngine();
          break;
        }

        case 'updateTheme': {
          readerMode.applyTheme(request.theme);
          break;
        }

        case 'updateLayout': {
          readerMode.applyLayout(request.layout);
          if (annotateEngine) {
            setTimeout(() => annotateEngine!.syncSize(), 100);
          }
          break;
        }

        case 'updateFontSize': {
          readerMode.applyFontSize(request.fontSize);
          if (annotateEngine) {
            setTimeout(() => annotateEngine!.syncSize(), 100);
          }
          break;
        }

        case 'toggleAnnotate': {
          // Ensure reader mode is active
          if (!readerMode.isReaderActive()) {
            readerMode.toggleReader();
            if (!readerMode.isReaderActive()) {
              return { status: 'error', reason: 'Cannot activate reader mode on this page' };
            }
            // Initialize annotation engine after reader activates
            initAnnotationEngine();
          }

          // Ensure annotateEngine exists
          if (!annotateEngine) {
            initAnnotationEngine();
          }

          if (!annotateEngine) {
            return { status: 'error', reason: 'Annotation engine not initialized.' };
          }

          if (annotateEngine.mode === 'canvas') {
            annotateEngine.hide();
            return { status: 'ok', annotateMode: 'off' };
          } else {
            // Apply stored pen settings when entering annotation mode
            const tool = pendingPenTool || 'pen';
            annotateEngine.show(tool, pendingPenColor || undefined, pendingPenSize || undefined).then(() => {
              // Clear pending settings after applying
              pendingPenColor = null;
              pendingPenSize = null;
              pendingPenTool = null;
            }).catch((err: Error) => {
              console.error('Failed to enter annotation mode:', err);
            });
            return { status: 'ok', annotateMode: 'on' };
          }
        }

        case 'undo': {
          if (annotateEngine) {
            annotateEngine.undo();
          }
          break;
        }

        case 'updatePenColor': {
          pendingPenColor = request.color;
          if (annotateEngine) {
            annotateEngine.setColor(request.color);
          }
          break;
        }

        case 'updatePenSize': {
          pendingPenSize = request.size;
          if (annotateEngine) {
            annotateEngine.setSize(request.size);
          }
          break;
        }

        case 'updatePenTool': {
          pendingPenTool = request.tool;
          if (annotateEngine) {
            annotateEngine.setTool(request.tool);
          }
          break;
        }

        case 'exportHTML': {
          if (annotateEngine) {
            annotateEngine.exportHTML().catch((err: Error) => {
              console.error('HTML export failed:', err);
            });
          } else {
            return { status: 'error', reason: 'Annotation engine not initialized.' };
          }
          break;
        }

        case 'exportPDF': {
          if (annotateEngine) {
            annotateEngine.exportPDF().catch((err: Error) => {
              console.error('PDF export failed:', err);
            });
          } else {
            return { status: 'error', reason: 'Annotation engine not initialized.' };
          }
          break;
        }
      }

      return { status: 'ok' };
    });
  },
});
