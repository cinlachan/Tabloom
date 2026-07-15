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

扩展入口、版本、权限、后台服务和内容脚本声明。发布新版本时必须更新 `version`。

### background.js

- 监听扩展图标点击。
- 保证只打开一个 Tabloom 管理页面；已有页面时切换过去。
- 首次安装后自动打开管理页面。
- 接收网页元数据并保存为 `meta:<tabId>`。
- 标签页关闭时删除对应临时元数据。

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
  "meta:<tabId>": PageMeta
}
```

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
- `<all_urls>`：让内容脚本在 HTTP/HTTPS 页面读取公开元数据。

减少 `<all_urls>` 权限会影响自动摘要。未来可考虑 `optional_host_permissions`，让用户按需授权。

## 7. 已知限制

- `chrome://`、扩展商店等受保护页面无法注入内容脚本。
- 部分网页没有 description，摘要会退回 URL 路径或域名。
- 关闭后的撤销只能重新打开 URL，不能恢复浏览历史、滚动位置或页面表单状态。
- 本地存储不会自动跨设备同步。
- 没有全文正文提取，也不会生成 AI 摘要。
