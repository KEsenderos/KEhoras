# SVG を指定の大きさの画像（PNG）に書き出す
import sys
from playwright.sync_api import sync_playwright
n = sys.argv[1] if len(sys.argv) > 1 else 'icon'
with sync_playwright() as p:
    b = p.chromium.launch()
    for size in (180, 192, 512, 1024):
        pg = b.new_page(viewport={'width': size, 'height': size})
        pg.goto(f'file:///home/claude/build/logo/{n}.svg')
        pg.screenshot(path=f'/home/claude/build/logo/{n}_{size}.png')
        pg.close()
    b.close()
