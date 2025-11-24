// api.js - API GATEWAY SÉCURISÉ + ADMIN
// NEXUS WEB HUB - Nexus Studio

import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';
import jwt from 'jsonwebtoken';
import { BackendService } from './server.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// ========== SECURITY CONFIGURATION ==========
const SECURITY_CONFIG = {
  // Rate limits
  GLOBAL_RATE_LIMIT: 100,           // 100 requêtes par IP toutes les 15 min
  GLOBAL_WINDOW_MS: 15 * 60 * 1000, // 15 minutes
  
  // SQL Injection patterns
  SQL_PATTERNS: [
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION)\b)/i,
    /(--|#|\/\*|\*\/|;)/,
    /(\bOR\b.*=.*\bOR\b)/i,
    /('|"|\)|\()/
  ],
  
  // XSS patterns
  XSS_PATTERNS: [
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    /javascript:/gi,
    /on\w+\s*=\s*["'][^"']*["']/gi,
    /<iframe/gi,
    /<embed/gi,
    /<object/gi
  ],
  
  // Max payload size
  MAX_BODY_SIZE: 10 * 1024 * 1024, // 10MB
  
  // Blocked IPs storage
  BLOCKED_IPS: new Set(),
  
  // Failed login attempts
  LOGIN_ATTEMPTS: new Map()
};

// ========== MIDDLEWARE ==========
app.use(express.json({ limit: '10mb' }));
app.use(cors());
app.set('trust proxy', 1);

// Serve static files
app.use(express.static(__dirname));

// ========== SECURITY FUNCTIONS ==========

function detectSQLInjection(input) {
  if (typeof input !== 'string') return false;
  
  for (const pattern of SECURITY_CONFIG.SQL_PATTERNS) {
    if (pattern.test(input)) {
      return true;
    }
  }
  return false;
}

function detectXSS(input) {
  if (typeof input !== 'string') return false;
  
  for (const pattern of SECURITY_CONFIG.XSS_PATTERNS) {
    if (pattern.test(input)) {
      return true;
    }
  }
  return false;
}

function validateRequestSecurity(req) {
  const ip = req.ip || req.connection.remoteAddress;
  
  // Check blocked IP
  if (SECURITY_CONFIG.BLOCKED_IPS.has(ip)) {
    console.log(`🚨 [SECURITY] Blocked IP attempt: ${ip}`);
    return { valid: false, reason: 'IP blocked' };
  }
  
  // Check body size
  if (req.body && JSON.stringify(req.body).length > SECURITY_CONFIG.MAX_BODY_SIZE) {
    console.log(`⚠️ [SECURITY] Large payload from ${ip}`);
    return { valid: false, reason: 'Payload too large' };
  }
  
  // Check for SQL injection and XSS in all body fields
  const checkObject = (obj) => {
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        if (detectSQLInjection(value)) {
          console.log(`🚨 [SECURITY] SQL injection attempt from ${ip} in field ${key}`);
          return false;
        }
        if (detectXSS(value)) {
          console.log(`🚨 [SECURITY] XSS attempt from ${ip} in field ${key}`);
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

// ========== RATE LIMITING ==========
const globalLimiter = rateLimit({
  windowMs: SECURITY_CONFIG.GLOBAL_WINDOW_MS,
  max: SECURITY_CONFIG.GLOBAL_RATE_LIMIT,
  message: { success: false, message: 'Trop de requêtes. Réessayez dans 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', globalLimiter);

// ========== SECURITY MIDDLEWARE ==========
app.use((req, res, next) => {
  const validation = validateRequestSecurity(req);
  
  if (!validation.valid) {
    return res.status(403).json({
      success: false,
      message: 'Requête bloquée pour des raisons de sécurité'
    });
  }
  
  next();
});

// ========== AUTH MIDDLEWARE ==========
function extractUserId(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'nexus-web-hub-secret-change-in-production');
      req.headers['x-user-id'] = decoded.userId;
      req.headers['x-user-email'] = decoded.email;
    } catch (error) {
      console.warn('⚠️ [AUTH] Invalid token');
    }
  }
  
  next();
}

app.use(extractUserId);

// ========== ADMIN AUTH MIDDLEWARE ==========
function requireAdmin(req, res, next) {
  const { email, password } = req.body;
  
  const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
  
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    console.error('❌ [ADMIN] ADMIN_EMAIL or ADMIN_PASSWORD not configured');
    return res.status(500).json({ success: false, message: 'Admin credentials not configured' });
  }
  
  if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
    return next();
  }
  
  // Track failed attempts
  const ip = req.ip;
  const attempts = SECURITY_CONFIG.LOGIN_ATTEMPTS.get(ip) || 0;
  SECURITY_CONFIG.LOGIN_ATTEMPTS.set(ip, attempts + 1);
  
  if (attempts >= 5) {
    SECURITY_CONFIG.BLOCKED_IPS.add(ip);
    console.log(`🚨 [SECURITY] IP ${ip} blocked after 5 failed admin login attempts`);
  }
  
  return res.status(401).json({ success: false, message: 'Invalid credentials' });
}

// ========== BACKEND INITIALIZATION ==========
let backend;

async function initBackend() {
  console.log('🔧 [API GATEWAY] Initializing backend...');
  backend = new BackendService();
  await backend.init();
  console.log('✅ [API GATEWAY] Backend ready');
}

// ========== ROUTE MAP ==========
const routeMap = {
  // Auth
  'POST:/api/auth/signup': (req) => backend.signup(req.body),
  'POST:/api/auth/login': (req) => backend.login(req.body),
  'GET:/api/auth/me': (req) => backend.getMe(req.headers),
  
  // Webapps
  'GET:/api/webapps': (req) => backend.getWebapps(req.query),
  'GET:/api/webapps/:id': (req) => backend.getWebapp(req.params.id, req.headers),
  'POST:/api/webapps': (req) => backend.createWebapp(req.body, req.headers),
  'PUT:/api/webapps/:id': (req) => backend.updateWebapp(req.params.id, req.body, req.headers),
  'DELETE:/api/webapps/:id': (req) => backend.deleteWebapp(req.params.id, req.headers),
  'POST:/api/webapps/:id/click': (req) => backend.trackWebappClick(req.params.id, req.headers),
  
  // Reviews
  'POST:/api/webapps/:id/reviews': (req) => backend.createReview(req.params.id, req.body, req.headers),
  
  // Reports
  'POST:/api/reports': (req) => backend.createReport(req.body, req.headers),
  
  // Admin
  'GET:/api/admin/reports': (req) => backend.getReports(),
  'GET:/api/admin/webapps': (req) => backend.getAllWebapps(),
  'DELETE:/api/admin/webapps/:id': (req) => backend.adminDeleteWebapp(req.params.id),
  'PUT:/api/admin/reports/:id': (req) => backend.updateReportStatus(req.params.id, req.body),
  
  // Stats
  'GET:/api/stats': () => backend.getStats(),
  
  // Health
  'GET:/api/health': () => backend.healthCheck()
};

// ========== ROUTER CENTRAL ==========
async function routeRequest(method, path, req) {
  const routeKey = `${method}:${path}`;
  const handler = routeMap[routeKey];
  
  if (!handler) {
    throw new Error(`Route not mapped: ${routeKey}`);
  }
  
  return await handler(req);
}

// ========== FRONTEND PAGES ==========
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/admin.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

// ========== AUTH ENDPOINTS ==========
app.post('/api/auth/signup', async (req, res) => {
  try {
    const result = await routeRequest('POST', '/api/auth/signup', req);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const result = await routeRequest('POST', '/api/auth/login', req);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/auth/me', async (req, res) => {
  try {
    const result = await routeRequest('GET', '/api/auth/me', req);
    res.json(result);
  } catch (error) {
    res.status(401).json({ success: false, message: 'Unauthorized' });
  }
});

// ========== WEBAPP ENDPOINTS ==========
app.get('/api/webapps', async (req, res) => {
  try {
    const result = await routeRequest('GET', '/api/webapps', req);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/webapps/:id', async (req, res) => {
  try {
    const result = await routeRequest('GET', '/api/webapps/:id', req);
    res.json(result);
  } catch (error) {
    res.status(404).json({ success: false, message: 'Webapp not found' });
  }
});

app.post('/api/webapps', async (req, res) => {
  try {
    const result = await routeRequest('POST', '/api/webapps', req);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.put('/api/webapps/:id', async (req, res) => {
  try {
    const result = await routeRequest('PUT', '/api/webapps/:id', req);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.delete('/api/webapps/:id', async (req, res) => {
  try {
    const result = await routeRequest('DELETE', '/api/webapps/:id', req);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Track webapp click
app.post('/api/webapps/:id/click', async (req, res) => {
  try {
    const result = await routeRequest('POST', '/api/webapps/:id/click', req);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ========== REVIEW ENDPOINTS ==========
app.post('/api/webapps/:id/reviews', async (req, res) => {
  try {
    const result = await routeRequest('POST', '/api/webapps/:id/reviews', req);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ========== REPORT ENDPOINTS ==========
app.post('/api/reports', async (req, res) => {
  try {
    const result = await routeRequest('POST', '/api/reports', req);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ========== ADMIN ENDPOINTS ==========

// Admin Login
app.post('/api/admin/login', requireAdmin, (req, res) => {
  // Clear failed attempts on successful login
  const ip = req.ip;
  SECURITY_CONFIG.LOGIN_ATTEMPTS.delete(ip);
  
  res.json({ 
    success: true, 
    message: 'Admin logged in',
    admin: true 
  });
});

// Get All Reports
app.get('/api/admin/reports', async (req, res) => {
  try {
    const result = await routeRequest('GET', '/api/admin/reports', req);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get All Webapps (Admin view)
app.get('/api/admin/webapps', async (req, res) => {
  try {
    const result = await routeRequest('GET', '/api/admin/webapps', req);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Admin Delete Webapp
app.delete('/api/admin/webapps/:id', async (req, res) => {
  try {
    const result = await routeRequest('DELETE', '/api/admin/webapps/:id', req);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Update Report Status
app.put('/api/admin/reports/:id', async (req, res) => {
  try {
    const result = await routeRequest('PUT', '/api/admin/reports/:id', req);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ========== STATS ENDPOINTS ==========
app.get('/api/stats', async (req, res) => {
  try {
    const result = await routeRequest('GET', '/api/stats', req);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ========== HEALTH CHECK ==========
app.get('/api/health', async (req, res) => {
  try {
    const health = await routeRequest('GET', '/api/health', req);
    const statusCode = health.status === 'ok' ? 200 : 503;
    res.status(statusCode).json(health);
  } catch (error) {
    res.status(503).json({ status: 'error', message: error.message });
  }
});

// ========== ERROR HANDLERS ==========
app.use((err, req, res, next) => {
  console.error('💥 [API GATEWAY] Unhandled error:', err);
  res.status(500).json({ success: false, message: 'Internal server error' });
});

app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

// ========== START SERVER ==========
async function startServer() {
  await initBackend();
  
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`
╔═══════════════════════════════════════════════════════╗
║   🌌 NEXUS WEB HUB - API GATEWAY SÉCURISÉ             ║
║   🌐 Server:     http://0.0.0.0:${PORT.toString().padEnd(28)}║
║   🛡️  Security:   SQL Injection + XSS Protection      ║
║   🚨 Rate Limit: ${SECURITY_CONFIG.GLOBAL_RATE_LIMIT} req/15min                      ║
║   🔐 Admin:      /admin.html                          ║
║   ✅ Routes:     ${Object.keys(routeMap).length} endpoints                        ║
║                                                       ║
║   👤 Created by: Daouda Abdoul Anzize                 ║
║   🏢 Nexus Studio - NEXUS AXION 4.1                   ║
╚═══════════════════════════════════════════════════════╝
    `);
  });
}

startServer();