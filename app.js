// 作業管理アプリ app.js Version: V1D (ロジック完全復旧版)
(() => {
  const GITHUB_IMG_API = "https://api.github.com/repos/rkworks2025-coder/work/contents/img"; 
  const splash = document.getElementById('splash');
  const splashImg = document.getElementById('splashImg');
  const toast = document.getElementById('toast');
  
  let startTime = null;
  let timerId = null;

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
    } else {
      [0, 0.3, 0.6].forEach(t => {
        osc.frequency.setValueAtTime(440, ctx.currentTime + t);
        gain.gain.setValueAtTime(0.2, ctx.currentTime + t);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + t + 0.2);
      });
      osc.start(); osc.stop(ctx.currentTime + 0.8);
    }
  }

  function showToast(msg, isError = false) {
    toast.textContent = msg;
    toast.hidden = false;
    toast.className = isError ? 'toast error' : 'toast';
    if (!isError) setTimeout(() => toast.hidden = true, 3000);
  }

  // TMAリトライ送信 
  async function triggerTmaWithRetry(plate, requestId) {
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
          showToast("✅ TMA自動入力スタート");
          return;
        }
      } catch (e) { console.warn(`TMA Retry ${i+1} failed`); }
    }
    showToast("❌ TMA送信失敗 (電波エラー)", true);
    playBeep('error');
  }

  // ストップウォッチ開始
  function startStopwatch() {
    startTime = Date.now();
    timerId = setInterval(() => {
      const diff = Math.floor((Date.now() - startTime) / 1000);
      const mm = String(Math.floor(diff / 60)).padStart(2, '0');
      const ss = String(diff % 60).padStart(2, '0');
      document.getElementById('stopwatch').textContent = `${mm}:${ss}`;
    }, 1000);
    
    // 解錠時刻の記録
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    document.getElementById('unlockTime').textContent = `${hh}:${min}`;
  }

  // 入力項目の初期化 (V1Bの挙動)
  function initUI() {
    // トグルボタンの切り替え
    document.querySelectorAll('.toggle-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const group = btn.parentElement;
        group.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    // 年月のプルダウン生成
    const mmSelects = document.querySelectorAll('select[id$="_mm"]');
    const yySelects = document.querySelectorAll('select[id$="_yy"]');
    for(let i=1; i<=12; i++) {
      const opt = `<option value="${i}">${i}月</option>`;
      mmSelects.forEach(s => s.insertAdjacentHTML('beforeend', opt));
    }
    const curYear = new Date().getFullYear();
    for(let i=0; i<10; i++) {
      const y = curYear + i;
      const opt = `<option value="${y}">${y}年</option>`;
      yySelects.forEach(s => s.insertAdjacentHTML('beforeend', opt));
    }
  }

  // 初期化：通信より先にリスナー登録を行う
  function init() {
    const p = new URLSearchParams(location.search);
    initUI(); // ボタン等を反応可能にする

    // ★フリーズ対策：真っ先にクリックを待ち受ける
    splash.addEventListener('click', () => {
      splash.style.display = 'none';
      playBeep('success'); // 音出し制限解除 [cite: 31]
      
      const tmaPlate = p.get('tma_plate');
      const tmaReqId = p.get('tma_req_id');
      if (tmaPlate && tmaReqId) {
        triggerTmaWithRetry(tmaPlate, tmaReqId);
      }

      // 車両情報表示
      document.getElementById('disp_station').textContent = p.get('station') || '--';
      document.getElementById('disp_model').textContent = p.get('model') || '--';
      document.getElementById('disp_plate').textContent = p.get('plate_full') || '--';
      
      startStopwatch(); // [cite: 31]
    }, { once: true });

    // 画像取得はバックグラウンドで（awaitせずに飛ばす）[cite: 27, 28, 29]
    fetch(GITHUB_IMG_API)
      .then(res => res.json())
      .then(files => {
        const images = files.filter(f => f.name.match(/\.(jpg|jpeg|png|gif)$/i));
        if (images.length > 0) {
          splashImg.src = images[Math.floor(Math.random() * images.length)].download_url;
        }
      })
      .catch(e => {
        console.warn("Image load failed");
        splashImg.style.display = 'none'; // [cite: 30]
      });
  }

  init();
})();
