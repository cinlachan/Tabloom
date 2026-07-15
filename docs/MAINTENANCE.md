# Tabloom 日常更新维护指南

## 1. 最常见的修改位置

| 想修改的内容 | 文件 |
| --- | --- |
| 产品名称、权限、版本号 | `manifest.json` |
| 顶部栏、区块和弹窗结构 | `dashboard.html` |
| 颜色、间距、卡片样式、主题 | `dashboard.css` |
| 标签页、待处理、收藏和交互 | `dashboard.js` |
| 网页摘要读取逻辑 | `content-script.js` |
| 点击插件图标后的行为 | `background.js` |
| 版本变化记录 | `CHANGELOG.md` |

## 2. 修改后的本地生效方式

1. 保存项目文件。
2. 打开 `chrome://extensions`。
3. 找到 Tabloom，点击 **Reload / 重新加载**。
4. 刷新已打开的 Tabloom 页面。
5. 如果修改了 `content-script.js`，还需要刷新用于测试的普通网页。

修改本地存储结构时，旧数据可能继续存在。测试全新状态可在扩展详情页清除扩展数据，但这会删除用户的 For Later 和 Saved，操作前应先备份。

## 3. 版本号规则

版本写在 `manifest.json` 中，建议使用语义化版本：`主版本.次版本.修订版本`。

- 修订版本，例如 `2.0.1`：小型修复、文案或样式调整。
- 次版本，例如 `2.1.0`：新增功能，同时兼容旧数据。
- 主版本，例如 `3.0.0`：存在不兼容变化或较大架构升级。

每次发布同步更新 `CHANGELOG.md`，写明新增、修改、修复和已知问题。

## 4. 修改数据结构时

不要直接假设用户本地数据是最新格式。新增字段应提供默认值，删除或重命名字段应增加迁移逻辑。

建议在正式增加复杂数据迁移前新增：

```js
{
  schemaVersion: 1
}
```

启动时根据 `schemaVersion` 逐步迁移，迁移成功后再更新版本号。

## 5. 修改权限时

任何新增权限都可能让浏览器重新向用户确认，并影响商店审核。修改 `permissions`、`host_permissions` 或 `content_scripts.matches` 前必须：

1. 说明该功能为什么必须使用权限。
2. 判断是否可改为可选权限。
3. 更新 README 和隐私说明。
4. 使用已安装旧版本执行升级测试。

## 6. 数据备份与导出

当前界面尚未提供导出功能。开发调试时可以在扩展管理页打开 Tabloom 的 Service Worker 控制台，读取：

```js
chrome.storage.local.get(null).then(console.log)
```

不要在不知情的情况下清除用户扩展数据。正式维护建议优先开发 JSON 导入/导出功能。

## 7. 打包

本地安装永远选择 `tab-atlas` 文件夹。用于归档或交付时，在项目上一级目录运行：

```bash
zip -rFS tab-atlas.zip tab-atlas -x '*.DS_Store'
unzip -t tab-atlas.zip
```

第一条命令更新压缩包，第二条检查压缩包是否损坏。Chrome Web Store 上传的是 ZIP，开发者模式加载的是文件夹。

## 8. 建议的维护顺序

1. 先更新产品规格或明确需求。
2. 修改最小范围的源文件。
3. 运行语法和 Manifest 检查。
4. 在 Light、Dark 和 System 三种主题下测试。
5. 测试旧数据是否仍可读取。
6. 更新版本号和 CHANGELOG。
7. 重新加载扩展并完成发布清单。
8. 生成新的 ZIP，并保留上一版本归档。
