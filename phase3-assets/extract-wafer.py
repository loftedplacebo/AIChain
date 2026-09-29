"""User-approved local background removal; preserve original and verify alpha."""
from pathlib import Path
import numpy as np
from PIL import Image, ImageFilter, ImageDraw

root = Path(__file__).resolve().parent
source = Image.open(root / 'glass-wafer-transparent.png').convert('RGB')
rgb = np.asarray(source).astype(np.int16)
# The baked checkerboard is bright and neutral; glass is blue/dark or amber.
candidate = ((rgb.max(2) - rgb.min(2)) > 32) | (rgb.max(2) < 130)
connected = Image.fromarray((candidate * 255).astype('uint8'))
connected = connected.filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.MinFilter(5))
ImageDraw.floodfill(connected, (768, 512), 128)
mask = Image.fromarray((np.asarray(connected) == 128).astype('uint8') * 255).copy()
ImageDraw.floodfill(mask, (0, 0), 128)
mask = Image.fromarray((np.asarray(mask) != 128).astype('uint8') * 255)
# Inset the matte to remove background-contaminated boundary pixels.
alpha = mask.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(.55))
result = source.convert('RGBA'); result.putalpha(alpha)
result.save(root / 'glass-wafer-alpha.png', optimize=True)
bg = Image.new('RGBA', result.size, '#0b1d2c'); bg.alpha_composite(result)
bg.convert('RGB').save(root / 'glass-wafer-dark-check.jpg', quality=95)
a = np.asarray(alpha)
assert a[0,:].max() == a[-1,:].max() == a[:,0].max() == a[:,-1].max() == 0
assert (a == 0).mean() > .5 and (a == 255).mean() > .1
print({'size': result.size, 'mode': result.mode, 'transparent_fraction': float((a == 0).mean()), 'bbox': alpha.getbbox()})
