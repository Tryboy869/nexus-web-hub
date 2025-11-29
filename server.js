// PATCH POUR server.js - Méthode createWebapp avec retry

// Remplacer la méthode createWebapp complète dans server.js
// Chercher "async createWebapp(data, userId)" et remplacer toute la fonction

async createWebapp(data, userId) {
  try {
    console.log('[Backend] createWebapp called with userId:', userId);
    
    // Validation des données
    const validation = validateWebappData(data);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    // Vérifier que l'utilisateur existe (AVEC RETRY pour Turso)
    console.log('[Backend] Checking if user exists (with retry)...');
    let userResult;
    let retries = 5; // 5 tentatives
    let userFound = false;

    while (retries > 0 && !userFound) {
      userResult = await this.db.execute({
        sql: 'SELECT id, name FROM users WHERE id = ?',
        args: [userId]
      });
      
      if (userResult.rows.length > 0) {
        userFound = true;
        console.log('[Backend] User found:', userResult.rows[0]);
        break;
      }
      
      console.log(`[Backend] User not found, retrying... (${retries} attempts left)`);
      // Attendre 300ms pour la réplication Turso
      await new Promise(resolve => setTimeout(resolve, 300));
      retries--;
    }

    if (!userFound) {
      console.error('[Backend] User not found after retries:', userId);
      throw new Error('User not found. Please try again in a few seconds.');
    }

    const user = userResult.rows[0];
    
    // Générer ID unique
    const webappId = `webapp_${generateId()}`;
    const now = Date.now();
    
    // Utiliser le nom du développeur s'il est fourni, sinon le nom de l'utilisateur
    const developer = data.developer || user.name;
    
    console.log('[Backend] Creating webapp:', {
      id: webappId,
      name: data.name,
      developer: developer,
      url: data.url,
      category: data.category
    });

    // Insérer la webapp
    await this.db.execute({
      sql: `
        INSERT INTO webapps (
          id, name, developer, creator_id, description_short, description_long,
          url, github_url, video_url, image_url, category, tags,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        webappId,
        data.name,
        developer,
        userId,
        data.description_short,
        data.description_long || null,
        data.url,
        data.github_url || null,
        data.video_url || null,
        data.image_url || null,
        data.category,
        JSON.stringify(data.tags || []),
        now,
        now
      ]
    });

    console.log('[Backend] Webapp created successfully:', webappId);

    // Récupérer la webapp créée (AVEC RETRY aussi)
    let webappResult;
    retries = 5;
    let webappFound = false;

    while (retries > 0 && !webappFound) {
      webappResult = await this.db.execute({
        sql: 'SELECT * FROM webapps WHERE id = ?',
        args: [webappId]
      });
      
      if (webappResult.rows.length > 0) {
        webappFound = true;
        break;
      }
      
      await new Promise(resolve => setTimeout(resolve, 300));
      retries--;
    }

    if (!webappFound) {
      console.warn('[Backend] Webapp created but not found in query, returning basic data');
      return {
        success: true,
        message: 'Webapp created successfully',
        webapp: {
          id: webappId,
          name: data.name,
          developer: developer,
          url: data.url,
          category: data.category,
          description_short: data.description_short
        }
      };
    }

    const webapp = this.formatWebapp(webappResult.rows[0]);

    return {
      success: true,
      message: 'Webapp created successfully',
      webapp
    };

  } catch (error) {
    console.error('[Backend] Error in createWebapp:', error);
    throw error;
  }
}