# Tabloom 测试与发布清单

每次准备交付或发布新版本时复制本清单，并逐项确认。

## 1. 静态检查

- [ ] `manifest.json` 是有效 JSON。
- [ ] `background.js`、`content-script.js`、`dashboard.js` 通过语法检查。
- [ ] Manifest 版本号已更新。
- [ ] CHANGELOG 已记录本次变化。
- [ ] 没有把密码、Token、个人浏览数据或测试数据提交进项目。
- [ ] 未引入不必要的权限和外部网络请求。

推荐命令：

```bash
node --check dashboard.js
node --check background.js
node --check content-script.js
python3 -m json.tool manifest.json >/dev/null
```

## 2. 安装与启动

- [ ] 能通过 `Load unpacked` 成功加载。
- [ ] 扩展管理页没有错误提示。
- [ ] 点击工具栏图标能打开 Tabloom。
- [ ] 重复点击图标不会创建多个 Tabloom 页面，而是切换到已有页面。
- [ ] 首次安装能够自动打开管理页面。

## 3. Open Tabs

- [ ] 打开的普通网页会出现在列表中。
- [ ] 相同网站的标签页聚合在同一卡片。
- [ ] 标签页数量和窗口数量正确。
- [ ] 点击网页能切换到对应标签页和窗口。
- [ ] 单独关闭标签页后数量立即更新。
- [ ] `Close site` 只关闭当前网站标签页。
- [ ] `Close all` 会显示确认弹窗，并且不会关闭 Tabloom 自身。
- [ ] 关闭后的 Undo 能重新打开 URL。

## 4. For Later

- [ ] 从 Open Tabs 点击时钟可加入 For Later。
- [ ] 重复添加同一 URL 不会产生重复条目。
- [ ] 关闭原标签页后条目仍然存在。
- [ ] 点击已关闭条目能重新打开网页。
- [ ] `Mark as done`、`Complete site`、`Complete all` 行为正确。
- [ ] Complete all 会先确认。
- [ ] Undo 能恢复刚完成的条目。

## 5. Saved

- [ ] 从 Open Tabs 或 For Later 可以收藏。
- [ ] 重复收藏同一 URL 不会产生重复条目。
- [ ] 原标签页关闭后收藏仍保留。
- [ ] 单项 Remove 和 `Remove site` 正常。
- [ ] `Remove all` 会先确认。
- [ ] 移除收藏不会关闭正在打开的标签页。
- [ ] Undo 能恢复刚移除的收藏。

## 6. 搜索与折叠

- [ ] 搜索标题、摘要、网站名称和 URL 都有效。
- [ ] 搜索同时作用于三个区块。
- [ ] `⌘K` / `Ctrl+K` 能聚焦搜索框。
- [ ] 无搜索结果时空状态正确。
- [ ] 三个区块都能独立折叠和展开。
- [ ] 刷新或重开 Tabloom 后折叠状态仍保留。

## 7. 视觉与文案

- [ ] 页面区块顺序为 For Later、Open Tabs、Saved。
- [ ] 桌面宽屏下区块为纵向排列，不是左右三栏。
- [ ] Light、Dark 和 System 主题都正确。
- [ ] Off 模式完全静音，Subtle 和 Playful 均能正常播放操作反馈。
- [ ] 完成、收藏、关闭、批量处理、撤销和折叠动效正确。
- [ ] 单项和批量操作在点击位置显示正确颜色的光圈/粒子，且不会阻挡点击。
- [ ] 第一次执行关闭操作时也能听到声音，不需要先触发其他音效。
- [ ] 批量处理只播放一次声音，没有逐条叠加。
- [ ] 系统开启减少动态效果时，操作不会因动画产生额外等待。
- [ ] 网页标题与摘要保持原语言。
- [ ] 产品界面没有混入中文操作文案。
- [ ] 长标题、长摘要和无 favicon 状态不破坏布局。
- [ ] 每张卡片最右侧操作按钮的 tooltip 完整显示，不被卡片边界或相邻卡片裁切。
- [ ] 键盘焦点清楚，图标按钮有 tooltip/aria-label。

## 8. 打包交付

- [ ] ZIP 中包含完整 `tab-atlas` 文件夹。
- [ ] ZIP 不包含 `.DS_Store`、临时文件或历史测试文件。
- [ ] `unzip -t tab-atlas.zip` 检查通过。
- [ ] 安装说明与当前版本一致。
- [ ] 保留上一稳定版本 ZIP，以便回退。
