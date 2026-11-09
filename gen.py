# アイコンのSVGを作る（確定版：青い背景・白い時計・オレンジの「KE」）。「KE」は文字（フォント）ではなく線で組んだ図形（どの環境でも同じ形になる）
def ke(cx, y0, h, s, color):
    """「KE」を中央 cx・上端 y0・高さ h・線の太さ s で描いた path を返す"""
    w = 0.6 * h
    gap = 0.4 * h
    x0 = cx - (2 * w + gap) / 2          # Kの左端
    xe = x0 + w + gap                    # Eの左端
    y1 = y0 + h
    ym = y0 + h / 2
    d = (
        f"M{x0:.0f} {y0:.0f}V{y1:.0f}"                                   # K 縦棒
        f"M{x0 + w:.0f} {y0:.0f}L{x0:.0f} {ym + h*0.06:.0f}"            # K 上の斜め
        f"M{x0 + w*0.22:.0f} {ym - h*0.1:.0f}L{x0 + w:.0f} {y1:.0f}"    # K 下の斜め
        f"M{xe:.0f} {y0:.0f}V{y1:.0f}"                                   # E 縦棒
        f"M{xe:.0f} {y0:.0f}H{xe + w:.0f}"                              # E 上
        f"M{xe:.0f} {ym:.0f}H{xe + w*0.85:.0f}"                         # E 中
        f"M{xe:.0f} {y1:.0f}H{xe + w:.0f}"                              # E 下
    )
    return f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{s}" stroke-linecap="round" stroke-linejoin="round"/>'

HEAD = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">'
KE_ORANGE = '#F59E0B'  # 「KE」はオレンジ（KEの署名の色。ルールブック3-10）
ICON = (HEAD + '<rect width="1024" height="1024" fill="#1D4ED8"/>'
        '<circle cx="512" cy="372" r="235" fill="#FFFFFF"/>'
        '<path d="M512 372V225M512 372L610 432" stroke="#1D4ED8" stroke-width="36" stroke-linecap="round"/>'
        '<circle cx="512" cy="372" r="24" fill="#1D4ED8"/>'
        + ke(512, 700, 190, 48, KE_ORANGE) + '</svg>')
open('icon.svg', 'w').write(ICON)
