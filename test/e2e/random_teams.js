// 랜덤 배정 모드: 출석번호 입장 → 섞기 → 교사가 옮기기 → 내보내기 → 시작
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const ROOT = process.argv[2], OUT = process.argv[3];
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.tsv': 'text/plain; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg' };
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext();
  await ctx.route('**/*', r => { const u = new URL(r.request().url()); if (u.hostname !== 'game.local') return r.abort();
    const f = path.join(ROOT, decodeURIComponent(u.pathname)); return fs.existsSync(f) && fs.statSync(f).isFile() ? r.fulfill({ body: fs.readFileSync(f), contentType: MIME[path.extname(f)] }) : r.fulfill({ status: 404, body: '' }); });
  const errors = [];
  const host = await ctx.newPage(); host.on('pageerror', e => errors.push('host ' + e.message));
  await host.setViewportSize({ width: 1600, height: 900 });
  await host.goto('http://game.local/host.html?demo&auto&assign=random&teams=4&fast');
  await host.waitForSelector('#lobby:not(.hidden)');
  const code = await host.textContent('#roomCode');
  const kids = [];
  for (const no of [5, 12, 23]) {
    const k = await ctx.newPage(); k.on('pageerror', e => errors.push('kid ' + e.message));
    await k.setViewportSize({ width: 1280, height: 800 });
    await k.goto(`http://game.local/play.html?room=${code}`);
    await k.waitForSelector('#no');
    await k.fill('#no', String(no)); await k.click('#join');
    kids.push(k);
  }
  await host.waitForTimeout(500);
  await kids[0].screenshot({ path: `${OUT}/t1_kid_wait.png` });
  await host.screenshot({ path: `${OUT}/t1_host_before.png` });
  const teamOf = async k => (await k.textContent('#barWho')).trim();
  console.log('before', await Promise.all(kids.map(teamOf)));

  await host.click('#btnShuffle');
  await host.waitForTimeout(500);
  await host.screenshot({ path: `${OUT}/t2_host_shuffled.png` });
  await kids[0].screenshot({ path: `${OUT}/t2_kid_assigned.png` });
  console.log('after shuffle', await Promise.all(kids.map(teamOf)));

  // 교사 조정: 첫 학생(5번) 칸을 눌러 4모둠으로 옮기기
  await host.click('.pchip:has-text("5번")');
  await host.waitForTimeout(200);
  await host.screenshot({ path: `${OUT}/t3_host_modal.png` });
  await host.click('.modal button:has-text("4모둠")');
  await host.waitForTimeout(400);
  console.log('after move', await Promise.all(kids.map(teamOf)));

  // 내보내기: 23번
  await host.click('.pchip:has-text("23번")');
  await host.click('.modal button:has-text("내보내기")');
  await host.click('.modal .primary');
  await host.waitForTimeout(400);
  await kids[2].screenshot({ path: `${OUT}/t4_kid_kicked.png` });
  console.log('kicked kid sees join screen:', !!(await kids[2].$('#code')));

  // 다시 들어오기(같은 번호) → 모둠 없음 → 시작하면 자동 배정
  await kids[2].fill('#code', code); await kids[2].click('#go');
  await kids[2].waitForSelector('#no'); await kids[2].fill('#no', '23'); await kids[2].click('#join');
  await host.waitForTimeout(400);
  await host.click('#btnStart');
  await host.waitForTimeout(300);
  await host.screenshot({ path: `${OUT}/t5_host_start_modal.png` });
  await host.click('.modal .primary');
  await host.waitForTimeout(800);
  console.log('in game', await Promise.all(kids.map(teamOf)));
  await kids[2].screenshot({ path: `${OUT}/t6_kid_question.png` });
  const st = await host.evaluate(c => JSON.parse(localStorage.getItem('tg:rooms/' + c + '/state')), code);
  console.log('phase', st.phase, 'assign', st.assign);
  console.log('errors', errors.length ? errors : 'none');
  await b.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
