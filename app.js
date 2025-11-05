// ==========================================
// NEXUS WEB HUB - BACKEND COMPLET
// Architecture: Node.js + Express + Turso + Vanilla JS
// Version: 1.0.0 - WORKING VERSION
// Author: DAOUDA Abdoul Anzize - CEO Nexus Studio
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
// MIDDLEWARE CONFIGURATION
// ==========================================

app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      frameSrc: ["'self'", "https://*"],
      imgSrc: ["'self'", "data:", "https:"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"]
    }
  }
}));

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});
app.use('/api/', limiter);

// ==========================================
// TURSO DATABASE CONNECTION
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
    // Create table with backward compatibility
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
        screenshot_url TEXT,
        type TEXT,
        tags TEXT NOT NULL,
        status TEXT DEFAULT 'approved',
        views INTEGER DEFAULT 0,
        created_at INTEGER DEFAULT (unixepoch()),
        updated_at INTEGER DEFAULT (unixepoch())
      )
    `);
    
    // Add types column if it doesn't exist (migration)
    try {
      await db.execute(`ALTER TABLE webapps ADD COLUMN types TEXT`);
      console.log('✅ Added types column');
    } catch (e) {
      console.log('ℹ️  types column already exists');
    }
    
    // Migrate existing data from type to types if needed
    try {
      await db.execute(`
        UPDATE webapps 
        SET types = json_array(type) 
        WHERE types IS NULL AND type IS NOT NULL
      `);
      console.log('✅ Migrated type to types');
    } catch (e) {
      console.log('ℹ️  Migration skipped');
    }
    
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
    
    console.log('✅ Database initialized successfully');
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    process.exit(1);
  }
}

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
// HTML TEMPLATE GENERATOR
// ==========================================

const TOOL_TYPES = {
  game: '🎮 Game',
  tool: '🛠️ Tool',
  api: '🔌 API',
  design: '🎨 Design',
  productivity: '📊 Productivity',
  education: '📚 Education',
  social: '💬 Social',
  entertainment: '🎬 Entertainment',
  finance: '💰 Finance',
  developer: '👨‍💻 Developer',
  ai: '🤖 AI/ML',
  other: '🌟 Other'
};

const BADGE_ICONS = {
  pioneer: '🏆',
  highly_rated: '⭐',
  popular: '🔥',
  open_source: '💻'
};

function generateHTML(content, title = 'Nexus Web Hub') {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="Nexus Web Hub - Universal WebApps Catalog">
  <title>${title}</title>
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
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: var(--bg-primary);
      color: var(--text-primary);
      line-height: 1.6;
      overflow-x: hidden;
    }
    
    body::before {
      content: '';
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background-image: radial-gradient(2px 2px at 20px 30px, white, transparent),
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
      padding: 1rem;
    }
    
    header {
      background: rgba(26, 31, 58, 0.95);
      backdrop-filter: blur(10px);
      padding: 1rem;
      position: sticky;
      top: 0;
      z-index: 1000;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
      border-bottom: 1px solid rgba(0, 217, 255, 0.2);
    }
    
    header .container {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 1rem;
    }
    
    .logo {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 1.5rem;
      font-weight: bold;
      background: linear-gradient(135deg, #4169E1 0%, #8A2BE2 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      cursor: pointer;
      text-decoration: none;
    }
    
    nav {
      display: flex;
      gap: 1rem;
      align-items: center;
      flex-wrap: wrap;
    }
    
    nav a, nav button {
      color: var(--text-primary);
      background: transparent;
      border: none;
      cursor: pointer;
      padding: 0.5rem 1rem;
      border-radius: 8px;
      font-size: 1rem;
      transition: all 0.3s;
      text-decoration: none;
    }
    
    nav a:hover, nav button:hover {
      background: rgba(0, 217, 255, 0.1);
      color: var(--accent-cyan);
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
      background: linear-gradient(135deg, #4169E1 0%, #8A2BE2 100%);
      color: white;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    }
    
    .btn-primary:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
    }
    
    .btn-secondary {
      background: transparent;
      color: var(--accent-cyan);
      border: 2px solid var(--accent-cyan);
    }
    
    .btn-secondary:hover {
      background: var(--accent-cyan);
      color: var(--bg-primary);
    }
    
    .hero {
      text-align: center;
      padding: 3rem 1rem;
      max-width: 1000px;
      margin: 0 auto;
    }
    
    .hero h1 {
      font-size: clamp(2rem, 5vw, 4rem);
      margin-bottom: 1rem;
      background: linear-gradient(135deg, #4169E1 0%, #8A2BE2 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    
    .hero p {
      font-size: clamp(1rem, 2vw, 1.5rem);
      color: var(--text-secondary);
      margin-bottom: 2rem;
    }
    
    .hero-actions {
      display: flex;
      gap: 1rem;
      justify-content: center;
      flex-wrap: wrap;
    }
    
    .transparency-banner {
      background: rgba(138, 43, 226, 0.1);
      border: 2px solid rgba(138, 43, 226, 0.3);
      border-radius: 12px;
      padding: 1.5rem;
      margin: 2rem auto;
      max-width: 1400px;
    }
    
    .transparency-banner h3 {
      color: var(--accent-violet);
      margin-bottom: 0.5rem;
    }
    
    .transparency-banner p {
      color: var(--text-secondary);
      font-size: 0.95rem;
      margin-bottom: 1rem;
    }
    
    .commitments {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1rem;
      margin-top: 1rem;
    }
    
    .commitment-item {
      display: flex;
      align-items: start;
      gap: 0.5rem;
      font-size: 0.9rem;
    }
    
    .stats-section {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 2rem;
      max-width: 1400px;
      margin: 3rem auto;
      padding: 0 1rem;
    }
    
    .stat-card {
      background: var(--bg-card);
      border: 1px solid rgba(0, 217, 255, 0.2);
      border-radius: 16px;
      padding: 2rem;
      text-align: center;
    }
    
    .stat-number {
      font-size: 3rem;
      font-weight: bold;
      background: linear-gradient(135deg, #4169E1 0%, #8A2BE2 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    
    .stat-label {
      color: var(--text-secondary);
      margin-top: 0.5rem;
    }
    
    .search-section {
      max-width: 1400px;
      margin: 3rem auto;
      padding: 0 1rem;
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
      padding: 1rem;
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
    }
    
    .filter-btn {
      padding: 0.5rem 1.5rem;
      background: var(--bg-card);
      border: 2px solid rgba(138, 43, 226, 0.3);
      border-radius: 8px;
      color: var(--text-primary);
      cursor: pointer;
      font-size: 1rem;
    }
    
    .webapps-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
      gap: 2rem;
      max-width: 1400px;
      margin: 0 auto;
      padding: 0 1rem 3rem;
    }
    
    .webapp-card {
      background: var(--bg-card);
      border: 1px solid rgba(0, 217, 255, 0.2);
      border-radius: 16px;
      overflow: hidden;
      transition: all 0.3s;
      cursor: pointer;
    }
    
    .webapp-card:hover {
      transform: translateY(-8px);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
      border-color: var(--accent-cyan);
    }
    
    .webapp-preview {
      position: relative;
      width: 100%;
      height: 200px;
      overflow: hidden;
      background: var(--bg-primary);
    }
    
    .webapp-preview iframe {
      width: 125%;
      height: 125%;
      border: none;
      pointer-events: none;
      transform: scale(0.8);
      transform-origin: top left;
    }
    
    .preview-overlay {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: transparent;
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      transition: opacity 0.3s;
    }
    
    .preview-overlay:hover {
      opacity: 1;
      background: rgba(0, 0, 0, 0.7);
    }
    
    .preview-hint {
      color: white;
      font-size: 1.2rem;
      font-weight: bold;
    }
    
    .webapp-content {
      padding: 1.5rem;
    }
    
    .webapp-header {
      display: flex;
      justify-content: space-between;
      align-items: start;
      margin-bottom: 0.5rem;
    }
    
    .webapp-title {
      font-size: 1.25rem;
      font-weight: bold;
    }
    
    .webapp-rating {
      font-size: 0.9rem;
      color: var(--accent-gold);
    }
    
    .webapp-developer {
      font-size: 0.875rem;
      color: var(--text-secondary);
      margin-bottom: 1rem;
    }
    
    .webapp-description {
      color: var(--text-secondary);
      font-size: 0.95rem;
      margin-bottom: 1rem;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    
    .webapp-types, .webapp-tags {
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
      margin-bottom: 1rem;
    }
    
    .type-badge {
      padding: 4px 10px;
      background: rgba(65, 105, 225, 0.2);
      border: 1px solid rgba(65, 105, 225, 0.4);
      border-radius: 8px;
      font-size: 0.75rem;
      color: var(--accent-cyan);
    }
    
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
      margin-bottom: 1rem;
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
      font-size: 0.9rem;
    }
    
    .empty-state {
      text-align: center;
      padding: 3rem;
      color: var(--text-secondary);
    }
    
    .modal {
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.9);
      z-index: 2000;
      overflow-y: auto;
      padding: 1rem;
    }
    
    .modal.active {
      display: flex;
      justify-content: center;
      align-items: start;
      padding-top: 50px;
    }
    
    .modal-content {
      background: var(--bg-secondary);
      border: 2px solid rgba(0, 217, 255, 0.3);
      border-radius: 16px;
      max-width: 900px;
      width: 100%;
      position: relative;
      padding: 2rem;
    }
    
    .modal-close {
      position: absolute;
      top: 1rem;
      right: 1rem;
      background: rgba(239, 68, 68, 0.2);
      border: none;
      color: var(--error);
      font-size: 2rem;
      width: 40px;
      height: 40px;
      border-radius: 50%;
      cursor: pointer;
      line-height: 1;
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
      background: var(--bg-card);
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
    
    .form-group input:focus,
    .form-group textarea:focus,
    .form-group select:focus {
      outline: none;
      border-color: var(--accent-cyan);
      box-shadow: 0 0 20px rgba(0, 217, 255, 0.5);
    }
    
    .types-checkboxes {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 0.5rem;
    }
    
    .checkbox-item {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    
    .checkbox-item input[type="checkbox"] {
      width: auto;
    }
    
    footer {
      background: var(--bg-secondary);
      border-top: 1px solid rgba(0, 217, 255, 0.2);
      padding: 3rem 1rem;
      margin-top: 3rem;
    }
    
    .footer-content {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 2rem;
      margin-bottom: 2rem;
    }
    
    .footer-section h3 {
      color: var(--accent-cyan);
      margin-bottom: 1rem;
    }
    
    .footer-section h4 {
      color: var(--text-primary);
      margin-bottom: 1rem;
    }
    
    .footer-section p {
      margin: 0.5rem 0;
      font-size: 0.9rem;
    }
    
    .footer-section ul {
      list-style: none;
      padding: 0;
    }
    
    .footer-section ul li {
      margin: 0.5rem 0;
    }
    
    .footer-section a {
      color: var(--text-secondary);
      text-decoration: none;
      transition: color 0.3s;
    }
    
    .footer-section a:hover {
      color: var(--accent-cyan);
    }
    
    .footer-bottom {
      text-align: center;
      padding-top: 2rem;
      border-top: 1px solid rgba(0, 217, 255, 0.2);
    }
    
    .footer-bottom p {
      margin: 0.5rem 0;
      font-size: 0.9rem;
      color: var(--text-secondary);
    }
    
    .footer-bottom strong {
      color: var(--accent-cyan);
    }
    
    @media (max-width: 768px) {
      .webapps-grid {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>
  ${content}
  
  <script>
    const API_BASE = window.location.origin;
    let allApps = [];
    
    // Smooth scroll
    function scrollToElement(id) {
      const element = document.getElementById(id);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth' });
      }
    }
    
    // Modal management
    function openModal(id) {
      const modal = document.getElementById(id);
      if (modal) {
        modal.classList.add('active');
      }
    }
    
    function closeModal(id) {
      const modal = document.getElementById(id);
      if (modal) {
        modal.classList.remove('active');
      }
    }
    
    // Close modal on outside click
    document.addEventListener('click', (e) => {
      if (e.target.classList.contains('modal')) {
        closeModal(e.target.id);
      }
    });
    
    // Surprise Me
    async function surpriseMe() {
      try {
        const response = await fetch(API_BASE + '/api/webapps?status=approved&limit=100');
        const data = await response.json();
        
        if (data.success && data.data.length > 0) {
          const random = data.data[Math.floor(Math.random() * data.data.length)];
          window.open(random.url, '_blank');
        } else {
          alert('No WebApps available yet. Be the first to submit one!');
        }
      } catch (error) {
        console.error('Surprise error:', error);
        alert('Error loading WebApps');
      }
    }
    
    // Search functionality
    async function handleSearch() {
      const search = document.getElementById('searchInput')?.value || '';
      const type = document.getElementById('typeFilter')?.value || '';
      const sort = document.getElementById('sortFilter')?.value || 'recent';
      
      const params = new URLSearchParams({
        status: 'approved',
        sort: sort,
        limit: 100
      });
      
      if (type) params.append('types', type);
      if (search) params.append('search', search);
      
      try {
        const response = await fetch(API_BASE + '/api/webapps?' + params);
        const data = await response.json();
        
        if (data.success) {
          allApps = data.data;
          renderWebApps(data.data);
        }
      } catch (error) {
        console.error('Search error:', error);
      }
    }
    
    function renderWebApps(apps) {
      const grid = document.querySelector('.webapps-grid');
      if (!grid) return;
      
      if (apps.length === 0) {
        grid.innerHTML = '<div class="empty-state"><div style="font-size:4rem;margin-bottom:1rem;opacity:0.5">🔍</div><h2>No WebApps Found</h2><p>Try adjusting your search or filters</p></div>';
        return;
      }
      
      grid.innerHTML = apps.map(app => {
        const types = JSON.parse(app.types || '[]');
        const tags = JSON.parse(app.tags || '[]');
        const badges = app.badges || [];
        
        return `
          <div class="webapp-card" data-id="${app.id}">
            <div class="webapp-preview">
              <iframe src="${app.url}" sandbox="allow-scripts allow-same-origin" loading="lazy"></iframe>
              <div class="preview-overlay" onclick="window.open('${app.url}', '_blank')">
                <div class="preview-hint">👁️ Click to open</div>
              </div>
            </div>
            <div class="webapp-content">
              <div class="webapp-header">
                <h3 class="webapp-title">${app.name}</h3>
                <div class="webapp-rating">⭐ ${app.rating_avg > 0 ? app.rating_avg.toFixed(1) : 'N/A'}</div>
              </div>
              <div class="webapp-developer">by ${app.developer}</div>
              <p class="webapp-description">${app.description_short}</p>
              <div class="webapp-types">
                ${types.slice(0, 3).map(t => `<span class="type-badge">${TOOL_TYPES[t] || t}</span>`).join('')}
              </div>
              <div class="webapp-tags">
                ${tags.slice(0, 3).map(t => `<span class="tag">${t}</span>`).join('')}
              </div>
              <div class="webapp-badges">
                ${badges.map(b => `<span class="badge">${BADGE_ICONS[b] || '🏅'}</span>`).join('')}
              </div>
              <div class="webapp-actions">
                <button class="btn btn-primary" onclick="window.open('${app.url}', '_blank')">Open App</button>
              </div>
            </div>
          </div>
        `;
      }).join('');
    }
    
    // Badge icons mapping
    const BADGE_ICONS = {
      pioneer: '🏆',
      highly_rated: '⭐',
      popular: '🔥',
      open_source: '💻'
    };
    
    const TOOL_TYPES = {
      game: '🎮 Game',
      tool: '🛠️ Tool',
      api: '🔌 API',
      design: '🎨 Design',
      productivity: '📊 Productivity',
      education: '📚 Education',
      social: '💬 Social',
      entertainment: '🎬 Entertainment',
      finance: '💰 Finance',
      developer: '👨‍💻 Developer',
      ai: '🤖 AI/ML',
      other: '🌟 Other'
    };
    
    // Search on Enter
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
      searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          handleSearch();
        }
      });
    }
    
    // Filter handlers
    const typeFilter = document.getElementById('typeFilter');
    const sortFilter = document.getElementById('sortFilter');
    
    if (typeFilter) {
      typeFilter.addEventListener('change', handleSearch);
    }
    
    if (sortFilter) {
      sortFilter.addEventListener('change', handleSearch);
    }
    
    // Submit form handler
    async function handleSubmit(event) {
      event.preventDefault();
      
      const form = event.target;
      const formData = new FormData(form);
      
      // Get selected types
      const types = [];
      form.querySelectorAll('input[name="types"]:checked').forEach(checkbox => {
        types.push(checkbox.value);
      });
      
      if (types.length < 1 || types.length > 3) {
        alert('Please select 1-3 types');
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
      
      const statusDiv = document.getElementById('submitStatus');
      statusDiv.innerHTML = '<p style="color: var(--accent-cyan);">Submitting...</p>';
      
      try {
        const response = await fetch('/api/webapps/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
        
        const result = await response.json();
        
        if (result.success) {
          statusDiv.innerHTML = '<p style="color: var(--success);">✅ WebApp submitted successfully!</p>';
          form.reset();
          setTimeout(() => {
            closeModal('submitModal');
            location.reload();
          }, 2000);
        } else {
          statusDiv.innerHTML = '<p style="color: var(--error);">❌ ' + result.error + '</p>';
        }
      } catch (error) {
        console.error('Submit error:', error);
        statusDiv.innerHTML = '<p style="color: var(--error);">❌ Network error</p>';
      }
    }
    
    // Initialize
    if (document.querySelector('.webapps-grid')) {
      handleSearch();
    }
  </script>
</body>
</html>`;
}

// ==========================================
// API ROUTES
// ==========================================

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
      const badgesResult = await db.execute({
        sql: 'SELECT badge_type FROM badges WHERE webapp_id = ?',
        args: [app.id]
      });
      
      return {
        ...app,
        rating_avg: rating.average,
        rating_count: rating.total,
        badges: badgesResult.rows.map(b => b.badge_type)
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
        rating_avg: rating.average,
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
    const { 
      name, 
      developer, 
      url, 
      description_short, 
      description_long,
      video_url,
      github_url,
      types, 
      tags 
    } = req.body;
    
    // Validation
    if (!name || name.length < 3 || name.length > 100) {
      return res.status(400).json({ success: false, error: 'Invalid name (3-100 chars)' });
    }
    
    if (!developer || developer.length < 2 || developer.length > 100) {
      return res.status(400).json({ success: false, error: 'Invalid developer (2-100 chars)' });
    }
    
    if (!url || !url.startsWith('https://')) {
      return res.status(400).json({ success: false, error: 'URL must start with https://' });
    }
    
    if (!description_short || description_short.length < 20 || description_short.length > 300) {
      return res.status(400).json({ success: false, error: 'Short description must be 20-300 chars' });
    }
    
    if (description_long && description_long.length > 3000) {
      return res.status(400).json({ success: false, error: 'Long description max 3000 chars' });
    }
    
    if (!Array.isArray(types) || types.length < 1 || types.length > 3) {
      return res.status(400).json({ success: false, error: 'Must select 1-3 types' });
    }
    
    if (!Array.isArray(tags) || tags.length < 1 || tags.length > 10) {
      return res.status(400).json({ success: false, error: 'Must provide 1-10 tags' });
    }
    
    // Check duplicate
    const existing = await db.execute({
      sql: 'SELECT id FROM webapps WHERE url = ?',
      args: [url]
    });
    
    if (existing.rows.length > 0) {
      return res.status(409).json({ 
        success: false, 
        error: 'This WebApp URL is already in our catalog' 
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
        name,
        developer,
        url,
        description_short,
        description_long || null,
        video_url || null,
        github_url || null,
        JSON.stringify(types),
        JSON.stringify(tags),
        'approved'
      ]
    });
    
    await awardBadges(id);
    
    res.json({
      success: true,
      message: 'WebApp submitted successfully!',
      data: { id }
    });
    
  } catch (error) {
    console.error('Error submitting webapp:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

app.post('/api/ratings', async (req, res) => {
  try {
    const { webapp_id, rating } = req.body;
    const userIp = getClientIp(req);
    
    if (!webapp_id || !rating || rating < 1 || rating > 5) {
      return res.status(400).json({ success: false, error: 'Invalid rating (1-5)' });
    }
    
    const webapp = await db.execute({
      sql: 'SELECT id FROM webapps WHERE id = ? AND status = "approved"',
      args: [webapp_id]
    });
    
    if (webapp.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'WebApp not found' });
    }
    
    await db.execute({
      sql: `INSERT INTO ratings (webapp_id, user_ip, rating) 
            VALUES (?, ?, ?)
            ON CONFLICT(webapp_id, user_ip) 
            DO UPDATE SET rating = ?, created_at = unixepoch()`,
      args: [webapp_id, userIp, rating, rating]
    });
    
    await awardBadges(webapp_id);
    
    const newRating = await calculateRating(webapp_id);
    
    res.json({
      success: true,
      message: 'Rating submitted successfully',
      data: newRating
    });
    
  } catch (error) {
    console.error('Error submitting rating:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

app.post('/api/reviews', async (req, res) => {
  try {
    const { webapp_id, user_name, comment } = req.body;
    const userIp = getClientIp(req);
    
    if (!webapp_id || !user_name || !comment) {
      return res.status(400).json({ success: false, error: 'All fields required' });
    }
    
    if (user_name.length < 2 || user_name.length > 50) {
      return res.status(400).json({ success: false, error: 'Name must be 2-50 chars' });
    }
    
    if (comment.length < 10 || comment.length > 1000) {
      return res.status(400).json({ success: false, error: 'Comment must be 10-1000 chars' });
    }
    
    const webapp = await db.execute({
      sql: 'SELECT id FROM webapps WHERE id = ? AND status = "approved"',
      args: [webapp_id]
    });
    
    if (webapp.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'WebApp not found' });
    }
    
    await db.execute({
      sql: 'INSERT INTO reviews (webapp_id, user_name, user_ip, comment) VALUES (?, ?, ?, ?)',
      args: [webapp_id, user_name, userIp, comment]
    });
    
    res.json({
      success: true,
      message: 'Review submitted successfully'
    });
    
  } catch (error) {
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
    
    res.json({
      success: true,
      data: {
        total_apps: totalApps.rows[0].count,
        total_ratings: totalRatings.rows[0].count,
        total_reviews: totalReviews.rows[0].count,
        total_views: totalViews.rows[0].total || 0
      }
    });
    
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// ==========================================
// HTML PAGES
// ==========================================

app.get('/', async (req, res) => {
  try {
    const statsResult = await db.execute('SELECT COUNT(*) as total_apps FROM webapps WHERE status = "approved"');
    const ratingsResult = await db.execute('SELECT COUNT(*) as total_ratings FROM ratings');
    const reviewsResult = await db.execute('SELECT COUNT(*) as total_reviews FROM reviews');
    const viewsResult = await db.execute('SELECT SUM(views) as total_views FROM webapps');
    
    const stats = {
      total_apps: statsResult.rows[0].total_apps,
      total_ratings: ratingsResult.rows[0].total_ratings,
      total_reviews: reviewsResult.rows[0].total_reviews,
      total_views: viewsResult.rows[0].total_views || 0
    };
    
    const content = `
      <header>
        <div class="container">
          <a href="/" class="logo">
            <span>🌌</span>
            <span>NEXUS WEB HUB</span>
          </a>
          <nav>
            <a href="#home" onclick="scrollToElement('home'); return false;">Home</a>
            <a href="#explore" onclick="scrollToElement('explore'); return false;">Explore</a>
            <a href="#stats" onclick="scrollToElement('stats'); return false;">Stats</a>
            <button class="btn btn-primary" onclick="openModal('submitModal')">Submit WebApp</button>
          </nav>
        </div>
      </header>
      
      <section class="hero" id="home">
        <h1>🚀 Universal WebApps Catalog</h1>
        <p>Discover, explore and share the best open web applications from around the world</p>
        <div class="hero-actions">
          <button class="btn btn-primary" onclick="scrollToElement('explore')">Explore Catalog</button>
          <button class="btn btn-secondary" onclick="surpriseMe()">🎲 Surprise Me</button>
        </div>
      </section>
      
      <section class="transparency-banner">
        <h3>💎 Our Commitment to Transparency</h3>
        <p>
          Nexus Web Hub will introduce <strong>optional premium features</strong> in the future to ensure sustainability.  
          However, <strong>the core catalog will always remain free</strong> and accessible to everyone.
        </p>
        <p>
          <strong>What we will NEVER do:</strong> Paid placement, advertising, or biased rankings.  
          Your experience is never for sale.
        </p>
        <div class="commitments">
          <div class="commitment-item">
            <span style="color: var(--success);">✅</span>
            <span>Free catalog access forever</span>
          </div>
          <div class="commitment-item">
            <span style="color: var(--success);">✅</span>
            <span>No paid placements</span>
          </div>
          <div class="commitment-item">
            <span style="color: var(--success);">✅</span>
            <span>No advertising</span>
          </div>
          <div class="commitment-item">
            <span style="color: var(--success);">✅</span>
            <span>Community-driven rankings</span>
          </div>
        </div>
      </section>
      
      <section class="stats-section" id="stats">
        <div class="stat-card">
          <div class="stat-number">${stats.total_apps}</div>
          <div class="stat-label">WebApps</div>
        </div>
        <div class="stat-card">
          <div class="stat-number">${stats.total_ratings}</div>
          <div class="stat-label">Ratings</div>
        </div>
        <div class="stat-card">
          <div class="stat-number">${stats.total_reviews}</div>
          <div class="stat-label">Reviews</div>
        </div>
        <div class="stat-card">
          <div class="stat-number">${stats.total_views}</div>
          <div class="stat-label">Total Views</div>
        </div>
      </section>
      
      <section class="search-section" id="explore">
        <div class="search-bar">
          <input type="text" class="search-input" id="searchInput" placeholder="🔍 Search WebApps...">
          <button class="btn btn-primary" onclick="handleSearch()">Search</button>
        </div>
        
        <div class="filters">
          <select class="filter-btn" id="typeFilter">
            <option value="">All Types</option>
            ${Object.entries(TOOL_TYPES).map(([value, label]) => 
              `<option value="${value}">${label}</option>`
            ).join('')}
          </select>
          
          <select class="filter-btn" id="sortFilter">
            <option value="recent">🆕 Recent</option>
            <option value="popular">🔥 Popular</option>
            <option value="name">🔤 Name</option>
          </select>
        </div>
      </section>
      
      <div class="webapps-grid"></div>
      
      <div class="modal" id="submitModal">
        <div class="modal-content">
          <button class="modal-close" onclick="closeModal('submitModal')">&times;</button>
          <h2 style="margin-bottom: 1.5rem;">🚀 Submit Your WebApp</h2>
          
          <form id="submitForm" onsubmit="handleSubmit(event)">
            <div class="form-group">
              <label>WebApp Name *</label>
              <input type="text" name="name" required minlength="3" maxlength="100" placeholder="My Awesome WebApp">
            </div>
            
            <div class="form-group">
              <label>Developer/Team Name *</label>
              <input type="text" name="developer" required minlength="2" maxlength="100" placeholder="Your name or team">
            </div>
            
            <div class="form-group">
              <label>WebApp URL * (must be HTTPS)</label>
              <input type="url" name="url" required placeholder="https://your-webapp.com" pattern="https://.*">
            </div>
            
            <div class="form-group">
              <label>Short Description * (20-300 characters)</label>
              <textarea name="description_short" required minlength="20" maxlength="300" placeholder="Brief description for cards..."></textarea>
            </div>
            
            <div class="form-group">
              <label>Long Description (0-3000 characters)</label>
              <textarea name="description_long" maxlength="3000" rows="6" placeholder="Detailed description..."></textarea>
            </div>
            
            <div class="form-group">
              <label>Types * (select 1-3)</label>
              <div class="types-checkboxes">
                ${Object.entries(TOOL_TYPES).map(([value, label]) => `
                  <div class="checkbox-item">
                    <input type="checkbox" name="types" value="${value}" id="type-${value}">
                    <label for="type-${value}">${label}</label>
                  </div>
                `).join('')}
              </div>
            </div>
            
            <div class="form-group">
              <label>Tags * (comma separated, 1-10)</label>
              <input type="text" name="tags" required placeholder="web, tool, productivity">
            </div>
            
            <div class="form-group">
              <label>Video URL (optional - YouTube, etc.)</label>
              <input type="url" name="video_url" placeholder="https://youtube.com/watch?v=...">
            </div>
            
            <div class="form-group">
              <label>GitHub Repository (optional)</label>
              <input type="url" name="github_url" placeholder="https://github.com/user/repo">
            </div>
            
            <button type="submit" class="btn btn-primary" style="width: 100%;">
              🚀 Submit WebApp
            </button>
          </form>
          
          <div id="submitStatus" style="margin-top: 1.5rem; text-align: center;"></div>
        </div>
      </div>
      
      <footer>
        <div class="container">
          <div class="footer-content">
            <div class="footer-section">
              <h3>🌌 Nexus Web Hub</h3>
              <p>Universal WebApps Catalog</p>
              <p class="tagline">Discover and share the best WebApps</p>
            </div>
            
            <div class="footer-section">
              <h4>Navigation</h4>
              <ul>
                <li><a href="/">Home</a></li>
                <li><a href="#explore" onclick="scrollToElement('explore'); return false;">Explore</a></li>
                <li><a href="#stats" onclick="scrollToElement('stats'); return false;">Stats</a></li>
              </ul>
            </div>
            
            <div class="footer-section">
              <h4>Contact</h4>
              <p>📧 <a href="mailto:nexusstudio100@gmail.com">nexusstudio100@gmail.com</a></p>
            </div>
          </div>
          
          <div class="footer-bottom">
            <p>Powered by <strong>Nexus Studio</strong></p>
            <p>© ${new Date().getFullYear()} Nexus Web Hub. All rights reserved.</p>
            <p class="tech">DAOUDA Abdoul Anzize - CEO</p>
          </div>
        </div>
      </footer>
    `;
    
    res.send(generateHTML(content, 'Nexus Web Hub - Universal WebApps Catalog'));
  } catch (error) {
    console.error('Error rendering home:', error);
    res.status(500).send('Internal Server Error');
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
║   🌌 NEXUS WEB HUB - Server Ready     ║
║                                        ║
║   🚀 URL: http://localhost:${PORT}      ║
║   📊 Status: Production Ready          ║
║   🗄️  Database: Turso (Connected)      ║
║   ⚡ Stack: Node + Express + Vanilla JS║
║                                        ║
║   Built with ❤️ by Anzize Daouda      ║
╚════════════════════════════════════════╝
    `);
  });
}

startServer().catch(error => {
  console.error('Failed to start server:', error);
  process.exit(1);
});