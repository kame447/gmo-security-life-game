"""Deterministic export of generated opening candidate artwork. Run with Pillow."""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent
OUT = ROOT.parents[3] / 'images' / 'branding' / 'title'
NEAREST = Image.Resampling.NEAREST

def reduced(im, colors=48):
    im = im.convert('RGBA')
    alpha = im.getchannel('A').point(lambda p: 255 if p >= 128 else 0)
    if alpha.getextrema()[0] == 0:
        colors = min(colors, 47)  # Reserve one color for fully transparent pixels.
    rgb = im.convert('RGB').quantize(colors=colors, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert('RGBA')
    rgb.putalpha(alpha)
    pixels = list(rgb.get_flattened_data())
    rgb.putdata([p if p[3] else (0, 0, 0, 0) for p in pixels])
    return rgb

def original(name):
    return Image.open(ROOT / (name + '-original.png')).convert('RGBA')

def save(name, im):
    OUT.mkdir(parents=True, exist_ok=True)
    reduced(im).save(OUT / (name + '.png'), optimize=True)

def fit_sprite(im, size, margin=2):
    alpha=im.getchannel('A').point(lambda p: 255 if p >= 128 else 0)
    im.putalpha(alpha)
    im=im.crop(alpha.getbbox())
    scale=min((size[0]-2*margin)/im.width, (size[1]-2*margin)/im.height)
    im=im.resize((round(im.width*scale), round(im.height*scale)), NEAREST)
    dest=Image.new('RGBA',size)
    dest.alpha_composite(im,((size[0]-im.width)//2,(size[1]-im.height)//2))
    return dest

def export_a():
    save('opening-a-street', original('opening-a-street').resize((480,270),NEAREST))
    save('opening-a-pit', fit_sprite(original('opening-a-pit'),(160,112),3))

def export_c():
    for name,size in [('opening-c-pitwall',(480,480)),('opening-c-sky',(480,270)),('opening-c-town',(480,270))]:
        save(name,original(name).resize(size,NEAREST))

def export_dust():
    im=original('opening-dust')
    frames=[im.crop((i*im.width//4,0,(i+1)*im.width//4,im.height)) for i in range(4)]
    frames=[p.crop(p.getchannel('A').point(lambda v: 255 if v>=128 else 0).getbbox()) for p in frames]
    scale=min(20/max(p.width for p in frames),20/max(p.height for p in frames))
    sheet=Image.new('RGBA',(96,24))
    for i,p in enumerate(frames):
        p=p.resize((round(p.width*scale),round(p.height*scale)),NEAREST)
        sheet.alpha_composite(p,(i*24+(24-p.width)//2,22-p.height))
    save('opening-dust',sheet)

if __name__ == '__main__':
    export_a()
    export_c()
    export_dust()
