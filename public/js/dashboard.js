const gridLeft = document.getElementById("grid-left");
const gridRight = document.getElementById("grid-right");
const globalStopBtn = document.getElementById("global-stop-btn");
const globalPauseBtn = document.getElementById("global-pause-btn");
const SIGNAL_KEYS = ["call1_buy", "call1_sell", "call2_buy", "call2_sell", "call3_go"];
const FLASH_TIMEOUT_MS = 20 * 60 * 1000; // 20 Minutes in Milliseconds

// --- STATE ---
let lastAcknowledgeTime = 0; 
let isGlobalPaused = false; 
const rowMuteTimestamps = {}; 
const mutedSymbols = new Set();
let lastData = null;
let call1Mode = '15m'; // '15m' or '1h'
let call2Mode = '15m'; // '15m' or '1h'
let call3Mode = '15m'; // '15m' or '1h'
const priceData = {}; 

// --- Sound ---
let audioUnlocked = false;
const sounds = {
  call1: new Audio("/audio/long-term.mp3"),
  call2: new Audio("/audio/call-2.mp3"),
  call3: new Audio("/audio/call-3.mp3")
};

function playSound(soundId) {
  if (!audioUnlocked) return;
  const sound = sounds[soundId];
  if (sound) {
    sound.currentTime = 0;
    sound.play().catch((error) => console.error(`Error playing ${soundId}:`, error));
  }
}

document.body.addEventListener("click", () => {
    if (audioUnlocked) return;
    audioUnlocked = true;
    console.log("Audio unlocked.");
  }, { once: true }
);

// --- ACTIONS ---
function acknowledgeAllFlashing() {
    lastAcknowledgeTime = Date.now();
    
    const originalText = globalStopBtn.innerHTML;
    globalStopBtn.innerHTML = "<span>✅</span> Stopped!";
    globalStopBtn.style.backgroundColor = "#16a34a"; 
    
    setTimeout(() => {
        globalStopBtn.innerHTML = originalText;
        globalStopBtn.style.backgroundColor = ""; 
    }, 1000);

    if (isGlobalPaused) toggleGlobalPause(); 
    renderUI();
}

function toggleGlobalPause() {
    isGlobalPaused = !isGlobalPaused;
    if (isGlobalPaused) {
        globalPauseBtn.innerHTML = "<span>▶️</span> Resume";
        globalPauseBtn.className = "control-btn btn-resume";
    } else {
        globalPauseBtn.innerHTML = "<span>⏸️</span> Pause All";
        globalPauseBtn.className = "control-btn btn-pause";
    }
    renderUI();
}

function toggleCall1Mode() {
    call1Mode = call1Mode === '15m' ? '1h' : '15m';
    renderUI();
}

function toggleCall2Mode() {
    call2Mode = call2Mode === '15m' ? '1h' : '15m';
    renderUI();
}

function toggleCall3Mode() {
    call3Mode = call3Mode === '15m' ? '1h' : '15m';
    renderUI();
}

function toggleSymbolMute(symbol) {
    if (mutedSymbols.has(symbol)) mutedSymbols.delete(symbol);
    else mutedSymbols.add(symbol);
    renderUI();
}

function muteRowFlashing(symbol, matchTime) {
    if (!rowMuteTimestamps[symbol]) rowMuteTimestamps[symbol] = [];
    rowMuteTimestamps[symbol].push(matchTime);
    renderUI();
}

function renderUI() {
    if (lastData) {
       renderGrid(gridLeft, lastData.scriptListLeft, lastData.state);
       renderGrid(gridRight, lastData.scriptListRight, lastData.state);
    }
}

function getCounterClass(count, isBuy) {
  if (!count || count <= 0) return '';
  const bgColor = isBuy ? '#38CB6E' : '#F15656';
  return `flex items-center justify-center w-6 h-6 rounded-full text-white text-sm font-bold mr-1.5" style="background-color: ${bgColor}; box-shadow: 0 2px 4px rgba(0,0,0,0.2), inset 0 1px 2px rgba(255,255,255,0.3);`;
}

// --- RENDER ---
function createHeader() {
  // Count active GO signals
  let goCount = 0;
  let goSymbols = [];
  if (lastData && lastData.state) {
    Object.keys(lastData.state).forEach(symbol => {
      const call3Key = call3Mode === '15m' ? 'call3_go' : 'call3_1h';
      const call3Data = lastData.state[symbol]?.[call3Key];
      if (call3Data && call3Data.active && call3Data.signalType === 'buy') {
        const now = Date.now();
        const signalTime = typeof call3Data.time === 'number' ? call3Data.time : Date.parse(call3Data.time);
        const timeSinceSignal = now - signalTime;
        const timeoutMs = call3Mode === '15m' ? (15 * 60 * 1000) : (60 * 60 * 1000);
        // Only count if not expired (for STOP signals)
        if (call3Data.signalType === 'buy' || timeSinceSignal <= timeoutMs) {
          goCount++;
          goSymbols.push(symbol);
        }
      }
    });
  }
  
  const goCountDisplay = goCount > 0 ? `<span class="bg-green-500 text-white text-xs px-1.5 py-0.5 rounded-full ml-1" title="Active GO signals: ${goSymbols.join(', ')}">${goCount}</span>` : '';
  const call1ModeToggle = `<button onclick="toggleCall1Mode()" class="text-xs px-2 py-1 bg-gray-800 text-white border border-gray-700 rounded ml-2 hover:bg-gray-700" title="Switch between 15min and 1hour signals">${call1Mode}</button>`;
  const call2ModeToggle = `<button onclick="toggleCall2Mode()" class="text-xs px-2 py-1 bg-white border border-gray-300 rounded ml-2 hover:bg-gray-50" title="Switch between 15min and 1hour signals">${call2Mode}</button>`;
  const call3ModeToggle = `<button onclick="toggleCall3Mode()" class="text-xs px-2 py-1 bg-white border border-blue-300 rounded ml-2 hover:bg-blue-50" title="Switch between 15min and 1hour signals">${call3Mode}</button>`;
  
  return `
    <div class="grid-container text-xs font-semibold text-center text-gray-500 sticky top-0 bg-white z-10 shadow-sm border-b border-gray-300">
      <div class="p-2 border-r border-gray-200 row-span-2 flex items-center justify-center bg-gray-50">🔔</div>
      <div class="p-2 border-r border-gray-200 row-span-2 flex items-center justify-start pl-2 bg-gray-50">Symbol</div>
      
      <div class="p-2 border-b border-amber-300 col-span-2 bg-amber-400 text-white font-bold tracking-wider flex items-center justify-center flex-col">
        <div>CALL 1</div>
        ${call1ModeToggle}
      </div>
      <div class="p-2 border-b border-gray-200 col-span-2 bg-gray-100 text-gray-600 flex items-center justify-center font-bold flex-col">
        <div>Call 2</div>
        ${call2ModeToggle}
      </div>
      <div class="p-2 border-b border-r border-gray-200 bg-blue-100 text-blue-600 row-span-2 flex items-center justify-center font-bold flex-col">
        <div>CALL 3${goCountDisplay}</div>
        ${call3ModeToggle}
      </div>
      <div class="p-2 row-span-2 flex items-center justify-end pr-4 bg-gray-50">Symbol</div>
      
      <div class="p-2 border-amber-200 text-green-700 bg-amber-100">Buy</div>
      <div class="p-2 border-amber-200 text-red-700 bg-amber-100">Sell</div>
      <div class="p-2 border-gray-200 text-green-600 bg-gray-50">Buy</div>
      <div class="p-2 border-r border-gray-200 text-red-600 bg-gray-50">Sell</div>
    </div>
  `;
}

function renderGrid(container, scriptList, state) {
  let html = createHeader();
  
  scriptList.forEach((symbol, index) => {
    const symbolState = state[symbol];
    let rowBaseClass = index % 2 === 0 ? "bg-white" : "bg-gray-50";
    
    // --- MATCHING LOGIC ---
    const c1Buy_15m = symbolState['call1_buy']?.active;
    const c1Sell_15m = symbolState['call1_sell']?.active;
    const c2Buy_15m = symbolState['call2_buy']?.active;
    const c2Sell_15m = symbolState['call2_sell']?.active;
    
    const c1Buy_1h = symbolState['call1_1h_buy']?.active;
    const c1Sell_1h = symbolState['call1_1h_sell']?.active;
    const c2Buy_1h = symbolState['call2_1h_buy']?.active;
    const c2Sell_1h = symbolState['call2_1h_sell']?.active;

    let symbolFlashClass = ""; 
    let strongBadge = "";
    let matchTime = 0;
    let isCurrentlyFlashing = false;
    let flashTimeframe = "";
    
    let isMatch_15m = (c1Buy_15m && c2Buy_15m) || (c1Sell_15m && c2Sell_15m);
    let isMatch_1h = (c1Buy_1h && c2Buy_1h) || (c1Sell_1h && c2Sell_1h);
    
    let isMatch = isMatch_15m || isMatch_1h;
    let c1Buy, c1Sell;
    
    if (isMatch_15m) {
      flashTimeframe = "15m";
      c1Buy = c1Buy_15m;
      c1Sell = c1Sell_15m;
    } else if (isMatch_1h) {
      flashTimeframe = "1h";
      c1Buy = c1Buy_1h;
      c1Sell = c1Sell_1h;
    }
    
    if (isMatch) {
        let t1 = 0; t2 = 0;
        
        if (c1Buy) {
            const c1Key = flashTimeframe === "15m" ? 'call1_buy' : 'call1_1h_buy';
            const c2Key = flashTimeframe === "15m" ? 'call2_buy' : 'call2_1h_buy';
            t1 = symbolState[c1Key]?.trendStartTime || symbolState[c1Key]?.time || 0;
            t2 = symbolState[c2Key]?.trendStartTime || symbolState[c2Key]?.time || 0;
        } else {
            const c1Key = flashTimeframe === "15m" ? 'call1_sell' : 'call1_1h_sell';
            const c2Key = flashTimeframe === "15m" ? 'call2_sell' : 'call2_1h_sell';
            t1 = symbolState[c1Key]?.trendStartTime || symbolState[c1Key]?.time || 0;
            t2 = symbolState[c2Key]?.trendStartTime || symbolState[c2Key]?.time || 0;
        }
        
        t1 = (typeof t1 === 'number') ? t1 : (isNaN(Date.parse(t1)) ? 0 : Date.parse(t1));
        t2 = (typeof t2 === 'number') ? t2 : (isNaN(Date.parse(t2)) ? 0 : Date.parse(t2));
        
        matchTime = Math.max(t1, t2);
        
        // --- Timeout Checks ---
        const now = Date.now();
        const timeSinceMatch = now - matchTime;
        const isExpired = timeSinceMatch > FLASH_TIMEOUT_MS; 

        const isRowMuted = rowMuteTimestamps[symbol] && rowMuteTimestamps[symbol].includes(matchTime);
        const shouldFlash = (matchTime > lastAcknowledgeTime) && !isRowMuted && !isGlobalPaused && !mutedSymbols.has(symbol) && !isExpired;

        // Winner Logic: Call 2 is "First" if t2 < t1
        const isCall2First = t2 < t1;
        const winner = t1 <= t2 ? "c1" : "c2"; 
        const isStrong = winner === "c2";

        // "STRONG" Badge Logic
        if (isStrong) {
            strongBadge = `<span class="ml-1" title="Strong signal">🟡</span>`;
        }

        if (shouldFlash) {
            isCurrentlyFlashing = true;
            if (c1Buy) symbolFlashClass = "flash-green";
            else symbolFlashClass = "flash-red";
        } else if (isExpired && isStrong) {
            // --- PERSISTENCE LOGIC (After 20 mins, Strong Only) ---
            // Static, intense background with white text
            isCurrentlyFlashing = true; // Show timeframe badge for static STRONG too
            if (c1Buy) symbolFlashClass = "static-green";
            else symbolFlashClass = "static-red";
        }
    }
    
    // Per-Row Pause Button
    const pauseBtn = isCurrentlyFlashing 
        ? `<button class="stop-row-btn" onclick="muteRowFlashing('${symbol}', ${matchTime})" title="Pause flashing">⏸️</button>`
        : '';
    
    const isMuted = mutedSymbols.has(symbol);
    const muteIcon = isMuted ? "🔕" : "🔔";
    const muteBtnClass = isMuted ? "muted" : "";

    let rowHTML = `<div class="grid-container text-center ${rowBaseClass} border-b border-gray-100">`;
    
    // 0. Mute Column
    rowHTML += `
      <div class="p-2 border-r border-gray-200 h-full flex items-center justify-center">
          <button class="mute-btn text-xs ${muteBtnClass}" onclick="toggleSymbolMute('${symbol}')" title="Toggle Mute">${muteIcon}</button>
      </div>`;

    // 1. Symbol Name (Left)
    const timeframeBadge = isCurrentlyFlashing ? `<span class="text-xs px-1.5 py-0.5 bg-gray-700 text-white rounded ml-2 opacity-80">${flashTimeframe}</span>` : '';
    const changePercent = priceData[symbol]?.change_percent;
    const arrowColor = isCurrentlyFlashing ? 'text-white' : (changePercent >= 0 ? 'text-green-600' : 'text-red-600');
    const trendArrow = changePercent !== undefined ? `<span class="material-symbols-outlined ${arrowColor} text-lg mr-1" style="text-shadow: 0 0 2px rgba(0,0,0,0.3);">trending_${changePercent >= 0 ? 'up' : 'down'}</span>` : '';
    const percentBadge = changePercent !== undefined ? `<span class="text-xs px-1.5 py-0.5 rounded ml-2 ${changePercent >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}">${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(2)}%</span>` : '';
    rowHTML += `
      <div class="p-2 border-r border-gray-200 font-bold text-gray-800 text-sm flex items-center justify-start pl-4 h-12 ${symbolFlashClass}">
          <div class="flex items-center">
              ${trendArrow}
              <span>${symbol}</span>
              ${percentBadge}
              ${strongBadge}
              ${timeframeBadge}
          </div>
      </div>`;

    // Render Call signals
    SIGNAL_KEYS.slice(0, 5).forEach((key, cellIndex) => {
      let signalData = null;
      if (key === "call3_go") {
        // Use the selected Call 3 mode
        const call3Key = call3Mode === '15m' ? 'call3_go' : 'call3_1h';
        signalData = symbolState ? symbolState[call3Key] : null;
      } else if (key.startsWith("call2")) {
        // Use the selected Call 2 mode
        const call2Key = call2Mode === '15m' ? key : `call2_1h_${key.split('_')[1]}`;
        signalData = symbolState ? symbolState[call2Key] : null;
      } else if (key.startsWith("call1")) {
        // Use the selected Call 1 mode
        const call1Key = call1Mode === '15m' ? key : `call1_1h_${key.split('_')[1]}`;
        signalData = symbolState ? symbolState[call1Key] : null;
      } else {
        signalData = symbolState ? symbolState[key] : null;
      }
      
      const isCall1 = key.startsWith("call1");
      
      let cellBg = "";
      let cellBorder = "border-gray-200"; 
      const isCall3 = key === "call3_go";
      if (isCall1) {
          cellBg = index % 2 === 0 ? "bg-amber-50" : "bg-amber-100/60";
          cellBorder = "border-amber-200/60";
      } else if (isCall3) {
          cellBg = index % 2 === 0 ? "bg-blue-50" : "bg-blue-100/60";
          cellBorder = "border-blue-200/60";
      }

      const borderRight = (cellIndex === 1 || cellIndex === 3 || cellIndex === 4) ? "border-r" : "";
      let cellClasses = `p-2 ${borderRight} ${cellBorder} text-xs transition-colors duration-500 h-12 flex items-center justify-center ${cellBg}`;

      let cellContent = "";
      if (signalData && signalData.active !== false) {
        const isBuy = key.includes("buy");
        const isActive = signalData.active !== false;
        const formattedTime = new Date(signalData.time).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        
        const now = Date.now();
        const animationDuration = isCall1 ? 3000 : 15000;
        const isStillNew = signalData.newSince && now - signalData.newSince < animationDuration && isActive;
        const animationClass = (isStillNew && !isCurrentlyFlashing) ? (isCall1 ? "long-term-highlight" : "highlight-signal") : "";
        
        const count = signalData.count || 0;
        const countDisplay = (count > 0 && isActive && isCall1) ? `<span class="${getCounterClass(count, isBuy)}">${count}</span>` : '';
        const tooltipCount = signalData.count ? ` | Count: <span class="font-bold">${signalData.count}</span>` : '';
        const status = isActive ? '' : ' (Inactive)';

        cellClasses += ` has-tooltip relative ${animationClass}`;
        
        // --- CONTENT SPLIT LOGIC ---
        if (isCall1) {
            // == CALL 1 STYLE (From your snippet) ==
            // Price ONLY. Colored Text. No "Buy/Sell" text.
            const activeGreen = 'text-green-700';
            const activeRed = 'text-red-700';
            const colorClass = isBuy 
              ? (isActive ? activeGreen : 'text-gray-400')
              : (isActive ? activeRed : 'text-gray-400');
            
            cellContent = `
              <div class="${colorClass} font-extrabold text-sm flex justify-center items-center w-full">
                ${countDisplay}
                <span>${signalData.price}</span>
              </div>
              <div class="tooltip absolute bottom-full mb-2 w-max px-3 py-1.5 bg-gray-900 text-white text-xs rounded-md shadow-lg z-20">
                Time: <span class="font-bold">${formattedTime}</span>${tooltipCount}${status}
              </div>
            `;
        } else if (isCall3) {
            // == CALL 3 STYLE (GO/STOP Signal) ==
            const signalType = signalData.signalType;
            const isGO = signalType === 'buy';
            const isSTOP = signalType === 'sell';
            
            // STOP signals disappear after timeout (15min or 1h based on mode)
            const now = Date.now();
            const signalTime = typeof signalData.time === 'number' ? signalData.time : Date.parse(signalData.time);
            const timeSinceSignal = now - signalTime;
            const timeoutMs = call3Mode === '15m' ? (15 * 60 * 1000) : (60 * 60 * 1000);
            const stopExpired = isSTOP && timeSinceSignal > timeoutMs;
            
            if (stopExpired) {
                // Don't show anything if STOP has expired
                cellContent = '';
            } else {
                const displayText = isGO ? 'GO!' : 'STOP!';
                const bgClass = isGO ? 'bg-green-500' : 'bg-red-500';
                
                cellContent = `
                  <div class="${bgClass} text-white font-bold text-xl flex items-center justify-center w-full h-full">
                    <span>${displayText}</span>
                  </div>
                  <div class="tooltip absolute bottom-full mb-2 w-max px-3 py-1.5 bg-gray-900 text-white text-xs rounded-md shadow-lg z-20">
                    Time: <span class="font-bold">${formattedTime}</span>${status}
                  </div>
                `;
            }
        } else {
            // == CALL 2 STYLE (Standard Dashboard) ==
            // Big Diamond + Price Subtext
            let diamond = isBuy ? "◆" : "◆";
            let diamondStyle = isBuy ? 'color: #38CB6E;' : 'color: #F15656;';
            let priceColor = isActive ? 'text-gray-500' : 'text-gray-400';
            
            cellContent = `
              <div class="flex flex-col justify-center items-center">
                <div class="text-2xl" style="${diamondStyle}">${diamond}</div>
                <div class="text-xs ${priceColor} mt-0.5">
                  ${signalData.price}
                </div>
              </div>
              <div class="tooltip absolute bottom-full mb-2 w-max px-3 py-1.5 bg-gray-900 text-white text-xs rounded-md shadow-lg z-20">
                Time: <span class="font-bold">${formattedTime}</span>${tooltipCount}${status}
              </div>
            `;
        }
      }
      rowHTML += `<div class="${cellClasses}">${cellContent}</div>`;
    });

    // Symbol Right
    const arrowColorRight = isCurrentlyFlashing ? 'text-white' : (changePercent >= 0 ? 'text-green-600' : 'text-red-600');
    const trendArrowRight = changePercent !== undefined ? `<span class="material-symbols-outlined ${arrowColorRight} text-lg mr-1" style="text-shadow: 0 0 2px rgba(0,0,0,0.3);">trending_${changePercent >= 0 ? 'up' : 'down'}</span>` : '';
    const percentBadgeRight = changePercent !== undefined ? `<span class="text-xs px-1.5 py-0.5 rounded mr-2 ${changePercent >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}">${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(2)}%</span>` : '';
    rowHTML += `
      <div class="p-2 border-gray-200 font-bold text-gray-800 text-sm flex items-center justify-end pr-4 h-12 ${symbolFlashClass}">
          <div class="flex items-center">
              ${percentBadgeRight}
              ${strongBadge}
              ${trendArrowRight}
              <span>${symbol}</span>
          </div>
      </div>`;

    rowHTML += `</div>`;
    html += rowHTML;
  });
  container.innerHTML = html;
}

function connectWebSocket() {
  const wsProtocol = window.location.protocol === "https:" ? "wss://" : "ws://";
  const ws = new WebSocket(wsProtocol + window.location.host);

  ws.onopen = () => console.log("Connected.");
  ws.onclose = () => {
    gridLeft.innerHTML = '<p class="text-center text-gray-500 mt-10">Reconnecting...</p>';
    gridRight.innerHTML = "";
    setTimeout(connectWebSocket, 3000);
  };
  ws.onerror = (error) => console.error("WS Error:", error);

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.symbol && data.change_percent !== undefined) {
        priceData[data.symbol] = data;
        renderUI();
        return;
      }
      lastData = data; 
      if (data.state && data.scriptListLeft && data.scriptListRight) {
        let newSignalKey = null;
        for (const symbol of [...data.scriptListLeft, ...data.scriptListRight]) {
          if (data.state[symbol]) {
              for (const key of SIGNAL_KEYS) { 
                  const signalData = data.state[symbol][key];
                  if (signalData && signalData.newSince && Date.now() - signalData.newSince < 3000 && signalData.active !== false) {
                      newSignalKey = key;
                      break;
                  }
              }
          }
          if (newSignalKey) break;
        }
        if (newSignalKey) {
          if (newSignalKey.startsWith("call1")) playSound("call1");
          else if (newSignalKey.startsWith("call2")) playSound("call2");
          else if (newSignalKey.startsWith("call3")) playSound("call3");
        }
        renderGrid(gridLeft, data.scriptListLeft, data.state);
        renderGrid(gridRight, data.scriptListRight, data.state);
      }
    } catch (error) { console.error("Error:", error); }
  };
}

connectWebSocket();