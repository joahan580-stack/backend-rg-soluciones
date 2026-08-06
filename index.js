const express = require('express');
const pool = require('./db');
require('dotenv').config();
const cors = require('cors');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const app = express();
const fs = require('fs');
 const path = require('path');
 const nodemailer = require('nodemailer');
 const router = express.Router();
 module.exports = router;
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/'); 
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'soporte@rgsoluciones.com.mx',         
    pass: 'hkkl xoyd jajp uxfu'   
  }
});
const upload = multer({ storage: storage });
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
const PORT = process.env.PORT || 3000;
app.get('/api/prueba', async (req, res) => {
  try {
    const resultado = await pool.query('SELECT NOW()');

    res.json({
      mensaje: '¡Este Backend está en funcionamiento conectado a PostgreSQL!',
      hora_base_datos: resultado.rows[0].now
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: 'Error en la base de datos',
      detalle: error.message
    });

  }
});


app.get('/api/productos', async (req, res) => {

  try {

    const queryText = `
      SELECT
        p.*,
        m.nombre AS marca,
        c.nombre AS categoria,
        img.url_imagen AS imagen
      FROM producto p
      INNER JOIN marca m
        ON p.idMarca = m.idMarca
      INNER JOIN categoria c
        ON p.idCategoria = c.idCategoria
      LEFT JOIN (
        SELECT DISTINCT ON (idProducto)
          idProducto,
          url_imagen
        FROM imagen_producto
      ) img
        ON p.idProducto = img.idProducto;
    `;

    const resultado = await pool.query(queryText);

    res.json(resultado.rows);

  } catch (error) {

    res.status(500).json({
      error: 'Error al obtener productos',
      detalle: error.message
    });

  }

});

app.get('/api/productos/:id', async (req, res) => {

  try {

    const idProducto = parseInt(req.params.id, 10);

    if (isNaN(idProducto)) {
      return res.status(400).json({
        error: 'El ID proporcionado no es válido'
      });
    }

    const queryText = `
      SELECT
        p.*,
        m.nombre AS marca,
        c.nombre AS categoria,
        img.url_imagen AS imagen
      FROM producto p
      INNER JOIN marca m
        ON p.idMarca = m.idMarca
      INNER JOIN categoria c
        ON p.idCategoria = c.idCategoria
      LEFT JOIN (
        SELECT DISTINCT ON (idProducto)
          idProducto,
          url_imagen
        FROM imagen_producto
      ) img
        ON p.idProducto = img.idProducto
      WHERE p.idproducto = $1;
    `;

    const resultado = await pool.query(queryText, [idProducto]);

    if (resultado.rows.length === 0) {
      return res.status(404).json({
        error: 'Producto no encontrado'
      });
    }

    res.json(resultado.rows[0]);

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: 'Error interno del servidor',
      detalle: error.message
    });

  }

});

app.post('/api/productos', upload.single('imagen'), async (req, res) => {
  const { nombre, descripcion, precio, stock, idmarca, idcategoria, estatus } = req.body;
  
  // DEBUG: Para ver qué llega
  console.log('Cuerpo recibido:', req.body); 

  try {
    // 1. Primero insertamos el producto SIN la imagen (o con un valor nulo/por defecto) 
    // para que PostgreSQL nos devuelva el ID autoincrementable.
    // (Nota: asegúrate de que tu tabla se llame 'producto' o 'productos' según corresponda).
    const queryText = `
      INSERT INTO producto (nombre, descripcion, precio, stock, idmarca, idcategoria, estatus, imagen)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *;
    `;
    
    // De momento guardamos la ruta genérica o null, 
    // porque el nombre real será el ID del producto.
    const resultado = await pool.query(queryText, [
      nombre, 
      descripcion, 
      precio, 
      stock, 
      parseInt(idmarca), 
      parseInt(idcategoria), 
      estatus, 
      null // La imagen la manejamos con el ID a continuación
    ]);

    const productoCreado = resultado.rows[0];
    const idProducto = productoCreado.idproducto; // (O el nombre de tu PK, ej: id_producto)

    // 2. Si el usuario subió una imagen, la renombramos usando su ID exacto
    if (req.file) {
      const extension = path.extname(req.file.originalname); // Ej: .jpg, .png
      const nombreArchivoFinal = `${idProducto}${extension}`; // Ej: "15.jpg"
      const rutaAntigua = req.file.path;
      const rutaNueva = path.join(__dirname, 'uploads', nombreArchivoFinal);

      // Renombramos el archivo temporal de Multer al nombre definitivo con el ID
      fs.renameSync(rutaAntigua, rutaNueva);

      // (Opcional pero recomendado) Si quieres actualizar el campo imagen en la BD con solo el nombre o ruta limpia:
      await pool.query('UPDATE producto SET imagen = $1 WHERE idproducto = $2', [nombreArchivoFinal, idProducto]);
      productoCreado.imagen = nombreArchivoFinal;
    }

    res.status(201).json(productoCreado);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/productos/:id/especificaciones', async (req, res) => {

  try {

    const idProducto = parseInt(req.params.id, 10);

    const resultado = await pool.query(
      `
      SELECT clave, valor
      FROM especificacion_producto
      WHERE idProducto = $1
      `,
      [idProducto]
    );

    res.json(resultado.rows);

  } catch (error) {

    res.status(500).json({
      error: 'Error al obtener especificaciones',
      detalle: error.message
    });

  }

});



app.get('/api/productos/:id/resenas', async (req, res) => {

  try {

    const idProducto = parseInt(req.params.id, 10);

    const resultado = await pool.query(
      `
      SELECT
        idResena,
        usuario,
        calificacion,
        comentario,
        creado_en
      FROM resena_producto
      WHERE idProducto = $1
      ORDER BY creado_en DESC
      `,
      [idProducto]
    );

    res.json(resultado.rows);

  } catch (error) {

    res.status(500).json({
      error: 'Error al obtener reseñas',
      detalle: error.message
    });

  }

});

app.post('/api/productos/:id/resenas', async (req, res) => {

  const idProducto = parseInt(req.params.id, 10);

  const {
    usuario,
    calificacion,
    comentario
  } = req.body;

  if (!calificacion || !comentario) {
    return res.status(400).json({
      error: 'La calificación y el comentario son obligatorios'
    });
  }

  try {

    const resultado = await pool.query(
      `
      INSERT INTO resena_producto
      (
        idProducto,
        usuario,
        calificacion,
        comentario
      )
      VALUES
      (
        $1,$2,$3,$4
      )
      RETURNING *
      `,
      [
        idProducto,
        usuario || 'Usuario Anónimo',
        calificacion,
        comentario
      ]
    );

    res.status(201).json({
      mensaje: 'Reseña publicada',
      resena: resultado.rows[0]
    });

  } catch (error) {

    res.status(500).json({
      error: 'Error al guardar reseña',
      detalle: error.message
    });

  }

});



app.get('/api/clientes', async (req, res) => {
  try {
    const resultado = await pool.query(`
      SELECT 
        idcliente, 
        nombre, 
        apaterno,
        amaterno,
        correo, 
        telefono, 
        idrol, 
        fecha_registro 
      FROM cliente 
      ORDER BY idcliente ASC
    `);
    res.json(resultado.rows);
  } catch (error) {
    console.error("Error al obtener clientes:", error);
    res.status(500).json({ error: 'Error al obtener clientes' });
  }
});
app.post('/api/clientes', async (req, res) => {
  try {
    
const { nombre, apaterno, amaterno, email, telefono, contrasena } = req.body;
    const correo = email;

    
    console.log("--- DATOS RECIBIDOS EN BACKEND ---");
    console.log(req.body);

   
    
    if (!nombre || !apaterno || !correo || !contrasena) {
      return res.status(400).json({ error: "Faltan datos obligatorios (nombre, apaterno, correo, contrasena)" });
    }

    
    const query = `INSERT INTO cliente (nombre, apaterno, amaterno, correo, telefono, contrasena) 
                   VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`;

                   
  const values = [nombre, apaterno, amaterno, correo, telefono, contrasena];
    
    const resultado = await pool.query(query, values);
    res.status(201).json(resultado.rows[0]);

  } catch (error) {
    console.error("ERROR DETALLADO EN BACKEND:", error);
    res.status(500).json({ error: 'Error interno', detalle: error.message });
  }
});

app.delete('/api/clientes/:id', async (req, res) => {

  try {

    const id = req.params.id;

    await pool.query(
      'DELETE FROM cliente WHERE idcliente = $1',
      [id]
    );

    res.json({
      mensaje: 'Cliente eliminado correctamente'
    });

  } catch (error) {

    res.status(500).json({
      error: 'Error al eliminar cliente',
      detalle: error.message
    });

  }

});


app.put('/api/clientes/:id', async (req, res) => {
  try {
    const id = req.params.id;

    const { nombre, apaterno, amaterno, correo, telefono, idRol } = req.body;

    const queryText = `
      UPDATE cliente 
      SET 
        nombre = $1, 
        apaterno = $2, 
        amaterno = $3, 
        correo = $4, 
        telefono = $5,
        idrol = $6
      WHERE idcliente = $7
      RETURNING *;
    `;

    const resultado = await pool.query(queryText, [
      nombre, 
      apaterno, 
      amaterno, 
      correo, 
      telefono, 
      idRol, // Nuevo parámetro
      id
    ]);

    if (resultado.rowCount === 0) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }

    res.json({
      mensaje: 'Cliente actualizado correctamente',
      cliente: resultado.rows[0]
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al actualizar', detalle: error.message });
  }
});

app.get('/api/empleado', async (req, res) => {

  try {

    const resultado = await pool.query(`
      SELECT *
      FROM empleado
      ORDER BY idempleado
    `);

    res.json(resultado.rows);

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: 'Error al obtener empleados',
      detalle: error.message
    });

  }

});

// Crear empleado
app.post('/api/empleado', async (req, res) => {

  try {

    const {
      nombre,
      apaterno,
      amaterno,
      correo,
      telefono,
      contrasena,
      idrol
    } = req.body;

    const resultado = await pool.query(
      `
      INSERT INTO empleado
      (
        nombre,
        apaterno,
        amaterno,
        correo,
        telefono,
        contrasena,
        idrol
      )
      VALUES
      (
        $1,$2,$3,$4,$5,$6,$7
      )
      RETURNING *
      `,
      [
        nombre,
        apaterno,
        amaterno,
        correo,
        telefono,
        contrasena,
        idrol
      ]
    );

    res.status(201).json(resultado.rows[0]);

  } catch (error) {
  console.error("ERROR DETALLADO:", error); // <-- Mira la terminal del servidor
  res.status(500).json({ 
    error: 'Error al crear empleado', 
    detalle: error.detail || error.message // error.detail te dirá qué columna falla en Postgres
  });
}

});

// Eliminar empleado
app.delete('/api/empleado/:id', async (req, res) => {

  try {

    await pool.query(
      'DELETE FROM empleado WHERE idempleado = $1',
      [req.params.id]
    );

    res.json({
      mensaje: 'Empleado eliminado correctamente'
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: 'Error al eliminar empleado',
      detalle: error.message
    });

  }

});
app.put('/api/empleado/:id', async (req, res) => {
  const { id } = req.params;
  // 1. Agregamos 'contrasena' a la desestructuración
  const { nombre, apaterno, amaterno, correo, telefono, idrol, contrasena } = req.body;
  
  try {
    let query;
    let params;

    // 2. Si viene una contraseña nueva, la incluimos en el UPDATE
    if (contrasena && contrasena.trim() !== '') {
      query = `UPDATE empleado 
               SET nombre=$1, apaterno=$2, amaterno=$3, correo=$4, telefono=$5, idrol=$6, contrasena=$7 
               WHERE idempleado=$8`;
      params = [nombre, apaterno, amaterno, correo, telefono, idrol, contrasena, id];
    } else {
      // Si no viene, actualizamos todo menos la contraseña
      query = `UPDATE empleado 
               SET nombre=$1, apaterno=$2, amaterno=$3, correo=$4, telefono=$5, idrol=$6 
               WHERE idempleado=$7`;
      params = [nombre, apaterno, amaterno, correo, telefono, idrol, id];
    }

    await pool.query(query, params);
    res.json({ mensaje: 'Actualizado correctamente' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al actualizar', detalle: error.message });
  }
});
// Endpoint de Login para Empleados / Administradores
app.post('/api/empleado/login', async (req, res) => {
  const { correo, contrasena } = req.body;
  
  try {
    // 1. Buscar al empleado por su correo en la base de datos
    const resultado = await pool.query(
      'SELECT * FROM empleado WHERE correo = $1',
      [correo]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({ error: 'Correo o contraseña incorrectos' });
    }

    const empleado = resultado.rows[0];

    // 2. Validar la contraseña (si la guardas en texto plano o con bcrypt)
    // Nota: Si usas bcrypt, cámbialo por bcrypt.compare(contrasena, empleado.contrasena). 
    // Si la guardas directa, déjala como una comparación simple:
    if (empleado.contrasena !== contrasena) {
      return res.status(401).json({ error: 'Correo o contraseña incorrectos' });
    }

    // 3. Responder con los datos del usuario y su idrol (1 = Admin, 2 = Empleado)
    res.json({
      success: true,
      mensaje: 'Inicio de sesión exitoso',
      idrol: empleado.idrol, 
      usuario: {
        idempleado: empleado.idempleado,
        nombre: empleado.nombre,
        apaterno: empleado.apaterno,
        correo: empleado.correo
      }
    });

  } catch (error) {
    console.error("ERROR EN LOGIN:", error);
    res.status(500).json({ 
      error: 'Error al iniciar sesión', 
      detalle: error.message 
    });
  }
});
/////////////////////////////////////////////////////////////////////////////////////////////////////////
// Ruta para eliminar producto
app.delete('/api/productos/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query('DELETE FROM producto WHERE idproducto = $1', [id]);
        
        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Producto no encontrado' });
        }
        
        res.json({ message: 'Producto eliminado correctamente' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});


// Ruta para actualizar producto
app.put('/api/productos/:id', upload.single('imagen'), async (req, res) => {
    try {
        const { id } = req.params;
        const { nombre, descripcion, precio, stock, idmarca, idcategoria, estatus } = req.body;
        
        let query;
        let values;

        // Si se envió una nueva imagen
        if (req.file) {
            query = `UPDATE producto SET nombre=$1, descripcion=$2, precio=$3, stock=$4, 
                     idmarca=$5, idcategoria=$6, estatus=$7, imagen=$8 WHERE idproducto=$9`;
            values = [nombre, descripcion, precio, stock, idmarca, idcategoria, estatus, req.file.path, id];
        } else {
            // Si no se envió imagen, no actualizamos esa columna
            query = `UPDATE producto SET nombre=$1, descripcion=$2, precio=$3, stock=$4, 
                     idmarca=$5, idcategoria=$6, estatus=$7 WHERE idproducto=$8`;
            values = [nombre, descripcion, precio, stock, idmarca, idcategoria, estatus, id];
        }

        await pool.query(query, values);
        res.json({ message: 'Producto actualizado correctamente' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});
app.get('/api/ventas', async (req, res) => {
    try {
        // Ejemplo usando PostgreSQL con tu base de datos
        const resultado = await pool.query('SELECT * FROM ventas'); // Cambia 'ventas' por el nombre real de tu tabla
        res.json(resultado.rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ mensaje: 'Error al obtener las ventas' });
    }
});
// REGISTRO
app.post('/api/auth/registro', async (req, res) => {
  const { nombre, apaterno, correo, contrasena, idrol } = req.body;
  try {
    // 1. Encriptar contraseña
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(contrasena, salt);

    const query = 'INSERT INTO cliente (nombre, apaterno, correo, contrasena, idrol) VALUES ($1, $2, $3, $4, $5) RETURNING idcliente';
    const result = await pool.query(query, [nombre, apaterno, correo, hash, idrol || 3]);
    
    res.status(201).json({ mensaje: 'Usuario registrado', id: result.rows[0].idcliente });
  } catch (error) {
    res.status(500).json({ error: 'Error al registrar' });
  }
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  
  try {
    // 1. Intentar buscar en clientes
    let result = await pool.query(
      'SELECT *, \'cliente\' as tipo FROM cliente WHERE correo = $1 AND contrasena = $2',
      [email, password]
    );

    // 2. Si no se encontró en clientes, buscar en empleados
    if (result.rows.length === 0) {
      result = await pool.query(
        'SELECT *, \'empleado\' as tipo FROM empleado WHERE correo = $1 AND contrasena = $2',
        [email, password]
      );
    }

    if (result.rows.length > 0) {
      res.status(200).json({ success: true, user: result.rows[0] });
    } else {
      res.status(401).json({ success: false, message: "Credenciales incorrectas" });
    }
  } catch (err) {
    console.error("Error en login:", err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});
 // Carpeta donde se guardarán las imágenes

app.post('/api/productos', upload.single('imagen'), async (req, res) => {
  try {
    const { 
      nombre, 
      descripcion, 
      precio, 
      stock, 
      idmarca, 
      idcategoria,
      estatus 
    } = req.body;
    const nuevoProducto = await pool.query(
  'INSERT INTO productos (nombre, precio, stock) VALUES ($1, $2, $3) RETURNING idproducto',
  [nombre, precio, stock]
);

const idProducto = nuevoProducto.rows[0].idproducto;

// 2. Si el usuario subió un archivo, lo renombramos usando el ID del producto
if (req.file) {
  const extension = path.extname(req.file.originalname); // ej. .jpg o .png
  const nuevoNombre = `${idProducto}${extension}`; // ej. "15.jpg"
  
  // Mueves/renombras el archivo temporal de multer a la carpeta uploads con el nombre del ID
  fs.renameSync(req.file.path, path.join(__dirname, 'uploads', nuevoNombre));
}
    
    // Ruta limpia para que coincida con la estructura de tu frontend
const imagenPath = req.file ? `uploads/${req.file.filename}` : null;
    const result = await pool.query(
      `INSERT INTO producto 
      (nombre, descripcion, precio, stock, idmarca, idcategoria, estatus, imagen) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
      RETURNING *`,
      [
        nombre, 
        descripcion, 
        precio, 
        stock, 
        parseInt(idmarca),       // Convertido a número por seguridad
        parseInt(idcategoria),   // Convertido a número por seguridad
        estatus || 'En Stock', 
        imagenPath
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Error al registrar producto:", error);
    res.status(500).json({ error: 'Error al registrar el producto', detalle: error.message });
  }
});

app.get('/api/marcas', async (req, res) => {
  const result = await pool.query('SELECT * FROM marca');
  res.json(result.rows);
});

// Ejemplo para categorías
app.get('/api/categorias', async (req, res) => {
  const result = await pool.query('SELECT * FROM categoria');
  res.json(result.rows);
});
app.post('/api/productos', async (req, res) => {
    // 1. Log para ver qué llega
    console.log("Headers recibidos:", req.headers);
    console.log("Cuerpo recibido:", req.body);

    // 2. Validación defensiva
    if (!req.body) {
        return res.status(400).json({ error: "El cuerpo de la petición está vacío" });
    }

    try {
        const { nombre, sku, precio } = req.body;
        // ... tu lógica de base de datos
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Ejemplo en tu controlador de órdenes / ventas en Node.js (Express)
const procesarCompra = async (req, res) => {
  const client = await pool.connect(); // Asumiendo que usas pg Pool
  try {
    await client.query('BEGIN'); // Iniciar transacción

    const { items, datosEnvio } = req.body; 
    // items es un array con [{ idproducto, cantidad }, ...]

    // 1. Insertar la orden principal (según tu lógica actual)
    const ordenQuery = 'INSERT INTO ordenes (...) VALUES (...) RETURNING idorden;';
    // const ordenRes = await client.query(ordenQuery, [...]);
    // const idorden = ordenRes.rows[0].idorden;

    // 2. Recorrer los productos y DESCONTAR EL STOCK en la base de datos
    for (let item of items) {
      const updateStockQuery = `
        UPDATE producto
        SET stock = stock - $1 
        WHERE idproducto = $2 AND stock >= $1
      `;
      const resultadoUpdate = await client.query(updateStockQuery, [item.cantidad, item.idproducto]);

      // Si no afectó filas significa que no hay stock suficiente
      if (resultadoUpdate.rowCount === 0) {
        throw new Error(`Stock insuficiente para el producto ID: ${item.idproducto}`);
      }

      // Opcional: Insertar en la tabla intermedia de detalle de orden
      // await client.query('INSERT INTO detalle_orden (idorden, idproducto, cantidad) VALUES ($1, $2, $3)', [idorden, item.idproducto, item.cantidad]);
    }

    await client.query('COMMIT'); // Guardar cambios si todo salió bien
    res.status(200).json({ success: true, message: 'Compra realizada y stock actualizado con éxito.' });

  } catch (error) {
    await client.query('ROLLBACK'); // Revertir si hay error
    console.error('Error al procesar la compra:', error);
    res.status(400).json({ success: false, message: error.message });
  } finally {
    client.release();
  }
};
// Ejemplo en tu archivo de rutas/controlador de Express
router.post('/api/ordenes', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN'); // Iniciar transacción segura

    const { items, metodoPago } = req.body; 
    // items es un arreglo con [{ idproducto, cantidad }, ...]

    for (let item of items) {
      // Descontar el stock en la tabla productos asegurando que no quede en negativo
      const queryUpdate = `
        UPDATE producto 
        SET stock = stock - $1 
        WHERE idproducto = $2 AND stock >= $1
      `;
      const resultado = await client.query(queryUpdate, [item.cantidad, item.idproducto]);

      if (resultado.rowCount === 0) {
        throw new Error(`Stock insuficiente o producto no encontrado para el ID: ${item.idproducto}`);
      }
    }

    await client.query('COMMIT'); // Guardar cambios en PostgreSQL
    res.status(200).json({ success: true, message: 'Stock actualizado correctamente en la BD' });

  } catch (error) {
    await client.query('ROLLBACK'); // Revertir si algo falla
    console.error('Error al actualizar stock:', error);
    res.status(400).json({ success: false, message: error.message });
  } finally {
    client.release();
  }
});
app.post('/api/ordenes', async (req, res) => {
  console.log("PAYLOAD RECIBIDO EN EL BACKEND:", JSON.stringify(req.body, null, 2)); // <-- Agrega esto
  
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { items } = req.body;

    for (let item of items) {
      console.log(`Actualizando producto ID: ${item.idproducto}, Cantidad a restar: ${item.cantidad}`); // <-- Y esto
      
      const queryUpdate = `
        UPDATE producto 
        SET stock = stock - $1 
        WHERE idproducto = $2 AND stock >= $1
      `;
      const resultado = await client.query(queryUpdate, [item.cantidad, item.idproducto]);

      if (resultado.rowCount === 0) {
        throw new Error(`Stock insuficiente o ID de producto incorrecto: ${item.idproducto}`);
      }
    }

    await client.query('COMMIT');
    res.status(200).json({ success: true, message: 'Stock actualizado correctamente' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('ERROR EN BACKEND:', error.message);
    res.status(400).json({ success: false, message: error.message });
  } finally {
    client.release();
  }
});
// Ruta para buscar una factura (Portal del cliente)
app.get('/api/facturas/buscar', async (req, res) => {
    const { folio, rfc } = req.query;
    try {
        const query = 'SELECT * FROM facturas WHERE folio = $1 OR rfc = $2';
        const result = await pool.query(query, [folio, rfc]);
        if (result.rows.length > 0) {
            res.json(result.rows[0]);
        } else {
            res.status(404).json({ message: 'Factura no encontrada' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Ruta para el Admin: Listar solo facturas de Admins, Empleados o Usuarios permitidos
app.get('/api/facturas/admin', async (req, res) => {
    try {
        // Filtramos para asegurarnos de traer solo los roles autorizados
        const query = `
            SELECT * FROM facturas 
            WHERE rol_usuario IN ('Admin', 'Empleado', 'Usuario') 
            ORDER BY fecha DESC
        `;
        const result = await pool.query(query);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ==========================================
// 1. OBTENER TODOS LOS TICKETS (Con App)
// ==========================================
// 1. OBTENER TODOS LOS TICKETS (Ruta Principal API)
// ==========================================
// ==========================================
// 1. OBTENER TODOS LOS TICKETS (Ruta Principal API)
// ==========================================
// 1. OBTENER TODOS LOS TICKETS (Ruta Principal API)
// ==========================================
app.get('/api/tickets-servicio', async (req, res) => {
  try {
    const query = `
      SELECT 
        t.*, 
        c.nombre AS nombre_usuario, 
        c.apaterno AS apaterno_usuario, 
        COALESCE(t.correo, c.correo, 'Sin correo') AS correo,
        c.telefono AS tel_usuario,
        COALESCE(t.nombre, c.nombre, 'Cliente General') AS nombrecliente,
        COALESCE(t.correo, c.correo, 'Sin correo') AS correo_cliente,
        COALESCE(t.direccion, 'Córdoba, Ver.') AS ciudad,
        COALESCE(t.telefono, c.telefono, t.telefono) AS telefono_display
      FROM ticket_servicio t
      LEFT JOIN cliente c ON t.idcliente = c.idcliente
      ORDER BY t.fechasolicitud DESC;
    `;
    const resultado = await pool.query(query);
    res.json(resultado.rows);
  } catch (err) {
    console.error('Error al obtener tickets con cliente:', err);
    res.status(500).json({ error: 'Error al obtener los tickets' });
  }
});

// ==========================================
// 2. OBTENER TODOS LOS TICKETS (Versión Router)
// ==========================================
router.get('/tickets', async (req, res) => {
  try {
    const query = `
      SELECT 
        t.*, 
        c.nombre AS nombre_usuario, 
        c.apaterno AS apaterno_usuario, 
        COALESCE(t.correo, c.correo, 'Sin correo') AS correo,
        c.telefono AS tel_usuario,
        COALESCE(t.nombre, c.nombre, 'Cliente General') AS nombrecliente,
        COALESCE(t.correo, c.correo, 'Sin correo') AS correo_cliente,
        COALESCE(t.direccion, 'Córdoba, Ver.') AS ciudad,
        COALESCE(t.telefono, c.telefono, t.telefono) AS telefono_display
      FROM ticket_servicio t
      LEFT JOIN cliente c ON t.idcliente = c.idcliente
      ORDER BY t.fechasolicitud DESC;
    `;
    const resultado = await pool.query(query);
    res.json(resultado.rows);
  } catch (error) {
    console.error("Error al obtener tickets con cliente:", error);
    res.status(500).json({ error: "Error al obtener los tickets" });
  }
});

// ==========================================
// 3. CREAR TICKET (POST - App)
// ==========================================
app.post('/api/tickets-servicio', async (req, res) => {
  try {
    let { 
      descripcion, 
      fechasolicitud, 
      estado, 
      idcliente, 
      telefono, 
      direccion, 
      horacita, 
      condiciones,
      equipo,
      serie,
      reportetecnico,
      refacciones,
      costo,
      correoUsuario,
      nombreUsuario,
      nombre,
      correo
    } = req.body;
    
    let idClienteFinal = idcliente;
    const nombreFinal = nombre || nombreUsuario || 'Cliente General';
    const correoFinal = correo || correoUsuario || 'Sin correo';

    if (!idClienteFinal && correoUsuario) {
      const clienteExistente = await pool.query('SELECT idcliente FROM cliente WHERE correo = $1', [correoUsuario]);
      if (clienteExistente.rows.length > 0) {
        idClienteFinal = clienteExistente.rows[0].idcliente;
      } else {
        const nuevoCliente = await pool.query(
          `INSERT INTO cliente (nombre, correo, telefono) VALUES ($1, $2, $3) RETURNING idcliente`,
          [nombreFinal, correoFinal, telefono || '0000000000']
        );
        idClienteFinal = nuevoCliente.rows[0].idcliente;
      }
    }

    if (!idClienteFinal) {
      idClienteFinal = 33; 
    }

    const query = `
      INSERT INTO ticket_servicio 
      (descripcion, fechasolicitud, estado, idcliente, telefono, direccion, horacita, condiciones, equipo, serie, reportetecnico, refacciones, costo, nombre, correo)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) 
      RETURNING *;
    `;
    
    const values = [
      descripcion || 'Sin descripción proporcionada', // Asegura que nunca vaya null para cumplir con la BD
      fechasolicitud || new Date(), 
      estado || 'En proceso', 
      idClienteFinal, 
      telefono || null, 
      direccion || 'Córdoba, Ver.', 
      horacita || null,
      condiciones || null,
      equipo || null,
      serie || null,
      reportetecnico || null,
      refacciones || null,
      costo || 0.00,
      nombreFinal,
      correoFinal
    ];
    
    const nuevoTicket = await pool.query(query, values);

    // ==========================================
    // ENVÍO DE CORREOS ELECTRÓNICOS AUTOMÁTICOS
    // ==========================================
    if (correoFinal && correoFinal !== 'Sin correo') {
      try {
        const transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: {
            user: 'soporte@rgsoluciones.com.mx',         
    pass: 'hkkl xoyd jajp uxfu'  // Tu contraseña de aplicación de 16 caracteres
          }
        });

        const mailOptionsSoporte = {
          from: 'soporte@rgsoluciones.com.mx',
          to: 'soporte@rgsoluciones.com.mx',
          subject: `🛠️ Nuevo Ticket de Servicio - ${equipo || 'Equipo'} (${nombreFinal})`,
          html: `
            <h3>Se ha registrado un nuevo ticket de servicio técnico</h3>
            <p><strong>Cliente:</strong> ${nombreFinal}</p>
            <p><strong>Correo:</strong> ${correoFinal}</p>
            <p><strong>Teléfono:</strong> ${telefono || 'N/A'}</p>
            <p><strong>Equipo:</strong> ${equipo || 'N/A'} (Serie: ${serie || 'N/A'})</p>
            <p><strong>Descripción del problema:</strong> ${descripcion || 'N/A'}</p>
            <p><strong>Diagnóstico / Reporte Técnico:</strong> ${reportetecnico || 'Pendiente'}</p>
            <p><strong>Costo Estimado:</strong> $${costo || '0.00'}</p>
          `
        };

        const mailOptionsCliente = {
          from: 'soporte@rgsoluciones.com.mx',
          to: correoFinal,
          subject: '✅ Solicitud de Soporte Registrada - RG Soluciones Cibernéticas',
          html: `
            <h3>¡Hola, ${nombreFinal}!</h3>
            <p>Hemos recibido tu solicitud de servicio técnico en <strong>RG Soluciones Cibernéticas</strong>.</p>
            <p><strong>Equipo registrado:</strong> ${equipo || 'N/A'}</p>
            <p><strong>Estado actual:</strong> En proceso</p>
            <p>Nos pondremos en contacto contigo a la brevedad o puedes presentarte en nuestras instalaciones ubicadas en C. 5 304, Centro, Córdoba, Ver.</p>
            <br>
            <p><i>Agradecemos tu preferencia. Tel: (271) 126-8340</i></p>
          `
        };

        await transporter.sendMail(mailOptionsSoporte);
        await transporter.sendMail(mailOptionsCliente);
      } catch (mailError) {
        console.error('Error al enviar los correos electrónicos:', mailError);
      }
    }

    res.status(201).json(nuevoTicket.rows[0]);

  } catch (err) {
    console.error('Error al insertar ticket de servicio:', err);
    res.status(500).json({ error: 'Error interno al registrar el ticket' });
  }
});
// ==========================================
// 4. CREAR TICKET (POST - Router)
// ==========================================
router.post('/tickets', async (req, res) => {
  try {
    let { 
      idcliente, descripcion, telefono, direccion, horacita, estado, fechasolicitud,
      condiciones, equipo, serie, reportetecnico, refacciones, costo, fechasalida, horasalida,
      nombre, correo 
    } = req.body;
    
    let idClienteFinal = idcliente ? idcliente : 1;

    const query = `
      INSERT INTO ticket_servicio 
      (idcliente, descripcion, telefono, direccion, horacita, estado, fechasolicitud, condiciones, equipo, serie, reportetecnico, refacciones, costo, fechasalida, horasalida, nombre, correo) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17) 
      RETURNING *;
    `;
    
    const values = [
      idClienteFinal, 
      descripcion, 
      telefono || null, 
      direccion || 'Córdoba, Ver.', 
      horacita || null, 
      estado || 'En proceso', 
      fechasolicitud || new Date(),
      condiciones || null,
      equipo || null,
      serie || null,
      reportetecnico || null,
      refacciones || null,
      costo || null,
      fechasalida || null,
      horasalida || null,
      nombre || 'Cliente General',
      correo || 'Sin correo'
    ];
    
    const nuevoTicket = await pool.query(query, values);
    res.status(201).json(nuevoTicket.rows[0]);
  } catch (error) {
    console.error("Error al crear ticket:", error);
    res.status(500).json({ error: "Error al registrar el ticket" });
  }
});

// ==========================================
// 5. ACTUALIZAR TICKET COMPLETO (Desde el Modal Admin)
// ==========================================
app.put('/api/tickets-servicio/:id', async (req, res) => {
  const { id } = req.params;
  const { 
    nombrecliente, nombre, correo, telefono, ciudad, equipo, serie, 
    descripcion, condiciones, reportetecnico, refacciones, 
    costo, fechasalida, horasalida, estado 
  } = req.body;

  // Se asegura de tomar ya sea 'nombrecliente' o 'nombre' indistintamente
  const nombreFinalAdmin = nombrecliente || nombre;

  try {
    const queryTicket = `
      UPDATE ticket_servicio 
      SET 
        telefono = $1, 
        direccion = $2, 
        descripcion = $3, 
        condiciones = $4, 
        equipo = $5, 
        serie = $6, 
        reportetecnico = $7, 
        refacciones = $8, 
        costo = $9, 
        fechasalida = $10, 
        horasalida = $11, 
        estado = $12,
        nombre = $13,
        correo = $14
      WHERE idticket = $15 
      RETURNING *;
    `;

    const valuesTicket = [
      telefono, 
      ciudad, 
      descripcion, 
      condiciones, 
      equipo, 
      serie, 
      reportetecnico, 
      refacciones, 
      costo, 
      fechasalida || null, 
      horasalida || null, 
      estado, 
      nombreFinalAdmin || 'Cliente General',
      correo || 'Sin correo',
      id
    ];

    const resultadoTicket = await pool.query(queryTicket, valuesTicket);

    if (resultadoTicket.rows.length === 0) {
      return res.status(404).json({ error: 'Ticket no encontrado' });
    }

    const ticketActualizado = resultadoTicket.rows[0];

    if (ticketActualizado.idcliente && (nombreFinalAdmin || correo)) {
      await pool.query(
        `UPDATE cliente SET nombre = COALESCE($1, nombre), correo = COALESCE($2, correo), telefono = COALESCE($3, telefono) WHERE idcliente = $4`,
        [nombreFinalAdmin, correo, telefono, ticketActualizado.idcliente]
      );
    }

    res.json({ mensaje: 'Ticket actualizado correctamente', ticket: ticketActualizado });
  } catch (err) {
    console.error('Error al actualizar ticket completo:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

const { OAuth2Client } = require('google-auth-library');
const client = new OAuth2Client('TU_CLIENT_ID.apps.googleusercontent.com');

app.post('/api/auth/google', async (req, res) => {
    const { token } = req.body;
    try {
        const ticket = await client.verifyIdToken({
            idToken: token,
            audience: 'TU_CLIENT_ID.apps.googleusercontent.com',
        });
        const { email, name, picture } = ticket.getPayload();

        // Aquí buscas si el usuario existe en tu base de datos o lo registras automático
        // Luego generas tu JWT propio para regresárselo al frontend

        res.json({ success: true, token: 'JWT_DE_TU_SISTEMA', email, name });
    } catch (error) {
        res.status(400).json({ success: false, message: 'Token de Google no válido' });
    }
});

app.listen(PORT, () => {
  console.log(`Servidor ejecutándose en http://localhost:${PORT}`);
}); 