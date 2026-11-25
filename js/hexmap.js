/* 육각형 지도: 좌표, 이웃, 칸 종류, 이어진 땅 계산 (브라우저·node 공용) */
(function (root) {
  const RADIUS = 3;
  const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
  // 바깥 고리 꼭짓점 6곳 = 모둠 시작 칸 (1~6모둠 순서)
  const START_CORNERS = [[0, -3], [3, -3], [3, 0], [0, 3], [-3, 3], [-3, 0]];

  const id = (q, r) => q + ',' + r;
  const ring = (q, r) => Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));

  function buildMap(teamCount) {
    const cells = {};
    for (let q = -RADIUS; q <= RADIUS; q++)
      for (let r = -RADIUS; r <= RADIUS; r++)
        if (Math.abs(q + r) <= RADIUS)
          cells[id(q, r)] = { id: id(q, r), q, r, ring: ring(q, r), type: 'normal', owner: null, name: '' };

    cells[id(0, 0)].type = 'treasure';
    // 둘째 고리 12칸: 각도 순으로 보물·요새·일반 반복 → 보물 4, 요새 4, 일반 4
    const ring2 = Object.values(cells).filter(c => c.ring === 2)
      .sort((a, b) => angle(a) - angle(b));
    ring2.forEach((c, i) => { c.type = ['treasure', 'fort', 'normal'][i % 3]; });

    START_CORNERS.forEach(([q, r], i) => {
      if (i < teamCount) { const c = cells[id(q, r)]; c.type = 'start'; c.owner = i; }
    });
    return cells;
  }

  function angle(c) {
    const x = Math.sqrt(3) * (c.q + c.r / 2), y = 1.5 * c.r;
    return Math.atan2(y, x);
  }

  function neighbors(cells, cellId) {
    const c = cells[cellId];
    return DIRS.map(([dq, dr]) => cells[id(c.q + dq, c.r + dr)]).filter(Boolean);
  }

  /** 화면 좌표(뾰족한 꼭대기형). size = 중심에서 꼭짓점까지 */
  function toPixel(c, size) {
    return { x: size * Math.sqrt(3) * (c.q + c.r / 2), y: size * 1.5 * c.r };
  }
  function hexPoints(cx, cy, size) {
    const pts = [];
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 180 * (60 * i - 30);
      pts.push((cx + size * Math.cos(a)).toFixed(1) + ',' + (cy + size * Math.sin(a)).toFixed(1));
    }
    return pts.join(' ');
  }

  /** 모둠의 가장 크게 이어진 땅 칸 수 */
  function largestRegion(cells, team) {
    const seen = new Set(); let best = 0;
    for (const c of Object.values(cells)) {
      if (c.owner !== team || seen.has(c.id)) continue;
      let size = 0; const stack = [c.id]; seen.add(c.id);
      while (stack.length) {
        const cur = stack.pop(); size++;
        for (const n of neighbors(cells, cur))
          if (n.owner === team && !seen.has(n.id)) { seen.add(n.id); stack.push(n.id); }
      }
      best = Math.max(best, size);
    }
    return best;
  }

  const api = { RADIUS, START_CORNERS, id, buildMap, neighbors, toPixel, hexPoints, largestRegion };
  if (typeof module !== 'undefined') module.exports = api; else root.HexMap = api;
})(this);
