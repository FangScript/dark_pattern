<p align="center">
  <img alt="Dark Pattern Hunter"  width="260" src="https://github.com/user-attachments/assets/f60de3c1-dd6f-4213-97a1-85bf7c6e79e4">
</p>

<h1 align="center">Dark Pattern Hunter</h1>
<div align="center">

[English](./README.md) | 简体中文

</div>

<p align="center">
  视觉驱动的 AI 操作助手，专注于发现、解释并自动化处理 Web、Android 与 iOS 中的暗黑模式。开源并采用 MIT 许可协议。
</p>

<p align="center">
  <a href="https://github.com/FangScript/dark_pattern" target="_blank"><img src="https://img.shields.io/badge/GitHub-dark__pattern-181717?style=flat-square" alt="GitHub"></a>
  <a href="https://img.shields.io/badge/License-MIT-blue?style=flat-square"><img src="https://img.shields.io/badge/License-MIT-blue?style=flat-square" alt="License"></a>
</p>

**本仓库**（[FangScript/dark_pattern](https://github.com/FangScript/dark_pattern)）为 Dark Pattern Hunter 项目代码。环境搭建、包结构与 API 说明见仓库内 **[PROJECT_README.md](./PROJECT_README.md)**。

## 案例

| 指令 | 视频 |
| :---: | :---: |
| 使用 JS 代码协调暗黑模式审查，记录操控流程，并将结构化报告写入 Google Docs | <video src="https://github.com/user-attachments/assets/75474138-f51f-4c54-b3cf-46d61d059999" height="300" /> |
| 控制 Android 地图应用，采样每一步，观察导航提示是否存在欺骗性 UX 模式 | <video src="https://github.com/user-attachments/assets/1f5bab0e-4c28-44e1-b378-a38809b05a00" height="300" /> |
| 使用浏览器插件回放结账流程，记录暗黑模式提示，并生成可复现的测试用例 | <video src="https://github.com/user-attachments/assets/5cab578d-feb3-4250-8c7e-6793fe38a5be" height="300" /> |

## 💡 特性

### 发现并解释暗黑模式
- 用视觉模型扫描 UI 流程，在自动化前标记潜在操控点。
- 记录 UI 证据并说明触发机制，便于分析团队快速响应。
- 结合启发式规则与 LLM 上下文，挖掘强制提示、模糊文案与诱导行为。

### Web、移动与任意界面
- **Web 自动化**：通过 Chrome 插件或 Puppeteer/Playwright 集成，结合视觉上下文检查 DOM。
- **Android 自动化**：将 JavaScript SDK 与 adb 配合，执行原生应用并监控潜在暗黑模式。
- **iOS 自动化**：在 iOS 模拟器中使用相同 SDK 跟踪界面并捕获带注释的截图。
- **任意界面自动化**：以截图与视觉命令驱动自定义界面，远离脆弱选择器。

### 工具
- **可视化审计报告**：回放每个步骤，比较前后画面，并导出带批注的序列供合规团队使用。
- **缓存加速**：重放历史会话时复用缓存帧，加快回归检查。
- **MCP 桥接**：允许 Web、Android 或桌面客户端直接访问自动化能力。

### API 与自动化接口
- 交互、数据提取与辅助能力说明见 **[PROJECT_README.md](./PROJECT_README.md)**（*Packages Overview*、*API Overview*）。
- 模型与服务商配置见仓库根目录 `env.example` 与源码中的 `@darkpatternhunter/shared/env`。

## 👉 无需代码，快速体验

- **Chrome 插件**：启动插件即可自动标记操控步骤，无需编写代码。
- **Android Playground**：镜像设备、逐步演练，并实时发现暗黑模式风险。
- **iOS Playground**：运行本地 iOS 场景，捕获推理日志并分享给合规团队。

## ✨ 视觉语言模型驱动

Dark Pattern Hunter 可对接 `Qwen3-VL`、`Doubao-1.6-vision`、`gemini-2.5-pro`、`UI-TARS` 等模型，依据截图和元数据发掘隐蔽的操控技巧。

- 通过像素或标注区域定位目标。
- 避免脆弱的 DOM 选择器，降低通用 LLM 的调用成本。
- 将自托管或云端模型与自动化管道保持同步。

## 💡 两种风格的自动化

### 自动规划

Dark Pattern Hunter 会自动规划步骤，并追踪是否触及暗黑模式热点。该风格速度略慢，但每一步都带有可解释的推理。

```javascript
await aiAction('check if the checkout page hides the unsubscribe link. If it does, report it and skip the tap.');
```

### 工作流风格

将复杂逻辑拆分为多个步骤，以提升稳定性并便于检查。

```javascript
const recordList = await agent.aiQuery('string[], the record list');
for (const record of recordList) {
  const hasCompleted = await agent.aiBoolean(`check if the record ${record} contains the text "completed"`);
  if (!hasCompleted) {
    await agent.aiTap(record);
  }
}
```

## 👀 与其它工具比较

- **视觉优先的检测**：着眼于用户实际看到的内容，而非仅靠 DOM 状态。
- **审计友好的报告**：每次自动化都生成带注释的回放，方便合规团队审查。
- **公平性聚焦**：在自动化流程中检测强制提示、续订陷阱等暗黑模式。
- **JavaScript 友好**：平台提供自然的 JavaScript 接口。

## 📄 资源

- **本仓库**：[github.com/FangScript/dark_pattern](https://github.com/FangScript/dark_pattern)
- **仓库内文档**：[PROJECT_README.md](./PROJECT_README.md)
- **扩展构建**：[REBUILD_EXTENSION_GUIDE.md](./REBUILD_EXTENSION_GUIDE.md)

## 🤝 参与贡献

- 问题与建议请使用 [GitHub Issues](https://github.com/FangScript/dark_pattern/issues)。
- 欢迎 Pull Request；若有 [CONTRIBUTING.md](./CONTRIBUTING.md) 请遵循其中说明。

## 📝 致谢

我们感谢以下开源项目：

- [Rsbuild](https://github.com/web-infra-dev/rsbuild) 和 [Rslib](https://github.com/web-infra-dev/rslib) 用于构建工具。
- [UI-TARS](https://github.com/bytedance/ui-tars) 用于开源的 AI 模型 UI-TARS。
- [Qwen-VL](https://github.com/QwenLM/Qwen-VL) 用于开源的视觉语言模型 Qwen-VL。
- [scrcpy](https://github.com/Genymobile/scrcpy) 和 [yume-chan](https://github.com/yume-chan) 等用于 Android 相关能力。
- [appium-adb](https://github.com/appium/appium-adb)、[appium-webdriveragent](https://github.com/appium/WebDriverAgent)、[YADB](https://github.com/ysbing/YADB)。
- [Puppeteer](https://github.com/puppeteer/puppeteer) 与 [Playwright](https://github.com/microsoft/playwright) 用于浏览器自动化与测试。

## 📖 引用

```bibtex
@software{DarkPatternHunterFYP,
  title = {Dark Pattern Hunter: visual AI automation for dark-pattern detection},
  year = {2025},
  publisher = {GitHub},
  url = {https://github.com/FangScript/dark_pattern}
}
```

## ✨ Star 趋势

[![Star History Chart](https://api.star-history.com/svg?repos=FangScript/dark_pattern&type=Date)](https://www.star-history.com/#FangScript/dark_pattern&Date)

## 📝 授权许可

本项目采用 [MIT 许可](./LICENSE)。

---

<div align="center">
  如果本项目对你有帮助，欢迎给仓库一个 ⭐️
</div>
