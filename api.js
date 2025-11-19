// api.js - API GATEWAY (Point d'entrée unique)
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

// ========== MIDDLEWARE ==========

app.use(express.json());
app.use(cors());

// Trust proxy (requis pour Render/Heroku/etc.)
app.set('trust proxy', 1);

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Max 100 requêtes par IP
  message: { success: false, message: 'Trop de requêtes, veuillez réessayer plus tard' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', limiter);

// Serve static files (frontend)
app.use(express.static(__dirname));

// ========== BACKEND INITIALIZATION ==========

let backend;

async function initBackend() {
  console.log('🔧 [API GATEWAY] Initializing backend...');
  backend = new BackendService();
  await backend.init();
  console.log('✅ [API GATEWAY] Backend ready');
}

// ========== MIDDLEWARE AUTH ==========

function extractUserId(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'nexus-web-hub-secret-change-in-production');
      req.headers['x-user-id'] = decoded.userId;
      console.log(`🔐 [API GATEWAY] Authenticated user: ${decoded.userId}`);
    } catch (error) {
      console.warn('⚠️ [API GATEWAY] Invalid token');
    }
  }
  
  next();
}

app.use(extractUserId);

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
  
  // Reviews
  'POST:/api/webapps/:id/reviews': (req) => backend.createReview(req.params.id, req.body, req.headers),
  
  // Reports
  'POST:/api/reports': (req) => backend.createReport(req.body, req.headers),
  
  // Stats
  'GET:/api/stats': () => backend.getStats(),
  
  // Health
  'GET:/api/health': () => backend.healthCheck()
};

// ========== ROUTER CENTRAL ==========

async function routeRequest(method, path, req) {
  const routeKey = `${method}:${path}`;
  
  console.log(`📡 [API GATEWAY] ${routeKey}`);
  console.log(`   └─ User: ${req.headers['x-user-id'] || 'anonymous'}`);
  
  const handler = routeMap[routeKey];
  
  if (!handler) {
    console.error(`❌ [API GATEWAY] Route not found: ${routeKey}`);
    throw new Error(`Route not mapped: ${routeKey}`);
  }
  
  return await handler(req);
}

// ========== FRONTEND ==========

app.get('/', (req, res) => {
  console.log('🌐 [API GATEWAY] Serving frontend');
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ========== AUTH ENDPOINTS ==========

app.post('/api/auth/signup', async (req, res) => {
  try {
    console.log('📝 [API GATEWAY] POST /api/auth/signup');
    const result = await routeRequest('POST', '/api/auth/signup', req);
    res.json(result);
  } catch (error) {
    console.error('❌ [API GATEWAY] Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    console.log('📝 [API GATEWAY] POST /api/auth/login');
    const result = await routeRequest('POST', '/api/auth/login', req);
    res.json(result);
  } catch (error) {
    console.error('❌ [API GATEWAY] Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/auth/me', async (req, res) => {
  try {
    const result = await routeRequest('GET', '/api/auth/me', req);
    res.json(result);
  } catch (error) {
    console.error('❌ [API GATEWAY] Error:', error);
    res.status(401).json({ success: false, message: 'Unauthorized' });
  }
});

// ========== WEBAPP ENDPOINTS ==========

app.get('/api/webapps', async (req, res) => {
  try {
    const result = await routeRequest('GET', '/api/webapps', req);
    console.log(`✅ [API GATEWAY] Returned ${result.data?.webapps?.length || 0} webapps`);
    res.json(result);
  } catch (error) {
    console.error('❌ [API GATEWAY] Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/webapps/:id', async (req, res) => {
  try {
    const result = await routeRequest('GET', '/api/webapps/:id', req);
    res.json(result);
  } catch (error) {
    console.error('❌ [API GATEWAY] Error:', error);
    res.status(404).json({ success: false, message: 'Webapp not found' });
  }
});

app.post('/api/webapps', async (req, res) => {
  try {
    console.log('📝 [API GATEWAY] Creating webapp:', req.body.name);
    const result = await routeRequest('POST', '/api/webapps', req);
    res.json(result);
  } catch (error) {
    console.error('❌ [API GATEWAY] Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

app.put('/api/webapps/:id', async (req, res) => {
  try {
    console.log('📝 [API GATEWAY] Updating webapp:', req.params.id);
    const result = await routeRequest('PUT', '/api/webapps/:id', req);
    res.json(result);
  } catch (error) {
    console.error('❌ [API GATEWAY] Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

app.delete('/api/webapps/:id', async (req, res) => {
  try {
    console.log('🗑️ [API GATEWAY] Deleting webapp:', req.params.id);
    const result = await routeRequest('DELETE', '/api/webapps/:id', req);
    res.json(result);
  } catch (error) {
    console.error('❌ [API GATEWAY] Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ========== REVIEW ENDPOINTS ==========

app.post('/api/webapps/:id/reviews', async (req, res) => {
  try {
    console.log('⭐ [API GATEWAY] Creating review for webapp:', req.params.id);
    const result = await routeRequest('POST', '/api/webapps/:id/reviews', req);
    res.json(result);
  } catch (error) {
    console.error('❌ [API GATEWAY] Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ========== REPORT ENDPOINTS ==========

app.post('/api/reports', async (req, res) => {
  try {
    console.log('🚩 [API GATEWAY] Creating report');
    const result = await routeRequest('POST', '/api/reports', req);
    res.json(result);
  } catch (error) {
    console.error('❌ [API GATEWAY] Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ========== STATS ENDPOINTS ==========

app.get('/api/stats', async (req, res) => {
  try {
    const result = await routeRequest('GET', '/api/stats', req);
    res.json(result);
  } catch (error) {
    console.error('❌ [API GATEWAY] Error:', error);
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
    console.error('❌ [API GATEWAY] Health check failed:', error);
    res.status(503).json({ status: 'error', message: error.message });
  }
});

// ========== ERROR HANDLERS ==========

app.use((err, req, res, next) => {
  console.error('💥 [API GATEWAY] Unhandled error:', err);
  res.status(500).json({ success: false, message: 'Internal server error' });
});

app.use((req, res) => {
  console.warn(`⚠️ [API GATEWAY] 404: ${req.method} ${req.path}`);
  res.status(404).json({ success: false, message: 'Route not found' });
});

// ========== START SERVER ==========

async function startServer() {
  await initBackend();
  
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`
╔═══════════════════════════════════════════════════════╗
║   🌌 NEXUS WEB HUB - API GATEWAY                      ║
║   🌐 Server:     http://0.0.0.0:${PORT.toString().padEnd(28)}║
║   📂 Frontend:   index.html                           ║
║   ⚙️  Backend:    server.js                            ║
║   🔀 Gateway:    api.js (this file)                   ║
║   ✅ Routing:    ${Object.keys(routeMap).length} endpoints mapped                   ║
║                                                       ║
║   👤 Created by: Daouda Abdoul Anzize                 ║
║   🏢 Nexus Studio                                     ║
╚═══════════════════════════════════════════════════════╝
    `);
  });
}

startServer();