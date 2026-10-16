const {Pool} = require('pg');

const pool = new Pool();

// Consulta parametrizada: los valores van aparte, nunca dentro del texto SQL.
function query(text, params) {
  return pool.query(text, params);
}

module.exports = {query};
