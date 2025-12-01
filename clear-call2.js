require('dotenv').config();
const { DynamoDBClient, ScanCommand, PutItemCommand } = require("@aws-sdk/client-dynamodb");

const dynamoDBClient = new DynamoDBClient({
  region: process.env.AWS_REGION || "eu-north-1",
});

const tableName = "Trading_Signals_2";

async function clearCall2() {
  console.log("Clearing Call 2 signals from all symbols...");
  
  try {
    // Get all items
    const scanParams = { TableName: tableName };
    const data = await dynamoDBClient.send(new ScanCommand(scanParams));
    
    if (data.Items) {
      for (const item of data.Items) {
        if (item.symbol && item.symbol.S && item.stateData && item.stateData.S) {
          const symbolKey = item.symbol.S;
          const stateData = JSON.parse(item.stateData.S);
          
          // Clear call2 signals
          stateData.call2_buy = null;
          stateData.call2_sell = null;
          stateData._lastCall2Key = null;
          
          // Update the item
          const updateParams = {
            TableName: tableName,
            Item: {
              symbol: { S: symbolKey },
              stateData: { S: JSON.stringify(stateData) },
              lastUpdated: { S: new Date().toISOString() },
              ttl: item.ttl
            },
          };
          
          await dynamoDBClient.send(new PutItemCommand(updateParams));
          console.log(`✅ Cleared Call 2 for ${symbolKey}`);
        }
      }
      console.log("🎉 All Call 2 signals cleared!");
    }
  } catch (error) {
    console.error("❌ Error:", error);
  }
}

clearCall2();