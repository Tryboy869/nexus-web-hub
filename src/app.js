// ==========================================
// NEXUS WEB HUB - BACKEND COMPLET
// Architecture: Node.js + Express + Turso
// Version: 1.0.0 - Production Ready
// ==========================================

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createClient } from '@libsql/client';
import fetch from 'node-fetch';
import puppeteer from 'puppeteer';
import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// ==========================================
// MIDDLEWARE CONFIGURATION
// ==========================================

// CRITICAL: Trust proxy for Render/Railway/Fly.io deployments
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

// Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // max 100 requests par IP
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
    // Table: webapps
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
        status TEXT DEFAULT 'pending',
        views INTEGER DEFAULT 0,
        created_at INTEGER DEFAULT (unixepoch()),
        updated_at INTEGER DEFAULT (unixepoch())
      )
    `);
    
    // Table: ratings
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
    
    // Table: reviews
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
    
    // Table: badges
    await db.execute(`
      CREATE TABLE IF NOT EXISTS badges (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        webapp_id TEXT NOT NULL,
        badge_type TEXT NOT NULL,
        earned_at INTEGER DEFAULT (unixepoch()),
        FOREIGN KEY (webapp_id) REFERENCES webapps(id)
      )
    `);
    
    // Indexes pour performance
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_webapps_status ON webapps(status)`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_webapps_type ON webapps(type)`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_ratings_webapp ON ratings(webapp_id)`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_reviews_webapp ON reviews(webapp_id)`);
    
    console.log('✅ Database initialized successfully');
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
  description_long: z.string().min(50).max(2000).optional(),
  video_url: z.string().url().optional(),
  github_url: z.string().url().optional(),
  type: z.enum(['game', 'tool', 'api', 'design', 'productivity', 'education', 'social', 'other']),
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
      timeout: 5000,
      redirect: 'follow'
    });
    return response.ok;
  } catch (error) {
    return false;
  }
}

async function captureScreenshot(url) {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 800 });
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 10000 });
    
    const screenshot = await page.screenshot({ 
      encoding: 'base64',
      fullPage: false
    });
    
    return `data:image/png;base64,${screenshot}`;
  } catch (error) {
    console.error('Screenshot failed:', error);
    return null;
  } finally {
    if (browser) await browser.close();
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
  
  // Badge: First Submission
  const isFirst = await db.execute({
    sql: 'SELECT COUNT(*) as count FROM webapps WHERE status = "approved"',
    args: []
  });
  
  if (isFirst.rows[0].count === 1) {
    badges.push('pioneer');
  }
  
  // Badge: Highly Rated (4.5+ stars)
  const rating = await calculateRating(webappId);
  if (rating.average >= 4.5 && rating.total >= 10) {
    badges.push('highly_rated');
  }
  
  // Badge: Popular (100+ views)
  const webapp = await db.execute({
    sql: 'SELECT views FROM webapps WHERE id = ?',
    args: [webappId]
  });
  
  if (webapp.rows[0]?.views >= 100) {
    badges.push('popular');
  }
  
  // Badge: Open Source
  const hasGithub = await db.execute({
    sql: 'SELECT github_url FROM webapps WHERE id = ? AND github_url IS NOT NULL',
    args: [webappId]
  });
  
  if (hasGithub.rows.length > 0) {
    badges.push('open_source');
  }
  
  // Insert badges
  for (const badge of badges) {
    await db.execute({
      sql: 'INSERT OR IGNORE INTO badges (webapp_id, badge_type) VALUES (?, ?)',
      args: [webappId, badge]
    });
  }
  
  return badges;
}

// ==========================================
// API ROUTES
// ==========================================

// Health Check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    version: '1.0.0',
    timestamp: Date.now()
  });
});

// Get all webapps (with filters)
app.get('/api/webapps', async (req, res) => {
  try {
    const { 
      status = 'approved', 
      type, 
      tag, 
      search, 
      sort = 'recent',
      limit = 50,
      offset = 0
    } = req.query;
    
    let sql = 'SELECT * FROM webapps WHERE status = ?';
    const args = [status];
    
    if (type) {
      sql += ' AND type = ?';
      args.push(type);
    }
    
    if (tag) {
      sql += ' AND tags LIKE ?';
      args.push(`%${tag}%`);
    }
    
    if (search) {
      sql += ' AND (name LIKE ? OR description_short LIKE ?)';
      args.push(`%${search}%`, `%${search}%`);
    }
    
    // Sorting
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
    
    // Enrichir avec ratings et badges
    const enriched = await Promise.all(result.rows.map(async (app) => {
      const rating = await calculateRating(app.id);
      const badges = await db.execute({
        sql: 'SELECT badge_type FROM badges WHERE webapp_id = ?',
        args: [app.id]
      });
      
      return {
        ...app,
        tags: JSON.parse(app.tags),
        rating: rating.average,
        rating_count: rating.total,
        badges: badges.rows.map(b => b.badge_type)
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

// Get single webapp
app.get('/api/webapps/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Increment views
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
    
    // Get rating
    const rating = await calculateRating(id);
    
    // Get reviews
    const reviews = await db.execute({
      sql: 'SELECT * FROM reviews WHERE webapp_id = ? ORDER BY created_at DESC LIMIT 10',
      args: [id]
    });
    
    // Get badges
    const badges = await db.execute({
      sql: 'SELECT badge_type FROM badges WHERE webapp_id = ?',
      args: [id]
    });
    
    res.json({
      success: true,
      data: {
        ...app,
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

// Submit new webapp
app.post('/api/webapps/submit', async (req, res) => {
  try {
    // Validation
    const validated = WebAppSchema.parse(req.body);
    
    // Check URL accessibility
    const isAccessible = await checkUrlAccessibility(validated.url);
    if (!isAccessible) {
      return res.status(400).json({ 
        success: false, 
        error: 'URL is not accessible. Please check and try again.' 
      });
    }
    
    // Check duplicate
    const isDuplicate = await checkDuplicate(validated.url);
    if (isDuplicate) {
      return res.status(409).json({ 
        success: false, 
        error: 'This WebApp is already in our catalog.' 
      });
    }
    
    // Generate ID
    const id = generateId();
    
    // Capture screenshot
    console.log('📸 Capturing screenshot...');
    const screenshot = await captureScreenshot(validated.url);
    
    // Insert into database
    await db.execute({
      sql: `INSERT INTO webapps (
        id, name, developer, url, description_short, description_long,
        video_url, github_url, screenshot_url, type, tags, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        id,
        validated.name,
        validated.developer,
        validated.url,
        validated.description_short,
        validated.description_long || null,
        validated.video_url || null,
        validated.github_url || null,
        screenshot || null,
        validated.type,
        JSON.stringify(validated.tags),
        'pending' // Auto-approve can be enabled later
      ]
    });
    
    res.json({
      success: true,
      message: 'WebApp submitted successfully! It will be reviewed shortly.',
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

// Submit rating
app.post('/api/ratings', async (req, res) => {
  try {
    const validated = RatingSchema.parse(req.body);
    const userIp = getClientIp(req);
    
    // Check if webapp exists
    const webapp = await db.execute({
      sql: 'SELECT id FROM webapps WHERE id = ? AND status = "approved"',
      args: [validated.webapp_id]
    });
    
    if (webapp.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'WebApp not found' });
    }
    
    // Insert or update rating
    await db.execute({
      sql: `INSERT INTO ratings (webapp_id, user_ip, rating) 
            VALUES (?, ?, ?)
            ON CONFLICT(webapp_id, user_ip) 
            DO UPDATE SET rating = ?, created_at = unixepoch()`,
      args: [validated.webapp_id, userIp, validated.rating, validated.rating]
    });
    
    // Award badges if necessary
    await awardBadges(validated.webapp_id);
    
    // Return updated rating
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

// Submit review
app.post('/api/reviews', async (req, res) => {
  try {
    const validated = ReviewSchema.parse(req.body);
    const userIp = getClientIp(req);
    
    // Check if webapp exists
    const webapp = await db.execute({
      sql: 'SELECT id FROM webapps WHERE id = ? AND status = "approved"',
      args: [validated.webapp_id]
    });
    
    if (webapp.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'WebApp not found' });
    }
    
    // Insert review
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

// Get stats
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
// ADMIN ROUTES (Basic - Add auth later)
// ==========================================

app.post('/api/admin/approve/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    await db.execute({
      sql: 'UPDATE webapps SET status = "approved", updated_at = unixepoch() WHERE id = ?',
      args: [id]
    });
    
    res.json({ success: true, message: 'WebApp approved' });
  } catch (error) {
    console.error('Error approving webapp:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

app.post('/api/admin/reject/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    await db.execute({
      sql: 'UPDATE webapps SET status = "rejected", updated_at = unixepoch() WHERE id = ?',
      args: [id]
    });
    
    res.json({ success: true, message: 'WebApp rejected' });
  } catch (error) {
    console.error('Error rejecting webapp:', error);
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
║   🌌 NEXUS WEB HUB - Backend Ready    ║
║                                        ║
║   🚀 Server: http://localhost:${PORT}   ║
║   📊 Status: Production Ready          ║
║   🗄️  Database: Turso (Connected)      ║
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