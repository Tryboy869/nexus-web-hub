// server.js - Backend Service (Pas de serveur HTTP !)
// NEXUS WEB HUB - Nexus Studio

import { createClient } from '@libsql/client';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import {
  validateEmail,
  validatePassword,
  validateURL,
  validateWebappName,
  validateDescription,
  generateId,
  sanitizeInput,
  calculateBadges,
  calculateAverageRating,
  ERRORS,
  SUCCESS,
  successResponse,
  errorResponse
} from './utils.js';

export class BackendService {
  constructor() {
    this.db = null;
    this.JWT_SECRET = process.env.JWT_SECRET || 'nexus-web-hub-secret-change-in-production';
  }

  // ========== INITIALIZATION ==========

  async init() {
    console.log('✅ [BACKEND] Initializing...');
    
    try {
      // Connexion Turso
      this.db = createClient({
        url: process.env.DATABASE_URL || 'file:local.db',
        authToken: process.env.DATABASE_AUTH_TOKEN
      });

      console.log('✅ [BACKEND] Database connected');

      // Créer les tables si elles n'existent pas
      await this.createTables();
      
      console.log('✅ [BACKEND] Backend ready');
    } catch (error) {
      console.error('❌ [BACKEND] Initialization failed:', error);
      throw error;
    }
  }

  async createTables() {
    // Users
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        name TEXT NOT NULL,
        username TEXT UNIQUE,
        github_username TEXT,
        avatar_url TEXT,
        role TEXT DEFAULT 'user',
        is_verified INTEGER DEFAULT 0,
        badges TEXT DEFAULT '[]',
        created_at INTEGER DEFAULT (strftime('%s', 'now'))
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
        is_trending INTEGER DEFAULT 0,
        is_featured INTEGER DEFAULT 0,
        is_new INTEGER DEFAULT 1,
        status TEXT DEFAULT 'approved',
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        updated_at INTEGER DEFAULT (strftime('%s', 'now')),
        FOREIGN KEY (creator_id) REFERENCES users(id)
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
        helpful_votes INTEGER DEFAULT 0,
        is_flagged INTEGER DEFAULT 0,
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        FOREIGN KEY (webapp_id) REFERENCES webapps(id),
        FOREIGN KEY (user_id) REFERENCES users(id),
        UNIQUE(webapp_id, user_id)
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
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        FOREIGN KEY (reporter_id) REFERENCES users(id)
      )
    `);

    console.log('✅ [BACKEND] Tables created/verified');
  }

  // ========== AUTH ==========

  async signup(body) {
    console.log('[BACKEND] signup called');

    const { email, password, name } = body;

    // Validation
    if (!validateEmail(email)) {
      return errorResponse(ERRORS.INVALID_EMAIL);
    }

    if (!validatePassword(password)) {
      return errorResponse(ERRORS.INVALID_PASSWORD);
    }

    if (!name || name.length < 2) {
      return errorResponse('Le nom doit contenir au moins 2 caractères');
    }

    // Check if email exists
    const existing = await this.db.execute({
      sql: 'SELECT id FROM users WHERE email = ?',
      args: [email]
    });

    if (existing.rows.length > 0) {
      return errorResponse(ERRORS.EMAIL_ALREADY_EXISTS);
    }

    // Hash password
    const password_hash = await bcrypt.hash(password, 10);

    // Create user
    const userId = generateId();
    
    await this.db.execute({
      sql: `INSERT INTO users (id, email, password_hash, name) 
            VALUES (?, ?, ?, ?)`,
      args: [userId, email, password_hash, sanitizeInput(name)]
    });

    // Generate JWT
    const token = jwt.sign({ userId, email }, this.JWT_SECRET, { expiresIn: '30d' });

    console.log('✅ [BACKEND] User created:', userId);

    return successResponse({
      token,
      user: {
        id: userId,
        email,
        name: sanitizeInput(name),
        role: 'user',
        badges: []
      }
    }, SUCCESS.ACCOUNT_CREATED);
  }

  async login(body) {
    console.log('[BACKEND] login called');

    const { email, password } = body;

    // Validation
    if (!validateEmail(email) || !password) {
      return errorResponse(ERRORS.INVALID_CREDENTIALS);
    }

    // Get user
    const result = await this.db.execute({
      sql: 'SELECT * FROM users WHERE email = ?',
      args: [email]
    });

    if (result.rows.length === 0) {
      return errorResponse(ERRORS.INVALID_CREDENTIALS);
    }

    const user = result.rows[0];

    // Check password
    const valid = await bcrypt.compare(password, user.password_hash);
    
    if (!valid) {
      return errorResponse(ERRORS.INVALID_CREDENTIALS);
    }

    // Generate JWT
    const token = jwt.sign({ userId: user.id, email: user.email }, this.JWT_SECRET, { expiresIn: '30d' });

    console.log('✅ [BACKEND] Login successful:', user.id);

    return successResponse({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        username: user.username,
        avatar_url: user.avatar_url,
        role: user.role,
        badges: JSON.parse(user.badges || '[]')
      }
    }, SUCCESS.LOGIN_SUCCESS);
  }

  async getMe(headers) {
    console.log('[BACKEND] getMe called');

    const userId = headers['x-user-id'];
    
    if (!userId) {
      return errorResponse(ERRORS.UNAUTHORIZED, 401);
    }

    const result = await this.db.execute({
      sql: 'SELECT id, email, name, username, avatar_url, role, badges FROM users WHERE id = ?',
      args: [userId]
    });

    if (result.rows.length === 0) {
      return errorResponse(ERRORS.UNAUTHORIZED, 401);
    }

    const user = result.rows[0];

    return successResponse({
      id: user.id,
      email: user.email,
      name: user.name,
      username: user.username,
      avatar_url: user.avatar_url,
      role: user.role,
      badges: JSON.parse(user.badges || '[]')
    });
  }

  // ========== WEBAPPS ==========

  async getWebapps(query) {
    console.log('[BACKEND] getWebapps called');

    const { category, search, sort = 'recent', page = 1, limit = 12 } = query;

    let sql = 'SELECT * FROM webapps WHERE status = ?';
    let args = ['approved'];

    // Category filter
    if (category && category !== 'all') {
      sql += ' AND category = ?';
      args.push(category);
    }

    // Search filter
    if (search) {
      sql += ' AND (name LIKE ? OR description_short LIKE ? OR tags LIKE ?)';
      const searchTerm = `%${search}%`;
      args.push(searchTerm, searchTerm, searchTerm);
    }

    // Sort
    switch (sort) {
      case 'trending':
        sql += ' ORDER BY is_trending DESC, views_count DESC';
        break;
      case 'top':
        sql += ' ORDER BY avg_rating DESC, reviews_count DESC';
        break;
      case 'new':
        sql += ' ORDER BY created_at DESC';
        break;
      default:
        sql += ' ORDER BY created_at DESC';
    }

    // Pagination
    const offset = (page - 1) * limit;
    sql += ' LIMIT ? OFFSET ?';
    args.push(limit, offset);

    const result = await this.db.execute({ sql, args });

    // Parse JSON fields
    const webapps = result.rows.map(row => ({
      ...row,
      tags: JSON.parse(row.tags || '[]'),
      is_trending: Boolean(row.is_trending),
      is_featured: Boolean(row.is_featured),
      is_new: Boolean(row.is_new)
    }));

    return successResponse({ webapps, total: result.rows.length });
  }

  async getWebapp(id) {
    console.log('[BACKEND] getWebapp called:', id);

    const result = await this.db.execute({
      sql: 'SELECT * FROM webapps WHERE id = ?',
      args: [id]
    });

    if (result.rows.length === 0) {
      return errorResponse(ERRORS.WEBAPP_NOT_FOUND, 404);
    }

    const webapp = result.rows[0];

    // Increment views
    await this.db.execute({
      sql: 'UPDATE webapps SET views_count = views_count + 1 WHERE id = ?',
      args: [id]
    });

    // Get reviews
    const reviewsResult = await this.db.execute({
      sql: `SELECT r.*, u.name as user_name, u.avatar_url as user_avatar 
            FROM reviews r 
            JOIN users u ON r.user_id = u.id 
            WHERE r.webapp_id = ? 
            ORDER BY r.created_at DESC`,
      args: [id]
    });

    return successResponse({
      webapp: {
        ...webapp,
        tags: JSON.parse(webapp.tags || '[]'),
        is_trending: Boolean(webapp.is_trending),
        is_featured: Boolean(webapp.is_featured),
        is_new: Boolean(webapp.is_new)
      },
      reviews: reviewsResult.rows
    });
  }

  async createWebapp(body, headers) {
    console.log('[BACKEND] createWebapp called');

    const userId = headers['x-user-id'];
    
    if (!userId) {
      return errorResponse(ERRORS.UNAUTHORIZED, 401);
    }

    const { name, url, description_short, description_long, category, tags, github_url, video_url, image_url } = body;

    // Validation
    if (!validateWebappName(name)) {
      return errorResponse(ERRORS.INVALID_NAME);
    }

    if (!validateURL(url)) {
      return errorResponse(ERRORS.INVALID_URL);
    }

    if (!validateDescription(description_short, 200)) {
      return errorResponse('La description courte doit contenir entre 1 et 200 caractères');
    }

    if (!category) {
      return errorResponse(ERRORS.INVALID_CATEGORY);
    }

    // Check duplicate URL
    const existing = await this.db.execute({
      sql: 'SELECT id FROM webapps WHERE url = ?',
      args: [url]
    });

    if (existing.rows.length > 0) {
      return errorResponse(ERRORS.URL_ALREADY_EXISTS);
    }

    // Get user info
    const userResult = await this.db.execute({
      sql: 'SELECT name FROM users WHERE id = ?',
      args: [userId]
    });

    const developer = userResult.rows[0].name;

    // Create webapp
    const webappId = generateId();
    
    await this.db.execute({
      sql: `INSERT INTO webapps 
            (id, name, developer, creator_id, description_short, description_long, 
             url, category, tags, github_url, video_url, image_url, status) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        webappId,
        sanitizeInput(name),
        developer,
        userId,
        sanitizeInput(description_short),
        sanitizeInput(description_long || ''),
        url,
        category,
        JSON.stringify(tags || []),
        github_url || null,
        video_url || null,
        image_url || null,
        'approved' // Auto-approved (pas de modération complexe pour MVP)
      ]
    });

    console.log('✅ [BACKEND] Webapp created:', webappId);

    // Check badges
    await this.updateUserBadges(userId);

    return successResponse({ id: webappId }, SUCCESS.WEBAPP_CREATED);
  }

  async updateWebapp(id, body, headers) {
    console.log('[BACKEND] updateWebapp called:', id);

    const userId = headers['x-user-id'];
    
    if (!userId) {
      return errorResponse(ERRORS.UNAUTHORIZED, 401);
    }

    // Check ownership
    const webappResult = await this.db.execute({
      sql: 'SELECT creator_id FROM webapps WHERE id = ?',
      args: [id]
    });

    if (webappResult.rows.length === 0) {
      return errorResponse(ERRORS.WEBAPP_NOT_FOUND, 404);
    }

    if (webappResult.rows[0].creator_id !== userId) {
      return errorResponse(ERRORS.NOT_OWNER, 403);
    }

    // Update
    const { name, description_short, description_long, tags, github_url, video_url, image_url } = body;

    await this.db.execute({
      sql: `UPDATE webapps SET 
            name = ?, description_short = ?, description_long = ?, 
            tags = ?, github_url = ?, video_url = ?, image_url = ?,
            updated_at = strftime('%s', 'now')
            WHERE id = ?`,
      args: [
        sanitizeInput(name),
        sanitizeInput(description_short),
        sanitizeInput(description_long || ''),
        JSON.stringify(tags || []),
        github_url || null,
        video_url || null,
        image_url || null,
        id
      ]
    });

    console.log('✅ [BACKEND] Webapp updated:', id);

    return successResponse({ id }, SUCCESS.WEBAPP_UPDATED);
  }

  async deleteWebapp(id, headers) {
    console.log('[BACKEND] deleteWebapp called:', id);

    const userId = headers['x-user-id'];
    
    if (!userId) {
      return errorResponse(ERRORS.UNAUTHORIZED, 401);
    }

    // Check ownership
    const webappResult = await this.db.execute({
      sql: 'SELECT creator_id FROM webapps WHERE id = ?',
      args: [id]
    });

    if (webappResult.rows.length === 0) {
      return errorResponse(ERRORS.WEBAPP_NOT_FOUND, 404);
    }

    if (webappResult.rows[0].creator_id !== userId) {
      return errorResponse(ERRORS.NOT_OWNER, 403);
    }

    // Delete
    await this.db.execute({
      sql: 'DELETE FROM webapps WHERE id = ?',
      args: [id]
    });

    // Delete associated reviews
    await this.db.execute({
      sql: 'DELETE FROM reviews WHERE webapp_id = ?',
      args: [id]
    });

    console.log('✅ [BACKEND] Webapp deleted:', id);

    return successResponse({ id }, SUCCESS.WEBAPP_DELETED);
  }

  // ========== REVIEWS ==========

  async createReview(webappId, body, headers) {
    console.log('[BACKEND] createReview called');

    const userId = headers['x-user-id'];
    
    if (!userId) {
      return errorResponse(ERRORS.UNAUTHORIZED, 401);
    }

    const { rating, comment } = body;

    // Validation
    if (!rating || rating < 1 || rating > 5) {
      return errorResponse(ERRORS.INVALID_RATING);
    }

    // Check webapp exists
    const webappResult = await this.db.execute({
      sql: 'SELECT creator_id FROM webapps WHERE id = ?',
      args: [webappId]
    });

    if (webappResult.rows.length === 0) {
      return errorResponse(ERRORS.WEBAPP_NOT_FOUND, 404);
    }

    // Cannot review own webapp
    if (webappResult.rows[0].creator_id === userId) {
      return errorResponse(ERRORS.CANNOT_REVIEW_OWN);
    }

    // Check if already reviewed
    const existingReview = await this.db.execute({
      sql: 'SELECT id FROM reviews WHERE webapp_id = ? AND user_id = ?',
      args: [webappId, userId]
    });

    if (existingReview.rows.length > 0) {
      return errorResponse(ERRORS.ALREADY_REVIEWED);
    }

    // Create review
    const reviewId = generateId();
    
    await this.db.execute({
      sql: `INSERT INTO reviews (id, webapp_id, user_id, rating, comment) 
            VALUES (?, ?, ?, ?, ?)`,
      args: [reviewId, webappId, userId, rating, sanitizeInput(comment || '')]
    });

    // Update webapp average rating
    await this.updateWebappRating(webappId);

    // Check badges
    await this.updateUserBadges(userId);

    console.log('✅ [BACKEND] Review created:', reviewId);

    return successResponse({ id: reviewId }, SUCCESS.REVIEW_CREATED);
  }

  async updateWebappRating(webappId) {
    const result = await this.db.execute({
      sql: 'SELECT AVG(rating) as avg_rating, COUNT(*) as count FROM reviews WHERE webapp_id = ?',
      args: [webappId]
    });

    const avgRating = result.rows[0].avg_rating || 0;
    const count = result.rows[0].count || 0;

    await this.db.execute({
      sql: 'UPDATE webapps SET avg_rating = ?, reviews_count = ? WHERE id = ?',
      args: [Math.round(avgRating * 10) / 10, count, webappId]
    });
  }

  // ========== BADGES ==========

  async updateUserBadges(userId) {
    console.log('[BACKEND] updateUserBadges called:', userId);

    // Get user stats
    const webappsCount = await this.db.execute({
      sql: 'SELECT COUNT(*) as count FROM webapps WHERE creator_id = ? AND status = ?',
      args: [userId, 'approved']
    });

    const reviewsCount = await this.db.execute({
      sql: 'SELECT COUNT(*) as count FROM reviews WHERE user_id = ?',
      args: [userId]
    });

    const userResult = await this.db.execute({
      sql: 'SELECT created_at FROM users WHERE id = ?',
      args: [userId]
    });

    const accountAgeDays = Math.floor((Date.now() / 1000 - userResult.rows[0].created_at) / 86400);

    const stats = {
      webapps_count: webappsCount.rows[0].count,
      reviews_count: reviewsCount.rows[0].count,
      account_age_days: accountAgeDays,
      helpful_percentage: 75, // TODO: Calculate real percentage
      has_github_contribution: false // TODO: Check GitHub
    };

    const badges = calculateBadges(stats);

    // Update user badges
    await this.db.execute({
      sql: 'UPDATE users SET badges = ? WHERE id = ?',
      args: [JSON.stringify(badges), userId]
    });

    console.log('✅ [BACKEND] Badges updated:', badges);
  }

  // ========== REPORTS ==========

  async createReport(body, headers) {
    console.log('[BACKEND] createReport called');

    const userId = headers['x-user-id'];
    
    if (!userId) {
      return errorResponse(ERRORS.UNAUTHORIZED, 401);
    }

    const { target_type, target_id, reason } = body;

    if (!reason || reason.length < 10) {
      return errorResponse(ERRORS.INVALID_REASON);
    }

    // Check if already reported
    const existing = await this.db.execute({
      sql: 'SELECT id FROM reports WHERE reporter_id = ? AND target_type = ? AND target_id = ?',
      args: [userId, target_type, target_id]
    });

    if (existing.rows.length > 0) {
      return errorResponse(ERRORS.ALREADY_REPORTED);
    }

    // Create report
    const reportId = generateId();
    
    await this.db.execute({
      sql: `INSERT INTO reports (id, reporter_id, target_type, target_id, reason) 
            VALUES (?, ?, ?, ?, ?)`,
      args: [reportId, userId, target_type, target_id, sanitizeInput(reason)]
    });

    console.log('✅ [BACKEND] Report created:', reportId);

    return successResponse({ id: reportId }, SUCCESS.REPORT_CREATED);
  }

  // ========== STATS ==========

  async getStats() {
    console.log('[BACKEND] getStats called');

    const webappsCount = await this.db.execute({
      sql: 'SELECT COUNT(*) as count FROM webapps WHERE status = ?',
      args: ['approved']
    });

    const usersCount = await this.db.execute({
      sql: 'SELECT COUNT(*) as count FROM users'
    });

    const reviewsCount = await this.db.execute({
      sql: 'SELECT COUNT(*) as count FROM reviews'
    });

    return successResponse({
      webapps: webappsCount.rows[0].count,
      creators: usersCount.rows[0].count,
      reviews: reviewsCount.rows[0].count
    });
  }

  // ========== HEALTH CHECK ==========

  async healthCheck() {
    const checks = {
      timestamp: new Date().toISOString(),
      status: 'ok',
      services: {}
    };

    try {
      await this.db.execute('SELECT 1');
      checks.services.database = 'connected';
    } catch (error) {
      checks.services.database = 'offline';
      checks.status = 'degraded';
    }

    return checks;
  }
}