// ==========================================
// NEXUS WEB HUB - MONO-FILE ARCHITECTURE
// Version: 1.0.0 (NEXUS AXION 2.5)
// Author: DAOUDA Abdoul Anzize - Nexus Studio
// ==========================================

import express from 'express';
import { createClient } from '@libsql/client';
import { z } from 'zod';

const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy (pour Render/Railway)
app.set('trust proxy', 1);

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ==========================================
// DATABASE CONNECTION
// ==========================================

const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN
});

// ==========================================
// DATABASE INITIALIZATION
// ==========================================

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
        description_long TEXT CHECK(length(description_long) <= 3000),
        video_url TEXT,
        github_url TEXT,
        types TEXT NOT NULL,
        tags TEXT NOT NULL,
        status TEXT DEFAULT 'approved',
        views INTEGER DEFAULT 0,
        created_at INTEGER DEFAULT (unixepoch()),
        updated_at INTEGER DEFAULT (unixepoch())
      )
    `);
    
    await db.execute(`
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
    
    await db.execute(`
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
    
    await db.execute(`
      CREATE TABLE IF NOT EXISTS badges (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        webapp_id TEXT NOT NULL,
        badge_type TEXT NOT NULL,
        earned_at INTEGER DEFAULT (unixepoch()),
        FOREIGN KEY (webapp_id) REFERENCES webapps(id)
      )
    `);
    
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_webapps_status ON webapps(status)`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_webapps_types ON webapps(types)`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_ratings_webapp ON ratings(webapp_id)`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_reviews_webapp ON reviews(webapp_id)`);
    
    console.log('✅ Database initialized');
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    process.exit(1);
  }
}

// ==========================================
// VALIDATION SCHEMAS
// ==========================================

const WebAppSchema = z.object({
  name: z.string().min(3).max(100),
  developer: z.string().min(2).max(100),
  url: z.string().url().startsWith('https://'),
  description_short: z.string().min(20).max(200),
  description_long: z.string().max(3000).optional(),
  video_url: z.string().url().optional(),
  github_url: z.string().url().optional(),
  types: z.array(z.enum(['game', 'tool', 'api', 'design', 'productivity', 'education', 'social', 'other'])).min(1).max(3),
  tags: z.array(z.string()).min(1).max(10)
});

const RatingSchema = z.object({
  webapp_id: z.string(),
  rating: z.number().int().min(1).max(5)
});

const ReviewSchema = z.object({
  webapp_id: z.string(),
  user_name: z.string().min(2).max(50),
  comment: z.string().min(10).max(1000)
});

// ==========================================
// UTILITY FUNCTIONS
// ==========================================

function generateId() {
  return `app-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0] || 
         req.connection.remoteAddress || 
         'unknown';
}

async function checkUrlAccessibility(url) {
  try {
    const response = await fetch(url, { 
      method: 'HEAD', 
      signal: AbortSignal.timeout(5000)
    });
    return response.ok;
  } catch (error) {
    return false;
  }
}

async function checkDuplicate(url) {
  const result = await db.execute({
    sql: 'SELECT id FROM webapps WHERE url = ?',
    args: [url]
  });
  return result.rows.length > 0;
}

async function calculateRating(webappId) {
  const result = await db.execute({
    sql: 'SELECT AVG(rating) as avg_rating, COUNT(*) as total FROM ratings WHERE webapp_id = ?',
    args: [webappId]
  });
  
  if (result.rows.length === 0 || result.rows[0].total === 0) {
    return { average: 0, total: 0 };
  }
  
  return {
    average: Math.round(result.rows[0].avg_rating * 10) / 10,
    total: result.rows[0].total
  };
}

async function awardBadges(webappId) {
  const badges = [];
  
  const isFirst = await db.execute({
    sql: 'SELECT COUNT(*) as count FROM webapps WHERE status = "approved"',
    args: []
  });
  
  if (isFirst.rows[0].count === 1) {
    badges.push('pioneer');
  }
  
  const rating = await calculateRating(webappId);
  if (rating.average >= 4.5 && rating.total >= 10) {
    badges.push('highly_rated');
  }
  
  const webapp = await db.execute({
    sql: 'SELECT views FROM webapps WHERE id = ?',
    args: [webappId]
  });
  
  if (webapp.rows[0]?.views >= 100) {
    badges.push('popular');
  }
  
  const hasGithub = await db.execute({
    sql: 'SELECT github_url FROM webapps WHERE id = ? AND github_url IS NOT NULL',
    args: [webappId]
  });
  
  if (hasGithub.rows.length > 0) {
    badges.push('open_source');
  }
  
  for (const badge of badges) {
    await db.execute({
      sql: 'INSERT OR IGNORE INTO badges (webapp_id, badge_type) VALUES (?, ?)',
      args: [webappId, badge]
    });
  }
  
  return badges;
}

// ==========================================
// HTML GENERATION
// ==========================================

function generateHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="Nexus Web Hub - Universal WebApps Catalog">
  <meta name="author" content="DAOUDA Abdoul Anzize - Nexus Studio">
  <title>Nexus Web Hub - Universal WebApps Catalog</title>
  
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
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
      --gradient-primary: linear-gradient(135deg, #4169E1 0%, #8A2BE2 100%);
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
        radial-gradient(1px 1px at 50px 50px, white, transparent),
        radial-gradient(1px 1px at 130px 80px, white, transparent);
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
      backdrop-filter: blur(10px);
      padding: 1.5rem;
      position: sticky;
      top: 0;
      z-index: 1000;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
      border-bottom: 1px solid rgba(0, 217, 255, 0.2);
    }
    
    nav {
      max-width: 1400px;
      margin: 0 auto;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 1rem;
    }
    
    .logo {
      font-size: 1.5rem;
      font-weight: bold;
      background: var(--gradient-primary);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }
    
    .btn {
      padding: 0.5rem 1.5rem;
      border: none;
      border-radius: 8px;
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.3s;
      text-decoration: none;
      display: inline-block;
    }
    
    .btn-primary {
      background: var(--gradient-primary);
      color: white;
    }
    
    .btn-primary:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(138, 43, 226, 0.5);
    }
    
    .hero {
      text-align: center;
      padding: 3rem 2rem;
      max-width: 1000px;
      margin: 0 auto;
    }
    
    .hero h1 {
      font-size: clamp(2rem, 5vw, 4rem);
      margin-bottom: 1.5rem;
      background: var(--gradient-primary);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      animation: fadeInUp 1s ease-out;
    }
    
    .hero p {
      font-size: clamp(1rem, 2vw, 1.5rem);
      color: var(--text-secondary);
      margin-bottom: 2rem;
    }
    
    .hero-actions {
      display: flex;
      gap: 1.5rem;
      justify-content: center;
      flex-wrap: wrap;
    }
    
    @keyframes fadeInUp {
      from {
        opacity: 0;
        transform: translateY(30px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
    
    .transparency-banner {
      background: rgba(138, 43, 226, 0.1);
      border: 2px solid rgba(138, 43, 226, 0.3);
      border-radius: 12px;
      padding: 1.5rem;
      margin: 2rem auto;
      max-width: 1400px;
    }
    
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 1.5rem;
      max-width: 1400px;
      margin: 3rem auto;
    }
    
    .stat-card {
      background: var(--bg-card);
      backdrop-filter: blur(10px);
      border: 1px solid rgba(0, 217, 255, 0.2);
      border-radius: 16px;
      padding: 2rem;
      text-align: center;
      transition: all 0.3s;
    }
    
    .stat-card:hover {
      transform: translateY(-5px);
      border-color: var(--accent-cyan);
    }
    
    .stat-number {
      font-size: 3rem;
      font-weight: bold;
      background: var(--gradient-primary);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }
    
    .search-section {
      max-width: 1400px;
      margin: 3rem auto;
      padding: 0 2rem;
    }
    
    .search-bar {
      display: flex;
      gap: 1rem;
      margin-bottom: 2rem;
      flex-wrap: wrap;
    }
    
    .search-input {
      flex: 1;
      min-width: 250px;
      padding: 1rem 1.5rem;
      background: var(--bg-card);
      border: 2px solid rgba(0, 217, 255, 0.3);
      border-radius: 12px;
      color: var(--text-primary);
      font-size: 1rem;
    }
    
    .search-input:focus {
      outline: none;
      border-color: var(--accent-cyan);
      box-shadow: 0 0 20px rgba(0, 217, 255, 0.5);
    }
    
    .filters {
      display: flex;
      gap: 1rem;
      flex-wrap: wrap;
      align-items: center;
    }
    
    .filter-btn {
      padding: 0.5rem 1.5rem;
      background: var(--bg-card);
      border: 2px solid rgba(138, 43, 226, 0.3);
      border-radius: 8px;
      color: var(--text-primary);
      cursor: pointer;
      transition: all 0.3s;
    }
    
    .filter-btn:hover,
    .filter-btn.active {
      background: var(--gradient-primary);
      border-color: transparent;
    }
    
    .webapps-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
      gap: 2rem;
      max-width: 1400px;
      margin: 0 auto 3rem;
      padding: 0 2rem;
    }
    
    .webapp-card {
      background: var(--bg-card);
      backdrop-filter: blur(10px);
      border: 1px solid rgba(0, 217, 255, 0.2);
      border-radius: 16px;
      overflow: hidden;
      transition: all 0.3s;
      cursor: pointer;
      position: relative;
    }
    
    .webapp-card.expanded {
      grid-column: 1 / -1;
      cursor: default;
    }
    
    .webapp-card:not(.expanded):hover {
      transform: translateY(-8px);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5), 0 0 20px rgba(0, 217, 255, 0.5);
      border-color: var(--accent-cyan);
    }
    
    .webapp-preview {
      width: 100%;
      height: 200px;
      background: linear-gradient(135deg, #1a1f3a 0%, #0a0e27 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--text-secondary);
    }
    
    .webapp-card.expanded .webapp-preview {
      height: 500px;
    }
    
    .webapp-preview iframe {
      width: 100%;
      height: 100%;
      border: none;
    }
    
    .webapp-content {
      padding: 1.5rem;
    }
    
    .webapp-header {
      display: flex;
      justify-content: space-between;
      align-items: start;
      margin-bottom: 1rem;
    }
    
    .webapp-title {
      font-size: 1.25rem;
      font-weight: bold;
      margin-bottom: 0.5rem;
    }
    
    .webapp-rating {
      display: flex;
      gap: 4px;
      font-size: 1.2rem;
    }
    
    .star {
      color: var(--accent-gold);
      filter: drop-shadow(0 0 4px rgba(255, 215, 0, 0.5));
    }
    
    .star.empty {
      color: rgba(255, 215, 0, 0.3);
    }
    
    .webapp-description {
      color: var(--text-secondary);
      margin-bottom: 1.5rem;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    
    .webapp-card.expanded .webapp-description {
      display: block;
      -webkit-line-clamp: unset;
    }
    
    .description-long {
      margin-top: 1rem;
      max-height: 200px;
      overflow-y: auto;
      padding: 1rem;
      background: rgba(0, 0, 0, 0.2);
      border-radius: 8px;
      display: none;
    }
    
    .webapp-card.expanded .description-long {
      display: block;
    }
    
    .webapp-types,
    .webapp-tags {
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
      margin-bottom: 1.5rem;
    }
    
    .type-badge,
    .tag {
      padding: 4px 12px;
      background: rgba(0, 217, 255, 0.1);
      border: 1px solid rgba(0, 217, 255, 0.3);
      border-radius: 8px;
      font-size: 0.8rem;
      color: var(--accent-cyan);
    }
    
    .webapp-badges {
      display: flex;
      gap: 0.5rem;
      margin-bottom: 1.5rem;
      font-size: 1.5rem;
    }
    
    .webapp-actions {
      display: flex;
      gap: 1rem;
    }
    
    .webapp-actions .btn {
      flex: 1;
      text-align: center;
      padding: 0.5rem;
    }
    
    .expanded-content {
      display: none;
      padding: 1.5rem;
      border-top: 1px solid rgba(0, 217, 255, 0.2);
    }
    
    .webapp-card.expanded .expanded-content {
      display: block;
    }
    
    .form-group {
      margin-bottom: 1.5rem;
    }
    
    .form-group label {
      display: block;
      margin-bottom: 0.5rem;
      font-weight: 600;
    }
    
    .form-group input,
    .form-group textarea,
    .form-group select {
      width: 100%;
      padding: 1rem;
      background: var(--bg-secondary);
      border: 2px solid rgba(0, 217, 255, 0.3);
      border-radius: 8px;
      color: var(--text-primary);
      font-size: 1rem;
      font-family: inherit;
    }
    
    .form-group textarea {
      min-height: 120px;
      resize: vertical;
    }
    
    .type-checkboxes {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
      gap: 0.5rem;
    }
    
    .checkbox-label {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem;
      background: var(--bg-secondary);
      border: 2px solid rgba(0, 217, 255, 0.3);
      border-radius: 8px;
      cursor: pointer;
    }
    
    .checkbox-label:hover {
      border-color: var(--accent-cyan);
    }
    
    .submit-form {
      max-width: 1400px;
      margin: 3rem auto;
      padding: 0 2rem;
      display: none;
    }
    
    .submit-form.active {
      display: block;
    }
    
    footer {
      background: var(--bg-secondary);
      border-top: 1px solid rgba(0, 217, 255, 0.2);
      padding: 3rem 2rem;
      margin-top: 3rem;
      text-align: center;
    }
    
    .hidden {
      display: none !important;
    }
    
    @media (max-width: 768px) {
      .webapps-grid {
        grid-template-columns: 1fr;
      }
      
      .webapp-card.expanded {
        grid-column: 1;
      }
      
      .stats-grid {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>
  <header>
    <nav>
      <div class="logo">🌌 NEXUS WEB HUB</div>
      <button class="btn btn-primary" onclick="toggleSubmitForm()">Submit WebApp</button>
    </nav>
  </header>

  <section class="hero">
    <h1>🚀 Universal WebApps Catalog</h1>
    <p>Discover, explore and share the best open web applications</p>
    <div class="hero-actions">
      <button class="btn btn-primary" onclick="scrollToExplore()">Explore Catalog</button>
      <button class="btn btn-primary" onclick="surpriseMe()">🎲 Surprise Me</button>
    </div>
  </section>

  <div class="container transparency-banner">
    <h3 style="color: var(--accent-violet); margin-bottom: 1rem;">💎 Our Commitment to Transparency</h3>
    <p style="margin-bottom: 1rem;">
      Nexus Web Hub will introduce <strong>optional premium features</strong> in the future. 
      However, <strong>the core catalog will always remain free</strong>.
    </p>
    <p><strong>What we will NEVER do:</strong> Paid placement, advertising, or biased rankings.</p>
  </div>

  <section class="stats-grid container">
    <div class="stat-card">
      <div class="stat-number" id="stat-apps">0</div>
      <div style="color: var(--text-secondary);">WebApps</div>
    </div>
    <div class="stat-card">
      <div class="stat-number" id="stat-ratings">0</div>
      <div style="color: var(--text-secondary);">Ratings</div>
    </div>
    <div class="stat-card">
      <div class="stat-number" id="stat-reviews">0</div>
      <div style="color: var(--text-secondary);">Reviews</div>
    </div>
    <div class="stat-card">
      <div class="stat-number" id="stat-views">0</div>
      <div style="color: var(--text-secondary);">Total Views</div>
    </div>
  </section>

  <section class="search-section" id="explore">
    <div class="search-bar">
      <input 
        type="text" 
        class="search-input" 
        id="searchInput"
        placeholder="🔍 Search WebApps..."
        oninput="handleSearch()"
      >
    </div>
    
    <div class="filters">
      <select class="filter-btn" id="sortFilter" onchange="handleFilter()">
        <option value="recent">🆕 Recent</option>
        <option value="popular">🔥 Popular</option>
        <option value="name">🔤 Name</option>
      </select>
      
      <button class="filter-btn" id="githubFilter" onclick="toggleGithubFilter()">
        💻 Open Source Only
      </button>
    </div>
  </section>

  <div class="webapps-grid" id="webappsGrid"></div>

  <section class="submit-form" id="submitForm">
    <div class="container">
      <h2 style="margin-bottom: 2rem;">Submit Your WebApp</h2>
      <form onsubmit="handleSubmit(event)">
        <div class="form-group">
          <label>WebApp Name *</label>
          <input type="text" id="name" required minlength="3" maxlength="100">
        </div>
        
        <div class="form-group">
          <label>Developer/Team Name *</label>
          <input type="text" id="developer" required minlength="2" maxlength="100">
        </div>
        
        <div class="form-group">
          <label>WebApp URL * (HTTPS only)</label>
          <input type="url" id="url" required pattern="https://.*">
        </div>
        
        <div class="form-group">
          <label>Short Description * (20-200 characters)</label>
          <textarea id="description_short" required minlength="20" maxlength="200"></textarea>
        </div>
        
        <div class="form-group">
          <label>Long Description (0-3000 characters)</label>
          <textarea id="description_long" maxlength="3000" rows="6"></textarea>
        </div>
        
        <div class="form-group">
          <label>Types * (Select 1-3)</label>
          <div class="type-checkboxes" id="typesCheckboxes">
            <label class="checkbox-label">
              <input type="checkbox" value="game"> 🎮 Game
            </label>
            <label class="checkbox-label">
              <input type="checkbox" value="tool"> 🛠️ Tool
            </label>
            <label class="checkbox-label">
              <input type="checkbox" value="api"> 🔌 API
            </label>
            <label class="checkbox-label">
              <input type="checkbox" value="design"> 🎨 Design
            </label>
            <label class="checkbox-label">
              <input type="checkbox" value="productivity"> 📊 Productivity
            </label>
            <label class="checkbox-label">
              <input type="checkbox" value="education"> 📚 Education
            </label>
            <label class="checkbox-label">
              <input type="checkbox" value="social"> 💬 Social
            </label>
            <label class="checkbox-label">
              <input type="checkbox" value="other"> 🌟 Other
            </label>
          </div>
        </div>
        
        <div class="form-group">
          <label>Tags * (comma separated, 1-10 tags)</label>
          <input type="text" id="tags" required placeholder="web, tool, productivity">
        </div>
        
        <div class="form-group">
          <label>Video URL (YouTube, Vimeo, etc.)</label>
          <input type="url" id="video_url">
        </div>
        
        <div class="form-group">
          <label>GitHub Repository</label>
          <input type="url" id="github_url">
        </div>
        
        <button type="submit" class="btn btn-primary" style="width: 100%;">
          🚀 Submit WebApp
        </button>
        
        <div id="submitStatus" style="margin-top: 1rem; text-align: center;"></div>
      </form>
    </div>
  </section>

  <footer>
    <p style="margin-bottom: 0.5rem;">
      🌌 <strong>Nexus Web Hub</strong> - Universal WebApps Catalog
    </p>
    <p style="margin-bottom: 1rem;">
      Built with ❤️ by <strong>Nexus Studio</strong> - DAOUDA Abdoul Anzize, CEO
    </p>
    <p>
      <a href="https://github.com/Tryboy869/nexus-web-hub" target="_blank" style="color: var(--accent-cyan); text-decoration: none;">GitHub</a> • 
      <a href="mailto:nexusstudio100@gmail.com" style="color: var(--accent-cyan); text-decoration: none;">Contact</a>
    </p>
  </footer>

  <script>
    // ==========================================
    // CLIENT-SIDE LOGIC
    // ==========================================
    
    const API_BASE = window.location.origin;
    let allWebapps = [];
    let currentFilters = {
      search: '',
      sort: 'recent',
      githubOnly: false
    };
    
    const BADGES = {
      pioneer: { icon: '🏆', label: 'Pioneer' },
      highly_rated: { icon: '⭐', label: 'Highly Rated' },
      popular: { icon: '🔥', label: 'Popular' },
      open_source: { icon: '💻', label: 'Open Source' }
    };
    
    const TYPE_ICONS = {
      game: '🎮',
      tool: '🛠️',
      api: '🔌',
      design: '🎨',
      productivity: '📊',
      education: '📚',
      social: '💬',
      other: '🌟'
    };
    
    // ==========================================
    // API FUNCTIONS
    // ==========================================
    
    async function fetchWebapps() {
      try {
        const params = new URLSearchParams({
          status: 'approved',
          sort: currentFilters.sort,
          limit: 100
        });
        
        if (currentFilters.search) params.append('search', currentFilters.search);
        
        const response = await fetch(`${API_BASE}/api/webapps?${params}`);
        const data = await response.json();
        
        if (data.success) {
          allWebapps = data.data;
          
          if (currentFilters.githubOnly) {
            allWebapps = allWebapps.filter(app => app.github_url);
          }
          
          renderWebapps(allWebapps);
        }
      } catch (error) {
        console.error('Error fetching webapps:', error);
      }
    }
    
    async function fetchStats() {
      try {
        const response = await fetch(`${API_BASE}/api/stats`);
        const data = await response.json();
        
        if (data.success) {
          document.getElementById('stat-apps').textContent = data.data.total_apps;
          document.getElementById('stat-ratings').textContent = data.data.total_ratings;
          document.getElementById('stat-reviews').textContent = data.data.total_reviews;
          document.getElementById('stat-views').textContent = data.data.total_views;
        }
      } catch (error) {
        console.error('Error fetching stats:', error);
      }
    }
    
    async function submitWebapp(formData) {
      try {
        const response = await fetch(`${API_BASE}/api/webapps/submit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData)
        });
        
        return await response.json();
      } catch (error) {
        console.error('Error submitting webapp:', error);
        return { success: false, error: 'Network error' };
      }
    }
    
    async function submitRating(webappId, rating) {
      try {
        const response = await fetch(`${API_BASE}/api/ratings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ webapp_id: webappId, rating })
        });
        
        return await response.json();
      } catch (error) {
        return { success: false, error: 'Failed to submit rating' };
      }
    }
    
    async function submitReview(webappId, userName, comment) {
      try {
        const response = await fetch(`${API_BASE}/api/reviews`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            webapp_id: webappId, 
            user_name: userName, 
            comment 
          })
        });
        
        return await response.json();
      } catch (error) {
        return { success: false, error: 'Failed to submit review' };
      }
    }
    
    // ==========================================
    // RENDER FUNCTIONS
    // ==========================================
    
    function renderWebapps(webapps) {
      const grid = document.getElementById('webappsGrid');
      
      if (webapps.length === 0) {
        grid.innerHTML = '<div style="text-align: center; padding: 4rem; grid-column: 1/-1;"><div style="font-size: 4rem; margin-bottom: 1rem;">🔍</div><h2>No WebApps Found</h2><p style="color: var(--text-secondary);">Try adjusting your search or filters</p></div>';
        return;
      }
      
      grid.innerHTML = webapps.map(app => `
        <div class="webapp-card" id="card-${app.id}" onclick="toggleExpand('${app.id}')">
          <div class="webapp-preview">
            <iframe 
              src="${app.url}" 
              sandbox="allow-scripts allow-same-origin"
              loading="lazy"
              onerror="this.style.display='none'"
            ></iframe>
          </div>
          
          <div class="webapp-content">
            <div class="webapp-header">
              <div>
                <div class="webapp-title">${app.name}</div>
                <div style="color: var(--text-secondary); font-size: 0.9rem;">by ${app.developer}</div>
              </div>
              <div class="webapp-rating">
                ${renderStars(app.rating)}
              </div>
            </div>
            
            <div class="webapp-description">${app.description_short}</div>
            
            ${app.description_long ? `
              <div class="description-long">
                <h4 style="margin-bottom: 0.5rem;">Full Description:</h4>
                <p>${app.description_long}</p>
              </div>
            ` : ''}
            
            <div class="webapp-types">
              ${app.types.map(type => `<span class="type-badge">${TYPE_ICONS[type] || ''} ${type}</span>`).join('')}
            </div>
            
            <div class="webapp-tags">
              ${app.tags.slice(0, 5).map(tag => `<span class="tag">${tag}</span>`).join('')}
            </div>
            
            ${app.badges.length > 0 ? `
              <div class="webapp-badges">
                ${app.badges.map(badge => `
                  <span title="${BADGES[badge]?.label || badge}">
                    ${BADGES[badge]?.icon || '🏅'}
                  </span>
                `).join('')}
              </div>
            ` : ''}
            
            <div class="webapp-actions">
              <a href="${app.url}" target="_blank" class="btn btn-primary" onclick="event.stopPropagation()">
                🌐 Open App
              </a>
              ${app.video_url ? `
                <a href="${app.video_url}" target="_blank" class="btn btn-primary" onclick="event.stopPropagation()">
                  📹 Video
                </a>
              ` : ''}
              ${app.github_url ? `
                <a href="${app.github_url}" target="_blank" class="btn btn-primary" onclick="event.stopPropagation()">
                  💻 GitHub
                </a>
              ` : ''}
            </div>
          </div>
          
          <div class="expanded-content">
            <h3 style="margin-bottom: 1rem;">⭐ Rate this WebApp</h3>
            <div style="display: flex; gap: 0.5rem; margin-bottom: 1rem; font-size: 2rem;">
              ${[1,2,3,4,5].map(rating => `
                <span class="star" style="cursor: pointer;" onclick="event.stopPropagation(); submitRatingForApp('${app.id}', ${rating})">⭐</span>
              `).join('')}
            </div>
            
            <h3 style="margin: 2rem 0 1rem;">💬 Leave a Review</h3>
            <div class="form-group">
              <input type="text" id="review-name-${app.id}" placeholder="Your name" onclick="event.stopPropagation()">
            </div>
            <div class="form-group">
              <textarea id="review-comment-${app.id}" placeholder="Your review (min 10 characters)" onclick="event.stopPropagation()"></textarea>
            </div>
            <button class="btn btn-primary" onclick="event.stopPropagation(); submitReviewForApp('${app.id}')">
              Submit Review
            </button>
            
            <div style="margin-top: 2rem;">
              <h3 style="margin-bottom: 1rem;">Recent Reviews</h3>
              ${app.reviews && app.reviews.length > 0 ? app.reviews.map(review => `
                <div style="background: rgba(0,0,0,0.2); padding: 1rem; border-radius: 8px; margin-bottom: 1rem;">
                  <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
                    <strong style="color: var(--accent-cyan);">${review.user_name}</strong>
                    <span style="color: var(--text-secondary); font-size: 0.85rem;">${formatDate(review.created_at)}</span>
                  </div>
                  <p>${review.comment}</p>
                </div>
              `).join('') : '<p style="color: var(--text-secondary);">No reviews yet. Be the first!</p>'}
            </div>
            
            <button class="btn btn-primary" style="margin-top: 2rem; width: 100%;" onclick="toggleExpand('${app.id}')">
              Close Details
            </button>
          </div>
        </div>
      `).join('');
    }
    
    function renderStars(rating) {
      const fullStars = Math.floor(rating);
      const emptyStars = 5 - fullStars;
      
      let html = '';
      for (let i = 0; i < fullStars; i++) {
        html += '<span class="star">⭐</span>';
      }
      for (let i = 0; i < emptyStars; i++) {
        html += '<span class="star empty">⭐</span>';
      }
      
      return html;
    }
    
    function formatDate(timestamp) {
      const date = new Date(timestamp * 1000);
      return date.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric' 
      });
    }
    
    // ==========================================
    // EVENT HANDLERS
    // ==========================================
    
    function handleSearch() {
      currentFilters.search = document.getElementById('searchInput').value;
      fetchWebapps();
    }
    
    function handleFilter() {
      currentFilters.sort = document.getElementById('sortFilter').value;
      fetchWebapps();
    }
    
    function toggleGithubFilter() {
      const btn = document.getElementById('githubFilter');
      currentFilters.githubOnly = !currentFilters.githubOnly;
      btn.classList.toggle('active');
      fetchWebapps();
    }
    
    function toggleExpand(appId) {
      const card = document.getElementById(`card-${appId}`);
      const wasExpanded = card.classList.contains('expanded');
      
      // Close all cards
      document.querySelectorAll('.webapp-card').forEach(c => {
        c.classList.remove('expanded');
      });
      
      // Toggle current card
      if (!wasExpanded) {
        card.classList.add('expanded');
        card.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
    
    async function handleSubmit(event) {
      event.preventDefault();
      
      const statusDiv = document.getElementById('submitStatus');
      statusDiv.innerHTML = '<div style="color: var(--accent-cyan);">⏳ Submitting...</div>';
      
      // Get selected types
      const typeCheckboxes = document.querySelectorAll('#typesCheckboxes input[type="checkbox"]:checked');
      const types = Array.from(typeCheckboxes).map(cb => cb.value);
      
      if (types.length === 0 || types.length > 3) {
        statusDiv.innerHTML = '<div style="color: var(--error);">❌ Please select 1-3 types</div>';
        return;
      }
      
      const formData = {
        name: document.getElementById('name').value,
        developer: document.getElementById('developer').value,
        url: document.getElementById('url').value,
        description_short: document.getElementById('description_short').value,
        description_long: document.getElementById('description_long').value || undefined,
        types: types,
        tags: document.getElementById('tags').value.split(',').map(t => t.trim()).filter(t => t),
        video_url: document.getElementById('video_url').value || undefined,
        github_url: document.getElementById('github_url').value || undefined
      };
      
      const result = await submitWebapp(formData);
      
      if (result.success) {
        statusDiv.innerHTML = '<div style="color: var(--success);">✅ ' + result.message + '</div>';
        event.target.reset();
        setTimeout(() => {
          toggleSubmitForm();
          fetchWebapps();
          fetchStats();
        }, 2000);
      } else {
        statusDiv.innerHTML = '<div style="color: var(--error);">❌ ' + (result.error || 'Submission failed') + '</div>';
      }
    }
    
    async function submitRatingForApp(appId, rating) {
      const result = await submitRating(appId, rating);
      
      if (result.success) {
        alert('✅ Rating submitted successfully!');
        fetchWebapps();
      } else {
        alert('❌ ' + result.error);
      }
    }
    
    async function submitReviewForApp(appId) {
      const userName = document.getElementById(`review-name-${appId}`).value;
      const comment = document.getElementById(`review-comment-${appId}`).value;
      
      if (!userName || !comment) {
        alert('Please fill in all fields');
        return;
      }
      
      if (comment.length < 10) {
        alert('Review must be at least 10 characters');
        return;
      }
      
      const result = await submitReview(appId, userName, comment);
      
      if (result.success) {
        alert('✅ Review submitted successfully!');
        document.getElementById(`review-name-${appId}`).value = '';
        document.getElementById(`review-comment-${appId}`).value = '';
        fetchWebapps();
      } else {
        alert('❌ ' + result.error);
      }
    }
    
    function toggleSubmitForm() {
      const form = document.getElementById('submitForm');
      form.classList.toggle('active');
      
      if (form.classList.contains('active')) {
        form.scrollIntoView({ behavior: 'smooth' });
      }
    }
    
    function scrollToExplore() {
      document.getElementById('explore').scrollIntoView({ behavior: 'smooth' });
    }
    
    function surpriseMe() {
      if (allWebapps.length > 0) {
        const randomApp = allWebapps[Math.floor(Math.random() * allWebapps.length)];
        toggleExpand(randomApp.id);
      }
    }
    
    // ==========================================
    // INITIALIZATION
    // ==========================================
    
    async function init() {
      console.log('🌌 Nexus Web Hub initializing...');
      await fetchStats();
      await fetchWebapps();
      console.log('✅ Ready!');
    }
    
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  </script>
</body>
</html>`;
}

// ==========================================
// API ROUTES
// ==========================================

app.get('/', (req, res) => {
  res.send(generateHTML());
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    version: '1.0.0',
    timestamp: Date.now()
  });
});

app.get('/api/webapps', async (req, res) => {
  try {
    const { 
      status = 'approved', 
      types,
      tag, 
      search, 
      sort = 'recent',
      limit = 50,
      offset = 0
    } = req.query;
    
    let sql = 'SELECT * FROM webapps WHERE status = ?';
    const args = [status];
    
    if (types) {
      sql += ' AND types LIKE ?';
      args.push(`%${types}%`);
    }
    
    if (tag) {
      sql += ' AND tags LIKE ?';
      args.push(`%${tag}%`);
    }
    
    if (search) {
      sql += ' AND (name LIKE ? OR description_short LIKE ? OR description_long LIKE ?)';
      args.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    
    switch (sort) {
      case 'recent':
        sql += ' ORDER BY created_at DESC';
        break;
      case 'popular':
        sql += ' ORDER BY views DESC';
        break;
      case 'name':
        sql += ' ORDER BY name ASC';
        break;
    }
    
    sql += ' LIMIT ? OFFSET ?';
    args.push(parseInt(limit), parseInt(offset));
    
    const result = await db.execute({ sql, args });
    
    const enriched = await Promise.all(result.rows.map(async (app) => {
      const rating = await calculateRating(app.id);
      const badges = await db.execute({
        sql: 'SELECT badge_type FROM badges WHERE webapp_id = ?',
        args: [app.id]
      });
      
      const reviews = await db.execute({
        sql: 'SELECT user_name, comment, created_at FROM reviews WHERE webapp_id = ? ORDER BY created_at DESC LIMIT 5',
        args: [app.id]
      });
      
      return {
        ...app,
        types: JSON.parse(app.types),
        tags: JSON.parse(app.tags),
        rating: rating.average,
        rating_count: rating.total,
        badges: badges.rows.map(b => b.badge_type),
        reviews: reviews.rows
      };
    }));
    
    res.json({
      success: true,
      data: enriched,
      total: enriched.length
    });
    
  } catch (error) {
    console.error('Error fetching webapps:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

app.get('/api/webapps/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    await db.execute({
      sql: 'UPDATE webapps SET views = views + 1 WHERE id = ?',
      args: [id]
    });
    
    const result = await db.execute({
      sql: 'SELECT * FROM webapps WHERE id = ?',
      args: [id]
    });
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'WebApp not found' });
    }
    
    const app = result.rows[0];
    const rating = await calculateRating(id);
    
    const reviews = await db.execute({
      sql: 'SELECT * FROM reviews WHERE webapp_id = ? ORDER BY created_at DESC LIMIT 10',
      args: [id]
    });
    
    const badges = await db.execute({
      sql: 'SELECT badge_type FROM badges WHERE webapp_id = ?',
      args: [id]
    });
    
    res.json({
      success: true,
      data: {
        ...app,
        types: JSON.parse(app.types),
        tags: JSON.parse(app.tags),
        rating: rating.average,
        rating_count: rating.total,
        reviews: reviews.rows,
        badges: badges.rows.map(b => b.badge_type)
      }
    });
    
  } catch (error) {
    console.error('Error fetching webapp:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

app.post('/api/webapps/submit', async (req, res) => {
  try {
    const validated = WebAppSchema.parse(req.body);
    
    const isAccessible = await checkUrlAccessibility(validated.url);
    if (!isAccessible) {
      return res.status(400).json({ 
        success: false, 
        error: 'URL is not accessible. Please check and try again.' 
      });
    }
    
    const isDuplicate = await checkDuplicate(validated.url);
    if (isDuplicate) {
      return res.status(409).json({ 
        success: false, 
        error: 'This WebApp is already in our catalog.' 
      });
    }
    
    const id = generateId();
    
    await db.execute({
      sql: `INSERT INTO webapps (
        id, name, developer, url, description_short, description_long,
        video_url, github_url, types, tags, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        id,
        validated.name,
        validated.developer,
        validated.url,
        validated.description_short,
        validated.description_long || null,
        validated.video_url || null,
        validated.github_url || null,
        JSON.stringify(validated.types),
        JSON.stringify(validated.tags),
        'approved'
      ]
    });
    
    res.json({
      success: true,
      message: 'WebApp submitted successfully!',
      data: { id }
    });
    
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        success: false, 
        error: 'Validation failed', 
        details: error.errors 
      });
    }
    
    console.error('Error submitting webapp:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

app.post('/api/ratings', async (req, res) => {
  try {
    const validated = RatingSchema.parse(req.body);
    const userIp = getClientIp(req);
    
    const webapp = await db.execute({
      sql: 'SELECT id FROM webapps WHERE id = ? AND status = "approved"',
      args: [validated.webapp_id]
    });
    
    if (webapp.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'WebApp not found' });
    }
    
    await db.execute({
      sql: `INSERT INTO ratings (webapp_id, user_ip, rating) 
            VALUES (?, ?, ?)
            ON CONFLICT(webapp_id, user_ip) 
            DO UPDATE SET rating = ?, created_at = unixepoch()`,
      args: [validated.webapp_id, userIp, validated.rating, validated.rating]
    });
    
    await awardBadges(validated.webapp_id);
    
    const rating = await calculateRating(validated.webapp_id);
    
    res.json({
      success: true,
      message: 'Rating submitted successfully',
      data: rating
    });
    
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        success: false, 
        error: 'Validation failed', 
        details: error.errors 
      });
    }
    
    console.error('Error submitting rating:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

app.post('/api/reviews', async (req, res) => {
  try {
    const validated = ReviewSchema.parse(req.body);
    const userIp = getClientIp(req);
    
    const webapp = await db.execute({
      sql: 'SELECT id FROM webapps WHERE id = ? AND status = "approved"',
      args: [validated.webapp_id]
    });
    
    if (webapp.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'WebApp not found' });
    }
    
    await db.execute({
      sql: 'INSERT INTO reviews (webapp_id, user_name, user_ip, comment) VALUES (?, ?, ?, ?)',
      args: [validated.webapp_id, validated.user_name, userIp, validated.comment]
    });
    
    res.json({
      success: true,
      message: 'Review submitted successfully'
    });
    
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        success: false, 
        error: 'Validation failed', 
        details: error.errors 
      });
    }
    
    console.error('Error submitting review:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

app.get('/api/stats', async (req, res) => {
  try {
    const totalApps = await db.execute('SELECT COUNT(*) as count FROM webapps WHERE status = "approved"');
    const totalRatings = await db.execute('SELECT COUNT(*) as count FROM ratings');
    const totalReviews = await db.execute('SELECT COUNT(*) as count FROM reviews');
    const totalViews = await db.execute('SELECT SUM(views) as total FROM webapps');
    
    const topApps = await db.execute(`
      SELECT w.id, w.name, w.views, 
             (SELECT AVG(rating) FROM ratings WHERE webapp_id = w.id) as avg_rating
      FROM webapps w
      WHERE w.status = 'approved'
      ORDER BY w.views DESC
      LIMIT 10
    `);
    
    res.json({
      success: true,
      data: {
        total_apps: totalApps.rows[0].count,
        total_ratings: totalRatings.rows[0].count,
        total_reviews: totalReviews.rows[0].count,
        total_views: totalViews.rows[0].total || 0,
        top_apps: topApps.rows
      }
    });
    
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// ==========================================
// SERVER STARTUP
// ==========================================

async function startServer() {
  await initDatabase();
  
  app.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════╗
║   🌌 NEXUS WEB HUB - Ready            ║
║                                        ║
║   🚀 Server: http://localhost:${PORT}   ║
║   📊 Status: Production Ready          ║
║   🗄️  Database: Turso (Connected)      ║
║                                        ║
║   Built with ❤️ by Nexus Studio       ║
║   DAOUDA Abdoul Anzize - CEO          ║
╚════════════════════════════════════════╝
    `);
  });
}

startServer().catch(error => {
  console.error('Failed to start server:', error);
  process.exit(1);
});