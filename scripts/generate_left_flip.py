#!/usr/bin/env python3
"""
Generate left direction frames by horizontally flipping right direction frames.
Zero art cost — pure code operation.

Usage:
    .venv/bin/python scripts/generate_left_flip.py --agent-id <name> [--size 512] [--state walk]
"""

import argparse
import os
from pathlib import Path
from PIL import Image


def generate_left_flip(base_dir: str, agent_id: str, state: str = "walk", size: int = 512):
    right_dir = Path(base_dir) / state / "right" / agent_id
    left_dir = Path(base_dir) / state / "left" / agent_id

    if not right_dir.exists():
        print(f"Error: right direction not found: {right_dir}")
        return

    right_frames = sorted(right_dir.glob("*.png"))
    if not right_frames:
        print(f"Error: no PNG frames in {right_dir}")
        return

    left_dir.mkdir(parents=True, exist_ok=True)

    for frame_path in right_frames:
        img = Image.open(frame_path)
        flipped = img.transpose(Image.FLIP_LEFT_RIGHT)
        out_path = left_dir / frame_path.name
        flipped.save(out_path, "PNG")
        print(f"  Flipped: {frame_path.name} → {out_path}")

    print(f"\nDone! {len(right_frames)} frames → {left_dir}/")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--agent-id", required=True)
    parser.add_argument("--state", default="walk")
    parser.add_argument("--size", type=int, default=512)
    parser.add_argument("--base-dir", default="art/png-extended")
    args = parser.parse_args()
    generate_left_flip(args.base_dir, args.agent_id, args.state, args.size)
