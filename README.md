# Tabloom

> Keep tabs clear. Save what matters.

Tabloom 是一个本地优先的 Chrome / Edge 标签页管理扩展，用于整理正在打开的网页、待处理网页和收藏网页。当前版本不需要后端，也不会把浏览数据发送到服务器。

## 快速安装

1. Chrome 打开 `chrome://extensions`；Edge 打开 `edge://extensions`。
2. 开启右上角 **Developer mode / 开发者模式**。
3. 点击 **Load unpacked / 加载已解压的扩展程序**。
4. 选择整个 `tab-atlas` 文件夹，不要选择 ZIP 或某个单独文件。
5. 在浏览器扩展菜单中固定 **Tabloom**。
6. 点击 Tabloom 图标打开完整管理页面。

## 功能概览

- `For Later`：保存待处理网页；原标签页关闭后依然保留。
- `Open Tabs`：按网站聚合所有浏览器窗口中正在打开的标签页。
- `Saved`：长期收藏需要保留的网页。
- 点击网页切换到已打开的标签页；已关闭的待处理或收藏网页会重新打开。
- 支持单项和网站级操作，以及 `Complete all`、`Close all`、`Remove all`。
- 支持搜索、区块折叠、操作确认和单步撤销。
- 默认跟随系统主题，并可手动选择 Light / Dark。
- 提供 Off / Subtle / Playful 三档本地操作声音、轻触感动效和点击位置光标反馈。
- 产品界面使用英文；网页自身的标题和摘要保持原始语言。

## 维护文档

- [产品与交互规格](docs/PRODUCT_SPEC.md)
- [视觉与文案规范](docs/DESIGN_SYSTEM.md)
- [技术架构与数据结构](docs/ARCHITECTURE.md)
- [日常更新维护指南](docs/MAINTENANCE.md)
- [测试与发布清单](docs/RELEASE_CHECKLIST.md)
- [版本记录](CHANGELOG.md)

## 项目文件

```text
tab-atlas/
├── manifest.json          # 扩展声明、版本和权限
├── background.js          # 点击扩展图标、页面元数据存储
├── content-script.js      # 读取网页自身的标题、摘要和站点信息
├── dashboard.html         # 管理页面结构
├── dashboard.css          # 浅色/深色主题和响应式视觉
├── dashboard.js           # 标签页、待处理、收藏和交互逻辑
├── docs/                  # 产品、设计、技术和维护资料
├── CHANGELOG.md           # 每个版本的修改记录
└── README.md              # 项目入口
```

## 隐私与权限

- `tabs`：读取标签页标题和 URL，以及切换或关闭标签页。
- `storage`：在本地保存 For Later、Saved、主题和折叠状态。
- `<all_urls>`：读取网页公开的标题、favicon、站点名称和 description 元数据，用于形成摘要；不会读取表单内容，也不会上传数据。

Chrome 内部页面（例如 `chrome://settings`）禁止内容脚本运行，因此这类页面的摘要只能使用 URL 信息。关闭标签页后的撤销会重新打开对应 URL，但无法恢复原标签页的前进/后退历史。
