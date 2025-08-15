const { Readable } = require('stream');
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { google } = require('googleapis');
const jwt = require('jsonwebtoken');
const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Middleware de logging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  
  // Log supplémentaire pour les requêtes POST
  if (req.method === 'POST') {
    console.log('Headers:', req.headers);
    
    // Ne pas logger le corps pour les requêtes de fichiers
    if (req.headers['content-type'] && req.headers['content-type'].startsWith('multipart/form-data')) {
      console.log('Contenu: Fichier uploadé');
    } else {
      console.log('Body:', req.body);
    }
  }
  
  next();
});

// Configuration Google OAuth
let oAuth2Client;
let drive;

const initGoogleDrive = async () => {
  try {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      throw new Error('Identifiants Google manquants');
    }
    
    oAuth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      'urn:ietf:wg:oauth:2.0:oob'
    );
    
    if (!process.env.GOOGLE_REFRESH_TOKEN) {
      throw new Error('Refresh token manquant');
    }
    
    oAuth2Client.setCredentials({
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN
    });
    
    await oAuth2Client.getAccessToken();
    console.log('✅ Google Drive configuré');
    
    drive = google.drive({
      version: 'v3',
      auth: oAuth2Client
    });
  } catch (error) {
    console.error('❌ Erreur Google Drive:', error.message);
  }
};

initGoogleDrive();

// Configuration multer
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 20 * 1024 * 1024 // 20MB
  }
});

// Middleware d'authentification JWT
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) return res.status(401).json({ error: 'Accès non autorisé' });

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      console.error('❌ Erreur JWT:', err.message);
      return res.status(403).json({ error: 'Token invalide' });
    }
    req.user = user;
    next();
  });
};

// Route d'upload
app.post('/api/upload', authenticateToken, upload.single('file'), async (req, res) => {
  if (!drive) {
    return res.status(500).json({ error: 'Google Drive non configuré' });
  }

  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Aucun fichier fourni' });
    }

    const fileBuffer = req.file.buffer;
    const fileName = req.file.originalname;
    
    const file = await drive.files.create({
      requestBody: {
        name: fileName,
        parents: [process.env.GOOGLE_DRIVE_FOLDER_ID]
      },
      media: {
        mimeType: req.file.mimetype,
        body: Readable.from(fileBuffer),
      }
    });
    
    await drive.permissions.create({
      fileId: file.data.id,
      requestBody: {
        role: 'reader',
        type: 'anyone'
      }
    });
    
    const fileUrl = `https://drive.google.com/file/d/${file.data.id}/view`;
    
    res.json({ 
      success: true,
      fileUrl,
      fileName,
      fileId: file.data.id
    });
  } catch (error) {
    console.error('❌ Erreur upload:', error.message);
    res.status(500).json({ 
      success: false,
      error: 'Échec du téléversement'
    });
  }
});

// Route de suppression
app.post('/api/delete-file', authenticateToken, async (req, res) => {
  if (!drive) {
    return res.status(500).json({ error: 'Google Drive non configuré' });
  }

  try {
    const { fileId } = req.body;
    
    if (!fileId) {
      return res.status(400).json({ error: 'ID fichier manquant' });
    }

    await drive.files.delete({
      fileId: fileId
    });
    
    res.json({ 
      success: true,
      message: 'Fichier supprimé avec succès'
    });
  } catch (error) {
    console.error('❌ Erreur suppression:', error.message);
    res.status(500).json({ 
      success: false,
      error: 'Échec de la suppression'
    });
  }
});

// Route de test
app.get('/', (req, res) => {
  res.json({ 
    status: 'running',
    message: 'API Google Drive opérationnelle',
    timestamp: new Date().toISOString()
  });
});

// Gestion des erreurs
app.use((err, req, res, next) => {
  console.error('🔥 Erreur serveur:', err.stack);
  res.status(500).json({ 
    error: 'Erreur serveur',
    message: err.message 
  });
});

// Démarrer le serveur
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 API lancée sur http://0.0.0.0:${PORT}`);
});
