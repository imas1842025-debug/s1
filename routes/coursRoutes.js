const express = require('express');
const router = express.Router();
const supabase = require('../db/supabase');
const authenticateToken = require('../middleware/authenticateToken');
const requireRole = require('../middleware/requireRole');

// Récupérer tous les cours d'un enseignant
router.get('/', authenticateToken, requireRole('enseignant'), async (req, res) => {
  const enseignantId = req.user.id; // ID de l'utilisateur connecté

  try {
    const { data, error } = await supabase
      .from('cours')
      .select(`
        id,
        titre,
        description,
        fichier_url,
        created_at,
        classe_id,
        classes (nom)
      `)
      .eq('enseignant_id', enseignantId);

    if (error) throw error;

    // Transformer les données pour inclure le nom de la classe
    const coursAvecClasse = data.map(cours => ({
      ...cours,
      classe_nom: cours.classes.nom
    }));

    res.json(coursAvecClasse);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Créer un nouveau cours
router.post('/', authenticateToken, requireRole('enseignant'), async (req, res) => {
  const { classe_id, titre, description, fichier_url } = req.body;
  const enseignantId = req.user.id; // ID de l'utilisateur connecté

  try {
    const { data, error } = await supabase
      .from('cours')
      .insert([{ 
        classe_id, 
        enseignant_id: enseignantId, 
        titre, 
        description, 
        fichier_url 
      }])
      .select();

    if (error) throw error;

    res.status(201).json(data[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Modifier un cours
router.put('/:id', authenticateToken, requireRole('enseignant'), async (req, res) => {
  const { id } = req.params;
  const { classe_id, titre, description, fichier_url } = req.body;
  const enseignantId = req.user.id; // ID de l'utilisateur connecté

  try {
    const { data, error } = await supabase
      .from('cours')
      .update({ 
        classe_id, 
        titre, 
        description, 
        fichier_url 
      })
      .eq('id', id)
      .eq('enseignant_id', enseignantId)
      .select();

    if (error) throw error;
    if (!data.length) return res.status(404).json({ error: 'Cours non trouvé' });

    res.json(data[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Supprimer un cours
router.delete('/:id', authenticateToken, requireRole('enseignant'), async (req, res) => {
  const { id } = req.params;
  const enseignantId = req.user.id; // ID de l'utilisateur connecté

  try {
    const { error } = await supabase
      .from('cours')
      .delete()
      .eq('id', id)
      .eq('enseignant_id', enseignantId);

    if (error) throw error;

    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;