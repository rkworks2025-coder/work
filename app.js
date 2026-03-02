(() => {
  // ===== 設定 =====
  const SHEETS_URL = window.SHEETS_URL || '';
  const SHEETS_KEY = window.SHEETS_KEY || '';
  const APP_VERSION = 'v1c';

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
    const p = new URLSearchParams(location.search);
    currentVehicle.station = p.get('station') || '';
    currentVehicle.model = p.get('model') || '';
    currentVehicle.plate_full = p.get('plate_full') || p.get('plate') || ''; 

    dispStation.textContent = currentVehicle.station || '未指定';
    dispModel.textContent = currentVehicle.model || '未指定';
    dispPlate.textContent = currentVehicle.plate_full || '未指定';

    generateSelectOptions();
    setupToggleButtons();
    initTimesAndTimer();

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
      startTimeMs = savedData.startTimeMs;
      unlockTimeEl.textContent = savedData.unlockTime;
    } else {
      startTimeMs = nowMs;
      const unlockTime = getNowHHMM();
      unlockTimeEl.textContent = unlockTime;
      
      try {
        localStorage.setItem(vKey, JSON.stringify({
          startTimeMs: startTimeMs,
          unlockTime: unlockTime
        }));
      } catch(e) {}
    }

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
    completeBtn.textContent = "戻ります...";
    
    const lockTime = getNowHHMM();
    lockTimeEl.textContent = lockTime;

    // 2. GASへ送信 (非同期・裏側)
    const payload = {
      mode: 'lock_only',
      station: currentVehicle.station,
      plate_full: currentVehicle.plate_full,
      model: currentVehicle.model,
      unlock: unlockTimeEl.textContent || '',
      lock: lockTime
    };

    const body = new URLSearchParams();
    body.set('key', SHEETS_KEY);
    body.set('json', JSON.stringify(payload));

    // keepaliveを付けて、画面遷移してもブラウザが裏で送信を続けてくれるようにする
    fetch(SHEETS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      keepalive: true
    }).catch(e => console.error(e));

    // ローカルストレージの該当車両データをクリア
    try { localStorage.removeItem(getVehicleKey()); } catch(e){}

    // ▼▼▼ 巡回アプリへの帰還サイン（自動チェック用）を残す ▼▼▼
    try { localStorage.setItem("junkai:completed_plate", currentVehicle.plate_full); } catch(e){}

    // 3. 待たずに即時戻る (サクサク感重視)
    setTimeout(() => {
      history.back();
    }, 50); 
  }

  // ===== 起動処理 =====
  if(document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, {once: true});
  } else {
    init();
  }
})();
