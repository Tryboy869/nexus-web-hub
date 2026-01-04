// utils.js - Backend Utilities for Nexus Web Hub

import crypto from 'crypto';

/**
 * Generate unique ID
 */
export function generateId(prefix = '') {
  const timestamp = Date.now().toString(36);
  const randomStr = crypto.randomBytes(8).toString('hex');
  return prefix ? `${prefix}_${timestamp}_${randomStr}` : `${timestamp}_${randomStr}`;
}

/**
 * Validate URL (HTTPS only, no localhost)
 */
export function validateWebappURL(url) {
  try {
    const parsed = new URL(url);
    
    // ONLY HTTPS
    if (parsed.protocol !== 'https:') {
      return { valid: false, error: 'URL must use HTTPS' };
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
      return { valid: false, error: 'Local URLs not allowed' };
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

/**
 * Validate email
 */
export function validateEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Sanitize string (remove dangerous characters)
 */
export function sanitizeString(str) {
  if (typeof str !== 'string') return '';
  return str
    .trim()
    .replace(/[<>]/g, '') // Remove < and >
    .substring(0, 1000); // Max 1000 chars
}

/**
 * Validate webapp submission data
 */
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
  if (!data.category || !validCategories.includes(data.category)) {
    errors.push('Invalid category');
  }
  
  // Description short
  if (!data.description_short || data.description_short.length < 20 || data.description_short.length > 200) {
    errors.push('Short description must be between 20 and 200 characters');
  }
  
  // Optional fields validation
  if (data.github_url && data.github_url.length > 0) {
    try {
      const githubUrl = new URL(data.github_url);
      if (!githubUrl.hostname.includes('github.com')) {
        errors.push('GitHub URL must be from github.com');
      }
    } catch {
      errors.push('Invalid GitHub URL');
    }
  }
  
  if (data.video_url && data.video_url.length > 0) {
    try {
      const videoUrl = new URL(data.video_url);
      if (!videoUrl.hostname.includes('youtube.com') && !videoUrl.hostname.includes('youtu.be')) {
        errors.push('Video URL must be from YouTube');
      }
    } catch {
      errors.push('Invalid video URL');
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Calculate webapp trust score (0-100)
 */
export function calculateTrustScore(webapp, creator) {
  let score = 50; // Base score
  
  // Creator verified (+20)
  if (creator.badges && creator.badges.includes('verified-creator')) {
    score += 20;
  }
  
  // Account age (+10)
  const accountAge = Date.now() - creator.created_at;
  if (accountAge > 30 * 24 * 60 * 60 * 1000) { // 30 days
    score += 10;
  }
  
  // URL provided (+10)
  if (webapp.url && webapp.url.startsWith('https://')) {
    score += 10;
  }
  
  // Description detailed (+10)
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
  
  // Screenshot provided (+5)
  if (webapp.image_url) {
    score += 5;
  }
  
  // PENALTIES
  // Description too short (-20)
  if (webapp.description_short.length < 20) {
    score -= 20;
  }
  
  // No tags (-10)
  if (!webapp.tags || webapp.tags.length === 0) {
    score -= 10;
  }
  
  // Suspicious domains (-30)
  const suspiciousDomains = ['bit.ly', 'tinyurl.com', 'goo.gl', 't.co'];
  if (suspiciousDomains.some(domain => webapp.url.includes(domain))) {
    score -= 30;
  }
  
  return Math.max(0, Math.min(100, score)); // Clamp between 0-100
}

/**
 * Parse tags from comma-separated string
 */
export function parseTags(tagsString) {
  if (!tagsString) return [];
  
  return tagsString
    .split(',')
    .map(tag => tag.trim().toLowerCase())
    .filter(tag => tag.length > 0 && tag.length <= 30)
    .slice(0, 10); // Max 10 tags
}

/**
 * Check if user should earn badge
 */
export function checkBadgeEligibility(user, userStats) {
  const newBadges = [];
  const currentBadges = user.badges || [];
  
  // Verified Creator: 3+ webapps + account 30+ days old
  if (!currentBadges.includes('verified-creator')) {
    const accountAge = Date.now() - user.created_at;
    if (userStats.webapps_count >= 3 && accountAge >= 30 * 24 * 60 * 60 * 1000) {
      newBadges.push('verified-creator');
    }
  }
  
  // Beginner Tester: 10+ reviews
  if (!currentBadges.includes('beginner-tester')) {
    if (userStats.reviews_count >= 10) {
      newBadges.push('beginner-tester');
    }
  }
  
  // Pro Tester: 50+ reviews + 70% helpful
  if (!currentBadges.includes('pro-tester')) {
    if (userStats.reviews_count >= 50 && userStats.helpful_ratio >= 0.7) {
      newBadges.push('pro-tester');
    }
  }
  
  // Legendary Tester: 200+ reviews + 80% helpful
  if (!currentBadges.includes('legendary-tester')) {
    if (userStats.reviews_count >= 200 && userStats.helpful_ratio >= 0.8) {
      newBadges.push('legendary-tester');
    }
  }
  
  return newBadges;
}

/**
 * Format date for display
 */
export function formatDate(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

/**
 * Generate SEO-friendly slug
 */
export function generateSlug(name, id) {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  
  return `${slug}-${id.substring(0, 8)}`;
}