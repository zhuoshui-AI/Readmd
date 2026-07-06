import { ReaderMode } from '../components/reader-mode';
import { AnnotationEngine } from '../components/annotate-engine';
import { theme, layout, fontSize, penColor, penSize, penOpacity, penTool, readerMode as readerModeStorage, annotateMode as annotateModeStorage } from '../components/storage';
import '../styles/content.css';

export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    const readerMode = new ReaderMode();
    let annotateEngine: AnnotationEngine | null = null;
    // Pending pen settings applied when engine initializes
    let pendingPenColor: string | null = null;
    let pendingPenSize: number | null = null;
    let pendingPenOpacity: number | null = null;
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
        case 'setReader': {
          if (request.enabled) {
            if (!readerMode.isReaderActive()) {
              readerMode.toggleReader();
              if (readerMode.isReaderActive()) {
                initAnnotationEngine();
              }
            }
            readerModeStorage.setValue(true);
          } else {
            readerMode.exitReader();
            destroyAnnotationEngine();
            readerModeStorage.setValue(false);
            annotateModeStorage.setValue(false);
          }
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

        case 'setAnnotate': {
          if (request.enabled) {
            // ── Enable annotation mode ──
            if (!readerMode.isReaderActive()) {
              readerMode.toggleReader();
              if (!readerMode.isReaderActive()) {
                return { status: 'error', reason: 'Cannot activate reader mode on this page' };
              }
              initAnnotationEngine();
              readerModeStorage.setValue(true);
            }

            if (!annotateEngine) {
              initAnnotationEngine();
            }

            if (!annotateEngine) {
              return { status: 'error', reason: 'Annotation engine not initialized.' };
            }

            if (annotateEngine.mode === 'canvas') {
              annotateModeStorage.setValue(true);
              return { status: 'ok', annotateMode: 'on' };
            }

            const tool = request.penTool || pendingPenTool || 'pen';
            const color = request.penColor || pendingPenColor || undefined;
            const size = request.penSize ?? pendingPenSize ?? undefined;
            const opacity = request.penOpacity ?? pendingPenOpacity ?? undefined;
            annotateEngine.show(tool, color, size, opacity).then(() => {
              pendingPenColor = null;
              pendingPenSize = null;
              pendingPenOpacity = null;
              pendingPenTool = null;
            }).catch((err: Error) => {
              console.error('Failed to enter annotation mode:', err);
            });
            annotateModeStorage.setValue(true);
            return { status: 'ok', annotateMode: 'on' };
          } else {
            // ── Disable annotation mode ──
            if (annotateEngine) {
              annotateEngine.hide();
            }
            annotateModeStorage.setValue(false);
            return { status: 'ok', annotateMode: 'off' };
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

        case 'updatePenOpacity': {
          pendingPenOpacity = request.opacity;
          if (annotateEngine) {
            annotateEngine.setOpacity(request.opacity);
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
