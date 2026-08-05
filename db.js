const { Pool } = require('pg');
require('dotenv').config();

// Aquí el código toma automáticamente los datos que pusiste en tu archivo .env
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

// Esto es para probar si la conexión funciona
pool.connect((err, client, release) => {
  if (err) {
    return console.error(' Un error al conectar a la base de datos:', err.stack);
  }
  console.log('¡Conexión exitosa a la base de datos SolucionesCiberneticas, bienvenido!');
  release();
});

module.exports = pool;