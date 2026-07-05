const sections = Array.from(document.querySelectorAll('main section[id]'));
const tocLinks = Array.from(document.querySelectorAll('#toc a'));

const i18n = {
  zh: {
    pageTitle: 'Readmd 沉浸式阅读 & 批注器',
    toc: {
      overview: '概览',
      install: '安装',
      usage: '使用流程',
      shortcuts: '快捷键',
      compatibility: '兼容与限制',
      roadmap: '路线图'
    },
    controls: {
      light: '亮色',
      dark: '暗色'
    },
    hero: {
      badge: '浏览器扩展项目介绍',
      title: 'Readmd 沉浸式阅读 & 批注器',
      desc: 'Readmd 是一款集沉浸式阅读与全文批注于一体的浏览器扩展。自动提取正文、一键批注标注、导出 HTML/PDF，让阅读网页像读书一样专注。',
      install: '安装指南',
      features: '功能概览'
    },
    overview: {
      title: '1. 功能概览',
      reading: {
        title: '📖 沉浸式阅读',
        li1: '正文提取：基于 Mozilla Readability 算法，自动识别并过滤导航、侧栏、广告。',
        li2: '全屏阅读层：高 z-index 独立容器，与原网页 CSS 完全隔离，无样式冲突。',
        li3: '单页 / 双页布局：经典纵向滚动 + 仿书页双栏布局，切换时保持阅读进度。',
        li4: '10 种主题 + 无极字号：6 种浅色主题 + 4 种深色主题，字号 14–24px 连续可调。',
        li5: '代码块优化：统一缩进、可滚动容器、与正文清晰视觉分离。',
        li6: '阅读进度记忆：按 URL 自动保存和恢复阅读位置，支持单/双页布局。'
      },
      annotate: {
        title: '✏️ 全文批注标注',
        li1: 'DOM 文本高亮：选中文字即可添加荧光笔高亮，8 种颜色可选，支持换色和删除。',
        li2: '画笔涂鸦：自由绘制，3 档笔触（S/M/L）、8 种预设色 + 系统取色器、透明度可调。',
        li3: '橡皮擦：精准擦除笔画，不破坏底层内容。',
        li4: '文字批注：点击任意位置添加可编辑文本框，支持编辑和删除。',
        li5: '画布模式：高分辨率（2x）内容快照 + 独立批注层，保证批注精准。',
        li6: '拖拽平移：一键切换绘图/平移模式，方便浏览大型页面。'
      },
      export: {
        title: '📄 导出 & 编辑',
        li1: '导出 HTML：生成包含原文 + 批注 + 高亮的独立 HTML 文件，可直接在浏览器中查看。',
        li2: '导出 PDF：多页 A4 PDF，批注合并渲染到正文上，自动分页。',
        li3: '撤销 / 重做：50 步历史栈，覆盖画笔、文字批注和高光标注。',
        li4: '全部清除：一键重置所有批注。',
        li5: '完整键盘快捷键：覆盖工具切换、撤销重做、导出等全部操作。'
      }
    },
    install: {
      title: '2. 安装与启动',
      manual: {
        title: '手动安装（开发者模式）',
        li1: '克隆仓库并安装依赖：<br><code>git clone &lt;repo-url&gt; && cd readmd && npm install</code>',
        li2: '构建扩展：<br><code>npm run build</code>（Firefox 使用 <code>npm run build:firefox</code>）',
        li3: '打开浏览器扩展管理页：<strong>chrome://extensions/</strong> 或 <strong>edge://extensions/</strong>。',
        li4: '开启"开发者模式"。',
        li5: '点击"加载已解压的扩展程序"，选择 <code>.output/chrome-mv3</code> 目录。',
        li6: '打开任意文章页，点击扩展图标，进入 Readmd 控制面板。'
      },
      store: {
        title: '商店安装',
        desc: 'Chrome Web Store / Edge Add-ons / Firefox Add-ons 上架筹备中，敬请期待。'
      },
      tip: '提示：浏览器内置页面（如 chrome://）无法注入扩展脚本。'
    },
    usage: {
      title: '3. 基本使用流程',
      reading: {
        title: '阅读模式',
        step1: {
          title: 'Step 1 — 进入阅读模式',
          desc: '点击弹窗中的"阅读模式"开关，页面进入沉浸式阅读层，自动提取正文内容。'
        },
        step2: {
          title: 'Step 2 — 调整阅读参数',
          desc: '在弹窗中切换主题（10 种）、布局（单页/双页）和字号，修改后即时生效。'
        },
        step3: {
          title: 'Step 3 — 退出阅读模式',
          desc: '关闭阅读模式开关，返回原页面，阅读进度自动保存并恢复。'
        }
      },
      annotate: {
        title: '批注模式',
        step1: {
          title: 'Step 1 — 进入批注模式',
          desc: '在阅读模式下，点击弹窗中的"批注模式"开关，底部出现批注工具栏。'
        },
        step2: {
          title: 'Step 2 — 选择工具开始标注',
          desc: '选择画笔/橡皮擦/文字批注/荧光笔工具，调整颜色、大小、透明度后开始标注。'
        },
        step3: {
          title: 'Step 3 — 导出批注内容',
          desc: '点击工具栏或弹窗中的导出按钮，将批注后的内容保存为 HTML 或 PDF 文件。'
        }
      },
      table: {
        title: '控制面板设置项说明',
        col1: '设置项',
        col2: '作用',
        r0: { name: '阅读模式', desc: '开启/关闭沉浸式阅读层。' },
        r1: { name: '批注模式', desc: '开启/关闭批注工具栏（画笔、橡皮擦、文字、荧光笔）。' },
        r2: { name: '导出 HTML', desc: '将原文 + 批注保存为独立 HTML 文件。' },
        r3: { name: '导出 PDF', desc: '将原文 + 批注保存为 A4 多页 PDF 文件。' },
        r4: { name: '主题 Theme', desc: '切换阅读背景与文本配色（10 种可选）。' },
        r5: { name: '布局 Layout', desc: 'Single Page（单页）/ Double Page（双页）。' },
        r6: { name: '字号 Font Size', desc: '调整正文文字大小（14px–24px）。' }
      }
    },
    shortcuts: {
      title: '4. 键盘快捷键',
      col1: '快捷键',
      col2: '功能',
      a: '画笔工具',
      e: '橡皮擦工具',
      t: '文字批注工具',
      h: '荧光笔工具',
      d: '绘图 / 平移切换',
      esc: '退出批注模式',
      undo: '撤销',
      redo: '重做',
      html: '导出 HTML',
      pdf: '导出 PDF'
    },
    compatibility: {
      title: '5. 兼容与限制',
      li1: '支持普通网页（http/https），基于 Manifest V3 标准。',
      li2: '不支持浏览器内部页面（如 chrome://、edge://、about:）。',
      li3: '页面结构差异较大时，正文提取结果可能不同，可切换回原页面对照。',
      li4: '双页布局中极长代码行会优先换行，以保持版面稳定性。',
      li5: '批注数据存储在内存中，刷新页面后批注会丢失（导出功能可保存批注结果）。'
    },
    roadmap: {
      title: '6. 规划路线图',
      desc: '以下能力已进入项目规划（未在当前版本启用）：',
      li1: '图片导出：支持导出为 PNG、JPEG 格式。',
      li2: 'Markdown 导出：将正文导出为 Markdown 格式。',
      li3: '批注持久化：批注数据浏览器本地持久存储，刷新不丢失。',
      li4: '批注图层开关：一键显示/隐藏所有批注。',
      li5: '目录自动生成：根据文章标题层级自动生成阅读目录。',
      li6: '阅读时长估算：根据文章字数估算阅读时间。',
      tip: '说明：路线图来自项目规划文档，具体发布时间以迭代计划为准。'
    },
    faq: {
      title: '7. 常见问题',
      q1: '点击按钮没有反应怎么办？',
      a1: '请确认当前页面不是浏览器内部页面（chrome://、edge://、about:），并刷新后重试。',
      q2: '设置会丢失吗？',
      a2: '主题、布局、字号和画笔偏好保存在浏览器同步存储中，登录浏览器账号后可跨设备同步；阅读进度按页面保存在本地存储中。',
      q3: '为什么有些页面提取效果一般？',
      a3: '不同网站 DOM 结构差异较大，提取策略会优先保留正文可读性。可切换回原页面或尝试其它页面验证效果。',
      q4: '批注可以保存吗？',
      a4: '当前批注数据存储在内存中，刷新页面后会丢失。但你可以通过"导出 HTML"或"导出 PDF"功能将批注内容保存为文件。批注持久化存储已在路线图中规划。',
      q5: '我的数据会被上传吗？',
      a5: '不会。所有内容提取、批注处理和导出均在浏览器本地完成，无任何数据上传到远程服务器。扩展无需注册账号。'
    },
    privacy: {
      title: '8. 隐私说明',
      li1: '无需注册账号，无需登录。',
      li2: '所有内容提取、批注处理和导出均在浏览器本地完成。',
      li3: '不上传任何阅读内容到远程服务器。',
      li4: '仅使用浏览器存储 API 保存用户偏好和阅读进度。',
      li5: '仅在用户主动操作时对当前页面进行处理，无后台行为。'
    },
    footer: {
      text: 'Readmd Project Intro · 文档内容与当前代码能力保持一致'
    }
  },
  en: {
    pageTitle: 'Readmd Immersive Reader & Annotator',
    toc: {
      overview: 'Overview',
      install: 'Install',
      usage: 'Usage',
      shortcuts: 'Shortcuts',
      compatibility: 'Compatibility',
      roadmap: 'Roadmap'
    },
    controls: {
      light: 'Light',
      dark: 'Dark'
    },
    hero: {
      badge: 'Browser Extension Intro',
      title: 'Readmd Immersive Reader & Annotator',
      desc: 'Readmd is an all-in-one immersive reading and annotation browser extension. Auto-extract content, annotate freely, and export to HTML/PDF — making web reading as focused as reading a book.',
      install: 'Install Guide',
      features: 'Features'
    },
    overview: {
      title: '1. Features',
      reading: {
        title: '📖 Immersive Reading',
        li1: 'Content extraction: Powered by Mozilla Readability — identifies and filters out navigation, sidebars, and ads.',
        li2: 'Full-screen overlay: Isolated container with high z-index, zero CSS conflicts with the original page.',
        li3: 'Single / Dual-page layouts: Classic vertical scrolling + book-style two-column layout with position preservation.',
        li4: '10 themes + adjustable font: 6 light themes + 4 dark themes, font size 14–24px continuously adjustable.',
        li5: 'Code block optimization: Unified indentation, scrollable containers, clear visual separation from prose.',
        li6: 'Reading progress memory: Auto-saves and restores reading position per URL across both layouts.'
      },
      annotate: {
        title: '✏️ Full Annotation Suite',
        li1: 'DOM text highlighting: Select text to add fluorescent highlights, 8 colors, recolor or remove anytime.',
        li2: 'Pen drawing: Freehand with 3 sizes (S/M/L), 8 preset colors + native OS color picker, adjustable opacity.',
        li3: 'Eraser: Cleanly remove strokes without affecting the underlying content.',
        li4: 'Text notes: Click anywhere to add editable text annotations with edit and delete controls.',
        li5: 'Canvas mode: High-resolution (2x) content snapshot + independent annotation layer for precision.',
        li6: 'Pan mode: Toggle between draw and grab-to-pan for navigating large pages.'
      },
      export: {
        title: '📄 Export & Editing',
        li1: 'Export HTML: Self-contained HTML file with original content + annotations + highlights.',
        li2: 'Export PDF: Multi-page A4 PDF with annotations merged onto content, auto page splitting.',
        li3: 'Undo / Redo: 50-step history stack covering strokes, text notes, and highlights.',
        li4: 'Clear All: Reset all annotations in one click.',
        li5: 'Full keyboard shortcuts: Covering tool switching, undo/redo, and export actions.'
      }
    },
    install: {
      title: '2. Install & Start',
      manual: {
        title: 'Manual Installation (Developer Mode)',
        li1: 'Clone and install dependencies:<br><code>git clone &lt;repo-url&gt; && cd readmd && npm install</code>',
        li2: 'Build the extension:<br><code>npm run build</code> (or <code>npm run build:firefox</code> for Firefox)',
        li3: 'Open extension manager: <strong>chrome://extensions/</strong> or <strong>edge://extensions/</strong>.',
        li4: 'Enable Developer mode.',
        li5: 'Click "Load unpacked" and select the <code>.output/chrome-mv3</code> folder.',
        li6: 'Open an article page and click the extension icon to open the Readmd control panel.'
      },
      store: {
        title: 'Store Installation',
        desc: 'Coming soon to Chrome Web Store, Edge Add-ons, and Firefox Add-ons.'
      },
      tip: 'Tip: browser internal pages (e.g. chrome://) do not allow script injection.'
    },
    usage: {
      title: '3. Basic Workflow',
      reading: {
        title: 'Reading Mode',
        step1: {
          title: 'Step 1 — Enter reading mode',
          desc: 'Toggle the "Reading Mode" switch in the popup to enter the immersive reading overlay with auto-extracted content.'
        },
        step2: {
          title: 'Step 2 — Adjust reading settings',
          desc: 'Switch themes (10 options), layout (single/dual page), and font size in the popup — changes apply instantly.'
        },
        step3: {
          title: 'Step 3 — Exit reading mode',
          desc: 'Turn off the reading mode switch to return to the original page. Reading progress is automatically saved and restored.'
        }
      },
      annotate: {
        title: 'Annotation Mode',
        step1: {
          title: 'Step 1 — Enter annotation mode',
          desc: 'In reading mode, toggle the "Annotation Mode" switch in the popup to reveal the annotation toolbar at the bottom.'
        },
        step2: {
          title: 'Step 2 — Choose a tool and annotate',
          desc: 'Select pen/eraser/text note/highlighter, adjust color, size, and opacity, then start annotating the content.'
        },
        step3: {
          title: 'Step 3 — Export your work',
          desc: 'Click the export button in the toolbar or popup to save annotated content as an HTML or PDF file.'
        }
      },
      table: {
        title: 'Control Panel Settings',
        col1: 'Option',
        col2: 'Description',
        r0: { name: 'Reading Mode', desc: 'Enable/disable immersive reading overlay.' },
        r1: { name: 'Annotation Mode', desc: 'Show/hide annotation toolbar (pen, eraser, text, highlighter).' },
        r2: { name: 'Export HTML', desc: 'Save original content + annotations as a standalone HTML file.' },
        r3: { name: 'Export PDF', desc: 'Save original content + annotations as a multi-page A4 PDF.' },
        r4: { name: 'Theme', desc: 'Switch reading background and text color (10 options).' },
        r5: { name: 'Layout', desc: 'Single Page / Double Page.' },
        r6: { name: 'Font Size', desc: 'Adjust article font size (14px–24px).' }
      }
    },
    shortcuts: {
      title: '4. Keyboard Shortcuts',
      col1: 'Shortcut',
      col2: 'Action',
      a: 'Pen tool',
      e: 'Eraser tool',
      t: 'Text annotation',
      h: 'Highlight tool',
      d: 'Toggle Draw / Pan cursor',
      esc: 'Exit annotation mode',
      undo: 'Undo',
      redo: 'Redo',
      html: 'Export HTML',
      pdf: 'Export PDF'
    },
    compatibility: {
      title: '5. Compatibility & Limits',
      li1: 'Works on regular web pages (http/https), based on Manifest V3.',
      li2: 'Does not work on browser internal pages (e.g. chrome://, edge://, about:).',
      li3: 'Extraction quality varies across sites due to different DOM structures.',
      li4: 'Very long code lines are wrapped in double-page mode for layout stability.',
      li5: 'Annotations are stored in memory — they are lost on page refresh (use Export to save them).'
    },
    roadmap: {
      title: '6. Planned Roadmap',
      desc: 'The following items are planned (not yet available in the current release):',
      li1: 'Image export: Export as PNG and JPEG formats.',
      li2: 'Markdown export: Export article content as Markdown.',
      li3: 'Annotation persistence: Local browser storage for annotations, survives page refresh.',
      li4: 'Annotation layer toggle: Show/hide all annotations with one click.',
      li5: 'Table of contents: Auto-generate reading TOC from heading hierarchy.',
      li6: 'Reading time estimate: Display estimated reading time based on word count.',
      tip: 'Note: roadmap timing follows iteration planning.'
    },
    faq: {
      title: '7. FAQ',
      q1: 'What if the action button does nothing?',
      a1: 'Make sure the page is not an internal browser page (chrome://, edge://, about:), then refresh and try again.',
      q2: 'Will my settings be lost?',
      a2: 'Theme, layout, font size, and pen preferences are saved in sync storage and available across devices when signed into your browser account. Reading progress is saved locally per page.',
      q3: 'Why does extraction quality vary on some sites?',
      a3: 'Different DOM structures lead to different extraction results. The parser prioritizes readable article content.',
      q4: 'Can annotations be saved?',
      a4: 'Annotations are currently stored in memory and lost on refresh. However, you can use "Export HTML" or "Export PDF" to save annotated content as files. Annotation persistence is on the roadmap.',
      q5: 'Is my data uploaded anywhere?',
      a5: 'No. All content extraction, annotation processing, and export happen entirely locally in your browser. No data is ever uploaded to remote servers. No account registration is required.'
    },
    privacy: {
      title: '8. Privacy',
      li1: 'No account registration or login required.',
      li2: 'All content extraction, annotation, and export happen entirely locally in your browser.',
      li3: 'No article content is ever uploaded to remote servers.',
      li4: 'Only user preferences and reading progress are stored via browser storage APIs.',
      li5: 'The extension only operates when explicitly triggered by the user — no background activity.'
    },
    footer: {
      text: 'Readmd Project Intro · This page matches current implementation status'
    }
  }
};

const languageButtons = {
  zh: document.getElementById('langZh'),
  en: document.getElementById('langEn')
};

const themeButtons = {
  light: document.getElementById('themeLight'),
  dark: document.getElementById('themeDark')
};

function getValueByPath(obj, path) {
  return path.split('.').reduce((acc, segment) => (acc ? acc[segment] : undefined), obj);
}

function applyLanguage(lang) {
  const pack = i18n[lang] || i18n.zh;
  document.documentElement.lang = lang === 'en' ? 'en' : 'zh-CN';
  document.title = pack.pageTitle;

  document.querySelectorAll('[data-i18n]').forEach((node) => {
    const key = node.getAttribute('data-i18n');
    const value = getValueByPath(pack, key);
    if (typeof value === 'string') {
      node.textContent = value;
    }
  });

  document.querySelectorAll('[data-i18n-html]').forEach((node) => {
    const key = node.getAttribute('data-i18n-html');
    const value = getValueByPath(pack, key);
    if (typeof value === 'string') {
      node.innerHTML = value;
    }
  });

  Object.entries(languageButtons).forEach(([key, button]) => {
    if (!button) return;
    button.classList.toggle('active', key === lang);
    button.setAttribute('aria-pressed', key === lang ? 'true' : 'false');
  });

  localStorage.setItem('readmd-web-lang', lang);
}

function applyTheme(theme) {
  const normalizedTheme = theme === 'dark' ? 'dark' : 'light';
  document.body.setAttribute('data-theme', normalizedTheme);

  Object.entries(themeButtons).forEach(([key, button]) => {
    if (!button) return;
    button.classList.toggle('active', key === normalizedTheme);
    button.setAttribute('aria-pressed', key === normalizedTheme ? 'true' : 'false');
  });

  localStorage.setItem('readmd-web-theme', normalizedTheme);
}

function setActiveTocLink(currentId) {
  tocLinks.forEach((link) => {
    const targetId = link.getAttribute('href').slice(1);
    link.classList.toggle('active', targetId === currentId);
  });
}

function syncActiveSection() {
  let activeId = sections[0]?.id || '';
  const triggerLine = window.scrollY + 120;

  sections.forEach((section) => {
    if (section.offsetTop <= triggerLine) {
      activeId = section.id;
    }
  });

  if (activeId) {
    setActiveTocLink(activeId);
  }
}

window.addEventListener('scroll', syncActiveSection, { passive: true });
window.addEventListener('load', syncActiveSection);

languageButtons.zh?.addEventListener('click', () => applyLanguage('zh'));
languageButtons.en?.addEventListener('click', () => applyLanguage('en'));

themeButtons.light?.addEventListener('click', () => applyTheme('light'));
themeButtons.dark?.addEventListener('click', () => applyTheme('dark'));

const savedLanguage = localStorage.getItem('readmd-web-lang') || 'zh';
const savedTheme = localStorage.getItem('readmd-web-theme') || 'light';

applyLanguage(savedLanguage === 'en' ? 'en' : 'zh');
applyTheme(savedTheme === 'dark' ? 'dark' : 'light');
