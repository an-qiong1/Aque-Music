const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
http.get('http://127.0.0.1:9222/json', r => {
  let b = '';
  r.on('data', c => b += c);
  r.on('end', () => {
    const p = JSON.parse(b)[0];
    const ws = new WebSocket(p.webSocketDebuggerUrl);
    ws.on('open', () => {
      ws.send(JSON.stringify({id:1,method:'Runtime.evaluate',params:{expression:'"CDP: connected at " + Date.now()'}}));
    });
    ws.on('message', d => {
      const m = JSON.parse(d.toString());
      if (m.id === 1 && m.result) {
        console.log('EVAL:', m.result.result.value);
        ws.send(JSON.stringify({id:2,method:'Page.captureScreenshot',params:{format:'png',fromSurface:true}}));
      }
      if (m.id === 2 && m.result) {
        const b64 = m.result.data;
        fs.writeFileSync('screenshot.png', Buffer.from(b64, 'base64'));
        console.log('SCREENSHOT OK:', (b64.length * 0.75 / 1024).toFixed(0), 'KB');
        ws.close();
        process.exit(0);
      }
    });
    ws.on('error', e => { console.error('WSERR:', e.message); process.exit(1); });
    setTimeout(() => { console.log('TIMEOUT'); process.exit(1); }, 10000);
  });
});