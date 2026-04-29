#!/usr/bin/env python3
"""
Sprite Sheet Processor — GPT Image 2 → individual pose frames

Takes a sprite sheet image (6 frames, 1 row), detects frames,
removes background, crops to tight bounding box, resizes to target
pixel size, and saves as PNG with transparency.

Usage:
    .venv/bin/python scripts/process_spritesheet.py <input_image> --agent-id <name> [--size 48] [--frames 6] [--output-dir art/png-extended]

Requirements:
    pip install Pillow numpy rembg
"""

import argparse
import os
import sys
from pathlib import Path

import numpy as np
from PIL import Image


def find_frames(arr: np.ndarray, num_frames: int) -> list[tuple[int, int]]:
    """Detect frame boundaries by analyzing per-column content density."""
    h, w = arr.shape[:2]
    bg = arr[0, 0].astype(float)

    # Per-pixel distance from background color
    diff = np.sqrt(np.sum((arr.astype(float) - bg) ** 2, axis=2))
    has_content = diff > 30  # JPEG artifact tolerance

    col_content = has_content.sum(axis=0)
    cols_active = np.where(col_content > 0)[0]
    if len(cols_active) == 0:
        raise ValueError("No content detected in image")

    cmin, cmax = cols_active[0], cols_active[-1]
    content_w = cmax - cmin + 1

    # If we know the number of frames, just evenly divide the content area
    frame_width = content_w // num_frames
    frames = []
    for i in range(num_frames):
        x_start = cmin + i * frame_width
        x_end = cmin + (i + 1) * frame_width if i < num_frames - 1 else cmax + 1
        frames.append((x_start, x_end))

    return frames


def remove_background_simple(img: Image.Image, bg_tol: int = 30) -> Image.Image:
    """Remove near-white background (for JPEG inputs from GPT Image)."""
    arr = np.array(img.convert("RGB"))
    bg = arr[0, 0].astype(float)

    diff = np.sqrt(np.sum((arr.astype(float) - bg) ** 2, axis=2))
    alpha = (diff > bg_tol).astype(np.uint8) * 255

    rgba = np.dstack([arr, alpha])
    return Image.fromarray(rgba, "RGBA")


def remove_background_corner(img: Image.Image, corners_frac: float = 0.02, tol: int = 40) -> Image.Image:
    """Remove background based on corner color sampling."""
    arr = np.array(img.convert("RGB"))
    h, w = arr.shape[:2]

    # Sample corners to determine background color
    margin = max(1, int(min(h, w) * corners_frac))
    samples = np.concatenate([
        arr[:margin, :margin].reshape(-1, 3),
        arr[:margin, -margin:].reshape(-1, 3),
        arr[-margin:, :margin].reshape(-1, 3),
        arr[-margin:, -margin:].reshape(-1, 3),
    ])
    bg = samples.mean(axis=0)

    diff = np.sqrt(np.sum((arr.astype(float) - bg) ** 2, axis=2))
    alpha = (diff > tol).astype(np.uint8) * 255

    # Morphological cleanup: remove small noise
    from PIL import ImageFilter
    alpha_img = Image.fromarray(alpha)
    # Dilate slightly to fill holes, then erode to restore edges
    alpha_img = alpha_img.filter(ImageFilter.MinFilter(3))
    alpha_img = alpha_img.filter(ImageFilter.MaxFilter(3))

    alpha = np.array(alpha_img)
    rgba = np.dstack([arr, alpha])
    return Image.fromarray(rgba, "RGBA")


def crop_to_content(img: Image.Image, padding: int = 2) -> Image.Image:
    """Crop image to tight bounding box around non-transparent content."""
    arr = np.array(img)
    alpha = arr[:, :, 3]
    rows = np.any(alpha > 0, axis=1)
    cols = np.any(alpha > 0, axis=0)

    if not rows.any():
        return img

    rmin, rmax = np.where(rows)[0][[0, -1]]
    cmin, cmax = np.where(cols)[0][[0, -1]]

    rmin = max(0, rmin - padding)
    rmax = min(img.height - 1, rmax + padding)
    cmin = max(0, cmin - padding)
    cmax = min(img.width - 1, cmax + padding)

    return img.crop((cmin, rmin, cmax + 1, rmax + 1))


def center_on_canvas(img: Image.Image, size: int) -> Image.Image:
    """Center the image on a square canvas of given size."""
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    # Scale down if needed
    if img.width > size or img.height > size:
        ratio = min(size / img.width, size / img.height)
        new_w = int(img.width * ratio)
        new_h = int(img.height * ratio)
        img = img.resize((new_w, new_h), Image.NEAREST)

    x = (size - img.width) // 2
    y = (size - img.height) // 2
    canvas.paste(img, (x, y), img)
    return canvas


def process_sheet(
    input_path: str,
    agent_id: str,
    num_frames: int = 6,
    target_size: int = 48,
    output_dir: str = "art/png-extended",
    state: str = "walk",
    direction: str = "down",
    bg_method: str = "corner",
    bg_tol: int = 40,
):
    """Full pipeline: load → detect frames → remove bg → crop → resize → save."""
    print(f"Loading: {input_path}")
    img = Image.open(input_path).convert("RGB")
    arr = np.array(img)
    print(f"  Size: {img.width}x{img.height}")

    # Detect frames
    frames = find_frames(arr, num_frames)
    print(f"  Detected {len(frames)} frames")
    for i, (s, e) in enumerate(frames):
        print(f"    Frame {i+1}: x={s}-{e-1} ({e-s}px)")

    # Process each frame
    out_dir = Path(output_dir) / state / direction / agent_id
    out_dir.mkdir(parents=True, exist_ok=True)

    for i, (x_start, x_end) in enumerate(frames):
        # Extract frame region
        frame = img.crop((x_start, 0, x_end, img.height))

        # Remove background
        if bg_method == "corner":
            rgba = remove_background_corner(frame, tol=bg_tol)
        else:
            rgba = remove_background_simple(frame, bg_tol=bg_tol)

        # Crop to content
        rgba = crop_to_content(rgba)

        # Center on target canvas
        final = center_on_canvas(rgba, target_size)

        # Save
        filename = f"walk-{i+1:02d}.png"
        filepath = out_dir / filename
        final.save(filepath, "PNG")
        print(f"  Saved: {filepath} ({os.path.getsize(filepath)} bytes)")

    print(f"\nDone! {num_frames} frames → {out_dir}/")
    return out_dir


def main():
    parser = argparse.ArgumentParser(description="Process sprite sheet into individual frames")
    parser.add_argument("input", help="Input sprite sheet image")
    parser.add_argument("--agent-id", required=True, help="Agent identifier (e.g. 'bot-001')")
    parser.add_argument("--frames", type=int, default=6, help="Number of frames (default: 6)")
    parser.add_argument("--size", type=int, default=48, help="Output frame size in px (default: 48)")
    parser.add_argument("--output-dir", default="art/png-extended", help="Output base directory")
    parser.add_argument("--state", default="walk", help="Animation state name")
    parser.add_argument("--direction", default="down", help="Direction name")
    parser.add_argument("--bg-method", choices=["corner", "simple"], default="corner")
    parser.add_argument("--bg-tol", type=int, default=40, help="Background removal tolerance (default: 40)")
    args = parser.parse_args()

    process_sheet(
        args.input,
        args.agent_id,
        num_frames=args.frames,
        target_size=args.size,
        output_dir=args.output_dir,
        state=args.state,
        direction=args.direction,
        bg_method=args.bg_method,
        bg_tol=args.bg_tol,
    )


if __name__ == "__main__":
    main()
