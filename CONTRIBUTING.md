# 🤝 Guide de Contribution - Nexus Web Hub

Merci de votre intérêt pour contribuer à **Nexus Web Hub** ! Ce guide vous explique comment participer au projet.

---

## 📋 Table des Matières

1. [Principes de Contribution](#principes)
2. [Types de Contributions](#types)
3. [Workflow de Contribution](#workflow)
4. [Standards de Code](#standards)
5. [Processus de Review](#review)
6. [Communication](#communication)

---

## 🎯 Principes de Contribution {#principes}

### Ce que Vous POUVEZ Contribuer

✅ **Code de la plateforme** :
- Amélioration UI/UX (composants React)
- Optimisation performance (frontend/backend)
- Corrections de bugs
- Tests automatisés
- Documentation technique
- Scripts d'automatisation

✅ **Assets & Design** :
- SVG animations (badges, icônes)
- Améliorations palette de couleurs
- Optimisations accessibilité

✅ **Sécurité** :
- Détection vulnérabilités
- Améliorations modération automatique
- Protection contre abus

### Ce que Vous NE POUVEZ PAS Contribuer via PR

❌ **Webapps** : Utilisez le formulaire sur le site (pas de PR pour ajouter des projets au catalogue)  
❌ **Modifications catalogue** : Les données utilisateurs sont protégées  
❌ **Changements algorithme ranking** : Nécessite validation architecture  
❌ **Modifications modèle économique** : Décisions business réservées aux mainteneurs

---

## 🛠️ Types de Contributions {#types}

### 1. 🐛 **Correction de Bugs**

**Processus** :
1. Vérifier qu'une issue n'existe pas déjà
2. Ouvrir une issue avec reproduction détaillée
3. Attendre validation par un mainteneur
4. Fork + créer branche `bugfix/nom-du-bug`
5. Fixer le bug + ajouter test de régression
6. Ouvrir une PR référençant l'issue

**Template issue** :
```markdown
**Description du bug**
Description claire et concise.

**Reproduction**
1. Aller sur '...'
2. Cliquer sur '...'
3. Observer '...'

**Comportement attendu**
Ce qui devrait se passer.

**Screenshots**
Si applicable.

**Environnement**
- OS: [ex: macOS 14.0]
- Navigateur: [ex: Chrome 120]
- Version: [ex: 1.0.0]
```

---

### 2. ✨ **Nouvelles Features**

**Processus** :
1. Ouvrir une **Discussion** (pas une issue) pour proposer l'idée
2. Expliquer le besoin, cas d'usage, bénéfices
3. Attendre feedback communauté + validation mainteneurs
4. Si approuvé → créer issue associée
5. Fork + créer branche `feature/nom-feature`
6. Développer + tests + documentation
7. Ouvrir PR

**Critères d'acceptation** :
- ✅ Aligné avec philosophie projet (méritocracie, communauté, accessibilité)
- ✅ N'introduit pas de complexité excessive
- ✅ Testé et documenté
- ✅ Pas de dépendances externes lourdes (privilégier natif)

---

### 3. 📚 **Documentation**

**Toujours bienvenue !**

Types de contributions docs :
- Corrections typos/grammaire
- Clarifications techniques
- Traductions (anglais/français)
- Tutoriels d'intégration
- Exemples de code

**Branches** :
- `docs/nom-modification`

**Pas de validation préalable nécessaire** pour corrections mineures.

---

### 4. 🎨 **Design & Assets**

**SVG Animations** :
- Respecter charte graphique (voir README)
- Standards accessibilité WCAG 2.1 AA
- Fichiers < 20 KB
- Animations 60 FPS
- Support `prefers-reduced-motion`

**Composants UI** :
- Utiliser Tailwind CSS (pas de CSS externe)
- Mobile-first
- Dark mode par défaut
- Hover states fluides

---

### 5. 🔒 **Sécurité**

**Vulnérabilités** : **NE PAS** ouvrir d'issue publique !

**Processus de divulgation responsable** :
1. Envoyer détails à : nexusstudio100@gmail.com
2. Objet : `[SECURITY] Titre vulnérabilité`
3. Inclure :
   - Description vulnérabilité
   - Étapes reproduction
   - Impact potentiel
   - Suggestions correction (si applicable)

**Délai de réponse** : < 48h  
**Reconnaissance** : Crédits dans CHANGELOG + badge Contributor

---

## 🔄 Workflow de Contribution {#workflow}

### 1. Fork & Clone

```bash
# Fork via interface GitHub

# Clone votre fork
git clone https://github.com/VOTRE-USERNAME/nexus-web-hub.git
cd nexus-web-hub

# Ajouter remote upstream
git remote add upstream https://github.com/Tryboy869/nexus-web-hub.git
```

### 2. Créer une Branche

```bash
# Mettre à jour main
git checkout main
git pull upstream main

# Créer branche feature/bugfix
git checkout -b feature/ma-feature
# OU
git checkout -b bugfix/mon-bug
# OU
git checkout -b docs/ma-doc
```

**Convention noms de branches** :
- `feature/` : Nouvelle fonctionnalité
- `bugfix/` : Correction bug
- `docs/` : Documentation
- `refactor/` : Refactorisation code
- `test/` : Ajout tests
- `chore/` : Tâches maintenance

### 3. Développer

```bash
# Installer dépendances
npm install
pip install -r requirements.txt

# Configurer environnement
cp .env.example .env
# Éditer .env

# Lancer dev
npm run dev  # Frontend
python server.py  # Backend (terminal séparé)
```

**Guidelines code** :
- Faire des commits atomiques (1 changement = 1 commit)
- Messages de commit en anglais (convention)
- Tester localement avant commit

### 4. Tests

```bash
# Tests unitaires frontend
npm test

# Tests backend
pytest

# Linting
npm run lint
```

**Coverage minimum** : 80% pour nouvelles features

### 5. Commit

**Convention Conventional Commits** :

```bash
# Format
<type>(<scope>): <description>

# Exemples
feat(catalog): add filter by rating
fix(auth): resolve token expiration bug
docs(readme): update installation steps
style(ui): improve card hover animation
refactor(api): simplify search endpoint
test(webapp): add integration tests
chore(deps): update dependencies
```

**Types** :
- `feat` : Nouvelle fonctionnalité
- `fix` : Correction bug
- `docs` : Documentation
- `style` : Changements style (formatage, CSS)
- `refactor` : Refactorisation (ni feat ni fix)
- `test` : Ajout tests
- `chore` : Maintenance (deps, config)

### 6. Push & Pull Request

```bash
# Push vers votre fork
git push origin feature/ma-feature
```

**Ouvrir PR sur GitHub** :

1. Aller sur votre fork
2. Cliquer "Compare & pull request"
3. **Remplir le template PR** (auto-généré)
4. Assigner des labels appropriés
5. Lier issue(s) concernée(s) : `Closes #123`

**Template PR** :
```markdown
## Description
Brève description des changements.

## Type de changement
- [ ] Bug fix (non-breaking change qui corrige un bug)
- [ ] Nouvelle feature (non-breaking change qui ajoute une fonctionnalité)
- [ ] Breaking change (fix ou feature qui casserait fonctionnalités existantes)
- [ ] Documentation

## Checklist
- [ ] Mon code respecte les conventions du projet
- [ ] J'ai commenté les parties complexes
- [ ] J'ai mis à jour la documentation
- [ ] Mes changements ne génèrent pas de nouveaux warnings
- [ ] J'ai ajouté des tests
- [ ] Tous les tests passent localement
- [ ] J'ai vérifié l'accessibilité (WCAG AA)

## Screenshots (si applicable)
[Ajouter screenshots/GIFs]

## Tests effectués
- [ ] Testé sur Chrome
- [ ] Testé sur Firefox
- [ ] Testé sur Safari
- [ ] Testé sur mobile
```

---

## 📏 Standards de Code {#standards}

### Frontend (TypeScript/React)

**Style** :
```typescript
// ✅ BON
interface Webapp {
  id: string;
  name: string;
  createdAt: Date;
}

function WebappCard({ webapp }: { webapp: Webapp }) {
  return (
    <div className="rounded-lg p-4">
      <h3>{webapp.name}</h3>
    </div>
  );
}

// ❌ MAUVAIS
function card(props: any) {  // any interdit
  return <div style={{ borderRadius: '8px' }}>{props.name}</div>;  // inline styles
}
```

**Règles** :
- ✅ TypeScript strict (pas de `any`)
- ✅ Noms explicites (pas de `x`, `temp`, `data`)
- ✅ Hooks avant le return
- ✅ Tailwind CSS (pas de CSS inline)
- ✅ Props interfaces obligatoires
- ✅ Destructuring props

### Backend (Python)

**Style** :
```python
# ✅ BON
from typing import Optional
from pydantic import BaseModel

class WebappCreate(BaseModel):
    name: str
    url: str
    category: str
    description: Optional[str] = None

@app.post("/api/webapps")
async def create_webapp(webapp: WebappCreate):
    """Créer une nouvelle webapp."""
    # Validation
    if not is_valid_url(webapp.url):
        raise HTTPException(400, "URL invalide")
    
    # Logique métier
    result = await db.insert_webapp(webapp)
    return {"success": True, "data": result}

# ❌ MAUVAIS
@app.post("/api/webapps")
def create(data):  # pas de types
    db.insert(data)  # pas de validation
    return data  # pas de structure
```

**Règles** :
- ✅ Type hints obligatoires
- ✅ Pydantic models pour validation
- ✅ Docstrings (Google style)
- ✅ Async/await pour I/O
- ✅ Gestion erreurs explicite
- ✅ PEP 8 (Black formatter)

### Accessibilité

**Checklist WCAG 2.1 AA** :
- ✅ Contraste couleurs ≥ 4.5:1
- ✅ Navigation clavier complète
- ✅ ARIA labels sur éléments interactifs
- ✅ `alt` text sur images
- ✅ Focus visible
- ✅ Pas de flashing content
- ✅ Support `prefers-reduced-motion`

**Test** :
```bash
# Lighthouse accessibility audit
npm run lighthouse

# Vérification contraste
npm run check-contrast
```

### Performance

**Optimisations requises** :
- ✅ Lazy loading images (`loading="lazy"`)
- ✅ Code splitting routes
- ✅ Memoization composants lourds
- ✅ Debounce inputs recherche
- ✅ Pagination (pas de load infini 1000+ items)

**Benchmarks** :
- Lighthouse Performance Score ≥ 90
- First Contentful Paint < 1.5s
- Time to Interactive < 3s

---

## 🔍 Processus de Review {#review}

### Timeline

1. **PR ouverte** : Auto-check CI/CD (linting, tests)
2. **Review initiale** : < 48h (commentaires mainteneurs)
3. **Discussions** : Échanges si clarifications nécessaires
4. **Modifications** : Itérations selon feedback
5. **Approbation** : ≥ 1 mainteneur approuve
6. **Merge** : Squash & merge vers `main`

### Critères d'Approbation

✅ **Code** :
- Respecte conventions du projet
- Tests passent (CI/CD vert)
- Coverage ≥ 80%
- Pas de régression performance

✅ **Documentation** :
- Commentaires parties complexes
- README mis à jour si besoin
- CHANGELOG.md mis à jour

✅ **Accessibilité** :
- WCAG 2.1 AA respecté
- Navigation clavier testée
- Contraste vérifié

### Si votre PR est Refusée

**Raisons courantes** :
- Manque de tests
- Non aligné avec philosophie projet
- Breaking change non justifié
- Performance dégradée
- Standards accessibilité non respectés

**Que faire ?** :
1. Lire attentivement les commentaires
2. Poser questions si incompréhension
3. Modifier selon feedback
4. Re-request review

---

## 💬 Communication {#communication}

### Canaux

- **GitHub Issues** : Bugs, features validées
- **GitHub Discussions** : Propositions, questions, idées
- **Email** : nexusstudio100@gmail.com (questions générales)
- **Discord** : (Coming soon)

### Bonne Pratique

✅ **Faire** :
- Être respectueux et constructif
- Chercher d'abord si question déjà posée
- Fournir contexte et détails
- Accepter le feedback positivement

❌ **Ne pas faire** :
- Spammer issues/PRs
- Demander merge prématuré
- Être agressif/impoli
- Ignorer feedback mainteneurs

### Reconnaissance

**Tous les contributeurs sont reconnus** :

1. **CONTRIBUTORS.md** : Liste complète
2. **Badge GitHub** : Contributor badge
3. **CHANGELOG.md** : Crédits par version
4. **README** : Section contributeurs (selon impact)

**Progression** :
- 1-5 PRs : 🌟 Contributor
- 6-20 PRs : ⭐ Active Contributor
- 21+ PRs : 💎 Core Contributor

---

## 🎓 Ressources

### Guides Techniques

- [Architecture NEXUS AXION 3.5](./docs/ARCHITECTURE.md)
- [API Documentation](./docs/API.md)
- [Database Schema](./docs/DATABASE.md)
- [Système Badges](./docs/BADGES.md)

### Outils

- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [React Docs](https://react.dev/)
- [FastAPI Docs](https://fastapi.tiangolo.com/)
- [Tailwind CSS](https://tailwindcss.com/docs)

### Standards

- [Conventional Commits](https://www.conventionalcommits.org/)
- [WCAG 2.1 AA](https://www.w3.org/WAI/WCAG21/quickref/)
- [Semantic Versioning](https://semver.org/)

---

## ❓ Questions Fréquentes

**Q: Je n'ai jamais contribué à un projet open source. Par où commencer ?**  
R: Commencez par des `good first issue` ! Ce sont des issues simples pour débuter. N'hésitez pas à poser des questions.

**Q: Combien de temps avant review de ma PR ?**  
R: Objectif < 48h pour première review. Patience si weekend/vacances.

**Q: Ma PR n'est pas parfaite, dois-je attendre ?**  
R: Non ! Ouvrez une Draft PR pour feedback précoce. Meilleur que perfect tard.

**Q: Puis-je travailler sur plusieurs issues simultanément ?**  
R: Oui, mais max 2-3 pour éviter fragmentation. Finissez avant d'en prendre d'autres.

**Q: Je ne sais pas coder, puis-je contribuer ?**  
R: Oui ! Documentation, traductions, design, tests utilisateurs sont précieux.

---

## 🙏 Remerciements

**Merci de contribuer à Nexus Web Hub !**

Chaque contribution, petite ou grande, améliore la plateforme pour toute la communauté.

Ensemble, construisons le meilleur store du Web. 🚀

---

<div align="center">

**Des questions ?**

📧 nexusstudio100@gmail.com  
💬 [GitHub Discussions](https://github.com/Tryboy869/nexus-web-hub/discussions)

**Bon code ! 👨‍💻👩‍💻**

</div>