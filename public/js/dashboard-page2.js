const gridLeft = document.getElementById("grid-left");
const gridRight = document.getElementById("grid-right");
const globalStopBtn = document.getElementById("global-stop-btn");
const globalPauseBtn = document.getElementById("global-pause-btn");
const SIGNAL_KEYS = ["call1_buy", "call1_sell", "call2_buy", "call2_sell", "call3_buy", "call3_sell"];
const FLASH_TIMEOUT_MS = 20 * 60 * 1000; // 20 Minutes in Milliseconds

// --- STATE ---
let lastAcknowledgeTime = 0; 
let isGlobalPaused = false; 
const rowMuteTimestamps = {}; 
const mutedSymbols = new Set();
let lastData = null;

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
  const baseClasses = "flex items-center justify-center w-4 h-4 rounded-full text-white text-xs font-bold mr-1.5 shadow-sm";
  let colorClass = '';
  if (isBuy) {
    if (count < 3) colorClass = 'bg-green-500';
    else if (count < 6) colorClass = 'bg-green-600';
    else colorClass = 'bg-green-800';
  } else {
    if (count < 3) colorClass = 'bg-red-500';
    else if (count < 6) colorClass = 'bg-red-600';
    else colorClass = 'bg-red-800';
  }
  return `${baseClasses} ${colorClass}`;
}

// --- RENDER ---
function createHeader() {
  return `
    <div class="grid-container text-xs font-semibold text-center text-gray-500 sticky top-0 bg-white z-10 shadow-sm border-b border-gray-300">
      <div class="p-2 border-r border-gray-200 row-span-2 flex items-center justify-center bg-gray-50">🔔</div>
      <div class="p-2 border-r border-gray-200 row-span-2 flex items-center justify-start pl-2 bg-gray-50">Symbol</div>
      
      <div class="p-2 border-b border-amber-300 col-span-2 bg-amber-400 text-white font-bold tracking-wider">CALL 1</div>
      <div class="p-2 border-b border-gray-200 col-span-2 bg-gray-100 text-gray-600">Call 2</div>
      <div class="p-2 border-b border-r border-gray-200 col-span-2 bg-blue-100 text-blue-600">Call 3</div>
      <div class="p-2 row-span-2 flex items-center justify-end pr-4 bg-gray-50">Symbol</div>
      
      <div class="p-2 border-amber-200 text-green-700 bg-amber-100">Buy</div>
      <div class="p-2 border-amber-200 text-red-700 bg-amber-100">Sell</div>
      <div class="p-2 border-gray-200 text-green-600 bg-gray-50">Buy</div>
      <div class="p-2 border-gray-200 text-red-600 bg-gray-50">Sell</div>
      <div class="p-2 border-gray-200 text-green-600 bg-blue-50">Buy</div>
      <div class="p-2 border-r border-gray-200 text-red-600 bg-blue-50">Sell</div>
    </div>
  `;
}

function renderGrid(container, scriptList, state) {
  let html = createHeader();
  
  scriptList.forEach((symbol, index) => {
    const symbolState = state[symbol];
    let rowBaseClass = index % 2 === 0 ? "bg-white" : "bg-gray-50";
    
    // --- MATCHING LOGIC ---
    const c1Buy = symbolState['call1_buy_page2']?.active;
    const c1Sell = symbolState['call1_sell_page2']?.active;
    const c2Buy = symbolState['call2_buy_page2']?.active;
    const c2Sell = symbolState['call2_sell_page2']?.active;

    let symbolFlashClass = ""; 
    let strongBadge = "";
    let matchTime = 0;
    let isCurrentlyFlashing = false;
    
    let isMatch = (c1Buy && c2Buy) || (c1Sell && c2Sell);
    
    if (isMatch) {
        let t1 = 0; t2 = 0;
        
        if (c1Buy) {
            t1 = symbolState['call1_buy_page2'].trendStartTime || symbolState['call1_buy_page2'].time || 0;
            t2 = symbolState['call2_buy_page2'].trendStartTime || symbolState['call2_buy_page2'].time || 0;
        } else {
            t1 = symbolState['call1_sell_page2'].trendStartTime || symbolState['call1_sell_page2'].time || 0;
            t2 = symbolState['call2_sell_page2'].trendStartTime || symbolState['call2_sell_page2'].time || 0;
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
            const badgeColor = c1Buy ? "badge-buy" : "badge-sell";
            strongBadge = `<span class="strong-badge ${badgeColor}">STRONG</span>`;
        }

        if (shouldFlash) {
            isCurrentlyFlashing = true;
            if (c1Buy) symbolFlashClass = "flash-green";
            else symbolFlashClass = "flash-red";
        } else if (isExpired && isStrong) {
            // --- PERSISTENCE LOGIC (After 20 mins, Strong Only) ---
            // Static, intense background with white text
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
    rowHTML += `
      <div class="p-2 border-r border-gray-200 font-bold text-gray-800 text-sm flex items-center justify-between pl-4 h-12 ${symbolFlashClass}">
          <div class="flex items-center">
              <span>${symbol}</span>
              ${strongBadge}
          </div>
          ${pauseBtn}
      </div>`;

    SIGNAL_KEYS.forEach((key, cellIndex) => {
      const page2Key = key + '_page2';
      const signalData = symbolState ? symbolState[page2Key] : null;
      const isCall1 = key.startsWith("call1");
      
      let cellBg = "";
      let cellBorder = "border-gray-200"; 
      const isCall3 = key.startsWith("call3");
      if (isCall1) {
          cellBg = index % 2 === 0 ? "bg-amber-50" : "bg-amber-100/60";
          cellBorder = "border-amber-200/60";
      } else if (isCall3) {
          cellBg = index % 2 === 0 ? "bg-blue-50" : "bg-blue-100/60";
          cellBorder = "border-blue-200/60";
      }

      const borderRight = (cellIndex === 1 || cellIndex === 3 || cellIndex === 5) ? "border-r" : "";
      let cellClasses = `p-2 ${borderRight} ${cellBorder} text-xs transition-colors duration-500 h-12 flex items-center justify-center ${cellBg}`;

      let cellContent = "";
      if (signalData) {
        const isBuy = key.includes("buy");
        const isActive = signalData.active !== false;
        const strikethroughClass = isActive ? '' : 'line-through opacity-50';
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
            // == CALL 1 STYLE ==
            const activeGreen = 'text-green-700';
            const activeRed = 'text-red-700';
            const colorClass = isBuy 
              ? (isActive ? activeGreen : 'text-gray-400')
              : (isActive ? activeRed : 'text-gray-400');
            
            cellContent = `
              <div class="${colorClass} font-extrabold text-sm flex justify-center items-center w-full">
                ${countDisplay}
                <span class="${strikethroughClass}">${signalData.price}</span>
              </div>
              <div class="tooltip absolute bottom-full mb-2 w-max px-3 py-1.5 bg-gray-900 text-white text-xs rounded-md shadow-lg z-20">
                Time: <span class="font-bold">${formattedTime}</span>${tooltipCount}${status}
              </div>
            `;
        } else {
            // == CALL 2 & CALL 3 STYLE ==
            let signalText = isBuy ? "BUY" : "SELL";
            let activeColor = isBuy ? 'text-green-600' : 'text-red-600';
            let priceColor = isActive ? 'text-gray-500' : 'text-gray-400';
            let colorClass = isActive ? activeColor : 'text-gray-400';
            
            cellContent = `
              <div class="flex flex-col justify-center items-center ${strikethroughClass}">
                <div class="${colorClass} font-bold text-sm flex justify-center items-center w-full">
                  <span>${signalText}</span>
                </div>
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
    rowHTML += `
      <div class="p-2 border-gray-200 font-bold text-gray-800 text-sm flex items-center justify-end pr-4 h-12 ${symbolFlashClass}">
          <div class="flex items-center">
              ${strongBadge}
              <span class="ml-2">${symbol}</span>
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
      lastData = data; 
      if (data.state && data.scriptListLeft && data.scriptListRight) {
        let newSignalKey = null;
        for (const symbol of [...data.scriptListLeft, ...data.scriptListRight]) {
          if (data.state[symbol]) {
              for (const key of SIGNAL_KEYS) { 
                  const page2Key = key + '_page2';
                  const signalData = data.state[symbol][page2Key];
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