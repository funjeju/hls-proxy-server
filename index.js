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

// HLS 프록시 엔드포인트 (메인 manifest)
app.get('/proxy-hls', (req, res) => {
  const targetUrl = req.query.url;

  if (!targetUrl) {
    return res.status(400).json({ error: 'URL parameter is required' });
  }

  console.log('Proxying HLS request to:', targetUrl);

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

// HLS 청크 파일들을 위한 catch-all 프록시 엔드포인트
app.get('/:filename', (req, res) => {
  // .m3u8, .ts 파일들만 처리
  const filename = req.params.filename;
  if (!filename.endsWith('.m3u8') && !filename.endsWith('.ts')) {
    return res.status(404).json({ error: 'File not found' });
  }

  // Referer 헤더에서 원본 서버 추출
  const referer = req.get('Referer');
  if (!referer || !referer.includes('proxy-hls?url=')) {
    return res.status(400).json({ error: 'Invalid request' });
  }

  // 원본 URL에서 베이스 경로 추출
  const urlMatch = referer.match(/url=([^&]+)/);
  if (!urlMatch) {
    return res.status(400).json({ error: 'Cannot determine base URL' });
  }

  const originalUrl = decodeURIComponent(urlMatch[1]);
  const baseUrl = originalUrl.replace(/\/[^\/]*$/, ''); // 마지막 파일명 제거
  const targetUrl = `${baseUrl}/${filename}`;

  console.log('Proxying chunk file:', targetUrl);

  const requestModule = targetUrl.startsWith('https://') ? https : http;

  const proxyReq = requestModule.get(targetUrl, (proxyRes) => {
    Object.keys(proxyRes.headers).forEach(key => {
      res.setHeader(key, proxyRes.headers[key]);
    });

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');

    res.status(proxyRes.statusCode);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    console.error('Chunk proxy error:', err);
    res.status(500).json({ error: 'Failed to proxy chunk file', details: err.message });
  });

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