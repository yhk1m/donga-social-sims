// © 2026 김용현
// src/atlas/americasExtra.js — 아메리카(U5-3)에서 처음 쓰는 엔진 기능. installAmericasExtras() 를 부른 단원 조각에만 들어간다
//   (fitCore.registerFamily 등 등록 자리에 등록 — 부르지 않는 u2·u3·u4 조각은 코드도 크기도 그대로. chartsExtra.js 와 같은 길).
//   - 3a 평사(stereographic — 40·41쪽 입체 투영)·정사(orthographic — 46쪽 지구본) 도법: installAmericasFamilies()
//     파이프라인(scripts/atlas/georef.mjs)은 불러올 때 이것만 늘 부른다(Node 라 크기 상관없음). u2 지도 후보는 PHASE1_FAMILIES 고정이라 안 들어감.
//   단원 main.js: import { installAmericasExtras } from '../../src/atlas/americasExtra.js'; installAmericasExtras();  (mountAtlas 전에)
import { geoStereographic, geoOrthographic } from 'd3-geo';
import { registerFamily } from './fitCore.js';

/** 3a: 평사·정사 도법 등록. 매개변수 p = [중심 경도, 중심 위도](방위 도법과 같은 꼴). */
export function installAmericasFamilies() {
  registerFamily('stereographic', (p) => geoStereographic().rotate([-p[0], -p[1]]));
  registerFamily('orthographic', (p) => geoOrthographic().rotate([-p[0], -p[1]]).clipAngle(90));
}

/** 아메리카 단원 조각의 모든 등록(뒤 하위 기능이 여기에 더함). */
export function installAmericasExtras() {
  installAmericasFamilies();
}
