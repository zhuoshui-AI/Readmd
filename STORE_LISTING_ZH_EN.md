# Readmd 商店上架材料（中英文）

---

## 1) Store Listing（中文）

### 扩展名称
Readmd - 沉浸式阅读 & 批注器

### 简短描述（132 字以内）
为网页文章提供沉浸式阅读、批注标注与导出的一体化工具。自动提取正文，支持画笔/荧光笔/文字批注，导出 HTML/PDF。

### 详细描述

**Readmd 是一款集沉浸式阅读与全文批注于一体的浏览器扩展，专为技术文档、博客文章和长文阅读场景设计。**

#### 📰 智能正文提取
基于 Mozilla Readability 算法，自动识别并提取网页正文，过滤导航栏、广告、侧边栏等干扰元素。即使算法提取失败，也会智能降级到页面主要内容区域，确保阅读体验的连续性。

#### 📖 沉浸式阅读模式
一键进入全屏阅读视图，以高 `z-index` 独立容器渲染，与原网页 CSS 完全隔离，无需担心样式冲突。代码块自动优化排版：统一缩进、可滚动容器、与正文的清晰视觉分离。

#### 📐 单页 / 双页布局

- **单页模式**：经典纵向滚动，适合专注阅读
- **双页模式**：仿书页双栏布局，适合宽屏显示器

布局切换时自动保持阅读进度，无需手动找回位置。

#### 🎨 10 种主题 + 无极字号

- **浅色系列**：浅色、护眼黄、豆沙绿、薰衣草紫、薄雾灰、海洋蓝
- **深色系列**：深色、深紫、深灰、深蓝
- 字号范围 14px – 24px，滑块连续调节
- 所有偏好通过浏览器账号自动跨设备同步

#### 📍 阅读进度记忆
自动记住每个页面的阅读位置（按 URL 独立存储），下次打开时一键恢复到上次离开的位置，支持单页和双页两种布局。

#### ✏️ 完整的批注标注系统

**DOM 文本高亮模式：**

- 在阅读视图中选中任意文字，浮出颜色面板即时添加荧光笔高亮
- 8 种预设高亮色，点击已有高亮可换色或删除
- 高亮标注在撤销/重做和导出中完整保留

**画布批注模式：**

首次进入非高亮批注工具时，自动通过 html2canvas 对内容区域进行高分辨率（2x）快照，然后开启画布批注层：

- **🖊️ 画笔**：自由涂鸦，支持 3 档笔触（S/M/L）、8 种预设色 + 系统取色器、透明度滑块（10%–100%）
- **🧹 橡皮擦**：精准擦除笔画，不破坏底层内容
- **💬 文字批注**：点击任意位置添加可编辑文本框，支持编辑（✏️）和删除（×）操作
- **🖍️ 荧光笔**：宽半透明笔触（25% 透明度），模拟真实荧光笔效果
- **🖐️ 拖拽平移**：一键切换绘图/平移模式，拖拽浏览大型页面
- **↩️ 撤销/重做**：50 步历史栈，覆盖所有批注类型（画笔/文字/高光）
- **🗑️ 全部清除**：一键重置所有批注

#### 📄 导出

- **导出 HTML**：生成包含原文 + 批注 + 高亮的独立 HTML 文件，可直接在浏览器中打开查看
- **导出 PDF**：多页 A4 PDF，批注内容合并渲染到正文上，支持自动分页
- 导出文件通过浏览器原生下载 API 保存，支持"另存为"对话框

#### ⌨️ 完整键盘快捷键
| 快捷键 | 功能 |
|--------|------|
| `A` | 画笔工具 |
| `E` | 橡皮擦工具 |
| `T` | 文字批注工具 |
| `H` | 荧光笔工具 |
| `D` | 绘图/平移切换 |
| `Esc` | 退出批注模式 |
| `Ctrl+Z` / `⌘Z` | 撤销 |
| `Ctrl+Y` / `⌘Y` | 重做 |
| `Ctrl+S` / `⌘S` | 导出 HTML |
| `Ctrl+Shift+S` / `⌘Shift+S` | 导出 PDF |

#### 适用场景

- 📚 阅读技术博客、开发文档、教程文章
- 📝 对网页文章做标注笔记
- 📄 将标注后的文章导出为 PDF 存档
- 🎓 学术论文、知识库页面的精读与批注
- 🌙 夜间/弱光环境下的舒适阅读

#### 隐私说明

- 扩展仅在用户主动操作时对当前页面进行处理
- 无需注册账号，无需登录
- 所有内容提取、批注处理和导出均在浏览器本地完成
- 不上传任何阅读内容到远程服务器
- 仅存储用户偏好设置和阅读进度（本地存储）

### 分类建议
Productivity

### 语言
Chinese (Simplified), English

---

## 2) Store Listing（English）

### Extension Name
Readmd - Immersive Reader & Annotator

### Short Description (up to 132 chars)
Immersive reading & annotation tool for web articles. Auto-extracts content, supports pen/highlighter/text notes, export to HTML & PDF.

### Detailed Description

**Readmd is an all-in-one immersive reading and annotation browser extension, purpose-built for technical documentation, blog posts, and long-form web content.**

#### 📰 Smart Content Extraction
Powered by Mozilla's Readability algorithm, Readmd automatically identifies and extracts the main article content while filtering out navigation, ads, sidebars, and other distractions. Falls back intelligently to the primary content area when auto-extraction cannot be performed, ensuring a seamless reading experience.

#### 📖 Immersive Reading Mode
Enter a full-screen reading overlay with a single click. The reading view renders in an isolated container with high z-index, completely free of CSS conflicts with the original page. Code blocks are automatically optimized — unified indentation, scrollable containers, and clear visual separation from body text.

#### 📐 Single & Dual-Page Layouts

- **Single page**: Classic vertical scrolling for focused reading
- **Dual page**: Book-style two-column layout, ideal for wide screens

Reading position is preserved when switching between layouts.

#### 🎨 10 Themes + Adjustable Font Size

- **Light themes**: Light, Eye-care Yellow, Bean Green, Lavender Purple, Mist Gray, Ocean Blue
- **Dark themes**: Dark, Dark Purple, Dark Gray, Dark Blue
- Font size: 14px – 24px, continuously adjustable via slider
- All preferences sync across devices via browser account

#### 📍 Reading Progress Memory
Automatically remembers your reading position for each page (stored per URL). Jump right back to where you left off — works across both single and dual-page layouts.

#### ✏️ Full Annotation Suite

**DOM Highlight Mode:**

- Select any text in the reading view and a floating color palette appears
- 8 preset highlight colors with instant preview
- Click existing highlights to recolor or remove them
- Highlights persist through undo/redo and are fully preserved in exports

**Canvas Annotation Mode:**

When you activate any non-highlight annotation tool, Readmd captures a high-resolution (2x) snapshot of the content via html2canvas and opens a canvas annotation layer:

- **🖊️ Pen**: Freehand drawing with 3 sizes (S/M/L), 8 preset colors + native OS color picker, opacity slider (10%–100%)
- **🧹 Eraser**: Cleanly remove strokes without affecting the underlying content
- **💬 Text Notes**: Click to add editable text annotations — with edit (✏️) and delete (×) buttons
- **🖍️ Highlighter**: Wide, semi-transparent strokes (25% opacity) that mimic real fluorescent highlighters
- **🖐️ Pan**: Toggle between draw and grab-to-pan modes for navigating large pages
- **↩️ Undo/Redo**: 50-step history stack covering all annotation types (strokes, text, highlights)
- **🗑️ Clear All**: Reset all annotations in one click

#### 📄 Export

- **Export HTML**: Generates a self-contained HTML file with original content + annotations + highlights, openable in any browser
- **Export PDF**: Multi-page A4 PDF with annotations merged onto the content, automatic page splitting
- Files are saved via the browser's native download API with "Save As" dialog

#### ⌨️ Full Keyboard Shortcuts
| Shortcut | Action |
|----------|--------|
| `A` | Pen tool |
| `E` | Eraser tool |
| `T` | Text annotation |
| `H` | Highlight tool |
| `D` | Toggle Draw / Pan cursor |
| `Esc` | Exit annotation mode |
| `Ctrl+Z` / `⌘Z` | Undo |
| `Ctrl+Y` / `⌘Y` | Redo |
| `Ctrl+S` / `⌘S` | Export HTML |
| `Ctrl+Shift+S` / `⌘Shift+S` | Export PDF |

#### Best For

- 📚 Reading technical blogs, developer docs, and tutorials
- 📝 Annotating web articles with highlights and notes
- 📄 Exporting annotated articles as PDF archives
- 🎓 Close reading of academic papers and knowledge-base pages
- 🌙 Comfortable reading in low-light / night environments

#### Privacy

- The extension only processes pages when explicitly triggered by the user
- No account registration or login required
- All content extraction, annotation, and export happens entirely locally in your browser
- No article content is ever uploaded to remote servers
- Only user preferences and per-URL reading progress are stored locally

### Category
Productivity

### Language
Chinese (Simplified), English

---

## 3) Permissions Justification（权限说明，可粘贴到商店）

### storage
保存用户阅读偏好（主题、布局、字号、画笔设置）和阅读进度，确保下次打开时保持一致。
Stores user preferences (theme, layout, font size, pen settings) and reading progress for consistency across sessions.

### activeTab
仅在用户点击扩展图标时，访问当前激活标签页并应用阅读模式。扩展不会在后台自动访问任何标签页。
Accesses the active tab only when the user clicks the extension icon. The extension never accesses tabs automatically.

### scripting
在用户触发时向当前页面注入阅读模式脚本与样式，以渲染沉浸式阅读视图和批注工具栏。
Injects reading mode scripts and styles into the active page upon user action, to render the reading overlay and annotation toolbar.

### downloads
用于导出 HTML 和 PDF 文件到本地磁盘。仅在用户主动点击导出按钮时触发。
Used solely for saving exported HTML and PDF files to disk. Triggered only by explicit user action.

### host_permissions: `<all_urls>`
允许扩展在用户访问的任意网页上启用阅读模式。扩展不会在后台扫描或访问用户页面，仅在用户点击扩展时对当前页面生效。
Allows the extension to enable reading mode on any webpage the user visits. The extension does not scan or access pages in the background — it only operates on the current page when the user explicitly triggers it.

### 最小权限原则
- 所有功能仅在用户交互触发时执行
- 不申请与核心功能无关的权限
- 不上传用户数据到任何远程服务器

---

## 4) Release Notes Template

### v1.0.0
- Initial release
- Smart article extraction with Mozilla Readability integration
- Single-page and dual-page reading layouts
- 10 built-in themes (6 light + 4 dark)
- Adjustable font size (14px–24px)
- Reading progress memory per URL
- DOM text highlighting with 8 colors
- Canvas annotation mode with pen, eraser, highlighter, and text notes
- 50-step undo/redo history
- Pan mode for navigating large pages
- HTML and PDF export with annotations preserved
- Keyboard shortcuts for all tools and actions
- Cross-device preference sync

---

## 5) Screenshot Suggestions

At least 5 screenshots recommended:

1. **Before/After**: Side-by-side comparison — original webpage vs Readmd reading mode (1280×800)
2. **Canvas Annotation Mode**: Drawing with pen tool + text notes on content, toolbar visible (1280×800)
3. **DOM Highlight Mode**: Selected text with floating color palette + highlighted passages (1280×800)
4. **Popup Settings Panel**: Theme selector, layout toggle, font size slider, export buttons (640×400)
5. **Exported PDF**: The resulting PDF file with annotations visible (1280×800)

Recommended size: 1280×800 or 640×400

---

## 6) 上架前核对清单 / Pre-Launch Checklist

- [ ] `wxt.config.ts` 中版本号已递增
- [ ] 已准备 16×16 / 48×48 / 128×128 图标（`public/icons/`）
- [ ] 在普通网页上功能可用（非 `chrome://` 或 `about://` 页面）
- [ ] Popup 中阅读模式开关可正常切换
- [ ] Popup 中批注模式开关可正常切换
- [ ] 主题选择器 10 种主题均生效
- [ ] 单页/双页布局切换无异常
- [ ] 字号滑块调节正常
- [ ] 画布批注模式：画笔/橡皮擦/文字/荧光笔均可用
- [ ] DOM 高亮模式：选中文字弹出调色板、换色、删除均可用
- [ ] 撤销/重做功能正常（含文字批注和高光的撤销恢复）
- [ ] HTML 导出包含完整批注和样式
- [ ] PDF 导出内容完整且自动分页
- [ ] 键盘快捷键在工具栏可见时正常工作
- [ ] `Esc` 可正常退出批注模式
- [ ] 双页模式下长代码块可滚动、不被截断
- [ ] 商店描述与实际行为一致（不夸大、不误导）
- [ ] 隐私政策文案已准备并可访问（Public 发布建议提供链接）
- [ ] 无 console 报错或未捕获异常
