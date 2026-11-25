/* 땅따먹기 규칙: 코인 지급, 걸 수 있는 칸, 입찰 판정, 점수 (브라우저·node 공용) */
(function (root) {
  const HexMap = root.HexMap || require('./hexmap.js');

  const CELL_POINT = { normal: 1, fort: 1, start: 1, treasure: 3 };
  const REGION_BONUS = 5;
  const COOP_RATE = 0.7, COOP_COINS = 3, ALL_CORRECT_COINS = 2;

  const MISSIONS = [
    { id: 'treasure2', text: '보물 칸 2개 이상 차지하기', bonus: 5, check: (cells, t) => count(cells, t, 'treasure') >= 2 },
    { id: 'fort2', text: '요새 칸 2개 이상 차지하기', bonus: 4, check: (cells, t) => count(cells, t, 'fort') >= 2 },
    { id: 'region6', text: '땅 6칸 이상 이어 붙이기', bonus: 3, check: (cells, t) => HexMap.largestRegion(cells, t) >= 6 },
    { id: 'center', text: '끝날 때 가운데 보물 칸 차지하기', bonus: 4, check: (cells, t) => cells['0,0'].owner === t },
    { id: 'land8', text: '땅 8칸 이상 갖기', bonus: 3, check: (cells, t) => count(cells, t) >= 8 },
    { id: 'ring1', text: '가운데를 둘러싼 첫째 고리 칸 2개 이상', bonus: 4, check: (cells, t) => Object.values(cells).filter(c => c.ring === 1 && c.owner === t).length >= 2 }
  ];

  function count(cells, team, type) {
    return Object.values(cells).filter(c => c.owner === team && (!type || c.type === type)).length;
  }

  /** 문제 결과 → 모둠별 코인. results: [{team, correct}] (접속 중인 학생만) */
  function coinsFromAnswers(results, teamCount) {
    const out = [];
    for (let t = 0; t < teamCount; t++) {
      const mine = results.filter(r => r.team === t);
      const right = mine.filter(r => r.correct).length;
      const all = mine.length > 0 && right === mine.length;
      out.push({ team: t, right, total: mine.length, allCorrect: all, coins: right + (all ? ALL_CORRECT_COINS : 0) });
    }
    const total = results.length, right = results.filter(r => r.correct).length;
    const coop = total > 0 && right / total >= COOP_RATE;
    if (coop) out.forEach(o => { o.coins += COOP_COINS; });
    return { perTeam: out, classRate: total ? right / total : 0, coop };
  }

  const protectedCell = c => c.type === 'fort' || c.type === 'start';

  /** 이 모둠이 이번 라운드에 걸 수 있는 칸 id 목록 (자기 칸 = 수비용 포함) */
  function legalTargets(cells, team) {
    const set = new Set();
    for (const c of Object.values(cells)) {
      if (c.owner !== team) continue;
      if (!protectedCell(c)) set.add(c.id); // 내 칸 수비
      for (const n of HexMap.neighbors(cells, c.id)) {
        if (n.owner === null) set.add(n.id);
        else if (n.owner !== team && !protectedCell(n)) set.add(n.id);
      }
    }
    const attack = [...set].filter(i => cells[i].owner !== team);
    if (attack.length === 0) // 막혔으면 아무 빈 칸
      Object.values(cells).forEach(c => { if (c.owner === null) set.add(c.id); });
    return [...set];
  }

  function landScore(cells, team) {
    return Object.values(cells).reduce((s, c) => s + (c.owner === team ? CELL_POINT[c.type] : 0), 0);
  }

  /**
   * 입찰 판정. bids: {team: {cell, coins}} (coins ≥ 1 인 것만 유효)
   * - 칸마다 가장 많이 건 모둠이 획득. 빼앗으려면 주인이 같은 칸에 건 것보다 많아야 함
   * - 공격자끼리 동점: 땅 점수 낮은 모둠 → 그래도 같으면 무작위
   * 반환: 칸별 결과 배열(공개 연출 순서) + 바뀐 cells. 건 코인은 모두 사라짐
   */
  function resolveBids(cells, bids, teamsCoins, rng) {
    rng = rng || Math.random;
    const next = JSON.parse(JSON.stringify(cells));
    const coins = teamsCoins.slice();
    const byCell = {};
    for (const [tStr, b] of Object.entries(bids)) {
      const t = Number(tStr);
      if (!b || !b.cell || !(b.coins >= 1)) continue;
      const amount = Math.min(b.coins, coins[t]);
      if (amount < 1) continue;
      if (!legalTargets(cells, t).includes(b.cell)) continue;
      coins[t] -= amount;
      (byCell[b.cell] = byCell[b.cell] || []).push({ team: t, coins: amount });
    }
    const scores = teamsCoins.map((_, t) => landScore(cells, t));
    const results = [];
    for (const [cellId, list] of Object.entries(byCell)) {
      const owner = cells[cellId].owner;
      const defense = list.find(x => x.team === owner);
      const attackers = list.filter(x => x.team !== owner);
      let winner = owner;
      if (attackers.length) {
        const top = Math.max(...attackers.map(a => a.coins));
        let cands = attackers.filter(a => a.coins === top);
        const low = Math.min(...cands.map(c => scores[c.team]));
        cands = cands.filter(c => scores[c.team] === low);
        const pick = cands[Math.floor(rng() * cands.length)];
        if (!defense || pick.coins > defense.coins) winner = pick.team;
      }
      if (winner !== owner) next[cellId].owner = winner;
      results.push({ cell: cellId, bids: list, before: owner, winner, changed: winner !== owner });
    }
    // 공개 순서: 보물 → 빼앗기 → 일반, 경쟁이 치열한 칸을 나중에
    const w = r => (cells[r.cell].type === 'treasure' ? 2 : 0) + (r.before !== null ? 1 : 0) + r.bids.length;
    results.sort((a, b) => w(a) - w(b));
    return { cells: next, coins, results };
  }

  /** 최종 점수: 땅 + 가장 크게 이어진 땅 보너스(동점이면 모두) + 비밀 미션 */
  function finalScores(cells, teamCount, missions) {
    const regions = [];
    for (let t = 0; t < teamCount; t++) regions.push(HexMap.largestRegion(cells, t));
    const maxRegion = Math.max(...regions);
    const out = [];
    for (let t = 0; t < teamCount; t++) {
      const m = missions && missions[t] ? MISSIONS.find(x => x.id === missions[t]) : null;
      const missionOk = m ? m.check(cells, t) : false;
      const land = landScore(cells, t);
      const region = regions[t] === maxRegion && maxRegion > 0 ? REGION_BONUS : 0;
      out.push({ team: t, land, region, mission: missionOk ? m.bonus : 0, missionText: m ? m.text : '', total: land + region + (missionOk ? m.bonus : 0) });
    }
    return out;
  }

  function dealMissions(teamCount, rng) {
    rng = rng || Math.random;
    const pool = MISSIONS.map(m => m.id);
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    return Array.from({ length: teamCount }, (_, t) => pool[t % pool.length]);
  }

  /** 문제 뽑기: 사용 안 한 것 중에서, 마지막 라운드는 '상' */
  function pickQuestions(bank, rounds, rng) {
    rng = rng || Math.random;
    const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
    const pool = shuffle(bank.filter(q => !q.games || q.games.includes('땅')));
    const hard = pool.find(q => q.level === '상');
    const rest = pool.filter(q => q !== hard).slice(0, rounds - (hard ? 1 : 0));
    return hard ? [...rest, hard] : rest;
  }

  const api = { CELL_POINT, MISSIONS, coinsFromAnswers, legalTargets, landScore, resolveBids, finalScores, dealMissions, pickQuestions };
  if (typeof module !== 'undefined') module.exports = api; else root.Rules = api;
})(this);
