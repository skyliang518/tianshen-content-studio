import http from 'node:http';
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const kind = process.env.SITE_KIND === 'analytics' ? 'analytics' : 'workbench';
const port = Number(process.env.PORT || (kind === 'analytics' ? 8792 : 8791));
const root = process.env.APP_ROOT || process.cwd();
const staticRoot = join(root, 'apps', kind);
const dataRoot = join(root, 'data');
const mediaRoot = join(root, 'media');

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif'
};

function headers(contentType, cache = 'no-store') {
  return {
    'Content-Type': contentType,
    'Cache-Control': cache,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-Frame-Options': 'DENY',
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
  };
}

function send(res, status, body, contentType = 'application/json; charset=utf-8', cache) {
  const payload = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
  res.writeHead(status, { ...headers(contentType, cache), 'Content-Length': payload.length });
  res.end(payload);
}

function json(res, status, value) {
  send(res, status, JSON.stringify(value), 'application/json; charset=utf-8');
}

async function fileResponse(res, path, cache = 'no-store') {
  const body = await readFile(path);
  const etag = `"${createHash('sha256').update(body).digest('hex')}"`;
  res.writeHead(200, { ...headers(types[extname(path).toLowerCase()] || 'application/octet-stream', cache), ETag: etag, 'Content-Length': body.length });
  res.end(body);
}

async function readJson(name) {
  return JSON.parse(await readFile(join(dataRoot, name), 'utf8'));
}

function safeStaticPath(urlPath) {
  const raw = urlPath === '/' || urlPath === '/overview' ? '/index.html' : urlPath;
  const relative = normalize(raw).replace(/^([/\\])+/, '');
  if (!relative || relative.includes('..')) return null;
  return join(staticRoot, relative);
}

async function handleGet(req, res, url) {
  if (url.pathname === '/healthz') return json(res, 200, { ok: true, service: `tianshen-${kind}`, mode: 'public-read-only' });

  if (kind === 'workbench') {
    const snapshots = new Map([
      ['/api/v1/workbench', 'workbench.json'],
      ['/api/v1/workbench/workflows', 'workflows.json'],
      ['/api/v1/workbench/usage', 'usage.json'],
      ['/api/v1/status', 'status.json'],
      ['/api/v1/public/status', 'public-status.json'],
      ['/api/v1/schema', 'workbench-schema.json'],
      ['/api/v1/local-data', 'local-data.json'],
      ['/api/v1/decisions', 'decisions.json']
    ]);
    if (snapshots.has(url.pathname)) return fileResponse(res, join(dataRoot, snapshots.get(url.pathname)));
    if (url.pathname === '/api/v1/session') return json(res, 403, { error: '公网版本仅供查看；操作请在本机工作台完成。' });
    if (url.pathname === '/api/v1/workbench/chat') return json(res, 403, { error: '为保护聊天内容，公网版本不提供角色单聊。' });
    const media = url.pathname.match(/^\/api\/v1\/workbench\/media\/([a-f0-9]{64})$/);
    if (media) {
      const manifest = await readJson('media-manifest.json');
      const entry = manifest[media[1]];
      if (!entry) return json(res, 404, { error: '素材尚未同步。' });
      const path = join(mediaRoot, media[1]);
      const body = await readFile(path);
      res.writeHead(200, { ...headers(entry.content_type || 'application/octet-stream', 'public, max-age=31536000, immutable'), 'Content-Length': body.length });
      return res.end(body);
    }
  } else {
    if (url.pathname === '/api/v1/analytics') return fileResponse(res, join(dataRoot, 'analytics.json'));
    if (url.pathname === '/api/v1/schema') return fileResponse(res, join(dataRoot, 'analytics-schema.json'));
    const match = url.pathname.match(/^\/api\/v1\/contents\/(XHS-\d{3})$/);
    if (match) {
      const all = await readJson('analytics.json');
      const item = all.contents?.find((value) => value.id === match[1] || value.content_id === match[1]);
      return item ? json(res, 200, item) : json(res, 404, { error: '未找到该作品。' });
    }
  }

  const path = safeStaticPath(url.pathname);
  if (!path) return json(res, 404, { error: '页面不存在。' });
  try {
    const info = await stat(path);
    if (!info.isFile()) throw new Error('not-file');
    return fileResponse(res, path, extname(path) === '.html' ? 'no-store' : 'public, max-age=300');
  } catch {
    return json(res, 404, { error: '页面不存在。' });
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', 'http://localhost');
    if (!['GET', 'HEAD'].includes(req.method || 'GET')) {
      return json(res, 403, { error: '公网版本是只读镜像，不能执行采集、派单、审批或发布操作。' });
    }
    if (req.method === 'HEAD') {
      res.writeHead(200, headers('text/plain; charset=utf-8'));
      return res.end();
    }
    return await handleGet(req, res, url);
  } catch (error) {
    return json(res, 503, { error: '当前镜像暂不可读，服务器会保留上一次成功版本。', detail: error?.code || 'READ_FAILED' });
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`tianshen-${kind} listening on 127.0.0.1:${port}`);
});
