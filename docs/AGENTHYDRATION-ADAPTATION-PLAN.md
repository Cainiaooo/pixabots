# AgentHydration 桌宠角色适配计划

> 日期：2026-04-30
> 作者：夏夏 (xiaxia) from HermesAgent
> 状态：规划阶段
> 关联：[EXTENSION-PLAN.md](./EXTENSION-PLAN.md)
> 消费方项目：[AgentHydration](/mnt/d/Projects/AgentHydration)

---

## 1. 背景

- **AgentHydration**（`/mnt/d/Projects/AgentHydration`）是 Tauri 2.0 + SolidJS + PixiJS v8 的跨平台桌宠 App
- 需要为 **4 种 Agent 工具**（Claude / Codex / Gemini / OpenCode）提供像素角色 sprite
- 当前 AgentHydration 处于 **M6 里程碑**，前端重做计划已定（`frontend-redesign-2026-04-25.md`）
- pixabots 已有 **AI 整帧生成 + sprite sheet 打包 + Godot 导出** 的完整管线
- **目标**：扩展 pixabots 管线支持第二个消费方 AgentHydration

## 2. AgentHydration 角色需求规格

来自 `frontend-redesign-2026-04-25.md` §5：

| 项目 | 规格 |
|------|------|
| 角色尺寸 | 32×32（基础）/ 64×64（精细） |
| 调色板 | 每角色限 8 色（Phase 3），最终 ≤32 色 |
| 帧数 | 每状态 4 帧（idle 可 2 帧） |
| 帧率 | 8fps（125ms/帧） |
| 动画状态 | idle / coding / thinking / error / done |
| 渲染 | PixiJS v8 AnimatedSprite |
| sprite sheet 布局 | 每 Agent 类型一张 PNG，包含全部状态帧 |
| JSON 格式 | Aseprite JSON Hash 或 TexturePacker 格式 |

**角色个性系统**：

| Agent | 个性关键词 |
|-------|-----------|
| Claude | 冲动 |
| Codex | 稳重 |
| Gemini | 好奇 |
| Open Code | 务实 |

## 3. 与 EXTENSION-PLAN.md 的关系

EXTENSION-PLAN 原消费方只有 game-simulate，现在增加 AgentHydration：

**原架构**：

```
AI 生图 → 切帧 → [game-simulate]
```

**新架构**：

```
AI 生图 → 切帧 → [game-simulate (方向动画)]
                 [AgentHydration (状态动画)]
```

核心变化：pixabots 管线从「单一消费方」升级为「多消费方」，需要通过 layout / exporter 参数区分输出格式。

## 4. 需要新增的模块

### 4.1 PixiJS 导出器（`exporters/pixi.ts`）

- 输出 **Aseprite JSON Hash 格式**（PixiJS AnimatedSprite 原生支持）
- 参考 `godot.ts` 的实现模式（已有 `SpriteSheetMeta` 类型复用）
- 关键字段：
  - `frames`：每帧的 `{filename, frame: {x, y, w, h}, rotated, trimmed, spriteSourceSize, sourceSize}`
  - `animations`：按状态名索引的帧序列（如 `"idle": ["idle-01.png", ...]`）
  - `meta`：尺寸、format、image 路径
- 支持与 sprite sheet 命令联动：`pixabots-extended sheet --exporter pixi`

### 4.2 状态动画元数据扩展（`sprite-sheet.ts` / `generate_sprite_sheet.py`）

现有管线按 **directions**（down / up / left / right）组织帧。
AgentHydration 需要 **states**（idle / coding / thinking / error / done）。

**扩展方案**：

- `generate_sprite_sheet.py` 新增 `--layout` 参数：
  - `directions`（默认，游戏用）
  - `states`（桌宠用）
- `states` 模式：从 `art/png-extended/{state}/{agent-id}/` 读取帧
- JSON metadata 中 `animations` 字段按状态名索引

### 4.3 AgentHydration 角色目录约定

```
art/png-extended/
├── walk/                        # 游戏用：方向动画
│   ├── down/cyber-catgirl/
│   └── ...
├── states/                      # 桌宠用：状态动画
│   ├── idle/claude-agent/
│   │   ├── idle-01.png ~ idle-04.png
│   ├── coding/claude-agent/
│   │   ├── coding-01.png ~ coding-04.png
│   ├── thinking/claude-agent/
│   ├── error/claude-agent/
│   └── done/claude-agent/
└── ...
```

### 4.4 角色统一 manifest（`manifest.json`）

```json
{
  "characters": {
    "cyber-catgirl": {
      "type": "game-npc",
      "size": 512,
      "modes": {
        "directions": { "down": 6, "up": 6, "left": 6, "right": 6 },
        "exporters": ["godot"]
      }
    },
    "claude-agent": {
      "type": "agent-pet",
      "size": 64,
      "modes": {
        "states": { "idle": 4, "coding": 4, "thinking": 4, "error": 4, "done": 2 },
        "exporters": ["pixi"]
      },
      "personality": "impulsive"
    }
  }
}
```

manifest 作为角色的单一信息源（single source of truth），CLI 和导出器均从此读取配置。

## 5. 实施计划

| 阶段 | 任务 | 工作量 | 依赖 |
|------|------|--------|------|
| P-A | `exporters/pixi.ts` 导出器 | 0.5 天 | 无 |
| P-B | `generate_sprite_sheet.py` `--layout states` 支持 | 0.5 天 | 无 |
| P-C | CLI sheet 命令增加 `--exporter pixi` 参数 | 0.25 天 | P-A |
| P-D | Claude 角色生图（4 状态 × 4 帧 = 16 帧） | 1 天 | P-B |
| P-E | PixiJS JSON 导出验证 | 0.25 天 | P-A + P-D |
| P-F | 角色统一 manifest | 0.5 天 | P-B + P-D |
| P-G | AgentHydration 前端集成验证 | 1 天 | P-E |

**总计约 4 天**

**阶段说明**：

- **P-A / P-B 可并行**：导出器和 Python 脚本互不依赖
- **P-D** 是最耗时环节（AI 生图），也是管线能否跑通的关键验证点
- **P-G** 需要在 AgentHydration 项目侧实际加载 sprite 并播放动画

## 6. 与 game-simulate 共享的代码清单

| 文件 | 说明 |
|------|------|
| `scripts/generate_sprite_sheet.py` | 共用，通过 `--layout` 区分 directions / states |
| `scripts/process_spritesheet.py` | 共用，后处理逻辑不变 |
| `packages/extended/src/compositor.ts` | 部件叠加共用 |
| `packages/extended/src/asset-loader.ts` | 资产加载共用 |
| `packages/extended/src/cli.ts` | CLI 入口共用，新增参数 |
| `packages/extended/src/sprite-sheet.ts` | `SpriteSheetMeta` 类型共用，新增 layout 字段 |

## 7. 风险与缓解

| # | 风险 | 缓解措施 |
|---|------|---------|
| 1 | AI 生图 64px 缩放后细节丢失 | 先在 512px 生成，再缩放到 64px |
| 2 | 不同状态帧间角色一致性 | 同一角色附正面参考图 |
| 3 | Aseprite 环节跳过 | v0.2 先验证效果，不好再补 |
| 4 | PixiJS JSON 格式兼容性 | 使用 Aseprite JSON Hash 标准，PixiJS AnimatedSprite 原生支持 |

## 8. 不做的事

- ❌ **不在 pixabots 里实现 PixiJS 运行时渲染**（只负责导出资产）
- ❌ **不做 Live2D / Spine 骨骼动画**
- ❌ **不做角色在线编辑器**
- ❌ **不为 AgentHydration 单独建独立管线**（复用现有管线，通过参数区分）

---

> 本文档是 [EXTENSION-PLAN.md](./EXTENSION-PLAN.md) 的补充，两者共同构成 pixabots 扩展的完整蓝图。
