(() => {
  let startTime = null;
  let timerInterval = null;

  const showToast = (msg) => { 
    const t = document.getElementById('toast'); 
    if(t){ t.textContent = msg; t.hidden = false; setTimeout(()=>t.hidden=true, 2500); } 
  };

  /* --- 画像表示の爆速化とスプラッシュ解除 --- */
  function handleSplash() {
    const splash = document.getElementById('splash');
    const splashImg = document.getElementById('splashImg');
    if (!splash || !splashImg) return;

    const params = new URLSearchParams(location.search);
    const targetUrl = params.get('splash_img');
    const cachedData = localStorage.getItem("junkai:preloaded_splash_data");
    const cachedUrl = localStorage.getItem("junkai:preloaded_splash_url");

    if (cachedData && cachedUrl === targetUrl) {
      splashImg.src = cachedData;
    } else if (targetUrl) {
      splashImg.src = targetUrl;
    }

    const startWork = () => {
      if (splash.style.display === 'none') return;
      splash.style.display = 'none'; // 真っ黒な壁を解除
      
      startTime = Date.now();
      timerInterval = setInterval(updateTimer, 1000);
      
      const unlockTimeDisp = document.getElementById('unlockTime');
      if (unlockTimeDisp && (unlockTimeDisp.textContent === '--:--' || !unlockTimeDisp.textContent)) {
        unlockTimeDisp.textContent = new Date().toLocaleTimeString('ja-JP', {hour: '2-digit', minute:'2-digit'});
      }

      // 画像を表示し終えた後に実体データを消去しメモリを空ける
      localStorage.removeItem("junkai:preloaded_splash_data");
      localStorage.removeItem("junkai:preloaded_splash_url");
    };

    splashImg.onload = startWork;
    splashImg.onerror = startWork;
    splash.addEventListener('click', startWork);
    setTimeout(startWork, 5000); // フリーズ防止のフォールバック
  }

  function updateTimer() {
    const diff = Date.now() - startTime;
    const m = Math.floor(diff / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    const sw = document.getElementById('stopwatch');
    if (sw) sw.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  /* --- HTMLUI要素（ジュニアシート等）の復元と連動 --- */
  function setupUI() {
    const params = new URLSearchParams(location.search);
    const st = params.get('station');
    const md = params.get('model');
    const pl = params.get('plate_full');
    
    if (st) document.getElementById('disp_station').textContent = st;
    if (md) document.getElementById('disp_model').textContent = md;
    if (pl) document.getElementById('disp_plate').textContent = pl;

    document.querySelectorAll('.toggle-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const parent = btn.parentElement;
        parent.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    const currentYear = new Date().getFullYear();
    ['punk', 'flare'].forEach(prefix => {
      const mmSel = document.getElementById(`sel_${prefix}_mm`);
      const yySel = document.getElementById(`sel_${prefix}_yy`);
      if (mmSel) {
        for (let i = 1; i <= 12; i++) {
          const opt = document.createElement('option');
          opt.value = i; opt.textContent = i;
          mmSel.appendChild(opt);
        }
      }
      if (yySel) {
        for (let i = 0; i < 10; i++) {
          const opt = document.createElement('option');
          opt.value = currentYear + i; opt.textContent = currentYear + i;
          yySel.appendChild(opt);
        }
      }
    });

    const completeBtn = document.getElementById('completeBtn');
    const confirmModal = document.getElementById('confirmModal');
    const modalOkBtn = document.getElementById('modalOkBtn');
    const modalCancelBtn = document.getElementById('modalCancelBtn');

    if (completeBtn && confirmModal) {
      completeBtn.addEventListener('click', () => confirmModal.classList.add('show'));
      modalCancelBtn.addEventListener('click', () => confirmModal.classList.remove('show'));
      modalOkBtn.addEventListener('click', async () => {
        confirmModal.classList.remove('show');
        clearInterval(timerInterval);
        document.getElementById('lockTime').textContent = new Date().toLocaleTimeString('ja-JP', {hour: '2-digit', minute:'2-digit'});
        
        showToast('データ送信中...');
        
        // ★重要: 作業記録とTMAキックを同時に実行
        await postToSheet();
        await triggerTmaWithRetry();
        
        if (pl) localStorage.setItem('junkai:completed_plate', pl);
        
        setTimeout(() => {
          history.back(); // 巡回アプリへ戻る
        }, 1000);
      });
    }
  }

  /* --- 実体マップに基づく Python（TMA）連携キックの復元 --- */
  async function triggerTmaWithRetry(retryCount = 2) {
    if (!window.TMA_GAS_URL) return;
    const params = new URLSearchParams(location.search);
    const tmaPlate = params.get('tma_plate') || params.get('plate_full');
    const reqId = params.get('tma_req_id') || ("req-" + Date.now());
    
    const url = new URL(window.TMA_GAS_URL);
    url.searchParams.set('action', 'triggerTma');
    url.searchParams.set('plate', tmaPlate);
    url.searchParams.set('req_id', reqId);

    for (let i = 0; i <= retryCount; i++) {
      try {
        await fetch(url.toString(), { mode: 'no-cors' });
        return true;
      } catch (e) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }
    return false;
  }

  async function postToSheet() {
    if (!window.SHEETS_URL) return;
    try {
      const payload = {
        station: document.getElementById('disp_station').textContent,
        plate_full: document.getElementById('disp_plate').textContent,
        model: document.getElementById('disp_model').textContent,
        timestamp_iso: new Date().toISOString()
      };
      const body = new URLSearchParams();
      body.set('key', window.SHEETS_KEY || '');
      body.set('json', JSON.stringify(payload));
      await fetch(window.SHEETS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body
      });
    } catch (e) {
      console.error('postToSheet failed', e);
    }
  }

  function init() {
    handleSplash();
    setupUI();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
