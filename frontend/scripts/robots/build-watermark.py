"""Sharp Profile-card watermark (robot-watermark.png) from the vector head master.

Why: the old robot-watermark.png was a 132 px raster shown at 150 css px (ProfileCard styles.watermark),
i.e. upscaled x1.14 on 1x screens and x3.4 on 3x phones, so it looked soft.

How: render assets/brand/zrodla/robot-glowa.svg (the head of robot-tab-elon.svg, same colours) with Chrome
at 8x, then box-downsample 8:1 with premultiplied alpha to 450 px (= 3x of 150 px). No blur, no upscaling.

Run from frontend/:  node scripts/robots/render-svg.mjs <tmpdir> 3600 glowa  &&  python scripts/robots/build-watermark.py <tmpdir>
"""
import sys
import numpy as np
from PIL import Image

TMP = sys.argv[1]
K = 8
OUT = 450

img = np.asarray(Image.open(f"{TMP}/hi-glowa.png").convert("RGBA")).astype(np.float64)
assert img.shape[:2] == (OUT * K, OUT * K), img.shape
a = img[..., 3:4] / 255.0
pre = np.concatenate([img[..., :3] * a, a * 255.0], axis=-1)
pre = pre.reshape(OUT, K, OUT, K, 4).mean(axis=(1, 3))
al = pre[..., 3:4] / 255.0
rgb = np.where(al > 0, pre[..., :3] / np.maximum(al, 1e-6), 0)
small = np.clip(np.concatenate([rgb, pre[..., 3:4]], axis=-1) + 0.5, 0, 255).astype(np.uint8)
Image.fromarray(small, "RGBA").save("assets/brand/robot-watermark.png", optimize=True)
print("robot-watermark.png", small.shape)
