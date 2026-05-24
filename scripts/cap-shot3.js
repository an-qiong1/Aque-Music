const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
(async () => {
  try {
    const res = await new Promise((resolve, reject) => {
      http.get('http://127.0.0.1:9222/json', r => {
        let b = '';
        r.on('data', c => b += c);
        r.on('end', () => {
          try {
            resolve(JSON.parse(b));
          } catch (e) {
            reject(e);
          }
        });
      }).on('error', reject);
    });
    const targets = res;
    let target = null;
    for (const t of targets) {
      if (t.type === 'page') {
        target = t;
        break;
      }
    }
    if (!target) {
      console.error('No page target found');
      process.exit(1);
    }
    console.log('Target:', target.url);
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    let id = 1;
    const send = (method, params) => {
      const msg = {id: id++, method, params};
      ws.send(JSON.stringify(msg));
      return msg.id - 1;
    };
    ws.on('open', () => {
      console.log('WS open');
      send('Page.enable', {});
    });
    ws.on('message', async (data) => {
      const m = JSON.parse(data.toString());
      if (m.id === 1 && m.result) {
        console.log('Page enabled');
        // Wait a bit for page to settle
        setTimeout(() => {
          send('Page.captureScreenshot', {format:'png', fromSurface:true});
        }, 500);
      }
      if (m.id === 2 && m.result) {
        console.log('EVAL:', m.result.result.value);
      }
      if (m.id === 3 && m.result) {
        const b64 = m.result.data;
        const buffer = Buffer.from(b64, 'base64');
        fs.writeFileSync('screenshot.png', buffer);
        console.log('SCREENSHOT OK:', (b64.length * 0.75 / 1024).toFixed(0), 'KB');
        ws.close();
        process.exit(0);
      }
      if (m.error) {
        console.error('Error:', m.error);
        ws.close();
        process.exit(1);
      }
    });
    ws.on('error', e => {
      console.error('WSERR:', e.message);
      process.exit(1);
    });
    // Timeout after 20 seconds
    setTimeout(() => {
      console.log('TIMEOUT');
      ws.close();
      process.exit(1);
    }, 20000);
  } catch (e) {
    console.error('Exception:', e);
    process.exit(1);
  }
})();