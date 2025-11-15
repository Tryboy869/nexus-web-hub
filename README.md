# 🌌 Nexus Web Hub

> Le store communautaire pour webapps, outils et jeux évalués par la communauté

[![Nexus Axion](https://img.shields.io/badge/Nexus%20Axion-3.5-00d9ff?style=for-the-badge)](https://github.com/Tryboy869/nexus-web-hub)
[![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)](LICENSE)

Créé par **Daouda Abdoul Anzize** - [Nexus Studio](mailto:nexusstudio100@gmail.com)

---

## 🎯 Vision

Nexus Web Hub est le "Google Play Store du Web" avec :
- ✅ **Visibilité méritocratique** : Qualité > Budget publicitaire
- 🏆 **Système de badges** : Créateurs vérifiés, testeurs professionnels
- 🌍 **Communauté auto-régulée** : Avis authentiques, signalements
- 💎 **100% gratuit** (MVP) : Pas de paywall, pas de pub

---

## 🏗️ Architecture NEXUS AXION 3.5

### Structure (4 fichiers code)

```
nexus-web-hub/
├── index.html          # Frontend complet (HTML + CSS + JS)
├── api.js              # API Gateway (Point d'entrée)
├── server.js           # Backend Service (Logique métier)
├── utils.js            # Fonctions utilitaires
├── package.json        # Dépendances
├── .env                # Variables (PAS dans Git)
└── assets/             # SVG badges, logos
```

### Stack Technique

- **Frontend** : HTML5 + CSS3 + JavaScript Vanilla (onclick direct)
- **Gateway** : Node.js + Express
- **Backend** : Node.js + @libsql/client
- **Database** : Turso (LibSQL - SQLite distribué)
- **Auth** : JWT + bcrypt

**Aucun framework frontend** = Zéro build step, deploy instantané

---

## 🚀 Installation Locale

### Prérequis

- Node.js >= 18
- npm ou yarn
- Compte Turso (gratuit)

### Étapes

1. **Clone le repo**
```bash
git clone https://github.com/Tryboy869/nexus-web-hub.git
cd nexus-web-hub
```

2. **Installe les dépendances**
```bash
npm install
```

3. **Configure l'environnement**
```bash
cp .env.example .env
# Édite .env avec tes identifiants Turso
```

4. **Crée une base Turso**
```bash
# Installe Turso CLI
curl -sSfL https://get.tur.so/install.sh | bash

# Crée une DB
turso db create nexus-web-hub

# Obtiens l'URL et le token
turso db show nexus-web-hub
```

5. **Lance le serveur**
```bash
npm start
# Ou en mode dev (auto-reload)
npm run dev
```

6. **Ouvre le navigateur**
```
http://localhost:3000
```

---

## 📊 Base de Données

### Tables

- **users** : Comptes utilisateurs (auth, profil, badges)
- **webapps** : Catalogue de webapps
- **reviews** : Avis et notes
- **reports** : Signalements communautaires

### Reset DB (développement)

```bash
# Via l'API (si admin)
curl -X POST http://localhost:3000/api/admin/reset-database \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

---

## 🎨 Fonctionnalités MVP

### ✅ Implémentées

- [x] Auth (inscription/connexion)
- [x] Soumission webapp
- [x] Catalogue avec recherche + filtres
- [x] Page détails webapp
- [x] Système reviews (1-5 étoiles)
- [x] Badges automatiques
- [x] Signalements
- [x] Responsive mobile-first
- [x] i18n FR/EN (structure)

### 🔜 Phase 2 (Post-MVP)

- [ ] Profil utilisateur éditable
- [ ] Collections curées
- [ ] Panel admin modération
- [ ] Analytics avancées
- [ ] Notifications
- [ ] Marketplace testeurs
- [ ] Abonnements Pro

---

## 🔐 Sécurité

- ✅ Mots de passe hashés (bcrypt)
- ✅ JWT tokens (expiration 30 jours)
- ✅ Rate limiting (100 req/15min)
- ✅ Sanitization inputs
- ✅ CORS configuré
- ✅ HTTPS requis pour URLs webapps

---

## 🚢 Déploiement Render

### Configuration

**Build Command**
```
npm install
```

**Start Command**
```
node api.js
```

### Variables d'Environnement (Render Dashboard)

```
DATABASE_URL = libsql://your-db.turso.io
DATABASE_AUTH_TOKEN = your-token
JWT_SECRET = your-secret-key-strong
```

**⚠️ Ne PAS ajouter PORT** (géré automatiquement)

---

## 🧪 Tests

### Test Backend (CLI)

```bash
# Health check
curl http://localhost:3000/api/health

# Stats
curl http://localhost:3000/api/stats

# Liste webapps
curl http://localhost:3000/api/webapps
```

### Test Frontend

1. Ouvre http://localhost:3000
2. Vérifie Console (F12) : Pas d'erreurs rouges
3. Teste chaque bouton
4. Vérifie responsive (mode mobile)

---

## 📞 Contact

**Créateur** : Daouda Abdoul Anzize  
**Email Pro** : nexusstudio100@gmail.com  
**Email Perso** : anzizdaouda0@gmail.com  
**GitHub** : [@Tryboy869](https://github.com/Tryboy869)

---

## 📄 Licence

MIT License - Libre d'utilisation pour projets personnels et commerciaux

---

## 🙏 Remerciements

- Architecture **NEXUS AXION 3.5** by Anzize Daouda
- Assets SVG créés par Nexus Studio
- Communauté open source

---

**🌌 Construis l'impossible. Simplement.**