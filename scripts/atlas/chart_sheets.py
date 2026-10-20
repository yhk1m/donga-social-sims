# © 2026 김용현
# scripts/atlas/chart_sheets.py — C4 대조표: 그래프마다 교과서 그림(자른 것) | 뽑은 숫자로 다시 그린 그림(matplotlib) 을 한 줄로,
# 쪽마다 한 장 <out_dir>/charts-<쪽>.png (out_dir = 설정 charts.out.sheets). 다시 그린 그림의 색은 설정 계열 색(없으면 기본 색), 잰 값은 작은 × 로 겹친다.
import io, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Wedge
from PIL import Image, ImageDraw, ImageFont
import pdfkit
from atlas_common import FONT_PATH, unit_config

plt.rcParams['font.family'] = ['Malgun Gothic', 'DejaVu Sans']
plt.rcParams['axes.unicode_minus'] = False
DPI = 200
ROW_H = 520
PALETTE = ['#4e79a7', '#f28e2b', '#e15759', '#76b7b2', '#59a14f', '#edc948', '#b07aa1', '#ff9da7', '#9c755f', '#bab0ac',
           '#86bcb6', '#d37295', '#fabfd2', '#b6992d', '#499894', '#79706e', '#d4a6c8', '#a0cbe8']


def _ring_ratio(ch):
    """고리 안쪽 반지름 비 — 앱 chartCore ringRatio 와 같은 규칙: ring 이 수면 그 값, true(유럽 v2 코펜하겐)면 donut(없으면 0.6)."""
    r = ch.get('ring')
    return r if isinstance(r, (int, float)) and not isinstance(r, bool) else ch.get('donut', 0.6)


def _colors(cid, ch):
    cfg = unit_config()['charts']['items'][cid]
    m = {}
    for s in cfg.get('series', []):
        if isinstance(s, dict) and s.get('color'): m[s['name']] = s['color']
    if ch.get('ring') or ch['type'] == 'bubbleRow':   # 아프리카(U4-7): 설정 계열이 없고 뽑은 자료에 조각 색(교과서 색)이 있는 그래프
        return [s.get('color') or PALETTE[i % len(PALETTE)] for i, s in enumerate(ch['series'])]
    return [m.get(s['name'], PALETTE[i % len(PALETTE)]) for i, s in enumerate(ch['series'])]


def _crop(ch, tmp_dir):
    """교과서 그래프 영역 렌더(임시 PNG 는 대조표 폴더(ASCII 작업 폴더)에 두었다가 지운다)."""
    out = os.path.join(tmp_dir, '_crop.png')
    try:
        pdfkit.render_clip(ch['page'], list(ch['bbox']), DPI, out)
        with Image.open(out) as im: return im.convert('RGB')
    finally:
        if os.path.exists(out): os.remove(out)


def _measured(s):
    m = s.get('measured')
    return m if isinstance(m, list) else None


def _plot(cid, ch, ax):
    t = ch['type']; cats = ch['categories']; cols = _colors(cid, ch)
    if t == 'climograph':
        temp = next(s for s in ch['series'] if s['name'] == '기온'); prec = next(s for s in ch['series'] if s['name'] == '강수량')
        ax2 = ax.twinx()
        ax2.bar(cats, prec['values'], color='#3677bc', width=0.5)
        ax2.set_ylim(0, 400)
        ax.plot(cats, temp['values'], 'o-', color='#f15a22', ms=4, zorder=5)
        ax.set_ylim(-40, 40); ax.set_xticks(cats)
        ax.set_zorder(ax2.get_zorder() + 1); ax.patch.set_visible(False)
        mm = ch.get('measured')
        if mm:
            ax.plot(cats, mm['기온'], 'x', color='k', ms=5, zorder=6)
            ax2.plot(cats, mm['강수량'], 'x', color='k', ms=5)
        ax.set_ylabel('℃'); ax2.set_ylabel('mm')
    elif t == 'line':
        for s, c in zip(ch['series'], cols): ax.plot(cats, s['values'], color=c, label=s['name'], lw=1.5)
        ax.legend(fontsize=8); ax.grid(alpha=0.3)
    elif t in ('bar', 'groupedBar') and 'y' in ch.get('axes', {}):   # 세로 막대(유럽 U3-7 — 아시아 가로 막대는 axes.x 라 아래 길 그대로)
        n = len(ch['series']); w = 0.8 / n; xs = range(len(cats))
        for k, (s, c) in enumerate(zip(ch['series'], cols)):
            pos = [i - 0.4 + w * (k + 0.5) for i in xs]
            fill = [ch.get('colors', {}).get(str(cat), c) for cat in cats] if n == 1 else c
            ax.bar(pos, s['values'], width=w * 0.9, color=fill, label=s['name'])
            for x, v in zip(pos, s['values']): ax.text(x, v, f'{v:g}', ha='center', va='bottom', fontsize=7)
            m = _measured(s)
            if m: ax.plot(pos, m, 'v', color='k', ms=4)
        ax.set_xticks(list(xs), [str(c) for c in cats], rotation=45, ha='right', fontsize=8)
        ya = ch['axes']['y']; lo = ch['axisBreak'][1] if ch.get('axisBreak') else 0
        ax.set_ylim(lo, lo + ya['step'] * (ya['n'] - 1) if ch.get('axisBreak') else ya['step'] * (ya['n'] - 1))
        if n > 1: ax.legend(fontsize=8)
        ax.grid(axis='y', alpha=0.3)
    elif t == 'bar':
        s = ch['series'][0]
        ax.barh(range(len(cats)), s['values'], color=cols[0])
        ax.set_yticks(range(len(cats)), cats); ax.invert_yaxis()
        for i, v in enumerate(s['values']): ax.text(v, i, f' {v:g}', va='center', fontsize=8)
        ax.set_xlim(0, 600)
    elif t == 'stackedBar' and len(cats) > 1:
        order = ch.get('stackOrder', {})
        for i, cat in enumerate(cats):
            left = 0
            names = order.get(cat) or [s['name'] for s in ch['series']]
            for k, n in enumerate(names):
                s = next(x for x in ch['series'] if x['name'] == n)
                v = s['values'][i]
                if v is None: continue
                ax.barh(i, v, left=left, color=PALETTE[k % len(PALETTE)], edgecolor='white', lw=0.5)
                if v >= 3: ax.text(left + v / 2, i, f'{n}\n{v:g}', ha='center', va='center', fontsize=5.5)
                m = _measured(s)
                if m and m[i] is not None: ax.plot([left + m[i]], [i + 0.42], 'v', color='k', ms=3)
                left += v
        ax.set_yticks(range(len(cats)), cats); ax.invert_yaxis(); ax.set_xlim(0, 100)
    elif t == 'stackedBar':
        bottom = 0
        for k, s in enumerate(reversed(ch['series'])):
            v = s['values'][0]
            ax.bar(0, v, bottom=bottom, color=PALETTE[k % len(PALETTE)], edgecolor='white', width=0.5)
            ax.text(0, bottom + v / 2, f'{s["name"]} {v:g}', ha='center', va='center', fontsize=7)
            bottom += v
        ax.set_xlim(-1, 1); ax.set_xticks([])
    elif t == 'stackedArea':
        order = unit_config()['charts']['items'][cid].get('sheetStackOrder') or [s['name'] for s in reversed(ch['series'])]   # 아래 → 위
        by = {s['name']: s for s in ch['series']}
        cmap = dict(zip([s['name'] for s in ch['series']], cols))
        ys = [[v or 0 for v in by[n]['values']] for n in order]
        ax.stackplot(cats, ys, colors=[cmap[n] for n in order], labels=order)
        for y, v in ch['printed']['totals'].items(): ax.text(int(y), v + 2, str(v), ha='center', fontsize=7)
        ax.legend(fontsize=6, loc='upper left'); ax.set_xlim(cats[0], cats[-1])
    elif t == 'pyramid':
        L, R = ch['series']
        y = range(len(cats))
        ax.barh(y, [-v for v in L['values']], color=cols[0], height=0.85)
        ax.barh(y, R['values'], color=cols[1], height=0.85)
        ax.set_yticks(list(y), cats, fontsize=6)
        lim = max(max(L['values']), max(R['values'])) * 1.1
        ax.set_xlim(-lim, lim)
    elif t == 'radialBar':
        ax.set_aspect('equal'); ax.axis('off')
        for i, cat in enumerate(cats):
            cx = i * 2.4
            for k, (s, c) in enumerate(zip(ch['series'], cols)):
                r = 1.0 - k * 0.22
                v = s['values'][i]
                ax.add_patch(Wedge((cx, 0), r, 90 - 3.6 * v, 90, width=0.2, color=PALETTE[k]))
                ax.text(cx - 1.15, r - 0.1, f'{s["name"]} {v:g}', fontsize=6, ha='right')
            ax.text(cx, 0, cat, ha='center', va='center')
        ax.set_xlim(-2.6, 3.6); ax.set_ylim(-1.2, 1.2)
    elif t == 'pie' and ch.get('ring'):   # 아프리카(U4-7) 고리: 구멍 + 가운데 글자
        vals = [s['values'][0] for s in ch['series']]
        ax.pie(vals, labels=[f'{s["name"]}\n{s["values"][0]:g}' for s in ch['series']], colors=cols, startangle=90, counterclock=False,
               textprops={'fontsize': 8}, wedgeprops={'width': 1 - _ring_ratio(ch), 'edgecolor': 'white'})
        ax.text(0, 0, '\n'.join(ch.get('center', [])), ha='center', va='center', fontsize=9)
    elif t == 'bubbleRow':   # 아프리카(U4-7) 원 크기 줄: 원 넓이 ∝ 값
        vals = ch['series'][0]['values']; vmax = max(vals)
        for i, (n, v) in enumerate(zip(cats, vals)):
            r = 0.45 * (v / vmax) ** 0.5
            ax.add_patch(plt.Circle((i, r), r, color=cols[0]))
            ax.text(i, -0.12, f'{n}\n{v:g}', ha='center', va='top', fontsize=7)
        ax.set_xlim(-0.6, len(cats) - 0.4); ax.set_ylim(-0.5, 1.0); ax.set_aspect('equal'); ax.axis('off')
    elif t == 'pie':
        vals = [s['values'][0] for s in ch['series']]
        ax.pie(vals, labels=[f'{s["name"]}\n{s["values"][0]:g}' for s in ch['series']], colors=cols, startangle=90, counterclock=False,
               textprops={'fontsize': 8})
    elif t == 'table':
        ax.axis('off')
        rows = list(zip(cats, ch['series'][0]['values']))
        tb = ax.table(cellText=[[a, b] for a, b in rows], loc='center', cellLoc='left', colWidths=[0.25, 0.75])
        tb.auto_set_font_size(False); tb.set_fontsize(8)
    ax.set_title(f'{cid}: {ch["title"]}' + (f' — {ch["subtitle"]}' if ch.get('subtitle') else ''), fontsize=8)


def _render_plot(cid, ch, w, h):
    fig, ax = plt.subplots(figsize=(w / 100, h / 100), dpi=100)
    try:
        _plot(cid, ch, ax)
        fig.tight_layout()
        buf = io.BytesIO(); fig.savefig(buf, format='png'); buf.seek(0)
        return Image.open(buf).convert('RGB')
    finally:
        plt.close(fig)


def build_sheets(charts, out_dir):
    os.makedirs(out_dir, exist_ok=True)
    try: font = ImageFont.truetype(FONT_PATH, 18)
    except OSError: font = ImageFont.load_default()
    for pno in sorted({c['page'] for c in charts.values()}):
        rows = []
        for cid, ch in charts.items():
            if ch['page'] != pno: continue
            crop = _crop(ch, out_dir)
            s = ROW_H / crop.height
            crop = crop.resize((max(1, int(crop.width * s)), ROW_H))
            plot = _render_plot(cid, ch, max(560, crop.width), ROW_H)
            row = Image.new('RGB', (crop.width + plot.width + 30, ROW_H + 30), 'white')
            row.paste(crop, (0, 30)); row.paste(plot, (crop.width + 30, 30))
            ImageDraw.Draw(row).text((4, 4), f'{cid}  ({ch["type"]})  — 왼쪽: 교과서 {pno}쪽, 오른쪽: 뽑은 숫자 (× ▼ = 잰 값)', fill='black', font=font)
            rows.append(row)
        W = max(r.width for r in rows); H = sum(r.height for r in rows) + 10 * len(rows)
        sheet = Image.new('RGB', (W, H), 'white')
        y = 0
        for r in rows:
            sheet.paste(r, (0, y)); y += r.height + 10
        out = os.path.join(out_dir, f'charts-{pno}.png')
        sheet.save(out)
        print(f'  대조표 {out} ({len(rows)}개)')
