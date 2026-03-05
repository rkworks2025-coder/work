// 作業管理アプリ app.js Version: V1C
(() => {
  const APP_VERSION = 'V1C';
  // ★リュウ、ここに可愛い画像URLを好きなだけ追加してね！
  const IMAGES = [
    "https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?q=80&w=1000", // サンプル
    "https://images.unsplash.com/photo-1494790108377-be9c29b29330?q=80&w=1000", // サンプル
    "https://example.com/your_favorite_girl1.jpg",
    "https://example.com/your_favorite_girl2.jpg"
  ];

  const splash = document.getElementById('splash');
  const splashImg = document.getElementById('splashImg');
  const stopwatchEl = document.getElementById('stopwatch');
  const toast = document.getElementById('toast');

  let currentVehicle = { station: '', model: '', plate_full: '' };
  let startTimeMs = 0;

  // 電子音を生成して鳴らす関数
  function playBeep(type = 'success') {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    if (type === 'success') {
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
      osc.start(); osc.stop(ctx.currentTime + 0.2);
    } else {
      // 警告音 (ピーッ！ピーッ！)
      [0, 0.3, 0.6].forEach(t => {
        osc.frequency.setValueAtTime(440, ctx.currentTime + t);
        gain.gain.setValueAtTime(0.1, ctx.currentTime + t);
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

  // TMAリトライ通信ロジック
  async function triggerTmaWithRetry(plate, requestId) {
    const maxRetry = 3;
    const intervals = [0, 3000, 5000]; // 即時, 3秒後, 5秒後

    for (let i = 0; i < maxRetry; i++) {
      try {
        await new Promise(r => setTimeout(r, intervals[i]));
        const res = await fetch(window.TMA_GAS_URL + "?action=triggerTMA", {
          method: "POST",
          body: JSON.stringify({ plate, requestId })
        });
        const json = await res.json();
        if (json.ok) {
          showToast("✅ TMA自動入力スタート");
          playBeep('success');
          return;
        }
      } catch (e) {
        console.error(`TMA Retry ${i+1} failed:`, e);
      }
    }
    // 全て失敗
    showToast("❌ TMA送信失敗 (電波エラー)", true);
    playBeep('error');
  }

  function init() {
    const p = new URLSearchParams(location.search);
    currentVehicle.plate_full = p.get('plate_full') || '';
    // ランダム画像セット
    splashImg.src = IMAGES[Math.floor(Math.random() * IMAGES.length)];

    // スプラッシュタップで開始
    splash.addEventListener('click', () => {
      splash.style.display = 'none';
      playBeep('success'); // 音出し許可取得
      
      // TMAバトンがあればリトライ通信開始
      const tmaPlate = p.get('tma_plate');
      const tmaReqId = p.get('tma_req_id');
      if (tmaPlate && tmaReqId) {
        triggerTmaWithRetry(tmaPlate, tmaReqId);
      }
      
      initTimesAndTimer(); // ストップウォッチ開始
    }, { once: true });
  }

  // (以下、既存のストップウォッチ・送信ロジックを統合)
  init();
})();
