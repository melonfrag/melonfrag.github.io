# 激光镜阵 AI 输入/输出协议 v1.0

本协议用于把 AI 决策与游戏引擎解耦。内置 AI 位于 `game-ai.js`；任何外部 AI 只需实现相同的 JSON 请求/响应，即可替换内置 AI。

## 1. 接入方式

浏览器全局适配器：

```js
window.LaserAIAdapter = {
  async decide(request) {
    // 将 request JSON 发送给你的 AI 服务，返回服务端 JSON 响应
  },
  async resolveMirror(request) {
    // AI 激光经过己方镜子时，返回 reflect 或 pass
  }
};
```

两个方法都必须返回完整协议响应对象，而不是只返回 `action`。如果没有设置 `LaserAIAdapter`，游戏自动使用 `game-ai.js` 的 `window.LaserMirrorAI`。

外部 AI 可以通过 `fetch`、WebSocket、Web Worker、浏览器扩展或本地桥接程序连接；跨域访问与鉴权由适配器自行处理。不要把私密 API Key 写进公开网页。

## 2. 通用封装

```json
{
  "protocol": "laser-mirror-duel",
  "version": "1.0",
  "requestId": "req-unique-id",
  "type": "decide | resolve_mirror",
  "player": "B",
  "state": {
    "boardSize": 10,
    "currentPlayer": "B",
    "turnNumber": 1,
    "bases": {
      "A": {"x": 3, "y": 3},
      "B": {"x": 7, "y": 7}
    },
    "cells": "10×10 二维数组；空格为 null，占用格为对象",
    "rules": {
      "maxOccupiedAdjacentToEachBase": 2,
      "mirrorCanBePlacedOnce": true,
      "ownMirrorChoices": ["reflect", "pass"],
      "enemyMirrorBehavior": "reflect"
    }
  }
}
```

坐标均为 **1-based**：左上角是 `(1,1)`。`cells[y-1][x-1]` 对应坐标 `(x,y)`。镜子对象为 `{"type":"mirror","owner":"A|B","orientation":"/|\\\\"}`；基地对象为 `{"type":"base","owner":"A|B"}`。

## 3. 决策请求 `type: "decide"`

除通用字段外，包含 `legalActions`。AI 必须从该数组中选一个动作：

```json
{
  "legalActions": [
    {"type":"place_mirror","x":4,"y":5,"orientation":"/"},
    {"type":"place_mirror","x":4,"y":5,"orientation":"\\\\"},
    {"type":"fire_laser","direction":"up"}
  ]
}
```

实际请求会包含全部合法放置位置/方向，以及四个发射方向。引擎会再次校验动作合法性。

响应：

```json
{
  "protocol": "laser-mirror-duel",
  "version": "1.0",
  "requestId": "与请求完全一致",
  "action": {"type":"place_mirror","x":4,"y":5,"orientation":"/"}
}
```

或：

```json
{
  "protocol": "laser-mirror-duel",
  "version": "1.0",
  "requestId": "与请求完全一致",
  "action": {"type":"fire_laser","direction":"left"}
}
```

## 4. 己方镜面选择请求 `type: "resolve_mirror"`

AI 发射的激光遇到 AI 自己的镜子时，引擎会再次请求决策。请求额外包含：

```json
{
  "laser": {
    "position": {"x":4,"y":5},
    "direction": {"dx":1,"dy":0},
    "path": [{"x":7,"y":7},{"x":6,"y":7}],
    "mirror": {"owner":"B","orientation":"/"}
  },
  "legalActions": [{"choice":"reflect"},{"choice":"pass"}]
}
```

响应：

```json
{
  "protocol": "laser-mirror-duel",
  "version": "1.0",
  "requestId": "与请求完全一致",
  "action": {"choice":"reflect"}
}
```

## 5. 校验与错误处理

- `protocol` 必须为 `laser-mirror-duel`，`version` 必须为 `1.0`。
- `requestId` 必须原样回传，避免异步响应串线。
- `decide` 的动作必须逐项匹配 `legalActions`，否则引擎拒绝并使用内置 AI 兜底。
- `resolve_mirror` 只接受 `reflect` 或 `pass`。
- 请求中的棋盘快照是只读输入；AI 不应自行修改游戏状态。
