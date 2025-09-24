const express = require('express');
const cors = require('cors');
const http = require('http');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3001;

// CORS 설정
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: '*'
}));

// HLS 프록시 엔드포인트
app.get('/proxy-hls', (req, res) => {
  const targetUrl = req.query.url;

  if (!targetUrl) {
    return res.status(400).json({ error: 'URL parameter is required' });
  }

  console.log('Proxying request to:', targetUrl);

  // HTTP 또는 HTTPS 프로토콜에 따라 적절한 모듈 선택
  const requestModule = targetUrl.startsWith('https://') ? https : http;

  const proxyReq = requestModule.get(targetUrl, (proxyRes) => {
    // 원본 응답의 헤더를 클라이언트에 전달
    Object.keys(proxyRes.headers).forEach(key => {
      res.setHeader(key, proxyRes.headers[key]);
    });

    // CORS 헤더 추가
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');

    // 응답 상태 코드 설정
    res.status(proxyRes.statusCode);

    // 스트림 데이터를 클라이언트로 파이프
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    console.error('Proxy request error:', err);
    res.status(500).json({ error: 'Failed to proxy request', details: err.message });
  });

  // 클라이언트가 연결을 끊으면 프록시 요청도 중단
  req.on('close', () => {
    proxyReq.abort();
  });
});

// Health check 엔드포인트
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// 기본 라우트
app.get('/', (req, res) => {
  res.json({
    message: 'HLS Proxy Server',
    usage: '/proxy-hls?url=<your-hls-stream-url>',
    example: '/proxy-hls?url=http://example.com/stream.m3u8'
  });
});

app.listen(PORT, () => {
  console.log(`HLS Proxy Server running on port ${PORT}`);
});