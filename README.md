<p align="center">
  <img alt="Dark Pattern Hunter" width="260" src="https://github.com/user-attachments/assets/f60de3c1-dd6f-4213-97a1-85bf7c6e79e4">
</p>

<h1 align="center">Dark Pattern Hunter</h1>
<div align="center">

English | [简体中文](./README.zh.md)

</div>

<p align="center">
  Visual-driven AI operator that hunts, explains, and automates dark patterns across web, Android, and iOS. Open-source and MIT licensed.
</p>

<p align="center">
  <a href="https://github.com/FangScript/dark_pattern" target="_blank"><img src="https://img.shields.io/badge/GitHub-dark__pattern-181717?style=flat-square" alt="GitHub" /></a>
  <a href="https://img.shields.io/badge/License-MIT-blue?style=flat-square"><img src="https://img.shields.io/badge/License-MIT-blue?style=flat-square" alt="License" /></a>
</p>

**This repository** ([FangScript/dark_pattern](https://github.com/FangScript/dark_pattern)) is the Dark Pattern Hunter project codebase. Technical setup, package layout, and API notes live in **[PROJECT_README.md](./PROJECT_README.md)** in this repo.

## Showcases

| Instruction | Video |
| :---: | :---: |
| Use JavaScript to orchestrate a dark pattern review, capture the manipulative funnel, and write the findings into Google Docs | <video src="https://github.com/user-attachments/assets/75474138-f51f-4c54-b3cf-46d61d059999" height="300" /> |
| Control a Maps App on Android to sample each step and surface deceptive navigation cues | <video src="https://github.com/user-attachments/assets/1f5bab0e-4c28-44e1-b378-a38809b05a00" height="300" /> |
| Use the browser extension to replay a checkout flow, log dark pattern cues, and generate reproducible tests | <video src="https://github.com/user-attachments/assets/5cab578d-feb3-4250-8c7e-6793fe38a5be" height="300" /> |

## 💡 Features

### Detect & Explain Dark Patterns
- Scan UI flows with visual models and highlight manipulative affordances before you commit to automation.
- Log the UI evidence together with the rationale that flagged a dark pattern so analysts can respond quickly.
- Blend heuristic rules with LLM context to surface forced actions, confusing copy, and manipulative nudges.

### Web, Mobile & Any Interface
- **Web Automation**: Bridge browsers via the Chrome Extension or Puppeteer/Playwright integration and inspect DOM state with visual context.
- **Android Automation**: Pair the JavaScript SDK with adb, sample native app steps, and monitor for deceptive affordances.
- **iOS Automation**: Use the same SDK with iOS simulators to trace the UI, capture annotated screenshots, and replay steps.
- **Any Interface Automation**: Drive custom surfaces with annotated snapshots instead of brittle selectors.

### Tools
- **Visual Reports for Review**: Replay every step, compare before/after frames, and export annotated sequences for compliance teams.
- **Caching for Efficiency**: Replay historical sessions with cached frames to speed up regression checks.
- **MCP Bridge**: Allow other clients to tap into the agent stack via web, Android, or desktop bridges.

### APIs and automation surface
- Interaction, data extraction, and utility helpers are documented alongside packages in **[PROJECT_README.md](./PROJECT_README.md)** (see *Packages Overview* and *API Overview*).
- Model and provider configuration: see `env.example` and `@darkpatternhunter/shared/env` in the source tree.

## 👉 Zero-code Quick Experience

- **Chrome Extension**: Launch the extension to flag manipulative steps in-browser without writing code.
- **Android Playground**: Mirror your device, explore app flows, and highlight dark pattern risks as they happen.
- **iOS Playground**: Run local iOS scenes, capture reasoning logs, and share them with your compliance team.

## ✨ Driven by Visual Language Models

Dark Pattern Hunter can use models such as `Qwen3-VL`, `Doubao-1.6-vision`, `gemini-2.5-pro`, and `UI-TARS`. These models reason from screenshots and metadata to surface subtle UI tricks.

- Locate targets purely from pixels or annotated regions.
- Avoid brittle DOM selectors and reduce costs compared to generic LLM calls.
- Keep your open-source or hosted model endpoints in sync with the automation pipeline.

## 💡 Two Styles of Automation

### Auto Planning

Dark Pattern Hunter automatically plans steps while tracking whether any action touches a dark pattern hotspot. This style is slower but surfaces explainable reasoning for each decision.

```javascript
await aiAction('check if the checkout page hides the unsubscribe link. If it does, report it and skip the tap.');
```

### Workflow Style

Split complex logic into smaller steps for stability and easier review.

```javascript
const recordList = await agent.aiQuery('string[], the record list');
for (const record of recordList) {
  const hasCompleted = await agent.aiBoolean(`check if the record ${record} contains the text "completed"`);
  if (!hasCompleted) {
    await agent.aiTap(record);
  }
}
```

## 👀 Comparing to other projects

- **Visual-first detection**: Dark Pattern Hunter reasons about what users actually see, not only DOM state.
- **Audit-ready reporting**: Every automation emits annotated recordings that compliance teams can consume.
- **Fairness focus**: Detect manipulative nudges, forced continuity, and other dark patterns while automating flows.
- **JavaScript friendly**: The platform exposes natural JavaScript interfaces for automation and reporting.

## 📄 Resources

- **This repository**: [github.com/FangScript/dark_pattern](https://github.com/FangScript/dark_pattern)
- **In-repo documentation**: [PROJECT_README.md](./PROJECT_README.md)
- **Chrome extension build**: [REBUILD_EXTENSION_GUIDE.md](./REBUILD_EXTENSION_GUIDE.md)

## 🤝 Contributing

- [Open an issue](https://github.com/FangScript/dark_pattern/issues) for bugs or ideas.
- Pull requests are welcome; see [CONTRIBUTING.md](./CONTRIBUTING.md) if present.

## 📝 Credits

We would like to thank the following open-source projects:

- [Rsbuild](https://github.com/web-infra-dev/rsbuild) and [Rslib](https://github.com/web-infra-dev/rslib) for the build tool.
- [UI-TARS](https://github.com/bytedance/ui-tars) for the open-source agent model UI-TARS.
- [Qwen-VL](https://github.com/QwenLM/Qwen-VL) for the open-source VL model Qwen-VL.
- [scrcpy](https://github.com/Genymobile/scrcpy) and [yume-chan](https://github.com/yume-chan) for Android device control from the browser toolchain.
- [appium-adb](https://github.com/appium/appium-adb) for the JavaScript bridge to adb.
- [appium-webdriveragent](https://github.com/appium/WebDriverAgent) for XCTest integration.
- [YADB](https://github.com/ysbing/YADB) for improved text input performance.
- [Puppeteer](https://github.com/puppeteer/puppeteer) and [Playwright](https://github.com/microsoft/playwright) for browser automation and testing.

## 📖 Citation

If you use this project in research, you may cite:

```bibtex
@software{DarkPatternHunterFYP,
  title = {Dark Pattern Hunter: visual AI automation for dark-pattern detection},
  year = {2025},
  publisher = {GitHub},
  url = {https://github.com/FangScript/dark_pattern}
}
```

## ✨ Star History

[![Star History Chart](https://api.star-history.com/svg?repos=FangScript/dark_pattern&type=Date)](https://www.star-history.com/#FangScript/dark_pattern&Date)

## 📝 License

This project is [MIT licensed](./LICENSE).

---

<div align="center">
  If this project helps you, consider giving the repo a ⭐️
</div>
