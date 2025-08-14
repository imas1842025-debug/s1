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
    
    // Ne pas logger le corps pour les requêtes de fichiers (trop volumineux)
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
    // Vérifier que les variables d'environnement sont définies
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      throw new Error('Les identifiants Google OAuth sont manquants dans .env');
    }
    
    oAuth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      'urn:ietf:wg:oauth:2.0:oob'
    );
    
    // Vérifier la présence du refresh token
    if (!process.env.GOOGLE_REFRESH_TOKEN) {
      throw new Error('Refresh token manquant dans .env');
    }
    
    oAuth2Client.setCredentials({
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN
    });
    
    // Rafraîchir le token
    const token = await oAuth2Client.getAccessToken();
    console.log('✅ Token d\'accès obtenu:', token.token ? '***' + token.token.slice(-6) : 'non disponible');
    
    drive = google.drive({
      version: 'v3',
      auth: oAuth2Client
    });
    
    // Tester la connexion
    const about = await drive.about.get({ fields: 'user' });
    console.log('✅ Connecté à Google Drive en tant que:', about.data.user.emailAddress);
    
    console.log('✅ Google Drive configuré avec succès');
  } catch (error) {
    console.error('❌ Erreur configuration Google Drive:', error.message);
    console.error('Détails:', error.response?.data || error.stack);
  }
};

// Initialiser Google Drive au démarrage
initGoogleDrive();

// Configuration multer pour l'upload de fichiers
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 20 * 1024 * 1024 // Limite de 20 Mo
  }
});

// Middleware d'authentification JWT
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) return res.status(401).json({ error: 'Accès non autorisé' });

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      console.error('❌ Erreur de vérification JWT:', err.message);
      return res.status(403).json({ error: 'Token invalide' });
    }
    req.user = user;
    next();
  });
};

// Route d'upload de fichiers
app.post('/api/upload', authenticateToken, upload.single('file'), async (req, res) => {
  if (!drive) {
    return res.status(500).json({ error: 'Google Drive non configuré' });
  }

  try {
    // Vérifier si le fichier est présent
    if (!req.file) {
      console.error('Aucun fichier dans la requête:', req.headers);
      return res.status(400).json({ error: 'Aucun fichier fourni' });
    }

    const fileBuffer = req.file.buffer;
    const fileName = req.file.originalname;
    const fileSizeMB = (req.file.size / (1024 * 1024)).toFixed(2);
    
    console.log(`📤 Début d'upload: ${fileName} (${fileSizeMB} MB)`);

    // Utiliser le buffer directement
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
    
    // Rendre le fichier public
    await drive.permissions.create({
      fileId: file.data.id,
      requestBody: {
        role: 'reader',
        type: 'anyone'
      }
    });
    
    const fileUrl = `https://drive.google.com/file/d/${file.data.id}/view`;
    
    console.log(`✅ Upload réussi: ${fileName}`);
    console.log(`🔗 URL: ${fileUrl}`);
    
    res.json({ 
      success: true,
      fileUrl,
      fileName,
      fileId: file.data.id,
      fileSize: req.file.size,
      mimeType: req.file.mimetype
    });
  } catch (error) {
    console.error('❌ Erreur upload:', error.message);
    res.status(500).json({ 
      success: false,
      error: 'Échec du téléversement',
      details: error.message
    });
  }
});

// Nouvelle route pour supprimer un fichier
app.post('/api/delete-file', authenticateToken, async (req, res) => {
  if (!drive) {
    return res.status(500).json({ error: 'Google Drive non configuré' });
  }

  try {
    const { fileId } = req.body;
    
    if (!fileId) {
      return res.status(400).json({ error: 'ID fichier manquant' });
    }

    console.log(`🗑️ Tentative de suppression du fichier: ${fileId}`);
    
    await drive.files.delete({
      fileId: fileId
    });
    
    console.log(`✅ Fichier supprimé: ${fileId}`);
    res.json({ 
      success: true,
      message: 'Fichier supprimé avec succès'
    });
  } catch (error) {
    console.error('❌ Erreur lors de la suppression du fichier:', error.message);
    
    let errorMessage = 'Échec de la suppression du fichier';
    
    // Gestion spécifique des erreurs Google Drive
    if (error.code === 404) {
      errorMessage = 'Fichier non trouvé sur Google Drive';
    } else if (error.errors && error.errors[0] && error.errors[0].message) {
      errorMessage = error.errors[0].message;
    }
    
    res.status(500).json({ 
      success: false,
      error: errorMessage,
      details: error.message
    });
  }
});




// Routes
const userRoutes = require('./routes/userRoutes');
const authRoutes = require('./routes/authRoutes');
const classeRoutes = require('./routes/classeRoutes');
const coursRoutes = require('./routes/coursRoutes');

app.use('/api/users', userRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/classes', classeRoutes);
app.use('/api/cours', coursRoutes);

// Test route
app.get('/', (req, res) => {
  const serverInfo = {
    status: 'running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    googleDrive: !!drive ? 'configured' : 'not configured',
    supabase: process.env.SUPABASE_URL ? 'configured' : 'not configured',
    folderId: process.env.GOOGLE_DRIVE_FOLDER_ID || 'none'
  };
  res.json(serverInfo);
});

// Gestion des erreurs
app.use((err, req, res, next) => {
  console.error('🔥 Erreur serveur:', err.stack);
  res.status(500).json({ 
    error: 'Erreur serveur',
    message: err.message 
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`\n🚀 API lancée sur http://localhost:${PORT}`);
  console.log(`🕒 Démarrage à: ${new Date().toLocaleString()}`);
  console.log(`🔑 JWT Secret: ${process.env.JWT_SECRET ? 'configured' : 'missing'}`);
  console.log(`👤 Google Client ID: ${process.env.GOOGLE_CLIENT_ID ? 'configured' : 'missing'}`);
  console.log(`🗄️ Supabase URL: ${process.env.SUPABASE_URL || 'missing'}`);
  console.log(`⚙️ Mode: ${process.env.NODE_ENV || 'development'}\n`);
});