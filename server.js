// server.js - Backend Service for Nexus Web Hub
// Logique métier complète avec Notifications, Collections, Versions

import { createClient } from '@libsql/client';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import {
  generateId,
  validateWebappData,
  calculateTrustScore,
  parseTags,
  checkBadgeEligibility,
  sanitizeString
} from './utils.js';

dotenv.config();

export class BackendService {
  constructor() {
    this.db = null;
    this.initialized = false;
  }

  async init() {
    this.db = createClient({
      url: process.env.DATABASE_URL,
      authToken: process.env.DATABASE_AUTH_TOKEN
    });

    await this.initSchema();
    this.initialized = true;
    console.log('[Backend] Initialized successfully');
  }

  async initSchema() {
    const shouldReset = process.env.RESET_DB === 'true';

    if (shouldReset) {
      console.log('[Backend] RESETTING DATABASE...');
      await this.dropAllTables();
    }

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

    // Webapps
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS webapps (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        developer TEXT NOT NULL,
        creator_id TEXT NOT NULL,
        description_short TEXT NOT NULL,
        description_long TEXT,
        url TEXT UNIQUE NOT NULL,
        github_url TEXT,
        video_url TEXT,
        image_url TEXT,
        category TEXT NOT NULL,
        tags TEXT DEFAULT '[]',
        avg_rating REAL DEFAULT 0,
        reviews_count INTEGER DEFAULT 0,
        views_count INTEGER DEFAULT 0,
        clicks_count INTEGER DEFAULT 0,
        shares_count INTEGER DEFAULT 0,
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

    // Webapp views
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

    // Webapp clicks
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

    // Webapp shares
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

    // Review replies
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

    // Review votes
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

    // Collection items
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

    // Webapp versions
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

    await this.createIndexes();
    console.log('[Backend] Database schema initialized');
  }

  async createIndexes() {
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_webapps_category ON webapps(category)',
      'CREATE INDEX IF NOT EXISTS idx_webapps_rating ON webapps(avg_rating DESC)',
      'CREATE INDEX IF NOT EXISTS idx_webapps_created ON webapps(created_at DESC)',
      'CREATE INDEX IF NOT EXISTS idx_webapps_creator ON webapps(creator_id)',
      'CREATE INDEX IF NOT EXISTS idx_webapps_trending ON webapps(is_trending, views_count DESC)',
      'CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status, created_at DESC)',
      'CREATE INDEX IF NOT EXISTS idx_webapp_views_webapp ON webapp_views(webapp_id)',
      'CREATE INDEX IF NOT EXISTS idx_webapp_clicks_webapp ON webapp_clicks(webapp_id, clicked_at DESC)',
      'CREATE INDEX IF NOT EXISTS idx_reviews_webapp ON reviews(webapp_id, created_at DESC)',
      'CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read, created_at DESC)',
      'CREATE INDEX IF NOT EXISTS idx_follows_follower ON follows(follower_id)',
      'CREATE INDEX IF NOT EXISTS idx_follows_following ON follows(following_id)',
      'CREATE INDEX IF NOT EXISTS idx_collection_items_collection ON collection_items(collection_id)',
      'CREATE INDEX IF NOT EXISTS idx_webapp_versions_webapp ON webapp_versions(webapp_id, created_at DESC)'
    ];

    for (const indexSQL of indexes) {
      await this.db.execute(indexSQL);
    }
  }

  async dropAllTables() {
    const tables = [
      'webapp_versions', 'notifications', 'follows', 'collection_items',
      'collections', 'reports', 'review_votes', 'review_replies', 'reviews',
      'webapp_shares', 'webapp_clicks', 'webapp_views', 'webapps', 'users'
    ];

    for (const table of tables) {
      await this.db.execute(`DROP TABLE IF EXISTS ${table}`);
    }
  }

  // AUTH
  async signup(data) {
    const { email, password, name } = data;

    const existing = await this.db.execute({
      sql: 'SELECT id FROM users WHERE email = ?',
      args: [email]
    });

    if (existing.rows.length > 0) {
      throw new Error('Email already registered');
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = {
      id: generateId('user'),
      email,
      password_hash: passwordHash,
      name,
      username: null,
      role: 'user',
      badges: '[]',
      created_at: Date.now()
    };

    await this.db.execute({
      sql: `INSERT INTO users (id, email, password_hash, name, username, role, badges, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [user.id, user.email, user.password_hash, user.name, user.username, user.role, user.badges, user.created_at]
    });

    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    return {
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        badges: JSON.parse(user.badges)
      }
    };
  }

  async login(data) {
    const { email, password } = data;

    const result = await this.db.execute({
      sql: 'SELECT * FROM users WHERE email = ?',
      args: [email]
    });

    if (result.rows.length === 0) {
      throw new Error('Invalid credentials');
    }

    const user = result.rows[0];

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      throw new Error('Invalid credentials');
    }

    if (user.is_banned === 1) {
      throw new Error('Account banned: ' + (user.ban_reason || 'No reason provided'));
    }

    await this.db.execute({
      sql: 'UPDATE users SET last_login_at = ? WHERE id = ?',
      args: [Date.now(), user.id]
    });

    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    return {
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        badges: JSON.parse(user.badges)
      }
    };
  }

  async getUser(userId) {
    const result = await this.db.execute({
      sql: 'SELECT id, email, name, username, role, badges, followers_count, following_count, created_at FROM users WHERE id = ?',
      args: [userId]
    });

    if (result.rows.length === 0) {
      throw new Error('User not found');
    }

    const user = result.rows[0];
    return {
      success: true,
      user: {
        ...user,
        badges: JSON.parse(user.badges)
      }
    };
  }

  // WEBAPPS
  async getWebapps(query = {}) {
    let sql = 'SELECT * FROM webapps WHERE status = "approved"';
    const args = [];

    if (query.category && query.category !== 'all') {
      sql += ' AND category = ?';
      args.push(query.category);
    }

    if (query.trending === 'true') {
      sql += ' AND is_trending = 1';
    }

    if (query.new === 'true') {
      sql += ' AND is_new = 1';
    }

    if (query.search) {
      sql += ' AND (name LIKE ? OR description_short LIKE ? OR tags LIKE ?)';
      const searchTerm = `%${query.search}%`;
      args.push(searchTerm, searchTerm, searchTerm);
    }

    if (query.sort === 'rating') {
      sql += ' ORDER BY avg_rating DESC, reviews_count DESC';
    } else if (query.sort === 'new') {
      sql += ' ORDER BY created_at DESC';
    } else if (query.sort === 'trending') {
      sql += ' ORDER BY views_count DESC, clicks_count DESC';
    } else {
      sql += ' ORDER BY created_at DESC';
    }

    const limit = parseInt(query.limit) || 50;
    sql += ` LIMIT ${limit}`;

    const result = await this.db.execute({ sql, args });

    return {
      success: true,
      webapps: result.rows.map(w => ({
        ...w,
        tags: JSON.parse(w.tags)
      }))
    };
  }

  async getWebappById(id, userId = null) {
    const result = await this.db.execute({
      sql: 'SELECT * FROM webapps WHERE id = ?',
      args: [id]
    });

    if (result.rows.length === 0) {
      throw new Error('Webapp not found');
    }

    const webapp = result.rows[0];

    if (userId) {
      try {
        await this.db.execute({
          sql: 'INSERT OR IGNORE INTO webapp_views (id, webapp_id, user_id, viewed_at) VALUES (?, ?, ?, ?)',
          args: [generateId('view'), id, userId, Date.now()]
        });

        const viewsResult = await this.db.execute({
          sql: 'SELECT COUNT(*) as count FROM webapp_views WHERE webapp_id = ?',
          args: [id]
        });
        const viewsCount = viewsResult.rows[0].count;

        await this.db.execute({
          sql: 'UPDATE webapps SET views_count = ? WHERE id = ?',
          args: [viewsCount, id]
        });
      } catch (error) {
        console.error('Error tracking view:', error);
      }
    }

    const reviewsResult = await this.db.execute({
      sql: `SELECT r.*, u.name as user_name
            FROM reviews r
            JOIN users u ON r.user_id = u.id
            WHERE r.webapp_id = ?
            ORDER BY r.created_at DESC`,
      args: [id]
    });

    return {
      success: true,
      webapp: {
        ...webapp,
        tags: JSON.parse(webapp.tags)
      },
      reviews: reviewsResult.rows
    };
  }

  async createWebapp(data, userId) {
    const validation = validateWebappData(data);
    if (!validation.valid) {
      throw new Error(validation.errors.join(', '));
    }

    const creatorResult = await this.db.execute({
      sql: 'SELECT * FROM users WHERE id = ?',
      args: [userId]
    });
    const creator = creatorResult.rows[0];

    const trustScore = calculateTrustScore(data, creator);
    const tags = parseTags(data.tags);

    const webapp = {
      id: generateId('webapp'),
      name: sanitizeString(data.name),
      developer: data.developer || creator.name,
      creator_id: userId,
      description_short: sanitizeString(data.description_short),
      description_long: sanitizeString(data.description_long || ''),
      url: data.url,
      github_url: data.github_url || null,
      video_url: data.video_url || null,
      image_url: data.image_url || null,
      category: data.category,
      tags: JSON.stringify(tags),
      status: trustScore >= 30 ? 'approved' : 'pending_review',
      trust_score: trustScore,
      created_at: Date.now(),
      updated_at: Date.now()
    };

    await this.db.execute({
      sql: `INSERT INTO webapps (id, name, developer, creator_id, description_short, description_long,
            url, github_url, video_url, image_url, category, tags, status, trust_score, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        webapp.id, webapp.name, webapp.developer, webapp.creator_id, webapp.description_short,
        webapp.description_long, webapp.url, webapp.github_url, webapp.video_url, webapp.image_url,
        webapp.category, webapp.tags, webapp.status, webapp.trust_score, webapp.created_at, webapp.updated_at
      ]
    });

    return {
      success: true,
      webapp: {
        ...webapp,
        tags: JSON.parse(webapp.tags)
      }
    };
  }

  async updateWebapp(id, data, userId) {
    const existing = await this.db.execute({
      sql: 'SELECT creator_id FROM webapps WHERE id = ?',
      args: [id]
    });

    if (existing.rows.length === 0) {
      throw new Error('Webapp not found');
    }

    if (existing.rows[0].creator_id !== userId) {
      throw new Error('Unauthorized');
    }

    const validation = validateWebappData(data);
    if (!validation.valid) {
      throw new Error(validation.errors.join(', '));
    }

    const tags = parseTags(data.tags);

    await this.db.execute({
      sql: `UPDATE webapps SET
            name = ?, description_short = ?, description_long = ?, url = ?,
            github_url = ?, video_url = ?, image_url = ?, category = ?, tags = ?, updated_at = ?
            WHERE id = ?`,
      args: [
        sanitizeString(data.name),
        sanitizeString(data.description_short),
        sanitizeString(data.description_long || ''),
        data.url,
        data.github_url || null,
        data.video_url || null,
        data.image_url || null,
        data.category,
        JSON.stringify(tags),
        Date.now(),
        id
      ]
    });

    if (data.version && data.changelog) {
      await this.db.execute({
        sql: 'INSERT INTO webapp_versions (id, webapp_id, version, changelog, created_at) VALUES (?, ?, ?, ?, ?)',
        args: [generateId('version'), id, data.version, data.changelog, Date.now()]
      });
    }

    return { success: true };
  }

  async deleteWebapp(id, userId, password) {
    const existing = await this.db.execute({
      sql: 'SELECT w.creator_id, u.password_hash FROM webapps w JOIN users u ON w.creator_id = u.id WHERE w.id = ?',
      args: [id]
    });

    if (existing.rows.length === 0) {
      throw new Error('Webapp not found');
    }

    const webapp = existing.rows[0];

    if (webapp.creator_id !== userId) {
      throw new Error('Unauthorized');
    }

    const validPassword = await bcrypt.compare(password, webapp.password_hash);
    if (!validPassword) {
      throw new Error('Invalid password');
    }

    await this.db.execute({
      sql: 'DELETE FROM webapps WHERE id = ?',
      args: [id]
    });

    return { success: true };
  }

  async trackClick(id, userId = null, source = 'direct') {
    await this.db.execute({
      sql: 'INSERT INTO webapp_clicks (id, webapp_id, user_id, source, clicked_at) VALUES (?, ?, ?, ?, ?)',
      args: [generateId('click'), id, userId, source, Date.now()]
    });

    const clicksResult = await this.db.execute({
      sql: 'SELECT COUNT(*) as count FROM webapp_clicks WHERE webapp_id = ?',
      args: [id]
    });
    const clicksCount = clicksResult.rows[0].count;

    await this.db.execute({
      sql: 'UPDATE webapps SET clicks_count = ? WHERE id = ?',
      args: [clicksCount, id]
    });

    return { success: true };
  }

  async trackShare(id, userId = null, method = 'copy_link') {
    await this.db.execute({
      sql: 'INSERT INTO webapp_shares (id, webapp_id, user_id, method, shared_at) VALUES (?, ?, ?, ?, ?)',
      args: [generateId('share'), id, userId, method, Date.now()]
    });

    const sharesResult = await this.db.execute({
      sql: 'SELECT COUNT(*) as count FROM webapp_shares WHERE webapp_id = ?',
      args: [id]
    });
    const sharesCount = sharesResult.rows[0].count;

    await this.db.execute({
      sql: 'UPDATE webapps SET shares_count = ? WHERE id = ?',
      args: [sharesCount, id]
    });

    return { success: true };
  }

  // REVIEWS
  async createReview(webappId, data, userId) {
    const { rating, comment } = data;

    const existing = await this.db.execute({
      sql: 'SELECT id FROM reviews WHERE webapp_id = ? AND user_id = ?',
      args: [webappId, userId]
    });

    if (existing.rows.length > 0) {
      throw new Error('You have already reviewed this webapp');
    }

    const review = {
      id: generateId('review'),
      webapp_id: webappId,
      user_id: userId,
      rating: Math.max(1, Math.min(5, parseInt(rating))),
      comment: sanitizeString(comment || ''),
      created_at: Date.now()
    };

    await this.db.execute({
      sql: 'INSERT INTO reviews (id, webapp_id, user_id, rating, comment, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      args: [review.id, review.webapp_id, review.user_id, review.rating, review.comment, review.created_at]
    });

    const reviewsResult = await this.db.execute({
      sql: 'SELECT AVG(rating) as avg_rating, COUNT(*) as count FROM reviews WHERE webapp_id = ?',
      args: [webappId]
    });

    const avgRating = reviewsResult.rows[0].avg_rating || 0;
    const reviewsCount = reviewsResult.rows[0].count;

    await this.db.execute({
      sql: 'UPDATE webapps SET avg_rating = ?, reviews_count = ? WHERE id = ?',
      args: [avgRating, reviewsCount, webappId]
    });

    // Notifier le créateur de la webapp
    const webappResult = await this.db.execute({
      sql: 'SELECT creator_id, name FROM webapps WHERE id = ?',
      args: [webappId]
    });

    if (webappResult.rows.length > 0) {
      const webapp = webappResult.rows[0];
      const creatorId = webapp.creator_id;

      if (creatorId !== userId) {
        const reviewerResult = await this.db.execute({
          sql: 'SELECT name FROM users WHERE id = ?',
          args: [userId]
        });

        const reviewerName = reviewerResult.rows[0]?.name || 'Someone';

        await this.createNotification(
          creatorId,
          'new_review',
          'New review on your webapp',
          `${reviewerName} gave ${rating} stars to "${webapp.name}"`,
          { webappId, reviewId: review.id, rating }
        );
      }
    }

    return { success: true, review };
  }

  async voteReview(reviewId, userId, voteType) {
    if (!['helpful', 'not_helpful'].includes(voteType)) {
      throw new Error('Invalid vote type');
    }

    const existing = await this.db.execute({
      sql: 'SELECT id FROM review_votes WHERE review_id = ? AND user_id = ?',
      args: [reviewId, userId]
    });

    if (existing.rows.length > 0) {
      await this.db.execute({
        sql: 'UPDATE review_votes SET vote_type = ? WHERE review_id = ? AND user_id = ?',
        args: [voteType, reviewId, userId]
      });
    } else {
      await this.db.execute({
        sql: 'INSERT INTO review_votes (id, review_id, user_id, vote_type, created_at) VALUES (?, ?, ?, ?, ?)',
        args: [generateId('vote'), reviewId, userId, voteType, Date.now()]
      });
    }

    const helpfulResult = await this.db.execute({
      sql: 'SELECT COUNT(*) as count FROM review_votes WHERE review_id = ? AND vote_type = "helpful"',
      args: [reviewId]
    });
    const notHelpfulResult = await this.db.execute({
      sql: 'SELECT COUNT(*) as count FROM review_votes WHERE review_id = ? AND vote_type = "not_helpful"',
      args: [reviewId]
    });

    await this.db.execute({
      sql: 'UPDATE reviews SET helpful_count = ?, not_helpful_count = ? WHERE id = ?',
      args: [helpfulResult.rows[0].count, notHelpfulResult.rows[0].count, reviewId]
    });

    return {
      success: true,
      helpful_count: helpfulResult.rows[0].count,
      not_helpful_count: notHelpfulResult.rows[0].count
    };
  }

  // REPORTS
  async createReport(data, userId) {
    const { target_type, target_id, reason } = data;

    const report = {
      id: generateId('report'),
      reporter_id: userId,
      target_type,
      target_id,
      reason: sanitizeString(reason),
      status: 'pending',
      created_at: Date.now()
    };

    await this.db.execute({
      sql: 'INSERT INTO reports (id, reporter_id, target_type, target_id, reason, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      args: [report.id, report.reporter_id, report.target_type, report.target_id, report.reason, report.status, report.created_at]
    });

    return { success: true, report };
  }

  // ADMIN
  async adminLogin(email, password) {
    if (email !== process.env.ADMIN_EMAIL || password !== process.env.ADMIN_PASSWORD) {
      throw new Error('Invalid admin credentials');
    }

    return { success: true, message: 'Admin authenticated' };
  }

  async getReports(status = null) {
    let sql = `SELECT r.*, u.name as reporter_name
               FROM reports r
               JOIN users u ON r.reporter_id = u.id`;

    if (status) {
      sql += ' WHERE r.status = ?';
    }

    sql += ' ORDER BY r.created_at DESC LIMIT 100';

    const result = await this.db.execute(status ? { sql, args: [status] } : sql);

    return { success: true, reports: result.rows };
  }

  async resolveReport(reportId, adminNotes = null) {
    await this.db.execute({
      sql: 'UPDATE reports SET status = "resolved", admin_notes = ?, resolved_at = ? WHERE id = ?',
      args: [adminNotes, Date.now(), reportId]
    });

    return { success: true };
  }

  async adminDeleteWebapp(webappId) {
    await this.db.execute({
      sql: 'DELETE FROM webapps WHERE id = ?',
      args: [webappId]
    });

    return { success: true };
  }

  async getAllWebapps() {
    const result = await this.db.execute('SELECT * FROM webapps ORDER BY created_at DESC');
    return {
      success: true,
      webapps: result.rows.map(w => ({
        ...w,
        tags: JSON.parse(w.tags)
      }))
    };
  }

  // STATS
  async getStats() {
    const webappsCount = await this.db.execute('SELECT COUNT(*) as count FROM webapps WHERE status = "approved"');
    const usersCount = await this.db.execute('SELECT COUNT(*) as count FROM users');
    const reviewsCount = await this.db.execute('SELECT COUNT(*) as count FROM reviews');

    return {
      success: true,
      stats: {
        webapps_count: webappsCount.rows[0].count,
        users_count: usersCount.rows[0].count,
        reviews_count: reviewsCount.rows[0].count
      }
    };
  }

  async getUserWebapps(userId) {
    const result = await this.db.execute({
      sql: 'SELECT * FROM webapps WHERE creator_id = ? ORDER BY created_at DESC',
      args: [userId]
    });

    return {
      success: true,
      webapps: result.rows.map(w => ({
        ...w,
        tags: JSON.parse(w.tags)
      }))
    };
  }

  async getPopularTags(limit = 20) {
    const result = await this.db.execute('SELECT tags FROM webapps WHERE status = "approved"');

    const tagCount = {};
    result.rows.forEach(row => {
      const tags = JSON.parse(row.tags);
      tags.forEach(tag => {
        tagCount[tag] = (tagCount[tag] || 0) + 1;
      });
    });

    const popularTags = Object.entries(tagCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([name, count]) => ({ name, count }));

    return { success: true, tags: popularTags };
  }

  // ========================================
  // NOTIFICATIONS SYSTEM
  // ========================================

  async createNotification(userId, type, title, message, data = null) {
    const notification = {
      id: generateId('notif'),
      user_id: userId,
      type,
      title,
      message,
      data: data ? JSON.stringify(data) : null,
      read: 0,
      created_at: Date.now()
    };

    await this.db.execute({
      sql: `INSERT INTO notifications (id, user_id, type, title, message, data, read, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        notification.id,
        notification.user_id,
        notification.type,
        notification.title,
        notification.message,
        notification.data,
        notification.read,
        notification.created_at
      ]
    });

    return { success: true, notification };
  }

  async getNotifications(userId, limit = 50) {
    const result = await this.db.execute({
      sql: `SELECT * FROM notifications 
            WHERE user_id = ? 
            ORDER BY created_at DESC 
            LIMIT ?`,
      args: [userId, limit]
    });

    return {
      success: true,
      notifications: result.rows.map(n => ({
        ...n,
        data: n.data ? JSON.parse(n.data) : null
      })),
      unread_count: result.rows.filter(n => n.read === 0).length
    };
  }

  async markNotificationAsRead(notificationId, userId) {
    const existing = await this.db.execute({
      sql: 'SELECT user_id FROM notifications WHERE id = ?',
      args: [notificationId]
    });

    if (existing.rows.length === 0) {
      throw new Error('Notification not found');
    }

    if (existing.rows[0].user_id !== userId) {
      throw new Error('Unauthorized');
    }

    await this.db.execute({
      sql: 'UPDATE notifications SET read = 1 WHERE id = ?',
      args: [notificationId]
    });

    return { success: true };
  }

  async markAllNotificationsAsRead(userId) {
    await this.db.execute({
      sql: 'UPDATE notifications SET read = 1 WHERE user_id = ? AND read = 0',
      args: [userId]
    });

    return { success: true };
  }

  async deleteNotification(notificationId, userId) {
    const existing = await this.db.execute({
      sql: 'SELECT user_id FROM notifications WHERE id = ?',
      args: [notificationId]
    });

    if (existing.rows.length === 0) {
      throw new Error('Notification not found');
    }

    if (existing.rows[0].user_id !== userId) {
      throw new Error('Unauthorized');
    }

    await this.db.execute({
      sql: 'DELETE FROM notifications WHERE id = ?',
      args: [notificationId]
    });

    return { success: true };
  }

  // ========================================
  // COLLECTIONS SYSTEM
  // ========================================

  async createCollection(userId, name, description = null, isPublic = false) {
    const collection = {
      id: generateId('collection'),
      user_id: userId,
      name: sanitizeString(name),
      description: description ? sanitizeString(description) : null,
      is_public: isPublic ? 1 : 0,
      created_at: Date.now(),
      updated_at: Date.now()
    };

    await this.db.execute({
      sql: `INSERT INTO collections (id, user_id, name, description, is_public, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [
        collection.id,
        collection.user_id,
        collection.name,
        collection.description,
        collection.is_public,
        collection.created_at,
        collection.updated_at
      ]
    });

    return { success: true, collection };
  }

  async getUserCollections(userId) {
    const result = await this.db.execute({
      sql: `SELECT c.*, COUNT(ci.id) as items_count
            FROM collections c
            LEFT JOIN collection_items ci ON c.id = ci.collection_id
            WHERE c.user_id = ?
            GROUP BY c.id
            ORDER BY c.created_at DESC`,
      args: [userId]
    });

    return { success: true, collections: result.rows };
  }

  async getCollection(collectionId, userId = null) {
    const result = await this.db.execute({
      sql: 'SELECT * FROM collections WHERE id = ?',
      args: [collectionId]
    });

    if (result.rows.length === 0) {
      throw new Error('Collection not found');
    }

    const collection = result.rows[0];

    if (collection.is_public === 0 && collection.user_id !== userId) {
      throw new Error('Unauthorized - Collection is private');
    }

    return { success: true, collection };
  }

  async addToCollection(collectionId, webappId, userId) {
    const collection = await this.db.execute({
      sql: 'SELECT user_id FROM collections WHERE id = ?',
      args: [collectionId]
    });

    if (collection.rows.length === 0) {
      throw new Error('Collection not found');
    }

    if (collection.rows[0].user_id !== userId) {
      throw new Error('Unauthorized');
    }

    const webapp = await this.db.execute({
      sql: 'SELECT id FROM webapps WHERE id = ?',
      args: [webappId]
    });

    if (webapp.rows.length === 0) {
      throw new Error('Webapp not found');
    }

    await this.db.execute({
      sql: `INSERT OR IGNORE INTO collection_items (id, collection_id, webapp_id, added_at)
            VALUES (?, ?, ?, ?)`,
      args: [generateId('item'), collectionId, webappId, Date.now()]
    });

    await this.db.execute({
      sql: 'UPDATE collections SET updated_at = ? WHERE id = ?',
      args: [Date.now(), collectionId]
    });

    return { success: true };
  }

  async removeFromCollection(collectionId, webappId, userId) {
    const collection = await this.db.execute({
      sql: 'SELECT user_id FROM collections WHERE id = ?',
      args: [collectionId]
    });

    if (collection.rows.length === 0) {
      throw new Error('Collection not found');
    }

    if (collection.rows[0].user_id !== userId) {
      throw new Error('Unauthorized');
    }

    await this.db.execute({
      sql: 'DELETE FROM collection_items WHERE collection_id = ? AND webapp_id = ?',
      args: [collectionId, webappId]
    });

    await this.db.execute({
      sql: 'UPDATE collections SET updated_at = ? WHERE id = ?',
      args: [Date.now(), collectionId]
    });

    return { success: true };
  }

  async getCollectionWebapps(collectionId, userId = null) {
    const collectionResult = await this.db.execute({
      sql: 'SELECT user_id, is_public FROM collections WHERE id = ?',
      args: [collectionId]
    });

    if (collectionResult.rows.length === 0) {
      throw new Error('Collection not found');
    }

    const collection = collectionResult.rows[0];

    if (collection.is_public === 0 && collection.user_id !== userId) {
      throw new Error('Unauthorized - Collection is private');
    }

    const result = await this.db.execute({
      sql: `SELECT w.*, ci.added_at
            FROM webapps w
            JOIN collection_items ci ON w.id = ci.webapp_id
            WHERE ci.collection_id = ?
            ORDER BY ci.added_at DESC`,
      args: [collectionId]
    });

    return {
      success: true,
      webapps: result.rows.map(w => ({
        ...w,
        tags: JSON.parse(w.tags)
      }))
    };
  }

  async deleteCollection(collectionId, userId) {
    const collection = await this.db.execute({
      sql: 'SELECT user_id FROM collections WHERE id = ?',
      args: [collectionId]
    });

    if (collection.rows.length === 0) {
      throw new Error('Collection not found');
    }

    if (collection.rows[0].user_id !== userId) {
      throw new Error('Unauthorized');
    }

    await this.db.execute({
      sql: 'DELETE FROM collections WHERE id = ?',
      args: [collectionId]
    });

    return { success: true };
  }

  async updateCollection(collectionId, data, userId) {
    const collection = await this.db.execute({
      sql: 'SELECT user_id FROM collections WHERE id = ?',
      args: [collectionId]
    });

    if (collection.rows.length === 0) {
      throw new Error('Collection not found');
    }

    if (collection.rows[0].user_id !== userId) {
      throw new Error('Unauthorized');
    }

    await this.db.execute({
      sql: 'UPDATE collections SET is_public = ?, updated_at = ? WHERE id = ?',
      args: [data.is_public ? 1 : 0, Date.now(), collectionId]
    });

    return { success: true };
  }

  async getPublicCollections(limit = 20) {
    const result = await this.db.execute({
      sql: `SELECT c.*, u.name as creator_name, COUNT(ci.id) as items_count
            FROM collections c
            JOIN users u ON c.user_id = u.id
            LEFT JOIN collection_items ci ON c.id = ci.collection_id
            WHERE c.is_public = 1
            GROUP BY c.id
            ORDER BY c.updated_at DESC
            LIMIT ?`,
      args: [limit]
    });

    return { success: true, collections: result.rows };
  }

  // ========================================
  // WEBAPP VERSIONS / CHANGELOGS
  // ========================================

  async getWebappVersions(webappId) {
    const result = await this.db.execute({
      sql: `SELECT * FROM webapp_versions 
            WHERE webapp_id = ? 
            ORDER BY created_at DESC`,
      args: [webappId]
    });

    return { success: true, versions: result.rows };
  }

  async healthCheck() {
    return {
      success: true,
      status: 'healthy',
      timestamp: Date.now(),
      database: this.initialized ? 'connected' : 'disconnected'
    };
  }
}