(() => {
  const SHEETS_URL = window.SHEETS_URL || '';
  const SHEETS_KEY = window.SHEETS_KEY || '';
  const GITHUB_IMG_API = "https://api.github.com/repos/rkworks2025-coder/work/contents/img";
  const DB_NAME = "JunkaiAssets";
  const STORE_NAME = "SplashImages";

  let stopwatchInterval = null;
  let startTime = null;
  let audioCtx = null; 
  let abortController = new AbortController();

  const splash = document.getElementById('splash');
  const splashImg = document.getElementById('splashImg');
  const stopwatchDisp = document.getElementById('stopwatch');
  const unlockTimeDisp = document.getElementById('unlockTime');
  const lockTimeDisp = document.getElementById('lockTime');
  const completeBtn = document.getElementById('completeBtn');
  const confirmModal = document.getElementById('confirmModal');
  const modalOkBtn = document.getElementById('modalOkBtn');
  const modalCancelBtn = document.getElementById('modalCancelBtn');

  const qs = (s, root=document) => root.querySelector(s);
  const showToast = (msg) => { const t = document.getElementById('toast'); if(t){ t.textContent = msg; t.hidden = false; setTimeout(()=>t.hidden=true, 2500); } };

  /* --- スプラッシュ画像表示ロジック --- */
  function handleSplash() {
    // 1. URLパラメータから画像名（URL）を取得
    const params = new URLSearchParams(location.search);
    const targetUrl = params.get('splash_img');
    
    // 2. localStorageから実体データ(Base64)を優先的に探す
    const cachedData = localStorage.getItem("junkai:preloaded_splash_data");
    const cachedUrl = localStorage.getItem("junkai:preloaded_splash_url");

    if (cachedData && cachedUrl === targetUrl) {
      // 狙い通りの画像在庫があれば即座に表示
      splashImg.src = cachedData;
    } else if (targetUrl) {
      // 在庫がない場合はURLから直接読み込み
      splashImg.src = targetUrl;
    }

    // スプラッシュ画面をタップで解除
    splash.addEventListener('click', () => {
      splash.style.display = 'none';
      startStopwatch();
      if (!unlockTimeDisp.textContent || unlockTimeDisp.textContent === '--:--') {
        unlockTimeDisp.textContent = new Date().toLocaleTimeString('ja-JP', {hour: '2-digit', minute:'2-digit'});
      }
    });
  }

  /* --- ストップウォッチロジック --- */
  function startStopwatch() {
    startTime = Date.now();
    stopwatchInterval = setInterval(() => {
      const diff = Date.now() - startTime;
      const m = Math.floor(diff / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      stopwatchDisp.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }, 1000);
  }

  /* --- UI 制御ロジック --- */
  function setupUI() {
    // トグルボタン
    document.querySelectorAll('.toggle-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const parent = btn.parentElement;
        parent.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    // 期限セレクタ（月/年）の生成
    const mmSels = document.querySelectorAll('select[id$="_mm"]');
    const yySels = document.querySelectorAll('select[id$="_yy"]');
    const currentYear = new Date().getFullYear();

    mmSels.forEach(sel => {
      for (let i = 1; i <= 12; i++) {
        const opt = document.createElement('option');
        opt.value = i; opt.textContent = i;
        sel.appendChild(opt);
      }
    });
    yySels.forEach(sel => {
      for (let i = 0; i < 10; i++) {
        const opt = document.createElement('option');
        opt.value = currentYear + i; opt.textContent = currentYear + i;
        sel.appendChild(opt);
      }
    });

    // 完了モーダル
    completeBtn.addEventListener('click', () => confirmModal.classList.add('show'));
    modalCancelBtn.addEventListener('click', () => confirmModal.classList.remove('show'));
    modalOkBtn.addEventListener('click', async () => {
      confirmModal.classList.remove('show');
      clearInterval(stopwatchInterval);
      lockTimeDisp.textContent = new Date().toLocaleTimeString('ja-JP', {hour: '2-digit', minute:'2-digit'});
      await postToSheet();
    });
  }

  /* --- 通信・保存ロジック --- */
  async function postToSheet() {
    if(!SHEETS_URL) return;
    showToast('データ送信中...');
    const params = new URLSearchParams(location.search);
    const plate = params.get('plate_full');
    
    // 巡回アプリに戻るための合図
    if (plate) localStorage.setItem('junkai:completed_plate', plate);
    
    setTimeout(() => {
      showToast('作業完了');
      // 巡回アプリ（前の画面）に戻る
      history.back();
    }, 1500);
  }

  function applyUrlInfo() {
    const p = new URLSearchParams(location.search);
    const st = p.get('station');
    const md = p.get('model');
    const pl = p.get('plate_full');
    if (st) document.getElementById('disp_station').textContent = st;
    if (md) document.getElementById('disp_model').textContent = md;
    if (pl) document.getElementById('disp_plate').textContent = pl;
  }

  /* --- IndexedDB 関連（在庫維持用） --- */
  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function saveImage(url, blob) {
    const db = await openDB();
    const reader = new FileReader();
    return new Promise((resolve, reject) => {
      reader.onloadend = () => {
        const trans = db.transaction(STORE_NAME, "readwrite");
        trans.objectStore(STORE_NAME).put(reader.result, url);
        trans.oncomplete = () => resolve();
        trans.onerror = () => reject(trans.error);
      };
      reader.readAsDataURL(blob);
    });
  }

  async function syncAssets() {
    try {
      const res = await fetch(GITHUB_IMG_API, { signal: abortController.signal });
      if (!res.ok) return;
      const files = await res.json();
      const remoteUrls = files.filter(f => f.name.match(/\.(jpg|jpeg|png|gif)$/i)).map(f => f.download_url);
      
      const db = await openDB();
      const localKeys = await new Promise(r => {
        const req = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).getAllKeys();
        req.onsuccess = () => r(req.result);
      });

      const targets = remoteUrls.filter(url => !localKeys.includes(url));
      for (const url of targets) {
        const imgRes = await fetch(url, { signal: abortController.signal });
        if (imgRes.ok) {
          const blob = await imgRes.blob();
          await saveImage(url, blob);
        }
      }
    } catch (e) { console.warn("Background sync failed", e); }
  }

  function init(){
    handleSplash();
    applyUrlInfo();
    setupUI();
    syncAssets(); // バックグラウンドで在庫更新
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init, {once:true});
  else init();
})();
