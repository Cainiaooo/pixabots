# 从 SpriteBrew 迁移导出引擎计划

> **源项目：** SpriteBrew（`/mnt/d/Projects/spritebrew`，AGPL-3.0）
> **目标项目：** pixabots（`/mnt/d/Projects/pixabots`）
> **日期：** 2026-04-30
> **目标：** 将 SpriteBrew 的导出引擎（6 种格式）和类型定义抽离，集成到 pixabots 的 `packages/extended` 中

---

## 1. 背景

pixabots 当前的导出能力仅支持 Godot `.tres` 格式（通过 `packages/extended/src/exporters/godot.ts`）。SpriteBrew 已实现 6 种专业导出格式，其中多个对 game-simulate 项目有价值。

本计划描述如何从 SpriteBrew 抽离导出引擎，以最小改动集成到 pixabots。

---

## 2. 可迁移模块

### 2.1 核心模块（零外部依赖，直接可迁）

| 模块 | 源文件 | 说明 | 依赖 |
|------|--------|------|------|
| **导出引擎** | `src/lib/exportEngine.ts` | 6 种导出格式的实现 | JSZip（需安装） |
| **类型定义** | `src/lib/types.ts` | SpriteFrame, SpriteAnimation, SpriteSheet 等接口 | 无 |
| **工具函数** | `src/lib/spriteUtils.ts` | Sprite 操作辅助函数 | 无 |

### 2.2 导出格式清单

| 格式 | SpriteBrew 函数 | pixabots 现状 | 优先级 |
|------|----------------|-------------|--------|
| **TexturePacker JSON Hash** | `exportTexturePacker()` | ❌ 无 | ⭐⭐⭐ 通用性最高 |
| **Aseprite JSON** | `exportAseprite()` | ❌ 无 | ⭐⭐⭐ 含 frameTags 和 duration |
| **Godot SpriteFrames .tres** | `exportGodot()` | ✅ 已有 `godot.ts` | — 保留现有实现 |
| **GameMaker Strip** | `exportGameMaker()` | ❌ 无 | ⭐⭐ 如需要 |
| **RPG Maker MV/MZ** | `exportRPGMaker()` | ❌ 无 | ⭐⭐ 如需要 |
| **Raw Frames ZIP** | `exportRawFrames()` | ❌ 无 | ⭐⭐⭐ 调试和通用用途 |

### 2.3 不建议迁移的模块

| 模块 | 原因 |
|------|------|
| `styleRegistry.ts` | 风格映射绑定 Retro Diffusion API，pixabots 用 GPT Image 2 |
| `sseClient.ts` | SSE 流式客户端，pixabots 不需要 |
| `generationHistory.ts` | 依赖 localStorage 和 Clerk userId |
| `tokenBalance.ts` | 依赖 Cloudflare KV |
| PixiJS 预览组件 | 与 React 组件强耦合，pixabots 无前端 |

---

## 3. 实施步骤

### Step 1：安装依赖

pixabots 的 `packages/extended` 需要新增 `jszip` 依赖（SpriteBrew 的导出引擎用它打包 ZIP）：

```bash
cd packages/extended
pnpm add jszip
pnpm add -D @types/jszip
```

### Step 2：类型适配

pixabots 已有自己的类型系统（`SpriteSheetMeta` in `sprite-sheet.ts`），需要确认与 SpriteBrew 的 `SpriteSheet` 类型是否兼容：

**pixabots 现有类型（简化）：**
```typescript
interface SpriteSheetMeta {
  agent: string;
  state: string;
  fps: number;
  frameWidth: number;
  frameHeight: number;
  rows: number;
  columns: number;
  directions: string[];
  frames: FrameMeta[];
}
```

**SpriteBrew 类型（简化）：**
```typescript
interface SpriteSheet {
  image: HTMLImageElement | HTMLCanvasElement;
  frames: SpriteFrame[];
  animations: SpriteAnimation[];
  frameWidth: number;
  frameHeight: number;
}
```

**适配策略：** 在 pixabots 的 `packages/extended/src/exporters/` 下新增一个 `types-adapter.ts`，将 pixabots 的 `SpriteSheetMeta` 转换为导出函数所需的输入格式。

### Step 3：迁移导出函数

将以下函数从 `exportEngine.ts` 移植到 `packages/extended/src/exporters/`：

```
packages/extended/src/exporters/
├── godot.ts          # 已有，保留
├── texture-packer.ts # 新增：TexturePacker JSON Hash
├── aseprite.ts       # 新增：Aseprite JSON
├── raw-frames.ts     # 新增：Raw Frames ZIP
├── types-adapter.ts  # 新增：pixabots ↔ SpriteBrew 类型适配
└── index.ts          # 新增：统一导出
```

### Step 4：集成到 CLI

在 `packages/extended/src/cli.ts` 的 `sheet` 子命令中新增 `--format` 参数：

```bash
# 现有
pnpm --filter @pixabots/extended cli sheet --agent-id cyber-catgirl --frame-size 128

# 扩展后
pnpm --filter @pixabots/extended cli sheet \
  --agent-id cyber-catgirl \
  --frame-size 128 \
  --format texture-packer  # godot | texture-packer | aseprite | raw-frames
```

---

## 4. AGPL-3.0 合规说明

SpriteBrew 源码使用 AGPL-3.0 协议。从 AGPL 项目中提取代码片段到另一个项目中，法律上有一定灰色地带：

- **保守做法**：仅参考 SpriteBrew 的导出逻辑重新实现，不直接复制代码
- **实用做法**：复制代码并在目标项目中注明来源（AGPL 要求保留版权声明）
- **最低风险**：仅使用导出引擎（纯函数，无网络交互），不部署 SpriteBrew 本身作为网络服务

**建议：** 采用「参考重写」方式，根据 SpriteBrew 的导出逻辑重新实现导出函数，保留相同的输出格式规范。这样无需承担 AGPL 传染义务。

---

## 5. 工作量估算

| 步骤 | 工作量 | 说明 |
|------|--------|------|
| Step 1: 安装依赖 | 5 分钟 | `pnpm add jszip` |
| Step 2: 类型适配 | 1-2 小时 | 分析两套类型差异，写适配层 |
| Step 3: 迁移导出函数 | 3-4 小时 | 3 个新导出器（TexturePacker/Aseprite/Raw Frames） |
| Step 4: CLI 集成 | 1 小时 | `--format` 参数 + 导出路由 |
| 测试验证 | 1 小时 | 用 cyber-catgirl sprite sheet 验证各格式输出 |
| **合计** | **约 1 天** | |

---

## 6. 验证 Checklist

- [ ] TexturePacker JSON Hash 导出：JSON 结构符合 [TexturePacker 规范](https://www.codeandweb.com/texturepacker/documentation)
- [ ] Aseprite JSON 导出：JSON 结构符合 [Aseprite JSON 格式](https://www.aseprite.org/docs/cli/#json-sprite-sheet)
- [ ] Raw Frames ZIP 导出：ZIP 中各帧独立 PNG，可选 manifest.json
- [ ] Godot .tres 导出：与现有 `godot.ts` 输出一致（回归测试）
- [ ] CLI `--format` 参数正常工作
- [ ] 输出文件命名规范一致

---

*— 夏夏 (xiaxia) from HermesAgent, 2026-04-30*
