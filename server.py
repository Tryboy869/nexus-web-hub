import os
import json
import hashlib
import secrets
from datetime import datetime, timedelta
from functools import wraps
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
import libsql_experimental as libsql

app = Flask(__name__)
CORS(app)

limiter = Limiter(
    app=app,
    key_func=get_remote_address,
    default_limits=["100 per hour"],
    storage_uri="memory://"
)

DATABASE_URL = os.getenv('DATABASE_URL', 'file:local.db')
DATABASE_AUTH_TOKEN = os.getenv('DATABASE_AUTH_TOKEN', '')

def get_db():
    if DATABASE_URL.startswith('libsql://') or DATABASE_URL.startswith('https://'):
        return libsql.connect(DATABASE_URL, auth_token=DATABASE_AUTH_TOKEN)
    return libsql.connect(DATABASE_URL)

def hash_password(password):
    return hashlib.sha256(password.encode()).hexdigest()

def generate_token():
    return secrets.token_urlsafe(32)

def calculate_tester_level(user_id):
    db = get_db()
    cursor = db.execute('''
        SELECT COUNT(*) as total, 
               SUM(helpful_count) as helpful_total
        FROM reviews WHERE user_id = ?
    ''', (user_id,))
    stats = cursor.fetchone()
    
    total_reviews = stats[0] or 0
    helpful_total = stats[1] or 0
    helpful_ratio = helpful_total / total_reviews if total_reviews > 0 else 0
    
    if total_reviews >= 200 and helpful_ratio >= 0.8:
        return 'legendary'
    elif total_reviews >= 50 and helpful_ratio >= 0.7:
        return 'pro'
    elif total_reviews >= 10:
        return 'beginner'
    return 'none'

def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = request.headers.get('Authorization')
        if not token:
            return jsonify({'success': False, 'error': 'Token manquant'}), 401
        
        token = token.replace('Bearer ', '')
        db = get_db()
        cursor = db.execute('SELECT * FROM users WHERE token = ?', (token,))
        user = cursor.fetchone()
        
        if not user:
            return jsonify({'success': False, 'error': 'Token invalide'}), 401
        
        return f(user=user, *args, **kwargs)
    return decorated

def admin_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = request.headers.get('Authorization')
        if not token:
            return jsonify({'success': False, 'error': 'Token manquant'}), 401
        
        token = token.replace('Bearer ', '')
        db = get_db()
        cursor = db.execute('SELECT * FROM users WHERE token = ? AND role = "admin"', (token,))
        user = cursor.fetchone()
        
        if not user:
            return jsonify({'success': False, 'error': 'Accès admin requis'}), 403
        
        return f(user=user, *args, **kwargs)
    return decorated

@app.route('/')
def serve_frontend():
    return send_from_directory('.', 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory('.', path)

@app.route('/api/db/reset', methods=['POST'])
def reset_database():
    admin_secret = request.json.get('admin_secret')
    if admin_secret != os.getenv('ADMIN_SECRET', 'nexus-reset-2025'):
        return jsonify({'success': False, 'error': 'Secret invalide'}), 403
    
    db = get_db()
    
    db.execute('DROP TABLE IF EXISTS users')
    db.execute('DROP TABLE IF EXISTS webapps')
    db.execute('DROP TABLE IF EXISTS reviews')
    db.execute('DROP TABLE IF EXISTS reports')
    db.execute('DROP TABLE IF EXISTS collections')
    
    db.execute('''
        CREATE TABLE users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role TEXT DEFAULT 'user',
            token TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            is_verified BOOLEAN DEFAULT 0,
            tester_level TEXT DEFAULT 'none',
            total_reviews INTEGER DEFAULT 0,
            helpful_votes INTEGER DEFAULT 0
        )
    ''')
    
    db.execute('''
        CREATE TABLE webapps (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            developer TEXT NOT NULL,
            url TEXT NOT NULL,
            image_url TEXT,
            description_short TEXT NOT NULL,
            description_long TEXT,
            category TEXT NOT NULL,
            tags TEXT,
            github_url TEXT,
            video_url TEXT,
            creator_id INTEGER NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            status TEXT DEFAULT 'pending',
            views_count INTEGER DEFAULT 0,
            is_trending BOOLEAN DEFAULT 0,
            is_featured BOOLEAN DEFAULT 0,
            avg_rating REAL DEFAULT 0.0,
            reviews_count INTEGER DEFAULT 0,
            FOREIGN KEY (creator_id) REFERENCES users(id)
        )
    ''')
    
    db.execute('''
        CREATE TABLE reviews (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            webapp_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            rating REAL NOT NULL,
            comment TEXT,
            utility_rating REAL,
            ux_rating REAL,
            performance_rating REAL,
            innovation_rating REAL,
            openness_rating REAL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            helpful_count INTEGER DEFAULT 0,
            FOREIGN KEY (webapp_id) REFERENCES webapps(id),
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    ''')
    
    db.execute('''
        CREATE TABLE reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            reporter_id INTEGER NOT NULL,
            target_type TEXT NOT NULL,
            target_id INTEGER NOT NULL,
            reason TEXT NOT NULL,
            description TEXT,
            status TEXT DEFAULT 'pending',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            resolved_by INTEGER,
            resolved_at TEXT,
            FOREIGN KEY (reporter_id) REFERENCES users(id),
            FOREIGN KEY (resolved_by) REFERENCES users(id)
        )
    ''')
    
    db.execute('''
        CREATE TABLE collections (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT,
            creator_id INTEGER NOT NULL,
            is_public BOOLEAN DEFAULT 1,
            webapp_ids TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (creator_id) REFERENCES users(id)
        )
    ''')
    
    db.commit()
    
    return jsonify({
        'success': True,
        'message': 'Base de données réinitialisée avec succès'
    })

@app.route('/api/db/migrate/supabase', methods=['POST'])
def migrate_to_supabase():
    admin_secret = request.json.get('admin_secret')
    supabase_url = request.json.get('supabase_url')
    supabase_key = request.json.get('supabase_key')
    
    if admin_secret != os.getenv('ADMIN_SECRET', 'nexus-reset-2025'):
        return jsonify({'success': False, 'error': 'Secret invalide'}), 403
    
    db = get_db()
    
    users = db.execute('SELECT * FROM users').fetchall()
    webapps = db.execute('SELECT * FROM webapps').fetchall()
    reviews = db.execute('SELECT * FROM reviews').fetchall()
    
    return jsonify({
        'success': True,
        'message': 'Migration préparée',
        'data': {
            'users_count': len(users),
            'webapps_count': len(webapps),
            'reviews_count': len(reviews),
            'supabase_config': {
                'url': supabase_url,
                'instructions': 'Installer supabase-py et utiliser ces données pour import'
            }
        }
    })

@app.route('/api/admin/create', methods=['POST'])
def create_admin():
    admin_secret = request.json.get('admin_secret')
    if admin_secret != os.getenv('ADMIN_SECRET', 'nexus-reset-2025'):
        return jsonify({'success': False, 'error': 'Secret invalide'}), 403
    
    data = request.json
    name = data.get('name')
    email = data.get('email')
    password = data.get('password')
    
    if not all([name, email, password]):
        return jsonify({'success': False, 'error': 'Données manquantes'}), 400
    
    db = get_db()
    cursor = db.execute('SELECT id FROM users WHERE email = ?', (email,))
    if cursor.fetchone():
        return jsonify({'success': False, 'error': 'Email déjà utilisé'}), 400
    
    hashed_pw = hash_password(password)
    token = generate_token()
    
    db.execute('''
        INSERT INTO users (name, email, password, role, token, is_verified)
        VALUES (?, ?, ?, 'admin', ?, 1)
    ''', (name, email, hashed_pw, token))
    db.commit()
    
    return jsonify({
        'success': True,
        'message': 'Admin créé avec succès',
        'data': {
            'name': name,
            'email': email,
            'token': token,
            'role': 'admin'
        }
    })

@app.route('/api/auth/signup', methods=['POST'])
def signup():
    data = request.json
    name = data.get('name')
    email = data.get('email')
    password = data.get('password')
    
    if not all([name, email, password]):
        return jsonify({'success': False, 'error': 'Données manquantes'}), 400
    
    db = get_db()
    cursor = db.execute('SELECT id FROM users WHERE email = ?', (email,))
    if cursor.fetchone():
        return jsonify({'success': False, 'error': 'Email déjà utilisé'}), 400
    
    hashed_pw = hash_password(password)
    token = generate_token()
    
    db.execute('''
        INSERT INTO users (name, email, password, token)
        VALUES (?, ?, ?, ?)
    ''', (name, email, hashed_pw, token))
    db.commit()
    
    return jsonify({
        'success': True,
        'data': {
            'name': name,
            'email': email,
            'token': token,
            'role': 'user'
        }
    })

@app.route('/api/auth/login', methods=['POST'])
def login():
    data = request.json
    email = data.get('email')
    password = data.get('password')
    
    if not all([email, password]):
        return jsonify({'success': False, 'error': 'Données manquantes'}), 400
    
    hashed_pw = hash_password(password)
    db = get_db()
    cursor = db.execute('''
        SELECT id, name, email, role, token, is_verified, tester_level 
        FROM users WHERE email = ? AND password = ?
    ''', (email, hashed_pw))
    user = cursor.fetchone()
    
    if not user:
        return jsonify({'success': False, 'error': 'Identifiants invalides'}), 401
    
    return jsonify({
        'success': True,
        'data': {
            'id': user[0],
            'name': user[1],
            'email': user[2],
            'role': user[3],
            'token': user[4],
            'is_verified': bool(user[5]),
            'tester_level': user[6]
        }
    })

@app.route('/api/auth/me', methods=['GET'])
@token_required
def get_current_user(user):
    return jsonify({
        'success': True,
        'data': {
            'id': user[0],
            'name': user[1],
            'email': user[2],
            'role': user[3],
            'is_verified': bool(user[5]),
            'tester_level': user[6],
            'total_reviews': user[7],
            'helpful_votes': user[8]
        }
    })

@app.route('/api/stats', methods=['GET'])
def get_stats():
    db = get_db()
    
    webapps_count = db.execute('SELECT COUNT(*) FROM webapps WHERE status = "approved"').fetchone()[0]
    creators_count = db.execute('SELECT COUNT(DISTINCT creator_id) FROM webapps').fetchone()[0]
    reviews_count = db.execute('SELECT COUNT(*) FROM reviews').fetchone()[0]
    avg_rating = db.execute('SELECT AVG(avg_rating) FROM webapps WHERE reviews_count > 0').fetchone()[0] or 0.0
    
    return jsonify({
        'success': True,
        'data': {
            'total_webapps': webapps_count,
            'total_creators': creators_count,
            'total_reviews': reviews_count,
            'avg_rating': round(avg_rating, 1)
        }
    })

@app.route('/api/webapps', methods=['GET'])
def get_webapps():
    page = int(request.args.get('page', 1))
    limit = int(request.args.get('limit', 20))
    category = request.args.get('category', 'all')
    search = request.args.get('search', '')
    filter_type = request.args.get('filter', 'all')
    
    db = get_db()
    query = 'SELECT * FROM webapps WHERE status = "approved"'
    params = []
    
    if category != 'all':
        query += ' AND category = ?'
        params.append(category)
    
    if search:
        query += ' AND (name LIKE ? OR description_short LIKE ? OR tags LIKE ?)'
        search_term = f'%{search}%'
        params.extend([search_term, search_term, search_term])
    
    if filter_type == 'trending':
        query += ' AND is_trending = 1'
    elif filter_type == 'new':
        query += ' ORDER BY created_at DESC'
    elif filter_type == 'top':
        query += ' ORDER BY avg_rating DESC'
    else:
        query += ' ORDER BY created_at DESC'
    
    query += f' LIMIT ? OFFSET ?'
    params.extend([limit, (page - 1) * limit])
    
    cursor = db.execute(query, params)
    webapps = cursor.fetchall()
    
    result = []
    for webapp in webapps:
        result.append({
            'id': webapp[0],
            'name': webapp[1],
            'developer': webapp[2],
            'url': webapp[3],
            'image': webapp[4],
            'description_short': webapp[5],
            'description_long': webapp[6],
            'category': webapp[7],
            'tags': webapp[8].split(',') if webapp[8] else [],
            'github_url': webapp[9],
            'video_url': webapp[10],
            'created_at': webapp[12],
            'views_count': webapp[14],
            'is_trending': bool(webapp[15]),
            'is_featured': bool(webapp[16]),
            'avg_rating': webapp[17],
            'reviews_count': webapp[18]
        })
    
    return jsonify({
        'success': True,
        'data': result,
        'pagination': {
            'page': page,
            'limit': limit,
            'total': len(result)
        }
    })

@app.route('/api/webapps/<int:webapp_id>', methods=['GET'])
def get_webapp(webapp_id):
    db = get_db()
    cursor = db.execute('SELECT * FROM webapps WHERE id = ?', (webapp_id,))
    webapp = cursor.fetchone()
    
    if not webapp:
        return jsonify({'success': False, 'error': 'WebApp non trouvée'}), 404
    
    db.execute('UPDATE webapps SET views_count = views_count + 1 WHERE id = ?', (webapp_id,))
    db.commit()
    
    return jsonify({
        'success': True,
        'data': {
            'id': webapp[0],
            'name': webapp[1],
            'developer': webapp[2],
            'url': webapp[3],
            'image': webapp[4],
            'description_short': webapp[5],
            'description_long': webapp[6],
            'category': webapp[7],
            'tags': webapp[8].split(',') if webapp[8] else [],
            'github_url': webapp[9],
            'video_url': webapp[10],
            'created_at': webapp[12],
            'status': webapp[13],
            'views_count': webapp[14] + 1,
            'is_trending': bool(webapp[15]),
            'is_featured': bool(webapp[16]),
            'avg_rating': webapp[17],
            'reviews_count': webapp[18]
        }
    })

@app.route('/api/webapps', methods=['POST'])
@token_required
def create_webapp(user):
    data = request.json
    name = data.get('name')
    url = data.get('url')
    description_short = data.get('description_short')
    category = data.get('category', 'utilitaire')
    
    if not all([name, url, description_short]):
        return jsonify({'success': False, 'error': 'Données manquantes'}), 400
    
    if not url.startswith('https://'):
        return jsonify({'success': False, 'error': 'URL doit être en HTTPS'}), 400
    
    db = get_db()
    db.execute('''
        INSERT INTO webapps (
            name, developer, url, description_short, description_long,
            category, tags, github_url, video_url, image_url, creator_id, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    ''', (
        name,
        user[1],
        url,
        description_short,
        data.get('description_long', ''),
        category,
        data.get('tags', ''),
        data.get('github_url', ''),
        data.get('video_url', ''),
        data.get('image_url', ''),
        user[0]
    ))
    db.commit()
    
    return jsonify({
        'success': True,
        'message': 'WebApp soumise avec succès (en attente modération)'
    })

@app.route('/api/admin/reports', methods=['GET'])
@admin_required
def get_reports(user):
    db = get_db()
    cursor = db.execute('''
        SELECT r.*, u.name as reporter_name 
        FROM reports r 
        JOIN users u ON r.reporter_id = u.id 
        WHERE r.status = 'pending'
        ORDER BY r.created_at DESC
    ''')
    reports = cursor.fetchall()
    
    result = []
    for report in reports:
        result.append({
            'id': report[0],
            'reporter_name': report[11],
            'target_type': report[2],
            'target_id': report[3],
            'reason': report[4],
            'description': report[5],
            'created_at': report[7]
        })
    
    return jsonify({'success': True, 'data': result})

@app.route('/api/admin/reports/<int:report_id>/resolve', methods=['POST'])
@admin_required
def resolve_report(user, report_id):
    action = request.json.get('action')
    
    db = get_db()
    db.execute('''
        UPDATE reports 
        SET status = 'resolved', resolved_by = ?, resolved_at = CURRENT_TIMESTAMP
        WHERE id = ?
    ''', (user[0], report_id))
    db.commit()
    
    return jsonify({'success': True, 'message': 'Signalement traité'})

@app.route('/api/admin/webapps/<int:webapp_id>/approve', methods=['POST'])
@admin_required
def approve_webapp(user, webapp_id):
    db = get_db()
    db.execute('UPDATE webapps SET status = "approved" WHERE id = ?', (webapp_id,))
    db.commit()
    
    return jsonify({'success': True, 'message': 'WebApp approuvée'})

@app.route('/api/admin/webapps/<int:webapp_id>/reject', methods=['POST'])
@admin_required
def reject_webapp(user, webapp_id):
    reason = request.json.get('reason', '')
    
    db = get_db()
    db.execute('UPDATE webapps SET status = "rejected" WHERE id = ?', (webapp_id,))
    db.commit()
    
    return jsonify({'success': True, 'message': 'WebApp rejetée'})

@app.route('/api/reviews', methods=['POST'])
@token_required
@limiter.limit("5 per hour")
def create_review(user):
    data = request.json
    webapp_id = data.get('webapp_id')
    rating = data.get('rating')
    comment = data.get('comment', '')
    
    if not all([webapp_id, rating]):
        return jsonify({'success': False, 'error': 'Données manquantes'}), 400
    
    db = get_db()
    
    cursor = db.execute('SELECT id FROM reviews WHERE webapp_id = ? AND user_id = ?', (webapp_id, user[0]))
    if cursor.fetchone():
        return jsonify({'success': False, 'error': 'Vous avez déjà noté cette webapp'}), 400
    
    db.execute('''
        INSERT INTO reviews (
            webapp_id, user_id, rating, comment,
            utility_rating, ux_rating, performance_rating,
            innovation_rating, openness_rating
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        webapp_id, user[0], rating, comment,
        data.get('utility_rating', rating),
        data.get('ux_rating', rating),
        data.get('performance_rating', rating),
        data.get('innovation_rating', rating),
        data.get('openness_rating', rating)
    ))
    
    cursor = db.execute('SELECT AVG(rating), COUNT(*) FROM reviews WHERE webapp_id = ?', (webapp_id,))
    avg, count = cursor.fetchone()
    
    db.execute('UPDATE webapps SET avg_rating = ?, reviews_count = ? WHERE id = ?', (avg, count, webapp_id))
    db.execute('UPDATE users SET total_reviews = total_reviews + 1 WHERE id = ?', (user[0],))
    
    new_level = calculate_tester_level(user[0])
    db.execute('UPDATE users SET tester_level = ? WHERE id = ?', (new_level, user[0]))
    
    db.commit()
    
    return jsonify({'success': True, 'message': 'Avis publié avec succès'})

@app.route('/api/reviews/<int:review_id>/helpful', methods=['POST'])
@token_required
def mark_helpful(user, review_id):
    db = get_db()
    db.execute('UPDATE reviews SET helpful_count = helpful_count + 1 WHERE id = ?', (review_id,))
    
    cursor = db.execute('SELECT user_id FROM reviews WHERE id = ?', (review_id,))
    reviewer = cursor.fetchone()
    if reviewer:
        db.execute('UPDATE users SET helpful_votes = helpful_votes + 1 WHERE id = ?', (reviewer[0],))
        new_level = calculate_tester_level(reviewer[0])
        db.execute('UPDATE users SET tester_level = ? WHERE id = ?', (new_level, reviewer[0]))
    
    db.commit()
    return jsonify({'success': True})

@app.route('/api/webapps/<int:webapp_id>/reviews', methods=['GET'])
def get_reviews(webapp_id):
    db = get_db()
    cursor = db.execute('''
        SELECT r.*, u.name, u.tester_level, u.is_verified
        FROM reviews r
        JOIN users u ON r.user_id = u.id
        WHERE r.webapp_id = ?
        ORDER BY r.helpful_count DESC, r.created_at DESC
    ''', (webapp_id,))
    
    reviews = cursor.fetchall()
    result = []
    for r in reviews:
        result.append({
            'id': r[0],
            'rating': r[3],
            'comment': r[4],
            'user_name': r[12],
            'user_level': r[13],
            'user_verified': bool(r[14]),
            'utility_rating': r[5],
            'ux_rating': r[6],
            'performance_rating': r[7],
            'innovation_rating': r[8],
            'openness_rating': r[9],
            'created_at': r[10],
            'helpful_count': r[11]
        })
    
    return jsonify({'success': True, 'data': result})

@app.route('/api/reports', methods=['POST'])
@token_required
@limiter.limit("10 per day")
def create_report(user):
    data = request.json
    target_type = data.get('target_type')
    target_id = data.get('target_id')
    reason = data.get('reason')
    
    if not all([target_type, target_id, reason]):
        return jsonify({'success': False, 'error': 'Données manquantes'}), 400
    
    db = get_db()
    db.execute('''
        INSERT INTO reports (reporter_id, target_type, target_id, reason, description)
        VALUES (?, ?, ?, ?, ?)
    ''', (user[0], target_type, target_id, reason, data.get('description', '')))
    db.commit()
    
    return jsonify({'success': True, 'message': 'Signalement envoyé'})

@app.route('/api/collections', methods=['GET'])
def get_collections():
    db = get_db()
    cursor = db.execute('''
        SELECT c.*, u.name as creator_name
        FROM collections c
        JOIN users u ON c.creator_id = u.id
        WHERE c.is_public = 1
        ORDER BY c.created_at DESC
    ''')
    
    collections = cursor.fetchall()
    result = []
    for c in collections:
        result.append({
            'id': c[0],
            'name': c[1],
            'description': c[2],
            'creator_name': c[7],
            'webapp_count': len(c[5].split(',')) if c[5] else 0,
            'created_at': c[6]
        })
    
    return jsonify({'success': True, 'data': result})

@app.route('/api/collections', methods=['POST'])
@token_required
def create_collection(user):
    data = request.json
    name = data.get('name')
    
    if not name:
        return jsonify({'success': False, 'error': 'Nom requis'}), 400
    
    db = get_db()
    cursor = db.execute('SELECT COUNT(*) FROM collections WHERE creator_id = ?', (user[0],))
    count = cursor.fetchone()[0]
    
    if user[3] != 'admin' and count >= 1:
        return jsonify({'success': False, 'error': 'Limite gratuite atteinte (1 collection)'}), 403
    
    db.execute('''
        INSERT INTO collections (name, description, creator_id, is_public)
        VALUES (?, ?, ?, ?)
    ''', (name, data.get('description', ''), user[0], data.get('is_public', 1)))
    db.commit()
    
    return jsonify({'success': True, 'message': 'Collection créée'})

@app.route('/api/collections/<int:collection_id>/add/<int:webapp_id>', methods=['POST'])
@token_required
def add_to_collection(user, collection_id, webapp_id):
    db = get_db()
    cursor = db.execute('SELECT webapp_ids, creator_id FROM collections WHERE id = ?', (collection_id,))
    collection = cursor.fetchone()
    
    if not collection or collection[1] != user[0]:
        return jsonify({'success': False, 'error': 'Collection non trouvée'}), 404
    
    ids = collection[0].split(',') if collection[0] else []
    if str(webapp_id) not in ids:
        ids.append(str(webapp_id))
    
    db.execute('UPDATE collections SET webapp_ids = ? WHERE id = ?', (','.join(ids), collection_id))
    db.commit()
    
    return jsonify({'success': True})

@app.route('/api/monitoring', methods=['GET'])
def monitoring():
    db = get_db()
    
    total_users = db.execute('SELECT COUNT(*) FROM users').fetchone()[0]
    total_webapps = db.execute('SELECT COUNT(*) FROM webapps').fetchone()[0]
    pending_webapps = db.execute('SELECT COUNT(*) FROM webapps WHERE status = "pending"').fetchone()[0]
    pending_reports = db.execute('SELECT COUNT(*) FROM reports WHERE status = "pending"').fetchone()[0]
    
    recent_signups = db.execute('''
        SELECT COUNT(*) FROM users 
        WHERE created_at > datetime('now', '-24 hours')
    ''').fetchone()[0]
    
    return jsonify({
        'success': True,
        'data': {
            'total_users': total_users,
            'total_webapps': total_webapps,
            'pending_webapps': pending_webapps,
            'pending_reports': pending_reports,
            'signups_24h': recent_signups,
            'timestamp': datetime.now().isoformat()
        }
    })

@app.route('/api/users/<int:user_id>', methods=['GET'])
def get_user_profile(user_id):
    db = get_db()
    cursor = db.execute('''
        SELECT id, name, email, role, is_verified, tester_level, 
               total_reviews, helpful_votes, created_at
        FROM users WHERE id = ?
    ''', (user_id,))
    user = cursor.fetchone()
    
    if not user:
        return jsonify({'success': False, 'error': 'Utilisateur non trouvé'}), 404
    
    cursor = db.execute('SELECT * FROM webapps WHERE creator_id = ? AND status = "approved"', (user_id,))
    webapps = cursor.fetchall()
    
    return jsonify({
        'success': True,
        'data': {
            'id': user[0],
            'name': user[1],
            'role': user[3],
            'is_verified': bool(user[4]),
            'tester_level': user[5],
            'total_reviews': user[6],
            'helpful_votes': user[7],
            'joined_at': user[8],
            'webapps_count': len(webapps)
        }
    })

if __name__ == '__main__':
    port = int(os.getenv('PORT', 8000))
    app.run(host='0.0.0.0', port=port, debug=False)