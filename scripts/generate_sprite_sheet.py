#!/usr/bin/env python3
"""
Generate sprite sheet PNG + metadata JSON from AI agent frame directories.

Usage:
    .venv/bin/python scripts/generate_sprite_sheet.py \
        --agent-id cyber-catgirl --state walk \
        --fps 8 --frame-size 128 \
        --output-dir art/png-extended/export

Outputs:
    {agent_id}_{state}_sheet.png   — sprite sheet image
    {agent_id}_{state}_sheet.json  — metadata (frame positions, directions, etc.)
"""

import argparse
import json
from pathlib import Path
from PIL import Image


DIRECTIONS = ["down", "up", "left", "right"]


def _collect_direction_frames(base, state, agent_id):
    """Collect frames organized by direction: {state}/{direction}/{agent}/."""
    dir_frames = {}
    for d in DIRECTIONS:
        frame_dir = base / state / d / agent_id
        if not frame_dir.exists():
            print(f"  Skip {d}: not found ({frame_dir})")
            continue
        frames = sorted(frame_dir.glob("*.png"))
        if not frames:
            print(f"  Skip {d}: no PNG frames")
            continue
        dir_frames[d] = frames
    return dir_frames


def _collect_state_frames(base, agent_id, states=None):
    """Collect frames organized by state: {state_name}/{agent_id}/."""
    if states is None:
        states = ["idle", "coding", "thinking", "error", "done"]
    state_frames = {}
    for s in states:
        frame_dir = base / s / agent_id
        if not frame_dir.exists():
            print(f"  Skip {s}: not found ({frame_dir})")
            continue
        frames = sorted(frame_dir.glob("*.png"))
        if not frames:
            print(f"  Skip {s}: no PNG frames")
            continue
        state_frames[s] = frames
    return state_frames


def generate_sprite_sheet(
    base_dir: str,
    agent_id: str,
    state: str = None,
    fps: int = 8,
    frame_size: int = None,
    padding: int = 0,
    output_dir: str = None,
    layout: str = "directions",
    states: list = None,
):
    """
    Pack frames into a single sprite sheet.

    Layouts:
      - "directions" (default): rows = directions, cols = frames.
        Reads: {base}/{state}/{direction}/{agent}/*.png
      - "states": rows = animation states, cols = frames.
        Reads: {base}/{state_name}/{agent}/*.png

    Returns (sheet_path, meta_path).
    """
    base = Path(base_dir)

    # ── Collect frames ──────────────────────────────────────
    if layout == "states":
        row_groups = _collect_state_frames(base, agent_id, states)
        if not row_groups:
            print("ERROR: No frames found for any state")
            return None, None
        row_labels = [s for s in (states or ["idle", "coding", "thinking", "error", "done"]) if s in row_groups]
        group_key = "state"
    else:
        # layout == "directions"
        if not state:
            state = "walk"
        row_groups = _collect_direction_frames(base, state, agent_id)
        if not row_groups:
            print("ERROR: No frames found for any direction")
            return None, None
        row_labels = [d for d in DIRECTIONS if d in row_groups]
        group_key = "direction"

    # ── Determine frame size ────────────────────────────────
    ref_img = Image.open(list(row_groups.values())[0][0])
    src_w, src_h = ref_img.size
    ref_img.close()

    if frame_size:
        fw, fh = frame_size, frame_size
    else:
        fw, fh = src_w, src_h

    # ── Grid dimensions ─────────────────────────────────────
    n_cols = max(len(v) for v in row_groups.values())
    n_rows = len(row_labels)

    sheet_w = n_cols * (fw + padding) - padding
    sheet_h = n_rows * (fh + padding) - padding

    # ── Create canvas ───────────────────────────────────────
    sheet = Image.new("RGBA", (sheet_w, sheet_h), (0, 0, 0, 0))

    # ── Metadata ────────────────────────────────────────────
    meta = {
        "agent": agent_id,
        "layout": layout,
        "fps": fps,
        "frameWidth": fw,
        "frameHeight": fh,
        "padding": padding,
        "sheetWidth": sheet_w,
        "sheetHeight": sheet_h,
        "rows": n_rows,
        "columns": n_cols,
        group_key + "s": row_labels,
        "frames": [],
    }
    # Keep backward compat: include "state" field in directions layout
    if layout == "directions" and state:
        meta["state"] = state

    # ── Paste frames ────────────────────────────────────────
    resample = Image.NEAREST
    for row_idx, label in enumerate(row_labels):
        frames = row_groups[label]
        for col_idx, fpath in enumerate(frames):
            x = col_idx * (fw + padding)
            y = row_idx * (fh + padding)

            img = Image.open(fpath).convert("RGBA")
            if img.size != (fw, fh):
                img = img.resize((fw, fh), resample)

            sheet.paste(img, (x, y))
            img.close()

            frame_entry = {
                "row": row_idx,
                "col": col_idx,
                group_key: label,
                "frameIndex": col_idx,
                "x": x,
                "y": y,
            }
            # Backward compat: include "direction" in states layout too
            if layout == "states":
                frame_entry["state"] = label
            meta["frames"].append(frame_entry)

    # ── Output ──────────────────────────────────────────────
    out = Path(output_dir) if output_dir else base / "export"
    out.mkdir(parents=True, exist_ok=True)

    # Filename: for states layout, use agent_id only; for directions, include state
    if layout == "states":
        base_name = f"{agent_id}_states"
    else:
        base_name = f"{agent_id}_{state}"

    sheet_path = out / f"{base_name}_sheet.png"
    meta_path = out / f"{base_name}_sheet.json"

    sheet.save(sheet_path, "PNG")

    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2, ensure_ascii=False)

    sheet_size_kb = sheet_path.stat().st_size // 1024
    print(f"✓ Sheet: {sheet_w}x{sheet_h} ({n_rows}x{n_cols} grid, layout={layout}) → {sheet_path} ({sheet_size_kb}KB)")
    print(f"✓ Meta:  → {meta_path}")

    return str(sheet_path), str(meta_path)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate sprite sheet from agent frame directories")
    parser.add_argument("--agent-id", required=True, help="Agent identifier (e.g. cyber-catgirl)")
    parser.add_argument("--state", default="walk", help="Animation state for directions layout (default: walk)")
    parser.add_argument("--base-dir", default="art/png-extended", help="Base directory for frame assets")
    parser.add_argument("--output-dir", default=None, help="Output directory (default: {base-dir}/export/)")
    parser.add_argument("--fps", type=int, default=8, help="Animation FPS (default: 8)")
    parser.add_argument("--frame-size", type=int, default=None, help="Force frame size in px (default: auto-detect)")
    parser.add_argument("--padding", type=int, default=0, help="Padding between frames (default: 0)")
    parser.add_argument("--layout", choices=["directions", "states"], default="directions",
                        help="Layout mode: 'directions' (rows=directions) or 'states' (rows=animation states)")
    parser.add_argument("--states", nargs="*", default=None,
                        help="State names for 'states' layout (default: idle coding thinking error done)")
    args = parser.parse_args()

    print(f"Generating sprite sheet: {args.agent_id} (layout={args.layout}, fps={args.fps})")
    generate_sprite_sheet(
        args.base_dir,
        args.agent_id,
        state=args.state if args.layout == "directions" else None,
        fps=args.fps,
        frame_size=args.frame_size,
        padding=args.padding,
        output_dir=args.output_dir,
        layout=args.layout,
        states=args.states,
    )
