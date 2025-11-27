// server.js - Backend Service for Nexus Web Hub
import { createClient } from '@libsql/client';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import {
  generateId,
  isValidEmail,
  validateWebappData,
  calculateTrustScore,
  checkBadgeEligibility,
  sanitizeText
} from './utils.js';

dotenv.config();

export class BackendService {
  constructor() {
    this.db = null;
    this.initialized = false;
  }

  async init() {
    try {
      // Connect to Turso
      this.db = createClient({
        url: process.env.DATABASE_URL,
        authToken: process.env.DATABASE_AUTH_TOKEN
      });

      console.log('[Backend] Connected to database');

      // Always try to create tables (IF NOT EXISTS handles existing tables)
      console.log('[Backend] Initializing database schema...');
      await this.createTables();
      
      this.initialized = true;
      console.log('[Backend] Service initialized successfully');
      
      // Display database info
      const stats = await this.getTableStats();
      console.log('[Backend] Database stats:', stats);
    } catch (error) {
      console.error('[Backend] Initialization failed:', error);
      console.error('[Backend] Make sure DATABASE_URL and DATABASE_AUTH_TOKEN are correct in .env');
      throw error;
    }
  }

  async getTableStats() {
    try {
      const users = await this.db.execute('SELECT COUNT(*) as count FROM users');
      const webapps = await this.db.execute('SELECT COUNT(*) as count FROM webapps');
      const reviews = await this.db.execute('SELECT COUNT(*) as count FROM reviews');
      
      return {
        users: users.rows[0].count,
        webapps: webapps.rows[0].count,
        reviews: reviews.rows[0].count
      };
    } catch (error) {
      return { users: 0, webapps: 0, reviews: 0 };
    }
  }

  async createTables() {
    console.log('[Backend] Creating tables (if not exists)...');
    
    // Users
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        name TEXT NOT NULL,
        username TEXT,
        role TEXT DEFAULT 'user',
        badges TEXT DEFAULT '[]',
        followers_count INTEGER DEFAULT 0,
        following_count INTEGER DEFAULT 0,
        last_login_at INTEGER,
        is_banned INTEGER DEFAULT 0,
        ban_reason TEXT,
        created_at INTEGER NOT NULL
      )
    `);
    console.log('[Backend] ✓ Users table ready');

    await this.db.execute(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`);

    // Webapps
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS webapps (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        developer TEXT NOT NULL,
        creator_id TEXT NOT NULL,
        description_short TEXT NOT NULL,
        description_long TEXT,
        url TEXT NOT NULL UNIQUE,
        github_url TEXT,
        video_url TEXT,
        image_url TEXT,
        category TEXT NOT NULL,
        tags TEXT DEFAULT '[]',
        avg_rating REAL DEFAULT 0,
        reviews_count INTEGER DEFAULT 0,
        views_count INTEGER DEFAULT 0,
        clicks_count INTEGER DEFAULT 0,
        is_trending INTEGER DEFAULT 0,
        is_featured INTEGER DEFAULT 0,
        is_new INTEGER DEFAULT 1,
        status TEXT DEFAULT 'approved',
        trust_score INTEGER DEFAULT 50,
        last_verified_at INTEGER,
        admin_notes TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    console.log('[Backend] ✓ Webapps table ready');

    await this.db.execute(`CREATE INDEX IF NOT EXISTS idx_webapps_category ON webapps(category)`);
    await this.db.execute(`CREATE INDEX IF NOT EXISTS idx_webapps_rating ON webapps(avg_rating DESC)`);
    await this.db.execute(`CREATE INDEX IF NOT EXISTS idx_webapps_created ON webapps(created_at DESC)`);
    await this.db.execute(`CREATE INDEX IF NOT EXISTS idx_webapps_creator ON webapps(creator_id)`);
    await this.db.execute(`CREATE INDEX IF NOT EXISTS idx_webapps_trending ON webapps(is_trending, views_count DESC)`);

    // Webapp Views (unique)
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS webapp_views (
        id TEXT PRIMARY KEY,
        webapp_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        viewed_at INTEGER NOT NULL,
        FOREIGN KEY (webapp_id) REFERENCES webapps(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(webapp_id, user_id)
      )
    `);
    console.log('[Backend] ✓ Webapp views table ready');

    await this.db.execute(`CREATE INDEX IF NOT EXISTS idx_webapp_views_webapp ON webapp_views(webapp_id)`);

    // Webapp Clicks
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS webapp_clicks (
        id TEXT PRIMARY KEY,
        webapp_id TEXT NOT NULL,
        user_id TEXT,
        source TEXT NOT NULL,
        clicked_at INTEGER NOT NULL,
        FOREIGN KEY (webapp_id) REFERENCES webapps(id) ON DELETE CASCADE
      )
    `);
    console.log('[Backend] ✓ Webapp clicks table ready');

    await this.db.execute(`CREATE INDEX IF NOT EXISTS idx_webapp_clicks_webapp ON webapp_clicks(webapp_id, clicked_at DESC)`);

    // Reviews
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS reviews (
        id TEXT PRIMARY KEY,
        webapp_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        rating INTEGER NOT NULL,
        comment TEXT,
        helpful_count INTEGER DEFAULT 0,
        not_helpful_count INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (webapp_id) REFERENCES webapps(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(webapp_id, user_id)
      )
    `);
    console.log('[Backend] ✓ Reviews table ready');

    await this.db.execute(`CREATE INDEX IF NOT EXISTS idx_reviews_webapp ON reviews(webapp_id, created_at DESC)`);

    // Review Replies
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS review_replies (
        id TEXT PRIMARY KEY,
        review_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (review_id) REFERENCES reviews(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    console.log('[Backend] ✓ Review replies table ready');

    // Review Votes
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS review_votes (
        id TEXT PRIMARY KEY,
        review_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        vote_type TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (review_id) REFERENCES reviews(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(review_id, user_id)
      )
    `);
    console.log('[Backend] ✓ Review votes table ready');

    // Reports
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS reports (
        id TEXT PRIMARY KEY,
        reporter_id TEXT NOT NULL,
        target_type TEXT NOT NULL,
        target_id TEXT NOT NULL,
        reason TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        admin_notes TEXT,
        created_at INTEGER NOT NULL,
        resolved_at INTEGER,
        FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    console.log('[Backend] ✓ Reports table ready');

    await this.db.execute(`CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status, created_at DESC)`);

    // Collections
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS collections (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        is_public INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    console.log('[Backend] ✓ Collections table ready');

    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS collection_items (
        id TEXT PRIMARY KEY,
        collection_id TEXT NOT NULL,
        webapp_id TEXT NOT NULL,
        added_at INTEGER NOT NULL,
        FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE,
        FOREIGN KEY (webapp_id) REFERENCES webapps(id) ON DELETE CASCADE,
        UNIQUE(collection_id, webapp_id)
      )
    `);
    console.log('[Backend] ✓ Collection items table ready');

    // Notifications
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        data TEXT,
        read INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    console.log('[Backend] ✓ Notifications table ready');

    await this.db.execute(`CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read, created_at DESC)`);

    // Follows
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS follows (
        id TEXT PRIMARY KEY,
        follower_id TEXT NOT NULL,
        following_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (follower_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (following_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(follower_id, following_id)
      )
    `);
    console.log('[Backend] ✓ Follows table ready');

    // Webapp Versions
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS webapp_versions (
        id TEXT PRIMARY KEY,
        webapp_id TEXT NOT NULL,
        version TEXT NOT NULL,
        changelog TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (webapp_id) REFERENCES webapps(id) ON DELETE CASCADE
      )
    `);
    console.log('[Backend] ✓ Webapp versions table ready');

    // Webapp Shares
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS webapp_shares (
        id TEXT PRIMARY KEY,
        webapp_id TEXT NOT NULL,
        user_id TEXT,
        method TEXT NOT NULL,
        shared_at INTEGER NOT NULL,
        FOREIGN KEY (webapp_id) REFERENCES webapps(id) ON DELETE CASCADE
      )
    `);
    console.log('[Backend] ✓ Webapp shares table ready');

    console.log('[Backend] All tables and indexes created successfully');
  }

  // Auth Methods
  async signup(data) {
    const { email, password, name } = data;

    // Validation
    if (!email || !password || !name) {
      throw new Error('Email, password and name are required');
    }

    if (!isValidEmail(email)) {
      throw new Error('Invalid email format');
    }

    if (password.length < 6) {
      throw new Error('Password must be at least 6 characters');
    }

    // Check if email already exists
    const existingUser = await this.db.execute('SELECT id FROM users WHERE email = ?', [email]);
    if (existingUser.rows.length > 0) {
      throw new Error('Email already registered');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);
    const userId = generateId('user');
    const now = Date.now();

    // Insert user with ALL required fields
    await this.db.execute(
      `INSERT INTO users (id, email, password_hash, name, role, badges, followers_count, following_count, is_banned, created_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, email, passwordHash, sanitizeText(name), 'user', '[]', 0, 0, 0, now]
    );

    // Generate JWT token
    const token = jwt.sign({ userId, email }, process.env.JWT_SECRET, { expiresIn: '30d' });

    return {
      success: true,
      token,
      user: { id: userId, email, name: sanitizeText(name), role: 'user', badges: [] }
    };
  }

  async login(data) {
    const { email, password } = data;

    // Validation
    if (!email || !password) {
      throw new Error('Email and password are required');
    }

    // Get user
    const result = await this.db.execute(
      'SELECT id, email, name, password_hash, role, badges FROM users WHERE email = ?',
      [email]
    );

    if (result.rows.length === 0) {
      throw new Error('Invalid credentials');
    }

    const user = result.rows[0];
    
    // Verify password
    const validPassword = await bcrypt.compare(password, user.password_hash);

    if (!validPassword) {
      throw new Error('Invalid credentials');
    }

    // Update last login
    await this.db.execute('UPDATE users SET last_login_at = ? WHERE id = ?', [Date.now(), user.id]);

    // Generate token
    const token = jwt.sign({ userId: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '30d' });

    return {
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        badges: JSON.parse(user.badges || '[]')
      }
    };
  }

  async getUser(userId) {
    const result = await this.db.execute(
      'SELECT id, email, name, username, role, badges, followers_count, following_count, created_at FROM users WHERE id = ?',
      [userId]
    );

    if (result.rows.length === 0) {
      throw new Error('User not found');
    }

    const user = result.rows[0];
    return {
      success: true,
      user: {
        ...user,
        badges: JSON.parse(user.badges || '[]')
      }
    };
  }

  // Webapp Methods
  async getWebapps(filters = {}) {
    let query = 'SELECT * FROM webapps WHERE status = "approved"';
    const params = [];

    if (filters.category && filters.category !== 'all') {
      query += ' AND category = ?';
      params.push(filters.category);
    }

    if (filters.search) {
      query += ' AND (name LIKE ? OR description_short LIKE ?)';
      params.push(`%${filters.search}%`, `%${filters.search}%`);
    }

    if (filters.sort === 'trending') {
      query += ' AND is_trending = 1 ORDER BY views_count DESC';
    } else if (filters.sort === 'new') {
      query += ' ORDER BY created_at DESC';
    } else if (filters.sort === 'top') {
      query += ' ORDER BY avg_rating DESC, reviews_count DESC';
    } else {
      query += ' ORDER BY created_at DESC';
    }

    query += ' LIMIT 100';

    const result = await this.db.execute(query, params);

    return {
      success: true,
      webapps: result.rows.map(w => ({
        ...w,
        tags: JSON.parse(w.tags || '[]')
      }))
    };
  }

  async getWebapp(id, userId = null) {
    const result = await this.db.execute('SELECT * FROM webapps WHERE id = ?', [id]);

    if (result.rows.length === 0) {
      throw new Error('Webapp not found');
    }

    const webapp = result.rows[0];

    // Track unique view if user connected
    if (userId) {
      try {
        await this.db.execute(
          'INSERT OR IGNORE INTO webapp_views (id, webapp_id, user_id, viewed_at) VALUES (?, ?, ?, ?)',
          [generateId(), id, userId, Date.now()]
        );

        // Update view count
        const viewCount = await this.db.execute('SELECT COUNT(*) as count FROM webapp_views WHERE webapp_id = ?', [id]);
        await this.db.execute('UPDATE webapps SET views_count = ? WHERE id = ?', [viewCount.rows[0].count, id]);
      } catch (error) {
        console.log('[Backend] View tracking error:', error.message);
      }
    }

    // Get reviews
    const reviews = await this.db.execute(
      `SELECT r.*, u.name as user_name FROM reviews r 
       INNER JOIN users u ON r.user_id = u.id 
       WHERE r.webapp_id = ? 
       ORDER BY r.created_at DESC`,
      [id]
    );

    return {
      success: true,
      webapp: {
        ...webapp,
        tags: JSON.parse(webapp.tags || '[]')
      },
      reviews: reviews.rows
    };
  }

  async createWebapp(data, userId) {
    const validation = validateWebappData(data);
    if (!validation.valid) {
      throw new Error(validation.errors.join(', '));
    }

    const user = await this.db.execute('SELECT * FROM users WHERE id = ?', [userId]);
    if (user.rows.length === 0) {
      throw new Error('User not found');
    }

    const trustScore = calculateTrustScore(data, user.rows[0]);
    const status = trustScore < 30 ? 'pending_review' : 'approved';

    const webappId = generateId('webapp');
    const now = Date.now();

    await this.db.execute(
      `INSERT INTO webapps (
        id, name, developer, creator_id, description_short, description_long,
        url, github_url, video_url, image_url, category, tags,
        status, trust_score, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        webappId,
        sanitizeText(data.name),
        sanitizeText(data.developer || user.rows[0].name),
        userId,
        sanitizeText(data.description_short),
        sanitizeText(data.description_long || ''),
        data.url,
        data.github_url || null,
        data.video_url || null,
        data.image_url || null,
        data.category,
        JSON.stringify(data.tags || []),
        status,
        trustScore,
        now,
        now
      ]
    );

    return {
      success: true,
      webapp: { id: webappId, status, trust_score: trustScore }
    };
  }

  async updateWebapp(id, data, userId) {
    const webapp = await this.db.execute('SELECT creator_id FROM webapps WHERE id = ?', [id]);
    
    if (webapp.rows.length === 0) {
      throw new Error('Webapp not found');
    }

    if (webapp.rows[0].creator_id !== userId) {
      throw new Error('Unauthorized');
    }

    const validation = validateWebappData(data);
    if (!validation.valid) {
      throw new Error(validation.errors.join(', '));
    }

    await this.db.execute(
      `UPDATE webapps SET 
        name = ?, description_short = ?, description_long = ?,
        url = ?, github_url = ?, video_url = ?, image_url = ?,
        category = ?, tags = ?, updated_at = ?
      WHERE id = ?`,
      [
        sanitizeText(data.name),
        sanitizeText(data.description_short),
        sanitizeText(data.description_long || ''),
        data.url,
        data.github_url || null,
        data.video_url || null,
        data.image_url || null,
        data.category,
        JSON.stringify(data.tags || []),
        Date.now(),
        id
      ]
    );

    // Save version if provided
    if (data.version && data.changelog) {
      await this.db.execute(
        'INSERT INTO webapp_versions (id, webapp_id, version, changelog, created_at) VALUES (?, ?, ?, ?, ?)',
        [generateId(), id, data.version, sanitizeText(data.changelog), Date.now()]
      );
    }

    return { success: true };
  }

  async deleteWebapp(id, userId, password) {
    const webapp = await this.db.execute('SELECT creator_id FROM webapps WHERE id = ?', [id]);
    
    if (webapp.rows.length === 0) {
      throw new Error('Webapp not found');
    }

    if (webapp.rows[0].creator_id !== userId) {
      throw new Error('Unauthorized');
    }

    // Verify password
    const user = await this.db.execute('SELECT password_hash FROM users WHERE id = ?', [userId]);
    const validPassword = await bcrypt.compare(password, user.rows[0].password_hash);

    if (!validPassword) {
      throw new Error('Invalid password');
    }

    await this.db.execute('DELETE FROM webapps WHERE id = ?', [id]);

    return { success: true };
  }

  async trackClick(webappId, userId, source) {
    await this.db.execute(
      'INSERT INTO webapp_clicks (id, webapp_id, user_id, source, clicked_at) VALUES (?, ?, ?, ?, ?)',
      [generateId(), webappId, userId, source, Date.now()]
    );

    await this.db.execute(
      'UPDATE webapps SET clicks_count = clicks_count + 1 WHERE id = ?',
      [webappId]
    );

    return { success: true };
  }

  // Review Methods
  async createReview(webappId, data, userId) {
    if (data.rating < 1 || data.rating > 5) {
      throw new Error('Rating must be between 1 and 5');
    }

    const reviewId = generateId('review');

    await this.db.execute(
      'INSERT OR REPLACE INTO reviews (id, webapp_id, user_id, rating, comment, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [reviewId, webappId, userId, data.rating, sanitizeText(data.comment || ''), Date.now()]
    );

    // Recalculate average rating
    const avgResult = await this.db.execute(
      'SELECT AVG(rating) as avg, COUNT(*) as count FROM reviews WHERE webapp_id = ?',
      [webappId]
    );

    await this.db.execute(
      'UPDATE webapps SET avg_rating = ?, reviews_count = ? WHERE id = ?',
      [avgResult.rows[0].avg, avgResult.rows[0].count, webappId]
    );

    return { success: true, review: { id: reviewId } };
  }

  // Report Methods
  async createReport(data, userId) {
    const reportId = generateId('report');

    await this.db.execute(
      'INSERT INTO reports (id, reporter_id, target_type, target_id, reason, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [reportId, userId, data.target_type, data.target_id, sanitizeText(data.reason), Date.now()]
    );

    return { success: true, report: { id: reportId } };
  }

  // Admin Methods
  async adminLogin(email, password) {
    if (email !== process.env.ADMIN_EMAIL || password !== process.env.ADMIN_PASSWORD) {
      throw new Error('Invalid admin credentials');
    }

    return { success: true, message: 'Admin authenticated' };
  }

  async getReports() {
    const result = await this.db.execute(
      `SELECT r.*, u.name as reporter_name, w.name as webapp_name 
       FROM reports r 
       LEFT JOIN users u ON r.reporter_id = u.id 
       LEFT JOIN webapps w ON r.target_id = w.id AND r.target_type = 'webapp'
       ORDER BY r.created_at DESC`
    );

    return { success: true, reports: result.rows };
  }

  async resolveReport(reportId, adminNotes) {
    await this.db.execute(
      'UPDATE reports SET status = "resolved", admin_notes = ?, resolved_at = ? WHERE id = ?',
      [adminNotes, Date.now(), reportId]
    );

    return { success: true };
  }

  async adminDeleteWebapp(id) {
    await this.db.execute('DELETE FROM webapps WHERE id = ?', [id]);
    return { success: true };
  }

  async getAllWebapps() {
    const result = await this.db.execute(
      'SELECT w.*, u.name as creator_name FROM webapps w INNER JOIN users u ON w.creator_id = u.id ORDER BY w.created_at DESC'
    );

    return {
      success: true,
      webapps: result.rows.map(w => ({
        ...w,
        tags: JSON.parse(w.tags || '[]')
      }))
    };
  }

  // Stats
  async getStats() {
    const webappsCount = await this.db.execute('SELECT COUNT(*) as count FROM webapps WHERE status = "approved"');
    const usersCount = await this.db.execute('SELECT COUNT(*) as count FROM users');
    const reviewsCount = await this.db.execute('SELECT COUNT(*) as count FROM reviews');

    return {
      success: true,
      stats: {
        webapps: webappsCount.rows[0].count,
        creators: usersCount.rows[0].count,
        reviews: reviewsCount.rows[0].count
      }
    };
  }

  async healthCheck() {
    return {
      success: true,
      status: 'healthy',
      timestamp: Date.now()
    };
  }
}