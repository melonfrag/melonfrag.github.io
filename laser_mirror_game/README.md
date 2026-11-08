# 激光镜阵 v4.1

本版本在 v4.0 人机对战与外部 AI 协议的基础上，完整恢复 v3.0 的视觉与交互效果：
- 9×9 棋盘每格保持正方形，行列均显式定义。
- 镜子使用 CSS 绘制发光斜线，不显示普通字符。
- 激光从基地中心开始，以 SVG 线段逐格匀速绘制。
- 己方镜子的反射/透过选择嵌在左侧操作面板，不遮挡棋盘。

文件：
- `index.html`、`style.css`、`game.js`
- `ai-protocol.js`：AI JSON 协议与响应校验
- `game-ai.js`：独立内置 AI
- `AI_PROTOCOL.md`：外部 AI 接入文档

直接打开 `index.html` 即可运行；需要本地服务器时可执行 `python -m http.server 8000`。
