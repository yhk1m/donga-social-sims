// scripts/vite-topic-titles.mjs — Vite 플러그인: `…/topics.json?titles` 로 가져오면 주제 제목·쪽만 남긴 작은 JSON 이 된다.
//   「사회과부도 모음」 조각(sims/atlas-hub)이 단원마다 topics.json(약 45 KB)을 통째로 싣지 않게 하려는 것.
//   build-embed.mjs(조각 빌드)와 vite.config.js(개발 서버) 둘 다에 넣는다.
import { topicTitles } from '../src/atlas/hubData.js';

export function topicTitlesPlugin() {
  return {
    name: 'atlas-topic-titles',
    enforce: 'pre', // vite:json 보다 먼저(원문 JSON 을 줄인 뒤 JSON 모듈로)
    transform(code, id) {
      if (!/[\\/]topics\.json\?titles$/.test(id)) return null;
      return { code: JSON.stringify(topicTitles(JSON.parse(code))), map: null };
    },
  };
}
