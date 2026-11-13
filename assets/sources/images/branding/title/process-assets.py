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
    im=original('opening-a-wings')
    pairs=[im.crop((i*im.width//2,0,(i+1)*im.width//2,im.height)) for i in range(2)]
    pairs=[p.crop(p.getchannel('A').point(lambda v: 255 if v>=128 else 0).getbbox()) for p in pairs]
    scale=min(60/max(p.width for p in pairs),28/max(p.height for p in pairs))
    sheet=Image.new('RGBA',(128,32))
    for i,p in enumerate(pairs):
        p=p.resize((round(p.width*scale),round(p.height*scale)),NEAREST)
        sheet.alpha_composite(p,(i*64+(64-p.width)//2,30-p.height))
    save('opening-a-wings',sheet)

def seamless(im, band):
    """Converge both edges to the same pixels across a narrow edge band."""
    im=im.convert('RGBA')
    pixels=im.load()
    for d in range(band):
        strength=1-d/(band-1)
        left,right=d,im.width-1-d
        for y in range(im.height):
            a,b=pixels[left,y],pixels[right,y]
            total=a[3]+b[3]
            mid=tuple(round((a[i]*a[3]+b[i]*b[3])/total) if total else 0 for i in range(3))+(round(total/2),)
            pixels[left,y]=tuple(round(a[i]*(1-strength)+mid[i]*strength) for i in range(4))
            pixels[right,y]=tuple(round(b[i]*(1-strength)+mid[i]*strength) for i in range(4))
    return im

def export_b():
    save('opening-b-sky', seamless(original('opening-b-sky').resize((480,270),NEAREST),24))
    far=original('opening-b-far')
    # Keep distant buildings small; strip includes transparent air above mountains.
    height=round(far.width*150/960)
    far=far.crop((0,far.height-height,far.width,far.height)).resize((960,150),NEAREST)
    save('opening-b-far',seamless(far,24))
    near=original('opening-b-near')
    bbox=near.getchannel('A').point(lambda v: 255 if v>=128 else 0).getbbox()
    near=near.crop(bbox).resize((960,170),NEAREST)
    save('opening-b-near',seamless(near,24))
    ground=original('opening-b-ground')
    tile=Image.new('RGBA',(96,64))
    # Remove the unwanted black upper margin and preserve sidewalk/curb/road bands.
    for top,bottom,y,h in [(256,480,0,24),(480,555,24,6),(555,1024,30,34)]:
        tile.alpha_composite(ground.crop((0,top,ground.width,bottom)).resize((96,h),NEAREST),(0,y))
    save('opening-b-ground',seamless(tile,8))
    save('opening-b-pit',fit_sprite(original('opening-b-pit'),(64,48),2))

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
    export_b()
    export_c()
    export_dust()
