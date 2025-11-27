// api.js - API Gateway for Nexus Web Hub - DEBUG ULTRA MODE
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

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(__dirname));

// Security & Logging System - VERSION DEBUG ULTRA
class SecurityLogger {
  constructor() {
    this.logs = [];
    this.maxLogsInMemory = 1000;
    this.rateLimits = new Map();
    this.blockedIPs = new Set();
    this.debugMode = true; // MODE DEBUG ACTIVÉ
    
    if (!fs.existsSync('logs')) {
      fs.mkdirSync('logs');
    }
    
    this.info('SYSTEM', { message: 'Security Logger initialized in DEBUG MODE' });
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
    
    // Console avec TOUS les détails en mode debug
    if (this.debugMode) {
      console.log('\n' + '='.repeat(80));
      console.log(`[${level}] [${type}] @ ${entry.timestamp}`);
      console.log(JSON.stringify(data, null, 2));
      console.log('='.repeat(80) + '\n');
    } else {
      console.log(`[${level}] [${type}]`, JSON.stringify(data));
    }
    
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
    
    // Log spécial pour DEBUG
    if (this.debugMode) {
      fs.appendFileSync(`logs/debug-${date}.log`, logLine);
    }
  }
  
  info(type, data) { this.log('INFO', type, data); }
  warn(type, data) { this.log('WARN', type, data); }
  error(type, data) { this.log('ERROR', type, data); }
  security(type, data) { this.log('SECURITY', type, data); }
  debug(type, data) { this.log('DEBUG', type, data); }
  
  checkRateLimit(identifier, limit = 100, windowMs = 15 * 60 * 1000) {
    const now = Date.now();
    
    this.debug('RATE_LIMIT_CHECK_START', {
      identifier,
      limit,
      windowMs,
      currentTime: now
    });
    
    if (!this.rateLimits.has(identifier)) {
      this.rateLimits.set(identifier, []);
      this.debug('RATE_LIMIT_NEW_IDENTIFIER', { identifier });
    }
    
    const requests = this.rateLimits.get(identifier);
    const validRequests = requests.filter(time => now - time < windowMs);
    
    this.debug('RATE_LIMIT_VALIDATION', {
      identifier,
      totalRequests: requests.length,
      validRequests: validRequests.length,
      limit,
      willBlock: validRequests.length >= limit
    });
    
    if (validRequests.length >= limit) {
      this.security('RATE_LIMIT_EXCEEDED', {
        identifier,
        requests: validRequests.length,
        limit,
        windowMs,
        oldestRequest: new Date(Math.min(...validRequests)).toISOString(),
        newestRequest: new Date(Math.max(...validRequests)).toISOString()
      });
      return false;
    }
    
    validRequests.push(now);
    this.rateLimits.set(identifier, validRequests);
    
    if (validRequests.length >= limit * 0.8) {
      this.warn('RATE_LIMIT_WARNING', {
        identifier,
        requests: validRequests.length,
        limit,
        percentage: (validRequests.length / limit * 100).toFixed(1)
      });
    }
    
    this.debug('RATE_LIMIT_CHECK_PASSED', {
      identifier,
      currentRequests: validRequests.length,
      limit
    });
    
    return true;
  }
  
  detectSQLInjection(input) {
    this.debug('SQL_INJECTION_CHECK', {
      input: input.substring(0, 200),
      inputLength: input.length
    });
    
    const sqlPatterns = [
      { name: 'SQL_KEYWORDS', pattern: /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION)\b)/i },
      { name: 'SQL_COMMENTS', pattern: /(--|\#|\/\*|\*\/)/ },
      { name: 'SQL_OR_CONDITION', pattern: /(\bOR\b.*=.*\bOR\b)/i },
      { name: 'SQL_SPECIAL_CHARS', pattern: /('|"|;|\)|\()/ }
    ];
    
    for (const { name, pattern } of sqlPatterns) {
      if (pattern.test(input)) {
        this.debug('SQL_INJECTION_PATTERN_MATCHED', {
          patternName: name,
          input: input.substring(0, 200)
        });
        return true;
      }
    }
    
    this.debug('SQL_INJECTION_CHECK_PASSED', { input: input.substring(0, 100) });
    return false;
  }
  
  detectXSS(input) {
    this.debug('XSS_CHECK', {
      input: input.substring(0, 200),
      inputLength: input.length
    });
    
    const xssPatterns = [
      { name: 'SCRIPT_TAG', pattern: /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi },
      { name: 'JAVASCRIPT_PROTOCOL', pattern: /javascript:/gi },
      { name: 'EVENT_HANDLERS', pattern: /on\w+\s*=\s*["'][^"']*["']/gi },
      { name: 'IFRAME_TAG', pattern: /<iframe/gi }
    ];
    
    for (const { name, pattern } of xssPatterns) {
      if (pattern.test(input)) {
        this.debug('XSS_PATTERN_MATCHED', {
          patternName: name,
          input: input.substring(0, 200)
        });
        return true;
      }
    }
    
    this.debug('XSS_CHECK_PASSED', { input: input.substring(0, 100) });
    return false;
  }
  
  validateRequest(req) {
    const ip = req.ip || req.connection.remoteAddress;
    const userId = req.headers['x-user-id'] || 'anonymous';
    
    this.debug('REQUEST_VALIDATION_START', {
      ip,
      userId,
      method: req.method,
      path: req.path,
      headers: req.headers,
      bodySize: req.body ? JSON.stringify(req.body).length : 0
    });
    
    // Vérifier IP bloquée
    if (this.blockedIPs.has(ip)) {
      this.security('BLOCKED_IP_ATTEMPT', { ip, endpoint: req.path });
      return { valid: false, reason: 'IP blocked', step: 'IP_CHECK' };
    }
    this.debug('IP_CHECK_PASSED', { ip });
    
    // Rate limiting par IP
    if (!this.checkRateLimit(ip, 100, 15 * 60 * 1000)) {
      return { valid: false, reason: 'Rate limit exceeded', step: 'RATE_LIMIT_IP' };
    }
    this.debug('RATE_LIMIT_IP_PASSED', { ip });
    
    // Vérifier taille du body
    const bodySize = req.body ? JSON.stringify(req.body).length : 0;
    if (bodySize > 10 * 1024 * 1024) {
      this.warn('LARGE_PAYLOAD', { ip, size: bodySize });
      return { valid: false, reason: 'Payload too large', step: 'PAYLOAD_SIZE' };
    }
    this.debug('PAYLOAD_SIZE_CHECK_PASSED', { bodySize });
    
    // Détecter injections dans tous les champs
    const checkObject = (obj, path = '') => {
      this.debug('OBJECT_VALIDATION_START', {
        path,
        keysCount: Object.keys(obj).length
      });
      
      for (const [key, value] of Object.entries(obj)) {
        const fullPath = `${path}${key}`;
        
        this.debug('FIELD_VALIDATION', {
          field: fullPath,
          type: typeof value,
          valuePreview: typeof value === 'string' ? value.substring(0, 100) : value
        });
        
        if (typeof value === 'string') {
          if (this.detectSQLInjection(value)) {
            this.security('SQL_INJECTION_ATTEMPT', {
              ip,
              userId,
              field: fullPath,
              value: value.substring(0, 200),
              endpoint: req.path
            });
            return { valid: false, reason: 'SQL injection detected', field: fullPath, step: 'SQL_INJECTION' };
          }
          
          if (this.detectXSS(value)) {
            this.security('XSS_ATTEMPT', {
              ip,
              userId,
              field: fullPath,
              value: value.substring(0, 200),
              endpoint: req.path
            });
            return { valid: false, reason: 'XSS detected', field: fullPath, step: 'XSS_DETECTION' };
          }
          
          this.debug('FIELD_VALIDATION_PASSED', { field: fullPath });
        } else if (typeof value === 'object' && value !== null) {
          const nestedCheck = checkObject(value, `${fullPath}.`);
          if (!nestedCheck.valid) return nestedCheck;
        }
      }
      
      this.debug('OBJECT_VALIDATION_PASSED', { path });
      return { valid: true };
    };
    
    if (req.body) {
      const bodyValidation = checkObject(req.body);
      if (!bodyValidation.valid) {
        return bodyValidation;
      }
    }
    
    this.debug('REQUEST_VALIDATION_SUCCESS', {
      ip,
      userId,
      method: req.method,
      path: req.path
    });
    
    return { valid: true };
  }
  
  blockIP(ip, reason) {
    this.blockedIPs.add(ip);
    this.security('IP_BLOCKED', { ip, reason });
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
        SECURITY: recentLogs.filter(l => l.level === 'SECURITY').length,
        DEBUG: recentLogs.filter(l => l.level === 'DEBUG').length
      },
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

// Security Middleware - VERSION DEBUG
app.use((req, res, next) => {
  const startTime = Date.now();
  const ip = req.ip || req.connection.remoteAddress;
  const userId = req.headers['x-user-id'] || 'anonymous';
  
  securityLogger.debug('MIDDLEWARE_START', {
    ip,
    userId,
    method: req.method,
    path: req.path,
    query: req.query,
    headers: req.headers,
    body: req.body
  });
  
  const validation = securityLogger.validateRequest(req);
  
  if (!validation.valid) {
    securityLogger.security('REQUEST_BLOCKED', {
      ip,
      userId,
      method: req.method,
      endpoint: req.path,
      reason: validation.reason,
      step: validation.step,
      field: validation.field,
      body: req.body
    });
    
    return res.status(403).json({
      success: false,
      message: 'Request blocked for security reasons',
      debug: {
        reason: validation.reason,
        step: validation.step,
        field: validation.field
      }
    });
  }
  
  securityLogger.info('API_REQUEST', {
    ip,
    userId,
    method: req.method,
    endpoint: req.path
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

// Helper function to extract user ID from request
function getUserId(req) {
  return req.headers['x-user-id'] || null;
}

// Serve HTML pages
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/webapp.html', (req, res) => res.sendFile(path.join(__dirname, 'webapp.html')));
app.get('/redirect.html', (req, res) => res.sendFile(path.join(__dirname, 'redirect.html')));
app.get('/auth.html', (req, res) => res.sendFile(path.join(__dirname, 'auth.html')));
app.get('/profile.html', (req, res) => res.sendFile(path.join(__dirname, 'profile.html')));
app.get('/submit.html', (req, res) => res.sendFile(path.join(__dirname, 'submit.html')));
app.get('/admin.html', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));

// Serve i18n files
app.get('/i18n/:lang.json', (req, res) => {
  const lang = req.params.lang;
  const validLangs = ['fr', 'en', 'es', 'de', 'pt', 'ar'];
  
  if (!validLangs.includes(lang)) {
    return res.status(404).json({ error: 'Language not found' });
  }
  
  res.sendFile(path.join(__dirname, 'i18n', `${lang}.json`));
});

// API Endpoints

// Health
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
    securityLogger.debug('SIGNUP_ATTEMPT', { body: req.body });
    const result = await backend.signup(req.body);
    securityLogger.debug('SIGNUP_SUCCESS', { result });
    res.json(result);
  } catch (error) {
    securityLogger.error('API_ERROR', { endpoint: '/api/auth/signup', error: error.message, stack: error.stack });
    res.status(400).json({ success: false, message: error.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    securityLogger.debug('LOGIN_ATTEMPT', { email: req.body.email });
    const result = await backend.login(req.body);
    securityLogger.debug('LOGIN_SUCCESS', { userId: result.user?.id });
    res.json(result);
  } catch (error) {
    securityLogger.error('API_ERROR', { endpoint: '/api/auth/login', error: error.message });
    res.status(400).json({ success: false, message: error.message });
  }
});

app.get('/api/auth/me', async (req, res) => {
  try {
    const userId = getUserId(req);
    securityLogger.debug('GET_USER_INFO', { userId });
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
    securityLogger.debug('GET_WEBAPPS', { query: req.query });
    const result = await backend.getWebapps(req.query);
    securityLogger.debug('GET_WEBAPPS_SUCCESS', { count: result.webapps?.length });
    res.json(result);
  } catch (error) {
    securityLogger.error('API_ERROR', { endpoint: '/api/webapps', error: error.message });
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/webapps/:id', async (req, res) => {
  try {
    const userId = getUserId(req);
    securityLogger.debug('GET_WEBAPP', { id: req.params.id, userId });
    const result = await backend.getWebapp(req.params.id, userId);
    securityLogger.debug('GET_WEBAPP_SUCCESS', { webapp: result.webapp?.name });
    res.json(result);
  } catch (error) {
    securityLogger.error('API_ERROR', { endpoint: `/api/webapps/${req.params.id}`, error: error.message });
    res.status(404).json({ success: false, message: error.message });
  }
});

// POST WEBAPP - ENDPOINT CRITIQUE AVEC DEBUG MAXIMUM
app.post('/api/webapps', async (req, res) => {
  try {
    securityLogger.debug('WEBAPP_SUBMIT_START', {
      headers: req.headers,
      body: req.body,
      bodyKeys: Object.keys(req.body),
      timestamp: new Date().toISOString()
    });
    
    const userId = getUserId(req);
    securityLogger.debug('WEBAPP_SUBMIT_USER_CHECK', { userId });
    
    if (!userId) {
      securityLogger.warn('WEBAPP_SUBMIT_NO_USER', { headers: req.headers });
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    
    // Rate limit: 3 webapps per day
    const ip = req.ip || req.connection.remoteAddress;
    const rateLimitKey = `webapp_submit_${userId}`;
    
    securityLogger.debug('WEBAPP_SUBMIT_RATE_LIMIT_CHECK', {
      rateLimitKey,
      userId,
      ip
    });
    
    if (!securityLogger.checkRateLimit(rateLimitKey, 3, 24 * 60 * 60 * 1000)) {
      securityLogger.warn('WEBAPP_SUBMIT_RATE_LIMIT_EXCEEDED', {
        userId,
        ip,
        rateLimitKey
      });
      return res.status(429).json({
        success: false,
        message: 'You can only submit 3 webapps per day'
      });
    }
    
    securityLogger.debug('WEBAPP_SUBMIT_CALLING_BACKEND', {
      userId,
      webappData: req.body
    });
    
    const result = await backend.createWebapp(req.body, userId);
    
    securityLogger.debug('WEBAPP_SUBMIT_SUCCESS', {
      userId,
      webappId: result.webapp?.id,
      result
    });
    
    res.json(result);
  } catch (error) {
    securityLogger.error('WEBAPP_SUBMIT_ERROR', {
      endpoint: '/api/webapps',
      error: error.message,
      stack: error.stack,
      body: req.body,
      userId: getUserId(req)
    });
    res.status(400).json({ success: false, message: error.message });
  }
});

app.put('/api/webapps/:id', async (req, res) => {
  try {
    const userId = getUserId(req);
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
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    const result = await backend.deleteWebapp(req.params.id, userId, req.body.password);
    res.json(result);
  } catch (error) {
    securityLogger.error('API_ERROR', { endpoint: `/api/webapps/${req.params.id}`, error: error.message });
    res.status(400).json({ success: false, message: error.message });
  }
});

app.post('/api/webapps/:id/click', async (req, res) => {
  try {
    const userId = getUserId(req);
    const source = req.body.source || 'direct';
    const result = await backend.trackClick(req.params.id, userId, source);
    res.json(result);
  } catch (error) {
    securityLogger.error('API_ERROR', { endpoint: `/api/webapps/${req.params.id}/click`, error: error.message });
    res.status(400).json({ success: false, message: error.message });
  }
});

// Reviews
app.post('/api/webapps/:id/reviews', async (req, res) => {
  try {
    const userId = getUserId(req);
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

// Reports
app.post('/api/reports', async (req, res) => {
  try {
    const userId = getUserId(req);
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

// Admin Endpoints
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
    const result = await backend.getReports();
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
    res.status(400).json({ success: false, message: error.message });
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
    res.status(400).json({ success: false, message: error.message });
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

// Monitoring Endpoints
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

// SEO - Sitemap
app.get('/sitemap.xml', async (req, res) => {
  try {
    const result = await backend.getWebapps({});
    const webapps = result.webapps;
    
    const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${process.env.APP_URL || 'https://nexuswebhub.com'}/</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  ${webapps.map(webapp => `
  <url>
    <loc>${process.env.APP_URL || 'https://nexuswebhub.com'}/webapp.html?id=${webapp.id}</loc>
    <lastmod>${new Date(webapp.updated_at).toISOString()}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>
  `).join('')}
</urlset>`;
    
    res.header('Content-Type', 'application/xml');
    res.send(sitemap);
  } catch (error) {
    securityLogger.error('API_ERROR', { endpoint: '/sitemap.xml', error: error.message });
    res.status(500).send('Error generating sitemap');
  }
});

// Error Handlers
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
  res.status(404).sendFile(path.join(__dirname, '404.html'));
});

// Start Server
async function startServer() {
  await initBackend();
  
  app.listen(PORT, '0.0.0.0', () => {
    securityLogger.info('SYSTEM', {
      message: 'Server started in DEBUG MODE',
      port: PORT,
      environment: process.env.NODE_ENV || 'development',
      debugMode: true
    });
    
    console.log(`
===============================================================
   NEXUS WEB HUB - API Gateway - DEBUG ULTRA MODE
   Server:     http://0.0.0.0:${PORT}
   Security:   Active (Rate Limit, Validation)
   Logging:    ULTRA DETAILED - Every action logged
   Debug Logs: logs/debug-*.log
   Backend:    server.js
   Gateway:    api.js
   
   DEBUG MODE: All requests are logged with maximum detail
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