# Pixabots 扩展计划：面向 App + 游戏的统一美术资产管线

> 日期：2026-04-29
> 目标：将 Pixabots 从一个「像素头像生成器」扩展为「跨项目 2D 像素角色资产管线」
> 状态：规划阶段 — 尚未开始编码
> 关联调研：`game-simulate-project/docs/research/2d-pixel-character-sprite-ecosystem-survey.md`

---

## 一、现状分析

### 1.1 Pixabots 是什么

Pixabots 是一个开源像素角色库（MIT 协议），通过 4 类可组合部件生成 10,752 种唯一角色：

```
4-char base36 ID → 每个字符映射一个 category 的 part 索引
例：ID "4707" → eyes=human-2, heads=punch-bowl, body=backpack, top=plant
```

| Category | Parts 数 | 内容 | 动画支持 |
|----------|---------|------|---------|
| eyes | 16 | 眼睛/眼镜/面罩 | ✅ blink + sequence |
| heads | 8 | 头型 | ❌ 全静态 |
| body | 7 | 身体/配饰 | ❌ 全静态 |
| top | 12 | 头顶装饰 | ❌ 全静态 |

- 源图规格：**32×32 RGBA PNG**
- 现有动画：仅 idle 弹跳（8 帧循环，14fps）+ eyes blink
- 视角：仅正面朝向
- 渲染：Sharp 服务端合成 → PNG/GIF/WebP

### 1.2 我们需要什么

| 需求 | App 端 | 游戏端（game-simulate） |
|------|--------|----------------------|
| 角色 ID / 随机生成 | ✅ 现有可用 | ✅ 现有可用 |
| 静态头像 | ✅ 现有可用 | ✅ |
| Idle 呼吸动画 | ✅ 现有可用 | ✅ |
| 行走动画 | ❌ 不需要 | 🔴 必须 |
| 多方向朝向 | ❌ 不需要 | 🔴 必须（至少 4 方向） |
| 运行时实时渲染 | ❌ 预渲染即可 | 🔴 必须（Godot 客户端） |
| 装备/换装 | ⚠️ 可选 | ⚠️ 可选 |
| Sprite Sheet 导出 | ❌ 不需要 | 🔴 必须 |

**核心矛盾：** 现有 Pixabots 完美覆盖 App 端需求，但游戏端需要行走 + 多方向，这是根本性的架构扩展。

### 1.3 关键硬编码（扩展的障碍）

| 硬编码 | 位置 | 影响 |
|--------|------|------|
| 4 固定 category | `PartCategory` 类型、`PixabotCombo`、`AnimFrame` | 无法新增 category |
| 4-char base36 ID | `id.ts` encode/decode | ID 格式与 category 数量绑定 |
| 32×32 固定尺寸 | `render.ts` `NATIVE_SIZE` | 行走动画需要更大画布 |
| 仅 Y 轴偏移 | `AnimFrame` 接口 | 行走需要 X 轴位移 |
| body 脚不动逻辑 | render.ts top/bottom 切分 | 针对特定动画的硬编码 |
| 单一动画状态 | 无状态机概念 | 无法切换 idle/walk/run |

---

## 二、扩展策略：分层增量，不破坏现有

**核心原则：保持向后兼容。** 现有的 4-char ID、32×32 头像、idle 动画全部保留不动。新功能作为独立的扩展层叠加。

### 2.1 分层架构

```
┌─────────────────────────────────────────────┐
│           消费层（下游项目）                    │
│  ┌──────────┐  ┌──────────────────────────┐  │
│  │ App 端    │  │ 游戏端 (Godot)            │  │
│  │ 预渲染头像 │  │ 实时 Sprite2D 拼装        │  │
│  └────┬─────┘  └──────────┬───────────────┘  │
│       │                    │                  │
├───────┼────────────────────┼──────────────────┤
│       ▼                    ▼                  │
│          扩展层（本项目）                       │
│  ┌────────────────────────────────────────┐   │
│  │ @pixabots/extended (新包)               │   │
│  │  • 多方向 sprite sheet 渲染器           │   │
│  │  • 行走/工作动画状态机                   │   │
│  │  • Godot .tres 导出器                   │   │
│  │  • App 头像预渲染 CLI                   │   │
│  │  • Sprite Atlas 生成器                  │   │
│  └────────────────────┬───────────────────┘   │
│                       │                       │
├───────────────────────┼───────────────────────┤
│                       ▼                       │
│          核心层（现有，不改）                   │
│  ┌────────────────────────────────────────┐   │
│  │ @pixabots/core (现有)                   │   │
│  │  • PARTS 部件目录                       │   │
│  │  • encode/decode ID                     │   │
│  │  • 静态渲染 / idle 动画                  │   │
│  │  • LAYER_ORDER 层叠合成                  │   │
│  └────────────────────────────────────────┘   │
│                                               │
│          资产层（PNG 文件）                     │
│  ┌────────────────────────────────────────┐   │
│  │ art/png/ (现有 88 张)                    │   │
│  │ art/png-extended/ (新增方向/动画帧)       │   │
│  └────────────────────────────────────────┘   │
└───────────────────────────────────────────────┘
```

**为什么不直接改 `@pixabots/core`？**
- 破坏性变更（4-char ID、固定 4 category）会影响上游兼容性
- Core 的简洁设计是它的优势，不应该为了游戏需求把它搞复杂
- App 端只需要 Core 的现有能力，不需要引入游戏相关的依赖

---

## 三、扩展包设计：`@pixabots/extended`

### 3.1 目录结构

```
pixabots/
├── packages/
│   ├── core/                    # 现有，不动
│   │   ├── src/
│   │   │   ├── parts.ts         # PARTS + CATEGORY_ORDER
│   │   │   ├── id.ts            # encode/decode
│   │   │   ├── render.ts        # 静态/idle 渲染
│   │   │   └── types.ts         # PartCategory, PixabotCombo, etc.
│   │   └── dist/
│   │
│   └── extended/                # 新增
│       ├── src/
│       │   ├── index.ts         # 公共 API 导出
│       │   ├── types.ts         # 扩展类型定义
│       │   ├── asset-loader.ts  # PNG 加载 + 缓存
│       │   ├── compositor.ts    # 通用层叠合成器
│       │   ├── animator.ts      # 动画状态机
│       │   ├── direction.ts     # 多方向管理
│       │   ├── sprite-sheet.ts  # Sprite Sheet 生成
│       │   ├── atlas.ts         # Sprite Atlas 打包
│       │   ├── exporters/
│       │   │   ├── godot.ts     # Godot .tres 导出
│       │   │   ├── app-avatar.ts # App 头像批量预渲染
│       │   │   └── css-sprite.ts # CSS Sprite Sheet 导出
│       │   └── cli.ts           # CLI 入口
│       ├── package.json
│       └── tsconfig.json
│
├── art/
│   ├── png/                     # 现有 32×32 部件（88 张）
│   └── png-extended/            # 新增扩展资产
│       ├── walk/                # 行走动画帧
│       │   ├── down/            # 面朝下（默认正面）
│       │   ├── up/
│       │   ├── left/
│       │   └── right/
│       └── work/                # 工作动画帧（未来扩展）
│
├── scripts/
│   ├── render-test.cjs          # 现有测试脚本
│   ├── batch-render-avatar.cjs  # App 头像批量渲染
│   └── generate-sheets.cjs      # Sprite Sheet 生成脚本
│
└── docs/
    └── EXTENSION-PLAN.md        # 本文档
```

### 3.2 核心模块设计

#### 3.2.1 通用合成器 (`compositor.ts`)

脱离 Core 的固定 4-category 限制，支持任意数量的部件层：

```typescript
interface CompositorConfig {
  size: number;                    // 画布尺寸（32 / 48 / 64）
  layers: LayerDef[];              // 任意数量的层
  scale?: number;                  // 缩放系数
  background?: string;             // 背景色（可选）
}

interface LayerDef {
  category: string;                // 'eyes' | 'heads' | 'body' | 'top' | ...
  partIndex: number;               // 部件索引
  frameIndex?: number;             // 动画帧（默认 0）
  offsetX?: number;                // X 偏移（默认 0）
  offsetY?: number;                // Y 偏移（默认 0）
  flipH?: boolean;                 // 水平翻转（用于 left 方向复用 right）
}

// 合成一帧，返回 Buffer
function compositeFrame(
  assets: Map<string, ImageData>,  // 预加载的部件图
  config: CompositorConfig,
): Buffer;
```

**关键设计：** `left` 方向不需要独立的美术资产，直接复用 `right` 的帧做水平翻转。

#### 3.2.2 动画状态机 (`animator.ts`)

```typescript
type AnimState = 'idle' | 'walk' | 'work' | 'custom';
type Direction = 'down' | 'up' | 'left' | 'right';

interface AnimConfig {
  state: AnimState;
  direction: Direction;
  frameCount: number;          // 该状态的总帧数
  frameMs: number;             // 每帧时长（ms）
  loop: boolean;               // 是否循环
  frames: AnimFrameData[];     // 每帧各层的偏移数据
}

interface AnimFrameData {
  layers: {
    category: string;
    frameIndex: number;
    offsetX: number;
    offsetY: number;
  }[];
}
```

**动画数据驱动：** 所有动画通过 JSON 配置定义，不硬编码在渲染逻辑中。新增动画状态只需添加 JSON 配置 + 对应的美术帧，不需要改代码。

#### 3.2.3 资产加载器 (`asset-loader.ts`)

```typescript
interface AssetManifest {
  version: string;
  size: number;                // 画布尺寸
  categories: {
    [name: string]: {
      parts: {
        [partName: string]: {
          states: {
            [state: string]: {
              directions: {
                [dir: string]: {
                  frames: string[];  // PNG 文件路径列表
                };
              };
            };
          };
        };
      };
    };
  };
}
```

**约定优于配置：** 资产目录结构即 manifest。扫描 `art/png-extended/` 目录自动生成 manifest，不需要手写 JSON。

#### 3.2.4 Sprite Sheet 生成器 (`sprite-sheet.ts`)

```typescript
interface SpriteSheetConfig {
  id: string;                   // Pixabot ID
  states: AnimState[];
  directions: Direction[];
  output: {
    format: 'png' | 'webp';
    columns: number;            // 帧列数（自动计算行数）
    padding: number;            // 帧间距（默认 0）
    powerOfTwo: boolean;        // 是否对齐到 2 的幂（GPU 优化）
  };
}

// 输出：sprite sheet PNG + 元数据 JSON
interface SpriteSheetOutput {
  image: Buffer;
  meta: {
    width: number;
    height: number;
    columns: number;
    rows: number;
    frameWidth: number;
    frameHeight: number;
    frames: FrameMeta[];        // 每帧的 {x, y, state, direction, frameIndex}
  };
}
```

### 3.3 Godot 导出器 (`exporters/godot.ts`)

```typescript
function exportGodotSpriteFrames(
  sheet: SpriteSheetOutput,
  config: {
    resourcePath: string;       // 如 "res://characters/pixabot_4707.tres"
    hframes?: number;
    vframes?: number;
  }
): string;  // .tres 文件内容
```

导出格式兼容 Godot 4 SpriteFrames resource：
```tres
[gd_resource type="SpriteFrames" format=3 uid="uid://..."]

[resource]
animations/names = PackedStringArray("idle_down", "walk_down", "idle_up", ...)
animations/idle_down/frames = PackedFloat32Array(...)
animations/idle_down/speed = 7.0
animations/idle_down/loop = true
```

### 3.4 App 头像导出器 (`exporters/app-avatar.ts`)

```typescript
interface AvatarExportConfig {
  ids: string[];                // 要导出的 Pixabot ID 列表
  size: number;                 // 输出尺寸（64 / 128 / 256）
  format: 'png' | 'webp';
  background?: string;          // 背景色
  outputDir: string;
}

// 批量预渲染头像，输出到指定目录
// 文件名格式：pixabot_{id}.png
async function batchRenderAvatars(config: AvatarExportConfig): Promise<void>;
```

---

## 四、美术资产扩展计划

### 4.1 新增资产目录规范

```
art/png-extended/
├── walk/
│   ├── down/                        # 面朝下（基于现有正面 idle 改造）
│   │   ├── eyes/
│   │   │   ├── human-2/
│   │   │   │   ├── walk-01.png ~ walk-06.png   # 6 帧行走循环
│   │   │   ├── glasses/
│   │   │   │   ├── walk-01.png ~ walk-06.png
│   │   │   └── ...
│   │   ├── heads/
│   │   │   ├── punch-bowl/
│   │   │   │   ├── walk-01.png ~ walk-06.png
│   │   │   └── ...
│   │   ├── body/
│   │   │   ├── backpack/
│   │   │   │   ├── walk-01.png ~ walk-06.png
│   │   │   └── ...
│   │   └── top/
│   │       └── ...
│   │
│   ├── up/                          # 面朝上（背面）
│   │   └── ...（同上结构）
│   │
│   ├── left/                        # 面朝左
│   │   └── ...
│   │
│   └── right/                       # 面朝右
│       └── ...
```

### 4.2 方向复用策略（减少美术工作量）

| 方向 | 美术策略 | 工作量 |
|------|---------|--------|
| down（正面） | 基于现有 idle 帧，添加腿部摆动 | ⭐ 基础改造 |
| up（背面） | 需要新绘，简化版（头型简化，身体背面） | ⭐⭐⭐ 全新绘制 |
| right（侧面） | 需要新绘，简化版（侧面轮廓） | ⭐⭐⭐ 全新绘制 |
| left（左侧） | **复用 right + 水平翻转** | ⭐ 零额外美术 |

**实际工作量：** 3 个方向 × 4 个 category × ~10 个常用 parts = ~120 组动画帧。按每组 6 帧算，约 720 张 PNG。

### 4.3 美术生产方式

**优先级排序：**

1. **Aseprite/LibreSprite 手绘**（推荐用于核心部件）
   - 质量 最高，风格最统一
   - 速度：~30 分钟/部件/方向（熟练后）
   - 成本：Aseprite $20 一次性 或 LibreSprite 免费

2. **SpriteBrew AI 生成**（推荐用于批量探索）
   - 快速生成候选帧，人工筛选 + 微调
   - 风格一致性需要 prompt engineering
   - 免费额度有限（5 次/天）

3. **像素画外包**（适合批量生产）
   - Fiverr 上 $2~5/帧，一套 720 帧约 $1500~3600
   - 适合确定风格后批量外包

**推荐流程：**
```
先用 SpriteBrew 生成探索 → 人工筛选最佳风格
    → 在 Aseprite 中建立模板（参考帧、骨骼辅助线）
    → 手绘核心 3~5 个高频部件 × 3 方向
    → 建立风格指南 → 批量生产或外包剩余
```

### 4.4 画布尺寸决策

| 尺寸 | 优势 | 劣势 | 推荐场景 |
|------|------|------|---------|
| 32×32 | 与现有资产完全兼容 | 行走动画腿部空间不足 | App 头像（保持现状） |
| 48×48 | 腿部空间够用，文件小 | 非标准分辨率 | ⭐ 推荐（折中方案） |
| 64×64 | LPC 标准，空间充裕 | 文件稍大，视觉风格变化 | 追求更精细表现 |

**推荐 48×48**，理由：
- 32×32 行走动画腿部空间太紧（现有身体部件几乎占满画布）
- 64×64 风格差异太大，需要重新绘制所有现有资产
- 48×48 可以通过 nearest-neighbor 缩放从 32×32 的身体部件放大，保持像素风
- 游戏中 Godot 缩放渲染很方便

---

## 五、各消费端对接方案

### 5.1 App 端（现有需求不变）

**方式一：预渲染静态头像（推荐，零运行时成本）**

```bash
# CLI 批量生成
npx @pixabots/extended avatar \
  --ids 4707,abcd,1234 \
  --size 128 \
  --output ./app/assets/avatars/
```

输出：`pixabot_4707.png`, `pixabot_abcd.png`, `pixabot_1234.png`

App 直接加载 PNG 显示，不需要任何运行时依赖。

**方式二：Web 端运行时拼装**

如果 App 有 WebView 或 Web 版本，可以直接用 `@pixabots/core` 的渲染 API：

```typescript
import { decode, renderPixabot } from '@pixabots/core';

const combo = decode('4707');
const avatar = await renderPixabot(combo, { size: 128 });
// avatar → PNG Buffer / base64
```

### 5.2 游戏端（Godot 4.62）

**方式一：预渲染 Sprite Sheet（推荐起步）**

```bash
# 生成单个角色的完整 sprite sheet
npx @pixabots/extended sheet \
  --id 4707 \
  --states idle,walk \
  --directions down,up,left,right \
  --format godot \
  --output ./game/assets/sprites/
```

输出：
- `pixabot_4707_sheet.png` — 合并的 sprite sheet
- `pixabot_4707.tres` — Godot SpriteFrames resource

Godot 中直接用 Sprite2D + SpriteFrames 加载即可。

**方式二：Godot 运行时拼装（长期目标）**

将部件 PNG 导入为 Godot 纹理，运行时用多个 Sprite2D 节点层叠拼装：

```
CharacterRoot (Node2D)
├── TopSprite (Sprite2D)        # 头顶装饰层
├── BodySprite (Sprite2D)       # 身体层
├── HeadSprite (Sprite2D)       # 头部层
└── EyesSprite (Sprite2D)       # 眼睛层（最顶层）
```

动画通过 AnimationPlayer 控制：
- idle：Y 轴上下微移（复用现有 ANIM_FRAMES 弹跳数据）
- walk_down：各层 Y 偏移做腿部摆动
- walk_up/left/right：切换对应方向的纹理集

**优势：** 运行时换装、动态组合，不需要为每个角色预渲染。

### 5.3 资产管线统一的关键

```
        Aseprite / SpriteBrew
              ↓ 导出 PNG
    art/png-extended/{category}/{part}/{state}/{direction}/
              ↓
    ┌─────────┴──────────┐
    ↓                     ↓
  @pixabots/extended
    ├─→ App CLI          → 批量预渲染头像 PNG
    ├─→ Godot CLI        → Sprite Sheet + .tres
    └─→ Atlas CLI        → 纹理图集 + 元数据 JSON
```

**统一约束：**
- 所有部件 PNG 必须带 alpha 通道
- 所有部件在同一画布尺寸内绘制（48×48 推荐）
- 文件命名约定一致
- 同一套部件 PNG 同时服务 App 和游戏

---

## 六、分阶段实施计划

### Phase 0：基础准备（3 天）

| 任务 | 工作量 | 产出 |
|------|--------|------|
| 搭建 `@pixabots/extended` 包骨架 | 0.5 天 | package.json, tsconfig, 基础导出 |
| 实现 `compositor.ts` 通用合成器 | 1 天 | 可合成任意层组合的帧 |
| 实现 `asset-loader.ts` 资产加载 | 0.5 天 | 扫描目录 → manifest → 加载 PNG |
| 编写基础测试 | 0.5 天 | 验证合成器正确性 |
| 画布尺寸实验：32 vs 48 vs 64 | 0.5 天 | 确定最终画布尺寸 |

### Phase 1：App 头像管线（3 天）

| 任务 | 工作量 | 产出 |
|------|--------|------|
| 实现 `batch-render-avatar.cjs` CLI | 1 天 | 批量生成静态头像 |
| 实现 CSS Sprite Sheet 导出 | 0.5 天 | Web App 可用 |
| 集成到现有 pixabots 网站 | 0.5 天 | 网站可用新尺寸渲染 |
| 文档 + 示例 | 0.5 天 | 使用文档 |
| 提交 + 推送到 myfork | 0.5 天 | — |

**Phase 1 完成标准：** App 项目可以通过 CLI 一键生成任意 ID、任意尺寸的头像 PNG。

### Phase 2：行走动画原型（5~7 天）

| 任务 | 工作量 | 产出 |
|------|--------|------|
| 绘制 2~3 个高频部件的 walk_down 动画帧（6 帧） | 2 天 | art/png-extended/walk/down/ 下的 PNG |
| 实现 `animator.ts` 动画状态机 | 1 天 | 支持 idle/walk 状态切换 |
| 实现 `sprite-sheet.ts` 生成器 | 1 天 | 输出合并 sprite sheet + 元数据 |
| Godot 导入测试 | 1 天 | 在 game-simulate 中显示行走角色 |
| 迭代调整 | 1~2 天 | 动画流畅度、视觉风格微调 |

**Phase 2 完成标准：** game-simulate 中可以显示 1~2 个 Pixabot 角色的 idle + walk_down 动画。

### Phase 3：多方向扩展（7~10 天）

| 任务 | 工作量 | 产出 |
|------|--------|------|
| 绘制 walk_up 帧集（3 方向中最复杂） | 3 天 | 背面朝向的部件帧 |
| 绘制 walk_right 帧集 | 2 天 | 侧面朝向的部件帧 |
| walk_left 自动翻转（零美术成本） | 0.5 天 | 代码实现 |
| idle 各方向帧（可选，简化版） | 2 天 | 站立时各方向外观 |
| 4 方向 sprite sheet 生成 + Godot 导出 | 1 天 | 完整 4 方向行走 |
| Godot 中的方向切换逻辑 | 1 天 | 根据移动方向自动切换动画 |

**Phase 3 完成标准：** game-simulate 中角色可以 4 方向行走。

### Phase 4：批量生产 + 优化（按需）

| 任务 | 工作量 | 产出 |
|------|--------|------|
| 扩展到全部 43 个部件的行走帧 | 视美术资源 | 完整部件覆盖 |
| Sprite Atlas 打包（GPU 纹理优化） | 2 天 | 减少纹理切换 |
| 预渲染缓存系统 | 2 天 | 避免运行时重复合成 |
| 装备/换装系统（如需要） | 5~7 天 | 动态替换部件层 |

---

## 七、风险评估与缓解

| 风险 | 严重度 | 概率 | 缓解措施 |
|------|--------|------|---------|
| 美术风格不统一 | 高 | 中 | 建立 Aseprite 模板 + 风格指南；先用 SpriteBrew 生成探索 |
| 48×48 画布下现有 32×32 资产放大后粗糙 | 中 | 中 | 仅身体/头部需要重绘；装饰类部件可以保持 32×32 居中放置 |
| 行走动画不自然（纯像素摆动） | 中 | 中 | 参考 LPC 行走动画的帧节奏；用 6 帧而非 4 帧以获得更平滑效果 |
| Godot 运行时拼装性能 | 低 | 低 | Sprite2D 层叠在 Godot 中是轻量操作；预渲染缓存兜底 |
| 扩展包复杂度失控 | 中 | 低 | 严格分层：compositor/animator/sheet 各自独立，不互相依赖 |

---

## 八、与现有调研结论的关系

之前在 `2d-pixel-character-sprite-ecosystem-survey.md` 中的结论是：

> Pixabots 适合做头像/Idle 展示，不适合直接扩展为游戏角色系统。核心问题是 4 字符 ID 格式的刚性限制 + 仅正面 + 仅 idle。

**本计划不否定该结论，而是采取「增量扩展」而非「重写」的策略：**

| 之前的判断 | 本计划的应对 |
|-----------|-------------|
| 4-char ID 刚性限制 | 不改 ID 系统，新增扩展包独立管理动画/方向 |
| 仅正面朝向 | 新增 `art/png-extended/` 目录存放多方向帧 |
| 仅 idle 动画 | 新增动画状态机，JSON 配置驱动 |
| 重写 60~70% 代码 | 核心层零改动，扩展层从零构建 |
| 建议借鉴架构自建 | 就在 Pixabots 仓库内自建，复用 Core API |

**不变的是：** 游戏端如果有更高要求的角色表现需求（精细的 8 方向、多种攻击动画），还是建议走 itch.io 资产包 + SpriteBrew AI 辅助的路线。Pixabots 扩展方案的定位是——**为你的 App + 轻量级游戏场景提供统一、可控、风格独特的像素角色资产管线**。

---

## 九、快速启动检查清单

- [ ] 创建 `packages/extended/` 目录结构
- [ ] 初始化 `package.json`（依赖 `@pixabots/core` + `sharp`）
- [ ] 实现 `compositor.ts` 基础版
- [ ] 编写第一个测试：合成 ID "4707" 的静态帧
- [ ] 实现 `batch-render-avatar.cjs` CLI
- [ ] 确定画布尺寸（32 vs 48 vs 64）
- [ ] 绘制第一个 walk_down 测试帧
- [ ] 在 game-simulate 中验证导入

---

## 附录 A：现有 Core API 速查

```
// 部件目录
PARTS: Record<'eyes'|'heads'|'body'|'top', PartOption[]>
LAYER_ORDER: ['top', 'body', 'heads', 'eyes']
CATEGORY_ORDER: ['eyes', 'heads', 'body', 'top']

// ID 编解码
encode(combo: PixabotCombo): string    // "4707"
decode(id: string): PixabotCombo       // {eyes:4, heads:7, body:0, top:7}
isValidId(id: string): boolean

// 随机生成
randomCombo(): PixabotCombo
randomId(): string
seededId(seed: number): string

// 渲染
renderPixabot(combo, options): Buffer       // 静态 PNG
renderAnimatedPixabot(combo, options): Buffer // 动画 GIF/WebP

// 动画
ANIM_FRAMES: number[8]    // Y 偏移弹跳数据
BLINK_SCHEDULE: number[16] // 眨眼时间表
FRAME_MS: 72               // 每帧时长
LOOP_LENGTH: 16             // 循环长度
```

## 附录 B：文件索引

| 文件 | 说明 |
|------|------|
| `packages/core/src/parts.ts` | PARTS 部件目录定义（43 个部件） |
| `packages/core/src/id.ts` | encode/decode ID 编解码 |
| `packages/core/src/render.ts` | 静态 + idle 动画渲染 |
| `packages/core/src/types.ts` | TypeScript 类型定义 |
| `art/png/eyes/` | 16 种眼睛部件（含动画子目录） |
| `art/png/heads/` | 8 种头型部件 |
| `art/png/body/` | 7 种身体部件 |
| `art/png/top/` | 12 种头顶装饰 |
| `scripts/render-test.cjs` | Sharp 合成测试脚本 |
