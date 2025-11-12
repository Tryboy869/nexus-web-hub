# 🌐 Nexus Web Hub

[![License: Custom](https://img.shields.io/badge/License-Custom-blue.svg)](./LICENSE)
[![Maintained](https://img.shields.io/badge/Maintained-Yes-green.svg)](https://github.com/Tryboy869/nexus-web-hub)

> **La plateforme communautaire pour découvrir, publier et évaluer le meilleur du Web.**

![Nexus Web Hub Intro](./assets/storyline/nexus-web-hub-intro.svg)

---

## 🎯 Le Problème Qu'On Résout

Les stores d'applications (Google Play, App Store) sont réservés aux apps natives. Le Web est fragmenté : comment découvrir les meilleures **webapps, outils, jeux et APIs** ?

**Nexus Web Hub** est la réponse :

- ✅ **Store universel** pour tout ce qui fonctionne dans un navigateur
- ✅ **Visibilité méritocratique** (qualité, pas budget publicitaire)
- ✅ **Communauté auto-régulée** (testeurs badgés, avis vérifiés)
- ✅ **Gratuit et ouvert** (publier = gratuit, découvrir = gratuit)

---

## 🌟 Pourquoi Nexus Web Hub ?

| Caractéristique | Stores classiques | Product Hunt | **Nexus Web Hub** |
|-----------------|-------------------|--------------|-------------------|
| **Type de contenu** | Apps natives | Produits tech | **Webapps uniquement** ✅ |
| **Visibilité** | Pay-to-win | Gaming (upvotes) | **Méritocratique** ✅ |
| **Reviews** | Anonymes | Superficielles | **Testeurs badgés** ✅ |
| **Coût publication** | 25-99$/an | Gratuit mais ranking payant | **100% gratuit** ✅ |
| **Modération** | Opaque | Humaine lente | **Auto + communautaire** ✅ |
| **Collections** | Algorithme | Listes éditeurs | **Curation communautaire** ✅ |

**Verdict** : La première plateforme **Web-first, community-driven, quality-focused**.

---

## ✨ Fonctionnalités Principales

### 🔍 **Découverte Intelligente**

- **Catalogue universel** : Tous les types de webapps (jeux, outils, APIs, UI kits, sites créatifs)
- **Recherche sémantique** : Trouve par besoin ("créer un logo rapidement") pas juste par mots-clés
- **Filtres avancés** : Catégorie, note, date, trending
- **Collections curées** : Listes communautaires par thématiques

![Catalog](./assets/screenshots/catalog-preview.svg)

### ✍️ **Publication Simple**

- **Formulaire intuitif** : Nom, description, URL, catégorie → publié en 30 secondes
- **Modération automatique** : Vérification doublons, liens valides, contenu approprié
- **Aperçu instantané** : Iframe sécurisée + screenshot auto-généré
- **Édition libre** : Modifier/supprimer vos projets à tout moment

### ⭐ **Système d'Évaluation Professionnel**

- **Avis détaillés** : Texte + note étoilée + vote "utile"
- **Testeurs badgés** : ![Beginner](./assets/badges/system/badge-beginner-tester.svg) ![Pro](./assets/badges/system/badge-pro-tester.svg) ![Legendary](./assets/badges/system/badge-legendary-tester.svg)
- **Score de fiabilité** : Uptime, sécurité, note communauté
- **Marketplace testers** : Engagez des testeurs légendaires pour audits payants

### 🏆 **Gamification & Communauté**

**Progression Testeurs** :
```
🔰 Beginner Tester → ⚡ Pro Tester → 👑 Legendary Tester
(10 avis)          (50 avis + 70% utiles)  (200 avis + 80% utiles)
```

**Badges Disponibles** :

![Verified Creator](./assets/badges/system/badge-verified-creator.svg) ![Supporter](./assets/badges/system/badge-supporter.svg) ![Contributor](./assets/badges/system/badge-contributor.svg) ![Trending](./assets/badges/system/badge-trending.svg) ![Featured](./assets/badges/system/badge-featured.svg)

---

## 🚀 Démarrage Rapide

### Pour les Utilisateurs

1. **Découvrir** : Visitez [nexus-web-hub.com](https://nexus-web-hub.onrender.com)
2. **Explorer** : Parcourez le catalogue sans inscription
3. **S'inscrire** (optionnel) : Créer un compte pour publier/évaluer

### Pour les Créateurs

1. **Publier** : Cliquez "Publier votre webapp"
2. **Remplir** : Nom, description, URL (30 secondes)
3. **Validé** : Votre projet est public instantanément !

### Pour les Développeurs

```bash
# Cloner le repo
git clone https://github.com/Tryboy869/nexus-web-hub.git
cd nexus-web-hub

# Installer les dépendances
npm install

# Configurer l'environnement
cp .env.example .env
# Éditer .env avec vos variables

# Lancer en développement
npm run dev
```

**Stack** : React + TypeScript + Tailwind (frontend) / Python + FastAPI (backend) / Turso (database)

---

## 🏗️ Architecture

**Nexus Web Hub** suit la philosophie **NEXUS AXION 3.5** :

```
nexus-web-hub/
├── app.tsx              # Frontend complet (React/TypeScript)
├── server.py            # Backend complet (FastAPI/Python)
├── package.json         # Dépendances Node.js
├── requirements.txt     # Dépendances Python
├── .env.example         # Template variables d'environnement
└── assets/              # SVG animations & assets statiques
    ├── logos/
    ├── badges/
    ├── storyline/
    ├── contributors/
    └── icons/
```

**Principes** :
- ✅ 2 fichiers code maximum (frontend + backend)
- ✅ Déploiement instant (Render, Railway, Vercel)
- ✅ Zéro configuration complexe
- ✅ Production-ready immédiatement

[Lire la documentation architecture complète →](./docs/ARCHITECTURE.md)

---

## 💎 Philosophie & Valeurs

### 🎯 **Méritocracie Pure**

> "La visibilité se gagne par la qualité, jamais par le budget."

- **Pas de ranking payant** : Tous les projets ont la même chance d'être découverts
- **Algorithme transparent** : Score calculé sur uptime, sécurité, notes réelles
- **Pas de sponsored posts** : Zéro publicité déguisée

### 🤝 **Communauté Auto-Régulée**

- **Testeurs badgés** : Progression méritée (avis utiles)
- **Signalements communautaires** : Jury aléatoire pour décisions
- **Pénalités transparentes** : Avis fake = badge perdu + ban 1 an

### 🚀 **Accessible à Tous**

- **Publier = gratuit** : Aucun coût pour soumettre votre projet
- **Découvrir = gratuit** : Catalogue ouvert à tous
- **Monétisation éthique** : Options pro pour créateurs avancés (analytics, curation)

---

## 💰 Modèle Économique (Éthique)

### ✅ **Gratuit pour Toujours**

- Publication illimitée
- Découverte du catalogue
- Avis et notes
- Collections personnelles (1 gratuite)

### 💎 **Nexus Pro (5$/mois - Optionnel)**

**Pour créateurs actifs** :
- Analytics avancées (origine trafic, taux de conversion)
- A/B testing descriptions
- 3 collections curées publiques
- Badge "Soutient Nexus 💎"
- Support prioritaire

### 🏢 **Enterprise (25$/mois)**

**Pour équipes/entreprises** :
- 10 collections curées
- Collaboration multi-utilisateurs
- API access privé
- White-label collections
- Onboarding dédié

### 🛠️ **Services Connexes (Séparés)**

- **Nexus Deploy** : Hébergement optimisé webapps
- **Nexus Analytics** : Analytics respectueux vie privée
- **Nexus CDN** : CDN rapide pour assets

**Principe sacré** : La plateforme reste neutre. Les services techniques financent le projet sans biaiser la visibilité.

---

## 🛠️ Technologies

### Frontend
- **React 18** + TypeScript
- **Tailwind CSS** (design system)
- **Zustand** (state management)
- **Lucide React** (icônes)

### Backend
- **Python 3.11** + FastAPI
- **Turso** (SQLite distribué)
- **Redis** (cache temps réel)
- **Meilisearch** (recherche sémantique)

### Déploiement
- **Frontend** : Cloudflare Pages
- **Backend** : Fly.io / Railway
- **Database** : Turso (global edge)
- **CDN** : Cloudflare

### Modération
- **Détection spam** : Heuristiques + ML léger
- **Doublons** : Hash URL + fuzzy matching
- **Contenu** : Keyword filtering + OpenAI Moderation API

---

## 🤝 Contribution

**Nexus Web Hub** accepte les contributions sur le **code de la plateforme uniquement**.

**Vous pouvez contribuer sur** :
- ✅ Amélioration UI/UX
- ✅ Optimisation performance
- ✅ Corrections bugs
- ✅ Tests automatisés
- ✅ Documentation

**Vous NE pouvez PAS** :
- ❌ Soumettre des webapps via PR (utilisez le formulaire sur le site)
- ❌ Modifier le catalogue directement
- ❌ Changer l'algorithme de ranking sans validation

[Lire le guide complet de contribution →](./CONTRIBUTING.md)

### Workflow Contribution

1. Fork le repo
2. Créer une branche : `git checkout -b feature/ma-feature`
3. Commit : `git commit -m "feat: description"`
4. Push : `git push origin feature/ma-feature`
5. Ouvrir une Pull Request

**Standards** :
- Code TypeScript strict (pas de `any`)
- Tests unitaires pour nouvelles features
- Documentation inline en français
- Respect des conventions Prettier/ESLint

---

## 👥 Équipe & Contributeurs

### Fondateur

[![Anzize](./assets/contributors/contributor-anzize.svg)](https://github.com/Tryboy869)

**Daouda Abdoul Anzize**  
CEO & Founder - Nexus Studio

- 🏆 Architecte logiciel
- 💎 Créateur NEXUS AXION
- 🚀 Visionnaire Web

📧 **Contact** :
- Pro : nexusstudio100@gmail.com
- Perso : anzizdaouda0@gmail.com
- GitHub : [@Tryboy869](https://github.com/Tryboy869)

### Contributeurs

*Aucun contributeur externe pour le moment. Soyez le premier !*

[Rejoindre l'équipe →](./CONTRIBUTING.md)

---

## 📚 Documentation

- [**Guide d'Architecture**](./docs/ARCHITECTURE.md) - Structure technique détaillée
- [**Guide API**](./docs/API.md) - Documentation endpoints REST
- [**Guide Modération**](./docs/MODERATION.md) - Règles et automatisation
- [**Guide Badges**](./docs/BADGES.md) - Système de progression
- [**FAQ**](./docs/FAQ.md) - Questions fréquentes

---

## 🗺️ Roadmap

### ✅ **Phase 1 : MVP (Mois 1-3)** - EN COURS

- [x] Architecture backend/frontend
- [x] Catalogue + recherche
- [x] Soumission webapps
- [x] Système auth
- [ ] Ratings/Avis basiques
- [ ] Modération automatique V1

### 📅 **Phase 2 : Communauté (Mois 4-6)**

- [ ] Système badges complet
- [ ] Profils utilisateurs
- [ ] Collections curées
- [ ] Signalements communautaires
- [ ] Dashboard créateurs

### 📅 **Phase 3 : Marketplace (Mois 7-9)**

- [ ] Marketplace testeurs (engagement payant)
- [ ] API publique
- [ ] Analytics avancées
- [ ] Abonnements Pro/Enterprise

### 📅 **Phase 4 : Écosystème (Mois 10-12)**

- [ ] Nexus Deploy (hébergement)
- [ ] Nexus Analytics (privacy-first)
- [ ] PWA mobile
- [ ] Internationalisation

---

## 📜 License

**Custom License** - Nexus Web Hub

Ce projet utilise une licence personnalisée pour protéger son modèle économique tout en restant ouvert :

**Vous POUVEZ** :
- ✅ Utiliser le code pour apprendre
- ✅ Contribuer au projet via PRs
- ✅ Fork pour usage personnel/éducatif
- ✅ Utiliser l'API publique

**Vous NE POUVEZ PAS** :
- ❌ Créer un clone commercial de Nexus Web Hub
- ❌ Revendre le code ou services dérivés
- ❌ Utiliser le nom/logo "Nexus Web Hub" sans autorisation

[Lire la licence complète →](./LICENSE)

---

## 🌟 Soutenir le Projet

**Nexus Web Hub** est gratuit et le restera. Vous pouvez nous soutenir en :

1. ⭐ **Starrant ce repo** (visibilité GitHub)
2. 💎 **Devenant Supporter** (badge + reconnaissance)
3. 🔗 **Partageant** la plateforme dans vos réseaux
4. 🐛 **Signalant des bugs** via Issues
5. 💡 **Proposant des idées** via Discussions

---

## 📧 Contact

**Questions ? Feedback ? Partenariats ?**

- **Email pro** : nexusstudio100@gmail.com
- **Email perso** : anzizdaouda0@gmail.com
- **GitHub Issues** : [Ouvrir une issue](https://github.com/Tryboy869/nexus-web-hub/issues)
- **Discussions** : [Démarrer une discussion](https://github.com/Tryboy869/nexus-web-hub/discussions)

---

<div align="center">

**Fait avec ❤️ par [Nexus Studio](https://github.com/Tryboy869)**

*Découvrir. Publier. Évaluer. Le meilleur du Web, en un seul endroit.*

![Logo NWH](./assets/logos/logo-nwh.svg)

</div>