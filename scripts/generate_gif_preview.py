#!/usr/bin/env python3
"""
Generate animated GIF previews from sprite frame directories.

Usage:
    .venv/bin/python scripts/generate_gif_preview.py \
        --agent-id cyber-catgirl --state walk \
        --fps 8 --scale 1

Outputs one GIF per direction into art/png-extended/preview/
"""

import argparse
from pathlib import Path
from PIL import Image


DIRECTIONS = ["down", "up", "left", "right"]


def generate_gif(base_dir: str, agent_id: str, state: str, direction: str,
                 fps: int = 8, scale: float = 1.0, out_dir: str = None):
    frame_dir = Path(base_dir) / state / direction / agent_id
    if not frame_dir.exists():
        print(f"  Skip {direction}: directory not found ({frame_dir})")
        return None

    frames = sorted(frame_dir.glob("*.png"))
    if not frames:
        print(f"  Skip {direction}: no PNG frames")
        return None

    images = []
    for f in frames:
        img = Image.open(f).convert("RGBA")
        if scale != 1.0:
            w, h = img.size
            img = img.resize((int(w * scale), int(h * scale)), Image.NEAREST)
        images.append(img)

    if not out_dir:
        out_dir = Path(base_dir) / "preview"
    else:
        out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    out_path = out_dir / f"{agent_id}_{state}_{direction}.gif"
    duration = int(1000 / fps)  # ms per frame

    images[0].save(
        out_path,
        save_all=True,
        append_images=images[1:],
        duration=duration,
        loop=0,
        disposal=2,
    )
    print(f"  ✓ {direction}: {len(images)} frames → {out_path} ({out_path.stat().st_size // 1024}KB)")
    return out_path


def generate_combined_gif(base_dir: str, agent_id: str, state: str,
                          fps: int = 8, scale: float = 1.0, out_dir: str = None):
    """Generate a single GIF with all 4 directions in a 2x2 grid."""
    grid = {}
    for d in DIRECTIONS:
        frame_dir = Path(base_dir) / state / d / agent_id
        if not frame_dir.exists():
            continue
        frames = sorted(frame_dir.glob("*.png"))
        if frames:
            imgs = []
            for f in frames:
                img = Image.open(f).convert("RGBA")
                if scale != 1.0:
                    w, h = img.size
                    img = img.resize((int(w * scale), int(h * scale)), Image.NEAREST)
                imgs.append(img)
            grid[d] = imgs

    if not grid:
        print("No frames found for any direction")
        return None

    # All images should be same size; use first as reference
    ref = list(grid.values())[0][0]
    fw, fh = ref.size

    # Layout: down top-left, up top-right, left bottom-left, right bottom-right
    layout = {"down": (0, 0), "up": (fw, 0), "left": (0, fh), "right": (fw, fh)}
    canvas_w, canvas_h = fw * 2, fh * 2

    n_frames = max(len(v) for v in grid.values())
    combined = []
    for i in range(n_frames):
        canvas = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))
        for d, imgs in grid.items():
            idx = i % len(imgs)
            x, y = layout[d]
            canvas.paste(imgs[idx], (x, y))
        combined.append(canvas)

    if not out_dir:
        out_dir = Path(base_dir) / "preview"
    else:
        out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    out_path = out_dir / f"{agent_id}_{state}_all.gif"
    duration = int(1000 / fps)

    combined[0].save(
        out_path,
        save_all=True,
        append_images=combined[1:],
        duration=duration,
        loop=0,
        disposal=2,
    )
    print(f"  ✓ Combined 2x2: {n_frames} frames → {out_path} ({out_path.stat().st_size // 1024}KB)")
    return out_path


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--agent-id", required=True)
    parser.add_argument("--state", default="walk")
    parser.add_argument("--fps", type=int, default=8)
    parser.add_argument("--scale", type=float, default=1.0)
    parser.add_argument("--base-dir", default="art/png-extended")
    parser.add_argument("--out-dir", default=None)
    parser.add_argument("--combined", action="store_true", help="Also generate 2x2 combined GIF")
    args = parser.parse_args()

    print(f"Generating GIF previews for: {args.agent_id} / {args.state}")
    for d in DIRECTIONS:
        generate_gif(args.base_dir, args.agent_id, args.state, d, args.fps, args.scale, args.out_dir)

    if args.combined:
        generate_combined_gif(args.base_dir, args.agent_id, args.state, args.fps, args.scale, args.out_dir)
