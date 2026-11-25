/* TV·학생 화면 공통: 모둠 정보, 땅 이름, 지도 그리기 */
(function (root) {
  const TEAMS = [
    { name: '냥이', animal: '갓 쓴 고양이', color: '#F2708A', soft: '#FDE3E8', ink: '#A3243F' },
    { name: '멍이', animal: '투구 쓴 강아지', color: '#4FA8EE', soft: '#DFF0FD', ink: '#1F5F94' },
    { name: '토끼', animal: '금관 쓴 토끼', color: '#33C39B', soft: '#DDF6EE', ink: '#16775B' },
    { name: '곰돌', animal: '사또 모자 곰', color: '#9A82E8', soft: '#ECE7FC', ink: '#57409E' },
    { name: '오리', animal: '족두리 쓴 오리', color: '#F5962F', soft: '#FEEBD7', ink: '#9A5410' },
    { name: '햄찌', animal: '장수 투구 햄스터', color: '#E2BA12', soft: '#FBF3CF', ink: '#7D6500' }
  ];
  const teamLabel = t => `${t + 1}모둠 ${TEAMS[t].name}`;

  // 칸 이름(시험범위 키워드). 보물 칸은 핵심 사건
  const TREASURE_NAMES = ['프랑스 혁명', '산업 혁명', '메이지 유신', '신해혁명', '냉전'];
  const FORT_NAMES = ['빈 체제', '요크타운', 'NATO', '베를린 장벽'];
  const NORMAL_NAMES = ['보스턴 차 사건', '독립 선언', '삼부회', '테니스코트', '바스티유', '인권 선언', '공포 정치', '나폴레옹',
    '대륙 봉쇄령', '7월 혁명', '차티스트', '농노 해방', '가리발디', '비스마르크', '사회 진화론', '아편 전쟁', '태평천국',
    '양무운동', '변법자강', '의화단', '청일 전쟁', '사라예보', '러시아 혁명', '바이마르', '뉴딜', '마셜 계획', '반둥 회의', '민권법'];

  function buildNamedMap(teamCount) {
    const cells = HexMap.buildMap(teamCount);
    let ti = 0, fi = 0, ni = 0;
    Object.values(cells).sort((a, b) => a.ring - b.ring || a.q - b.q || a.r - b.r).forEach(c => {
      if (c.type === 'treasure') c.name = TREASURE_NAMES[ti++ % TREASURE_NAMES.length];
      else if (c.type === 'fort') c.name = FORT_NAMES[fi++ % FORT_NAMES.length];
      else if (c.type === 'start') c.name = '출발';
      else c.name = NORMAL_NAMES[ni++ % NORMAL_NAMES.length];
    });
    return cells;
  }

  const SVGNS = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs, parent) => {
    const e = document.createElementNS(SVGNS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  };

  // 섬 둘레 바다에 놓는 소품 (TV·설명 화면에서만): [그림, 가운데 x, 가운데 y, 크기]
  const DECOR = [
    ['deco_palm', -345, -120, 120], ['deco_rocks', -360, 130, 96], ['deco_shells', -255, 235, 76],
    ['deco_lighthouse', 350, -115, 130], ['deco_ship', 345, 150, 124], ['deco_gull', 250, -228, 84]
  ];

  /**
   * 지도 그리기.
   * opts: { owners:{id:team}, legal:[ids], selected:id, votes:{id:n}, onPick(id), highlight:id, showNames, decor }
   */
  function drawMap(svg, cells, opts) {
    opts = opts || {};
    const size = 46;
    // 타일 그림(images/tile_*.png, 200×214)의 윗면을 정육각형에 맞춘다: 윗면 높이 = 2R, 그림 높이는 두께까지 조금 더
    const RT = size - 1.5, TW = Math.sqrt(3) * RT, TH = 2 * RT * (214 / 199.7);
    const w = opts.decor ? 860 : size * Math.sqrt(3) * 7 + 44;
    const h = size * 1.5 * 6 + size * 2 + 52;
    svg.setAttribute('viewBox', `${-w / 2} ${-h / 2} ${w} ${h}`);
    svg.innerHTML = '';
    const legal = new Set(opts.legal || []);

    if (opts.decor) {
      const d = el('g', { 'aria-hidden': 'true' }, svg);
      DECOR.forEach(([name, x, y, s], k) => el('image', { href: `images/${name}.png`, x: x - s / 2, y: y - s / 2, width: s, height: s, class: 'decor', style: `animation-delay:${k * 0.6}s` }, d));
    }
    // 섬 테두리(모래사장): 모든 칸을 조금 크게 한 번 더 그려 아래에 깐다
    const island = el('g', { 'aria-hidden': 'true' }, svg);
    for (const c of Object.values(cells)) {
      const { x, y } = HexMap.toPixel(c, size);
      el('polygon', { points: HexMap.hexPoints(x, y + 4, size + 9), fill: '#F7E3B5', stroke: '#F7E3B5', 'stroke-width': 10, 'stroke-linejoin': 'round' }, island);
    }
    // 위쪽 줄부터 그려야 아래 칸이 위 칸의 두께를 자연스럽게 덮는다
    const order = Object.values(cells).sort((a, b) => a.r - b.r || a.q - b.q);
    for (const c of order) {
      const owner = opts.owners ? (opts.owners[c.id] ?? null) : c.owner;
      const mine = owner !== null && owner !== undefined;
      const { x, y } = HexMap.toPixel(c, size);
      const g = el('g', { class: 'cell' + (legal.has(c.id) ? ' legal' : '') + (opts.selected === c.id ? ' selected' : '') + (opts.highlight === c.id ? ' hl' : ''), 'data-id': c.id }, svg);
      const tile = mine ? `t${owner + 1}` : c.type === 'treasure' ? 'treasure' : c.type === 'fort' ? 'fort' : 'empty';
      el('image', { href: `images/tile_${tile}.png`, x: x - TW / 2, y: y - RT, width: TW, height: TH, preserveAspectRatio: 'none' }, g);
      // 반짝임 테두리·누르는 자리 (보이지 않는 육각형)
      el('polygon', { points: HexMap.hexPoints(x, y, RT - 2), fill: 'transparent', stroke: 'none', 'stroke-linejoin': 'round', class: 'hex' }, g);

      // 칸 종류 표시 (images/ 의 아이콘)
      const ic = c.type === 'treasure' ? 'star' : c.type === 'fort' ? 'wall' : (c.type === 'start' && mine) ? 'flag' : null;
      if (ic) el('image', { href: `images/${ic}.png`, x: x - 15, y: y - 32, width: 30, height: 30 }, g);
      if (opts.showNames !== false) {
        const t = el('text', { x, y: y + (c.type === 'normal' ? 5 : 14), 'text-anchor': 'middle', class: 'cname' + (mine ? ' on' : '') }, g);
        t.textContent = c.name.length > 6 ? c.name.slice(0, 5) + '…' : c.name;
      }
      if (opts.votes && opts.votes[c.id]) {
        el('circle', { cx: x + size * 0.55, cy: y - size * 0.55, r: 13, fill: '#3B3561' }, g);
        const v = el('text', { x: x + size * 0.55, y: y - size * 0.55 + 5, 'text-anchor': 'middle', fill: '#fff', 'font-size': 15, 'font-weight': 700 }, g);
        v.textContent = opts.votes[c.id];
      }
      if (opts.onPick && legal.has(c.id)) g.addEventListener('click', () => opts.onPick(c.id));
    }
  }
  /** 임시 캐릭터(도형). 진짜 그림은 images/team1.png ~ team6.png 를 넣으면 자동 교체 */
  function critterSVG(team, mood) {
    const T = TEAMS[team], ink = '#3B3561', c = T.color;
    const st = `stroke="${ink}" stroke-width="3" stroke-linejoin="round"`;
    const ears = [
      `<path d="M27 45 L30 18 L48 34 Z" fill="${c}" ${st}/><path d="M73 45 L70 18 L52 34 Z" fill="${c}" ${st}/>`,
      `<ellipse cx="22" cy="58" rx="9" ry="17" fill="${T.ink}" ${st}/><ellipse cx="78" cy="58" rx="9" ry="17" fill="${T.ink}" ${st}/>`,
      `<ellipse cx="38" cy="18" rx="7" ry="20" fill="${c}" ${st}/><ellipse cx="62" cy="18" rx="7" ry="20" fill="${c}" ${st}/>`,
      `<circle cx="27" cy="35" r="10" fill="${c}" ${st}/><circle cx="73" cy="35" r="10" fill="${c}" ${st}/>`,
      ``,
      `<circle cx="29" cy="36" r="8" fill="#F7B6C2" ${st}/><circle cx="71" cy="36" r="8" fill="#F7B6C2" ${st}/>`
    ][team];
    const hats = [
      `<ellipse cx="50" cy="33" rx="34" ry="6" fill="#2B2640" ${st}/><rect x="38" y="14" width="24" height="19" rx="6" fill="#2B2640" ${st}/>`,
      `<path d="M24 44 A26 24 0 0 1 76 44 Z" fill="#B9C0CC" ${st}/><path d="M50 20 V8" ${st}/><circle cx="50" cy="8" r="4" fill="#E0526B" ${st}/>`,
      `<path d="M33 36 L33 20 L41 28 L50 16 L59 28 L67 20 L67 36 Z" fill="#FFD84D" ${st}/>`,
      `<rect x="32" y="20" width="36" height="18" rx="8" fill="#2B2640" ${st}/><rect x="18" y="30" width="16" height="7" rx="3" fill="#2B2640" ${st}/><rect x="66" y="30" width="16" height="7" rx="3" fill="#2B2640" ${st}/>`,
      `<path d="M38 32 L40 20 L50 26 L60 20 L62 32 Z" fill="#2B2640" ${st}/><circle cx="50" cy="20" r="4" fill="#E0526B" ${st}/>`,
      `<path d="M26 42 A24 22 0 0 1 74 42 Z" fill="#9A5410" ${st}/><path d="M50 21 C 56 6, 70 6, 72 14 C 64 12, 58 16, 50 21 Z" fill="#E0526B" ${st}/>`
    ][team];
    const happy = mood === 'happy';
    const eyes = happy
      ? `<path d="M36 58 Q41 52 46 58" fill="none" ${st} stroke-linecap="round"/><path d="M54 58 Q59 52 64 58" fill="none" ${st} stroke-linecap="round"/>`
      : `<circle cx="41" cy="57" r="4" fill="${ink}"/><circle cx="59" cy="57" r="4" fill="${ink}"/><circle cx="42.5" cy="55.5" r="1.3" fill="#fff"/><circle cx="60.5" cy="55.5" r="1.3" fill="#fff"/>`;
    const mouth = team === 4
      ? `<ellipse cx="50" cy="68" rx="10" ry="6" fill="#F5962F" ${st}/>`
      : `<path d="M44 66 Q47 70 50 66 Q53 70 56 66" fill="none" ${st} stroke-linecap="round"/>`;
    return `<svg viewBox="0 0 100 100" aria-hidden="true">${ears}<circle cx="50" cy="60" r="28" fill="${team === 4 ? '#FFF6E0' : c}" ${st}/>` +
      `<ellipse cx="33" cy="66" rx="5" ry="3.5" fill="#FF9DB0" opacity=".8"/><ellipse cx="67" cy="66" rx="5" ry="3.5" fill="#FF9DB0" opacity=".8"/>` +
      `${eyes}${mouth}${hats}</svg>`;
  }

  function avatar(team, sizePx, mood) {
    const d = document.createElement('div');
    d.className = 'avatar';
    d.style.cssText = `width:${sizePx}px;height:${sizePx}px;background:${TEAMS[team].soft}`;
    d.innerHTML = critterSVG(team, mood);
    d.title = TEAMS[team].animal;
    // 진짜 그림: 기쁜 표정 → 기본 그림 → (없으면) 임시 도형 순서로 시도
    const tries = mood === 'happy' ? [`images/team${team + 1}_happy.png`, `images/team${team + 1}.png`] : [`images/team${team + 1}.png`];
    const img = new Image();
    img.alt = TEAMS[team].animal;
    img.onload = () => { d.innerHTML = ''; d.classList.add('has-img'); d.appendChild(img); };
    img.onerror = () => { tries.shift(); if (tries.length) img.src = tries[0]; };
    img.src = tries[0];
    return d;
  }

  const PRACTICE_Q = { no: '연습', unit: '연습', level: '하', type: 'OX', text: '연습 문제! 이 게임은 역사 복습 게임이다.', choices: [], answer: 'O', accept: [], explain: '맞아요. 이제 코인을 걸어 볼까요? (연습 라운드는 점수에 들어가지 않아요)' };

  const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* 효과음 (직접 합성, 파일 필요 없음) */
  let actx = null;
  const sound = { on: true };
  function tone(freq, dur, type, when, vol) {
    if (!sound.on) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const t0 = actx.currentTime + (when || 0);
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = type || 'sine'; o.frequency.value = freq;
      g.gain.setValueAtTime(vol || 0.12, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      o.connect(g).connect(actx.destination); o.start(t0); o.stop(t0 + dur + 0.02);
    } catch (e) { /* 소리 못 내는 환경 */ }
  }
  const SFX = {
    coin: () => { tone(988, .08, 'square', 0, .06); tone(1319, .25, 'square', .08, .06); },
    pop: () => tone(620, .14, 'triangle', 0, .18),
    tap: () => tone(520, .06, 'triangle', 0, .12),
    tick: () => tone(880, .05, 'sine', 0, .05),
    drum: () => { for (let i = 0; i < 8; i++) tone(110 + i * 12, .07, 'triangle', i * .13, .22); },
    win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, .28, 'triangle', i * .1, .14)),
    ok: () => { tone(784, .12, 'triangle', 0, .14); tone(1047, .22, 'triangle', .1, .14); },
    no: () => { tone(330, .15, 'sine', 0, .14); tone(262, .25, 'sine', .12, .14); }
  };

  /* 배경 그림이 있으면 자동 사용 */
  (function () {
    const bg = new Image();
    bg.onload = () => { if (!document.body.hasAttribute('data-nobg')) document.body.classList.add('has-bg'); };
    bg.src = 'images/background.jpg';
  })();

  root.Common = { TEAMS, teamLabel, buildNamedMap, drawMap, avatar, critterSVG, PRACTICE_Q, h, esc, SFX, sound };
})(window);
