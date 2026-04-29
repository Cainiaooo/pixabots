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


def generate_sprite_sheet(
    base_dir: str,
    agent_id: str,
    state: str,
    fps: int = 8,
    frame_size: int = None,
    padding: int = 0,
    output_dir: str = None,
):
    """
    Pack all directional frames into a single sprite sheet.

    Layout: rows = directions (down, up, left, right), cols = frames.
    Returns (sheet_path, meta_path).
    """
    base = Path(base_dir)

    # Collect frames per direction
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

    if not dir_frames:
        print("ERROR: No frames found for any direction")
        return None, None

    # Determine frame size
    ref_img = Image.open(list(dir_frames.values())[0][0])
    src_w, src_h = ref_img.size
    ref_img.close()

    if frame_size:
        fw, fh = frame_size, frame_size
    else:
        fw, fh = src_w, src_h

    # Determine grid dimensions
    active_dirs = [d for d in DIRECTIONS if d in dir_frames]
    n_cols = max(len(v) for v in dir_frames.values())
    n_rows = len(active_dirs)

    sheet_w = n_cols * (fw + padding) - padding
    sheet_h = n_rows * (fh + padding) - padding

    # Create canvas
    sheet = Image.new("RGBA", (sheet_w, sheet_h), (0, 0, 0, 0))

    # Metadata
    meta = {
        "agent": agent_id,
        "state": state,
        "fps": fps,
        "frameWidth": fw,
        "frameHeight": fh,
        "padding": padding,
        "sheetWidth": sheet_w,
        "sheetHeight": sheet_h,
        "rows": n_rows,
        "columns": n_cols,
        "directions": active_dirs,
        "frames": [],
    }

    # Paste frames
    resample = Image.NEAREST
    for row_idx, d in enumerate(active_dirs):
        frames = dir_frames[d]
        for col_idx, fpath in enumerate(frames):
            x = col_idx * (fw + padding)
            y = row_idx * (fh + padding)

            img = Image.open(fpath).convert("RGBA")
            if img.size != (fw, fh):
                img = img.resize((fw, fh), resample)

            sheet.paste(img, (x, y))
            img.close()

            meta["frames"].append({
                "row": row_idx,
                "col": col_idx,
                "direction": d,
                "frameIndex": col_idx,
                "x": x,
                "y": y,
            })

    # Output
    out = Path(output_dir) if output_dir else base / "export"
    out.mkdir(parents=True, exist_ok=True)

    sheet_path = out / f"{agent_id}_{state}_sheet.png"
    meta_path = out / f"{agent_id}_{state}_sheet.json"

    sheet.save(sheet_path, "PNG")

    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2, ensure_ascii=False)

    sheet_size_kb = sheet_path.stat().st_size // 1024
    print(f"✓ Sheet: {sheet_w}x{sheet_h} ({n_rows}x{n_cols} grid) → {sheet_path} ({sheet_size_kb}KB)")
    print(f"✓ Meta:  → {meta_path}")

    return str(sheet_path), str(meta_path)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate sprite sheet from agent frame directories")
    parser.add_argument("--agent-id", required=True, help="Agent identifier (e.g. cyber-catgirl)")
    parser.add_argument("--state", default="walk", help="Animation state (default: walk)")
    parser.add_argument("--base-dir", default="art/png-extended", help="Base directory for frame assets")
    parser.add_argument("--output-dir", default=None, help="Output directory (default: {base-dir}/export/)")
    parser.add_argument("--fps", type=int, default=8, help="Animation FPS (default: 8)")
    parser.add_argument("--frame-size", type=int, default=None, help="Force frame size in px (default: auto-detect)")
    parser.add_argument("--padding", type=int, default=0, help="Padding between frames (default: 0)")
    args = parser.parse_args()

    print(f"Generating sprite sheet: {args.agent_id} / {args.state} (fps={args.fps})")
    generate_sprite_sheet(
        args.base_dir,
        args.agent_id,
        args.state,
        args.fps,
        args.frame_size,
        args.padding,
        args.output_dir,
    )
