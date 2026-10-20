# © 2026 김용현
# scripts/atlas/build_natural.py — 자연색 지형 화상(교사 요청 「20쪽 지형은 교과서처럼」): Natural Earth II(NE2_50M_SR_W, 음영·물 포함) → 등장방형 4096×2048 JPEG
#   python -I scripts/atlas/build_natural.py          → 설정 natural.out (docs/assets/atlas/common/natural-4096.jpg) + 크기·sha256
#   python -I scripts/atlas/build_natural.py --check  → 만들지 않고 지금 파일이 입력·설정과 같은지만(다르면 종료 코드 1)
# 설정: scripts/atlas/config/u2.json 의 natural = {src: {file, url, source, licence}, width, height, quality, out, maxBytes}
# 입력: NE2_50M_SR_W.tif(설정 natural.src.file) — 10800×5400 RGB 8비트, WGS84 경위도, −180..180 · 90..−90(1/30°). 교과서 20쪽 지형 지도(「naturalearthdata.com, 2023」)와 같은 계열. NE1 은 인도·중국 동부가 노랗게 나와 교과서 초록에 가까운 NE2 를 씀(결정 기록).
# 격자: relief-4096.jpg·tint-4096.png 와 같은 전 지구 등장방형(앱이 같은 역투영 표본으로 뽑음). 줄이기 = PIL LANCZOS(음영 화상과 같음).
# JPEG: 4:2:0, optimize, progressive 아님(브라우저가 한 번에 풀고 getImageData 로 읽음). ICC 없음(색 관리로 값이 바뀌지 않게).
import os, sys, hashlib, io
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from atlas_common import unit_config, stamp_path, REPO

RELIEF = 'docs/assets/atlas/common/relief-4096.jpg'  # 같은 격자여야 한다
CHECK_TOL = 0.5  # --check: 다시 만든 JPEG 를 푼 값과 지금 파일을 푼 값의 평균 차(0~255) 허용 — 같은 PIL 이면 0


def validate(n, relief_size=None):
    """설정 natural 확인 — 틀린 곳 목록(빈 목록이면 통과)."""
    bad = []
    if relief_size and tuple(relief_size) != (n['width'], n['height']):
        bad.append(f"크기 {n['width']}×{n['height']} ≠ 음영 화상 {relief_size[0]}×{relief_size[1]}")
    if n['width'] != 2 * n['height']: bad.append(f"등장방형이 아님: {n['width']}×{n['height']}")
    if not (50 <= n['quality'] <= 95): bad.append(f"quality {n['quality']} 가 50~95 밖")
    if not str(n['out']).endswith('.jpg'): bad.append(f"out 은 .jpg: {n['out']}")
    if n['maxBytes'] <= 0: bad.append('maxBytes 는 양수')
    return bad


def check_source(src):
    """rasterio 데이터셋 → 틀린 곳 목록: 3 밴드 uint8, 경위도, 전 지구."""
    bad = []
    if src.count < 3: bad.append(f'밴드 {src.count}개 — RGB 3 개가 아님')
    if any(d != 'uint8' for d in src.dtypes[:3]): bad.append(f'자료형 {src.dtypes} — uint8 아님')
    if src.crs and not src.crs.is_geographic: bad.append(f'좌표계가 경위도가 아님: {src.crs}')
    b = src.bounds
    if abs(b.left + 180) > 0.01 or abs(b.right - 180) > 0.01 or abs(b.top - 90) > 0.01 or abs(b.bottom + 90) > 0.01:
        bad.append(f'범위가 전 지구가 아님: {b}')
    return bad


def read_source(n):
    import rasterio
    with rasterio.open(stamp_path(n['src']['file'])) as src:
        bad = check_source(src)
        if bad: raise SystemExit('입력 오류: ' + ' / '.join(bad))
        rgb = src.read([1, 2, 3])  # (3, H, W)
    return np.ascontiguousarray(np.moveaxis(rgb, 0, -1))


def resize(rgb, n):
    from PIL import Image
    return Image.fromarray(rgb, mode='RGB').resize((n['width'], n['height']), Image.LANCZOS)


def encode(im, n):
    buf = io.BytesIO()
    im.save(buf, format='JPEG', quality=n['quality'], optimize=True, subsampling='4:2:0')
    return buf.getvalue()


def decode(data):
    from PIL import Image
    return np.asarray(Image.open(io.BytesIO(data)).convert('RGB')).astype(np.int16)


def main(argv):
    if hasattr(sys.stdout, 'reconfigure'): sys.stdout.reconfigure(encoding='utf-8')
    from PIL import Image
    n = unit_config()['natural']
    bad = validate(n, Image.open(os.path.join(REPO, RELIEF)).size)
    if bad: raise SystemExit('설정 natural 오류: ' + ' / '.join(bad))
    out = os.path.join(REPO, n['out'])
    if '--check' in argv and not os.path.exists(out):
        print(f"없음: {n['out']} — python -I scripts/atlas/build_natural.py 로 만들기"); return 1
    data = encode(resize(read_source(n), n), n)
    if '--check' in argv:
        cur = open(out, 'rb').read()
        a, b = decode(cur), decode(data)
        diff = float(np.abs(a - b).mean()) if a.shape == b.shape else float('inf')
        size = len(cur)
        same, over = diff <= CHECK_TOL, size > n['maxBytes']
        print('같음' if same else f'다름(평균 차 {diff:.2f}) — python -I scripts/atlas/build_natural.py 로 다시 만들기',
              f'· {size:,} B' + (f' > maxBytes {n["maxBytes"]:,}' if over else ''))
        return 0 if same and not over else 1
    if len(data) > n['maxBytes']: raise SystemExit(f'용량 {len(data):,} B > maxBytes {n["maxBytes"]:,} — quality 를 낮추기')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, 'wb') as f: f.write(data)
    sha = hashlib.sha256(data).hexdigest()[:12]
    print(f"{n['out']} {n['width']}×{n['height']} q{n['quality']} {len(data):,} B sha256 {sha}")
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
