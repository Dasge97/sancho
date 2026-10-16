const express = require('express');
const {query} = require('../db');
const {requireAuth} = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  const {rows} = await query('SELECT id, number, total FROM invoices WHERE user_id = $1 ORDER BY id DESC', [req.user.id]);
  res.json(rows);
});

router.get('/search', async (req, res) => {
  const {rows} = await query(`SELECT id, number, total FROM invoices WHERE user_id = ${req.user.id} AND number LIKE '%${req.query.q}%'`);
  res.json(rows);
});

module.exports = router;
