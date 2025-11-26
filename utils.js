// utils.js - Backend Utilities for Nexus Web Hub
import crypto from 'crypto';

// Generate unique ID
export function generateId(prefix = '') {
  const timestamp = Date.now().toString(36);
  const randomStr = crypto.randomBytes(8).toString('hex');
  return prefix ? `${prefix}_${timestamp}_${randomStr}` : `${timestamp}_${randomStr}`;
}

// Validate email format
export function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// Validate URL (HTTPS only, no localhost)
export function validateWebappURL(url) {
  try {
    const parsed = new URL(url);
    
    // HTTPS only
    if (parsed.protocol !== 'https:') {
      return { valid: false, error: 'URL must use HTTPS protocol' };
    }
    
    // Block localhost/internal IPs
    const hostname = parsed.hostname.toLowerCase();
    if (
      hostname === 'localhost' ||
      hostname.startsWith('127.') ||
      hostname.startsWith('192.168.') ||
      hostname.startsWith('10.') ||
      hostname.match(/^172\.(1[6-9]|2\d|3[01])\./)
    ) {
      return { valid: false, error: 'Local/internal URLs not allowed' };
    }
    
    // Block dangerous protocols
    if (['javascript:', 'data:', 'file:'].includes(parsed.protocol)) {
      return { valid: false, error: 'Protocol not allowed' };
    }
    
    return { valid: true, url: parsed.href };
  } catch (error) {
    return { valid: false, error: 'Invalid URL format' };
  }
}

// Sanitize text input (prevent XSS)
export function sanitizeText(text) {
  if (typeof text !== 'string') return '';
  
  return text
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;')
    .trim();
}

// Validate webapp data
export function validateWebappData(data) {
  const errors = [];
  
  // Name
  if (!data.name || data.name.length < 3 || data.name.length > 100) {
    errors.push('Name must be between 3 and 100 characters');
  }
  
  // URL
  const urlValidation = validateWebappURL(data.url);
  if (!urlValidation.valid) {
    errors.push(urlValidation.error);
  }
  
  // Category
  const validCategories = ['productivity', 'design', 'games', 'api', 'nocode', 'other'];
  if (!validCategories.includes(data.category)) {
    errors.push('Invalid category');
  }
  
  // Description short
  if (!data.description_short || data.description_short.length < 20 || data.description_short.length > 200) {
    errors.push('Short description must be between 20 and 200 characters');
  }
  
  // Tags (optional but validate if provided)
  if (data.tags && !Array.isArray(data.tags)) {
    errors.push('Tags must be an array');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

// Calculate trust score for webapp
export function calculateTrustScore(webapp, creator) {
  let score = 50; // Base score
  
  // Creator verified (+20)
  if (creator.badges && creator.badges.includes('verified-creator')) {
    score += 20;
  }
  
  // Account age > 30 days (+10)
  const accountAge = Date.now() - creator.created_at;
  if (accountAge > 30 * 24 * 60 * 60 * 1000) {
    score += 10;
  }
  
  // HTTPS URL (+10)
  if (webapp.url && webapp.url.startsWith('https://')) {
    score += 10;
  }
  
  // Long description (+10)
  if (webapp.description_long && webapp.description_long.length > 100) {
    score += 10;
  }
  
  // GitHub provided (+10)
  if (webapp.github_url) {
    score += 10;
  }
  
  // Video provided (+5)
  if (webapp.video_url) {
    score += 5;
  }
  
  // Image provided (+5)
  if (webapp.image_url) {
    score += 5;
  }
  
  // Penalties
  if (webapp.description_short && webapp.description_short.length < 20) {
    score -= 20;
  }
  
  if (!webapp.tags || webapp.tags.length === 0) {
    score -= 10;
  }
  
  // Suspicious domains
  const suspiciousDomains = ['bit.ly', 'tinyurl.com', 'goo.gl', 't.co'];
  if (suspiciousDomains.some(domain => webapp.url.includes(domain))) {
    score -= 30;
  }
  
  return Math.max(0, Math.min(100, score)); // Clamp between 0-100
}

// Check badge eligibility
export function checkBadgeEligibility(user, stats) {
  const newBadges = [];
  
  // Verified Creator: 3+ webapps + 30+ days
  const accountAge = Date.now() - user.created_at;
  if (
    stats.webapps_count >= 3 &&
    accountAge > 30 * 24 * 60 * 60 * 1000 &&
    !user.badges.includes('verified-creator')
  ) {
    newBadges.push('verified-creator');
  }
  
  // Beginner Tester: 10+ reviews
  if (stats.reviews_count >= 10 && !user.badges.includes('beginner-tester')) {
    newBadges.push('beginner-tester');
  }
  
  // Pro Tester: 50+ reviews + 70% helpful
  if (
    stats.reviews_count >= 50 &&
    stats.helpful_ratio >= 0.7 &&
    !user.badges.includes('pro-tester')
  ) {
    newBadges.push('pro-tester');
  }
  
  // Legendary Tester: 200+ reviews + 80% helpful
  if (
    stats.reviews_count >= 200 &&
    stats.helpful_ratio >= 0.8 &&
    !user.badges.includes('legendary-tester')
  ) {
    newBadges.push('legendary-tester');
  }
  
  return newBadges;
}

// Format date for display
export function formatDate(timestamp) {
  return new Date(timestamp).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

// Generate webapp slug for SEO-friendly URLs
export function generateSlug(name, id) {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  
  return `${slug}-${id.substring(0, 8)}`;
}