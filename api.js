// api.js - API Gateway with Security & Logging for Nexus Web Hub

import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { BackendService } from './server.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '10mb' }));
app.use(cors());
app.use(express.static(__dirname));

// Security Logger
class SecurityLogger {
  constructor() {
    this.logs = [];
    this.maxLogsInMemory = 1000;
    this.rateLimits = new Map();
    this.blockedIPs = new Set();
    
    if (!fs.existsSync('logs')) {
      fs.mkdirSync('logs');
    }
  }
  
  log(level, type, data) {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      type,
      ...data
    };
    
    this.logs.push(entry);
    if (this.logs.length > this.maxLogsInMemory) {
      this.logs.shift();
    }
    
    const emoji = {
      INFO: '[INFO]',
      WARN: '[WARN]',
      ERROR: '[ERROR]',
      SECURITY: '[SECURITY]'
    }[level] || '[LOG]';
    
    console.log(`${emoji} [${type}]`, JSON.stringify(data));
    
    this.writeToFile(level, entry);
  }
  
  writeToFile(level, entry) {
    const date = new Date().toISOString().split('T')[0];
    const logLine = `[${entry.timestamp}] [${entry.level}] [${entry.type}] ${JSON.stringify(entry)}\n`;
    
    fs.appendFileSync(`logs/api-${date}.log`, logLine);
    
    if (level === 'SECURITY') {
      fs.appendFileSync(`logs/security-${date}.log`, logLine);
    }
    
    if (level === 'ERROR') {
      fs.appendFileSync(`logs/errors-${date}.log`, logLine);
    }
  }
  
  info(type, data) { this.log('INFO', type, data); }
  warn(type, data) { this.log('WARN', type, data); }
  error(type, data) { this.log('ERROR', type, data); }
  security(type, data) { this.log('SECURITY', type, data); }
  
  checkRateLimit(identifier, limit = 100, windowMs = 15 * 60 * 1000) {
    const now = Date.now();
    
    if (!this.rateLimits.has(identifier)) {
      this.rateLimits.set(identifier, []);
    }
    
    const requests = this.rateLimits.get(identifier);
    const validRequests = requests.filter(time => now - time < windowMs);
    
    if (validRequests.length >= limit) {
      this.security('RATE_LIMIT_EXCEEDED', {
        identifier,
        requests: validRequests.length,
        limit
      });
      return false;
    }
    
    validRequests.push(now);
    this.rateLimits.set(identifier, validRequests);
    
    if (validRequests.length >= limit * 0.8) {
      this.warn('RATE_LIMIT_WARNING', {
        identifier,
        requests: validRequests.length,
        limit
      });
    }
    
    return true;
  }
  
  detectSQLInjection(input) {
    const sqlPatterns = [
      /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION)\b)/i,
      /(--|\#|\/\*|\*\/)/,
      /(\bOR\b.*=.*\bOR\b)/i,
      /('|"|;|\)|\()/
    ];
    
    for (const pattern of sqlPatterns) {
      if (pattern.test(input)) {
        return true;
      }
    }
    
    return false;
  }
  
  detectXSS(input) {
    const xssPatterns = [
      /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
      /javascript:/gi,
      /on\w+\s*=\s*["'][^"']*["']/gi,
      /<iframe/gi
    ];
    
    for (const pattern of xssPatterns) {
      if (pattern.test(input)) {
        return true;
      }
    }
    
    return false;
  }
  
  validateRequest(req) {
    const ip = req.ip || req.connection.remoteAddress;
    
    if (this.blockedIPs.has(ip)) {
      this.security('BLOCKED_IP_ATTEMPT', { ip, endpoint: req.path });
      return { valid: false, reason: 'IP blocked' };
    }
    
    if (!this.checkRateLimit(ip, 100, 15 * 60 * 1000)) {
      return { valid: false, reason: 'Rate limit exceeded' };
    }
    
    if (req.body && JSON.stringify(req.body).length > 10 * 1024 * 1024) {
      this.warn('LARGE_PAYLOAD', { ip, size: JSON.stringify(req.body).length });
      return { valid: false, reason: 'Payload too large' };
    }
    
    const checkObject = (obj) => {
      for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'string') {
          if (this.detectSQLInjection(value)) {
            this.security('SQL_INJECTION_ATTEMPT', { ip, field: key, value: value.substring(0, 100) });
            return false;
          }
          if (this.detectXSS(value)) {
            this.security('XSS_ATTEMPT', { ip, field: key, value: value.substring(0, 100) });
            return false;
          }
        } else if (typeof value === 'object' && value !== null) {
          if (!checkObject(value)) return false;
        }
      }
      return true;
    };
    
    if (req.body && !checkObject(req.body)) {
      return { valid: false, reason: 'Malicious content detected' };
    }
    
    return { valid: true };
  }
  
  blockIP(ip, reason, durationMs = 24 * 60 * 60 * 1000) {
    this.blockedIPs.add(ip);
    this.security('IP_BLOCKED', { ip, reason, duration: durationMs });
    
    setTimeout(() => {
      this.blockedIPs.delete(ip);
      this.info('IP_UNBLOCKED', { ip });
    }, durationMs);
  }
  
  getStats() {
    const last24h = Date.now() - 24 * 60 * 60 * 1000;
    const recentLogs = this.logs.filter(l => new Date(l.timestamp) > last24h);
    
    return {
      total: recentLogs.length,
      byLevel: {
        INFO: recentLogs.filter(l => l.level === 'INFO').length,
        WARN: recentLogs.filter(l => l.level === 'WARN').length,
        ERROR: recentLogs.filter(l => l.level === 'ERROR').length,
        SECURITY: recentLogs.filter(l => l.level === 'SECURITY').length
      },
      byType: recentLogs.reduce((acc, log) => {
        acc[log.type] = (acc[log.type] || 0) + 1;
        return acc;
      }, {}),
      blockedIPs: Array.from(this.blockedIPs),
      topIPs: [...this.rateLimits.entries()]
        .map(([ip, requests]) => ({ ip, requests: requests.length }))
        .sort((a, b) => b.requests - a.requests)
        .slice(0, 10)
    };
  }
  
  getRecentLogs(limit = 100) {
    return this.logs.slice(-limit).reverse();
  }
}

const securityLogger = new SecurityLogger();

// Security Middleware
app.use((req, res, next) => {
  const startTime = Date.now();
  const ip = req.ip || req.connection.remoteAddress;
  const userId = req.headers['x-user-id'] || 'anonymous';
  
  const validation = securityLogger.validateRequest(req);
  
  if (!validation.valid) {
    securityLogger.security('REQUEST_BLOCKED', {
      ip,
      userId,
      method: req.method,
      endpoint: req.path,
      reason: validation.reason
    });
    
    return res.status(403).json({
      success: false,
      message: 'Request blocked for security reasons'
    });
  }
  
  securityLogger.info('API_REQUEST', {
    ip,
    userId,
    method: req.method,
    endpoint: req.path,
    userAgent: req.headers['user-agent']
  });
  
  const originalSend = res.send;
  res.send = function(data) {
    const duration = Date.now() - startTime;
    
    securityLogger.info('API_RESPONSE', {
      ip,
      userId,
      method: req.method,
      endpoint: req.path,
      statusCode: res.statusCode,
      duration
    });
    
    originalSend.call(this, data);
  };
  
  next();
});

// Backend Service
let backend;

async function initBackend() {
  securityLogger.info('SYSTEM', { message: 'Initializing backend service...' });
  try {
    backend = new BackendService();
    await backend.init();
    securityLogger.info('SYSTEM', { message: 'Backend service ready' });
  } catch (error) {
    securityLogger.error('SYSTEM', { message: 'Backend init failed', error: error.message });
    throw error;
  }
}

// Serve HTML pages
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/webapp.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'webapp.html'));
});

app.get('/redirect.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'redirect.html'));
});

app.get('/auth.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'auth.html'));
});

app.get('/profile.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'profile.html'));
});

app.get('/submit.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'submit.html'));
});

app.get('/admin.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

// API Endpoints

// Health Check
app.get('/api/health', async (req, res) => {
  try {
    const result = await backend.healthCheck();
    res.json(result);
  } catch (error) {
    securityLogger.error('API_ERROR', { endpoint: '/api/health', error: error.message });
    res.status(500).json({ success: false, message: error.message });
  }
});

// Stats
app.get('/api/stats', async (req, res) => {
  try {
    const result = await backend.getStats();
    res.json(result);
  } catch (error) {
    securityLogger.error('API_ERROR', { endpoint: '/api/stats', error: error.message });
    res.status(500).json({ success: false, message: error.message });
  }
});

// Auth
app.post('/api/auth/signup', async (req, res) => {
  try {
    const result = await backend.signup(req.body);
    res.json(result);
  } catch (error) {
    securityLogger.error('API_ERROR', { endpoint: '/api/auth/signup', error: error.message });
    res.status(400).json({ success: false, message: error.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const result = await backend.login(req.body);
    res.json(result);
  } catch (error) {
    securityLogger.error('API_ERROR', { endpoint: '/api/auth/login', error: error.message });
    res.status(400).json({ success: false, message: error.message });
  }
});

app.get('/api/auth/me', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'];
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    const result = await backend.getUser(userId);
    res.json(result);
  } catch (error) {
    securityLogger.error('API_ERROR', { endpoint: '/api/auth/me', error: error.message });
    res.status(400).json({ success: false, message: error.message });
  }
});

// Webapps
app.get('/api/webapps', async (req, res) => {
  try {
    const result = await backend.getWebapps(req.query);
    res.json(result);
  } catch (error) {
    securityLogger.error('API_ERROR', { endpoint: '/api/webapps', error: error.message });
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/webapps/:id', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'] || null;
    const result = await backend.getWebappById(req.params.id, userId);
    res.json(result);
  } catch (error) {
    securityLogger.error('API_ERROR', { endpoint: `/api/webapps/${req.params.id}`, error: error.message });
    res.status(404).json({ success: false, message: error.message });
  }
});

app.post('/api/webapps', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'];
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    
    // Rate limit: 3 webapps per day
    if (!securityLogger.checkRateLimit(`webapp_submit_${userId}`, 3, 24 * 60 * 60 * 1000)) {
      return res.status(429).json({
        success: false,
        message: 'Submission limit reached. Maximum 3 webapps per day.'
      });
    }
    
    const result = await backend.createWebapp(req.body, userId);
    res.json(result);
  } catch (error) {
    securityLogger.error('API_ERROR', { endpoint: '/api/webapps', error: error.message });
    res.status(400).json({ success: false, message: error.message });
  }
});

app.put('/api/webapps/:id', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'];
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    const result = await backend.updateWebapp(req.params.id, req.body, userId);
    res.json(result);
  } catch (error) {
    securityLogger.error('API_ERROR', { endpoint: `/api/webapps/${req.params.id}`, error: error.message });
    res.status(400).json({ success: false, message: error.message });
  }
});

app.delete('/api/webapps/:id', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'];
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    const { password } = req.body;
    const result = await backend.deleteWebapp(req.params.id, userId, password);
    res.json(result);
  } catch (error) {
    securityLogger.error('API_ERROR', { endpoint: `/api/webapps/${req.params.id}`, error: error.message });
    res.status(400).json({ success: false, message: error.message });
  }
});

app.post('/api/webapps/:id/click', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'] || null;
    const { source } = req.body;
    const result = await backend.trackClick(req.params.id, userId, source || 'direct');
    res.json(result);
  } catch (error) {
    securityLogger.error('API_ERROR', { endpoint: `/api/webapps/${req.params.id}/click`, error: error.message });
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/webapps/:id/share', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'] || null;
    const { method } = req.body;
    const result = await backend.trackShare(req.params.id, userId, method || 'copy_link');
    res.json(result);
  } catch (error) {
    securityLogger.error('API_ERROR', { endpoint: `/api/webapps/${req.params.id}/share`, error: error.message });
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/webapps/user/:userId', async (req, res) => {
  try {
    const result = await backend.getUserWebapps(req.params.userId);
    res.json(result);
  } catch (error) {
    securityLogger.error('API_ERROR', { endpoint: `/api/webapps/user/${req.params.userId}`, error: error.message });
    res.status(500).json({ success: false, message: error.message });
  }
});

// Reviews
app.post('/api/webapps/:id/reviews', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'];
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    const result = await backend.createReview(req.params.id, req.body, userId);
    res.json(result);
  } catch (error) {
    securityLogger.error('API_ERROR', { endpoint: `/api/webapps/${req.params.id}/reviews`, error: error.message });
    res.status(400).json({ success: false, message: error.message });
  }
});

app.post('/api/reviews/:id/vote', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'];
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    const { vote_type } = req.body;
    const result = await backend.voteReview(req.params.id, userId, vote_type);
    res.json(result);
  } catch (error) {
    securityLogger.error('API_ERROR', { endpoint: `/api/reviews/${req.params.id}/vote`, error: error.message });
    res.status(400).json({ success: false, message: error.message });
  }
});

// Reports
app.post('/api/reports', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'];
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    const result = await backend.createReport(req.body, userId);
    res.json(result);
  } catch (error) {
    securityLogger.error('API_ERROR', { endpoint: '/api/reports', error: error.message });
    res.status(400).json({ success: false, message: error.message });
  }
});

// Admin
app.post('/api/admin/login', async (req, res) => {
  try {
    const result = await backend.adminLogin(req.body.email, req.body.password);
    res.json(result);
  } catch (error) {
    securityLogger.error('API_ERROR', { endpoint: '/api/admin/login', error: error.message });
    res.status(401).json({ success: false, message: error.message });
  }
});

app.get('/api/admin/reports', async (req, res) => {
  try {
    const adminKey = req.headers['x-admin-key'];
    if (adminKey !== process.env.ADMIN_KEY) {
      securityLogger.security('UNAUTHORIZED_ADMIN_ACCESS', { ip: req.ip, endpoint: '/api/admin/reports' });
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }
    const result = await backend.getReports(req.query.status);
    res.json(result);
  } catch (error) {
    securityLogger.error('API_ERROR', { endpoint: '/api/admin/reports', error: error.message });
    res.status(500).json({ success: false, message: error.message });
  }
});

app.put('/api/admin/reports/:id', async (req, res) => {
  try {
    const adminKey = req.headers['x-admin-key'];
    if (adminKey !== process.env.ADMIN_KEY) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }
    const result = await backend.resolveReport(req.params.id, req.body.admin_notes);
    res.json(result);
  } catch (error) {
    securityLogger.error('API_ERROR', { endpoint: `/api/admin/reports/${req.params.id}`, error: error.message });
    res.status(500).json({ success: false, message: error.message });
  }
});

app.delete('/api/admin/webapps/:id', async (req, res) => {
  try {
    const adminKey = req.headers['x-admin-key'];
    if (adminKey !== process.env.ADMIN_KEY) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }
    const result = await backend.adminDeleteWebapp(req.params.id);
    res.json(result);
  } catch (error) {
    securityLogger.error('API_ERROR', { endpoint: `/api/admin/webapps/${req.params.id}`, error: error.message });
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/admin/webapps', async (req, res) => {
  try {
    const adminKey = req.headers['x-admin-key'];
    if (adminKey !== process.env.ADMIN_KEY) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }
    const result = await backend.getAllWebapps();
    res.json(result);
  } catch (error) {
    securityLogger.error('API_ERROR', { endpoint: '/api/admin/webapps', error: error.message });
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/admin/logs', (req, res) => {
  const adminKey = req.headers['x-admin-key'];
  if (adminKey !== process.env.ADMIN_KEY) {
    securityLogger.security('UNAUTHORIZED_ADMIN_ACCESS', { ip: req.ip, endpoint: '/api/admin/logs' });
    return res.status(403).json({ success: false, message: 'Unauthorized' });
  }
  const logs = securityLogger.getRecentLogs(500);
  res.json({ success: true, logs });
});

app.get('/api/admin/stats', (req, res) => {
  const adminKey = req.headers['x-admin-key'];
  if (adminKey !== process.env.ADMIN_KEY) {
    return res.status(403).json({ success: false, message: 'Unauthorized' });
  }
  const stats = securityLogger.getStats();
  res.json({ success: true, stats });
});

// Tags
app.get('/api/tags/popular', async (req, res) => {
  try {
    const result = await backend.getPopularTags(20);
    res.json(result);
  } catch (error) {
    securityLogger.error('API_ERROR', { endpoint: '/api/tags/popular', error: error.message });
    res.status(500).json({ success: false, message: error.message });
  }
});

// I18n
app.get('/i18n/:lang.json', (req, res) => {
  const lang = req.params.lang;
  const supportedLangs = ['fr', 'en', 'es'];
  
  if (!supportedLangs.includes(lang)) {
    return res.status(404).json({ success: false, message: 'Language not supported' });
  }
  
  res.sendFile(path.join(__dirname, 'i18n', `${lang}.json`));
});

// Sitemap
app.get('/sitemap.xml', async (req, res) => {
  try {
    const webapps = await backend.getWebapps({ limit: 1000 });
    
    const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://nexuswebhub.com/</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  ${webapps.webapps.map(webapp => `
  <url>
    <loc>https://nexuswebhub.com/webapp.html?id=${webapp.id}</loc>
    <lastmod>${new Date(webapp.updated_at).toISOString()}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>`).join('')}
</urlset>`;
    
    res.header('Content-Type', 'application/xml');
    res.send(sitemap);
  } catch (error) {
    securityLogger.error('API_ERROR', { endpoint: '/sitemap.xml', error: error.message });
    res.status(500).send('Error generating sitemap');
  }
});

// Error handlers
app.use((err, req, res, next) => {
  securityLogger.error('UNHANDLED_ERROR', {
    error: err.message,
    stack: err.stack,
    endpoint: req.path
  });
  res.status(500).json({ success: false, message: 'Internal server error' });
});

app.use((req, res) => {
  securityLogger.warn('404_NOT_FOUND', {
    method: req.method,
    path: req.path,
    ip: req.ip
  });
  
  if (req.path.startsWith('/api/')) {
    res.status(404).json({ success: false, message: 'Route not found' });
  } else {
    res.status(404).sendFile(path.join(__dirname, '404.html'));
  }
});

// Start Server
async function startServer() {
  await initBackend();
  
  app.listen(PORT, '0.0.0.0', () => {
    securityLogger.info('SYSTEM', {
      message: 'Server started',
      port: PORT,
      environment: process.env.NODE_ENV || 'development'
    });
    
    console.log(`
===============================================================
   NEXUS WEB HUB - Secure API Gateway
   Server:     http://0.0.0.0:${PORT}
   Pages:      *.html (multi-pages)
   Assets:     assets/*
   Security:   Active (Rate Limit, Validation)
   Logging:    logs/* (security, api, errors)
   Backend:    server.js
   Gateway:    api.js (this file)
===============================================================
    `);
  });
}

// Graceful Shutdown
process.on('SIGTERM', () => {
  securityLogger.info('SYSTEM', { message: 'SIGTERM received, shutting down gracefully' });
  process.exit(0);
});

process.on('SIGINT', () => {
  securityLogger.info('SYSTEM', { message: 'SIGINT received, shutting down gracefully' });
  process.exit(0);
});

startServer();