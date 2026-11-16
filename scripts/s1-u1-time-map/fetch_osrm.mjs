// © 2026 김용현
// 서울 → 각 도시 자동차 경로 시간·도로 거리(OSRM, OpenStreetMap 도로망) 내려받기.
// 공개 시험 서버(router.project-osrm.org)에 도시 좌표만 보낸다. 결과는 C:\Users\Public\sims-work\s1-u1-time-map\osrm_table.json 에 저장(커밋 안 함).
// 사용: node scripts/s1-u1-time-map/fetch_osrm.mjs
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { CITIES } from './cities.mjs';

const OUT = 'C:/Users/Public/sims-work/s1-u1-time-map/osrm_table.json';
if (existsSync(OUT) && !process.argv.includes('--force')) {
  console.log('이미 있음(다시 받으려면 --force):', OUT);
  console.log(readFileSync(OUT, 'utf8').slice(0, 300));
  process.exit(0);
}
const coords = CITIES.map((c) => `${c.lon},${c.lat}`).join(';');
const url = `https://router.project-osrm.org/table/v1/driving/${coords}?sources=0&annotations=duration,distance`;
const res = await fetch(url, { headers: { 'User-Agent': 'school-map-sim/1.0' } });
if (!res.ok) throw new Error(`OSRM ${res.status}`);
const j = await res.json();
if (j.code !== 'Ok') throw new Error(`OSRM code ${j.code}`);
const rows = CITIES.map((c, i) => ({
  id: c.id, name: c.name,
  durationS: j.durations[0][i], distanceM: j.distances[0][i],
  snapped: j.destinations[i].location, snapDistM: j.destinations[i].distance,
}));
writeFileSync(OUT, JSON.stringify({ fetched: new Date().toISOString(), url, rows }, null, 1));
for (const r of rows) console.log(r.name, Math.round(r.durationS / 60), 'min', Math.round(r.distanceM / 1000), 'km', 'snap', Math.round(r.snapDistM), 'm');
