// 대표 대책: ① 대표가 가만히 있으면 15초 뒤 다른 모둠원이 확정 ② 대표 탭이 꺼지면 다음 라운드 대표에서 빠짐
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const ROOT = process.argv[2], OUT = process.argv[3];
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.tsv': 'text/plain; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg' };
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext();
  await ctx.route('**/*', r => {
    const u = new URL(r.request().url()); if (u.hostname !== 'game.local') return r.abort();
    const f = path.join(ROOT, decodeURIComponent(u.pathname));
    return fs.existsSync(f) && fs.statSync(f).isFile() ? r.fulfill({ body: fs.readFileSync(f), contentType: MIME[path.extname(f)] }) : r.fulfill({ status: 404, body: '' });
  });
  const errors = [];
  const host = await ctx.newPage(); host.on('pageerror', e => errors.push('host ' + e.message));
  await host.setViewportSize({ width: 1600, height: 900 });
  await host.goto('http://game.local/host.html?demo&auto&teams=4&rounds=5&fast');
  await host.waitForSelector('#lobby:not(.hidden)');
  const code = (await host.textContent('#roomCode')).trim();
  const kid = async (team, no, slot) => {
    const k = await ctx.newPage(); k.on('pageerror', e => errors.push('kid ' + e.message));
    await k.setViewportSize({ width: 1280, height: 800 });
    await k.goto(`http://game.local/play.html?demo&room=${code}&team=${team}&no=${no}&slot=${slot}`);
    await k.waitForSelector('#barWho'); return k;
  };
  const A = await kid(0, 1, 'a'), B = await kid(0, 2, 'b'), C = await kid(1, 1, 'c');
  await host.waitForTimeout(500);
  const state = () => host.evaluate(c => JSON.parse(localStorage.getItem('tg:rooms/' + c + '/state')), code);
  const waitPhase = async ph => { for (let i = 0; i < 300; i++) { const s = await state(); if (s.phase === ph) return s; await host.waitForTimeout(100); } throw new Error('phase ' + ph); };
  const answerAll = async ks => {
    for (const k of ks) {
      await k.waitForSelector('.opt, #ans', { timeout: 5000 }).catch(() => {});
      if (await k.$('.opt')) { await k.click('.opt >> nth=0'); await k.click('#send'); }
      else if (await k.$('#ans')) { await k.fill('#ans', 'x'); await k.click('#send'); }
    }
  };

  await host.click('#btnStart');
  // ① 연습 라운드: 1모둠 대표는 A(1번). A는 가만히 있고, 15초(빠르게 3초) 뒤 B가 확정
  await waitPhase('question'); await answerAll([A, B, C]);
  await waitPhase('reveal'); await host.click('#btnNext');
  let s = await waitPhase('bid');
  console.log('연습 라운드 1모둠 대표:', s.reps[0] === 'auto0_1' ? 'A(1번)' : s.reps[0]);
  console.log('B 화면, 열리기 전 확정 버튼 있음?', !!(await B.$('#confirm')));
  await B.waitForSelector('#confirm', { timeout: 8000 });
  await B.screenshot({ path: `${OUT}/rep_open_B.png` });
  const legal = await B.$$('svg#pmap g.cell.legal'); await legal[0].dispatchEvent('click'); await B.click('#confirm');
  const cl = await C.$$('svg#pmap g.cell.legal'); if (cl.length) { await cl[0].dispatchEvent('click'); await C.click('#confirm').catch(() => {}); }
  await host.waitForTimeout(400);
  const bid0 = await host.evaluate(c => JSON.parse(localStorage.getItem('tg:rooms/' + c + '/bids/0/0') || 'null'), code);
  console.log('1모둠 걸기를 누가 확정?', bid0 && bid0.by === 'auto0_2' ? 'B(2번) ✓' : JSON.stringify(bid0));
  await waitPhase('resolved');

  // ② A 탭을 닫고 26초 기다림 → 다음 라운드 대표에서 A가 빠져야 함
  await A.close();
  await host.click('#btnNext');
  await waitPhase('question'); await answerAll([B, C]);
  await waitPhase('reveal');
  await host.waitForTimeout(26500);
  await host.screenshot({ path: `${OUT}/rep_host_reveal.png` });
  await host.click('#btnNext');
  s = await waitPhase('bid');
  console.log('1라운드 1모둠 대표 (A가 꺼진 뒤):', s.reps[0] === 'auto0_2' ? 'B(2번) ✓' : s.reps[0]);
  await B.waitForTimeout(300);
  console.log('B 화면: 내가 대표?', (await B.textContent('#side')).includes('내가 이번 대표'));
  console.log('errors', errors.length ? errors : 'none');
  await b.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
