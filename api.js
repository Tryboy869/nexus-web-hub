// api.js - API Gateway EMERGENCY MODE - Sécurité désactivée pour présentation
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { BackendService } from './server.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware basique
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(__dirname));

// Simple logging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Backend Service
let backend;

async function initBackend() {
  console.log('Initializing backend...');
  backend = new BackendService();
  await backend.init();
  console.log('Backend ready');
}

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

// i18n
app.get('/i18n/:lang.json', (req, res) => {
  const lang = req.params.lang;
  const validLangs = ['fr', 'en', 'es', 'de', 'pt', 'ar'];
  if (!validLangs.includes(lang)) {
    return res.status(404).json({ error: 'Language not found' });
  }
  res.sendFile(path.join(__dirname, 'i18n', `${lang}.json`));
});

// API Endpoints
app.get('/api/health', async (req, res) => {
  try {
    const result = await backend.healthCheck();
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/stats', async (req, res) => {
  try {
    const result = await backend.getStats();
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Auth
app.post('/api/auth/signup', async (req, res) => {
  try {
    console.log('Signup attempt:', req.body.email);
    const result = await backend.signup(req.body);
    console.log('Signup success');
    res.json(result);
  } catch (error) {
    console.error('Signup error:', error.message);
    res.status(400).json({ success: false, message: error.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    console.log('Login attempt:', req.body.email);
    const result = await backend.login(req.body);
    console.log('Login success');
    res.json(result);
  } catch (error) {
    console.error('Login error:', error.message);
    res.status(400).json({ success: false, message: error.message });
  }
});

app.get('/api/auth/me', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    const result = await backend.getUser(userId);
    res.json(result);
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// Webapps
app.get('/api/webapps', async (req, res) => {
  try {
    const result = await backend.getWebapps(req.query);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/webapps/:id', async (req, res) => {
  try {
    const userId = getUserId(req);
    const result = await backend.getWebapp(req.params.id, userId);
    res.json(result);
  } catch (error) {
    res.status(404).json({ success: false, message: error.message });
  }
});

// POST WEBAPP - VERSION SIMPLE SANS VALIDATION
app.post('/api/webapps', async (req, res) => {
  try {
    console.log('='.repeat(80));
    console.log('WEBAPP SUBMISSION RECEIVED');
    console.log('Headers:', req.headers);
    console.log('Body:', JSON.stringify(req.body, null, 2));
    console.log('='.repeat(80));
    
    const userId = getUserId(req);
    console.log('User ID:', userId);
    
    if (!userId) {
      console.log('ERROR: No user ID');
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    
    console.log('Calling backend.createWebapp...');
    const result = await backend.createWebapp(req.body, userId);
    console.log('Backend response:', result);
    
    res.json(result);
  } catch (error) {
    console.error('ERROR in POST /api/webapps:', error.message);
    console.error('Stack:', error.stack);
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
    res.status(400).json({ success: false, message: error.message });
  }
});

// Admin
app.post('/api/admin/login', async (req, res) => {
  try {
    const result = await backend.adminLogin(req.body.email, req.body.password);
    res.json(result);
  } catch (error) {
    res.status(401).json({ success: false, message: error.message });
  }
});

app.get('/api/admin/reports', async (req, res) => {
  try {
    const adminKey = req.headers['x-admin-key'];
    if (adminKey !== process.env.ADMIN_KEY) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }
    const result = await backend.getReports();
    res.json(result);
  } catch (error) {
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
    res.status(500).json({ success: false, message: error.message });
  }
});

// Sitemap
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
    res.status(500).send('Error generating sitemap');
  }
});

// Error Handlers
app.use((err, req, res, next) => {
  console.error('UNHANDLED ERROR:', err.message);
  console.error('Stack:', err.stack);
  res.status(500).json({ success: false, message: 'Internal server error' });
});

app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, '404.html'));
});

// Start
async function startServer() {
  await initBackend();
  
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`
===============================================================
   NEXUS WEB HUB - EMERGENCY MODE
   Server:     http://0.0.0.0:${PORT}
   Security:   DISABLED (for presentation only)
   Logging:    Basic console logs
===============================================================
    `);
  });
}

process.on('SIGTERM', () => process.exit(0));
process.on('SIGINT', () => process.exit(0));

startServer();