const express = require('express');
const router = express.Router();
const supabase = require('../db/supabase');
const jwt = require('jsonwebtoken');

// Connexion
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      return res.status(401).json({ error: error.message });
    }

    res.json({
      access_token: data.session.access_token,
      user: {
        id: data.user.id,
        email: data.user.email,
        role: data.user.role,
        nom: data.user.nom,
        prenom: data.user.prenom
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Inscription élève
router.post('/register/eleve', async (req, res) => {
  const { email, password, nom, prenom, classe } = req.body;

  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          role: 'eleve',
          nom,
          prenom,
          classe,
          active: false // Doit être validé par un enseignant
        }
      }
    });

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.status(201).json({ 
      message: 'Compte créé, en attente de validation',
      user: data.user 
    });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Réinitialisation mot de passe
router.post('/reset-password', async (req, res) => {
  const { email } = req.body;

  try {
    const { data, error } = await supabase.auth.resetPasswordForEmail(email);
    
    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json({ message: 'Email de réinitialisation envoyé' });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;