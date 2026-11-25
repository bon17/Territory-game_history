/* 실시간 저장소. 같은 사용법(set / on / once)으로
 *  - 데모 모드: 한 컴퓨터의 여러 브라우저 창끼리 (localStorage + BroadcastChannel)
 *  - Firebase 모드: firebase-config.js 에 설정값이 있으면 자동 사용
 */
(function (root) {
  const PREFIX = 'tg:';
  const split = p => p.split('/').filter(Boolean);
  function getIn(o, parts) { for (const k of parts) { if (o == null || typeof o !== 'object') return undefined; o = o[k]; } return o; }
  function setIn(o, parts, v) {
    let cur = o;
    parts.slice(0, -1).forEach(k => { if (typeof cur[k] !== 'object' || cur[k] === null) cur[k] = {}; cur = cur[k]; });
    if (v === null || v === undefined) delete cur[parts[parts.length - 1]]; else cur[parts[parts.length - 1]] = v;
  }
  const clone = v => v === undefined ? null : JSON.parse(JSON.stringify(v));

  /* 경로마다 localStorage 키를 따로 둬서, 여러 창이 동시에 써도 서로 덮어쓰지 않게 함 */
  class DemoDB {
    constructor() {
      this.mode = 'demo';
      this.subs = [];
      this.ch = new BroadcastChannel('tg-demo');
      this.ch.onmessage = e => this._fire(e.data);
      window.addEventListener('storage', e => { if (e.key && e.key.startsWith(PREFIX)) this._fire(e.key.slice(PREFIX.length)); });
    }
    _read(path) {
      const parts = split(path);
      let result;
      for (let i = 0; i <= parts.length; i++) {
        const raw = localStorage.getItem(PREFIX + parts.slice(0, i).join('/'));
        if (raw != null) { const v = getIn(JSON.parse(raw), parts.slice(i)); if (v !== undefined) result = clone(v); }
      }
      const pre = PREFIX + parts.join('/') + '/';
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k.startsWith(pre)) continue;
        if (result == null || typeof result !== 'object') result = {};
        setIn(result, split(k.slice(pre.length)), JSON.parse(localStorage.getItem(k)));
      }
      return result === undefined ? null : result;
    }
    set(path, val) {
      const p = split(path).join('/');
      const pre = PREFIX + p + '/';
      const dead = [];
      for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith(pre)) dead.push(k); }
      dead.forEach(k => localStorage.removeItem(k));
      if (val === null || val === undefined) localStorage.removeItem(PREFIX + p);
      else localStorage.setItem(PREFIX + p, JSON.stringify(val));
      this._fire(p); this.ch.postMessage(p);
      return Promise.resolve();
    }
    _fire(changed) {
      for (const s of this.subs)
        if (s.path === changed || s.path.startsWith(changed + '/') || changed.startsWith(s.path + '/'))
          s.cb(this._read(s.path));
    }
    on(path, cb) {
      const s = { path: split(path).join('/'), cb };
      this.subs.push(s); cb(this._read(s.path));
      return () => { this.subs = this.subs.filter(x => x !== s); };
    }
    once(path) { return Promise.resolve(this._read(path)); }
    remove(prefixPath) {
      const pre = PREFIX + split(prefixPath).join('/');
      const dead = [];
      for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k === pre || k.startsWith(pre + '/')) dead.push(k); }
      dead.forEach(k => localStorage.removeItem(k));
      this._fire(split(prefixPath).join('/')); this.ch.postMessage(split(prefixPath).join('/'));
      return Promise.resolve();
    }
  }

  /* Firebase Realtime Database (compat SDK를 페이지에서 불러온 경우) */
  class FirebaseDB {
    constructor(config) {
      this.mode = 'firebase';
      if (!firebase.apps.length) firebase.initializeApp(config);
      this.db = firebase.database();
      this.ready = firebase.auth().signInAnonymously().then(c => { this.uid = c.user.uid; });
    }
    set(path, val) { return this.ready.then(() => this.db.ref(path).set(val === undefined ? null : val)); }
    on(path, cb) {
      const ref = this.db.ref(path); const h = s => cb(s.val());
      this.ready.then(() => ref.on('value', h));
      return () => ref.off('value', h);
    }
    once(path) { return this.ready.then(() => this.db.ref(path).once('value')).then(s => s.val()); }
    remove(path) { return this.set(path, null); }
  }

  function create() {
    const cfg = root.FIREBASE_CONFIG;
    if (cfg && cfg.apiKey && root.firebase && new URLSearchParams(location.search).get('demo') === null) return new FirebaseDB(cfg);
    return new DemoDB();
  }
  root.Backend = { create };
})(window);
