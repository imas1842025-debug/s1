const express = require('express');
const router = express.Router();
const supabase = require('../db/supabase');
const authenticateToken = require('../middleware/authenticateToken');
const requireRole = require('../middleware/requireRole');

// Créer une classe
router.post('/', authenticateToken, requireRole('admin', 'enseignant'), async (req, res) => {
  const { nom, niveau } = req.body;

  try {
    const { data, error } = await supabase
      .from('classes')
      .insert([{ nom, niveau }])
      .select();

    if (error) throw error;

    res.status(201).json(data[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Lister toutes les classes
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('classes')
      .select('*');

    if (error) throw error;

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Obtenir les classes d'un enseignant spécifique (NOUVELLE ROUTE)
router.get('/enseignant/:id', authenticateToken, async (req, res) => {
  const enseignantId = req.params.id;
  
  try {
    const { data, error } = await supabase
      .from('classes')
      .select('*')
      .eq('enseignant_id', enseignantId);

    if (error) throw error;

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Obtenir les élèves d'une classe
router.get('/:id/eleves', authenticateToken, async (req, res) => {
  const classeId = req.params.id;

  try {
    const { data, error } = await supabase
      .from('users')
      .select('id, nom, prenom, email')
      .eq('classe_id', classeId)
      .eq('role', 'eleve');

    if (error) throw error;

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;