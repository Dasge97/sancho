const express = require('express');
const {query} = require('../db');
const {requireAuth} = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  const {rows} = await query('SELECT id, number, total FROM invoices WHERE user_id = $1 ORDER BY id DESC', [req.user.id]);
  res.json(rows);
});

router.get('/:id', async (req, res) => {
  const {rows} = await query('SELECT id, number, total FROM invoices WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
  if (!rows.length) return res.status(404).end();
  res.json(rows[0]);
});

module.exports = router;
