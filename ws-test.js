const WebSocket = require('ws');

const ws = new WebSocket('wss://f1dash.net/ws');

ws.on('open', () => {
  console.log('Connected');
});

ws.on('message', (data) => {
  const parsed = JSON.parse(data.toString());
  console.log('Keys:', Object.keys(parsed));
  
  if (parsed.TimingData) {
    if (parsed.TimingData.Lines) {
       console.log('TimingData Lines sample:', JSON.stringify(Object.values(parsed.TimingData.Lines)[0]).substring(0, 500));
    }
  }
  
  if (parsed.TimingAppData) {
     if (parsed.TimingAppData.Lines) {
       console.log('TimingAppData Lines sample:', JSON.stringify(Object.values(parsed.TimingAppData.Lines)[0]).substring(0, 500));
     }
  }
  
  if (parsed.SessionData) {
      console.log('Has SessionData. Status:', parsed.SessionData.Status);
  }
  
  ws.close();
});

ws.on('error', (err) => {
  console.error('Error', err);
});
