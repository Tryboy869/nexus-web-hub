// ==========================================
// NEXUS WEB HUB - VERSION CLEAN QUI MARCHE
// Node.js + Express + Turso + HTML pur
// ==========================================

import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { createClient } from '@libsql/client';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// ==========================================
// MIDDLEWARE
// ==========================================

app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: false // Désactiver pour permettre inline scripts
}));

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});
app.use('/api/', limiter);

// ==========================================
// TURSO DATABASE
// ==========================================

const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN
});

async function initDatabase() {
  console.log('🗄️  Initializing database...');
  
  try {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS webapps (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        developer TEXT NOT NULL,
        url TEXT NOT NULL UNIQUE,
        description_short TEXT NOT NULL,
        description_long TEXT,
        video_url TEXT,
        github_url TEXT,
        types TEXT NOT NULL,
        tags TEXT NOT NULL,
        status TEXT DEFAULT 'approved',
        views INTEGER DEFAULT 0,
        created_at INTEGER DEFAULT (unixepoch())
      )
    `);
    
    await db.execute(`
      CREATE TABLE IF NOT EXISTS ratings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        webapp_id TEXT NOT NULL,
        user_ip TEXT NOT NULL,
        rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
        created_at INTEGER DEFAULT (unixepoch()),
        UNIQUE(webapp_id, user_ip)
      )
    `);
    
    await db.execute(`
      CREATE TABLE IF NOT EXISTS reviews (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        webapp_id TEXT NOT NULL,
        user_name TEXT NOT NULL,
        comment TEXT NOT NULL,
        created_at INTEGER DEFAULT (unixepoch())
      )
    `);
    
    console.log('✅ Database initialized');
  } catch (error) {
    console.error('❌ Database error:', error);
  }
}

// ==========================================
// UTILITIES
// ==========================================

function generateId() {
  return `app-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0] || req.ip || 'unknown';
}

// ==========================================
// API ROUTES
// ==========================================

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

app.get('/api/webapps', async (req, res) => {
  try {
    const { search = '', sort = 'recent' } = req.query;
    
    let sql = 'SELECT * FROM webapps WHERE status = "approved"';
    const args = [];
    
    if (search) {
      sql += ' AND (name LIKE ? OR description_short LIKE ?)';
      args.push(`%${search}%`, `%${search}%`);
    }
    
    sql += sort === 'popular' ? ' ORDER BY views DESC' : ' ORDER BY created_at DESC';
    sql += ' LIMIT 50';
    
    const result = await db.execute({ sql, args });
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('API error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/webapps/submit', async (req, res) => {
  try {
    const { name, developer, url, description_short, description_long, video_url, github_url, types, tags } = req.body;
    
    if (!name || !developer || !url || !description_short || !types || !tags) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }
    
    if (!url.startsWith('https://')) {
      return res.status(400).json({ success: false, error: 'URL must be HTTPS' });
    }
    
    const id = generateId();
    
    await db.execute({
      sql: `INSERT INTO webapps (id, name, developer, url, description_short, description_long, video_url, github_url, types, tags, status) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved')`,
      args: [id, name, developer, url, description_short, description_long || null, video_url || null, github_url || null, JSON.stringify(types), JSON.stringify(tags)]
    });
    
    res.json({ success: true, message: 'WebApp submitted!', data: { id } });
  } catch (error) {
    console.error('Submit error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/stats', async (req, res) => {
  try {
    const apps = await db.execute('SELECT COUNT(*) as count FROM webapps WHERE status = "approved"');
    const ratings = await db.execute('SELECT COUNT(*) as count FROM ratings');
    const reviews = await db.execute('SELECT COUNT(*) as count FROM reviews');
    const views = await db.execute('SELECT SUM(views) as total FROM webapps');
    
    res.json({
      success: true,
      data: {
        total_apps: apps.rows[0].count,
        total_ratings: ratings.rows[0].count,
        total_reviews: reviews.rows[0].count,
        total_views: views.rows[0].total || 0
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// HTML PAGE
// ==========================================

app.get('/', async (req, res) => {
  const stats = await db.execute('SELECT COUNT(*) as count FROM webapps WHERE status = "approved"');
  const totalApps = stats.rows[0].count;
  
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Nexus Web Hub</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: system-ui, -apple-system, sans-serif; 
      background: linear-gradient(135deg, #0a0e27 0%, #1a1f3a 100%);
      color: #E0E6ED;
      min-height: 100vh;
    }
    .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
    header { 
      background: rgba(26, 31, 58, 0.95); 
      padding: 20px 0; 
      position: sticky; 
      top: 0; 
      z-index: 100;
      border-bottom: 1px solid rgba(0, 217, 255, 0.2);
    }
    header .container { 
      display: flex; 
      justify-content: space-between; 
      align-items: center; 
      flex-wrap: wrap;
      gap: 15px;
    }
    .logo { 
      font-size: 24px; 
      font-weight: bold; 
      background: linear-gradient(135deg, #4169E1, #8A2BE2);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    nav { display: flex; gap: 20px; flex-wrap: wrap; }
    nav button { 
      background: none; 
      border: none; 
      color: #E0E6ED; 
      cursor: pointer; 
      padding: 10px 15px;
      border-radius: 8px;
      font-size: 16px;
      transition: all 0.3s;
    }
    nav button:hover { background: rgba(0, 217, 255, 0.1); color: #00D9FF; }
    .btn { 
      padding: 12px 24px; 
      border: none; 
      border-radius: 8px; 
      font-weight: 600; 
      cursor: pointer;
      font-size: 16px;
      transition: all 0.3s;
    }
    .btn-primary { 
      background: linear-gradient(135deg, #4169E1, #8A2BE2); 
      color: white; 
    }
    .btn-primary:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(65, 105, 225, 0.4); }
    .hero { text-align: center; padding: 60px 20px; }
    .hero h1 { 
      font-size: clamp(32px, 5vw, 56px); 
      margin-bottom: 20px;
      background: linear-gradient(135deg, #4169E1, #8A2BE2);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .hero p { font-size: 18px; color: #9CA3AF; margin-bottom: 30px; }
    .hero-actions { display: flex; gap: 15px; justify-content: center; flex-wrap: wrap; }
    .stats { 
      display: grid; 
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); 
      gap: 20px; 
      margin: 40px 0;
    }
    .stat-card { 
      background: rgba(26, 31, 58, 0.8); 
      border: 1px solid rgba(0, 217, 255, 0.2);
      border-radius: 12px; 
      padding: 30px; 
      text-align: center;
    }
    .stat-number { 
      font-size: 48px; 
      font-weight: bold;
      background: linear-gradient(135deg, #4169E1, #8A2BE2);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .stat-label { color: #9CA3AF; margin-top: 10px; }
    .search { margin: 40px 0; }
    .search input { 
      width: 100%; 
      padding: 15px; 
      border: 2px solid rgba(0, 217, 255, 0.3);
      border-radius: 12px; 
      background: rgba(26, 31, 58, 0.8);
      color: #E0E6ED;
      font-size: 16px;
    }
    .search input:focus { 
      outline: none; 
      border-color: #00D9FF; 
      box-shadow: 0 0 20px rgba(0, 217, 255, 0.3);
    }
    .grid { 
      display: grid; 
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); 
      gap: 30px; 
      margin: 40px 0;
    }
    .card { 
      background: rgba(26, 31, 58, 0.8);
      border: 1px solid rgba(0, 217, 255, 0.2);
      border-radius: 16px; 
      overflow: hidden;
      transition: all 0.3s;
    }
    .card:hover { 
      transform: translateY(-8px); 
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
      border-color: #00D9FF;
    }
    .card-preview { 
      width: 100%; 
      height: 200px; 
      background: #0a0e27;
      position: relative;
      overflow: hidden;
    }
    .card-preview iframe { 
      width: 125%; 
      height: 125%; 
      border: none;
      pointer-events: none;
      transform: scale(0.8);
      transform-origin: top left;
    }
    .card-content { padding: 20px; }
    .card-title { font-size: 20px; font-weight: bold; margin-bottom: 10px; }
    .card-dev { font-size: 14px; color: #9CA3AF; margin-bottom: 10px; }
    .card-desc { 
      color: #9CA3AF; 
      font-size: 14px; 
      margin-bottom: 15px;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .card-actions { display: flex; gap: 10px; }
    .card-actions .btn { flex: 1; text-align: center; font-size: 14px; padding: 10px; }
    .modal { 
      display: none; 
      position: fixed; 
      top: 0; 
      left: 0; 
      width: 100%; 
      height: 100%;
      background: rgba(0, 0, 0, 0.9);
      z-index: 1000;
      overflow-y: auto;
    }
    .modal.active { display: flex; justify-content: center; align-items: start; padding: 50px 20px; }
    .modal-content { 
      background: #1a1f3a; 
      border: 2px solid rgba(0, 217, 255, 0.3);
      border-radius: 16px; 
      padding: 40px; 
      max-width: 600px; 
      width: 100%;
      position: relative;
    }
    .modal-close { 
      position: absolute; 
      top: 15px; 
      right: 15px;
      background: none;
      border: none;
      color: #ef4444;
      font-size: 32px;
      cursor: pointer;
      line-height: 1;
    }
    .form-group { margin-bottom: 20px; }
    .form-group label { display: block; margin-bottom: 8px; font-weight: 600; }
    .form-group input,
    .form-group textarea,
    .form-group select { 
      width: 100%; 
      padding: 12px; 
      border: 2px solid rgba(0, 217, 255, 0.3);
      border-radius: 8px;
      background: rgba(10, 14, 39, 0.5);
      color: #E0E6ED;
      font-size: 16px;
      font-family: inherit;
    }
    .form-group textarea { min-height: 100px; resize: vertical; }
    .form-group input:focus,
    .form-group textarea:focus,
    .form-group select:focus { 
      outline: none; 
      border-color: #00D9FF;
      box-shadow: 0 0 20px rgba(0, 217, 255, 0.3);
    }
    .checkboxes { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; }
    .checkbox-item { display: flex; align-items: center; gap: 8px; }
    .checkbox-item input { width: auto; }
    footer { 
      background: #1a1f3a; 
      border-top: 1px solid rgba(0, 217, 255, 0.2);
      padding: 40px 20px; 
      margin-top: 60px;
      text-align: center;
    }
    footer p { color: #9CA3AF; margin: 5px 0; }
    @media (max-width: 768px) {
      .grid { grid-template-columns: 1fr; }
      header .container { flex-direction: column; }
      nav { width: 100%; justify-content: center; }
    }
  </style>
</head>
<body>
  <header>
    <div class="container">
      <div class="logo">🌌 NEXUS WEB HUB</div>
      <nav>
        <button onclick="document.querySelector('.hero').scrollIntoView({behavior:'smooth'})">Home</button>
        <button onclick="document.querySelector('.search').scrollIntoView({behavior:'smooth'})">Explore</button>
        <button onclick="document.querySelector('.stats').scrollIntoView({behavior:'smooth'})">Stats</button>
        <button class="btn btn-primary" onclick="document.getElementById('submitModal').classList.add('active')">Submit WebApp</button>
      </nav>
    </div>
  </header>

  <div class="container">
    <section class="hero">
      <h1>🚀 Universal WebApps Catalog</h1>
      <p>Discover, explore and share the best open web applications</p>
      <div class="hero-actions">
        <button class="btn btn-primary" onclick="document.querySelector('.search').scrollIntoView({behavior:'smooth'})">Explore Catalog</button>
        <button class="btn btn-primary" onclick="surpriseMe()">🎲 Surprise Me</button>
      </div>
    </section>

    <section class="stats" id="stats">
      <div class="stat-card">
        <div class="stat-number" id="statApps">${totalApps}</div>
        <div class="stat-label">WebApps</div>
      </div>
      <div class="stat-card">
        <div class="stat-number" id="statRatings">0</div>
        <div class="stat-label">Ratings</div>
      </div>
      <div class="stat-card">
        <div class="stat-number" id="statReviews">0</div>
        <div class="stat-label">Reviews</div>
      </div>
      <div class="stat-card">
        <div class="stat-number" id="statViews">0</div>
        <div class="stat-label">Views</div>
      </div>
    </section>

    <section class="search">
      <input 
        type="text" 
        id="searchInput" 
        placeholder="🔍 Search WebApps..." 
        onkeypress="if(event.key==='Enter') loadApps()"
      >
    </section>

    <div class="grid" id="appsGrid"></div>
  </div>

  <div class="modal" id="submitModal" onclick="if(event.target===this) this.classList.remove('active')">
    <div class="modal-content">
      <button class="modal-close" onclick="document.getElementById('submitModal').classList.remove('active')">&times;</button>
      <h2 style="margin-bottom:20px">🚀 Submit Your WebApp</h2>
      
      <form id="submitForm" onsubmit="handleSubmit(event)">
        <div class="form-group">
          <label>WebApp Name *</label>
          <input type="text" name="name" required minlength="3" maxlength="100">
        </div>
        
        <div class="form-group">
          <label>Developer/Team *</label>
          <input type="text" name="developer" required minlength="2" maxlength="100">
        </div>
        
        <div class="form-group">
          <label>URL * (HTTPS)</label>
          <input type="url" name="url" required pattern="https://.*">
        </div>
        
        <div class="form-group">
          <label>Short Description * (20-300 chars)</label>
          <textarea name="description_short" required minlength="20" maxlength="300"></textarea>
        </div>
        
        <div class="form-group">
          <label>Long Description (optional, max 3000)</label>
          <textarea name="description_long" maxlength="3000"></textarea>
        </div>
        
        <div class="form-group">
          <label>Types * (select 1-3)</label>
          <div class="checkboxes">
            <div class="checkbox-item"><input type="checkbox" name="types" value="game"><label>🎮 Game</label></div>
            <div class="checkbox-item"><input type="checkbox" name="types" value="tool"><label>🛠️ Tool</label></div>
            <div class="checkbox-item"><input type="checkbox" name="types" value="api"><label>🔌 API</label></div>
            <div class="checkbox-item"><input type="checkbox" name="types" value="design"><label>🎨 Design</label></div>
            <div class="checkbox-item"><input type="checkbox" name="types" value="productivity"><label>📊 Productivity</label></div>
            <div class="checkbox-item"><input type="checkbox" name="types" value="education"><label>📚 Education</label></div>
          </div>
        </div>
        
        <div class="form-group">
          <label>Tags * (comma separated)</label>
          <input type="text" name="tags" required placeholder="web, tool, productivity">
        </div>
        
        <div class="form-group">
          <label>Video URL (optional)</label>
          <input type="url" name="video_url">
        </div>
        
        <div class="form-group">
          <label>GitHub URL (optional)</label>
          <input type="url" name="github_url">
        </div>
        
        <button type="submit" class="btn btn-primary" style="width:100%">🚀 Submit</button>
      </form>
      
      <div id="submitStatus" style="margin-top:20px;text-align:center"></div>
    </div>
  </div>

  <footer>
    <div class="container">
      <p><strong>🌌 Nexus Web Hub</strong> - Universal WebApps Catalog</p>
      <p>Built with ❤️ by <strong>DAOUDA Abdoul Anzize</strong> - CEO Nexus Studio</p>
      <p>📧 nexusstudio100@gmail.com</p>
    </div>
  </footer>

  <script>
    // Load apps
    async function loadApps() {
      const search = document.getElementById('searchInput').value;
      try {
        const res = await fetch('/api/webapps?search=' + encodeURIComponent(search));
        const data = await res.json();
        if (data.success) {
          renderApps(data.data);
        }
      } catch (e) {
        console.error('Error loading apps:', e);
      }
    }
    
    // Render apps
    function renderApps(apps) {
      const grid = document.getElementById('appsGrid');
      if (apps.length === 0) {
        grid.innerHTML = '<div style="text-align:center;padding:40px;color:#9CA3AF"><h2>No WebApps found</h2></div>';
        return;
      }
      grid.innerHTML = apps.map(app => {
        const types = JSON.parse(app.types || '[]');
        const tags = JSON.parse(app.tags || '[]');
        return \`
          <div class="card">
            <div class="card-preview">
              <iframe src="\${app.url}" sandbox="allow-scripts allow-same-origin" loading="lazy"></iframe>
            </div>
            <div class="card-content">
              <div class="card-title">\${app.name}</div>
              <div class="card-dev">by \${app.developer}</div>
              <div class="card-desc">\${app.description_short}</div>
              <div class="card-actions">
                <button class="btn btn-primary" onclick="window.open('\${app.url}', '_blank')">Open App</button>
              </div>
            </div>
          </div>
        \`;
      }).join('');
    }
    
    // Load stats
    async function loadStats() {
      try {
        const res = await fetch('/api/stats');
        const data = await res.json();
        if (data.success) {
          document.getElementById('statApps').textContent = data.data.total_apps;
          document.getElementById('statRatings').textContent = data.data.total_ratings;
          document.getElementById('statReviews').textContent = data.data.total_reviews;
          document.getElementById('statViews').textContent = data.data.total_views;
        }
      } catch (e) {
        console.error('Error loading stats:', e);
      }
    }
    
    // Submit form
    async function handleSubmit(e) {
      e.preventDefault();
      const form = e.target;
      const formData = new FormData(form);
      
      const types = Array.from(form.querySelectorAll('input[name="types"]:checked')).map(cb => cb.value);
      if (types.length < 1 || types.length > 3) {
        alert('Select 1-3 types');
        return;
      }
      
      const data = {
        name: formData.get('name'),
        developer: formData.get('developer'),
        url: formData.get('url'),
        description_short: formData.get('description_short'),
        description_long: formData.get('description_long'),
        video_url: formData.get('video_url'),
        github_url: formData.get('github_url'),
        types: types,
        tags: formData.get('tags').split(',').map(t => t.trim()).filter(t => t)
      };
      
      const status = document.getElementById('submitStatus');
      status.innerHTML = '<p style="color:#00D9FF">Submitting...</p>';
      
      try {
        const res = await fetch('/api/webapps/submit', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify(data)
        });
        const result = await res.json();
        if (result.success) {
          status.innerHTML = '<p style="color:#10b981">✅ Success!</p>';
          form.reset();
          setTimeout(() => {
            document.getElementById('submitModal').classList.remove('active');
            loadApps();
            loadStats();
          }, 1500);
        } else {
          status.innerHTML = '<p style="color:#ef4444">❌ ' + result.error + '</p>';
        }
      } catch (e) {
        status.innerHTML = '<p style="color:#ef4444">❌ Network error</p>';
      }
    }
    
    // Surprise me
    async function surpriseMe() {
      try {
        const res = await fetch('/api/webapps');
        const data = await res.json();
        if (data.success && data.data.length > 0) {
          const random = data.data[Math.floor(Math.random() * data.data.length)];
          window.open(random.url, '_blank');
        } else {
          alert('No apps yet!');
        }
      } catch (e) {
        alert('Error loading apps');
      }
    }
    
    // Init
    loadApps();
    loadStats();
  </script>
</body>
</html>`);
});

// ==========================================
// START SERVER
// ==========================================

async function startServer() {
  await initDatabase();
  
  app.listen(PORT, () => {
    console.log('╔════════════════════════════════════════╗');
    console.log('║   🌌 NEXUS WEB HUB                     ║');
    console.log('║   🚀 Server: http://localhost:' + PORT + '    ║');
    console.log('║   ✅ CLEAN VERSION - Ready!            ║');
    console.log('╚════════════════════════════════════════╝');
  });
}

startServer().catch(err => {
  console.error('Startup error:', err);
  process.exit(1);
});