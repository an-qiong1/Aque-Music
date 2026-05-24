const http = require('http');
http.get('http://127.0.0.1:9222/json', r => {
  let b = '';
  r.on('data', c => b += c);
  r.on('end', () => {
    const targets = JSON.parse(b);
    console.log('Number of targets:', targets.length);
    targets.forEach((t, i) => {
      console.log(`${i}: type=${t.type}, url=${t.url}, title=${t.title}`);
    });
  });
});