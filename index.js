// File: index.js
// Final version: 48 Stock Symbols, "Trading_Signals" table, Counter + Strikethrough logic.
// NEW: Adds trendStartTime to track "First Mover".

require('dotenv').config();
const express = require("express");
const http = require("http");
const path = require("path");
const { WebSocketServer } = require("ws");
const {
  DynamoDBClient,
  ScanCommand,
  PutItemCommand,
} = require("@aws-sdk/client-dynamodb");

// --- AWS and App Setup ---
const port = process.env.PORT || 3000;
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const dynamoDBClient = new DynamoDBClient({
  region: process.env.AWS_REGION || "eu-north-1",
});

// CORRECT: Pointing to the NEW table with the correct schema (PK: symbol)
const tableName = "Trading_Signals_2"; 

// --- Static Symbol Lists (48 Stocks) ---
const STATIC_SYMBOLS_LEFT = [
    "BANKNIFTY", "NIFTY", "MCX", "BSE", "TITAN", "SHREECEM",
    "BAJFINANCE", "DIVISLAB", "BEL", "ULTRACEMCO", "ETERNAL", "PAGEIND",
    "BRITANNIA", "ITC", "DLF", "HAL", "GLENMARK", "SUNPHARMA",
    "INDHOTEL", "SHRIRAMFIN", "INDUSTOWER", "BAJAJFINSV", "CANBK", "UNIONBANK"
]; // 24 symbols

const STATIC_SYMBOLS_RIGHT = [
    "LT", "LTF", "OFSS", "PERSISTENT", "SOLARINDS", "ABCAPITAL",
    "COFORGE", "JIOFIN", "SRF", "SBIN", "BHARTIARTL", "POLYCAB",
    "MARUTI", "EICHERMOT", "BHEL", "TVSMOTOR", "CGPOWER", "SUPREMEIND",
    "TCS", "INFY", "PIDILITIND", "CUMMINSIND", "TRENT", "KALYANKJIL"
]; // 24 symbols

const ALL_SYMBOLS = [...STATIC_SYMBOLS_LEFT, ...STATIC_SYMBOLS_RIGHT];
const ALL_SIGNAL_KEYS = ["call1_buy", "call1_sell", "call1_1h", "call2_buy", "call2_sell", "call2_1h", "call3_go", "call3_1h", "call1_page2_buy", "call1_page2_sell", "call2_page2_buy", "call2_page2_sell", "call3_page2_buy", "call3_page2_sell", "orb_5m", "orb_15m", "orb_1h"];

// --- State Management ---
let signalState = {};
let priceState = {};

// Function to create a clean state for one symbol
const createInitialSymbolState = () => ({
    call1_buy: null,
    call1_sell: null,
    call1_1h: null,
    call2_buy: null,
    call2_sell: null,
    call2_1h: null,
    call3_go: null,
    call3_1h: null,
    call1_page2_buy: null,
    call1_page2_sell: null,
    call2_page2_buy: null,
    call2_page2_sell: null,
    call3_page2_buy: null,
    call3_page2_sell: null,
    orb_5m: null,
    orb_15m: null,
    orb_1h: null,
    // Track last signal for EACH call separately
    _lastCall1Key: null,
    _lastCall1_1hKey: null,
    _lastCall2Key: null,
    _lastCall2_1hKey: null,
    _lastCall3Key: null,
    _lastCall3_1hKey: null,
    _lastCall1Page2Key: null,
    _lastCall2Page2Key: null,
    _lastCall3Page2Key: null
});

// Function to initialize the state for all symbols
const initializeState = () => {
    signalState = {};
    ALL_SYMBOLS.forEach(symbol => {
        signalState[symbol] = createInitialSymbolState();
    });
};
initializeState(); // Set up the initial empty state

// --- Middleware ---
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// --- Helper Functions ---
function broadcastState() {
  const payload = JSON.stringify({
    state: signalState,
    scriptListLeft: STATIC_SYMBOLS_LEFT,
    scriptListRight: STATIC_SYMBOLS_RIGHT,
  });
  for (const client of wss.clients) {
    if (client.readyState === client.OPEN) {
      client.send(payload);
    }
  }
}

// --- WebSocket Connection Handling ---
wss.on("connection", (ws) => {
  console.log("🔗 Client connected");
  ws.isAlive = true;
  ws.on("pong", () => {
    ws.isAlive = true;
  });

  // Send current state immediately
  ws.send(JSON.stringify({
    state: signalState,
    scriptListLeft: STATIC_SYMBOLS_LEFT,
    scriptListRight: STATIC_SYMBOLS_RIGHT,
  }));
  
  // Send all price data
  Object.values(priceState).forEach(priceData => {
    ws.send(JSON.stringify(priceData));
  });

  ws.on("close", () => {
    console.log("👋 Client disconnected");
  });
});

// --- Heartbeat Interval ---
const interval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);


// --- API Endpoints ---
app.post("/orb", async (req, res) => {
  const { symbol, type, high, low, time } = req.body;

  // Basic Validation
  if (!symbol || !type || !high || !low || !time) {
    return res.status(400).send("Invalid ORB data. Missing fields.");
  }
  if (!signalState[symbol]) {
    return res.status(400).send("Symbol is not tracked.");
  }

  // Map type to ORB key
  let orbKey;
  if (type === "5min_ORB") orbKey = "orb_5m";
  else if (type === "15min_ORB") orbKey = "orb_15m";
  else if (type === "60min_ORB") orbKey = "orb_1h";
  else return res.status(400).send("Invalid ORB type.");

  // Update ORB data
  signalState[symbol][orbKey] = {
    high,
    low,
    time,
    newSince: Date.now()
  };

  console.log(`✅ ORB updated for ${symbol}: ${orbKey} -> H:${high} L:${low}`);

  // Persist to DynamoDB
  try {
    const ttl_timestamp = Math.floor(Date.now() / 1000) + 15 * 24 * 60 * 60;
    const params = {
      TableName: tableName,
      Item: {
        symbol: { S: symbol },
        stateData: { S: JSON.stringify(signalState[symbol]) },
        lastUpdated: { S: new Date().toISOString() },
        ttl: { N: ttl_timestamp.toString() },
      },
    };
    await dynamoDBClient.send(new PutItemCommand(params));
    console.log(`💾 Persisted ORB state for ${symbol} to DynamoDB.`);
  } catch (dbError) {
    console.error("🔥 DynamoDB Put Error:", dbError);
  }

  broadcastState();
  res.status(200).send("ORB received!");
});

app.post("/price", async (req, res) => {
  const { symbol, open_price, current_price, change_percent, time } = req.body;

  if (!symbol || change_percent === undefined) {
    return res.status(400).send("Invalid price data.");
  }

  const priceData = { symbol, open_price, current_price, change_percent, time };
  priceState[symbol] = priceData;
  
  // Broadcast to all connected clients
  for (const client of wss.clients) {
    if (client.readyState === client.OPEN) {
      client.send(JSON.stringify(priceData));
    }
  }

  console.log(`📊 Price update: ${symbol} ${change_percent >= 0 ? '+' : ''}${change_percent}%`);
  res.status(200).send("Price received!");
});

app.post("/webhook", async (req, res) => {
  const { symbol, signal, indicator, price, time } = req.body;

  // Basic Validation
  if (!symbol || !signal || indicator === undefined || !price || !time) {
    return res.status(400).send("Invalid webhook data. Missing fields.");
  }
  if (!signalState[symbol]) {
    return res.status(400).send("Symbol is not tracked.");
  }

  // Map 'indicator' number to term string
  let term;
  if (indicator === 1) term = "call1";
  else if (indicator === 12) term = "call1_1h";
  else if (indicator === 10) term = "call2"; // Changed from indicator 2 to 10
  else if (indicator === 11) term = "call2_1h";
  else if (indicator === 3) term = "call3";
  else if (indicator === 4) term = "call3_1h";
  else if (indicator === 5) term = "call1_page2";
  else if (indicator === 6) term = "call2_page2";
  else if (indicator === 7) term = "call3_page2";
  else return res.status(400).send("Invalid indicator value.");

  // Validate signal type and handle call3 special case
  if (signal !== "buy" && signal !== "sell") {
    return res.status(400).send("Invalid signal type.");
  }

  let stateKey;
  if (term === "call3") {
    stateKey = "call3_go"; // Both buy and sell map to call3_go
  } else if (term === "call3_1h") {
    stateKey = "call3_1h"; // Both buy and sell map to call3_1h
  } else if (term === "call1_1h") {
    stateKey = `call1_1h_${signal}`; // e.g., "call1_1h_buy"
  } else if (term === "call2_1h") {
    stateKey = `call2_1h_${signal}`; // e.g., "call2_1h_buy"
  } else {
    stateKey = `${term}_${signal}`; // e.g., "call1_buy" or "call1_page2_buy"
  }
  
  // Determine which 'last key' tracker to use based on the term
  let lastKeyTracker;
  if (term === "call1") lastKeyTracker = "_lastCall1Key";
  else if (term === "call1_1h") lastKeyTracker = "_lastCall1_1hKey";
  else if (term === "call2") lastKeyTracker = "_lastCall2Key";
  else if (term === "call2_1h") lastKeyTracker = "_lastCall2_1hKey";
  else if (term === "call3") lastKeyTracker = "_lastCall3Key";
  else if (term === "call3_1h") lastKeyTracker = "_lastCall3_1hKey";
  else if (term === "call1_page2") lastKeyTracker = "_lastCall1Page2Key";
  else if (term === "call2_page2") lastKeyTracker = "_lastCall2Page2Key";
  else if (term === "call3_page2") lastKeyTracker = "_lastCall3Page2Key";
  
  const lastSignalKey = signalState[symbol][lastKeyTracker];
  let newCount = 1;
  
  // NEW: Track Start Time for "First Mover" Arrow Logic
  let trendStartTime = Date.now();

  // --- COUNTER & STRIKETHROUGH LOGIC ---
  if (term === "call3" || term === "call3_1h") {
      // Special handling for call3: only show STOP if GO was there before
      if (signal === "sell") {
        // Check if there was a previous GO signal
        const existingSignal = signalState[symbol][stateKey];
        if (!existingSignal || existingSignal.signalType !== "buy") {
          // No previous GO signal, ignore this STOP
          return res.status(200).send("STOP ignored - no previous GO signal");
        }
      }
      newCount = 1;
      // For call3, store the signal type (buy=GO, sell=STOP) in the data
  } else if (lastSignalKey === stateKey) {
      // 1. SAME SIGNAL: Increment counter, keep active
      const oldSignal = signalState[symbol][stateKey];
      newCount = (oldSignal?.count || 0) + 1;
      if (oldSignal && oldSignal.trendStartTime) {
          trendStartTime = oldSignal.trendStartTime;
      }
  } else {
      // 2. NEW SIGNAL FOR THIS TERM: Reset count & deactivate other signal
      newCount = 1;
      
      const otherSignal = signal === "buy" ? "sell" : "buy";
      const otherKey = `${term}_${otherSignal}`;
      
      if (signalState[symbol][otherKey]) {
          signalState[symbol][otherKey].active = false;
      }
  }
  
  // Update the new/current signal
  const signalData = {
    ...(signalState[symbol][stateKey] || {}),
    price,
    time,
    newSince: Date.now(),
    count: newCount,
    active: true,
    trendStartTime: trendStartTime
  };
  
  // For call3, store the signal type for GO/STOP display
  if (term === "call3" || term === "call3_1h") {
    signalData.signalType = signal; // "buy" or "sell"
  }
  
  signalState[symbol][stateKey] = signalData;

  // Update the correct tracker
  if (lastKeyTracker) {
    signalState[symbol][lastKeyTracker] = stateKey;
  }
  // --- End Logic ---

  console.log(`✅ State updated for ${symbol}: ${stateKey} -> ${price} (Count: ${newCount})`);

  // Persist to DynamoDB
  try {
    const ttl_timestamp = Math.floor(Date.now() / 1000) + 15 * 24 * 60 * 60; // 15 days
    const params = {
      TableName: tableName,
      Item: {
        symbol: { S: symbol },
        stateData: { S: JSON.stringify(signalState[symbol]) },
        lastUpdated: { S: new Date().toISOString() },
        ttl: { N: ttl_timestamp.toString() },
      },
    };
    await dynamoDBClient.send(new PutItemCommand(params));
    console.log(`💾 Persisted state for ${symbol} to DynamoDB.`);
  } catch (dbError) {
    console.error("🔥 DynamoDB Put Error:", dbError);
  }

  broadcastState();
  res.status(200).send("Webhook received!");
});

// --- Function to load data from DynamoDB on startup ---
async function loadDataFromDB() {
  console.log("...Loading initial data from DynamoDB...");
  initializeState(); 

  try {
    const params = { TableName: tableName };
    const data = await dynamoDBClient.send(new ScanCommand(params));

    if (data.Items) {
      data.Items.forEach((item) => {
        if (item.symbol && item.symbol.S && item.stateData && item.stateData.S) {
          const symbolKey = item.symbol.S;
          // Only load data if symbol exists in our static list
          if (signalState[symbolKey]) {
            const stateData = JSON.parse(item.stateData.S);
            signalState[symbolKey] = { ...signalState[symbolKey], ...stateData };
          }
        }
      });
      console.log(`✅ Successfully loaded ${data.Items.length} entries from DynamoDB.`);
    }
  } catch (dbError) {
    console.error("🔥 DynamoDB Scan Error on startup:", dbError);
  }
}

// --- Start Server ---
server.listen(port, async () => {
  await loadDataFromDB();
  console.log(`🚀 Server running on port ${port}`);
});