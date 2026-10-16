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
  const {rows} = await query('SELECT id, number, total FROM invoices WHERE id = $1', [req.params.id]);
  if (!rows.length) return res.status(404).end();
  res.json(rows[0]);
});

module.exports = router;
