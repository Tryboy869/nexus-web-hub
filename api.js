// api.js - API Gateway for Nexus Web Hub
// Routes complètes: Notifications, Collections, Versions

import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { BackendService } from './server.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '10mb' }));
app.use(cors());
app.use(express.static(__dirname));

// Backend Service
let backend;

async function initBackend() {
  console.log('[API] Initializing backend service...');
  try {
    backend = new BackendService();
    await backend.init();
    console.log('[API] Backend service ready');
  } catch (error) {
    console.error('[API] Backend init failed:', error.message);
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
    console.error('[API] Error:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Stats
app.get('/api/stats', async (req, res) => {
  try {
    const result = await backend.getStats();
    res.json(result);
  } catch (error) {
    console.error('[API] Error:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Auth
app.post('/api/auth/signup', async (req, res) => {
  try {
    const result = await backend.signup(req.body);
    res.json(result);
  } catch (error) {
    console.error('[API] Error:', error.message);
    res.status(400).json({ success: false, message: error.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const result = await backend.login(req.body);
    res.json(result);
  } catch (error) {
    console.error('[API] Error:', error.message);
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
    console.error('[API] Error:', error.message);
    res.status(400).json({ success: false, message: error.message });
  }
});

// Webapps
app.get('/api/webapps', async (req, res) => {
  try {
    const result = await backend.getWebapps(req.query);
    res.json(result);
  } catch (error) {
    console.error('[API] Error:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/webapps/:id', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'] || null;
    const result = await backend.getWebappById(req.params.id, userId);
    res.json(result);
  } catch (error) {
    console.error('[API] Error:', error.message);
    res.status(404).json({ success: false, message: error.message });
  }
});

app.post('/api/webapps', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'];
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const result = await backend.createWebapp(req.body, userId);
    res.json(result);
  } catch (error) {
    console.error('[API] Error:', error.message);
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
    console.error('[API] Error:', error.message);
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
    console.error('[API] Error:', error.message);
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
    console.error('[API] Error:', error.message);
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
    console.error('[API] Error:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/webapps/user/:userId', async (req, res) => {
  try {
    const result = await backend.getUserWebapps(req.params.userId);
    res.json(result);
  } catch (error) {
    console.error('[API] Error:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Webapp Versions (Changelogs)
app.get('/api/webapps/:id/versions', async (req, res) => {
  try {
    const result = await backend.getWebappVersions(req.params.id);
    res.json(result);
  } catch (error) {
    console.error('[API] Error:', error.message);
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
    console.error('[API] Error:', error.message);
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
    console.error('[API] Error:', error.message);
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
    console.error('[API] Error:', error.message);
    res.status(400).json({ success: false, message: error.message });
  }
});

// ========================================
// NOTIFICATIONS ROUTES
// ========================================

app.get('/api/notifications', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'];
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    const limit = parseInt(req.query.limit) || 50;
    const result = await backend.getNotifications(userId, limit);
    res.json(result);
  } catch (error) {
    console.error('[API] Error:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/notifications/:id/read', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'];
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    const result = await backend.markNotificationAsRead(req.params.id, userId);
    res.json(result);
  } catch (error) {
    console.error('[API] Error:', error.message);
    res.status(400).json({ success: false, message: error.message });
  }
});

app.post('/api/notifications/read-all', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'];
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    const result = await backend.markAllNotificationsAsRead(userId);
    res.json(result);
  } catch (error) {
    console.error('[API] Error:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

app.delete('/api/notifications/:id', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'];
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    const result = await backend.deleteNotification(req.params.id, userId);
    res.json(result);
  } catch (error) {
    console.error('[API] Error:', error.message);
    res.status(400).json({ success: false, message: error.message });
  }
});

// ========================================
// COLLECTIONS ROUTES
// ========================================

app.get('/api/collections', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'];
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    const result = await backend.getUserCollections(userId);
    res.json(result);
  } catch (error) {
    console.error('[API] Error:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/collections/:id', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'] || null;
    const result = await backend.getCollection(req.params.id, userId);
    res.json(result);
  } catch (error) {
    console.error('[API] Error:', error.message);
    res.status(404).json({ success: false, message: error.message });
  }
});

app.post('/api/collections', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'];
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    const { name, description, is_public } = req.body;
    const result = await backend.createCollection(userId, name, description, is_public);
    res.json(result);
  } catch (error) {
    console.error('[API] Error:', error.message);
    res.status(400).json({ success: false, message: error.message });
  }
});

app.post('/api/collections/:id/add', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'];
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    const { webapp_id } = req.body;
    const result = await backend.addToCollection(req.params.id, webapp_id, userId);
    res.json(result);
  } catch (error) {
    console.error('[API] Error:', error.message);
    res.status(400).json({ success: false, message: error.message });
  }
});

app.delete('/api/collections/:id/remove/:webappId', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'];
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    const result = await backend.removeFromCollection(req.params.id, req.params.webappId, userId);
    res.json(result);
  } catch (error) {
    console.error('[API] Error:', error.message);
    res.status(400).json({ success: false, message: error.message });
  }
});

app.get('/api/collections/:id/webapps', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'] || null;
    const result = await backend.getCollectionWebapps(req.params.id, userId);
    res.json(result);
  } catch (error) {
    console.error('[API] Error:', error.message);
    res.status(404).json({ success: false, message: error.message });
  }
});

app.delete('/api/collections/:id', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'];
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    const result = await backend.deleteCollection(req.params.id, userId);
    res.json(result);
  } catch (error) {
    console.error('[API] Error:', error.message);
    res.status(400).json({ success: false, message: error.message });
  }
});

app.put('/api/collections/:id', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'];
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    const result = await backend.updateCollection(req.params.id, req.body, userId);
    res.json(result);
  } catch (error) {
    console.error('[API] Error:', error.message);
    res.status(400).json({ success: false, message: error.message });
  }
});

// Get public collections
app.get('/api/collections/public/list', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const result = await backend.getPublicCollections(limit);
    res.json(result);
  } catch (error) {
    console.error('[API] Error:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Admin
app.post('/api/admin/login', async (req, res) => {
  try {
    const result = await backend.adminLogin(req.body.email, req.body.password);
    res.json(result);
  } catch (error) {
    console.error('[API] Error:', error.message);
    res.status(401).json({ success: false, message: error.message });
  }
});

app.get('/api/admin/reports', async (req, res) => {
  try {
    const adminKey = req.headers['x-admin-key'];
    if (adminKey !== process.env.ADMIN_KEY) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }
    const result = await backend.getReports(req.query.status);
    res.json(result);
  } catch (error) {
    console.error('[API] Error:', error.message);
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
    console.error('[API] Error:', error.message);
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
    console.error('[API] Error:', error.message);
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
    console.error('[API] Error:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Tags
app.get('/api/tags/popular', async (req, res) => {
  try {
    const result = await backend.getPopularTags(20);
    res.json(result);
  } catch (error) {
    console.error('[API] Error:', error.message);
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
    console.error('[API] Error:', error.message);
    res.status(500).send('Error generating sitemap');
  }
});

// Error handlers
app.use((err, req, res, next) => {
  console.error('[API] Unhandled error:', err.message);
  res.status(500).json({ success: false, message: 'Internal server error' });
});

app.use((req, res) => {
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
    console.log(`
===============================================================
   NEXUS WEB HUB - API Gateway
   Server:     http://0.0.0.0:${PORT}
   Pages:      *.html (multi-pages)
   Assets:     assets/*
   Backend:    server.js
   Gateway:    api.js (this file)
===============================================================
    `);
  });
}

// Graceful Shutdown
process.on('SIGTERM', () => {
  console.log('[API] SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('[API] SIGINT received, shutting down gracefully');
  process.exit(0);
});

startServer();