// ==========================================
// NEXUS WEB HUB - BACKEND + FRONTEND REACT SSR
// Architecture: Node.js + Express + Turso + React SSR
// Version: 1.0.0
// Author: DAOUDA Abdoul Anzize - CEO Nexus Studio
// ==========================================

import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { createClient } from '@libsql/client';
import React from 'react';
import { renderToString } from 'react-dom/server';
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
        type TEXT NOT NULL,
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
      // Column already exists or other error - ignore
      console.log('ℹ️  types column already exists or migration not needed');
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
      console.log('ℹ️  Migration skipped or already done');
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
// REACT COMPONENTS
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

function Layout({ children, title = 'Nexus Web Hub' }) {
  return React.createElement('html', { lang: 'en' },
    React.createElement('head', null,
      React.createElement('meta', { charSet: 'UTF-8' }),
      React.createElement('meta', { name: 'viewport', content: 'width=device-width, initial-scale=1.0' }),
      React.createElement('title', null, title),
      React.createElement('style', { dangerouslySetInnerHTML: { __html: CSS_STYLES } })
    ),
    React.createElement('body', null,
      React.createElement('div', { id: 'root' }, children),
      React.createElement('script', { dangerouslySetInnerHTML: { __html: CLIENT_SCRIPT } })
    )
  );
}

function Header() {
  return React.createElement('header', { className: 'header' },
    React.createElement('div', { className: 'container' },
      React.createElement('div', { className: 'logo', onClick: () => {} },
        React.createElement('span', null, '🌌'),
        React.createElement('span', null, 'NEXUS WEB HUB')
      ),
      React.createElement('nav', { className: 'nav-links' },
        React.createElement('button', { onClick: () => {} }, 'Home'),
        React.createElement('button', { onClick: () => {} }, 'Explore'),
        React.createElement('button', { onClick: () => {} }, 'Stats'),
        React.createElement('button', { className: 'btn btn-primary', onClick: () => {} }, 'Submit WebApp')
      )
    )
  );
}

function Hero({ stats }) {
  return React.createElement('section', { className: 'hero' },
    React.createElement('h1', null, '🚀 Universal WebApps Catalog'),
    React.createElement('p', null, 'Discover, explore and share the best open web applications from around the world'),
    React.createElement('div', { className: 'hero-actions' },
      React.createElement('button', { className: 'btn btn-primary', onClick: () => {} }, 'Explore Catalog'),
      React.createElement('button', { className: 'btn btn-secondary', onClick: () => {} }, '🎲 Surprise Me')
    )
  );
}

function TransparencyBanner() {
  return React.createElement('section', { className: 'transparency-banner' },
    React.createElement('h3', null, '💎 Our Commitment to Transparency'),
    React.createElement('p', null, 
      'Nexus Web Hub will introduce ',
      React.createElement('strong', null, 'optional premium features'),
      ' in the future to ensure sustainability. However, ',
      React.createElement('strong', null, 'the core catalog will always remain free'),
      ' and accessible to everyone.'
    ),
    React.createElement('p', null,
      React.createElement('strong', null, 'What we will NEVER do:'),
      ' Paid placement, advertising, or biased rankings. Your experience is never for sale.'
    ),
    React.createElement('div', { className: 'commitments' },
      React.createElement('div', { className: 'commitment-item' },
        React.createElement('span', { style: { color: 'var(--success)' } }, '✅'),
        React.createElement('span', null, 'Free catalog access forever')
      ),
      React.createElement('div', { className: 'commitment-item' },
        React.createElement('span', { style: { color: 'var(--success)' } }, '✅'),
        React.createElement('span', null, 'No paid placements')
      ),
      React.createElement('div', { className: 'commitment-item' },
        React.createElement('span', { style: { color: 'var(--success)' } }, '✅'),
        React.createElement('span', null, 'No advertising')
      ),
      React.createElement('div', { className: 'commitment-item' },
        React.createElement('span', { style: { color: 'var(--success)' } }, '✅'),
        React.createElement('span', null, 'Community-driven rankings')
      )
    )
  );
}

function StatsSection({ stats }) {
  return React.createElement('section', { className: 'stats-section', id: 'stats' },
    React.createElement('div', { className: 'stat-card' },
      React.createElement('div', { className: 'stat-number' }, stats.total_apps),
      React.createElement('div', { className: 'stat-label' }, 'WebApps')
    ),
    React.createElement('div', { className: 'stat-card' },
      React.createElement('div', { className: 'stat-number' }, stats.total_ratings),
      React.createElement('div', { className: 'stat-label' }, 'Ratings')
    ),
    React.createElement('div', { className: 'stat-card' },
      React.createElement('div', { className: 'stat-number' }, stats.total_reviews),
      React.createElement('div', { className: 'stat-label' }, 'Reviews')
    ),
    React.createElement('div', { className: 'stat-card' },
      React.createElement('div', { className: 'stat-number' }, stats.total_views),
      React.createElement('div', { className: 'stat-label' }, 'Total Views')
    )
  );
}

function SearchSection() {
  return React.createElement('section', { className: 'search-section', id: 'explore' },
    React.createElement('div', { className: 'search-bar' },
      React.createElement('input', {
        type: 'text',
        className: 'search-input',
        id: 'searchInput',
        placeholder: '🔍 Search WebApps...'
      }),
      React.createElement('button', { className: 'btn btn-primary', onClick: () => {} }, 'Search')
    ),
    React.createElement('div', { className: 'filters' },
      React.createElement('select', { className: 'filter-btn', id: 'typeFilter' },
        React.createElement('option', { value: '' }, 'All Types'),
        ...Object.entries(TOOL_TYPES).map(([value, label]) =>
          React.createElement('option', { key: value, value }, label)
        )
      ),
      React.createElement('select', { className: 'filter-btn', id: 'sortFilter' },
        React.createElement('option', { value: 'recent' }, '🆕 Recent'),
        React.createElement('option', { value: 'popular' }, '🔥 Popular'),
        React.createElement('option', { value: 'name' }, '🔤 Name')
      )
    )
  );
}

function WebAppCard({ app }) {
  const types = JSON.parse(app.types || '[]');
  const tags = JSON.parse(app.tags || '[]');
  
  return React.createElement('div', { className: 'webapp-card', 'data-id': app.id },
    React.createElement('div', { className: 'webapp-preview' },
      React.createElement('iframe', {
        src: app.url,
        sandbox: 'allow-scripts allow-same-origin',
        loading: 'lazy',
        title: app.name
      }),
      React.createElement('div', { className: 'preview-overlay' },
        React.createElement('div', { className: 'preview-hint' }, '👁️ Click for details')
      )
    ),
    React.createElement('div', { className: 'webapp-content' },
      React.createElement('div', { className: 'webapp-header' },
        React.createElement('h3', { className: 'webapp-title' }, app.name),
        React.createElement('div', { className: 'webapp-rating' },
          '⭐ ',
          app.rating_avg > 0 ? app.rating_avg.toFixed(1) : 'N/A'
        )
      ),
      React.createElement('div', { className: 'webapp-developer' }, 'by ', app.developer),
      React.createElement('p', { className: 'webapp-description' }, app.description_short),
      React.createElement('div', { className: 'webapp-types' },
        types.slice(0, 3).map(type =>
          React.createElement('span', { key: type, className: 'type-badge' }, 
            TOOL_TYPES[type] || type
          )
        )
      ),
      React.createElement('div', { className: 'webapp-tags' },
        tags.slice(0, 3).map(tag =>
          React.createElement('span', { key: tag, className: 'tag' }, tag)
        )
      ),
      React.createElement('div', { className: 'webapp-badges' },
        app.badges && app.badges.map(badge =>
          React.createElement('span', { key: badge, className: 'badge' }, 
            BADGE_ICONS[badge] || '🏅'
          )
        )
      ),
      React.createElement('div', { className: 'webapp-actions' },
        React.createElement('button', { 
          className: 'btn btn-primary',
          onClick: () => {}
        }, 'Open App'),
        React.createElement('button', { 
          className: 'btn btn-secondary',
          onClick: () => {}
        }, 'Details')
      )
    )
  );
}

function WebAppsGrid({ apps }) {
  if (apps.length === 0) {
    return React.createElement('div', { className: 'empty-state' },
      React.createElement('div', { style: { fontSize: '4rem', marginBottom: '1rem', opacity: 0.5 } }, '🔍'),
      React.createElement('h2', null, 'No WebApps Found'),
      React.createElement('p', null, 'Try adjusting your search or filters, or be the first to submit one!')
    );
  }
  
  return React.createElement('div', { className: 'webapps-grid' },
    apps.map(app => React.createElement(WebAppCard, { key: app.id, app }))
  );
}

function Footer() {
  return React.createElement('footer', { className: 'footer' },
    React.createElement('div', { className: 'container' },
      React.createElement('div', { className: 'footer-content' },
        React.createElement('div', { className: 'footer-section' },
          React.createElement('h3', null, '🌌 Nexus Web Hub'),
          React.createElement('p', null, 'Universal WebApps Catalog'),
          React.createElement('p', { className: 'tagline' }, 'Discover and share the best WebApps')
        ),
        React.createElement('div', { className: 'footer-section' },
          React.createElement('h4', null, 'Navigation'),
          React.createElement('ul', null,
            React.createElement('li', null, React.createElement('a', { href: '/' }, 'Home')),
            React.createElement('li', null, React.createElement('a', { href: '/explore' }, 'Explore')),
            React.createElement('li', null, React.createElement('a', { href: '/submit' }, 'Submit'))
          )
        ),
        React.createElement('div', { className: 'footer-section' },
          React.createElement('h4', null, 'Contact'),
          React.createElement('p', null, 
            '📧 ',
            React.createElement('a', { href: 'mailto:nexusstudio100@gmail.com' }, 'nexusstudio100@gmail.com')
          )
        )
      ),
      React.createElement('div', { className: 'footer-bottom' },
        React.createElement('p', null, 
          'Powered by ',
          React.createElement('strong', null, 'Nexus Studio')
        ),
        React.createElement('p', null, '© ', new Date().getFullYear(), ' Nexus Web Hub. All rights reserved.'),
        React.createElement('p', { className: 'tech' }, 'DAOUDA Abdoul Anzize - CEO')
      )
    )
  );
}

function HomePage({ stats, apps }) {
  return React.createElement(Layout, { title: 'Nexus Web Hub - Universal WebApps Catalog' },
    React.createElement(Header),
    React.createElement(Hero, { stats }),
    React.createElement(TransparencyBanner),
    React.createElement(StatsSection, { stats }),
    React.createElement(SearchSection),
    React.createElement(WebAppsGrid, { apps }),
    React.createElement(Footer)
  );
}

// ==========================================
// CSS STYLES
// ==========================================

const CSS_STYLES = `
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
  --space-xs: 0.5rem;
  --space-sm: 1rem;
  --space-md: 1.5rem;
  --space-lg: 2rem;
  --space-xl: 3rem;
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --shadow-sm: 0 2px 8px rgba(0, 0, 0, 0.3);
  --shadow-md: 0 4px 16px rgba(0, 0, 0, 0.4);
  --shadow-lg: 0 8px 32px rgba(0, 0, 0, 0.5);
  --glow-cyan: 0 0 20px rgba(0, 217, 255, 0.5);
  --glow-violet: 0 0 20px rgba(138, 43, 226, 0.5);
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
  padding: var(--space-md);
}

.header {
  background: rgba(26, 31, 58, 0.95);
  backdrop-filter: blur(10px);
  padding: var(--space-md);
  position: sticky;
  top: 0;
  z-index: 1000;
  box-shadow: var(--shadow-md);
  border-bottom: 1px solid rgba(0, 217, 255, 0.2);
}

.header .container {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-sm);
}

.logo {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  font-size: 1.5rem;
  font-weight: bold;
  background: linear-gradient(135deg, #4169E1 0%, #8A2BE2 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  cursor: pointer;
}

.nav-links {
  display: flex;
  gap: var(--space-md);
  align-items: center;
  flex-wrap: wrap;
}

.nav-links button {
  color: var(--text-primary);
  background: transparent;
  border: none;
  cursor: pointer;
  padding: var(--space-xs) var(--space-sm);
  border-radius: var(--radius-sm);
  font-size: 1rem;
  transition: all 0.3s;
}

.nav-links button:hover {
  background: rgba(0, 217, 255, 0.1);
  color: var(--accent-cyan);
}

.btn {
  padding: var(--space-xs) var(--space-md);
  border: none;
  border-radius: var(--radius-sm);
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
  box-shadow: var(--shadow-sm);
}

.btn-primary:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
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
  padding: var(--space-xl) var(--space-md);
  max-width: 1000px;
  margin: 0 auto;
}

.hero h1 {
  font-size: clamp(2rem, 5vw, 4rem);
  margin-bottom: var(--space-md);
  background: linear-gradient(135deg, #4169E1 0%, #8A2BE2 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.hero p {
  font-size: clamp(1rem, 2vw, 1.5rem);
  color: var(--text-secondary);
  margin-bottom: var(--space-lg);
}

.hero-actions {
  display: flex;
  gap: var(--space-md);
  justify-content: center;
  flex-wrap: wrap;
}

.transparency-banner {
  background: rgba(138, 43, 226, 0.1);
  border: 2px solid rgba(138, 43, 226, 0.3);
  border-radius: var(--radius-md);
  padding: var(--space-md);
  margin: var(--space-lg) auto;
  max-width: 1400px;
}

.transparency-banner h3 {
  color: var(--accent-violet);
  margin-bottom: var(--space-xs);
}

.transparency-banner p {
  color: var(--text-secondary);
  font-size: 0.95rem;
  margin-bottom: var(--space-sm);
}

.commitments {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: var(--space-sm);
  margin-top: var(--space-md);
}

.commitment-item {
  display: flex;
  align-items: start;
  gap: var(--space-xs);
  font-size: 0.9rem;
}

.stats-section {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: var(--space-lg);
  max-width: 1400px;
  margin: var(--space-xl) auto;
  padding: 0 var(--space-md);
}

.stat-card {
  background: var(--bg-card);
  border: 1px solid rgba(0, 217, 255, 0.2);
  border-radius: var(--radius-lg);
  padding: var(--space-lg);
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
  margin-top: var(--space-xs);
}

.search-section {
  max-width: 1400px;
  margin: var(--space-xl) auto;
  padding: 0 var(--space-md);
}

.search-bar {
  display: flex;
  gap: var(--space-sm);
  margin-bottom: var(--space-lg);
  flex-wrap: wrap;
}

.search-input {
  flex: 1;
  min-width: 250px;
  padding: var(--space-sm) var(--space-md);
  background: var(--bg-card);
  border: 2px solid rgba(0, 217, 255, 0.3);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  font-size: 1rem;
}

.search-input:focus {
  outline: none;
  border-color: var(--accent-cyan);
  box-shadow: var(--glow-cyan);
}

.filters {
  display: flex;
  gap: var(--space-sm);
  flex-wrap: wrap;
}

.filter-btn {
  padding: var(--space-xs) var(--space-md);
  background: var(--bg-card);
  border: 2px solid rgba(138, 43, 226, 0.3);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  cursor: pointer;
  font-size: 1rem;
}

.webapps-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: var(--space-lg);
  max-width: 1400px;
  margin: 0 auto;
  padding: 0 var(--space-md) var(--space-xl);
}

.webapp-card {
  background: var(--bg-card);
  border: 1px solid rgba(0, 217, 255, 0.2);
  border-radius: var(--radius-lg);
  overflow: hidden;
  transition: all 0.3s;
  cursor: pointer;
}

.webapp-card:hover {
  transform: translateY(-8px);
  box-shadow: var(--shadow-lg);
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
  width: 100%;
  height: 100%;
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
  cursor: pointer;
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
  transform: translateY(10px);
  transition: transform 0.3s;
}

.preview-overlay:hover .preview-hint {
  transform: translateY(0);
}

.webapp-content {
  padding: var(--space-md);
}

.webapp-header {
  display: flex;
  justify-content: space-between;
  align-items: start;
  margin-bottom: var(--space-xs);
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
  margin-bottom: var(--space-sm);
}

.webapp-description {
  color: var(--text-secondary);
  font-size: 0.95rem;
  margin-bottom: var(--space-md);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.webapp-types {
  display: flex;
  gap: var(--space-xs);
  flex-wrap: wrap;
  margin-bottom: var(--space-sm);
}

.type-badge {
  padding: 4px 10px;
  background: rgba(65, 105, 225, 0.2);
  border: 1px solid rgba(65, 105, 225, 0.4);
  border-radius: var(--radius-sm);
  font-size: 0.75rem;
  color: var(--accent-cyan);
}

.webapp-tags {
  display: flex;
  gap: var(--space-xs);
  flex-wrap: wrap;
  margin-bottom: var(--space-md);
}

.tag {
  padding: 4px 12px;
  background: rgba(0, 217, 255, 0.1);
  border: 1px solid rgba(0, 217, 255, 0.3);
  border-radius: var(--radius-sm);
  font-size: 0.8rem;
  color: var(--accent-cyan);
}

.webapp-badges {
  display: flex;
  gap: var(--space-xs);
  margin-bottom: var(--space-md);
}

.badge {
  font-size: 1.5rem;
}

.webapp-actions {
  display: flex;
  gap: var(--space-sm);
}

.webapp-actions .btn {
  flex: 1;
  text-align: center;
  padding: var(--space-xs);
  font-size: 0.9rem;
}

.empty-state {
  text-align: center;
  padding: var(--space-xl);
  color: var(--text-secondary);
}

.footer {
  background: var(--bg-secondary);
  border-top: 1px solid rgba(0, 217, 255, 0.2);
  padding: var(--space-xl) var(--space-md);
  margin-top: var(--space-xl);
}

.footer-content {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: var(--space-lg);
  margin-bottom: var(--space-lg);
}

.footer-section h3 {
  color: var(--accent-cyan);
  margin-bottom: var(--space-sm);
}

.footer-section h4 {
  color: var(--text-primary);
  margin-bottom: var(--space-sm);
}

.footer-section p {
  margin: var(--space-xs) 0;
  font-size: 0.9rem;
}

.footer-section .tagline {
  color: var(--text-secondary);
  font-size: 0.85rem;
}

.footer-section ul {
  list-style: none;
  padding: 0;
}

.footer-section ul li {
  margin: var(--space-xs) 0;
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
  padding-top: var(--space-lg);
  border-top: 1px solid rgba(0, 217, 255, 0.2);
}

.footer-bottom p {
  margin: var(--space-xs) 0;
  font-size: 0.9rem;
  color: var(--text-secondary);
}

.footer-bottom strong {
  color: var(--accent-cyan);
}

.footer-bottom .tech {
  color: var(--text-secondary);
  font-size: 0.8rem;
  margin-top: var(--space-sm);
}

@media (max-width: 768px) {
  .header .container {
    flex-direction: column;
    align-items: center;
  }
  
  .nav-links {
    width: 100%;
    justify-content: center;
  }
  
  .webapps-grid {
    grid-template-columns: 1fr;
  }
}
`;

// ==========================================
// CLIENT-SIDE JAVASCRIPT
// ==========================================

const CLIENT_SCRIPT = `
const API_BASE = window.location.origin;

// Search functionality
const searchInput = document.getElementById('searchInput');
if (searchInput) {
  searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  });
}

async function handleSearch() {
  const search = document.getElementById('searchInput').value;
  const type = document.getElementById('typeFilter').value;
  const sort = document.getElementById('sortFilter').value;
  
  const params = new URLSearchParams({
    status: 'approved',
    sort: sort || 'recent',
    limit: 100
  });
  
  if (type) params.append('types', type);
  if (search) params.append('search', search);
  
  try {
    const response = await fetch(API_BASE + '/api/webapps?' + params);
    const data = await response.json();
    
    if (data.success) {
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
    
    return '<div class="webapp-card" data-id="' + app.id + '"><div class="webapp-preview"><iframe src="' + app.url + '" sandbox="allow-scripts allow-same-origin" loading="lazy"></iframe><div class="preview-overlay"><div class="preview-hint">👁️ Click for details</div></div></div><div class="webapp-content"><div class="webapp-header"><h3 class="webapp-title">' + app.name + '</h3><div class="webapp-rating">⭐ ' + (app.rating_avg > 0 ? app.rating_avg.toFixed(1) : 'N/A') + '</div></div><div class="webapp-developer">by ' + app.developer + '</div><p class="webapp-description">' + app.description_short + '</p><div class="webapp-types">' + types.slice(0, 3).map(t => '<span class="type-badge">' + t + '</span>').join('') + '</div><div class="webapp-tags">' + tags.slice(0, 3).map(t => '<span class="tag">' + t + '</span>').join('') + '</div><div class="webapp-badges">' + badges.map(b => '<span class="badge">' + getBadgeIcon(b) + '</span>').join('') + '</div><div class="webapp-actions"><button class="btn btn-primary" onclick="window.open(\\'' + app.url + '\\', \\'_blank\\')">Open App</button><button class="btn btn-secondary" onclick="showDetails(\\'' + app.id + '\\')">Details</button></div></div></div>';
  }).join('');
}

function getBadgeIcon(badge) {
  const icons = {
    pioneer: '🏆',
    highly_rated: '⭐',
    popular: '🔥',
    open_source: '💻'
  };
  return icons[badge] || '🏅';
}

function showDetails(appId) {
  window.location.href = '/app/' + appId;
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

// Surprise Me
const surpriseBtn = document.querySelector('.hero-actions .btn-secondary');
if (surpriseBtn) {
  surpriseBtn.addEventListener('click', async () => {
    try {
      const response = await fetch(API_BASE + '/api/webapps?status=approved&limit=100');
      const data = await response.json();
      
      if (data.success && data.data.length > 0) {
        const random = data.data[Math.floor(Math.random() * data.data.length)];
        window.open(random.url, '_blank');
      }
    } catch (error) {
      console.error('Surprise error:', error);
    }
  });
}
`;

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
    
    const topApps = await db.execute(`
      SELECT w.id, w.name, w.views
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
// SSR ROUTES
// ==========================================

app.get('/', async (req, res) => {
  try {
    const statsResponse = await db.execute('SELECT COUNT(*) as total_apps FROM webapps WHERE status = "approved"');
    const ratingsResponse = await db.execute('SELECT COUNT(*) as total_ratings FROM ratings');
    const reviewsResponse = await db.execute('SELECT COUNT(*) as total_reviews FROM reviews');
    const viewsResponse = await db.execute('SELECT SUM(views) as total_views FROM webapps');
    
    const stats = {
      total_apps: statsResponse.rows[0].total_apps,
      total_ratings: ratingsResponse.rows[0].total_ratings,
      total_reviews: reviewsResponse.rows[0].total_reviews,
      total_views: viewsResponse.rows[0].total_views || 0
    };
    
    const appsResult = await db.execute({
      sql: 'SELECT * FROM webapps WHERE status = ? ORDER BY created_at DESC LIMIT 12',
      args: ['approved']
    });
    
    const apps = await Promise.all(appsResult.rows.map(async (app) => {
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
    
    const html = '<!DOCTYPE html>' + renderToString(
      React.createElement(HomePage, { stats, apps })
    );
    
    res.send(html);
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
║   ⚡ Stack: Node + Express + React SSR ║
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