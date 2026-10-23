# Tabloom 技术架构与数据结构

## 1. 技术范围

- Chrome Extension Manifest V3
- 原生 HTML、CSS、JavaScript
- 无框架、无构建步骤、无第三方依赖
- 兼容 Chrome 和 Chromium 内核 Edge
- 当前无服务器、无账号系统、无遥测

## 2. 运行结构

```text
点击扩展图标
    ↓
background.js 查找或创建 dashboard.html
    ↓
dashboard.js 通过 chrome.tabs 读取所有窗口的标签页
    ↓
按网站域名聚合并渲染 Open Tabs

网页加载
    ↓
content-script.js 读取页面公开元数据
    ↓
发送 TABLOOM_PAGE_META 消息
    ↓
background.js 写入 chrome.storage.local
    ↓
dashboard.js 读取摘要并更新卡片
```

## 3. 文件职责

### manifest.json

扩展入口、版本、权限、图标（`icons/`）、后台服务和内容脚本声明。发布新版本时必须更新 `version`。

### background.js

- 监听扩展图标点击。
- 保证只打开一个 Tabloom 管理页面；已有页面时切换过去。
- 首次安装后自动打开管理页面。
- 接收网页元数据并保存为 `meta:<tabId>`。
- 标签页关闭时删除对应临时元数据。
- 浏览器启动（`runtime.onStartup`）和扩展安装/更新时，清理所有对应标签页已不存在的 `meta:*`，避免重启后残留和 tabId 复用。
- Dashboard 读取 `meta:<tabId>` 时会核对 URL，与当前标签页 URL 不一致的元数据不使用。
- 定时任务：`chrome.alarms` 注册两个周期闹钟——`tabloom:reminders`（每分钟）把到期的 `remindAt` 提升为 `remindedAt`、设置或清除工具栏角标并发送系统通知；`tabloom:sleep`（每 15 分钟）按 `autoSleep` 设置卸载闲置标签页。扩展启动、安装和设置变化时都会重新校验闹钟是否存在，避免 service worker 被回收后丢失。
- 点系统通知会打开 Tabloom 并清除该通知。

### content-script.js

读取以下公开页面信息：

- `document.title`
- `meta[name="description"]`
- `meta[property="og:description"]`
- `meta[name="twitter:description"]`
- `og:site_name` / `application-name`
- favicon

它不读取输入框、表单、Cookie 或网页正文，也不执行网络上传。

### dashboard.js

- 查询、过滤、聚合并渲染标签页。
- 切换、关闭和重新打开网页。
- 管理 For Later 与 Saved。
- 处理批量确认、单步撤销、搜索、折叠和主题。
- 每次 render 前记录聚焦元素的 `data-focus-key`，重建后还原；元素已不存在时聚焦同一位置的相邻行。
- For Later 时间淡化由 `addedAt` 实时计算（`ageLevel()`），不额外存储；页面每小时及重新可见时重新渲染。
- 设置面板：`setSetting()` 统一处理主题/音效/语言；`keymap` 录制在捕获阶段拦截按键（`recordKey`），校验冲突与浏览器保留组合后持久化。`storage.onChanged` 同步其他 Tabloom 标签页修改的 theme / sound / language / keymap。
- 浏览器全局快捷键通过 `chrome.commands.getAll()` 读取，页面重新可见时再读一次；扩展无法以编程方式修改它们，只能打开 `chrome://extensions/shortcuts`。
- 收起组（stash）：`stashWindow()` 把某个窗口的标签页快照写入 `stashes` 再关闭它们；`restoreStash()` 在新窗口恢复；两者都走同一套撤销（`undo` 类型 `unstash` / `restoreStash`）。
- 重复标签页：`duplicateTabs()` 按 `canonicalUrl` 分组，排序为正在使用 > 固定 > 最近访问，去掉每组第一个，再排除固定标签页；`render()` 把结果 id 收进 `state.duplicateIds` 供卡片显示胶囊。
- 提醒：条目上的 `remindAt` 由下拉菜单写入；展示层用 `reminderLabel()` 判断是否到期，后台负责把到期条目变成 `remindedAt` 并推送通知。
- 堆肥提示：`compostCandidates()` 取超过 14 天的条目，`shouldCompost()` 再比对 `compostAt` 时间戳，一周内不重复出现。
- Logo 姿态与空状态插画：`bloomState()` 按标签页数量返回 `open` / `droop` / `closed`，写到 `.brand-mark` 的 `data-bloom` 上，形变完全由 CSS 完成；空状态用 `<use>` 引用 `dashboard.html` 里的 `#art-*` symbol，插画配色走 `--art-*` 变量。
- 提供直接打开 HTML 时使用的演示数据，便于视觉开发。

### dashboard.css / dashboard.html

负责页面结构、设计变量、响应式布局、Light/Dark 主题以及无障碍标签。

## 4. 本地数据

使用 `chrome.storage.local`，主要键值如下：

```js
{
  later: [PageSnapshot],
  saved: [PageSnapshot],
  collapsed: {
    later: false,
    open: false,
    saved: false
  },
  theme: "system" | "light" | "dark",
  sound: "off" | "subtle" | "playful",
  language: "system" | "en" | "zh",
  keymap: {
    palette: Binding,   // 默认 ⌘K / Ctrl+K
    filter: Binding,    // 默认 /
    undo: Binding       // 默认 ⌘Z / Ctrl+Z
  },
  stashes: [Stash],
  autoSleep: "off" | "60" | "240",
  compostAt: number,          // 「堆肥」提示上次出现的时间戳
  "meta:<tabId>": PageMeta
}
```

`Stash`：

```js
{
  id: string,
  createdAt: number,
  windowId: number,
  tabs: [{ url, title, summary, siteName, favicon }]
}
```

`PageSnapshot` 新增可选字段 `remindAt`（提醒到期时间戳）。到期后后台把它变成 `remindedAt`，Dashboard 据此显示「Reminder came due」并高亮；两者都不写入时不显示提醒。

`Binding`：`{ key, mod, shift, alt }`。`key` 为小写的 `KeyboardEvent.key`；`mod` 在 macOS 表示 ⌘，其他系统表示 Ctrl。缺失或损坏的条目用默认值补齐（`normalizeKeymap`）。

`PageSnapshot`：

```js
{
  id: string | number,
  url: string,
  title: string,
  summary: string,
  siteName: string,
  favicon: string,
  addedAt: number
}
```

`PageMeta`：

```js
{
  tabId: number,
  url: string,
  title: string,
  summary: string,
  siteName: string,
  favicon: string,
  updatedAt: number
}
```

Open Tabs 不持久化，每次直接以 `chrome.tabs.query({})` 的结果为准。

声音通过 Web Audio API 在用户操作后本地生成，不使用远程文件或额外权限。旧版本没有 `sound` 字段时自动使用 `subtle`。

## 5. 网站聚合规则

默认去除 `www.`，按主要域名聚合。代码对 `co.uk`、`com.cn`、`com.au`、`co.jp`、`com.br` 和 `co.nz` 做了简单处理。

这不是完整的 Public Suffix List 实现。如果未来需要准确处理更多特殊域名，应引入可靠的公共后缀数据，而不是继续手工添加大量规则。

## 6. 权限说明

- `tabs`：标签页读取、聚焦和关闭。
- `storage`：本地持久化。
- `contextMenus`：右键菜单收集网页和链接。
- `sessions`：撤销时从最近关闭列表恢复标签页。
- `alarms`：定时检查提醒到期与自动休眠。
- `notifications`：提醒到期时的系统通知。
- `<all_urls>`：让内容脚本在 HTTP/HTTPS 页面读取公开元数据。

减少 `<all_urls>` 权限会影响自动摘要。未来可考虑 `optional_host_permissions`，让用户按需授权。

## 7. 已知限制

- `chrome://`、扩展商店等受保护页面无法注入内容脚本。
- 部分网页没有 description，摘要会退回 URL 路径或域名。
- 撤销关闭依赖浏览器最近关闭列表（最多 25 条）；超出后只能按 URL 重新打开，无法恢复历史。
- 页面内确认提示需要内容脚本，受保护页面只显示工具栏角标。
- 本地存储不会自动跨设备同步。
- 没有全文正文提取，也不会生成 AI 摘要。
- 休眠依赖 `chrome.tabs.discard`：受保护页面（`chrome://`、扩展商店）不可卸载，会直接跳过。
- 提醒精度受 `chrome.alarms` 限制，最短周期为 1 分钟，因此到期提示最多延迟约 1 分钟。
- 收起组只保存 URL 和标题，不保存滚动位置、表单内容或登录状态。
- 系统通知需要用户在操作系统层面允许 Chrome 通知；被拒绝时只会退化为工具栏角标。
