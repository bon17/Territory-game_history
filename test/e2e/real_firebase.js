// 실제 Firebase(firebase-config.js)로 시험: 익명 로그인, 실시간 DB, 보안 규칙. 시험 방은 끝에 지운다
// 실행: node real_firebase.js <저장소> <스크린샷 폴더>  (firebase SDK 가 설치된 폴더에서)
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const ROOT = process.argv[2], OUT = process.argv[3];
const FB = path.dirname(require.resolve('firebase/package.json', { paths: [process.cwd(), __dirname] }));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.tsv': 'text/plain; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg' };


(async () => {
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
  const b = await chromium.launch(proxy ? { proxy: { server: proxy } } : {});
  const newCtx = async () => {
  const ctx = await b.newContext({ ignoreHTTPSErrors: true });
  await ctx.route('**/*', r => {
    const u = new URL(r.request().url());
    const game = u.hostname === 'game.local';
    if (/firebasedatabase\.app$|googleapis\.com$/.test(u.hostname)) return r.continue();
    if (u.hostname === 'cdn.jsdelivr.net' && u.pathname.includes('/firebase@')) {
      const f = path.join(FB, u.pathname.split('/firebase@10.12.2/')[1]);
      return r.fulfill({ body: fs.readFileSync(f), contentType: 'text/javascript' });
    }
    if (!game) return r.abort();
    const f = path.join(ROOT, decodeURIComponent(u.pathname));
    return fs.existsSync(f) && fs.statSync(f).isFile() ? r.fulfill({ body: fs.readFileSync(f), contentType: MIME[path.extname(f)] }) : r.fulfill({ status: 404, body: '' });
  });
  return ctx;
  };
  const errors = [];

  const page = async (w, h) => { const ctx = await newCtx(); const p = await ctx.newPage(); await p.setViewportSize({ width: w, height: h }); p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); }); return p; };

  // 교사 화면 (Firebase 모드, 가상 학생 + 진짜 학생 2명)
  const host = await page(1600, 900);
  await host.goto('http://game.local/host.html?auto&teams=4&rounds=5&fast&bots');
  try { await host.waitForSelector('#lobby:not(.hidden)', { timeout: 20000 }); }
  catch (e) {
    await host.screenshot({ path: `${OUT}/fb_host_stuck.png` });
    console.log('STUCK. modal:', await host.$eval('.modal-text', el => el.textContent).catch(() => '(없음)'));
    console.log('errors', errors);
    const reqs = []; host.on('requestfailed', q => reqs.push(q.url() + ' ' + (q.failure() || {}).errorText));
    await host.waitForTimeout(3000); console.log('failed requests', reqs.slice(0, 10));
    throw e;
  }
  const code = (await host.textContent('#roomCode')).trim();
  console.log('mode', await host.textContent('#modeInfo').catch(() => ''), '| room', code);

  const kids = [];
  for (const [team, no] of [[0, 1], [1, 1]]) {
    const k = await page(1280, 800);
    await k.goto(`http://game.local/play.html?room=${code}`);
    try { await k.waitForSelector('.pickteam', { timeout: 15000 }); }
    catch (e) {
      await k.screenshot({ path: `${OUT}/fb_kid_stuck.png` });
      console.log('KID STUCK err:', await k.$eval('#err', el => el.textContent).catch(() => '(없음)'), '| main:', (await k.textContent('main').catch(() => '')).slice(0, 200));
      console.log('state via host:', await host.evaluate(c => firebase.database().ref('rooms/' + c + '/state/phase').once('value').then(s => s.val(), e => 'ERR ' + e.message), code));
      console.log('state via kid:', await k.evaluate(c => firebase.database().ref('rooms/' + c + '/state/phase').once('value').then(s => s.val(), e => 'ERR ' + e.message), code));
      console.log('errors', errors.filter(x => !/pretendard|fonts/.test(x)).slice(0, 8));
      throw e;
    }
    await k.click(`.pickteam >> nth=${team}`); await k.click(`#nums button >> nth=${no - 1}`); await k.click('#join');
    await k.waitForSelector('#barWho', { timeout: 10000 });
    kids.push(k);
  }
  await host.waitForTimeout(1500);
  console.log('lobby chips', await host.$$eval('#lobby .pchip', a => a.length));

  // 보안 규칙 시험: 학생 기기에서 하면 안 되는 일
  const attempt = (p, fn) => p.evaluate(fn).then(() => 'ALLOWED', e => 'denied');
  const kid = kids[0];
  const myKey = await kid.evaluate(() => JSON.parse(localStorage.getItem('tg-me')).key);
  const otherKey = await kids[1].evaluate(() => JSON.parse(localStorage.getItem('tg-me')).key);
  const r = {};
  r.writeState = await attempt(kid, c => firebase.database().ref(`rooms/${c}/state/phase`).set('final'), code);
  r.writeMissions = await attempt(kid, c => firebase.database().ref(`rooms/${c}/missions/0`).set('hack'), code);
  r.otherAnswer = await kid.evaluate(([c, k]) => firebase.database().ref(`rooms/${c}/answers/0/${k}`).set('O').then(() => 'ALLOWED', () => 'denied'), [code, otherKey]);
  r.stealSeat = await kid.evaluate(([c, k]) => firebase.database().ref(`rooms/${c}/players/${k}`).set({ team: 3, no: 5, uid: firebase.auth().currentUser.uid }).then(() => 'ALLOWED', () => 'denied'), [code, otherKey]);
  r.deleteRoom = await attempt(kid, c => firebase.database().ref(`rooms/${c}`).remove(), code);
  r.listRooms = await kid.evaluate(() => firebase.database().ref('rooms').once('value').then(() => 'ALLOWED', () => 'denied'));
  console.log('보안 규칙(모두 denied 여야 함):', JSON.stringify(r));

  // 게임 진행
  await host.click('#btnStart');
  const state = () => kid.evaluate(c => firebase.database().ref(`rooms/${c}/state`).once('value').then(s => s.val()), code);
  let answered = -1, bidDone = -1, shot = false, guard = 0, ownTwice = null;
  while (guard++ < 600) {
    const s = await state();
    if (s.phase === 'final') break;
    if (s.phase === 'question' && answered !== s.round) {
      answered = s.round;
      await kid.waitForTimeout(400);
      for (const k of kids) {
        if (await k.$('.opt')) { await k.click('.opt >> nth=0'); await k.click('#send'); }
        else if (await k.$('#ans')) { await k.fill('#ans', '대류ㄱ봉소ㅐ령'); await k.click('#send'); }
      }
      if (s.round === 1) {
        await kid.waitForTimeout(500);
        const first = await kid.evaluate(([c, k]) => firebase.database().ref(`rooms/${c}/answers/1/${k}`).once('value').then(s => s.val()), [code, myKey]);
        ownTwice = 'first=' + JSON.stringify(first) + ' second=' + await kid.evaluate(([c, k]) => firebase.database().ref(`rooms/${c}/answers/1/${k}`).set('X').then(() => 'ALLOWED', () => 'denied'), [code, myKey]);
        if (!shot) { shot = true; await host.screenshot({ path: `${OUT}/fb_host_q1.png` }); await kid.screenshot({ path: `${OUT}/fb_kid_q1.png` }); }
      }
    }
    if (s.phase === 'reveal' || s.phase === 'resolved') { await host.click('#btnNext').catch(() => {}); await host.waitForTimeout(400); }
    if (s.phase === 'bid' && bidDone !== s.round) {
      bidDone = s.round;
      await kid.waitForTimeout(500);
      for (const k of kids) {
        const legal = await k.$$('svg#pmap g.cell.legal');
        if (legal.length) await legal[0].dispatchEvent('click');
        await k.waitForTimeout(150);
        if (await k.$('#confirm')) await k.click('#confirm');
      }
    }
    await host.waitForTimeout(250);
  }
  const s = await state();
  console.log('답 두 번 내기(denied 여야 함):', ownTwice);
  console.log('final', s.phase, JSON.stringify((s.final || []).map(f => [f.team, f.total])));
  await host.screenshot({ path: `${OUT}/fb_host_final.png` });
  // 방 삭제(교사)
  await host.click('#btnDelete');
  await host.click('.modal .primary');
  await host.waitForTimeout(1500);
  const gone = await kid.evaluate(c => firebase.database().ref(`rooms/${c}`).once('value').then(s => s.exists()), code).catch(() => 'read denied');
  console.log('방 삭제 후 남은 데이터:', gone);
  console.log('errors', errors.length ? errors.slice(0, 8) : 'none');
  await b.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
