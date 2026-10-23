"""Sharp header robots (robot-tab-*-kontur.png) straight from the vector masters.

Why: the previous -kontur files were made from the 132 px PNGs, upscaled to 154 px (x1.17) and given a
Gaussian-blurred outline plus a 7 px glow, so at 56 css px on a 3x screen every edge was soft.

How: 1) render assets/brand/zrodla/robot-tab-*.svg with Chrome at 8x (scripts/robots/render-svg.mjs),
2) add a crisp light outline at that resolution (exact distance transform, no blur, no glow),
3) box-downsample 8:1 with premultiplied alpha to 168 px (= 3x of the 56 px header box; 2x/1x screens
   downsample in the browser). Same placement as before, so the layout is identical.

Run from frontend/:  node scripts/robots/render-svg.mjs <tmpdir> 1232  &&  python scripts/robots/build-robots.py <tmpdir>
(needs playwright-core + Chrome for the render, Pillow + numpy + scipy for this script)
"""
import sys
import numpy as np
from PIL import Image
from scipy.ndimage import distance_transform_edt

TMP = sys.argv[1]
K = 8                     # supersampling factor
OUT = 168                 # final px (3x of 56)
CANVAS = OUT * K          # 1344
SVG_PX = 1232             # SVG frame size at 8x (154 px at 3x): robot body lands on the same pixels as the old file
OFFSET = 58               # top-left offset at 8x (7.25 px at 3x)
OUTLINE_PX = 4.0          # outline width at 3x (≈ 1.33 css px), crisp
OUTLINE_RGBA = (244, 248, 251, 0.6)   # onSurface #F4F8FB at 60 %

def downsample(img: np.ndarray) -> np.ndarray:
    a = img[..., 3:4] / 255.0
    pre = np.concatenate([img[..., :3] * a, a * 255.0], axis=-1)
    h, w, _ = pre.shape
    pre = pre.reshape(h // K, K, w // K, K, 4).mean(axis=(1, 3))
    al = pre[..., 3:4] / 255.0
    rgb = np.where(al > 0, pre[..., :3] / np.maximum(al, 1e-6), 0)
    return np.clip(np.concatenate([rgb, pre[..., 3:4]], axis=-1) + 0.5, 0, 255).astype(np.uint8)

for n in ["sprawy", "pisma", "elon", "forum", "profil"]:
    robot = Image.open(f"{TMP}/hi-{n}.png").convert("RGBA")
    assert robot.size == (SVG_PX, SVG_PX), robot.size
    canvas = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    canvas.paste(robot, (OFFSET, OFFSET), robot)
    arr = np.asarray(canvas).astype(np.float64)
    inside = arr[..., 3] >= 128
    dist = distance_transform_edt(~inside)                      # distance (8x px) to the robot silhouette
    ring = (dist <= OUTLINE_PX * K).astype(np.float64)          # hard-edged ring; AA comes from the 8:1 box filter
    r, g, b, op = OUTLINE_RGBA
    out_a = ring * op
    rob_a = arr[..., 3] / 255.0
    comp_a = rob_a + out_a * (1 - rob_a)
    comp_rgb = (arr[..., :3] * rob_a[..., None] + np.array([r, g, b]) * (out_a * (1 - rob_a))[..., None]) / np.maximum(comp_a, 1e-6)[..., None]
    comp = np.concatenate([comp_rgb, (comp_a * 255)[..., None]], axis=-1)
    small = downsample(comp)
    Image.fromarray(small, "RGBA").save(f"assets/brand/robot-tab-{n}-kontur.png", optimize=True)
    print(n, small.shape)
