# Source Peek

把鼠标停在链接上，直接看到它指向的内容 —— 不用离开笔记，不用切换窗口。

这是一个 Obsidian 插件，专门服务于你在笔记里写下的**代码链接**和**网页链接**。悬停时弹出一个小窗，显示链接指向的具体内容：源代码的某几行、仓库里的某个文件，或者网页的某个章节。

**桌面端专用** —— 它通过 Node 的文件系统 API 读取磁盘上的源码。

**英文文档**：[README.md](README.md)

---

## 快速开始

1. 安装并启用插件（见[安装](#安装)）
2. 在笔记里写一个代码链接：

   ```markdown
   [解析器](../src/main.c#L18)
   ```

3. 把鼠标停在链接上 —— **阅读视图直接悬停**，**编辑模式按住 Ctrl 再悬停**
4. 小窗弹出，显示 `../src/main.c` 的第 18 行

> 两个视图规则不同，是因为 Obsidian 自带的页面预览就是这样：阅读时不需要按键，编辑时按住 Ctrl。本插件刻意保持一致，你的肌肉记忆不用改。

---

## 链接语法

### 一、源代码（本地文件）

```markdown
[解析器](../src/main.c#L18)         单行
[循环体](../src/main.c#L18-23)      行区间
[同上](../src/main.c#L18-L23)       也是行区间（GitHub 写法）
```

**行号是必需的**。没有 `#L18` 的路径不会被当作代码链接 —— 没有行号，就没有要显示的东西。

悬停时：

- 只显示你点名的那些行，**不带额外上下文**
- 带语法高亮（按文件扩展名判断语言）
- 超过 500 字符的行会被截断，避免压缩过的代码撑爆小窗

**路径解析规则**：只有两种写法，都以 vault 为界。

| 写法 | 相对谁 |
|---|---|
| `./src/main.rs`、`../02_use_paths/src/a.rs` | **笔记所在的文件夹**，`..` 可以往上走 |
| `/src/main.rs` | **vault 根目录**（开头的斜杠指 vault 顶部，不是文件系统根） |

**不能指向 vault 之外** —— 这是刻意的。本插件服务于笔记库自己的代码；要引用别人的仓库，就用 GitHub/GitLab 链接（见下一节），那走的是网页抓取路径。越界的路径会被拒绝，不会去读。

### 二、仓库里的代码（远程文件）

```markdown
[上游实现](https://github.com/owner/repo/blob/main/src/main.c#L18-L23)
```

GitHub 和 GitLab 的 blob 链接会被自动转换成 raw 地址抓取，然后按本地文件一样的方式显示。

| 平台 | 你写的 | 实际抓取 |
|---|---|---|
| GitHub | `github.com/o/r/blob/main/a.c` | `raw.githubusercontent.com/o/r/main/a.c` |
| GitLab | `gitlab.com/g/p/-/blob/main/a.c` | `gitlab.com/g/p/-/raw/main/a.c` |

### 三、网页

```markdown
[整页](https://example.com/page)
[某节](https://example.com/page#install)
[页首到某节](https://example.com/page#-#install)
[两节之间](https://example.com/page#install-usage)
[某节到页尾](https://example.com/page#install-)
```

`#` 之后的文字用来定位标题，连字符决定取哪一段：

| 写法 | 显示内容 |
|---|---|
| *（无 `#`）* | 整个页面 |
| `#install` | 该标题**及其下属内容**，到下一个同级或更高级标题为止 |
| `#-#install` | 从**页首**到该标题（**不含**该标题本身） |
| `#install-usage` | 从 install 到 usage（**含** install，**不含** usage） |
| `#install-` | 从该标题到**页尾** |

**标题匹配**有三种方式，按顺序尝试：

1. **元素的 `id` 精确匹配** —— 这是从浏览器地址栏复制来的锚点。很多文档站把 id 放在包裹标题的容器上（rustdoc 就是 `<section id="method.new"><h4>pub const fn new()...</h4>`），而 id 与标题文字往往完全不同
2. **标题文字的 slug** —— 小写、去标点、空格转连字符。`#getting-started` 能命中 `Getting Started`
3. **标题文字本身**（忽略大小写）—— 兜底，用于全是标点的标题

**标题本身含连字符怎么办？** 比如 `#getting-started`。插件会先尝试整串匹配（当作一个标题），失败后才按连字符拆分（当作范围）。拆分时逐个连字符尝试，取两半都能解析的那一刀。

**找不到标题时**只报告未找到，**不显示整页** —— 你要的是那一节，给你整页是在回答另一个问题。

---

## 网页内容的渲染

小窗里的网页不是纯文本堆砌：

- **标题**保留层级（h1–h6），可以看出页面结构
- **段落**正常换行
- **列表**带项目符号
- **引用块**有左边框
- **行内代码**（`<code>`）显示为等宽字符样式，不混进正文
- **代码块**（`<pre>`）带背景框、语法高亮、保留缩进、可横向滚动

代码块的语言识别覆盖各家文档站的实际写法：

| 写法 | 来源 |
|---|---|
| `language-python` / `lang-js` | Prism、常见 Markdown 渲染器 |
| `highlight-python3` | Sphinx（Python 官方文档） |
| `brush: js` | Alex Gorbatchev 高亮器（MDN） |
| `data-lang="go"` | 部分站点 |

`python3` → `python`、`html5` → `html`：版本号会被剥离。

---

## 设置

| 设置项 | 默认值 | 说明 |
|---|---|---|
| **悬停时预览** | 开 | 总开关。命令「切换悬停预览」也能翻转它 |
| **按住时显示预览** | Ctrl | 悬停时需按住的键。可选 Ctrl / Shift / Alt / 自定义组合 / **只需悬停**。Ctrl 与 Obsidian 自带预览一致，在 Mac 上识别为 Cmd |

设置页底部还有一段语法速查，不必回来翻文档。

---

## 交互细节

**触发顺序无所谓** —— 先按 Ctrl 再移上去，或者先移上去再按 Ctrl，都会触发。松开 Ctrl 不会收回小窗（否则手指一抬面板就没了），需要移开鼠标或按 Esc。

**只在实际的链接文字上触发** —— 鼠标停在链接旁边的空白处不会触发，即使那一行以链接结尾。

**小窗可以进去** —— 它不是一个碰鼠标就消失的提示气泡。你可以把鼠标移进小窗、滚动它、选中里面的文字。

**关闭方式**：滚动页面、按 Esc、点击别处、窗口失焦。

**不干扰 Obsidian 自带功能** —— 代码链接会被标记为外部链接，所以 Obsidian 的页面预览不会去 vault 里找它、也不会弹出「找不到」或「Follow link」提示。普通的 vault 笔记链接和附件链接完全不受影响。

---

## 已知限制

**纯前端渲染的网页无法预览。** 插件抓取的是服务器返回的原始 HTML，不执行 JavaScript。所以像 `help.obsidian.md` 这类单页应用，抓下来只有一个空壳。这是 `requestUrl` 的固有边界，不是可以绕过的。

**超长页面会变慢。** 网页是完整绘制的，没有可调的上限。Rust 的 `Vec` 文档页有 955KB、数百个标题，整页预览会明显变慢 —— 建议用标题语法缩小范围。内置一道 2000 块的安全上限，只用于挡住病态页面，正常文档页碰不到。

**Prism 语法按需加载。** 某种语言的代码块如果此前从未在笔记里出现过，首次预览可能显示为无高亮。Obsidian 会在渲染后补上，但预览窗是瞬时的。

---

## 安装

**手动安装**：把 `main.js`、`manifest.json`、`styles.css` 复制到 `<你的库>/.obsidian/plugins/source-peek/`，然后在设置里启用。三个文件可从 [Releases](https://github.com/yunforge/obsidian-source-peek/releases) 下载，也可以按下面的步骤从源码构建。

**从源码构建**：

```sh
git clone https://github.com/yunforge/obsidian-source-peek.git
cd obsidian-source-peek
npm install
npm run build     # 生成 main.js 和 styles.css
npm test          # 运行全部测试
```

`main.js` 和 `styles.css` 是生成物，请改 `src/` 后重新构建，不要直接编辑它们。

---

## 兼容性

需要 Obsidian 1.4.0 或更新版本。桌面端专用 —— 移动端没有 Node 的文件系统 API。

界面语言跟随 Obsidian 设置，目前提供**英文**和**简体中文**，其他语言回退到英文。

想添加语言？复制 `src/locales/en.js` 为 `src/locales/<语言>.js` 并翻译，然后在 `src/i18n.js` 的 `LOCALES` 里加一行。区域标签会自动归到基础语言（`zh-TW` → `zh`），所以每种语言只需一个文件。

---

## 许可证

MIT，见 [LICENSE](LICENSE)。
