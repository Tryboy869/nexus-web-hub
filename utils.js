// utils.js - Fonctions utilitaires partagées
// NEXUS WEB HUB - Nexus Studio

// ========== VALIDATION ==========

export function validateEmail(email) {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email);
}

export function validatePassword(password) {
  // Min 6 caractères
  return password && password.length >= 6;
}

export function validateURL(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:';
  } catch (error) {
    return false;
  }
}

export function validateWebappName(name) {
  return name && name.length >= 3 && name.length <= 100;
}

export function validateDescription(text, maxLength = 1000) {
  return text && text.length > 0 && text.length <= maxLength;
}

// ========== GÉNÉRATION ID ==========

export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

// ========== SANITIZATION ==========

export function sanitizeHTML(text) {
  if (!text) return '';
  return text
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

export function sanitizeInput(text) {
  if (!text) return '';
  return text.trim().substring(0, 10000); // Max 10k chars
}

// ========== SLUG GENERATION ==========

export function generateSlug(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove accents
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ========== DATE HELPERS ==========

export function formatDate(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleDateString('fr-FR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

export function timeAgo(timestamp) {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  
  const intervals = {
    année: 31536000,
    mois: 2592000,
    semaine: 604800,
    jour: 86400,
    heure: 3600,
    minute: 60
  };
  
  for (const [name, secondsInInterval] of Object.entries(intervals)) {
    const interval = Math.floor(seconds / secondsInInterval);
    if (interval >= 1) {
      return interval === 1 
        ? `il y a 1 ${name}`
        : `il y a ${interval} ${name}s`;
    }
  }
  
  return 'à l\'instant';
}

// ========== BADGES LOGIC ==========

export function calculateBadges(stats) {
  const badges = [];
  
  // Créateur Vérifié
  if (stats.webapps_count >= 3 && stats.account_age_days >= 30) {
    badges.push('verified-creator');
  }
  
  // Testeurs
  if (stats.reviews_count >= 10) {
    badges.push('beginner-tester');
  }
  
  if (stats.reviews_count >= 50 && stats.helpful_percentage >= 70) {
    badges.push('pro-tester');
  }
  
  if (stats.reviews_count >= 200 && stats.helpful_percentage >= 80) {
    badges.push('legendary-tester');
  }
  
  // Contributeur (si a une PR GitHub acceptée)
  if (stats.has_github_contribution) {
    badges.push('contributor');
  }
  
  return badges;
}

// ========== RATING HELPERS ==========

export function calculateAverageRating(reviews) {
  if (!reviews || reviews.length === 0) return 0;
  
  const sum = reviews.reduce((acc, review) => acc + review.rating, 0);
  return Math.round((sum / reviews.length) * 10) / 10; // 1 décimale
}

export function renderStars(rating) {
  const fullStars = Math.floor(rating);
  const hasHalfStar = rating % 1 >= 0.5;
  const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0);
  
  return '⭐'.repeat(fullStars) + 
         (hasHalfStar ? '✨' : '') + 
         '☆'.repeat(emptyStars);
}

// ========== CATEGORIES ==========

export const CATEGORIES = [
  { id: 'productivity', name: 'Productivité', icon: '⚡' },
  { id: 'design', name: 'Design', icon: '🎨' },
  { id: 'game', name: 'Jeu', icon: '🎮' },
  { id: 'api', name: 'API/Outils Dev', icon: '🔧' },
  { id: 'nocode', name: 'No-Code', icon: '🚀' },
  { id: 'other', name: 'Autre', icon: '📦' }
];

export function getCategoryName(categoryId) {
  const category = CATEGORIES.find(c => c.id === categoryId);
  return category ? category.name : 'Autre';
}

export function getCategoryIcon(categoryId) {
  const category = CATEGORIES.find(c => c.id === categoryId);
  return category ? category.icon : '📦';
}

// ========== ERROR MESSAGES ==========

export const ERRORS = {
  // Auth
  INVALID_EMAIL: 'Email invalide',
  INVALID_PASSWORD: 'Le mot de passe doit contenir au moins 6 caractères',
  EMAIL_ALREADY_EXISTS: 'Cet email est déjà utilisé',
  INVALID_CREDENTIALS: 'Email ou mot de passe incorrect',
  UNAUTHORIZED: 'Vous devez être connecté',
  
  // Webapps
  INVALID_URL: 'L\'URL doit commencer par https://',
  URL_ALREADY_EXISTS: 'Cette URL est déjà enregistrée',
  INVALID_NAME: 'Le nom doit contenir entre 3 et 100 caractères',
  INVALID_DESCRIPTION: 'La description est requise',
  INVALID_CATEGORY: 'Catégorie invalide',
  WEBAPP_NOT_FOUND: 'Webapp introuvable',
  NOT_OWNER: 'Vous n\'êtes pas le propriétaire de cette webapp',
  
  // Reviews
  INVALID_RATING: 'La note doit être entre 1 et 5',
  ALREADY_REVIEWED: 'Vous avez déjà noté cette webapp',
  CANNOT_REVIEW_OWN: 'Vous ne pouvez pas noter votre propre webapp',
  
  // Reports
  INVALID_REASON: 'Raison du signalement requise',
  ALREADY_REPORTED: 'Vous avez déjà signalé cet élément',
  
  // Generic
  SERVER_ERROR: 'Erreur serveur',
  NOT_FOUND: 'Ressource introuvable',
  RATE_LIMIT: 'Trop de requêtes, veuillez réessayer plus tard'
};

// ========== SUCCESS MESSAGES ==========

export const SUCCESS = {
  ACCOUNT_CREATED: 'Compte créé avec succès',
  LOGIN_SUCCESS: 'Connexion réussie',
  WEBAPP_CREATED: 'Webapp créée avec succès',
  WEBAPP_UPDATED: 'Webapp mise à jour',
  WEBAPP_DELETED: 'Webapp supprimée',
  REVIEW_CREATED: 'Avis publié',
  REPORT_CREATED: 'Signalement envoyé',
  PROFILE_UPDATED: 'Profil mis à jour'
};

// ========== RESPONSE HELPERS ==========

export function successResponse(data, message) {
  return {
    success: true,
    message: message || SUCCESS.LOGIN_SUCCESS,
    data
  };
}

export function errorResponse(message, code = 400) {
  return {
    success: false,
    message: message || ERRORS.SERVER_ERROR,
    code
  };
}