[cite_start]// 作業管理アプリ app.js Version: V1C [cite: 195]
(() => {
  const GITHUB_IMG_API = "https://api.github.com/repos/rkworks2025-coder/work/contents/img"; 
  const splash = document.getElementById('splash');
  const splashImg = document.getElementById('splashImg');
  const toast = document.getElementById('toast');

  // 電子音の生成
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
    if (!isError) setTimeout(() => toast.hidden = true, 3000); [cite_start]// [cite: 195]
  }

  // ★最大3回のリトライ通信
  async function triggerTmaWithRetry(plate, requestId) {
    const intervals = [0, 3000, 5000]; // 即時, 3秒後, 5秒後
    for (let i = 0; i < 3; i++) {
      try {
        await new Promise(r => setTimeout(r, intervals[i]));
        const res = await fetch(`${window.TMA_GAS_URL}?action=triggerTMA`, {
          method: "POST",
          body: JSON.stringify({ plate, requestId })
        });
        const json = await res.json();
        if (json.ok) {
          showToast("✅ TMA自動入力スタート");
          return;
        }
      } catch (e) { console.warn(`TMA Retry ${i+1} failed`); }
    }
    showToast("❌ TMA送信失敗 (電波エラー)", true); // 消えないトースト
    playBeep('error'); // 警告音
  }

  // ★画像リストの自動取得 ＆ 初期化
  async function init() {
    const p = new URLSearchParams(location.search);
    
    try {
      // GitHub APIからimgフォルダの中身を取得
      const res = await fetch(GITHUB_IMG_API);
      const files = await res.json();
      const images = files.filter(f => f.name.match(/\.(jpg|jpeg|png|gif)$/i));
      if (images.length > 0) {
        splashImg.src = images[Math.floor(Math.random() * images.length)].download_url;
      }
    } catch (e) { splashImg.style.display = 'none'; }

    splash.addEventListener('click', () => {
      splash.style.display = 'none';
      playBeep('success'); // 音出し制限の解除
      
      const tmaPlate = p.get('tma_plate');
      const tmaReqId = p.get('tma_req_id');
      if (tmaPlate && tmaReqId) {
        triggerTmaWithRetry(tmaPlate, tmaReqId);
      }
      [cite_start]// (ストップウォッチ開始等の既存処理をここに記述 [cite: 190])
    }, { once: true });
  }

  init();
})();
