/* TV(진행) 화면. 게임 상태는 이 화면만 바꾼다. */
(function () {
  const { TEAMS, teamLabel, buildNamedMap, drawMap, avatar, critterSVG, PRACTICE_Q, esc, SFX, sound } = Common;
  const db = Backend.create();
  const $ = s => document.querySelector(s);
  const params = new URLSearchParams(location.search);
  const FAST = params.has('fast'); // 시험용: 시간을 짧게
  const TEST = params.has('test'); // 테스트 창 안에서 실행
  const SAVE_KEY = TEST ? 'tg-host-test' : 'tg-host';
  const SPEED = FAST ? 0.2 : 1;
  const BID_SECONDS = 30;
  const OPEN_AFTER = 15;      // 걸기 시작 후 이 시간(초)이 지나면 대표가 아니어도 모둠 누구나 확정 가능
  const ONLINE_MS = 25000;    // 학생 탭이 이 시간 넘게 신호가 없으면 접속이 끊긴 것으로 봄
  const STEP_MS = 3400 * (FAST ? 0.4 : 1);
  const now = () => db.now(); // Firebase 모드에서는 서버 시간 기준
  const pick = a => a[Math.floor(Math.random() * a.length)];

  let G = null;
  const unsub = {};
  const R = p => `rooms/${G.code}/${p}`;

  /* 화면 안 선택 창 (브라우저 기본 창 대신: TV에서 보기 좋고, 막힌 환경에서도 작동)
   * buttons: [{label, value, cls}] → 누른 버튼의 value (바깥을 누르면 null) */
  function choose(text, buttons) {
    return new Promise(resolve => {
      const layer = document.createElement('div');
      layer.className = 'modal';
      layer.innerHTML = `<div class="card modal-box" role="dialog" aria-modal="true"><div class="modal-text"></div><div class="modal-btns"></div></div>`;
      layer.querySelector('.modal-text').textContent = text;
      const done = v => { layer.remove(); resolve(v); };
      buttons.forEach(bt => {
        const b = document.createElement('button');
        b.className = 'btn ' + (bt.cls || '');
        if (bt.html) b.innerHTML = bt.html; else b.textContent = bt.label;
        if (bt.style) b.style.cssText = bt.style;
        b.onclick = () => done(bt.value);
        layer.querySelector('.modal-btns').appendChild(b);
      });
      layer.addEventListener('click', e => { if (e.target === layer) done(null); });
      document.body.appendChild(layer);
      (layer.querySelector('.primary') || layer.querySelector('button')).focus();
    });
  }
  function ask(text, okLabel, cancelLabel) {
    const bts = cancelLabel === null ? [] : [{ label: cancelLabel || '취소', value: false }];
    return choose(text, [...bts, { label: okLabel || '확인', value: true, cls: 'primary' }]).then(v => v === true);
  }
  const tell = text => ask(text, '확인', null);

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
    const tryLoad = names => {
      if (!names.length) return;
      fetch(encodeURI(names[0])).then(r => r.ok ? r.text() : '').catch(() => '').then(t => {
        if (t) { if (!$('#bank').value.trim()) { $('#bank').value = t; bankInfo(); } }
        else tryLoad(names.slice(1));
      });
    };
    tryLoad(['questions/문제은행_초안.tsv', 'questions/bank.tsv']);
    if (params.has('bots')) $('#bots').checked = true;
    if (params.get('teams')) $('#teamCount').value = params.get('teams');
    if (params.get('rounds')) $('#rounds').value = params.get('rounds');
    if (params.get('assign')) $('#assign').value = params.get('assign');
    try {
      const saved = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
      if (saved && saved.phase !== 'final' && !params.has('auto')) {
        $('#resumeBox').classList.remove('hidden');
        $('#btnResume').onclick = () => resume(saved);
        $('#btnDiscard').onclick = () => { localStorage.removeItem(SAVE_KEY); $('#resumeBox').classList.add('hidden'); };
      }
    } catch (e) { /* 저장된 게임 없음 */ }
    $('#btnCreate').onclick = createRoom;
    bankInfo();
  }

  async function createRoom() {
    const bank = Grade.parseBank($('#bank').value);
    const teamCount = +$('#teamCount').value, rounds = +$('#rounds').value;
    const usable = bank.filter(q => !q.games || q.games.includes('땅'));
    if (usable.length < rounds) { tell(`문제가 부족해요. (필요 ${rounds}개, 있는 문제 ${usable.length}개)`); return; }
    const cells = buildNamedMap(teamCount);
    $('#btnCreate').disabled = true;
    let code = null, offlineStart = false;
    const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('응답이 없어요')), ms))]);
    try {
      await withTimeout(db.ready, 8000);
      for (let i = 0; i < 20 && !code; i++) {
        const c = String(1000 + Math.floor(Math.random() * 9000));
        if (!(await withTimeout(db.once(`rooms/${c}/meta`), 8000))) code = c;
      }
      if (!code) throw new Error('빈 방 코드를 찾지 못했어요');
      await withTimeout(db.set(`rooms/${code}/meta`, { hostUid: db.uid, created: now() }), 8000);
    } catch (e) {
      $('#btnCreate').disabled = false;
      offlineStart = await ask('방을 만들지 못했어요. 인터넷 연결이나 Firebase 설정을 확인해 주세요.\n(' + (e && e.message || e) + ')\n\n학생 탭 없이 화이트보드로 진행할까요? (오프라인 진행)', '오프라인으로 진행');
      if (!offlineStart) return;
      code = 'OFF' + Math.floor(Math.random() * 900 + 100);
    }
    $('#btnCreate').disabled = false;
    G = {
      code, teamCount, totalRounds: rounds,
      qs: Rules.pickQuestions(bank, rounds), missions: Rules.dealMissions(teamCount),
      owners: ownersOf(cells), coins: Array(teamCount).fill(0), round: 0, phase: 'lobby',
      players: {}, answers: {}, votes: {}, bids: {}, stats: {}, extraAccept: [], bots: $('#bots').checked,
      assign: $('#assign').value, // 'choose' 학생이 고르기 · 'random' 랜덤 배정
      offline: offlineStart // 오프라인 진행: 교사가 모둠별 O/X와 걸기를 직접 입력
    };
    db.set(R('missions'), G.missions.map(id => Rules.MISSIONS.find(m => m.id === id).text));
    if (G.bots) addBots();
    if (offlineStart) return startGame();
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
    if (window.parent !== window) window.parent.postMessage({ tg: 'room', code: G.code, teamCount: G.teamCount }, '*');
    $('#joinUrl').textContent = joinUrl();
    $('#qr').innerHTML = '';
    if (window.QRCode) new QRCode($('#qr'), { text: joinUrl(), width: 230, height: 230, colorDark: '#3B3561' });
    else $('#qr').classList.add('hidden');
    $('#demoBox').classList.toggle('hidden', db.mode !== 'demo');
    $('#btnOpenStudent').href = joinUrl();
    $('#btnStart').onclick = startGame;
    $('#btnShuffle').onclick = shuffleTeams;
    $('#btnOfflineStart').onclick = async () => {
      if (!await ask('학생 탭 없이 화이트보드로 진행할까요?\n모둠은 화이트보드에 답을 쓰고, 선생님이 TV에서 모둠별 정답(O/X)과 걸기를 입력해요.', '오프라인으로 시작')) return;
      G.offline = true;
      Object.keys(G.players).forEach(k => { if (G.players[k] && (G.players[k].team === null || G.players[k].team === undefined)) delete G.players[k]; });
      startGame(true);
    };
    subscribePlayers();
    publish();
    renderLobby();
  }
  function subscribePlayers() {
    listen('players', R('players'), p => {
      G.players = Object.assign({}, p || {});
      // 게임 중에 늦게 온 학생(랜덤 모드)은 인원이 적은 모둠에 바로 넣는다
      if (G.phase !== 'lobby' && unassigned().length) return placeUnassigned();
      if (G.phase === 'lobby') renderLobby(); else renderBoard();
      save();
    });
  }
  function membersOf(t) {
    return Object.entries(G.players).filter(([, p]) => p && p.team === t).sort((a, b) => a[1].no - b[1].no);
  }
  const isOnline = p => !!p && (p.bot || (p.seen && now() - p.seen < ONLINE_MS));
  const unassigned = () => Object.entries(G.players).filter(([, p]) => p && (p.team === null || p.team === undefined)).sort((a, b) => a[1].no - b[1].no);
  const teamSizes = () => Array.from({ length: G.teamCount }, (_, t) => membersOf(t).length);
  function setTeam(key, team) {
    const p = G.players[key];
    if (!p) return;
    G.players[key] = Object.assign({}, p, { team });
    db.set(R(`players/${key}`), G.players[key]);
  }
  /** 모둠 없는 학생을 인원이 가장 적은 모둠부터 채운다 */
  function placeUnassigned() {
    const sizes = teamSizes();
    for (const [key] of unassigned()) {
      const min = Math.min(...sizes);
      const cands = sizes.map((n, t) => n === min ? t : -1).filter(t => t >= 0);
      const t = pick(cands);
      sizes[t]++;
      setTeam(key, t);
    }
  }
  /** 랜덤 섞기: 가상 학생은 그대로 두고 진짜 학생만 고르게 다시 나눈다 */
  function shuffleTeams() {
    const humans = Object.entries(G.players).filter(([, p]) => p && !p.bot).map(([k]) => k);
    for (let i = humans.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [humans[i], humans[j]] = [humans[j], humans[i]]; }
    humans.forEach(k => { G.players[k] = Object.assign({}, G.players[k], { team: null }); });
    const sizes = teamSizes();
    for (const k of humans) {
      const min = Math.min(...sizes);
      const cands = sizes.map((n, t) => n === min ? t : -1).filter(t => t >= 0);
      const t = pick(cands);
      sizes[t]++;
      G.players[k].team = t;
      db.set(R(`players/${k}`), G.players[k]);
    }
    SFX.win();
    renderLobby();
  }
  /** 학생 칸을 누르면: 다른 모둠으로 옮기기 / 내보내기 */
  async function adjustPlayer(key) {
    const p = G.players[key];
    if (!p) return;
    const who = p.bot ? '가상 학생' : `${p.no}번 학생`;
    const teamBtns = Array.from({ length: G.teamCount }, (_, t) => ({
      html: `${t + 1}모둠 ${esc(TEAMS[t].name)}`, value: t, cls: t === p.team ? 'primary' : '',
      style: `border-color:${TEAMS[t].ink};background:${t === p.team ? TEAMS[t].color : TEAMS[t].soft};${t === p.team ? 'color:#fff' : ''}`
    }));
    const v = await choose(`${who}을(를) 어느 모둠으로 옮길까요?`, [...teamBtns, { label: '내보내기', value: 'kick', style: 'color:var(--no)' }, { label: '취소', value: null }]);
    if (v === null || v === undefined || v === p.team) return;
    if (v === 'kick') {
      if (!await ask(`${who}을(를) 내보낼까요? 탭에서 다시 입장해야 해요.`, '내보내기')) return;
      delete G.players[key];
      db.set(R(`players/${key}`), null);
    } else setTeam(key, v);
    renderLobby();
  }
  function chip(key, p) {
    const color = p.team === null || p.team === undefined ? '#fff' : TEAMS[p.team].color;
    const off = !isOnline(p);
    return `<button class="pchip ${p.bot ? 'bot' : ''} ${off ? 'off' : ''}" data-key="${esc(key)}" style="--c:${color}" aria-label="${p.bot ? '가상 학생' : p.no + '번 학생'}${off ? ' (접속 끊김)' : ''} 옮기기" title="${off ? '접속이 끊겼어요' : ''}">${p.bot ? '가상' : p.no + '번'}</button>`;
  }
  function renderLobby() {
    const box = $('#lobbyTeams');
    const random = G.assign === 'random';
    $('#assignBar').classList.toggle('hidden', !random);
    $('#lobbyHint').textContent = random
      ? '학생은 방 코드와 출석번호만 넣고 들어와요. 다 들어오면 [모둠 랜덤으로 섞기]를 누르세요. 학생 칸을 누르면 모둠을 바꿀 수 있어요.'
      : '학생이 탭에서 자기 모둠과 번호를 골라요. 학생 칸을 누르면 다른 모둠으로 옮기거나 내보낼 수 있어요.';
    box.style.gridTemplateColumns = `repeat(${G.teamCount}, minmax(0, 1fr))`;
    box.innerHTML = '';
    for (let t = 0; t < G.teamCount; t++) {
      const m = membersOf(t);
      const card = document.createElement('div');
      card.className = 'card t';
      card.style.background = TEAMS[t].soft;
      card.appendChild(avatar(t, 84));
      card.insertAdjacentHTML('beforeend', `<div>${esc(teamLabel(t))} <span style="font-size:17px;color:var(--ink2)">${m.length}명</span></div>
        <div class="chips">${m.map(([k, p]) => chip(k, p)).join('')}</div>`);
      box.appendChild(card);
    }
    const wait = unassigned();
    const wbox = $('#waiting');
    wbox.classList.toggle('hidden', !wait.length);
    wbox.innerHTML = `<b>모둠 정하는 중 ${wait.length}명</b> <span class="chips">${wait.map(([k, p]) => chip(k, p)).join('')}</span>`;
    document.querySelectorAll('#lobby .pchip').forEach(b => b.onclick = () => adjustPlayer(b.dataset.key));
    $('#btnStart').disabled = Object.keys(G.players).length === 0;
  }

  /* ---------------- 오프라인 진행 ---------------- */
  async function toggleOffline() {
    if (!G.offline) {
      if (!await ask('오프라인 진행으로 바꿀까요?\n와이파이가 안 될 때 써요. 모둠은 화이트보드에 답을 쓰고, 선생님이 모둠별 정답(O/X)과 걸기를 입력해요. 점수 규칙은 그대로예요.', '오프라인으로')) return;
      G.offline = true;
    } else {
      if (!await ask('다시 학생 탭으로 진행할까요? (다음 문제부터 탭으로 답해요)', '탭으로 진행')) return;
      G.offline = false;
    }
    G.marks = G.marks || {};
    if (G.phase === 'bid' && G.offline) setOfflineReps();
    publish(); render();
  }
  function setOfflineReps() {
    for (let t = 0; t < G.teamCount; t++) G.reps[t] = 'teacher';
  }
  function markTeam(t) { G.marks[t] = !G.marks[t]; SFX.tap(); render(); }
  function offlinePickTeam(t) { G.offSel = t; G.offCell = (G.bids[t] && G.bids[t].cell) || null; G.offBet = (G.bids[t] && G.bids[t].coins) || 1; SFX.tap(); render(); }
  function offlineConfirm() {
    const t = G.offSel;
    if (t === null || t === undefined || !G.offCell) return;
    const bid = { cell: G.offCell, coins: Math.min(G.offBet, G.coins[t]), by: 'teacher' };
    G.bids = Object.assign({}, G.bids, { [t]: bid });
    db.set(R(`bids/${G.round}/${t}`), bid);
    // 다음으로 입력할 모둠으로 넘어가기
    const next = Array.from({ length: G.teamCount }, (_, k) => k).find(k => k !== t && G.coins[k] >= 1 && !G.bids[k]);
    G.offSel = next === undefined ? null : next; G.offCell = null; G.offBet = 1;
    SFX.coin(); render();
  }

  /* ---------------- 진행 ---------------- */
  async function startGame(skipCheck) {
    const wait = skipCheck === true ? [] : unassigned();
    if (wait.length) {
      if (!await ask(`아직 모둠이 없는 학생이 ${wait.length}명 있어요. 인원이 적은 모둠에 자동으로 넣고 시작할까요?`, '넣고 시작')) return;
      placeUnassigned();
    }
    show('game');
    G.round = 0;
    startQuestion();
  }
  const currentQ = () => G.round === 0 ? PRACTICE_Q : G.qs[G.round - 1];

  function startQuestion() {
    G.q = currentQ(); G.extraAccept = []; G.reveal = null; G.revealList = null; G.displayOwners = null; G.noBids = false;
    G.answers = {}; G.phase = 'question'; G.marks = {};
    G.deadline = now() + (Grade.TIME_LIMIT[G.q.level] || 30) * 1000 * SPEED;
    // 마감 뒤에 들어온 답은 받지 않는다
    listen('answers', R(`answers/${G.round}`), a => { if (G.phase === 'question') { G.answers = a || {}; renderBoard(); } });
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
    if (G.offline) {
      // 오프라인: 모둠 하나를 '한 명'처럼 계산 → 정답 모둠은 전원 정답과 같은 코인
      for (let t = 0; t < G.teamCount; t++) rows.push({ team: t, correct: !!(G.marks && G.marks[t]) });
    } else for (const [k, p] of Object.entries(G.players)) {
      if (!p) continue;
      const ok = Grade.isCorrect(q, G.answers[k]);
      correct[k] = ok; rows.push({ team: p.team, correct: ok });
    }
    const res = Rules.coinsFromAnswers(rows, G.teamCount);
    G.reveal = { correct, perTeam: res.perTeam, coop: res.coop, classRate: res.classRate, offline: !!G.offline };
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
      // 접속이 끊긴 학생은 대표 순서에서 뺀다 (모두 끊겼으면 전체에서 고름)
      const all = membersOf(t).map(([k]) => k);
      const on = all.filter(k => isOnline(G.players[k]));
      const m = on.length ? on : all;
      G.reps[t] = m.length ? m[G.round % m.length] : null;
      G.legal[t] = Rules.legalTargets(cells, t);
    }
    G.bids = {}; G.votes = {};
    if (G.offline) { setOfflineReps(); G.offSel = Array.from({ length: G.teamCount }, (_, k) => k).find(k => G.coins[k] >= 1); G.offCell = null; G.offBet = 1; }
    G.phase = 'bid'; G.deadline = now() + BID_SECONDS * 1000 * SPEED;
    G.openAt = now() + OPEN_AFTER * 1000 * SPEED; // 이때부터 모둠 누구나 확정 가능
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
    const valid = {};
    for (const [t, b] of Object.entries(G.bids || {})) {
      if (!b) continue;
      const by = G.players[b.by];
      if (b.by === 'teacher' || (by && by.team === +t)) valid[t] = b;
    }
    const res = Rules.resolveBids(cells, valid, G.coins);
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
  async function skipQuestion() {
    if (!await ask('이 문제를 넘길까요? 코인 없이 다음 문제로 가요.', '넘기기')) return;
    if (G.phase === 'question') nextRound();
  }
  async function jumpToLast() {
    if (G.round >= G.totalRounds - 1) { tell('이미 마지막 라운드예요.'); return; }
    if (!await ask('다음 문제를 마지막 라운드로 할까요? (어려운 문제가 나와요)', '마지막 라운드로')) return;
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
      el.innerHTML = `<img class="ico" src="images/hourglass.png" alt="" style="width:30px;height:30px"> ${left}`; el.classList.remove('hidden'); el.classList.toggle('hurry', left <= 5);
      if (left !== lastLeft && left <= 5 && left > 0) SFX.tick();
      lastLeft = left;
      if (G.offline) { /* 오프라인: 선생님이 입력을 마치고 직접 넘긴다 */ }
      else if (G.phase === 'question' && (t >= G.deadline || allAnswered())) reveal();
      else if (G.phase === 'bid' && (t >= G.deadline || allBid())) resolve();
    } else $('#timer').classList.add('hidden');
    if (G.phase === 'resolve') stepResolve(t);
  }
  setInterval(tick, 200);
  setInterval(() => { if (G && G.phase === 'lobby') renderLobby(); }, 5000);

  /* ---------------- 저장·공유 ---------------- */
  function publicState() {
    const showAnswer = ['reveal', 'bid', 'resolve', 'resolved'].includes(G.phase);
    const q = G.q ? { text: G.q.text, type: G.q.type, choices: G.q.choices, level: G.q.level, unit: G.q.unit } : null;
    return {
      code: G.code, phase: G.phase, teamCount: G.teamCount, round: G.round, totalRounds: G.totalRounds, assign: G.assign || 'choose',
      q, deadline: G.deadline || 0, paused: !!G.pausedAt, offline: !!G.offline,
      answer: showAnswer && G.q ? G.q.answer : null, explain: showAnswer && G.q ? G.q.explain : null,
      correct: showAnswer && G.reveal ? G.reveal.correct : null,
      teamResults: showAnswer && G.reveal ? G.reveal.perTeam : null,
      coop: showAnswer && G.reveal ? G.reveal.coop : false,
      coins: G.coins, owners: G.displayOwners || G.owners,
      reps: G.phase === 'bid' ? G.reps : null, legal: G.phase === 'bid' ? G.legal : null, openAt: G.phase === 'bid' ? (G.openAt || 0) : 0,
      reveal: G.phase === 'resolve' && G.revealList ? { item: G.revealList[G.revealIdx] || null, stage: G.revealStage, idx: G.revealIdx, n: G.revealList.length } : null,
      final: G.phase === 'final' ? G.final : null
    };
  }
  function publish() { db.set(R('state'), publicState()); save(); }
  function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(G)); } catch (e) { /* 저장 공간 없음 */ } }

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
      question: G.offline ? '정답 공개 ▶' : '바로 마감', reveal: '코인 받고 땅 고르기 ▶', bid: G.offline ? '공개 시작 ▶' : '바로 마감', resolve: '공개 건너뛰기',
      resolved: G.round === 0 ? '진짜 게임 시작 ▶' : (G.round >= G.totalRounds ? '최종 결과 ▶' : '다음 문제 ▶')
    }[G.phase] || '다음';
    $('#btnSkip').classList.toggle('hidden', G.phase !== 'question');
    $('#btnPause').textContent = G.pausedAt ? '계속' : '멈춤';
    $('#btnSound').textContent = sound.on ? '소리 켬' : '소리 끔';
    $('#btnOffline').textContent = G.offline ? '탭으로' : '오프라인';
    $('#btnOffline').classList.toggle('primary', !!G.offline);
    if (G.offline) $('#phaseInfo').textContent += ' · 오프라인';
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
    const offPick = G.phase === 'bid' && G.offline && G.offSel !== null && G.offSel !== undefined;
    drawMap(svg, cellsNow(), {
      highlight: item ? item.cell : null, decor: true,
      legal: offPick ? G.legal[G.offSel] : [], selected: offPick ? G.offCell : null,
      onPick: offPick ? (id => { G.offCell = id; SFX.tap(); render(); }) : null
    });
  }

  // 금화 주머니 그림 + 모둠 색 받침
  const sack = color => `<div class="sack" style="background:${color}"><img src="images/sack.png" alt=""></div>`;

  function questionBlock(withAnswer) {
    const q = G.q;
    let body = '';
    if (q.type === '객관식') body = `<div class="choices">${q.choices.map((c, i) =>
      `<div class="choice ${withAnswer ? (c === q.answer ? 'right' : 'dim') : ''}"><span class="n">${i + 1}</span>${esc(c)}</div>`).join('')}</div>`;
    else if (q.type === 'OX') body = `<div class="ox">${['O', 'X'].map(c => `<div class="choice ${withAnswer ? (c === q.answer ? 'right' : 'dim') : ''}">${c}</div>`).join('')}</div>`;
    else if (!withAnswer) body = `<div class="explain" style="text-align:center">${G.offline ? '모둠 화이트보드에 정답을 써요' : '탭에 정답을 직접 써서 내요'}</div>`;
    return `<div class="qmeta"><span>${esc(q.unit)}</span><span>난이도 ${esc(q.level)}</span><span>${esc(q.type)}</span></div>
      <div class="qtext" style="${withAnswer ? 'font-size:32px' : ''}">${esc(q.text)}</div>${body}`;
  }

  let lastOverlayKey = '';
  function renderOverlay() {
    const o = $('#overlay');
    o.innerHTML = '';
    // 튀어나오는 효과는 장면이 바뀔 때 한 번만 (O/X를 누를 때마다 반복되지 않게)
    const ok = G.phase + '|' + G.round;
    const pop = ok !== lastOverlayKey ? 'pop' : '';
    lastOverlayKey = ok;
    if (G.phase === 'question') {
      o.innerHTML = `<div class="card qcard ${pop}">${questionBlock(false)}${G.offline ? `
        <div class="offmarks"><div class="offlab">화이트보드를 들면, 맞힌 모둠을 눌러 O로 바꿔요</div>
        <div class="teamres" style="grid-template-columns:repeat(${G.teamCount},minmax(0,1fr))">${Array.from({ length: G.teamCount }, (_, t) =>
          `<button class="tr mark ${G.marks[t] ? 'on' : ''}" data-mark="${t}" style="background:${G.marks[t] ? '#C8F3DF' : TEAMS[t].soft}" aria-pressed="${!!G.marks[t]}">
            <span data-av="${t}"></span><span class="r">${esc(TEAMS[t].name)}</span><span class="c">${G.marks[t] ? 'O' : 'X'}</span></button>`).join('')}</div></div>` : ''}</div>`;
      o.querySelectorAll('[data-av]').forEach(e => e.replaceWith(avatar(+e.dataset.av, 48)));
      o.querySelectorAll('[data-mark]').forEach(b => b.onclick = () => markTeam(+b.dataset.mark));
    } else if (G.phase === 'reveal') {
      const r = G.reveal;
      const res = r.perTeam.map(p => `<div class="tr" style="background:${TEAMS[p.team].soft}">
          <div data-av="${p.team}"></div><div class="r">${r.offline ? (p.right ? '정답!' : '오답') : `${p.right}/${p.total}`}</div>
          <div class="c">+${p.coins}<span class="coin" style="margin-left:4px"></span></div>
          ${p.allCorrect && !r.offline ? '<div style="font-size:14px;font-weight:800">전원 정답!</div>' : ''}</div>`).join('');
      const wrong = G.q.type === '단답' ? wrongAnswers() : [];
      o.innerHTML = `<div class="card qcard ${pop}">
        ${questionBlock(true)}
        ${G.q.type === '단답' ? `<div class="answer">정답 <b>${esc(G.q.answer)}</b></div>` : ''}
        ${G.q.explain ? `<div class="explain">${esc(G.q.explain)}</div>` : ''}
        ${r.coop ? `<div class="coop">${r.offline ? '맞힌 모둠' : '반 전체 정답률'} ${Math.round(r.classRate * 100)}%! 모든 모둠 +3 코인</div>` : ''}
        <div class="teamres" style="grid-template-columns:repeat(${G.teamCount},minmax(0,1fr))">${res}</div>
        ${wrong.length ? `<div class="chips">오답 중 정답으로 인정할 답: ${wrong.map((w, i) => `<button class="btn small" data-accept="${i}">${esc(w.text)} (${w.n}명)</button>`).join('')}</div>` : ''}
      </div>`;
      o.querySelectorAll('[data-av]').forEach(e => e.replaceWith(avatar(+e.dataset.av, 54, 'happy')));
      o.querySelectorAll('[data-accept]').forEach(b => b.onclick = () => acceptAnswer(wrong[+b.dataset.accept].text));
    }
    renderSide();
  }

  /* 공개 연출과 라운드 결과는 오른쪽 칸에 (지도를 가리지 않게) */
  function renderSide() {
    const side = $('#sidecard');
    side.innerHTML = '';
    $('#board').classList.toggle('hidden', G.phase === 'resolve' || (G.phase === 'bid' && !!G.offline));
    if (G.phase === 'bid' && G.offline) {
      const t = G.offSel;
      const rows = Array.from({ length: G.teamCount }, (_, k) => {
        const b = G.bids[k];
        const st = G.coins[k] < 1 ? '코인 없음 · 쉬어요' : b ? `✓ ${esc(cellsNow()[b.cell].name)} · ${b.coins}개` : '입력 전';
        return `<button class="offteam ${k === t ? 'on' : ''}" data-team="${k}" ${G.coins[k] < 1 ? 'disabled' : ''} style="--c:${TEAMS[k].color}">
          <span data-av="${k}"></span><span class="nm">${esc(TEAMS[k].name)} <small><span class="coin"></span>${G.coins[k]}</small></span><span class="st">${st}</span></button>`;
      }).join('');
      const editor = t === null || t === undefined ? `<div class="msg" style="font-size:22px">모두 입력했으면 [공개 시작 ▶]</div>` : `
        <div class="msg" style="font-size:22px">${esc(teamLabel(t))}</div>
        <div style="text-align:center;font-size:18px">${G.offCell ? `<b>${esc(cellsNow()[G.offCell].name)}</b>에` : '지도에서 반짝이는 칸을 눌러요'}</div>
        <div class="stepper"><button class="btn small" id="offMinus" aria-label="코인 빼기">−</button><span class="num" id="offBet">${G.offBet}</span><button class="btn small" id="offPlus" aria-label="코인 더하기">+</button></div>
        <button class="btn primary" id="offOk" ${G.offCell ? '' : 'disabled'}>확정</button>`;
      side.innerHTML = `<div class="card summary"><div class="msg">화이트보드 걸기 입력</div>
        <div style="font-size:16px;line-height:1.5;text-align:center">모둠을 누르고 → 지도에서 칸 → 코인 수 → 확정</div>
        <div class="offteams">${rows}</div>${editor}</div>`;
      side.querySelectorAll('[data-av]').forEach(e => e.replaceWith(avatar(+e.dataset.av, 36)));
      side.querySelectorAll('[data-team]').forEach(b => b.onclick = () => offlinePickTeam(+b.dataset.team));
      if ($('#offMinus')) {
        $('#offMinus').onclick = () => { G.offBet = Math.max(1, G.offBet - 1); render(); };
        $('#offPlus').onclick = () => { G.offBet = Math.min(G.coins[t], G.offBet + 1); render(); };
        $('#offOk').onclick = offlineConfirm;
      }
    } else if (G.phase === 'bid') {
      side.innerHTML = `<div class="card summary"><div class="msg"><img class="ico" src="images/sack.png" alt="" style="width:56px;height:56px;vertical-align:-14px"> 몰래 걸기 시간!</div>
        <div style="font-size:18px;line-height:1.5;text-align:center">우리 땅과 맞닿은 칸에 코인을 걸어요.<br>모둠원은 투표, 대표가 확정!</div></div>`;
    } else if (G.phase === 'resolve' && G.revealList) {
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
      if (G.phase === 'question') status = G.offline ? (G.marks[r.t] ? 'O 정답' : '화이트보드') : `${r.m.filter(([k]) => G.answers[k] != null).length}/${r.m.length} 제출`;
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
  const crown = () => `<img class="crown" src="images/crown.png" alt="1위"> `;

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
      const done = () => tell('복사했어요. 학습지나 메모장에 붙여넣으세요.');
      const fail = () => tell('자동 복사가 막혀 있어요. 아래 내용을 직접 복사하세요.\n\n' + text);
      try { navigator.clipboard.writeText(text).then(done, fail); } catch (e) { fail(); }
    };
    $('#btnDelete').onclick = async () => {
      if (!await ask('이 방의 기록을 모두 지울까요? 되돌릴 수 없어요.', '지우기')) return;
      db.remove(`rooms/${G.code}`).then(() => { localStorage.removeItem(SAVE_KEY); location.href = location.pathname; });
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

  /* ---------------- 게임 설명(대기 화면 위에 겹쳐 띄움) ---------------- */
  function openRules() { $('#rulesFrame').src = 'rules.html?embed'; $('#rulesLayer').classList.remove('hidden'); }
  function closeRules() { $('#rulesLayer').classList.add('hidden'); $('#rulesFrame').src = 'about:blank'; }
  $('#btnRules').onclick = openRules;
  window.addEventListener('message', e => { if (e.data && e.data.tg === 'closeRules') closeRules(); });

  /* ---------------- 버튼 ---------------- */
  $('#btnNext').onclick = onNext;
  $('#btnPause').onclick = togglePause;
  $('#btnSkip').onclick = skipQuestion;
  $('#btnLast').onclick = jumpToLast;
  $('#btnSound').onclick = () => { sound.on = !sound.on; renderHeader(); };
  $('#btnOffline').onclick = toggleOffline;
  $('#btnEnd').onclick = async () => { if (await ask('게임을 끝내고 최종 결과를 볼까요?', '결과 보기')) finish(); };
  window.addEventListener('beforeunload', save);

  initSetup();
  if (params.has('auto')) { // 시험용: 바로 방 만들기
    const go = () => { if ($('#bank').value.trim()) { createRoom(); } else setTimeout(go, 200); };
    go();
  }
})();
