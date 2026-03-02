(() => {
  // ===== 設定 =====
  const SHEETS_URL = window.SHEETS_URL || '';
  const SHEETS_KEY = window.SHEETS_KEY || '';
  const APP_VERSION = 'v1b';

  // ===== 要素取得 =====
  const dispStation = document.getElementById('disp_station');
  const dispModel   = document.getElementById('disp_model');
  const dispPlate   = document.getElementById('disp_plate');
  const stopwatchEl = document.getElementById('stopwatch');
  const unlockTimeEl= document.getElementById('unlockTime');
  const lockTimeEl  = document.getElementById('lockTime');
  const completeBtn = document.getElementById('completeBtn');
  const toast       = document.getElementById('toast');

  // 車両データ保持用
  let currentVehicle = { station: '', model: '', plate_full: '' };
  
  // タイマー用変数
  let timerInterval = null;
  let startTimeMs = 0;

  // ===== ユーティリティ =====
  const showToast = (msg) => { 
    toast.textContent = msg; 
    toast.hidden = false; 
    setTimeout(() => toast.hidden = true, 3000); 
  };

  // 1桁数字を0埋め
  const pad = (n) => String(n).padStart(2, '0');

  // 現在時刻を HH:MM で取得
  function getNowHHMM() {
    const now = new Date();
    return `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  }

  // 車両固有キー (localStorage保存用)
  function getVehicleKey() {
    return `workapp:${APP_VERSION}:${currentVehicle.station}|${currentVehicle.plate_full}`;
  }

  // ===== 初期化処理 =====
  function init() {
    // 1. URLパラメータの取得・表示
    const p = new URLSearchParams(location.search);
    currentVehicle.station = p.get('station') || '';
    currentVehicle.model = p.get('model') || '';
    currentVehicle.plate_full = p.get('plate_full') || p.get('plate') || ''; // 念のため両方対応

    dispStation.textContent = currentVehicle.station || '未指定';
    dispModel.textContent = currentVehicle.model || '未指定';
    dispPlate.textContent = currentVehicle.plate_full || '未指定';

    // 2. プルダウンの生成 (月:01~12, 年:今年~+10年)
    generateSelectOptions();

    // 3. トグルボタンのイベント設定
    setupToggleButtons();

    // 4. 時刻とストップウォッチの初期化
    initTimesAndTimer();

    // 5. 作業完了ボタンのイベント設定
    completeBtn.addEventListener('click', handleWorkComplete);
  }

  // ===== UI生成・設定 =====
  function generateSelectOptions() {
    const mmOptions = '<option value="">月</option>' + 
      Array.from({length: 12}, (_, i) => `<option value="${pad(i+1)}">${pad(i+1)}</option>`).join('');
    
    const currentYear = Number(String(new Date().getFullYear()).slice(-2));
    const yyOptions = '<option value="">年</option>' + 
      Array.from({length: 11}, (_, i) => `<option value="${currentYear + i}">${currentYear + i}</option>`).join('');

    document.getElementById('sel_punk_mm').innerHTML = mmOptions;
    document.getElementById('sel_flare_mm').innerHTML = mmOptions;
    document.getElementById('sel_punk_yy').innerHTML = yyOptions;
    document.getElementById('sel_flare_yy').innerHTML = yyOptions;
  }

  function setupToggleButtons() {
    document.querySelectorAll('.toggle-group').forEach(group => {
      const btns = group.querySelectorAll('.toggle-btn');
      btns.forEach(btn => {
        btn.addEventListener('click', () => {
          btns.forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
        });
      });
    });
  }

  // ===== 時間管理ロジック =====
  function initTimesAndTimer() {
    if (!currentVehicle.plate_full) return;

    const vKey = getVehicleKey();
    let savedData = null;

    try {
      const raw = localStorage.getItem(vKey);
      if (raw) savedData = JSON.parse(raw);
    } catch(e) {}

    const nowMs = Date.now();

    if (savedData && savedData.startTimeMs && savedData.unlockTime) {
      // 既存のセッションを復元（誤ってリロードした場合など）
      startTimeMs = savedData.startTimeMs;
      unlockTimeEl.textContent = savedData.unlockTime;
    } else {
      // 新規セッション開始
      startTimeMs = nowMs;
      const unlockTime = getNowHHMM();
      unlockTimeEl.textContent = unlockTime;
      
      // ローカルに保存
      try {
        localStorage.setItem(vKey, JSON.stringify({
          startTimeMs: startTimeMs,
          unlockTime: unlockTime
        }));
      } catch(e) {}
    }

    // ストップウォッチ開始
    updateStopwatch();
    timerInterval = setInterval(updateStopwatch, 1000);
  }

  function updateStopwatch() {
    if (startTimeMs === 0) return;
    const diffSec = Math.floor((Date.now() - startTimeMs) / 1000);
    const m = Math.floor(diffSec / 60);
    const s = diffSec % 60;
    stopwatchEl.textContent = `${pad(m)}:${pad(s)}`;
  }

  // ===== 送信・完了ロジック =====
  async function handleWorkComplete() {
    if (!window.confirm("作業を完了し、施錠時刻を記録して戻りますか？")) {
      return;
    }

    // 1. タイマー停止＆施錠時刻記録
    clearInterval(timerInterval);
    completeBtn.disabled = true;
    completeBtn.textContent = "送信中...";
    
    const lockTime = getNowHHMM();
    lockTimeEl.textContent = lockTime;

    // 2. GASへ送信 (旧アプリの postLockTimeOnly と完全互換)
    const payload = {
      mode: 'lock_only',
      station: currentVehicle.station,
      plate_full: currentVehicle.plate_full,
      model: currentVehicle.model,
      unlock: unlockTimeEl.textContent || '',
      lock: lockTime
    };

    try {
      const body = new URLSearchParams();
      body.set('key', SHEETS_KEY);
      body.set('json', JSON.stringify(payload));

      const res = await fetch(SHEETS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body
      });

      if (!res.ok) throw new Error('HTTP ' + res.status);
      
      const j = await res.json().catch(() => ({ok: true}));
      if (j && j.ok) {
        showToast('施錠時刻を記録しました');
        
        // ローカルストレージの該当車両データをクリア
        try { localStorage.removeItem(getVehicleKey()); } catch(e){}

        // 3. 巡回アプリへ戻る
        setTimeout(() => {
          history.back();
        }, 1500);

      } else {
        throw new Error('GAS Response Error');
      }
    } catch(err) {
      console.error(err);
      showToast('送信に失敗しました');
      completeBtn.disabled = false;
      completeBtn.textContent = "作業完了 (再試行)";
    }
  }

  // ===== 起動処理 =====
  if(document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, {once: true});
  } else {
    init();
  }
})();
