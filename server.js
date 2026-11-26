const express = require('express');
const sql = require('mssql');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Configuración de conexión con tus credenciales reales
const dbConfig = {
    user: process.env.DB_USER || 'sa',
    password: process.env.DB_PASSWORD || 'CacaoTrace2026!',
    server: process.env.DB_SERVER || 'localhost',
    database: process.env.DB_NAME || 'CacaoTraceSatipoDB',
    port: parseInt(process.env.DB_PORT) || 1433,
    options: {
        encrypt: process.env.DB_ENCRYPT === 'true',
        trustServerCertificate: true
    }
};

let pool;
async function conectarDB() {
    pool = await sql.connect(dbConfig);
    console.log('✅ Conexión exitosa a SQL Server: CacaoTraceSatipoDB');
}

// 1. Iniciar Sesión (Correo o DNI)
app.post('/api/login', async (req, res) => {
    try {
        const { identifier, password } = req.body;
        const result = await pool.request()
            .input('Identificador', sql.NVarChar(120), identifier)
            .input('PasswordPlano', sql.NVarChar(100), password)
            .execute('sp_IniciarSesion');
        if (result.recordset.length === 0) {
            return res.status(401).json({ error: 'Correo/DNI o contraseña incorrectos, o cuenta inactiva.' });
        }
        res.json(result.recordset[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 2. Gestión de Usuarios RBAC (Exclusivo Administrador)
app.get('/api/usuarios', async (req, res) => {
    try {
        const result = await pool.request().execute('sp_ListarUsuarios');
        res.json(result.recordset);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/usuarios', async (req, res) => {
    try {
        const { adminId, rol, nombres, apellidos, dni, email, password, sector } = req.body;
        const result = await pool.request()
            .input('AdminUsuarioID', sql.Int, adminId)
            .input('NombreRol', sql.NVarChar(40), rol)
            .input('Nombres', sql.NVarChar(100), nombres)
            .input('Apellidos', sql.NVarChar(100), apellidos)
            .input('DNI', sql.VarChar(8), dni)
            .input('Email', sql.NVarChar(120), email)
            .input('PasswordPlano', sql.NVarChar(100), password)
            .input('SectorSatipo', sql.NVarChar(100), sector)
            .execute('sp_CrearUsuarioPorAdmin');
        res.json(result.recordset[0]);
    } catch (err) { res.status(400).json({ error: err.message }); }
});

app.patch('/api/usuarios/:id/estado', async (req, res) => {
    try {
        const result = await pool.request()
            .input('AdminUsuarioID', sql.Int, req.body.adminId)
            .input('TargetUsuarioID', sql.Int, parseInt(req.params.id))
            .execute('sp_CambiarEstadoUsuario');
        res.json(result.recordset[0]);
    } catch (err) { res.status(400).json({ error: err.message }); }
});

// 3. Fincas y Georreferenciación GPS Satipo
app.get('/api/fincas', async (req, res) => {
    try {
        const result = await pool.request().execute('sp_ListarFincas');
        res.json(result.recordset);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/fincas', async (req, res) => {
    try {
        const { usuarioId, nombre, extensionHa, variedad, latitud, longitud, sector } = req.body;
        const result = await pool.request()
            .input('UsuarioID', sql.Int, usuarioId)
            .input('NombreFinca', sql.NVarChar(120), nombre)
            .input('ExtensionHa', sql.Decimal(8, 2), extensionHa)
            .input('VariedadCacao', sql.NVarChar(80), variedad)
            .input('Latitud', sql.Decimal(10, 8), latitud)
            .input('Longitud', sql.Decimal(11, 8), longitud)
            .input('SectorSatipo', sql.NVarChar(100), sector)
            .execute('sp_RegistrarFinca');
        res.json(result.recordset[0]);
    } catch (err) { res.status(400).json({ error: err.message }); }
});

// 4. Lotes y Bloque Génesis SHA-256
app.get('/api/lotes', async (req, res) => {
    try {
        const result = await pool.request().execute('sp_ListarLotes');
        res.json(result.recordset);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/lotes', async (req, res) => {
    try {
        const { fincaId, usuarioId, fechaCosecha, pesoKg, observaciones, qrUrl } = req.body;
        const result = await pool.request()
            .input('FincaID', sql.Int, fincaId)
            .input('UsuarioID', sql.Int, usuarioId)
            .input('FechaCosecha', sql.Date, fechaCosecha)
            .input('PesoKg', sql.Decimal(10, 2), pesoKg)
            .input('Observaciones', sql.NVarChar(500), observaciones || '')
            .input('CodigoQRUrl', sql.NVarChar(255), qrUrl)
            .execute('sp_RegistrarLoteConBlockchain');
        res.json(result.recordset[0]);
    } catch (err) { res.status(400).json({ error: err.message }); }
});

// 5. Eventos Trazabilidad, Analítica IA y Consulta Pública QR
app.post('/api/eventos', async (req, res) => {
    try {
        const { loteId, usuarioId, etapa, temperatura, humedad, observaciones } = req.body;
        const result = await pool.request()
            .input('LoteID', sql.Int, loteId)
            .input('UsuarioID', sql.Int, usuarioId)
            .input('EtapaProceso', sql.NVarChar(80), etapa)
            .input('Temperatura', sql.Decimal(5, 2), temperatura)
            .input('Humedad', sql.Decimal(5, 2), humedad)
            .input('Observaciones', sql.NVarChar(500), observaciones)
            .execute('sp_RegistrarEventoBlockchain');
        res.json(result.recordset[0]);
    } catch (err) { res.status(400).json({ error: err.message }); }
});

app.get('/api/trazabilidad/:codigo', async (req, res) => {
    try {
        const result = await pool.request()
            .input('CodigoLote', sql.VarChar(30), req.params.codigo)
            .execute('sp_ConsultarTrazabilidadLote');
        res.json({
            cabecera: result.recordsets[0][0] || null,
            eventos: result.recordsets[1] || [],
            ia: result.recordsets[2][0] || null
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

const PORT = process.env.PORT || 3000;
conectarDB().then(() => {
    app.listen(PORT, () => {
        console.log('====================================================');
        console.log(`🚀 Servidor CacaoTrace escuchando en http://localhost:${PORT}`);
        console.log('====================================================');
    });
}).catch(err => console.error('❌ Error al conectar con SQL Server:', err.message));
