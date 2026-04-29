# @pixabots/extended — TODO

## Priority: High

### [ ] 部件-位置映射表 (Part Anchor Map)
定义不同 pixabots 部件类别在 AI 角色帧上的默认锚点位置。

当前 `compositeAgentFrame` 的 overlay 支持手动指定 `offsetX/offsetY`，但缺少一套自动定位规则。

需要定义：
```typescript
// 示例结构
const PART_ANCHORS: Record<PartCategory, AnchorDef> = {
  top:   { anchorY: 0.10, anchorX: 0.50, scale: 0.08 },  // 头顶装饰
  eyes:  { anchorY: 0.25, anchorX: 0.50, scale: 0.10 },  // 眼部配饰
  heads: { anchorY: 0.15, anchorX: 0.50, scale: 0.12 },  // 头部装饰
  body:  { anchorY: 0.55, anchorX: 0.50, scale: 0.10 },  // 身体装饰
}
```

- `anchorX/Y` 为比例值（0~1），相对于角色帧的实际内容区域
- `scale` 为相对于画面宽度的比例

**前置依赖**：先在 prompt 侧标准化角色身体比例（见下方），才能精确定位锚点。

### [ ] AI 角色生成 Prompt 身体比例标准
在 sprite-prompts.md 中建立统一的角色身体比例规范，确保所有 AI 生成的角色：
- 头部位置和大小一致
- 身体比例在固定范围内
- 配饰锚点可预测

见 `~/.hermes/skills/gaming/pixel-character-pipeline/templates/sprite-prompts.md`

## Priority: Medium

### [ ] 多帧批量 compose
当前 CLI compose 只处理单帧。需要支持：
- `--all-frames` 一次处理整个动画序列
- 输出为 sprite sheet 或帧序列

### [ ] 部件内容自动裁切
pixabots 32×32 部件中大量是透明像素，叠加前应先裁切到实际内容边界，再缩放放置。

### [ ] 角色注册表 (Agent Manifest)
给每个 AI 角色建 JSON manifest，记录：
- 可用动画状态和方向
- 帧数、尺寸
- 内容区域 bounding box（用于自动锚点计算）

## Priority: Low

### [ ] 清理早期测试资产
art/png-extended/walk/down/ 下的 test-bot-001, test-bot-002, gpt-bot-001
