/* TV(진행) 화면. 게임 상태는 이 화면만 바꾼다. */
(function () {
  const { TEAMS, teamLabel, buildNamedMap, drawMap, avatar, critterSVG, PRACTICE_Q, esc, SFX, sound } = Common;
  const db = Backend.create();
  const $ = s => document.querySelector(s);
  const params = new URLSearchParams(location.search);
  const FAST = params.has('fast'); // 시험용: 시간을 짧게
  const SPEED = FAST ? 0.2 : 1;
  const BID_SECONDS = 30;
  const STEP_MS = 3400 * (FAST ? 0.4 : 1);
  const now = () => Date.now();
  const pick = a => a[Math.floor(Math.random() * a.length)];

  let G = null;
  const unsub = {};
  const R = p => `rooms/${G.code}/${p}`;

  function show(id) { document.querySelectorAll('section.screen').forEach(s => s.classList.toggle('hidden', s.id !== id)); }
  function listen(name, path, cb) { if (unsub[name]) unsub[name](); unsub[name] = db.on(path, cb); }

  /* ---------------- 시작 화면 ---------------- */
  function bankInfo() {
    const b = Grade.parseBank($('#bank').value);
    $('#bankInfo').textContent = b.length ? `→ ${b.length}문항 읽음 (하 ${b.filter(q => q.level === '하').length} · 중 ${b.filter(q => q.level === '중').length} · 상 ${b.filter(q => q.level === '상').length})` : '';
  }
  function initSetup() {
    $('#setupCritters').innerHTML = [0, 1, 2, 3, 4, 5].map(t => `<span style="width:54px;height:54px;display:inline-block">${critterSVG(t)}</span>`).join('');
    $('#modeInfo').textContent = db.mode === 'demo' ? '지금은 데모 모드예요 (Firebase 설정 전: 이 컴퓨터의 창끼리만 연결)' : '실제 접속 모드 (Firebase 연결됨)';
    $('#bank').addEventListener('input', bankInfo);
    fetch(encodeURI('questions/문제은행_초안.tsv')).then(r => r.ok ? r.text() : '').then(t => {
      if (t && !$('#bank').value.trim()) { $('#bank').value = t; bankInfo(); }
    }).catch(() => {});
    if (params.has('bots')) $('#bots').checked = true;
    try {
      const saved = JSON.parse(localStorage.getItem('tg-host') || 'null');
      if (saved && saved.phase !== 'final') {
        $('#resumeBox').classList.remove('hidden');
        $('#btnResume').onclick = () => resume(saved);
        $('#btnDiscard').onclick = () => { localStorage.removeItem('tg-host'); $('#resumeBox').classList.add('hidden'); };
      }
    } catch (e) { /* 저장된 게임 없음 */ }
    $('#btnCreate').onclick = createRoom;
    bankInfo();
  }

  function createRoom() {
    const bank = Grade.parseBank($('#bank').value);
    const teamCount = +$('#teamCount').value, rounds = +$('#rounds').value;
    const usable = bank.filter(q => !q.games || q.games.includes('땅'));
    if (usable.length < rounds) { alert(`문제가 부족해요. (필요 ${rounds}개, 있는 문제 ${usable.length}개)`); return; }
    const cells = buildNamedMap(teamCount);
    G = {
      code: String(1000 + Math.floor(Math.random() * 9000)), teamCount, totalRounds: rounds,
      qs: Rules.pickQuestions(bank, rounds), missions: Rules.dealMissions(teamCount),
      owners: ownersOf(cells), coins: Array(teamCount).fill(0), round: 0, phase: 'lobby',
      players: {}, answers: {}, votes: {}, bids: {}, stats: {}, extraAccept: [], bots: $('#bots').checked
    };
    db.set(R('missions'), G.missions.map(id => Rules.MISSIONS.find(m => m.id === id).text));
    if (G.bots) addBots();
    enterLobby();
  }

  function addBots() {
    for (let t = 0; t < G.teamCount; t++)
      for (let n = 1; n <= 4; n++) {
        const key = `${t}-b${n}`;
        G.players[key] = { team: t, no: 90 + n, bot: true };
        db.set(R(`players/${key}`), G.players[key]);
      }
  }

  /* ---------------- 대기 화면 ---------------- */
  function joinUrl() {
    const base = location.href.split('?')[0].replace(/host\.html$/, '');
    return `${base}play.html?room=${G.code}${FAST ? '&fast' : ''}`;
  }
  function enterLobby() {
    show('lobby');
    $('#roomCode').textContent = G.code;
    $('#joinUrl').textContent = joinUrl();
    $('#qr').innerHTML = '';
    if (window.QRCode) new QRCode($('#qr'), { text: joinUrl(), width: 230, height: 230, colorDark: '#3B3561' });
    else $('#qr').classList.add('hidden');
    $('#demoBox').classList.toggle('hidden', db.mode !== 'demo');
    $('#btnOpenStudent').onclick = () => window.open(joinUrl(), '_blank');
    $('#btnStart').onclick = startGame;
    subscribePlayers();
    publish();
    renderLobby();
  }
  function subscribePlayers() {
    listen('players', R('players'), p => {
      G.players = Object.assign({}, p || {});
      if (G.phase === 'lobby') renderLobby(); else renderBoard();
      save();
    });
  }
  function membersOf(t) {
    return Object.entries(G.players).filter(([, p]) => p && p.team === t).sort((a, b) => a[1].no - b[1].no);
  }
  function renderLobby() {
    const box = $('#lobbyTeams');
    box.style.gridTemplateColumns = `repeat(${G.teamCount}, minmax(0, 1fr))`;
    box.innerHTML = '';
    for (let t = 0; t < G.teamCount; t++) {
      const m = membersOf(t);
      const card = document.createElement('div');
      card.className = 'card t';
      card.style.background = TEAMS[t].soft;
      card.appendChild(avatar(t, 92));
      card.insertAdjacentHTML('beforeend', `<div>${esc(teamLabel(t))}</div><div class="dots">${m.map(([, p]) =>
        `<span class="dot" title="${p.bot ? '가상 학생' : p.no + '번'}" style="background:${TEAMS[t].color};${p.bot ? 'border-style:dashed' : ''}"></span>`).join('')}</div><div style="font-size:17px;color:var(--ink2)">${m.length}명</div>`);
      box.appendChild(card);
    }
    $('#btnStart').disabled = Object.keys(G.players).length === 0;
  }

  /* ---------------- 진행 ---------------- */
  function startGame() {
    show('game');
    G.round = 0;
    startQuestion();
  }
  const currentQ = () => G.round === 0 ? PRACTICE_Q : G.qs[G.round - 1];

  function startQuestion() {
    G.q = currentQ(); G.extraAccept = []; G.reveal = null; G.revealList = null; G.displayOwners = null; G.noBids = false;
    G.answers = {}; G.phase = 'question';
    G.deadline = now() + (Grade.TIME_LIMIT[G.q.level] || 30) * 1000 * SPEED;
    listen('answers', R(`answers/${G.round}`), a => { G.answers = a || {}; if (G.phase === 'question') renderBoard(); });
    publish(); render(); SFX.pop();
    if (G.bots) botsAnswer();
  }
  function allAnswered() {
    const keys = Object.keys(G.players);
    return keys.length > 0 && keys.every(k => G.answers[k] != null);
  }

  function grade() {
    const q = Object.assign({}, G.q, { accept: [...(G.q.accept || []), ...G.extraAccept] });
    const correct = {}, rows = [];
    for (const [k, p] of Object.entries(G.players)) {
      if (!p) continue;
      const ok = Grade.isCorrect(q, G.answers[k]);
      correct[k] = ok; rows.push({ team: p.team, correct: ok });
    }
    const res = Rules.coinsFromAnswers(rows, G.teamCount);
    G.reveal = { correct, perTeam: res.perTeam, coop: res.coop, classRate: res.classRate };
    if (G.round > 0) G.stats[G.round] = { no: G.q.no, text: G.q.text, answer: G.q.answer, rate: res.classRate };
  }
  function reveal() {
    grade(); G.phase = 'reveal';
    publish(); render(); SFX.ok();
  }
  function acceptAnswer(raw) {
    G.extraAccept.push(raw); grade(); publish(); render();
  }

  function cellsNow(owners) {
    owners = owners || G.displayOwners || G.owners;
    const cells = buildNamedMap(G.teamCount);
    for (const c of Object.values(cells)) c.owner = owners[c.id] ?? null;
    return cells;
  }
  function ownersOf(cells) {
    const o = {};
    for (const c of Object.values(cells)) if (c.owner !== null && c.owner !== undefined) o[c.id] = c.owner;
    return o;
  }

  function toBid() {
    if (G.round === 0) G.snapshot = { coins: G.coins.slice(), owners: Object.assign({}, G.owners) };
    G.reveal.perTeam.forEach(r => { G.coins[r.team] += r.coins; });
    const cells = cellsNow();
    G.reps = {}; G.legal = {};
    for (let t = 0; t < G.teamCount; t++) {
      const m = membersOf(t).map(([k]) => k);
      G.reps[t] = m.length ? m[G.round % m.length] : null;
      G.legal[t] = Rules.legalTargets(cells, t);
    }
    G.bids = {}; G.votes = {};
    G.phase = 'bid'; G.deadline = now() + BID_SECONDS * 1000 * SPEED;
    listen('bids', R(`bids/${G.round}`), b => { G.bids = b || {}; if (G.phase === 'bid') renderBoard(); });
    listen('votes', R(`votes/${G.round}`), v => { G.votes = v || {}; });
    publish(); render(); SFX.coin();
    if (G.bots) botsBid();
  }
  function allBid() {
    for (let t = 0; t < G.teamCount; t++) {
      if (!G.reps[t] || G.coins[t] < 1) continue;
      if (!G.bids[t]) return false;
    }
    return true;
  }

  function resolve() {
    const cells = cellsNow(G.owners);
    const res = Rules.resolveBids(cells, G.bids, G.coins);
    G.coins = res.coins;
    G.pending = ownersOf(res.cells);
    G.revealList = res.results.map(r => ({ cell: r.cell, name: cells[r.cell].name, type: cells[r.cell].type, bids: r.bids, before: r.before, winner: r.winner, changed: r.changed }));
    G.displayOwners = Object.assign({}, G.owners);
    G.revealStart = now(); G.revealIdx = -1; G.revealStage = '';
    G.noBids = G.revealList.length === 0;
    G.phase = 'resolve';
    if (G.noBids) return finishResolve();
    publish(); render();
  }
  function stepResolve(t) {
    const elapsed = t - G.revealStart;
    if (elapsed < 0) return; // 같은 tick 안에서 막 시작한 경우
    const idx = Math.floor(elapsed / STEP_MS);
    if (idx >= G.revealList.length) return finishResolve();
    const within = (elapsed - idx * STEP_MS) / STEP_MS;
    const stage = within < 0.38 ? 'bags' : within < 0.62 ? 'nums' : 'win';
    if (idx === G.revealIdx && stage === G.revealStage) return;
    G.revealIdx = idx; G.revealStage = stage;
    const r = G.revealList[idx];
    if (stage === 'bags') SFX.drum();
    if (stage === 'nums') SFX.pop();
    if (stage === 'win') { G.displayOwners[r.cell] = r.winner; SFX.win(); }
    publish(); render();
  }
  function finishResolve() {
    G.lastChanges = (G.revealList || []).filter(r => r.changed).map(r => ({ team: r.winner, name: r.name, from: r.before }));
    G.owners = G.pending || G.owners; G.displayOwners = null; G.revealList = null;
    G.phase = 'resolved';
    publish(); render();
  }

  function nextRound() {
    if (G.round === 0 && G.snapshot) { G.coins = G.snapshot.coins; G.owners = G.snapshot.owners; G.snapshot = null; }
    if (G.round >= G.totalRounds) return finish();
    G.round++;
    startQuestion();
  }
  function skipQuestion() {
    if (!confirm('이 문제를 넘길까요? (코인 없이 다음 문제로)')) return;
    nextRound();
  }
  function jumpToLast() {
    if (G.round >= G.totalRounds - 1) { alert('이미 마지막 라운드예요.'); return; }
    if (!confirm('다음 문제를 마지막 라운드로 할까요?')) return;
    const last = G.qs[G.totalRounds - 1];
    G.qs[G.round] = last;
    G.totalRounds = G.round + 1;
    publish(); render();
  }

  function finish() {
    const scores = Rules.finalScores(cellsNow(G.owners), G.teamCount, G.missions).sort((a, b) => b.total - a.total || a.team - b.team);
    let place = 0, prev = null;
    scores.forEach((s, i) => { if (s.total !== prev) { place = i + 1; prev = s.total; } s.place = place; });
    G.final = scores;
    G.low = Object.values(G.stats).filter(Boolean).sort((a, b) => a.rate - b.rate).slice(0, 5);
    G.phase = 'final';
    publish(); renderFinal(); show('final'); SFX.win();
  }

  /* ---------------- 일시정지·tick ---------------- */
  function togglePause() {
    if (G.pausedAt) {
      const d = now() - G.pausedAt;
      G.deadline += d; if (G.revealStart) G.revealStart += d;
      G.pausedAt = null;
    } else G.pausedAt = now();
    publish(); renderHeader();
  }
  let lastLeft = null;
  function tick() {
    if (!G || G.phase === 'lobby' || G.phase === 'final' || G.pausedAt) return;
    const t = now();
    if (G.phase === 'question' || G.phase === 'bid') {
      const left = Math.max(0, Math.ceil((G.deadline - t) / 1000));
      const el = $('#timer');
      el.textContent = left; el.classList.remove('hidden'); el.classList.toggle('hurry', left <= 5);
      if (left !== lastLeft && left <= 5 && left > 0) SFX.tick();
      lastLeft = left;
      if (G.phase === 'question' && (t >= G.deadline || allAnswered())) reveal();
      else if (G.phase === 'bid' && (t >= G.deadline || allBid())) resolve();
    } else $('#timer').classList.add('hidden');
    if (G.phase === 'resolve') stepResolve(t);
  }
  setInterval(tick, 200);

  /* ---------------- 저장·공유 ---------------- */
  function publicState() {
    const showAnswer = ['reveal', 'bid', 'resolve', 'resolved'].includes(G.phase);
    const q = G.q ? { text: G.q.text, type: G.q.type, choices: G.q.choices, level: G.q.level, unit: G.q.unit } : null;
    return {
      code: G.code, phase: G.phase, teamCount: G.teamCount, round: G.round, totalRounds: G.totalRounds,
      q, deadline: G.deadline || 0, paused: !!G.pausedAt,
      answer: showAnswer && G.q ? G.q.answer : null, explain: showAnswer && G.q ? G.q.explain : null,
      correct: showAnswer && G.reveal ? G.reveal.correct : null,
      teamResults: showAnswer && G.reveal ? G.reveal.perTeam : null,
      coop: showAnswer && G.reveal ? G.reveal.coop : false,
      coins: G.coins, owners: G.displayOwners || G.owners,
      reps: G.phase === 'bid' ? G.reps : null, legal: G.phase === 'bid' ? G.legal : null,
      reveal: G.phase === 'resolve' && G.revealList ? { item: G.revealList[G.revealIdx] || null, stage: G.revealStage, idx: G.revealIdx, n: G.revealList.length } : null,
      final: G.phase === 'final' ? G.final : null
    };
  }
  function publish() { db.set(R('state'), publicState()); save(); }
  function save() { try { localStorage.setItem('tg-host', JSON.stringify(G)); } catch (e) { /* 저장 공간 없음 */ } }

  function resume(saved) {
    G = saved;
    subscribePlayers();
    if (G.phase === 'lobby') return enterLobby();
    if (G.phase === 'question') listen('answers', R(`answers/${G.round}`), a => { G.answers = a || {}; renderBoard(); });
    if (G.phase === 'bid') {
      listen('bids', R(`bids/${G.round}`), b => { G.bids = b || {}; renderBoard(); });
      listen('votes', R(`votes/${G.round}`), v => { G.votes = v || {}; });
    }
    show('game'); publish(); render();
  }

  /* ---------------- 그리기 ---------------- */
  const PHASE_NAME = { question: '문제', reveal: '정답 공개', bid: '땅 고르기', resolve: '두근두근 공개', resolved: '라운드 결과' };
  function render() { renderHeader(); renderMap(); renderOverlay(); renderBoard(); }

  function renderHeader() {
    $('#roundInfo').textContent = G.round === 0 ? '연습 라운드' : (G.round === G.totalRounds ? `마지막 라운드! ${G.round}/${G.totalRounds}` : `${G.round} / ${G.totalRounds} 라운드`);
    $('#phaseInfo').textContent = G.pausedAt ? '일시정지' : (PHASE_NAME[G.phase] || '');
    const next = $('#btnNext');
    next.textContent = {
      question: '바로 마감', reveal: '코인 받고 땅 고르기 ▶', bid: '바로 마감', resolve: '공개 건너뛰기',
      resolved: G.round === 0 ? '진짜 게임 시작 ▶' : (G.round >= G.totalRounds ? '최종 결과 ▶' : '다음 문제 ▶')
    }[G.phase] || '다음';
    $('#btnSkip').classList.toggle('hidden', G.phase !== 'question');
    $('#btnPause').textContent = G.pausedAt ? '계속하기' : '일시정지';
    $('#btnSound').textContent = sound.on ? '소리 켬' : '소리 끔';
    $('#btnLast').classList.toggle('hidden', G.round === 0 || G.round >= G.totalRounds - 1);
  }
  function onNext() {
    if (G.pausedAt) togglePause();
    ({ question: reveal, reveal: toBid, bid: resolve, resolve: finishResolve, resolved: nextRound }[G.phase] || (() => {}))();
  }

  function renderMap() {
    const dim = G.phase === 'question' || G.phase === 'reveal';
    const svg = $('#map');
    svg.style.opacity = dim ? 0.18 : 1;
    const item = G.phase === 'resolve' && G.revealList ? G.revealList[G.revealIdx] : null;
    drawMap(svg, cellsNow(), { highlight: item ? item.cell : null });
  }

  function sack(color) {
    return `<svg class="sack" viewBox="0 0 100 100" aria-hidden="true"><path d="M36 30 Q50 38 64 30 L60 18 Q50 24 40 18 Z" fill="${color}" stroke="#3B3561" stroke-width="4" stroke-linejoin="round"/>` +
      `<path d="M34 36 Q10 84 30 92 H70 Q90 84 66 36 Z" fill="${color}" stroke="#3B3561" stroke-width="4" stroke-linejoin="round"/>` +
      `<path d="M36 34 Q50 40 64 34" fill="none" stroke="#3B3561" stroke-width="5" stroke-linecap="round"/><circle cx="50" cy="66" r="11" fill="#FFD84D" stroke="#3B3561" stroke-width="3"/></svg>`;
  }

  function questionBlock(withAnswer) {
    const q = G.q;
    let body = '';
    if (q.type === '객관식') body = `<div class="choices">${q.choices.map((c, i) =>
      `<div class="choice ${withAnswer ? (c === q.answer ? 'right' : 'dim') : ''}"><span class="n">${i + 1}</span>${esc(c)}</div>`).join('')}</div>`;
    else if (q.type === 'OX') body = `<div class="ox">${['O', 'X'].map(c => `<div class="choice ${withAnswer ? (c === q.answer ? 'right' : 'dim') : ''}">${c}</div>`).join('')}</div>`;
    else if (!withAnswer) body = `<div class="explain" style="text-align:center">탭에 정답을 직접 써서 내요</div>`;
    return `<div class="qmeta"><span>${esc(q.unit)}</span><span>난이도 ${esc(q.level)}</span><span>${esc(q.type)}</span></div>
      <div class="qtext" style="${withAnswer ? 'font-size:32px' : ''}">${esc(q.text)}</div>${body}`;
  }

  function renderOverlay() {
    const o = $('#overlay');
    o.innerHTML = '';
    if (G.phase === 'question') {
      o.innerHTML = `<div class="card qcard pop">${questionBlock(false)}</div>`;
    } else if (G.phase === 'reveal') {
      const r = G.reveal;
      const res = r.perTeam.map(p => `<div class="tr" style="background:${TEAMS[p.team].soft}">
          <div data-av="${p.team}"></div><div class="r">${p.right}/${p.total}</div>
          <div class="c">+${p.coins}<span class="coin" style="margin-left:4px"></span></div>
          ${p.allCorrect ? '<div style="font-size:14px;font-weight:800">전원 정답!</div>' : ''}</div>`).join('');
      const wrong = G.q.type === '단답' ? wrongAnswers() : [];
      o.innerHTML = `<div class="card qcard pop">
        ${questionBlock(true)}
        ${G.q.type === '단답' ? `<div class="answer">정답 <b>${esc(G.q.answer)}</b></div>` : ''}
        ${G.q.explain ? `<div class="explain">${esc(G.q.explain)}</div>` : ''}
        ${r.coop ? `<div class="coop">반 전체 정답률 ${Math.round(r.classRate * 100)}%! 모든 모둠 +3 코인</div>` : ''}
        <div class="teamres" style="grid-template-columns:repeat(${G.teamCount},minmax(0,1fr))">${res}</div>
        ${wrong.length ? `<div class="chips">오답 중 정답으로 인정할 답: ${wrong.map((w, i) => `<button class="btn small" data-accept="${i}">${esc(w.text)} (${w.n}명)</button>`).join('')}</div>` : ''}
      </div>`;
      o.querySelectorAll('[data-av]').forEach(e => e.replaceWith(avatar(+e.dataset.av, 54, 'happy')));
      o.querySelectorAll('[data-accept]').forEach(b => b.onclick = () => acceptAnswer(wrong[+b.dataset.accept].text));
    } else if (G.phase === 'bid') {
      o.innerHTML = `<div class="card bid-hint">맞닿은 칸에 코인을 몰래 걸어요! 대표가 확정해요</div>`;
    }
    renderSide();
  }

  /* 공개 연출과 라운드 결과는 오른쪽 칸에 (지도를 가리지 않게) */
  function renderSide() {
    const side = $('#sidecard');
    side.innerHTML = '';
    $('#board').classList.toggle('hidden', G.phase === 'resolve');
    if (G.phase === 'resolve' && G.revealList) {
      const it = G.revealList[G.revealIdx];
      if (!it) return;
      const icon = it.type === 'treasure' ? '★ ' : '';
      const tag = it.type === 'treasure' ? '보물 칸 (3점)' : it.type === 'fort' ? '요새 칸 (뺏기지 않음)' : '';
      const max = Math.max(...it.bids.map(b => b.coins));
      const bags = it.bids.map(b => `<div class="bag ${G.revealStage === 'win' && b.team === it.winner ? 'win' : ''}">
          <div class="${G.revealStage === 'bags' ? 'shake' : 'pop'}">${sack(TEAMS[b.team].color)}</div>
          <div>${esc(TEAMS[b.team].name)}${b.team === it.before ? ' (수비)' : ''}</div>
          <div class="amt num">${G.revealStage === 'bags' ? '?' : b.coins}</div></div>`).join('');
      let result = '&nbsp;';
      if (G.revealStage === 'win') {
        result = it.winner === it.before && it.before !== null ? `${esc(teamLabel(it.winner))}<br>지켜냈다!`
          : `${esc(teamLabel(it.winner))}<br>${it.before !== null ? '빼앗았다!' : '획득!'}`;
        if (it.bids.length > 1 && it.bids.filter(b => b.coins === max).length > 1) result += '<small>동점이라 땅이 적은 모둠이 가져가요</small>';
      }
      side.innerHTML = `<div class="card bubble">
        <div class="count">${G.revealIdx + 1} / ${G.revealList.length}번째 공개</div>
        <div class="title">${icon}${esc(it.name)}</div>${tag ? `<div class="count">${tag}</div>` : ''}
        <div class="bags ${it.bids.length === 1 ? 'one' : ''}">${bags}</div>
        <div class="result ${G.revealStage === 'win' ? 'pop' : ''}">${result}</div></div>`;
    } else if (G.phase === 'resolved') {
      const msg = G.round === 0 ? '연습 끝! 연습 결과는 사라지고 이제 진짜 시작해요'
        : G.noBids ? '이번엔 아무도 코인을 걸지 않았어요' : (G.lastChanges || []).length ? '이번 라운드에 바뀐 땅' : '바뀐 땅이 없어요 (모두 지켜냈어요)';
      const list = (G.lastChanges || []).map(c => `<div class="ch"><span data-av="${c.team}"></span><div>${esc(TEAMS[c.team].name)} → ${esc(c.name)}${c.from !== null && c.from !== undefined ? `<br><span class="from">${esc(TEAMS[c.from].name)}에게서 빼앗음</span>` : ''}</div></div>`).join('');
      side.innerHTML = `<div class="card summary pop"><div class="msg">${msg}</div>${list}<button class="btn primary" id="btnNext2">${esc($('#btnNext').textContent)}</button></div>`;
      side.querySelectorAll('[data-av]').forEach(e => e.replaceWith(avatar(+e.dataset.av, 40, 'happy')));
      $('#btnNext2').onclick = onNext;
    }
  }

  function wrongAnswers() {
    const groups = {};
    for (const [k, a] of Object.entries(G.answers)) {
      if (a == null || a === '' || G.reveal.correct[k]) continue;
      const key = Grade.keys(a);
      (groups[key] = groups[key] || { text: String(a).trim(), n: 0 }).n++;
    }
    return Object.values(groups).sort((a, b) => b.n - a.n).slice(0, 8);
  }

  function renderBoard() {
    if (!G || G.phase === 'lobby') return;
    const cells = cellsNow();
    const rows = [];
    for (let t = 0; t < G.teamCount; t++) {
      const m = membersOf(t);
      rows.push({ t, land: Rules.landScore(cells, t), n: Object.values(cells).filter(c => c.owner === t).length, m });
    }
    const top = Math.max(...rows.map(r => r.land));
    rows.sort((a, b) => b.land - a.land || a.t - b.t);
    const box = $('#board');
    box.innerHTML = '';
    for (const r of rows) {
      let status = '';
      if (G.phase === 'question') status = `${r.m.filter(([k]) => G.answers[k] != null).length}/${r.m.length} 제출`;
      else if (G.phase === 'reveal' && G.reveal) { const p = G.reveal.perTeam[r.t]; status = `정답 ${p.right}/${p.total} · +${p.coins}코인`; }
      else if (G.phase === 'bid') status = !G.reps[r.t] ? '접속 없음' : G.coins[r.t] < 1 ? '코인 없음 · 쉬어요' : G.bids[r.t] ? '✓ 걸기 완료' : '고르는 중…';
      const row = document.createElement('div');
      row.className = 'card row';
      row.style.borderLeftColor = TEAMS[r.t].color;
      row.appendChild(avatar(r.t, 54));
      row.insertAdjacentHTML('beforeend', `<div><div class="nm">${r.land === top && top > 1 ? crown() : ''}${esc(teamLabel(r.t))}</div>
        <div class="sub"><span class="coin"></span> ${G.coins[r.t]}코인 · 땅 ${r.n}칸</div>
        <div class="status" style="color:${status.startsWith('✓') ? 'var(--ok)' : 'var(--ink2)'}">${esc(status)}</div></div>
        <div class="score">${r.land}<small>점</small></div>`);
      box.appendChild(row);
    }
  }
  const crown = () => `<svg class="crown" viewBox="0 0 24 16" aria-label="1위"><path d="M2 14 L2 4 L7 8 L12 2 L17 8 L22 4 L22 14 Z" fill="#FFD84D" stroke="#3B3561" stroke-width="2" stroke-linejoin="round"/></svg> `;

  function renderFinal() {
    const box = $('#ranks');
    box.innerHTML = '';
    for (const s of G.final) {
      const row = document.createElement('div');
      row.className = 'card rank pop';
      row.style.background = s.place === 1 ? '#FFF3B0' : '#fff';
      row.insertAdjacentHTML('beforeend', `<div class="place">${s.place}</div>`);
      row.appendChild(avatar(s.team, 66, s.place === 1 ? 'happy' : null));
      row.insertAdjacentHTML('beforeend', `<div><div class="nm">${esc(teamLabel(s.team))}</div>
        <div class="detail">땅 ${s.land}점 · 가장 큰 땅 보너스 ${s.region}점 · 비밀 미션 "${esc(s.missionText)}" ${s.mission ? `성공 +${s.mission}점` : '실패'}</div></div>
        <div class="tot">${s.total}</div>`);
      box.appendChild(row);
    }
    $('#lowList').innerHTML = G.low.length ? G.low.map(l => `<li><span class="rate">${Math.round(l.rate * 100)}%</span> ${esc(l.text)}<br><b>정답: ${esc(l.answer)}</b></li>`).join('') : '<li>기록된 문제가 없어요</li>';
    $('#btnCopyLow').onclick = () => {
      const text = G.low.map((l, i) => `${i + 1}. (${Math.round(l.rate * 100)}%) ${l.text} → ${l.answer}`).join('\n');
      navigator.clipboard.writeText(text).then(() => alert('복사했어요.'), () => prompt('아래 내용을 복사하세요', text));
    };
    $('#btnDelete').onclick = () => {
      if (!confirm('이 방의 기록을 모두 지울까요?')) return;
      db.remove(`rooms/${G.code}`).then(() => { localStorage.removeItem('tg-host'); location.href = location.pathname; });
    };
  }

  /* ---------------- 가상 학생 ---------------- */
  function botKeys() { return Object.keys(G.players).filter(k => G.players[k] && G.players[k].bot); }
  function botsAnswer() {
    const q = G.q, round = G.round;
    const limit = (Grade.TIME_LIMIT[q.level] || 30) * 1000 * SPEED;
    for (const k of botKeys()) {
      setTimeout(() => {
        if (!G || G.round !== round || G.phase !== 'question') return;
        const right = Math.random() < 0.7;
        let ans;
        if (q.type === '객관식') ans = right ? q.answer : pick(q.choices.filter(c => c !== q.answer));
        else if (q.type === 'OX') ans = right ? q.answer : (q.answer === 'O' ? 'X' : 'O');
        else ans = right ? q.answer : pick(['모르겠어요', q.answer.slice(0, 2)]);
        db.set(R(`answers/${round}/${k}`), ans);
      }, 800 + Math.random() * limit * 0.5);
    }
  }
  function botsBid() {
    const round = G.round;
    const cells = cellsNow();
    for (let t = 0; t < G.teamCount; t++) {
      const rep = G.reps[t];
      if (!rep || !G.players[rep] || !G.players[rep].bot || G.coins[t] < 1) continue;
      setTimeout(() => {
        if (!G || G.round !== round || G.phase !== 'bid') return;
        const legal = G.legal[t];
        const attack = legal.filter(id => cells[id].owner !== t);
        const pool = attack.length && Math.random() < 0.85 ? attack : legal;
        const gold = pool.filter(id => cells[id].type === 'treasure');
        const cell = gold.length && Math.random() < 0.6 ? pick(gold) : pick(pool);
        const coins = Math.min(G.coins[t], Math.max(1, Math.round(G.coins[t] * (0.3 + Math.random() * 0.5))));
        db.set(R(`bids/${round}/${t}`), { cell, coins, by: rep });
      }, (2500 + Math.random() * 6000) * SPEED);
    }
    for (const k of botKeys()) {
      const legal = G.legal[G.players[k].team];
      if (!legal.length) continue;
      setTimeout(() => { if (G && G.phase === 'bid' && G.round === round) db.set(R(`votes/${round}/${k}`), pick(legal)); }, (800 + Math.random() * 4000) * SPEED);
    }
  }

  /* ---------------- 버튼 ---------------- */
  $('#btnNext').onclick = onNext;
  $('#btnPause').onclick = togglePause;
  $('#btnSkip').onclick = skipQuestion;
  $('#btnLast').onclick = jumpToLast;
  $('#btnSound').onclick = () => { sound.on = !sound.on; renderHeader(); };
  $('#btnEnd').onclick = () => { if (confirm('게임을 끝내고 최종 결과를 볼까요?')) finish(); };
  window.addEventListener('beforeunload', save);

  initSetup();
  if (params.has('auto')) { // 시험용: 바로 방 만들기
    const go = () => { if ($('#bank').value.trim()) { createRoom(); } else setTimeout(go, 200); };
    go();
  }
})();
