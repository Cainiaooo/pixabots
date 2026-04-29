#!/usr/bin/env python3
"""Analyze sprite sheet — detect frame boundaries using edge detection."""

from PIL import Image
import numpy as np
import sys

img_path = sys.argv[1]
img = Image.open(img_path).convert("RGB")
arr = np.array(img)
h, w = arr.shape[:2]
print(f"Image: {w}x{h}")

# JPEG bg is near-white (~254). Use tolerance for "background" detection.
bg = arr[0, 0].astype(float)
print(f"BG color: {bg.astype(int)}")

# Compute per-column "non-background content" score
# A column has content if many pixels differ from bg
tolerance = 30  # JPEG artifacts tolerance
diff = np.sqrt(np.sum((arr.astype(float) - bg) ** 2, axis=2))  # per-pixel distance from bg
has_content = diff > tolerance  # pixel is "not background"

col_content = has_content.sum(axis=0)  # how many non-bg pixels per column
row_content = has_content.sum(axis=1)  # how many non-bg pixels per row

# Find content bounding box
cols_with_content = np.where(col_content > 0)[0]
rows_with_content = np.where(row_content > 0)[0]
if len(cols_with_content) == 0:
    print("No content found!")
    sys.exit(1)

cmin, cmax = cols_with_content[0], cols_with_content[-1]
rmin, rmax = rows_with_content[0], rows_with_content[-1]
print(f"\nContent area: x={cmin}-{cmax}, y={rmin}-{rmax}")
print(f"Content size: {cmax-cmin+1} x {rmax-rmin+1}")

# Detect frame boundaries by finding "gap" columns within content area
# A gap column has very few non-bg pixels (< 5% of content height)
content_height = rmax - rmin + 1
gap_threshold = content_height * 0.05
col_in_content_area = col_content[cmin:cmax+1]
is_gap = col_in_content_area < gap_threshold

# Find sprite segments
in_sprite = False
segments = []
start = cmin
for i, gap in enumerate(is_gap):
    x = cmin + i
    if not gap and not in_sprite:
        start = x
        in_sprite = True
    elif gap and in_sprite:
        segments.append((start, x))
        in_sprite = False
if in_sprite:
    segments.append((start, cmax + 1))

print(f"\nDetected {len(segments)} frame segments:")
for i, (s, e) in enumerate(segments):
    width = e - s
    # Find vertical bounds for this segment
    seg_cols = col_content[s:e]
    seg_active = np.where(seg_cols > 0)[0]
    if len(seg_active) > 0:
        seg_rows_active = has_content[:, s:e].any(axis=1)
        seg_rows = np.where(seg_rows_active)[0]
        rs, re = seg_rows[0], seg_rows[-1]
        print(f"  Frame {i+1}: x={s}-{e-1} ({width}px), y={rs}-{re} ({re-rs+1}px)")
    else:
        print(f"  Frame {i+1}: x={s}-{e-1} ({width}px)")

# Also check for rows that might indicate multiple rows of sprites
row_gap_threshold = (cmax - cmin + 1) * 0.05
row_in_content_area = row_content[rmin:rmax+1]
is_row_gap = row_in_content_area < row_gap_threshold

in_row = False
row_segments = []
start = rmin
for i, gap in enumerate(is_row_gap):
    y = rmin + i
    if not gap and not in_row:
        start = y
        in_row = True
    elif gap and in_row:
        row_segments.append((start, y))
        in_row = False
if in_row:
    row_segments.append((start, rmax + 1))

print(f"\nRow segments: {len(row_segments)}")
for i, (s, e) in enumerate(row_segments):
    print(f"  Row {i+1}: y={s}-{e-1} ({e-s}px)")

# Summary
print(f"\n{'='*40}")
print(f"Layout: {len(row_segments)} row(s) × {len(segments)} column(s) = {len(row_segments) * len(segments)} frames")
if segments:
    widths = [e - s for s, e in segments]
    print(f"Frame widths: min={min(widths)}, max={max(widths)}, avg={sum(widths)/len(widths):.0f}")
if row_segments:
    heights = [e - s for s, e in row_segments]
    print(f"Row heights: min={min(heights)}, max={max(heights)}, avg={sum(heights)/len(heights):.0f}")
