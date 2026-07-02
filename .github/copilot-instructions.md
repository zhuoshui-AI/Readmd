# GitHub Copilot Instructions

尽量复用成熟的库，不要自己造轮子，你做的有别人做的好吗？

- **Description**: 这是一个浏览器扩展（Web 插件），旨在为 Markdown 风格的网页文档提供沉浸式阅读体验。它能自动提取网页正文，屏蔽目录、广告等干扰内容，并让文档全屏铺满浏览器窗口。核心功能包括：支持单页/双页布局切换、代码块清晰高亮（与文字分离）、多种护眼背景色以及可调字体大小。
- **Primary Languages/Frameworks**: HTML, CSS, JavaScript (Browser Extension API / Manifest V3).

## Architecture & Structure

- **`manifest.json`**: 插件的核心配置文件（Manifest V3）。
- **`popup/`**: 包含插件设置面板的 UI（HTML/CSS/JS），用于切换阅读模式、布局、主题和字体大小。
- **`content_scripts/`**: 注入到目标网页的脚本，负责提取正文内容、隐藏原网页元素，并渲染沉浸式阅读视图。
- **Key Components**:
  - **内容提取器 (Content Extractor)**: 负责识别并提取主要文章内容，过滤广告和侧边栏。
  - **布局管理器 (Layout Manager)**: 处理单页和双页（多列）布局的切换。
  - **主题引擎 (Theme Engine)**: 管理多种护眼背景色（如明亮、护眼黄、豆沙绿、暗黑）和字体大小调节。

## Coding Conventions

- **Naming**: 变量和函数使用 `camelCase`，类名使用 `PascalCase`。
- **Styling**: 使用 CSS 变量（`--var-name`）来管理主题，以便快速切换护眼颜色。
- **Extension APIs**: 使用标准的 Web Extension API（`chrome.*`）。确保兼容 Manifest V3 标准。

## Specific Patterns

- **代码块优化 (Code Block Optimization)**: 确保代码块（`<pre>`, `<code>`）与普通文本有明显的视觉分离（如独立的背景色和圆角）。在双页布局中，必须使用 CSS 的 `break-inside: avoid` 防止代码块被从中间截断。
- **状态管理 (State Management)**: 使用 `chrome.storage.sync` 保存用户的偏好设置（主题、布局、字体大小），确保跨会话和跨设备同步。
- **DOM 操作 (DOM Manipulation)**: 注入阅读视图时，创建一个独立的容器（例如带有高 `z-index` 的全屏 overlay），以避免与原网页的 CSS 发生冲突。

## Developer Workflows

- **Run/Test**: 在 Chrome/Edge 浏览器中通过 `chrome://extensions/` 开启开发者模式，并“加载已解压的扩展程序”。
- **Debugging**:
  - 调试 Popup：右键点击插件图标，选择“审查弹出内容 (Inspect popup)”。
  - 调试 Content Script：直接在目标网页打开浏览器的开发者工具 (F12)。

---

*Note: Keep these instructions concise and specific to this project. Avoid generic advice.*
