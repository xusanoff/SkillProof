"""Generate the small geometric SkillProof mark without image dependencies."""
import json
import math
from pathlib import Path
import struct
import zlib

ROOT = Path(__file__).resolve().parents[1]

def png(path, size):
    rows = []
    def distance(x, y, a, b):
        dx, dy = b[0]-a[0], b[1]-a[1]
        t = max(0, min(1, ((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy)))
        return math.hypot(x-a[0]-t*dx, y-a[1]-t*dy)
    for y in range(size):
        row = bytearray([0])
        for x in range(size):
            nx, ny = (x+.5)/size, (y+.5)/size
            inside = math.hypot(max(.2-nx, 0, nx-.8), max(.2-ny, 0, ny-.8)) <= .2
            check = min(distance(nx,ny,(.25,.50),(.43,.68)),distance(nx,ny,(.43,.68),(.76,.32))) < .047
            row.extend((255,255,255,255) if check else (16,27,50,255) if inside else (0,0,0,0))
        rows.append(row)
    def chunk(kind,data):
        return struct.pack('>I',len(data))+kind+data+struct.pack('>I',zlib.crc32(kind+data))
    content = b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',size,size,8,6,0,0,0))+chunk(b'IDAT',zlib.compress(b''.join(rows)))+chunk(b'IEND',b'')
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_bytes(content)

for density, size in {'mdpi':48,'hdpi':72,'xhdpi':96,'xxhdpi':144,'xxxhdpi':192}.items():
    png(ROOT/f'android/app/src/main/res/mipmap-{density}/ic_launcher.png',size)
assets=ROOT/'ios/Runner/Assets.xcassets'
for scale in [1,2,3]:
    suffix='' if scale==1 else f'@{scale}x'
    png(assets/f'LaunchImage.imageset/LaunchImage{suffix}.png',48*scale)
manifest=json.loads((assets/'AppIcon.appiconset/Contents.json').read_text())
for image in manifest['images']:
    if 'filename' in image:
        png(assets/'AppIcon.appiconset'/image['filename'],round(float(image['size'].split('x')[0])*float(image['scale'][:-1])))
