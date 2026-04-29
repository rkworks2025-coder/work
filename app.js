// 作業管理アプリ app.js Version: V1H (30秒監視アラート・TMA再送モーダル追加版)
(() => {
  const GITHUB_IMG_API = "https://api.github.com/repos/rkworks2025-coder/work/contents/img"; 
  const splash = document.getElementById('splash');
  const splashImg = document.getElementById('splashImg');
  const toast = document.getElementById('toast');
  const completeBtn = document.getElementById('completeBtn');
  
  let startTime = null;
  let timerId = null;
  let currentVehicle = { station: '', model: '', plate_full: '' };

  // アラーム・監視用の変数
  let tmaMonitorTimer = null;
  let alarmInterval = null;
  let isTmaSuccess = false;

  // 電子音生成
  function playBeep(type = 'success') {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    
    if (type === 'success') {
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
      osc.start(); osc.stop(ctx.currentTime + 0.2);
    } else if (type === 'alarm') {
      // iPhoneクラシックアラーム風（少し大きめ・高音の反復）
      osc.type = 'square';
      osc.frequency.setValueAtTime(1000, ctx.currentTime);
      gain.gain.setValueAtTime(0.3, ctx.currentTime); // 少し大きめ
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
      osc.start(); osc.stop(ctx.currentTime + 0.2);
    } else {
      [0, 0.3, 0.6].forEach(t => {
        osc.frequency.setValueAtTime(440, ctx.currentTime + t);
        gain.gain.setValueAtTime(0.2, ctx.currentTime + t);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + t + 0.2);
      });
      osc.start(); osc.stop(ctx.currentTime + 0.8);
    }
  }

  // アラームループの開始
  function startAlarmLoop() {
    if (alarmInterval) return;
    playBeep('alarm');
    alarmInterval = setInterval(() => playBeep('alarm'), 500);
  }

  // アラームループの停止
  function stopAlarmLoop() {
    if (alarmInterval) {
      clearInterval(alarmInterval);
      alarmInterval = null;
    }
  }

  function showToast(msg, isError = false) {
    toast.textContent = msg;
    toast.hidden = false;
    toast.className = isError ? 'toast error' : 'toast';
    if (!isError) setTimeout(() => toast.hidden = true, 3000);
  }

  // 確認モーダル表示プロミス (再送アラート用にも流用)
  function showConfirmModal(title = "作業完了", msg = "送信して終了しますか？", okText = "OK", cancelText = "キャンセル") {
    return new Promise((resolve) => {
      const modal = document.getElementById('confirmModal');
      const titleEl = modal.querySelector('h2') || { textContent: "" };
      const msgEl = modal.querySelector('p') || { textContent: "" };
      const okBtn = document.getElementById('modalOkBtn');
      const cancelBtn = document.getElementById('modalCancelBtn');

      // テキストの差し替え（既存のHTML構造を維持）
      const originalTitle = titleEl.textContent;
      const originalMsg = msgEl.textContent;
      const originalOk = okBtn.textContent;
      const originalCancel = cancelBtn.textContent;

      titleEl.textContent = title;
      msgEl.textContent = msg;
      okBtn.textContent = okText;
      cancelBtn.textContent = cancelText;

      modal.classList.add('show');

      const handleResponse = (res) => {
        modal.classList.remove('show');
        // 元に戻す
        titleEl.textContent = originalTitle;
        msgEl.textContent = originalMsg;
        okBtn.textContent = originalOk;
        cancelBtn.textContent = originalCancel;
        
        okBtn.onclick = null;
        cancelBtn.onclick = null;
        resolve(res);
      };

      okBtn.onclick = () => handleResponse(true);
      cancelBtn.onclick = () => handleResponse(false);
    });
  }

  // TMAリトライ送信 (監視タイマー付き)
  async function triggerTmaWithRetry(plate, requestId) {
    // 監視開始
    isTmaSuccess = false;
    if (tmaMonitorTimer) clearTimeout(tmaMonitorTimer);
    
    tmaMonitorTimer = setTimeout(async () => {
      if (!isTmaSuccess) {
        startAlarmLoop();
        const retry = await showConfirmModal(
          "⚠️ 自動入力失敗！",
          "30秒経過しても応答がありません。\n命令を再送しますか？",
          "再送する",
          "キャンセル"
        );
        stopAlarmLoop();
        if (retry) {
          triggerTmaWithRetry(plate, requestId);
        }
      }
    }, 30000);

    const intervals = [0, 3000, 5000];
    for (let i = 0; i < 3; i++) {
      try {
        await new Promise(r => setTimeout(r, intervals[i]));
        const res = await fetch(`${window.TMA_GAS_URL}?action=triggerTMA`, {
          method: "POST",
          body: JSON.stringify({ plate, requestId }),
          keepalive: true
        });
        const json = await res.json();
        if (json.ok) {
          isTmaSuccess = true;
          clearTimeout(tmaMonitorTimer);
          showToast("✅ TMA自動入力スタート");
          return;
        }
      } catch (e) { console.warn(`TMA Retry ${i+1} failed`); }
    }
    // 3回リトライ失敗時（監視タイマーは継続中なのでここでは何もしない。30秒待機に委ねる）
  }

  // ストップウォッチ開始 (呼出時から計測)
  function startStopwatch() {
    startTime = Date.now();
    timerId = setInterval(() => {
      const diff = Math.floor((Date.now() - startTime) / 1000);
      const mm = String(Math.floor(diff / 60)).padStart(2, '0');
      const ss = String(diff % 60).padStart(2, '0');
      document.getElementById('stopwatch').textContent = `${mm}:${ss}`;
    }, 1000);
    
    // 解錠時刻（計測開始時刻）を記録
    const now = new Date();
    document.getElementById('unlockTime').textContent = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  }

  // 作業完了処理 (自作モーダル版)
  async function handleWorkComplete() {
    const ok = await showConfirmModal();
    if (!ok) return;

    clearInterval(timerId);
    if (tmaMonitorTimer) clearTimeout(tmaMonitorTimer); // 作業終了時は監視も停止
    completeBtn.disabled = true;
    completeBtn.textContent = "送信中...";
    
    const now = new Date();
    const lockTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    document.getElementById('lockTime').textContent = lockTime;

    const payload = {
      mode: 'lock_only',
      station: currentVehicle.station,
      plate_full: currentVehicle.plate_full,
      model: currentVehicle.model,
      unlock: document.getElementById('unlockTime').textContent,
      lock: lockTime
    };

    const body = new URLSearchParams();
    body.set('key', window.SHEETS_KEY);
    body.set('json', JSON.stringify(payload));

    fetch(window.SHEETS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      keepalive: true
    }).catch(e => console.error(e));

    try { localStorage.setItem("junkai:completed_plate", currentVehicle.plate_full); } catch(e){}

    setTimeout(() => { history.back(); }, 100);
  }

  function initUI() {
    document.querySelectorAll('.toggle-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const group = btn.parentElement;
        group.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    const mmSelects = document.querySelectorAll('select[id$="_mm"]');
    const yySelects = document.querySelectorAll('select[id$="_yy"]');
    for(let i=1; i<=12; i++) {
      mmSelects.forEach(s => s.insertAdjacentHTML('beforeend', `<option value="${String(i).padStart(2, '0')}">${String(i).padStart(2, '0')}</option>`));
    }
    const curYear = new Date().getFullYear();
    for(let i=0; i<10; i++) {
      yySelects.forEach(s => s.insertAdjacentHTML('beforeend', `<option value="${curYear+i}">${curYear+i}</option>`));
    }
  }

  function init() {
    const p = new URLSearchParams(location.search);
    currentVehicle.station = p.get('station') || '';
    currentVehicle.model = p.get('model') || '';
    currentVehicle.plate_full = p.get('plate_full') || p.get('plate') || '';

    initUI();
    completeBtn.addEventListener('click', handleWorkComplete);

    startStopwatch();

    splash.addEventListener('click', () => {
      splash.style.display = 'none';
      playBeep('success');
      
      const tmaPlate = p.get('tma_plate');
      const tmaReqId = p.get('tma_req_id');
      if (tmaPlate && tmaReqId) triggerTmaWithRetry(tmaPlate, tmaReqId);

      document.getElementById('disp_station').textContent = currentVehicle.station || '--';
      document.getElementById('disp_model').textContent = currentVehicle.model || '--';
      document.getElementById('disp_plate').textContent = currentVehicle.plate_full || '--';
    }, { once: true });

    const splashImgParam = p.get('splash_img');
    if (splashImgParam) {
      splashImg.src = splashImgParam;
    } else {
      const cacheKey = "junkai:splash_images";
      let cachedImages = [];
      try {
        const stored = localStorage.getItem(cacheKey);
        if (stored) {
          cachedImages = JSON.parse(stored);
          if (cachedImages.length > 0) {
            splashImg.src = cachedImages[Math.floor(Math.random() * cachedImages.length)];
          }
        }
      } catch(e) {}

      fetch(GITHUB_IMG_API)
        .then(res => res.json())
        .then(files => {
          const images = files.filter(f => f.name.match(/\.(jpg|jpeg|png|gif)$/i)).map(f => f.download_url);
          if (images.length > 0) {
            try {
              localStorage.setItem(cacheKey, JSON.stringify(images));
            } catch(e) {}
            if (cachedImages.length === 0 && !splashImgParam) {
              splashImg.src = images[Math.floor(Math.random() * images.length)];
            }
          }
        })
        .catch(() => {
          if (cachedImages.length === 0 && !splashImgParam) {
            splashImg.style.display = 'none';
          }
        });
    }
  }

  init();
})();
