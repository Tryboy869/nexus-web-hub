# 🚀 NEXUS WEB HUB

**The Play Store for Webapps** - A community-driven webapp directory where creators share their projects and users discover amazing web tools.

---

## 📋 PROJECT OVERVIEW

Nexus Web Hub is a free, open platform that allows developers to publish their webapps and receive community feedback through reviews and ratings. Think of it as "Google Play Store" but for web applications.

### ✨ Key Features

- **Free Publishing**: No fees, no commissions (0% vs 30% on App Store)
- **Instant Approval**: Auto-published with trust score system
- **Community Reviews**: User ratings and feedback
- **Advanced Analytics**: Views, clicks, conversion tracking
- **Multilingual**: English, French, Spanish (more coming)
- **SEO Optimized**: Big Tech level optimization
- **Moderation System**: Community-driven reports
- **Badges System**: Gamification for creators and testers

---

## 🏗️ TECH STACK

### Frontend
- **Pure HTML/CSS/JavaScript** (No framework, ultra-lightweight)
- **Font Awesome** for icons
- **Responsive Design** (Mobile-first)

### Backend
- **Node.js** + Express
- **Turso** (SQLite) for database
- **JWT** for authentication
- **bcrypt** for password hashing

### Architecture
- **NEXUS AXION Pattern**: API Gateway + Backend Service separation
- **Security Layer**: SQL injection protection, XSS prevention, rate limiting
- **Logging System**: Comprehensive security and API logging

---

## 🚀 QUICK START

### Prerequisites

- Node.js 18+
- Turso account (free tier available)

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/your-username/nexus-web-hub.git
cd nexus-web-hub
```

2. **Install dependencies**
```bash
npm install
```

3. **Configure environment variables**
```bash
cp .env.example .env
# Edit .env with your credentials
```

4. **Start the server**
```bash
npm start
```

5. **Open in browser**
```
http://localhost:3000
```

---

## 🔧 ENVIRONMENT VARIABLES

Create a `.env` file at the root:

```env
# Database (Turso)
DATABASE_URL=libsql://your-database.turso.io
DATABASE_AUTH_TOKEN=your_turso_auth_token

# JWT
JWT_SECRET=your_super_secret_jwt_key_32_chars_min

# Admin
ADMIN_EMAIL=admin@nexusstudio.com
ADMIN_PASSWORD=YourSecurePassword123!
ADMIN_KEY=your_admin_api_key

# Server
PORT=3000
NODE_ENV=production
APP_URL=https://nexuswebhub.com

# Rate Limiting (optional)
RATE_LIMIT_REQUESTS=100
RATE_LIMIT_WINDOW_MS=900000

# Reset DB (DANGER)
RESET_DB=false
```

---

## 📁 PROJECT STRUCTURE

```
nexus-web-hub/
├── assets/                  # Static assets
│   ├── logos/              # Logo files
│   ├── badges/system/      # Badge SVGs
│   ├── icons/              # Category icons
│   └── contributors/       # Contributor badges
├── i18n/                   # Translations
│   ├── fr.json            # French
│   ├── en.json            # English
│   └── es.json            # Spanish
├── logs/                   # Auto-generated logs
│   ├── api-*.log          # API logs
│   ├── security-*.log     # Security logs
│   └── errors-*.log       # Error logs
├── index.html             # Homepage
├── webapp.html            # Webapp detail page
├── redirect.html          # External redirection page
├── auth.html              # Login/Signup page
├── profile.html           # User profile page
├── submit.html            # Submit/Edit webapp page
├── admin.html             # Admin panel
├── 404.html               # Error page
├── api.js                 # API Gateway (entry point)
├── server.js              # Backend Service
├── utils.js               # Backend utilities
├── package.json           # Dependencies
├── robots.txt             # SEO configuration
└── README.md              # This file
```

---

## 🎯 API ENDPOINTS

### Public Endpoints

- `GET /api/health` - Health check
- `GET /api/stats` - Global statistics
- `GET /api/webapps` - List webapps (with filters)
- `GET /api/webapps/:id` - Get webapp details
- `POST /api/auth/signup` - Create account
- `POST /api/auth/login` - Login
- `GET /sitemap.xml` - SEO sitemap

### Protected Endpoints (require authentication)

- `GET /api/auth/me` - Get current user
- `POST /api/webapps` - Create webapp
- `PUT /api/webapps/:id` - Update webapp
- `DELETE /api/webapps/:id` - Delete webapp
- `POST /api/webapps/:id/reviews` - Create review
- `POST /api/webapps/:id/click` - Track click
- `POST /api/reports` - Report webapp

### Admin Endpoints (require admin key)

- `POST /api/admin/login` - Admin login
- `GET /api/admin/reports` - Get all reports
- `GET /api/admin/webapps` - Get all webapps
- `PUT /api/admin/reports/:id` - Resolve report
- `DELETE /api/admin/webapps/:id` - Delete webapp (admin)
- `GET /api/admin/logs` - View logs
- `GET /api/admin/stats` - Security statistics

---

## 🔒 SECURITY FEATURES

### Implemented Protections

✅ **SQL Injection Prevention**: Pattern detection and sanitization  
✅ **XSS Protection**: Input sanitization and validation  
✅ **Rate Limiting**: Per-IP and per-user limits  
✅ **HTTPS Enforcement**: Only HTTPS URLs accepted  
✅ **Password Hashing**: bcrypt with salt rounds  
✅ **JWT Authentication**: Secure token-based auth  
✅ **CORS Protection**: Configured CORS policy  
✅ **Request Validation**: Size limits and format checks  

### Security Logging

All security events are logged:
- Failed login attempts
- SQL injection attempts
- XSS attempts
- Rate limit violations
- Blocked IPs
- Admin access attempts

Logs location: `logs/security-YYYY-MM-DD.log`

---

## 🎨 CUSTOMIZATION

### Adding a New Language

1. Create translation file: `i18n/de.json` (German example)
2. Copy structure from `i18n/en.json`
3. Translate all keys
4. Add language option in `index.html`:
```html
<option value="de">🇩🇪 Deutsch</option>
```

### Adding a New Category

1. Add icon SVG to `assets/icons/icon-newcategory.svg`
2. Update category validation in `utils.js`:
```javascript
const validCategories = [..., 'newcategory'];
```
3. Add category option in `submit.html`
4. Add translation keys in all `i18n/*.json` files

### Customizing Design

All CSS is inline in HTML files. Main color variables:

```css
:root {
  --bg-deep-space: #0a0e27;
  --bg-card: #1a1f3a;
  --text-primary: #E0E6ED;
  --text-secondary: #a0aec0;
  --accent-cyan: #00d9ff;
  --accent-purple: #8b5cf6;
  --accent-green: #10b981;
  --accent-gold: #fbbf24;
  --accent-red: #ef4444;
}
```

---

## 🚢 DEPLOYMENT

### Render (Recommended)

1. Create new Web Service
2. Connect GitHub repository
3. Build Command: `npm install`
4. Start Command: `node api.js`
5. Add environment variables
6. Deploy

### Railway

1. Create new project
2. Connect repository
3. Add environment variables
4. Deploy automatically

### Vercel

1. Import project
2. Framework: Other
3. Build: `npm install`
4. Output: `./`
5. Install command: `npm install`
6. Start: `node api.js`

---

## 📊 ANALYTICS & MONITORING

### Built-in Analytics

- **Webapp Views**: Unique views per user
- **Webapp Clicks**: Total clicks on "Open Webapp"
- **Click Sources**: Track where clicks come from (catalog, detail, search)
- **Review Stats**: Average ratings, review counts
- **User Badges**: Automatic badge awarding based on activity

### Admin Dashboard

Access at `/admin.html`:
- View all reports
- Moderate webapps
- Delete inappropriate content
- View security logs
- Monitor system health

### Log Analysis

```bash
# View recent API calls
tail -f logs/api-$(date +%Y-%m-%d).log

# View security events
tail -f logs/security-$(date +%Y-%m-%d).log

# Count errors today
grep ERROR logs/errors-$(date +%Y-%m-%d).log | wc -l
```

---

## 🐛 TROUBLESHOOTING

### Database Connection Error

```
Error: Failed to connect to database
```

**Solution**: Check `DATABASE_URL` and `DATABASE_AUTH_TOKEN` in `.env`

### Rate Limit Exceeded

```
Error: Rate limit exceeded
```

**Solution**: Wait 15 minutes or adjust `RATE_LIMIT_*` in `.env`

### Webapp Not Displaying

**Possible causes**:
1. Database not initialized - Set `RESET_DB=true` temporarily
2. Wrong category selected
3. Trust score too low (< 30) - Check admin panel

### Admin Login Fails

**Solution**: Verify `ADMIN_EMAIL` and `ADMIN_PASSWORD` match `.env` values

---

## 🤝 CONTRIBUTING

We welcome contributions! Here's how:

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

### Contribution Guidelines

- Follow existing code style
- Add comments for complex logic
- Test thoroughly before submitting
- Update README if needed

---

## 📝 LICENSE

MIT License - feel free to use this project for personal or commercial purposes.

---

## 👨‍💻 AUTHOR

**Daouda Abdoul Anzize**  
Nexus Studio

- Email: contact@nexusstudio.com
- GitHub: [@anzize](https://github.com/anzize)

---

## 🙏 ACKNOWLEDGMENTS

- Font Awesome for icons
- Turso for database
- Render for hosting
- The open-source community

---

## 🔮 ROADMAP

### Phase 1 (MVP) ✅
- [x] Basic CRUD operations
- [x] Authentication system
- [x] Review system
- [x] Admin panel
- [x] Security layer
- [x] Multilingual support

### Phase 2 (Q1 2025)
- [ ] Collections/Favorites
- [ ] Follow system
- [ ] Notifications
- [ ] Advanced analytics
- [ ] Email notifications
- [ ] API webhooks

### Phase 3 (Q2 2025)
- [ ] Monetization (ads, premium)
- [ ] Mobile app
- [ ] Advanced search (AI)
- [ ] Community forum
- [ ] Creator dashboard
- [ ] A/B testing

---

## 📞 SUPPORT

Need help? Contact us:
- Email: contact@nexusstudio.com
- GitHub Issues: [Create an issue](https://github.com/your-username/nexus-web-hub/issues)

---

**Made with ❤️ by Nexus Studio**