// File: index.js
// Final version: 48 Stock Symbols, "Trading_Signals" table, Counter + Strikethrough logic.

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

// IMPORTANT: Pointing to the original table to retain data
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
const ALL_SIGNAL_KEYS = ["call1_buy", "call1_sell", "call2_buy", "call2_sell"];

// --- State Management ---
let signalState = {};

// Function to create a clean state for one symbol
const createInitialSymbolState = () => ({
    call1_buy: null,
    call1_sell: null,
    call2_buy: null,
    call2_sell: null,
    // Track last signal for EACH call separately
    _lastCall1Key: null,
    _lastCall2Key: null
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
  else if (indicator === 2) term = "call2";
  else return res.status(400).send("Invalid indicator value.");

  // Validate signal type
  if (signal !== "buy" && signal !== "sell") {
    return res.status(400).send("Invalid signal type.");
  }

  const stateKey = `${term}_${signal}`; // e.g., "call1_buy"
  
  // Determine which 'last key' tracker to use based on the term
  const lastKeyTracker = term === "call1" ? "_lastCall1Key" : "_lastCall2Key";
  const lastSignalKey = signalState[symbol][lastKeyTracker];
  let newCount = 1;

  // --- COUNTER & STRIKETHROUGH LOGIC ---
  if (lastSignalKey === stateKey) {
      // 1. SAME SIGNAL: Increment counter, keep active
      newCount = (signalState[symbol][stateKey]?.count || 0) + 1;
  } else {
      // 2. NEW SIGNAL FOR THIS TERM: Reset count & deactivate ONLY the other signal in THIS term
      newCount = 1;
      // If term is 'call1' and signal is 'buy', deactivate 'call1_sell'
      const otherSignal = signal === "buy" ? "sell" : "buy";
      const otherKey = `${term}_${otherSignal}`;
      
      if (signalState[symbol][otherKey]) {
          signalState[symbol][otherKey].active = false;
      }
  }
  
  // Update the new/current signal
  signalState[symbol][stateKey] = {
    ...(signalState[symbol][stateKey] || {}), // Keep existing props
    price,
    time,
    newSince: Date.now(),
    count: newCount,
    active: true
  };

  // Update the correct tracker
  signalState[symbol][lastKeyTracker] = stateKey;
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