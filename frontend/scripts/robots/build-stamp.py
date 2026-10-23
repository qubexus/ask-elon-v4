"""'ask Elon' document stamp (PDF letters from the chat + the chat/drawer document cards).

Deliberately a friendly brand sticker, NOT an official/legal/union seal: lowercase text, brand orange ring,
the Elon robot head in the middle, no words like "approved", "certified" or "official".

Outputs (rendered with Chrome from the vector robot head assets/brand/zrodla/robot-glowa.svg):
  backend/assets/stamp-{pl,en,ro}.png  480 px  – put on the PDF (text: "przygotowane z / prepared with / pregătit cu" + "ask Elon")
  frontend/assets/brand/elon-stamp.png 192 px  – small stamp on document cards (text: "ask Elon" only)

Run from frontend/:  /workspace/pw-venv/bin/python scripts/robots/build-stamp.py   (needs Python playwright + Chrome)
"""
import re
from pathlib import Path
from playwright.sync_api import sync_playwright

FRONT = Path(__file__).resolve().parents[2]
BACK = FRONT.parent / "backend" / "assets"
head = (FRONT / "assets/brand/zrodla/robot-glowa.svg").read_text()
inner = re.sub(r"^.*?<g class=\"head\">", "<g>", head, flags=re.S).replace("</svg>", "")
inner = re.sub(r"<title>.*?</title>", "", inner)

ORANGE, NAVY, CREAM = "#FF6A00", "#0A2A5C", "#FFF3E8"
TOP = {"pl": "przygotowane z", "en": "prepared with", "ro": "pregătit cu", "card": "ask Elon"}
BOTTOM = {"pl": "ask Elon", "en": "ask Elon", "ro": "ask Elon", "card": "• • •"}


def svg(variant: str, size: int) -> str:
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="-100 -100 200 200" width="{size}" height="{size}">
<defs>
  <path id="top" d="M -77,0 A 77 77 0 0 1 77,0"/>
  <path id="bot" d="M -84,0 A 84 84 0 0 0 84,0"/>
</defs>
<circle r="95" fill="{CREAM}" stroke="{ORANGE}" stroke-width="6"/>
<circle r="64" fill="none" stroke="{NAVY}" stroke-width="1.6" stroke-dasharray="2 4" opacity=".55"/>
<g font-family="Inter, system-ui, sans-serif" font-weight="800" fill="{NAVY}" text-anchor="middle">
  <text font-size="{17 if variant != 'card' else 24}" letter-spacing="1"><textPath href="#top" startOffset="50%">{TOP[variant]}</textPath></text>
  <text font-size="{20 if variant != 'card' else 20}" fill="{ORANGE}" letter-spacing="1"><textPath href="#bot" startOffset="50%">{BOTTOM[variant]}</textPath></text>
</g>
<svg x="-50" y="-54" width="100" height="100" viewBox="-70 -86 140 140">{inner}</svg>
</svg>"""


with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
    pg = b.new_page(viewport={"width": 480, "height": 480})
    for variant, size, out in [("pl", 480, BACK / "stamp-pl.png"), ("en", 480, BACK / "stamp-en.png"),
                               ("ro", 480, BACK / "stamp-ro.png"), ("card", 192, FRONT / "assets/brand/elon-stamp.png")]:
        pg.set_viewport_size({"width": size, "height": size})
        pg.set_content(f'<html><body style="margin:0;background:transparent">{svg(variant, size)}</body></html>')
        pg.evaluate("document.fonts.ready")
        pg.screenshot(path=str(out), omit_background=True, clip={"x": 0, "y": 0, "width": size, "height": size})
        print("wrote", out)
    b.close()
