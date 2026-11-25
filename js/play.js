/* 학생 탭 화면. 자기 답, 투표, (대표일 때) 걸기만 쓴다. */
(function () {
  const { TEAMS, teamLabel, buildNamedMap, drawMap, avatar, esc, SFX, sound } = Common;
  const db = Backend.create();
  const $ = s => document.querySelector(s);
  const main = $('#main');
  const params = new URLSearchParams(location.search);
  sound.on = false; // 탭은 기본으로 조용히

  let me = null;        // {room, no, key}  (key 는 기기마다 고유: 모둠을 옮겨도 그대로)
  let myTeam = null;    // 지금 내 모둠 (선생님이 옮기면 바뀜, 랜덤 모드에서 섞기 전엔 null)
  let players = {};     // 방의 모든 학생 {key: {team, no}}
  let S = null;         // TV가 공유한 상태
  let screenKey = '';
  let myAnswer = null, mission = null, teamVotes = {}, myBid = null;
  let sel = null, bet = 1, draft = null, soundKey = '';
  const subs = {};
  function listen(name, path, cb) { if (subs[name]) subs[name](); subs[name] = db.on(path, cb); }
  const R = p => `rooms/${me.room}/${p}`;
  // 데모 모드에서는 창마다 다른 학생이므로 창별 저장소를 씀
  const store = db.mode === 'demo' ? sessionStorage : localStorage;
  const ME_KEY = 'tg-me' + (params.get('slot') || '');

  /* ---------------- 접속 ---------------- */
  function joinScreen(err, room) {
    $('#bar').classList.add('hidden');
    main.innerHTML = `<div class="card panel center">
      <div class="big">역사 섬 땅따먹기</div>
      <div class="mid">TV에 보이는 방 코드 4자리를 넣어요</div>
      <input class="codeinput" id="code" inputmode="numeric" maxlength="4" autocomplete="off" aria-label="방 코드" value="${esc(room || params.get('room') || '')}">
      <button class="btn primary" id="go">들어가기</button>
      <div class="err" id="err">${esc(err || '')}</div></div>`;
    const go = async () => {
      const code = $('#code').value.trim();
      if (!/^\d{4}$/.test(code)) { $('#err').textContent = '숫자 4자리를 넣어요'; return; }
      const st = await db.once(`rooms/${code}/state`);
      if (!st) { $('#err').textContent = '방을 찾을 수 없어요. 코드를 다시 확인해요'; return; }
      if (st.assign === 'random') numberScreen(code); else pickScreen(code, st.teamCount);
    };
    $('#go').onclick = go;
    $('#code').addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
    if (params.get('room') && !room) go();
  }

  const newKey = () => 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  async function enter(code, key, data) {
    if (subs.players) subs.players();
    me = { room: code, no: data.no, key };
    await db.set(`rooms/${code}/players/${key}`, Object.assign({ ts: Date.now() }, data));
    try { store.setItem(ME_KEY, JSON.stringify(me)); } catch (e) { /* 저장 불가 */ }
    SFX.ok();
    startPlaying();
  }

  /* 랜덤 배정 모드: 출석번호만 넣는다 */
  function numberScreen(code) {
    let taken = {};
    main.innerHTML = `<div class="card panel center">
      <div class="big">출석번호를 넣어요</div>
      <div class="mid">모둠은 선생님이 랜덤으로 정해 줘요</div>
      <input class="codeinput" id="no" inputmode="numeric" maxlength="2" autocomplete="off" aria-label="출석번호" style="width:200px">
      <button class="btn go" id="join" style="font-size:28px">입장!</button>
      <div class="err" id="err"></div></div>`;
    listen('players', `rooms/${code}/players`, p => { taken = p || {}; });
    const go = () => {
      const no = +$('#no').value.trim();
      if (!(no >= 1 && no <= 40)) { $('#err').textContent = '1~40 사이 숫자를 넣어요'; return; }
      const same = Object.entries(taken).find(([, p]) => p && !p.bot && p.no === no);
      // 같은 번호가 이미 있으면 그 자리로 다시 들어간다(끊겼다 다시 들어온 경우)
      if (same) enter(code, same[0], { team: same[1].team ?? null, no });
      else enter(code, newKey(), { team: null, no });
    };
    $('#join').onclick = go;
    $('#no').addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
    $('#no').focus();
  }

  function pickScreen(code, teamCount) {
    let team = null, no = null, taken = {};
    const holder = (t, n) => Object.entries(taken).find(([, p]) => p && !p.bot && p.team === t && p.no === n);
    main.innerHTML = `<div class="card panel">
      <div class="big">우리 모둠을 골라요</div>
      <div class="pickgrid" id="teams"></div>
      <div class="big" style="font-size:26px">내 번호</div>
      <div class="nums" id="nums"></div>
      <button class="btn go submit" id="join" disabled>입장!</button>
      <div class="err" id="err"></div></div>`;
    const tbox = $('#teams');
    for (let t = 0; t < teamCount; t++) {
      const b = document.createElement('button');
      b.className = 'pickteam'; b.setAttribute('aria-pressed', 'false');
      b.style.background = TEAMS[t].soft;
      b.appendChild(avatar(t, 76));
      b.insertAdjacentHTML('beforeend', `<span>${esc(teamLabel(t))}</span>`);
      b.onclick = () => { team = t; tbox.querySelectorAll('button').forEach((x, i) => x.setAttribute('aria-pressed', i === t)); drawNums(); check(); SFX.tap(); };
      tbox.appendChild(b);
    }
    const drawNums = () => {
      $('#nums').innerHTML = [1, 2, 3, 4, 5, 6].map(n => {
        const tk = team !== null && holder(team, n);
        return `<button data-n="${n}" aria-pressed="${n === no}" class="${tk ? 'taken' : ''}" aria-label="${n}번${tk ? ' (이미 있음)' : ''}">${n}</button>`;
      }).join('');
      $('#nums').querySelectorAll('button').forEach(b => b.onclick = () => { no = +b.dataset.n; drawNums(); check(); SFX.tap(); });
    };
    const check = () => {
      $('#join').disabled = team === null || no === null;
      $('#err').textContent = team !== null && no !== null && holder(team, no) ? '이미 누가 이 번호로 들어와 있어요. 본인이 맞으면 그대로 입장해요' : '';
    };
    listen('players', `rooms/${code}/players`, p => { taken = p || {}; if (team !== null) drawNums(); check(); });
    drawNums();
    $('#join').onclick = () => {
      const same = holder(team, no);
      enter(code, same ? same[0] : newKey(), { team, no });
    };
  }

  /* ---------------- 게임 ---------------- */
  function startPlaying() {
    $('#bar').classList.remove('hidden');
    myTeam = undefined;
    listen('players', R('players'), p => {
      players = p || {};
      const mine = players[me.key];
      if (!mine) { // 선생님이 내보냄 (또는 저장된 자리가 사라짐)
        store.removeItem(ME_KEY);
        ['state', 'mission', 'answer', 'votes', 'bid', 'players'].forEach(n => { if (subs[n]) subs[n](); delete subs[n]; });
        const room = me.room; me = null; S = null; screenKey = ''; myTeam = null;
        return joinScreen('선생님이 다시 들어오라고 했어요. 다시 입장해 주세요', room);
      }
      const t = mine.team ?? null;
      if (t !== myTeam) { const first = myTeam === undefined; myTeam = t; onTeamChange(first); }
      else if (S && S.phase === 'bid') countVotes();
    });
    listen('state', R('state'), st => {
      if (!st) { store.removeItem(ME_KEY); me = null; screenKey = ''; return joinScreen('게임이 끝났거나 방이 사라졌어요'); }
      const prevRound = S ? S.round : null;
      S = st;
      if (S.round !== prevRound) subscribeRound();
      if (myTeam !== undefined) render();
    });
  }
  /** 모둠이 정해지거나 바뀌었을 때: 위 막대, 비밀 미션, 이번 라운드 구독을 다시 */
  function onTeamChange(first) {
    $('#barAv').innerHTML = '';
    if (myTeam === null) {
      $('#barAv').innerHTML = '<div class="avatar" style="width:48px;height:48px;background:#fff;color:var(--ink);font-size:26px">?</div>';
      $('#barWho').innerHTML = `모둠 정하는 중<small>${me.no}번</small>`;
      $('#bar').style.borderLeft = '12px solid #ccc';
    } else {
      $('#barAv').appendChild(avatar(myTeam, 48));
      $('#barWho').innerHTML = `${esc(teamLabel(myTeam))}<small>${me.no}번</small>`;
      $('#bar').style.borderLeft = `12px solid ${TEAMS[myTeam].color}`;
      if (!first) SFX.win();
    }
    mission = null;
    if (myTeam !== null) listen('mission', R(`missions/${myTeam}`), m => { mission = m; if (S && S.phase === 'lobby') render(true); });
    if (S) { subscribeRound(); render(true); }
  }
  function subscribeRound() {
    if (!S || myTeam === undefined) return;
    listen('answer', R(`answers/${S.round}/${me.key}`), a => { myAnswer = a; if (S.phase === 'question') render(); });
    listen('votes', R(`votes/${S.round}`), v => { lastVotes = v || {}; countVotes(); });
    if (myTeam !== null) listen('bid', R(`bids/${S.round}/${myTeam}`), b => { myBid = b; if (S.phase === 'bid') render(true); });
  }
  let lastVotes = {};
  function countVotes() {
    teamVotes = {};
    for (const [k, c] of Object.entries(lastVotes)) if (c && players[k] && players[k].team === myTeam) teamVotes[c] = (teamVotes[c] || 0) + 1;
    if (S && S.phase === 'bid') updateBid();
  }

  function render(force) {
    const key = `${S.phase}|${S.round}`;
    $('#barCoins').innerHTML = `<span class="coin"></span> ${S.coins && myTeam !== null ? S.coins[myTeam] : 0}`;
    if (key !== screenKey || force) {
      if (key !== screenKey) { sel = null; bet = 1; draft = null; }
      screenKey = key;
      build();
    } else if (S.phase === 'question' || S.phase === 'reveal' || S.phase === 'resolve') build();
    else if (S.phase === 'bid') updateBid();
  }

  function build() {
    const p = S.phase;
    main.innerHTML = '';
    if (myTeam === null) return waitTeam();
    if (p === 'lobby') return lobby();
    if (p === 'question') return question();
    if (p === 'reveal') return result();
    if (p === 'bid') return bid();
    if (p === 'resolve' || p === 'resolved') return watch();
    if (p === 'final') return finalScreen();
  }

  function waitTeam() {
    const c = document.createElement('div');
    c.className = 'card panel center';
    c.innerHTML = `<div class="chars-mini">${TEAMS.slice(0, S.teamCount).map((_, t) => `<span data-av="${t}"></span>`).join('')}</div>
      <div class="big">${me.no}번, 입장 완료!</div>
      <div class="mid">선생님이 모둠을 랜덤으로 섞으면<br>우리 모둠이 여기에 나와요</div>`;
    c.querySelectorAll('[data-av]').forEach((e, k) => { const a = avatar(+e.dataset.av, 72); a.classList.add('bounce'); a.style.animationDelay = (k * 0.12) + 's'; e.replaceWith(a); });
    main.appendChild(c);
  }

  function lobby() {
    const c = document.createElement('div');
    c.className = 'card panel center';
    const av = avatar(myTeam, 180); av.classList.add('bounce');
    c.appendChild(av);
    c.insertAdjacentHTML('beforeend', `<div class="big">${esc(teamLabel(myTeam))} ${me.no}번!</div>
      <div class="mid">선생님이 시작할 때까지 기다려요</div>`);
    main.appendChild(c);
    main.appendChild(missionCard());
  }

  function missionCard() {
    const d = document.createElement('div');
    d.className = 'card envelope';
    if (!mission) { d.classList.add('hidden'); return d; }
    let open = false;
    const draw = () => {
      d.innerHTML = open
        ? `<div style="font-size:16px;color:var(--ink2)">우리 모둠 비밀 미션 (다른 모둠에게 보여 주지 마요!)</div><div class="m">${esc(mission)}</div><button class="btn small">접기</button>`
        : `<img class="ico bounce" src="images/letter.png" alt="" style="width:84px;height:84px;margin:0 auto"><div class="m">비밀 미션 편지가 도착했어요</div><button class="btn small primary">열어 보기</button>`;
      d.querySelector('button').onclick = () => { open = !open; draw(); };
    };
    draw();
    return d;
  }

  function question() {
    const q = S.q;
    const c = document.createElement('div');
    c.className = 'card panel';
    const meta = `<div class="qmeta"><span>${S.round === 0 ? '연습' : `${S.round}번째 문제`}</span><span>${esc(q.unit)}</span><span>난이도 ${esc(q.level)}</span></div>`;
    if (myAnswer != null) {
      c.classList.add('center');
      const av = avatar(myTeam, 140); av.classList.add('bounce');
      c.innerHTML = meta;
      c.appendChild(av);
      c.insertAdjacentHTML('beforeend', `<div class="big">제출 완료!</div><div class="mid">내 답: <b>${esc(myAnswer)}</b><br>탭을 내려놓고 TV를 봐요</div>`);
      main.appendChild(c);
      return;
    }
    let body = '';
    if (q.type === '객관식') body = `<div class="opts">${q.choices.map((x, i) => `<button class="opt" data-v="${esc(x)}" aria-pressed="${draft === x}"><span class="n">${i + 1}</span>${esc(x)}</button>`).join('')}</div>`;
    else if (q.type === 'OX') body = `<div class="oxrow">${['O', 'X'].map(x => `<button class="opt" data-v="${x}" aria-pressed="${draft === x}">${x}</button>`).join('')}</div>`;
    else body = `<input class="answerbox" id="ans" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="정답을 써요" aria-label="정답 입력" value="${esc(draft || '')}">`;
    c.innerHTML = `${meta}<div class="qtext">${esc(q.text)}</div>${body}<button class="btn go submit" id="send" ${q.type !== '단답' && draft == null ? 'disabled' : ''}>제출하기</button>`;
    main.appendChild(c);
    c.querySelectorAll('.opt').forEach(b => b.onclick = () => {
      draft = b.dataset.v; SFX.tap();
      c.querySelectorAll('.opt').forEach(x => x.setAttribute('aria-pressed', x === b));
      $('#send').disabled = false;
    });
    const inp = $('#ans');
    if (inp) {
      inp.addEventListener('input', () => { draft = inp.value; });
      inp.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) send(); });
    }
    $('#send').onclick = send;
  }
  function send() {
    const v = S.q.type === '단답' ? ($('#ans').value || '').trim() : draft;
    if (!v) return;
    if (S.phase !== 'question') return;
    db.set(R(`answers/${S.round}/${me.key}`), v);
    SFX.ok();
  }

  function result() {
    const ok = S.correct ? !!S.correct[me.key] : false;
    const answered = myAnswer != null;
    const tr = S.teamResults ? S.teamResults[myTeam] : null;
    const c = document.createElement('div');
    c.className = 'card panel center pop';
    c.innerHTML = `<div class="mark ${ok ? 'ok' : 'no'}">${ok ? 'O' : 'X'}</div>
      <div class="big">${ok ? '정답!' : answered ? '아쉬워요' : '시간이 끝났어요'}</div>
      <div class="mid">정답: <b>${esc(S.answer)}</b>${answered && !ok ? `<br>내 답: ${esc(myAnswer)}` : ''}</div>
      ${tr ? `<div class="big" style="font-size:26px">우리 모둠 ${tr.right}/${tr.total} 정답 → <span class="coin"></span> +${tr.coins}</div>` : ''}
      ${tr && tr.allCorrect ? '<div class="chip" style="background:#FFD84D">전원 정답 보너스 +2</div>' : ''}
      ${S.coop ? '<div class="chip" style="background:#7BE0B8">반 전체 70% 넘음! 모두 +3</div>' : ''}`;
    if (ok) { const av = avatar(myTeam, 110, 'happy'); av.classList.add('bounce'); c.prepend(av); }
    main.appendChild(c);
    if (soundKey !== screenKey) { soundKey = screenKey; (ok ? SFX.ok : SFX.no)(); }
  }

  function cellsFromState() {
    const cells = buildNamedMap(S.teamCount);
    for (const c of Object.values(cells)) c.owner = (S.owners && S.owners[c.id] != null) ? S.owners[c.id] : null;
    return cells;
  }
  const isRep = () => S.reps && S.reps[myTeam] === me.key;

  function bid() {
    const coins = S.coins[myTeam];
    const repKey = S.reps ? S.reps[myTeam] : null;
    const repNo = repKey && players[repKey] ? (players[repKey].bot ? '가상' : players[repKey].no) : '';
    const wrap = document.createElement('div');
    wrap.className = 'bidlayout';
    wrap.innerHTML = `<div class="card mapbox"><svg class="map" id="pmap" role="img" aria-label="땅 지도"></svg></div><div class="card side" id="side"></div>`;
    main.appendChild(wrap);
    const side = $('#side');
    if (myBid) {
      side.innerHTML = `<div class="big">확정 완료!</div><div class="mid">${esc(nameOf(myBid.cell))}에 <span class="coin"></span> ${myBid.coins}개를 걸었어요<br>TV를 봐요</div>`;
    } else if (coins < 1) {
      side.innerHTML = `<div class="big">코인이 없어요</div><div class="mid">이번 라운드는 쉬어요. 다음 문제를 맞혀서 코인을 모아요!</div>`;
    } else if (isRep()) {
      side.innerHTML = `<div class="big" style="font-size:28px">내가 이번 대표!</div>
        <div class="mid">반짝이는 칸을 눌러 고르고,<br>몇 개 걸지 정해서 확정해요<br><small>숫자는 친구들이 투표한 수예요</small></div>
        <div class="selname" id="selname">칸을 골라요</div>
        <div class="stepper"><button id="minus" aria-label="코인 빼기">−</button><div class="val num" id="betv">${bet}</div><button id="plus" aria-label="코인 더하기">+</button></div>
        <div class="mid" style="font-size:16px">가진 코인 ${coins}개 · 걸면 이기든 지든 사라져요</div>
        <button class="btn go submit" id="confirm" disabled>확정!</button>`;
      $('#minus').onclick = () => { bet = Math.max(1, bet - 1); updateBid(); SFX.tap(); };
      $('#plus').onclick = () => { bet = Math.min(coins, bet + 1); updateBid(); SFX.tap(); };
      $('#confirm').onclick = () => {
        if (!sel || S.phase !== 'bid') return;
        db.set(R(`bids/${S.round}/${myTeam}`), { cell: sel, coins: Math.min(bet, coins), by: me.key });
        SFX.coin();
      };
    } else {
      side.innerHTML = `<div class="big" style="font-size:28px">대표는 ${esc(repNo)}번 친구</div>
        <div class="mid">가고 싶은 칸을 눌러서 투표해요!<br>대표가 보고 최종으로 정해요</div><div class="selname" id="selname"></div>`;
    }
    updateBid();
  }
  function nameOf(id) { const c = buildNamedMap(S.teamCount)[id]; return c ? c.name : id; }
  function updateBid() {
    const svg = $('#pmap');
    if (!svg) return;
    const canPick = !myBid && S.coins[myTeam] >= 1;
    drawMap(svg, cellsFromState(), {
      legal: canPick ? (S.legal && S.legal[myTeam]) || [] : [],
      selected: sel, votes: teamVotes,
      onPick: canPick ? (id => {
        sel = id; SFX.tap();
        db.set(R(`votes/${S.round}/${me.key}`), id);
        updateBid();
      }) : null
    });
    const sn = $('#selname');
    if (sn) sn.textContent = sel ? `${nameOf(sel)}${cellsFromState()[sel].owner === myTeam ? ' (우리 땅 지키기)' : ''}` : (isRep() ? '칸을 골라요' : '');
    const bv = $('#betv'); if (bv) bv.textContent = bet;
    const cf = $('#confirm'); if (cf) cf.disabled = !sel;
  }

  function watch() {
    const c = document.createElement('div');
    c.className = 'card panel center';
    c.innerHTML = `<div class="big">${S.phase === 'resolve' ? '두근두근! TV를 봐요' : '이번 라운드 끝!'}</div>
      <div class="mid">${S.phase === 'resolve' ? '누가 어디에 얼마나 걸었을까?' : '다음 문제를 기다려요'}</div>
      <div style="width:min(560px,100%)"><svg class="map" id="wmap" role="img" aria-label="땅 지도"></svg></div>`;
    main.appendChild(c);
    drawMap($('#wmap'), cellsFromState(), { highlight: S.reveal && S.reveal.item ? S.reveal.item.cell : null });
  }

  function finalScreen() {
    const mine = (S.final || []).find(f => f.team === myTeam);
    const c = document.createElement('div');
    c.className = 'card panel center pop';
    if (!mine) { c.innerHTML = '<div class="big">게임 끝!</div>'; main.appendChild(c); return; }
    const av = avatar(myTeam, 160, mine.place === 1 ? 'happy' : null);
    if (mine.place === 1) av.classList.add('bounce');
    c.appendChild(av);
    if (mine.place === 1) c.insertAdjacentHTML('afterbegin', '<img class="ico" src="images/chest.png" alt="" style="width:120px;height:120px">');
    c.insertAdjacentHTML('beforeend', `<div class="big">${mine.place}등! ${mine.total}점</div>
      <div class="mid">땅 ${mine.land}점 + 가장 큰 땅 ${mine.region}점 + 비밀 미션 ${mine.mission}점<br>
      미션 "${esc(mine.missionText)}" ${mine.mission ? '성공!' : '실패'}</div><div class="mid">수고했어요! 오늘 틀린 문제는 꼭 다시 봐요</div>`);
    main.appendChild(c);
    if (mine.place === 1) SFX.win();
  }

  /* ---------------- 타이머 ---------------- */
  setInterval(() => {
    const el = $('#ptimer');
    if (!S || !(S.phase === 'question' || S.phase === 'bid') || S.paused) { el.classList.add('hidden'); return; }
    const left = Math.max(0, Math.ceil((S.deadline - Date.now()) / 1000));
    el.innerHTML = `<img class="ico" src="images/hourglass.png" alt="" style="width:24px;height:24px"> ${left}`; el.classList.remove('hidden'); el.classList.toggle('hurry', left <= 5);
  }, 250);

  /* ---------------- 시작 ---------------- */
  async function autoJoin(room, team, no) {
    const st = await db.once(`rooms/${room}/state`);
    if (!st) return joinScreen('방을 찾을 수 없어요');
    enter(room, `auto${team}_${no}`, { team: st.assign === 'random' ? null : team, no: st.assign === 'random' ? team * 10 + no : no });
  }

  (async function boot() {
    if (params.get('room') && params.get('team') !== null && params.get('no')) {
      return autoJoin(params.get('room'), +params.get('team'), +params.get('no'));
    }
    let saved = null;
    try { saved = JSON.parse(store.getItem(ME_KEY) || 'null'); } catch (e) { /* 없음 */ }
    const room = params.get('room');
    if (saved && (!room || room === saved.room) && !params.has('new')) {
      const st = await db.once(`rooms/${saved.room}/state`);
      if (st) { me = saved; return startPlaying(); }
    }
    joinScreen();
  })();
})();
