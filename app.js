// ==========================================
// NEXUS WEB HUB - MONO-FILE ARCHITECTURE
// Architecture Modulaire Production-Ready
// Version: 1.0.0
// ==========================================

import express from 'express';
import { createClient } from '@libsql/client';

const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy for Render/Railway
app.set('trust proxy', 1);

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ==========================================
// MODULE 1: SECURITY GATEWAY (Critical)
// ==========================================

class SecurityGateway {
  constructor() {
    this.rateLimits = new Map();
    this.auditLog = [];
    
    this.dangerousPatterns = {
      sql: [/DROP\s+TABLE/i, /DELETE.*WHERE.*1=1/i, /UNION.*SELECT/i],
      xss: [/<script>/i, /javascript:/i, /onerror=/i],
      path: [/\.\.\//g, /\.\./g]
    };
  }

  validateInput(data, dataType = 'generic') {
    if (typeof data === 'string') {
      const patterns = this.dangerousPatterns[dataType] || [];
      
      for (const pattern of patterns) {
        if (pattern.test(data)) {
          this.audit('SECURITY_VIOLATION', { pattern: pattern.toString(), data });
          return { valid: false, reason: `Dangerous pattern detected: ${pattern}` };
        }
      }
    }
    
    return { valid: true, data };
  }

  checkRateLimit(clientId, maxRequests = 100) {
    const now = Date.now();
    
    if (!this.rateLimits.has(clientId)) {
      this.rateLimits.set(clientId, { count: 0, resetTime: now + 60000 });
    }
    
    const client = this.rateLimits.get(clientId);
    
    if (now > client.resetTime) {
      client.count = 0;
      client.resetTime = now + 60000;
    }
    
    client.count++;
    
    return client.count <= maxRequests;
  }

  audit(action, data) {
    this.auditLog.push({
      timestamp: new Date().toISOString(),
      action,
      data: typeof data === 'object' ? JSON.stringify(data) : data
    });
    
    // Keep only last 1000 entries
    if (this.auditLog.length > 1000) {
      this.auditLog.shift();
    }
  }

  getAuditLog(limit = 100) {
    return this.auditLog.slice(-limit);
  }
}

// ==========================================
// MODULE 2: DATABASE MODULE (Turso)
// ==========================================

class DatabaseModule {
  constructor() {
    this.client = null;
    this.isInitialized = false;
  }

  async initialize() {
    if (this.isInitialized) return;

    const url = process.env.TURSO_DATABASE_URL;
    const authToken = process.env.TURSO_AUTH_TOKEN;

    if (!url || !authToken) {
      throw new Error('Missing Turso credentials');
    }

    this.client = createClient({ url, authToken });

    // Create tables (will skip if already exist)
    await this.createTables();
    
    this.isInitialized = true;
    console.log('✅ Database initialized');
  }

  async createTables() {
    // Table: webapps (with correct 'types' column)
    await this.client.execute(`
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
        status TEXT DEFAULT 'pending',
        views INTEGER DEFAULT 0,
        created_at INTEGER DEFAULT (unixepoch()),
        updated_at INTEGER DEFAULT (unixepoch())
      )
    `);

    // Table: ratings
    await this.client.execute(`
      CREATE TABLE IF NOT EXISTS ratings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        webapp_id TEXT NOT NULL,
        user_ip TEXT NOT NULL,
        rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
        created_at INTEGER DEFAULT (unixepoch()),
        FOREIGN KEY (webapp_id) REFERENCES webapps(id),
        UNIQUE(webapp_id, user_ip)
      )
    `);

    // Table: reviews
    await this.client.execute(`
      CREATE TABLE IF NOT EXISTS reviews (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        webapp_id TEXT NOT NULL,
        user_name TEXT NOT NULL,
        user_ip TEXT NOT NULL,
        comment TEXT NOT NULL,
        created_at INTEGER DEFAULT (unixepoch()),
        FOREIGN KEY (webapp_id) REFERENCES webapps(id)
      )
    `);

    // Table: badges
    await this.client.execute(`
      CREATE TABLE IF NOT EXISTS badges (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        webapp_id TEXT NOT NULL,
        badge_type TEXT NOT NULL,
        earned_at INTEGER DEFAULT (unixepoch()),
        FOREIGN KEY (webapp_id) REFERENCES webapps(id)
      )
    `);

    // Indexes
    await this.client.execute(`CREATE INDEX IF NOT EXISTS idx_webapps_status ON webapps(status)`);
    await this.client.execute(`CREATE INDEX IF NOT EXISTS idx_webapps_types ON webapps(types)`);
    await this.client.execute(`CREATE INDEX IF NOT EXISTS idx_ratings_webapp ON ratings(webapp_id)`);
    await this.client.execute(`CREATE INDEX IF NOT EXISTS idx_reviews_webapp ON reviews(webapp_id)`);
  }

  async query(operation, params) {
    if (!this.isInitialized) {
      throw new Error('Database not initialized');
    }

    const operations = {
      'CREATE': (p) => this._create(p),
      'READ': (p) => this._read(p),
      'UPDATE': (p) => this._update(p),
      'DELETE': (p) => this._delete(p),
      'LIST': (p) => this._list(p),
      'SEARCH': (p) => this._search(p),
      'CUSTOM': (p) => this._custom(p)
    };

    const handler = operations[operation];
    if (!handler) {
      throw new Error(`Unknown operation: ${operation}`);
    }

    return await handler(params);
  }

  async _create(params) {
    const { table, data } = params;
    const keys = Object.keys(data);
    const values = Object.values(data);
    const placeholders = keys.map(() => '?').join(', ');

    const sql = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`;
    
    await this.client.execute({ sql, args: values });
    
    return { success: true, id: data.id };
  }

  async _read(params) {
    const { table, id } = params;
    
    const result = await this.client.execute({
      sql: `SELECT * FROM ${table} WHERE id = ?`,
      args: [id]
    });

    if (result.rows.length === 0) {
      return { success: false, error: 'Not found' };
    }

    return { success: true, data: result.rows[0] };
  }

  async _update(params) {
    const { table, id, data } = params;
    const sets = Object.keys(data).map(k => `${k} = ?`).join(', ');
    const values = [...Object.values(data), id];

    await this.client.execute({
      sql: `UPDATE ${table} SET ${sets}, updated_at = unixepoch() WHERE id = ?`,
      args: values
    });

    return { success: true };
  }

  async _delete(params) {
    const { table, id } = params;
    
    await this.client.execute({
      sql: `DELETE FROM ${table} WHERE id = ?`,
      args: [id]
    });

    return { success: true };
  }

  async _list(params) {
    const { table, limit = 50, offset = 0, where = '', args = [] } = params;
    
    const whereCl = where ? `WHERE ${where}` : '';
    const sql = `SELECT * FROM ${table} ${whereCl} LIMIT ? OFFSET ?`;
    
    const result = await this.client.execute({
      sql,
      args: [...args, limit, offset]
    });

    return {
      success: true,
      data: result.rows,
      total: result.rows.length
    };
  }

  async _search(params) {
    const { table, field, query } = params;
    
    const result = await this.client.execute({
      sql: `SELECT * FROM ${table} WHERE ${field} LIKE ?`,
      args: [`%${query}%`]
    });

    return {
      success: true,
      data: result.rows,
      count: result.rows.length
    };
  }

  async _custom(params) {
    const { sql, args = [] } = params;
    const result = await this.client.execute({ sql, args });
    return { success: true, data: result.rows };
  }
}

// ==========================================
// MODULE 3: BUSINESS LOGIC
// ==========================================

class BusinessLogic {
  constructor(database) {
    this.db = database;
  }

  generateId() {
    return `app-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  async checkDuplicate(url) {
    const result = await this.db.query('CUSTOM', {
      sql: 'SELECT id FROM webapps WHERE url = ?',
      args: [url]
    });
    return result.data.length > 0;
  }

  async calculateRating(webappId) {
    const result = await this.db.query('CUSTOM', {
      sql: 'SELECT AVG(rating) as avg_rating, COUNT(*) as total FROM ratings WHERE webapp_id = ?',
      args: [webappId]
    });

    if (result.data.length === 0 || result.data[0].total === 0) {
      return { average: 0, total: 0 };
    }

    return {
      average: Math.round(result.data[0].avg_rating * 10) / 10,
      total: result.data[0].total
    };
  }

  async awardBadges(webappId) {
    const badges = [];

    // Badge: Pioneer (first app)
    const totalApps = await this.db.query('CUSTOM', {
      sql: 'SELECT COUNT(*) as count FROM webapps WHERE status = "approved"',
      args: []
    });

    if (totalApps.data[0].count === 1) {
      badges.push('pioneer');
    }

    // Badge: Highly Rated
    const rating = await this.calculateRating(webappId);
    if (rating.average >= 4.5 && rating.total >= 10) {
      badges.push('highly_rated');
    }

    // Badge: Popular
    const webapp = await this.db.query('READ', { table: 'webapps', id: webappId });
    if (webapp.success && webapp.data.views >= 100) {
      badges.push('popular');
    }

    // Badge: Open Source
    if (webapp.success && webapp.data.github_url) {
      badges.push('open_source');
    }

    // Insert badges
    for (const badge of badges) {
      try {
        await this.db.query('CUSTOM', {
          sql: 'INSERT OR IGNORE INTO badges (webapp_id, badge_type) VALUES (?, ?)',
          args: [webappId, badge]
        });
      } catch (e) {
        // Ignore duplicates
      }
    }

    return badges;
  }

  async getStats() {
    const totalApps = await this.db.query('CUSTOM', {
      sql: 'SELECT COUNT(*) as count FROM webapps WHERE status = "approved"',
      args: []
    });

    const totalRatings = await this.db.query('CUSTOM', {
      sql: 'SELECT COUNT(*) as count FROM ratings',
      args: []
    });

    const totalReviews = await this.db.query('CUSTOM', {
      sql: 'SELECT COUNT(*) as count FROM reviews',
      args: []
    });

    const totalViews = await this.db.query('CUSTOM', {
      sql: 'SELECT SUM(views) as total FROM webapps',
      args: []
    });

    return {
      total_apps: totalApps.data[0].count,
      total_ratings: totalRatings.data[0].count,
      total_reviews: totalReviews.data[0].count,
      total_views: totalViews.data[0].total || 0
    };
  }
}

// ==========================================
// MODULE 4: UI MODULE (Frontend HTML)
// ==========================================

class UIModule {
  static getHTML() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="Nexus Web Hub - Universal WebApps Catalog">
  <meta name="author" content="DAOUDA Abdoul Anzize - Nexus Studio">
  <title>Nexus Web Hub - Universal WebApps Catalog</title>
  
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    
    :root {
      --bg-primary: #0a0e27;
      --bg-secondary: #1a1f3a;
      --bg-card: rgba(26, 31, 58, 0.8);
      --text-primary: #E0E6ED;
      --text-secondary: #9CA3AF;
      --accent-cyan: #00D9FF;
      --accent-violet: #8A2BE2;
      --accent-gold: #FFD700;
      --success: #10b981;
      --error: #ef4444;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: var(--bg-primary);
      color: var(--text-primary);
      line-height: 1.6;
    }
    
    body::before {
      content: '';
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background-image: 
        radial-gradient(2px 2px at 20px 30px, white, transparent),
        radial-gradient(2px 2px at 60px 70px, white, transparent),
        radial-gradient(1px 1px at 50px 50px, white, transparent);
      background-size: 200px 200px;
      opacity: 0.3;
      z-index: -1;
      animation: twinkle 3s infinite;
    }
    
    @keyframes twinkle {
      0%, 100% { opacity: 0.3; }
      50% { opacity: 0.5; }
    }
    
    .container {
      max-width: 1400px;
      margin: 0 auto;
      padding: 2rem;
    }
    
    header {
      background: rgba(26, 31, 58, 0.95);
      padding: 1.5rem 2rem;
      position: sticky;
      top: 0;
      z-index: 1000;
      border-bottom: 1px solid rgba(0, 217, 255, 0.2);
    }
    
    .logo {
      font-size: 1.5rem;
      font-weight: bold;
      background: linear-gradient(135deg, #4169E1 0%, #8A2BE2 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    
    .btn {
      padding: 0.75rem 1.5rem;
      border: none;
      border-radius: 8px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.3s;
      background: linear-gradient(135deg, #4169E1 0%, #8A2BE2 100%);
      color: white;
    }
    
    .btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(138, 43, 226, 0.5);
    }
    
    .hero {
      text-align: center;
      padding: 3rem 2rem;
    }
    
    .hero h1 {
      font-size: clamp(2rem, 5vw, 4rem);
      background: linear-gradient(135deg, #4169E1 0%, #8A2BE2 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      margin-bottom: 1rem;
    }
    
    .card {
      background: var(--bg-card);
      border: 1px solid rgba(0, 217, 255, 0.2);
      border-radius: 12px;
      padding: 1.5rem;
      margin: 1rem 0;
      transition: all 0.3s;
    }
    
    .card:hover {
      transform: translateY(-4px);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
      border-color: var(--accent-cyan);
    }
    
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
      gap: 2rem;
      margin: 2rem 0;
    }
    
    input, textarea, select {
      width: 100%;
      padding: 0.75rem;
      background: var(--bg-secondary);
      border: 2px solid rgba(0, 217, 255, 0.3);
      border-radius: 8px;
      color: var(--text-primary);
      font-size: 1rem;
    }
    
    input:focus, textarea:focus, select:focus {
      outline: none;
      border-color: var(--accent-cyan);
      box-shadow: 0 0 20px rgba(0, 217, 255, 0.3);
    }
    
    .hidden { display: none !important; }
    
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(20px); }
      to { opacity: 1; transform: translateY(0); }
    }
    
    .fade-in { animation: fadeIn 0.5s ease-out; }
  </style>
</head>
<body>
  <header>
    <div class="container" style="display: flex; justify-content: space-between; align-items: center;">
      <div class="logo">🌌 NEXUS WEB HUB</div>
      <button class="btn" onclick="showSubmitForm()">Submit WebApp</button>
    </div>
  </header>

  <section class="hero">
    <h1>🚀 Universal WebApps Catalog</h1>
    <p style="font-size: 1.25rem; color: var(--text-secondary); margin-bottom: 2rem;">
      Discover, explore and share the best open web applications
    </p>
    <div style="display: flex; gap: 1rem; justify-content: center; flex-wrap: wrap;">
      <button class="btn" onclick="scrollTo(0, 800)">Explore Catalog</button>
      <button class="btn" onclick="surpriseMe()">🎲 Surprise Me</button>
    </div>
  </section>

  <section id="submit-section" class="container hidden">
    <div class="card">
      <h2>🚀 Submit Your WebApp</h2>
      <form id="submitForm" style="margin-top: 1.5rem;">
        <div style="margin-bottom: 1rem;">
          <label>WebApp Name *</label>
          <input type="text" id="name" required minlength="3" maxlength="100">
        </div>
        <div style="margin-bottom: 1rem;">
          <label>Developer/Team *</label>
          <input type="text" id="developer" required minlength="2" maxlength="100">
        </div>
        <div style="margin-bottom: 1rem;">
          <label>URL * (HTTPS only)</label>
          <input type="url" id="url" required pattern="https://.*">
        </div>
        <div style="margin-bottom: 1rem;">
          <label>Short Description * (20-200 char)</label>
          <textarea id="desc_short" required minlength="20" maxlength="200" rows="2"></textarea>
        </div>
        <div style="margin-bottom: 1rem;">
          <label>Long Description (0-3000 char)</label>
          <textarea id="desc_long" maxlength="3000" rows="5"></textarea>
        </div>
        <div style="margin-bottom: 1rem;">
          <label>Types * (hold Ctrl/Cmd for multiple, max 3)</label>
          <select id="types" multiple required size="8">
            <option value="game">🎮 Game</option>
            <option value="tool">🛠️ Tool</option>
            <option value="api">🔌 API</option>
            <option value="design">🎨 Design</option>
            <option value="productivity">📊 Productivity</option>
            <option value="education">📚 Education</option>
            <option value="social">💬 Social</option>
            <option value="other">🌟 Other</option>
          </select>
        </div>
        <div style="margin-bottom: 1rem;">
          <label>Tags * (comma-separated, 1-10)</label>
          <input type="text" id="tags" required placeholder="web, tool, productivity">
        </div>
        <div style="margin-bottom: 1rem;">
          <label>Video URL (optional)</label>
          <input type="url" id="video_url">
        </div>
        <div style="margin-bottom: 1rem;">
          <label>GitHub URL (optional)</label>
          <input type="url" id="github_url">
        </div>
        <button type="submit" class="btn" style="width: 100%;">🚀 Submit</button>
      </form>
      <div id="submit-status" style="margin-top: 1rem; text-align: center;"></div>
    </div>
  </section>

  <section class="container">
    <h2>📊 Platform Stats</h2>
    <div class="grid" id="stats-grid">
      <div class="card" style="text-align: center;">
        <div style="font-size: 2rem;">📦</div>
        <div style="font-size: 2rem; color: var(--accent-cyan); font-weight: bold;" id="stat-apps">0</div>
        <div style="opacity: 0.8;">WebApps</div>
      </div>
      <div class="card" style="text-align: center;">
        <div style="font-size: 2rem;">⭐</div>
        <div style="font-size: 2rem; color: var(--accent-cyan); font-weight: bold;" id="stat-ratings">0</div>
        <div style="opacity: 0.8;">Ratings</div>
      </div>
      <div class="card" style="text-align: center;">
        <div style="font-size: 2rem;">💬</div>
        <div style="font-size: 2rem; color: var(--accent-cyan); font-weight: bold;" id="stat-reviews">0</div>
        <div style="opacity: 0.8;">Reviews</div>
      </div>
      <div class="card" style="text-align: center;">
        <div style="font-size: 2rem;">👁️</div>
        <div style="font-size: 2rem; color: var(--accent-cyan); font-weight: bold;" id="stat-views">0</div>
        <div style="opacity: 0.8;">Views</div>
      </div>
    </div>
  </section>

  <section class="container">
    <h2>🔍 Explore WebApps</h2>
    <div id="webapps-grid" class="grid"></div>
    <div id="loading" style="text-align: center; padding: 3rem;">
      <div style="font-size: 3rem;">⏳</div>
      <p>Loading WebApps...</p>
    </div>
    <div id="empty" class="hidden" style="text-align: center; padding: 3rem;">
      <div style="font-size: 3rem;">🔍</div>
      <p>No WebApps found yet. Be the first to submit!</p>
    </div>
  </section>

  <footer style="text-align: center; padding: 3rem 2rem; border-top: 1px solid rgba(0, 217, 255, 0.2); margin-top: 4rem;">
    <p>🌌 <strong>Nexus Web Hub</strong> - Universal WebApps Catalog</p>
    <p style="margin-top: 0.5rem;">Built with ❤️ by <strong>DAOUDA Abdoul Anzize</strong> - CEO Nexus Studio</p>
    <p style="margin-top: 1rem;">
      <a href="https://github.com/Tryboy869/nexus-web-hub" target="_blank" style="color: var(--accent-cyan); text-decoration: none;">GitHub</a> •
      <a href="mailto:nexusstudio100@gmail.com" style="color: var(--accent-cyan); text-decoration: none;">Contact</a>
    </p>
  </footer>

  <script>
    const API = {
      async request(endpoint, options = {}) {
        try {
          const response = await fetch(endpoint, {
            ...options,
            headers: { 'Content-Type': 'application/json', ...options.headers }
          });
          return await response.json();
        } catch (error) {
          console.error('API Error:', error);
          return { success: false, error: error.message };
        }
      }
    };

    async function loadStats() {
      const data = await API.request('/api/stats');
      if (data.success) {
        document.getElementById('stat-apps').textContent = data.data.total_apps;
        document.getElementById('stat-ratings').textContent = data.data.total_ratings;
        document.getElementById('stat-reviews').textContent = data.data.total_reviews;
        document.getElementById('stat-views').textContent = data.data.total_views;
      }
    }

    async function loadWebApps() {
      const data = await API.request('/api/webapps?status=approved');
      const grid = document.getElementById('webapps-grid');
      const loading = document.getElementById('loading');
      const empty = document.getElementById('empty');

      loading.classList.add('hidden');

      if (!data.success || data.data.length === 0) {
        empty.classList.remove('hidden');
        return;
      }

      grid.innerHTML = data.data.map(app => \`
        <div class="card fade-in">
          <h3>\${app.name}</h3>
          <p style="opacity: 0.8; margin: 0.5rem 0;">by \${app.developer}</p>
          <p style="margin: 1rem 0;">\${app.description_short}</p>
          <div style="display: flex; gap: 0.5rem; flex-wrap: wrap; margin: 1rem 0;">
            \${JSON.parse(app.types).map(t => \`<span style="padding: 0.25rem 0.75rem; background: rgba(0, 217, 255, 0.2); border-radius: 12px; font-size: 0.85rem;">\${t}</span>\`).join('')}
          </div>
          <a href="\${app.url}" target="_blank" class="btn" style="display: block; text-align: center; text-decoration: none;">Open App</a>
        </div>
      \`).join('');
    }

    function showSubmitForm() {
      const section = document.getElementById('submit-section');
      section.classList.toggle('hidden');
      if (!section.classList.contains('hidden')) {
        section.scrollIntoView({ behavior: 'smooth' });
      }
    }

    document.getElementById('submitForm').addEventListener('submit', async (e) => {
      e.preventDefault();

      const types = Array.from(document.getElementById('types').selectedOptions).map(opt => opt.value);
      
      if (types.length === 0 || types.length > 3) {
        alert('Please select 1-3 types');
        return;
      }

      const data = {
        name: document.getElementById('name').value,
        developer: document.getElementById('developer').value,
        url: document.getElementById('url').value,
        description_short: document.getElementById('desc_short').value,
        description_long: document.getElementById('desc_long').value || null,
        video_url: document.getElementById('video_url').value || null,
        github_url: document.getElementById('github_url').value || null,
        types,
        tags: document.getElementById('tags').value.split(',').map(t => t.trim())
      };

      const status = document.getElementById('submit-status');
      status.textContent = 'Submitting...';

      const result = await API.request('/api/webapps/submit', {
        method: 'POST',
        body: JSON.stringify(data)
      });

      if (result.success) {
        status.innerHTML = '<div style="color: var(--success); font-weight: bold;">✅ WebApp submitted successfully!</div>';
        document.getElementById('submitForm').reset();
        setTimeout(() => location.reload(), 2000);
      } else {
        status.innerHTML = \`<div style="color: var(--error); font-weight: bold;">❌ \${result.error}</div>\`;
      }
    });

    async function surpriseMe() {
      const data = await API.request('/api/webapps?status=approved');
      if (data.success && data.data.length > 0) {
        const random = data.data[Math.floor(Math.random() * data.data.length)];
        window.open(random.url, '_blank');
      } else {
        alert('No WebApps available yet!');
      }
    }

    // Initialize
    loadStats();
    loadWebApps();
  </script>
</body>
</html>`;
  }
}

// ==========================================
// MODULE 5: ORCHESTRATOR (Intelligence)
// ==========================================

class IntelligentOrchestrator {
  constructor() {
    this.security = new SecurityGateway();
    this.database = new DatabaseModule();
    this.business = null; // Initialized after DB
  }

  async initialize() {
    await this.database.initialize();
    this.business = new BusinessLogic(this.database);
    console.log('✅ Orchestrator initialized');
  }

  async execute(request) {
    const { module, operation, params, clientId } = request;

    // Security: Rate limiting
    if (!this.security.checkRateLimit(clientId || 'anonymous', 100)) {
      return { success: false, error: 'Rate limit exceeded', status: 429 };
    }

    // Security: Input validation
    const validation = this.security.validateInput(JSON.stringify(params), 'generic');
    if (!validation.valid) {
      this.security.audit('VALIDATION_FAILED', { module, operation, reason: validation.reason });
      return { success: false, error: validation.reason, status: 400 };
    }

    // Route to appropriate module
    try {
      let result;

      switch (module) {
        case 'database':
          result = await this.database.query(operation, params);
          break;

        case 'business':
          result = await this._executeBusinessLogic(operation, params);
          break;

        default:
          throw new Error(`Unknown module: ${module}`);
      }

      // Audit success
      this.security.audit('OPERATION_SUCCESS', { module, operation });

      return { success: true, data: result };

    } catch (error) {
      this.security.audit('OPERATION_ERROR', { module, operation, error: error.message });
      return { success: false, error: error.message, status: 500 };
    }
  }

  async _executeBusinessLogic(operation, params) {
    const operations = {
      'checkDuplicate': () => this.business.checkDuplicate(params.url),
      'calculateRating': () => this.business.calculateRating(params.webappId),
      'awardBadges': () => this.business.awardBadges(params.webappId),
      'getStats': () => this.business.getStats(),
      'generateId': () => this.business.generateId()
    };

    const handler = operations[operation];
    if (!handler) {
      throw new Error(`Unknown business operation: ${operation}`);
    }

    return await handler();
  }

  getSecurityLogs() {
    return this.security.getAuditLog();
  }
}

// ==========================================
// MODULE 6: API ROUTES (Express Integration)
// ==========================================

class APIRoutes {
  constructor(app, orchestrator) {
    this.app = app;
    this.orchestrator = orchestrator;
    this.setupRoutes();
  }

  setupRoutes() {
    // Frontend
    this.app.get('/', (req, res) => {
      res.send(UIModule.getHTML());
    });

    // Health check
    this.app.get('/api/health', (req, res) => {
      res.json({ status: 'healthy', version: '1.0.0', timestamp: Date.now() });
    });

    // Get stats
    this.app.get('/api/stats', async (req, res) => {
      const result = await this.orchestrator.execute({
        module: 'business',
        operation: 'getStats',
        params: {},
        clientId: req.ip
      });

      if (result.success) {
        res.json({ success: true, data: result.data });
      } else {
        res.status(result.status || 500).json(result);
      }
    });

    // Get webapps
    this.app.get('/api/webapps', async (req, res) => {
      const { status = 'approved', types, search, limit = 50, offset = 0 } = req.query;

      let where = 'status = ?';
      let args = [status];

      if (types) {
        where += ' AND types LIKE ?';
        args.push(`%${types}%`);
      }

      if (search) {
        where += ' AND (name LIKE ? OR description_short LIKE ? OR description_long LIKE ?)';
        args.push(`%${search}%`, `%${search}%`, `%${search}%`);
      }

      const result = await this.orchestrator.execute({
        module: 'database',
        operation: 'LIST',
        params: {
          table: 'webapps',
          where,
          args,
          limit: parseInt(limit),
          offset: parseInt(offset)
        },
        clientId: req.ip
      });

      if (result.success) {
        res.json({ success: true, data: result.data.data, total: result.data.total });
      } else {
        res.status(result.status || 500).json(result);
      }
    });

    // Get single webapp
    this.app.get('/api/webapps/:id', async (req, res) => {
      const { id } = req.params;

      // Increment views
      await this.orchestrator.execute({
        module: 'database',
        operation: 'UPDATE',
        params: {
          table: 'webapps',
          id,
          data: {} // Views updated via SQL trigger
        },
        clientId: req.ip
      });

      // Get webapp
      const result = await this.orchestrator.execute({
        module: 'database',
        operation: 'CUSTOM',
        params: {
          sql: 'UPDATE webapps SET views = views + 1 WHERE id = ?; SELECT * FROM webapps WHERE id = ?;',
          args: [id, id]
        },
        clientId: req.ip
      });

      if (result.success && result.data.data.length > 0) {
        const webapp = result.data.data[0];

        // Get rating
        const rating = await this.orchestrator.execute({
          module: 'business',
          operation: 'calculateRating',
          params: { webappId: id },
          clientId: req.ip
        });

        // Get reviews
        const reviews = await this.orchestrator.execute({
          module: 'database',
          operation: 'LIST',
          params: {
            table: 'reviews',
            where: 'webapp_id = ?',
            args: [id],
            limit: 10
          },
          clientId: req.ip
        });

        // Get badges
        const badges = await this.orchestrator.execute({
          module: 'database',
          operation: 'LIST',
          params: {
            table: 'badges',
            where: 'webapp_id = ?',
            args: [id]
          },
          clientId: req.ip
        });

        res.json({
          success: true,
          data: {
            ...webapp,
            types: JSON.parse(webapp.types),
            tags: JSON.parse(webapp.tags),
            rating: rating.data.average,
            rating_count: rating.data.total,
            reviews: reviews.data.data,
            badges: badges.data.data.map(b => b.badge_type)
          }
        });
      } else {
        res.status(404).json({ success: false, error: 'WebApp not found' });
      }
    });

    // Submit webapp
    this.app.post('/api/webapps/submit', async (req, res) => {
      const { name, developer, url, description_short, description_long, types, tags, video_url, github_url } = req.body;

      // Validation
      if (!name || !developer || !url || !description_short || !types || !tags) {
        return res.status(400).json({ success: false, error: 'Missing required fields' });
      }

      if (!url.startsWith('https://')) {
        return res.status(400).json({ success: false, error: 'URL must be HTTPS' });
      }

      if (!Array.isArray(types) || types.length === 0 || types.length > 3) {
        return res.status(400).json({ success: false, error: 'Types must be array with 1-3 items' });
      }

      if (!Array.isArray(tags) || tags.length === 0 || tags.length > 10) {
        return res.status(400).json({ success: false, error: 'Tags must be array with 1-10 items' });
      }

      if (description_short.length < 20 || description_short.length > 200) {
        return res.status(400).json({ success: false, error: 'Short description must be 20-200 characters' });
      }

      if (description_long && description_long.length > 3000) {
        return res.status(400).json({ success: false, error: 'Long description must be max 3000 characters' });
      }

      // Check duplicate
      const duplicate = await this.orchestrator.execute({
        module: 'business',
        operation: 'checkDuplicate',
        params: { url },
        clientId: req.ip
      });

      if (duplicate.data) {
        return res.status(409).json({ success: false, error: 'This URL is already in our catalog' });
      }

      // Generate ID
      const idResult = await this.orchestrator.execute({
        module: 'business',
        operation: 'generateId',
        params: {},
        clientId: req.ip
      });

      const id = idResult.data;

      // Create webapp
      const result = await this.orchestrator.execute({
        module: 'database',
        operation: 'CREATE',
        params: {
          table: 'webapps',
          data: {
            id,
            name,
            developer,
            url,
            description_short,
            description_long: description_long || null,
            video_url: video_url || null,
            github_url: github_url || null,
            types: JSON.stringify(types),
            tags: JSON.stringify(tags),
            status: 'approved' // Auto-approve for MVP
          }
        },
        clientId: req.ip
      });

      if (result.success) {
        res.json({ success: true, message: 'WebApp submitted successfully!', data: { id } });
      } else {
        res.status(result.status || 500).json(result);
      }
    });

    // Submit rating
    this.app.post('/api/ratings', async (req, res) => {
      const { webapp_id, rating } = req.body;
      const user_ip = req.ip;

      if (!webapp_id || !rating || rating < 1 || rating > 5) {
        return res.status(400).json({ success: false, error: 'Invalid rating data' });
      }

      // Check webapp exists
      const webappCheck = await this.orchestrator.execute({
        module: 'database',
        operation: 'READ',
        params: { table: 'webapps', id: webapp_id },
        clientId: req.ip
      });

      if (!webappCheck.success) {
        return res.status(404).json({ success: false, error: 'WebApp not found' });
      }

      // Insert or update rating
      await this.orchestrator.execute({
        module: 'database',
        operation: 'CUSTOM',
        params: {
          sql: 'INSERT INTO ratings (webapp_id, user_ip, rating) VALUES (?, ?, ?) ON CONFLICT(webapp_id, user_ip) DO UPDATE SET rating = ?, created_at = unixepoch()',
          args: [webapp_id, user_ip, rating, rating]
        },
        clientId: req.ip
      });

      // Award badges
      await this.orchestrator.execute({
        module: 'business',
        operation: 'awardBadges',
        params: { webappId: webapp_id },
        clientId: req.ip
      });

      // Get updated rating
      const newRating = await this.orchestrator.execute({
        module: 'business',
        operation: 'calculateRating',
        params: { webappId: webapp_id },
        clientId: req.ip
      });

      res.json({ success: true, message: 'Rating submitted', data: newRating.data });
    });

    // Submit review
    this.app.post('/api/reviews', async (req, res) => {
      const { webapp_id, user_name, comment } = req.body;
      const user_ip = req.ip;

      if (!webapp_id || !user_name || !comment || comment.length < 10) {
        return res.status(400).json({ success: false, error: 'Invalid review data' });
      }

      // Check webapp exists
      const webappCheck = await this.orchestrator.execute({
        module: 'database',
        operation: 'READ',
        params: { table: 'webapps', id: webapp_id },
        clientId: req.ip
      });

      if (!webappCheck.success) {
        return res.status(404).json({ success: false, error: 'WebApp not found' });
      }

      // Create review
      await this.orchestrator.execute({
        module: 'database',
        operation: 'CUSTOM',
        params: {
          sql: 'INSERT INTO reviews (webapp_id, user_name, user_ip, comment) VALUES (?, ?, ?, ?)',
          args: [webapp_id, user_name, user_ip, comment]
        },
        clientId: req.ip
      });

      res.json({ success: true, message: 'Review submitted' });
    });

    // Admin: Approve
    this.app.post('/api/admin/approve/:id', async (req, res) => {
      const { id } = req.params;

      const result = await this.orchestrator.execute({
        module: 'database',
        operation: 'UPDATE',
        params: {
          table: 'webapps',
          id,
          data: { status: 'approved' }
        },
        clientId: req.ip
      });

      res.json(result);
    });

    // Admin: Reject
    this.app.post('/api/admin/reject/:id', async (req, res) => {
      const { id } = req.params;

      const result = await this.orchestrator.execute({
        module: 'database',
        operation: 'UPDATE',
        params: {
          table: 'webapps',
          id,
          data: { status: 'rejected' }
        },
        clientId: req.ip
      });

      res.json(result);
    });

    // Security logs (admin only in production)
    this.app.get('/api/admin/logs', (req, res) => {
      const logs = this.orchestrator.getSecurityLogs();
      res.json({ success: true, logs });
    });
  }
}

// ==========================================
// MAIN APPLICATION INITIALIZATION
// ==========================================

async function startApplication() {
  console.log('🌌 NEXUS WEB HUB - Starting...');

  // Create orchestrator
  const orchestrator = new IntelligentOrchestrator();
  
  // Initialize (database, modules, etc.)
  await orchestrator.initialize();

  // Setup API routes
  new APIRoutes(app, orchestrator);

  // Start server
  app.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════╗
║   🌌 NEXUS WEB HUB - Ready           ║
║                                        ║
║   🚀 Server: http://localhost:${PORT}   ║
║   📊 Status: Production Ready          ║
║   🗄️  Database: Turso (Connected)      ║
║   🏗️  Architecture: Mono-File Modular  ║
║                                        ║
║   Built by Nexus Studio               ║
║   DAOUDA Abdoul Anzize - CEO           ║
╚════════════════════════════════════════╝
    `);
  });
}

// Start the application
startApplication().catch(error => {
  console.error('❌ Failed to start application:', error);
  process.exit(1);
});