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

function setUniversalInterval(interval) {
    call1Mode = interval;
    call2Mode = interval;
    call3Mode = interval;
    
    // Update center display
    document.getElementById('current-interval-display').textContent = interval === '15m' ? '15 min' : '1 hour';
    
    renderUI();
}

// Make function globally available
window.setUniversalInterval = setUniversalInterval;

function toggleSymbolMute(symbol) {
    // Function kept for compatibility but no longer used
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
  const call1ModeToggle = ``;
  const call2ModeToggle = ``;
  const call3ModeToggle = ``;
  
  return `
    <div class="grid-container text-xs font-semibold text-center text-gray-500 sticky top-0 bg-white z-10 shadow-sm border-b border-gray-300">
      <div class="p-2 border-r border-gray-200 row-span-2 flex items-center justify-start pl-2 bg-gray-50">Symbol</div>
      
      <div class="p-2 border-b border-amber-300 col-span-2 bg-amber-400 text-white font-bold tracking-wider flex items-center justify-center">
        <div>CALL 1</div>
      </div>
      <div class="p-2 border-b border-gray-200 col-span-2 bg-gray-100 text-gray-600 flex items-center justify-center font-bold">
        <div>Call 2</div>
      </div>
      <div class="p-2 border-b bg-blue-100 text-blue-600 row-span-2 flex items-center justify-center font-bold">
        <div>CALL 3${goCountDisplay}</div>
      </div>
      
      <div class="p-2 border-amber-200 text-green-700 bg-amber-100">Buy</div>
      <div class="p-2 border-amber-200 text-red-700 bg-amber-100">Sell</div>
      <div class="p-2 border-gray-200 text-green-600 bg-gray-50">Buy</div>
      <div class="p-2 text-red-600 bg-gray-50">Sell</div>
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
    let isCurrentlyFlashing = false;
    let flashTimeframe = "";
    
    let isMatch_15m = (c1Buy_15m && c2Buy_15m) || (c1Sell_15m && c2Sell_15m);
    let isMatch_1h = (c1Buy_1h && c2Buy_1h) || (c1Sell_1h && c2Sell_1h);
    
    // Only check matches for the currently selected mode
    let isMatch = false;
    let isBothIntervals = false;
    let c1Buy;
    
    if (call1Mode === '15m' && call2Mode === '15m') {
      // In 15m mode, check if 15m matches
      if (isMatch_15m) {
        isMatch = true;
        c1Buy = c1Buy_15m;
        // Check if 1h also matches (both intervals)
        isBothIntervals = isMatch_1h;
      }
    } else if (call1Mode === '1h' && call2Mode === '1h') {
      // In 1h mode, check if 1h matches
      if (isMatch_1h) {
        isMatch = true;
        c1Buy = c1Buy_1h;
        // Check if 15m also matches (both intervals)
        isBothIntervals = isMatch_15m;
      }
    }
    
    if (isMatch) {
        isCurrentlyFlashing = true;
        if (isBothIntervals) {
            // Both intervals match - check if same color
            const sameColor = (isMatch_15m && c1Buy_15m === c1Buy_1h) || (isMatch_15m && c1Sell_15m === c1Sell_1h);
            
            if (sameColor) {
                // Same color in both intervals - use black border
                if (c1Buy) symbolFlashClass = "flash-green";
                else symbolFlashClass = "flash-red";
            } else {
                // Different colors - use static highlight
                if (c1Buy) symbolFlashClass = "static-green";
                else symbolFlashClass = "static-red";
            }
        } else {
            // Single interval match - use static highlight
            if (c1Buy) symbolFlashClass = "static-green";
            else symbolFlashClass = "static-red";
        }
    }
    

    
    const isMuted = mutedSymbols.has(symbol);
    const muteIcon = isMuted ? "🔕" : "🔔";
    const muteBtnClass = isMuted ? "muted" : "";

    const isDualMatch = isBothIntervals && ((isMatch_15m && c1Buy_15m === c1Buy_1h) || (isMatch_15m && c1Sell_15m === c1Sell_1h));
    const strongRowClass = isDualMatch ? (c1Buy ? 'strong-row-buy' : 'strong-row-sell') : '';
    let rowHTML = `<div class="grid-container text-center ${rowBaseClass} ${strongRowClass} border-b border-gray-100">`;
    
    // 0. Symbol Name (Left)
    const changePercent = priceData[symbol]?.change_percent;
    const arrowColor = isCurrentlyFlashing ? 'text-white' : (changePercent >= 0 ? 'text-green-600' : 'text-red-600');
    const trendArrow = changePercent !== undefined ? `<span class="material-symbols-outlined ${arrowColor} text-lg mr-1" style="text-shadow: 0 0 2px rgba(0,0,0,0.3);">trending_${changePercent >= 0 ? 'up' : 'down'}</span>` : '';
    const percentBadge = changePercent !== undefined ? `<span class="text-xs px-1.5 py-0.5 rounded mr-2 ${changePercent >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}">${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(2)}%</span>` : '';
    const strongBadge = isDualMatch ? `<span class="strong-badge ${c1Buy ? 'badge-buy' : 'badge-sell'}">STRONG</span>` : '';
    rowHTML += `
      <div class="p-2 border-r border-gray-200 font-bold text-gray-800 text-sm flex items-center justify-start pl-4 h-12 ${symbolFlashClass}">
          <div class="flex items-center">
              ${trendArrow}
              ${percentBadge}
              <span>${symbol}</span>
              ${strongBadge}
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

      const borderRight = (cellIndex === 1 || cellIndex === 3) ? "border-r" : "";
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