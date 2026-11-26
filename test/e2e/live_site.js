// 배포된 실제 사이트 확인: 메인 → [수업 시작](/host) → 방 만들기 → TV의 학생 주소로 학생 2명 입장 → 시험 방 지우기
// 실행: node live_site.js <사이트 주소> <스크린샷 폴더>   (firebase SDK 가 설치된 폴더에서; 이 환경은 jsdelivr 가 막혀 있어 SDK 를 로컬에서 넣어 줌)
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const SITE = (process.argv[2] || 'https://history-island.netlify.app').replace(/\/$/, '');
const OUT = process.argv[3] || '.';
const FB = path.dirname(require.resolve('firebase/package.json', { paths: [process.cwd(), __dirname] }));
const HOST = new URL(SITE).hostname;
(async () => {
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
  const b = await chromium.launch(proxy ? { proxy: { server: proxy } } : {});
  const errors = [];
  const newPage = async (w, h) => {
    const ctx = await b.newContext({ ignoreHTTPSErrors: true, viewport: { width: w, height: h } });
    await ctx.route('**/*', r => {
      const u = new URL(r.request().url());
      if (u.hostname === 'cdn.jsdelivr.net' && u.pathname.includes('/firebase@')) {
        return r.fulfill({ body: fs.readFileSync(path.join(FB, u.pathname.split(/\/firebase@[^/]+\//)[1])), contentType: 'text/javascript' });
      }
      if (u.hostname === HOST || /firebasedatabase\.app$|googleapis\.com$/.test(u.hostname)) return r.continue();
      return r.abort(); // 글꼴·QR 라이브러리 등은 이 환경에서 막혀 있음
    });
    const p = await ctx.newPage();
    p.on('pageerror', e => errors.push(e.message));
    return p;
  };

  const host = await newPage(1600, 900);
  await host.goto(SITE + '/');
  console.log('메인 화면 모드:', (await host.textContent('#mode')).trim());
  await Promise.all([host.waitForNavigation(), host.click('a.main')]);
  console.log('[수업 시작] 누른 뒤 주소:', host.url());
  await host.waitForFunction(() => document.querySelector('#bank') && document.querySelector('#bank').value.length > 100, null, { timeout: 15000 });
  console.log('문제은행:', (await host.textContent('#bankInfo')).trim());
  await host.click('#btnCreate');
  await host.waitForSelector('#lobby:not(.hidden)', { timeout: 20000 });
  const code = (await host.textContent('#roomCode')).trim();
  const joinUrl = (await host.textContent('#joinUrl')).trim();
  console.log('방 코드', code, '| TV의 학생 주소:', joinUrl);

  for (const [team, no] of [[0, 1], [2, 3]]) {
    const k = await newPage(1280, 800);
    await k.goto(joinUrl);
    await k.waitForSelector('.pickteam', { timeout: 20000 });
    await k.click(`.pickteam >> nth=${team}`); await k.click(`#nums button >> nth=${no - 1}`); await k.click('#join');
    await k.waitForSelector('#barWho', { timeout: 15000 });
    console.log(`학생 입장: ${(await k.textContent('#barWho')).trim()}`);
  }
  await host.waitForTimeout(1500);
  await host.screenshot({ path: path.join(OUT, 'live_lobby.png') });
  console.log('TV 대기 화면 학생 칩:', await host.$$eval('#lobby .pchip', a => a.map(x => x.textContent).join(', ')));
  // 시험 방 지우기 (방 주인만 가능)
  await host.evaluate(c => firebase.database().ref('rooms/' + c).remove(), code);
  console.log('시험 방 지움');
  console.log('errors', errors.length ? errors : 'none');
  await b.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
