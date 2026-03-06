// 作業管理アプリ app.js Version: V1D
(() => {
  const GITHUB_IMG_API = "https://api.github.com/repos/rkworks2025-coder/work/contents/img"; 
  const splash = document.getElementById('splash');
  const splashImg = document.getElementById('splashImg');
  const toast = document.getElementById('toast');

  // 電子音の生成 [cite: 125-127]
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

  // ★TMA送信：バックグラウンドでリトライ実行 [cite: 130-135]
  async function triggerTmaWithRetry(plate, requestId) {
    const intervals = [0, 3000, 5000];
    for (let i = 0; i < 3; i++) {
      try {
        await new Promise(r => setTimeout(r, intervals[i]));
        const res = await fetch(`${window.TMA_GAS_URL}?action=triggerTMA`, {
          method: "POST",
          body: JSON.stringify({ plate, requestId }),
          keepalive: true // 画面が閉じても送信を継続
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

  // ★非同期で画像リストを取得（UIをブロックしない）
  async function fetchRandomImage() {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000); // 3秒でタイムアウト

      const res = await fetch(GITHUB_IMG_API, { signal: controller.signal });
      const files = await res.json();
      const images = files.filter(f => f.name.match(/\.(jpg|jpeg|png|gif)$/i));
      
      if (images.length > 0) {
        const selected = images[Math.floor(Math.random() * images.length)];
        splashImg.src = selected.download_url;
      }
    } catch (e) {
      console.warn("Image fetch failed or timeout", e);
      // 失敗してもスプラッシュは表示し続ける（真っ黒な画面をタップさせる）
    }
  }

  // ★初期化：リスナー登録を最優先 [cite: 136-141]
  function init() {
    const p = new URLSearchParams(location.search);
    
    // 1. まずクリックを受け付ける準備をする
    splash.addEventListener('click', () => {
      splash.style.display = 'none';
      playBeep('success');
      
      const tmaPlate = p.get('tma_plate');
      const tmaReqId = p.get('tma_req_id');
      if (tmaPlate && tmaReqId) {
        triggerTmaWithRetry(tmaPlate, tmaReqId);
      }
      
      // 車両情報の表示
      document.getElementById('disp_station').textContent = p.get('station') || '--';
      document.getElementById('disp_model').textContent = p.get('model') || '--';
      document.getElementById('disp_plate').textContent = p.get('plate_full') || '--';
      
      // (ストップウォッチ開始等の既存処理)
    }, { once: true });

    // 2. 裏側で画像を読み込みに行く（awaitしない！）
    fetchRandomImage();
  }

  init();
})();
