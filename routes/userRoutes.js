const express = require('express');
const router = express.Router();
const supabase = require('../db/supabase');
const authenticateToken = require('../middleware/authenticateToken');
const requireRole = require('../middleware/requireRole');

// Créer un nouvel utilisateur (Admin seulement)
router.post('/', authenticateToken, requireRole('admin'), async (req, res) => {
  const { nom, prenom, email, password, role, matieres, classe_id } = req.body;

  try {
    // Créer l'utilisateur dans l'authentification Supabase
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        nom,
        prenom,
        role,
        matieres,
        classe_id
      }
    });

    if (authError) throw authError;

    const userId = authData.user.id;

    // Journaliser dans l'audit
    const { error: auditError } = await supabase
      .from('user_audit')
      .insert({
        user_id: userId,
        action: 'create',
        new_data: { nom, prenom, email, role, matieres, classe_id },
        changed_by: req.user.id
      });

    if (auditError) throw auditError;

    res.status(201).json(authData.user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Obtenir la liste des utilisateurs (Admin seulement)
router.get('/', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { data: users, error } = await supabase
      .from('users')
      .select(`
        id, 
        email, 
        role, 
        nom, 
        prenom, 
        matieres, 
        created_at,
        classe_id,
        classes (nom, niveau)
      `);

    if (error) throw error;

    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Mettre à jour un utilisateur
router.put('/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  const userId = req.params.id;
  const updates = req.body;

  try {
    // Récupérer l'ancienne version
    const { data: oldUser, error: oldError } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (oldError) throw oldError;

    // Mettre à jour dans auth
    const { data: authData, error: authError } = await supabase.auth.admin.updateUserById(
      userId,
      { 
        email: updates.email,
        user_metadata: updates 
      }
    );

    if (authError) throw authError;

    // Mettre à jour dans la table publique
    const { data: dbData, error: dbError } = await supabase
      .from('users')
      .update(updates)
      .eq('id', userId)
      .select();

    if (dbError) throw dbError;

    // Journaliser dans l'audit
    await supabase
      .from('user_audit')
      .insert({
        user_id: userId,
        action: 'update',
        old_data: oldUser,
        new_data: updates,
        changed_by: req.user.id
      });

    res.json(dbData[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Désactiver un utilisateur
router.delete('/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  const userId = req.params.id;

  try {
    // Récupérer l'ancienne version
    const { data: oldUser, error: oldError } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (oldError) throw oldError;

    // Désactiver plutôt que supprimer
    await supabase.auth.admin.updateUserById(
      userId,
      { 
        user_metadata: { ...oldUser.user_metadata, active: false } 
      }
    );

    // Journaliser dans l'audit
    await supabase
      .from('user_audit')
      .insert({
        user_id: userId,
        action: 'disable',
        old_data: oldUser,
        changed_by: req.user.id
      });

    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;