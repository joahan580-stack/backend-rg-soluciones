const { Pool } = require('pg');
require('dotenv').config();

// El código ahora toma la URL completa de conexión configurada en el entorno
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // Requerido para conexiones seguras a bases de datos en la nube como Neon
  }
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