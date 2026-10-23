# Bakes a soft light outline (+ faint mint glow) into robot-tab PNGs. Originals untouched.
from PIL import Image, ImageFilter, ImageChops
import sys
CANVAS=168          # 3x of 56 px display
BODY=154            # robot scaled 132 -> 154 (LANCZOS) = 51.3 px at display
OUT_W=4             # outline radius at 3x ≈ 1.3–1.5 px at display (with soft blur)
for n in ['sprawy','pisma','elon','forum','profil']:
    src=Image.open(f'robot-tab-{n}.png').convert('RGBA').resize((BODY,BODY),Image.LANCZOS)
    base=Image.new('RGBA',(CANVAS,CANVAS),(0,0,0,0)); off=(CANVAS-BODY)//2; base.paste(src,(off,off),src)
    a=base.getchannel('A')
    dil=a.filter(ImageFilter.MaxFilter(2*OUT_W+1)).filter(ImageFilter.GaussianBlur(1.2))
    outline=Image.new('RGBA',base.size,(244,248,251,0)); outline.putalpha(dil.point(lambda v:int(v*0.5)))
    glow_a=a.filter(ImageFilter.MaxFilter(2*OUT_W+1)).filter(ImageFilter.GaussianBlur(7)).point(lambda v:int(v*0.16))
    glow=Image.new('RGBA',base.size,(181,242,215,0)); glow.putalpha(glow_a)
    out=Image.alpha_composite(glow,outline); out=Image.alpha_composite(out,base)
    out.save(f'robot-tab-{n}-kontur.png',optimize=True)
    print(n,out.size,out.getbbox())
