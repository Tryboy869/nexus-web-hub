# 🤝 Guide de Contribution - Nexus Web Hub

Merci de ton intérêt pour contribuer à Nexus Web Hub ! Ce guide explique comment participer au projet.

---

## 🎯 Types de Contributions

### 💻 Code
- Nouvelles fonctionnalités
- Corrections de bugs
- Amélioration de performances
- Refactoring

### 📚 Documentation
- Corrections de typos
- Traductions
- Guides d'utilisation
- Exemples de code

### 🎨 Design
- Amélioration UI/UX
- Nouveaux badges SVG
- Thèmes alternatifs
- Animations

### 🐛 Signalements
- Rapports de bugs
- Suggestions de fonctionnalités
- Retours d'expérience

---

## 🚀 Comment Contribuer

### 1. Fork le Projet

```bash
# Clique sur "Fork" sur GitHub
# Puis clone TON fork
git clone https://github.com/TON_USERNAME/nexus-web-hub.git
cd nexus-web-hub
```

### 2. Crée une Branche

```bash
git checkout -b feature/ma-super-feature
# Ou
git checkout -b fix/correction-bug-xyz
```

**Convention de nommage** :
- `feature/` : Nouvelle fonctionnalité
- `fix/` : Correction de bug
- `docs/` : Documentation
- `style/` : Design/CSS
- `refactor/` : Refactoring code

### 3. Développe Localement

```bash
# Installe les dépendances
npm install

# Configure .env
cp .env.example .env
# Édite .env avec ta DB Turso de test

# Lance en mode dev
npm run dev
```

### 4. Teste Tes Modifications

**Tests obligatoires** :
- [ ] L'app démarre sans erreur
- [ ] Aucune erreur dans Console (F12)
- [ ] Fonctionnalité testée manuellement
- [ ] Responsive mobile vérifié
- [ ] Pas de régression sur fonctionnalités existantes

### 5. Commit avec Message Clair

```bash
git add .
git commit -m "feat: Add user profile editing"
```

**Convention de messages** :
- `feat:` Nouvelle fonctionnalité
- `fix:` Correction de bug
- `docs:` Documentation
- `style:` CSS/Design
- `refactor:` Refactoring
- `test:` Tests
- `chore:` Maintenance

### 6. Push et Crée une Pull Request

```bash
git push origin feature/ma-super-feature
```

Puis sur GitHub :
1. Va sur ton fork
2. Clique "Compare & pull request"
3. Remplis la description (voir template ci-dessous)

---

## 📋 Template Pull Request

```markdown
## Description
[Décris ce que fait ta PR en quelques phrases]

## Type de changement
- [ ] 🐛 Bug fix
- [ ] ✨ Nouvelle fonctionnalité
- [ ] 📚 Documentation
- [ ] 🎨 Design/UI
- [ ] ♻️ Refactoring

## Checklist
- [ ] Code testé localement
- [ ] Pas d'erreurs Console
- [ ] Responsive vérifié
- [ ] Documentation mise à jour (si nécessaire)
- [ ] Pas de régression

## Screenshots (si UI)
[Ajoute des captures d'écran si tu modifies l'interface]

## Notes supplémentaires
[Infos additionnelles pour les reviewers]
```

---

## 🎨 Standards de Code

### JavaScript

**Style** :
- Indentation : 2 espaces
- Points-virgules : Oui
- Quotes : Simples `'` pour strings
- Const/Let : Toujours (jamais `var`)

**Exemple** :
```javascript
// ✅ BON
async function loadData() {
  const response = await fetch('/api/data');
  const result = await response.json();
  return result.data;
}

// ❌ MAUVAIS
function loadData(){
var response=fetch("/api/data")
return response
}
```

### HTML/CSS

**HTML** :
- Indentation : 2 espaces
- Attributs : Double quotes `"`
- Semantic tags : Privilégier `<section>`, `<article>`, etc.

**CSS** :
- Variables CSS pour couleurs
- Mobile-first (responsive)
- Classes descriptives (pas `.btn1`, `.btn2`)

### Architecture NEXUS AXION 3.5

**RÈGLES STRICTES** :
- ✅ Fichiers à la racine (jamais dans `src/`)
- ✅ HTML onclick direct (pas `addEventListener`)
- ✅ API Gateway route tout
- ✅ Backend jamais de `app.listen()`

---

## 🐛 Signalement de Bugs

### Où Signaler

Ouvre une issue GitHub : https://github.com/Tryboy869/nexus-web-hub/issues

### Template Issue Bug

```markdown
**Description**
[Décris le bug en quelques phrases]

**Steps to Reproduce**
1. Va sur '...'
2. Clique sur '...'
3. Scroll down to '...'
4. Le bug apparaît

**Expected Behavior**
[Ce qui devrait se passer]

**Actual Behavior**
[Ce qui se passe réellement]

**Screenshots**
[Si applicable]

**Environment**
- OS: [e.g. Windows 11, macOS 14]
- Browser: [e.g. Chrome 120, Firefox 121]
- URL: [e.g. https://nexus-web-hub.onrender.com]

**Console Errors**
[Copie les erreurs de la Console browser (F12)]
```

---

## 💡 Suggestions de Fonctionnalités

### Template Issue Feature Request

```markdown
**Is your feature request related to a problem?**
[Ex: Je suis frustré quand...]

**Describe the solution you'd like**
[Description claire de la fonctionnalité]

**Describe alternatives you've considered**
[Autres approches possibles]

**Additional context**
[Mockups, exemples, références]

**Priority**
- [ ] Must-have (critique)
- [ ] Nice-to-have (amélioration)
- [ ] Future (post-MVP)
```

---

## 🏆 Reconnaissance des Contributeurs

Tous les contributeurs sont ajoutés dans :
- README.md (section Contributeurs)
- assets/contributors/ (carte SVG personnalisée)
- Badge "Contributeur" automatique dans l'app

**Exemple** : `assets/contributors/contributor-anzize.svg`

---

## ⚖️ Code de Conduite

### Nos Engagements

- 🤝 Bienveillance et respect
- 🌍 Inclusivité (tous backgrounds, niveaux)
- 💬 Communication constructive
- 🎯 Focus sur le projet

### Comportements Inacceptables

- ❌ Harcèlement, insultes
- ❌ Trolling, spam
- ❌ Discrimination
- ❌ Divulgation d'infos privées

**Signalement** : nexusstudio100@gmail.com

---

## 📞 Questions ?

- **GitHub Issues** : Pour bugs et features
- **Email** : nexusstudio100@gmail.com
- **Documentation** : Consulte README.md et DEPLOYMENT.md

---

## 🎓 Première Contribution ?

**Bienvenue !** Voici quelques issues faciles pour commencer :

- Issues taggées `good first issue`
- Documentation (corrections typos)
- Traductions (EN, ES, etc.)
- Tests manuels et retours

**Pas sûr par où commencer ?**

1. Lis le README.md
2. Lance l'app localement
3. Explore le code (juste 4 fichiers !)
4. Ouvre une issue pour poser des questions

---

## 🌟 Merci !

Chaque contribution, petite ou grande, fait avancer Nexus Web Hub.

**Ensemble, construisons le meilleur store communautaire du Web ! 🚀**

---

_Créé avec 💙 par Anzize Daouda - Nexus Studio_