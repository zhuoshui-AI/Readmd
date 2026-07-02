# Readmd Chrome 商店上架材料（中英文）

## 1) Store Listing（中文）

### 应用名称
Readmd - 沉浸式阅读器

### 简短描述（132 字以内）
为 Markdown 风格网页提供沉浸式阅读体验：自动提取正文、双页阅读、代码块清晰展示、主题与字体可调。

### 详细描述
Readmd 是一款面向技术文档与长文阅读的浏览器扩展，帮助你在任意网页获得更专注的阅读体验。

核心能力：
- 智能正文提取：基于 Readability 算法，自动提取文章主体并尽量过滤导航、广告与侧栏。
- 沉浸式阅读层：一键进入阅读模式，弱化页面干扰元素。
- 单页 / 双页布局：按阅读习惯切换版式，支持连续阅读。
- 代码块优化：代码与正文视觉分离，长代码块使用可滚动容器展示，避免内容截断。
- 主题与字体调节：支持多种护眼主题与字体大小设置。
- 快速退出：可在插件面板中一键退出阅读模式，恢复原网页。

适用场景：
- 技术博客、开发文档、教程文章
- 长篇说明文、知识库页面
- 需要专注阅读且减少视觉干扰的网页内容

说明：
- 扩展仅在你主动操作时对当前页面进行阅读视图处理。
- 扩展不要求账号登录，不上传阅读内容到远程服务器。

### 分类建议
Productivity

### 语言
Chinese (Simplified), English

---

## 2) Store Listing（English）

### Extension Name
Readmd - Immersive Reader

### Short Description (up to 132 chars)
Immersive reading for Markdown-style web pages with smart extraction, dual-page layout, code block containers, and themes.

### Detailed Description
Readmd is a browser extension designed for focused reading on technical docs and long-form web content.

Key features:
- Smart content extraction: Uses the Readability algorithm to identify and extract the main article content.
- Immersive reading overlay: Enter a clean reading view and reduce visual distractions.
- Single / dual-page layouts: Switch between layouts to match your reading preference.
- Code block optimization: Clear visual separation from text, with scrollable containers for long code blocks.
- Themes and font size controls: Multiple eye-care themes and adjustable text size.
- Quick exit: Exit reading mode instantly and return to the original page.

Best for:
- Technical blogs and developer docs
- Tutorials and long-form articles
- Any page where you want cleaner, distraction-free reading

Notes:
- The extension only applies reading mode when triggered by the user.
- No account is required.
- No reading content is uploaded to remote servers.

---

## 3) Permissions Justification（可粘贴到商店权限说明）

- storage
  - 用途：保存用户阅读偏好（主题、布局、字体大小），保证下次打开时保持一致。
- activeTab
  - 用途：仅在用户点击插件时，访问当前激活标签页并应用阅读模式。
- scripting
  - 用途：在用户触发时向当前页面注入阅读模式脚本与样式，以渲染沉浸式阅读视图。

最小权限原则说明：
- 仅在用户交互触发时对当前标签页执行操作。
- 不申请与功能无关的权限。

---

## 4) 发布备注模板（Release Notes）

### v1.0.0
- Initial MVP release
- Smart article extraction with Readability integration
- Single-page and dual-page reading layouts
- Scrollable code block container for long code snippets
- Theme and font-size customization
- One-click exit from reading mode

---

## 5) 截图建议

至少 3 张：
1. 原网页 vs 阅读模式对比
2. 双页模式效果（包含代码块）
3. Popup 设置面板（主题 / 布局 / 字号 / 退出按钮）

建议尺寸：1280x800 或 640x400

---

## 6) 上架前核对清单

- [ ] `manifest.json` 版本号已递增
- [ ] 已准备 16/48/128 图标并在 manifest 中声明（建议）
- [ ] 在普通网页上功能可用（非 `chrome://` 页面）
- [ ] Popup 中 `Toggle Reader View` 与 `Exit Reader View` 均可用
- [ ] 双页模式下长代码块可滚动展示
- [ ] 商店描述与实际行为一致（不夸大、不误导）
- [ ] 隐私政策文案已准备并可访问（Public 发布建议提供链接）
