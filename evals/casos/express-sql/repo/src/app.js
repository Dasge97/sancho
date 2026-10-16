const express = require('express');
const invoices = require('./routes/invoices');

const app = express();
app.use(express.json());
app.use('/invoices', invoices);

module.exports = app;
