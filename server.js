const express = require("express");
const ExcelJS = require("exceljs");
const path = require("path");
const mysql = require("mysql2/promise");
require('dotenv').config();


const app = express();
const port = process.env.PORT || 3000;


const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
});

module.exports = pool;



async function initDatabase() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS interventi (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nome VARCHAR(100) NOT NULL,
        cognome VARCHAR(100) NOT NULL,
        email VARCHAR(255),
        telefono VARCHAR(50) NOT NULL,
        targa VARCHAR(20) NOT NULL,
        modello VARCHAR(255) NOT NULL,
        anno INT NOT NULL,
        chilometraggio INT,
        intervento VARCHAR(100) NOT NULL,
        data_prevista DATE NOT NULL,
        note TEXT,
        privacy BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS Clienti (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nome VARCHAR(100) NOT NULL,
        cognome VARCHAR(100) NOT NULL,
        email VARCHAR(255),
        telefono VARCHAR(50) NOT NULL,
        UNIQUE KEY unique_cliente (nome, cognome, telefono)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await pool.query(`
      INSERT INTO Clienti (nome, cognome, email, telefono)
      SELECT DISTINCT i.nome, i.cognome, i.email, i.telefono
      FROM interventi AS i
      ON DUPLICATE KEY UPDATE email = COALESCE(VALUES(email), Clienti.email)
    `);

    console.log("Database pronto");
  } catch (error) {
    console.error("Errore di connessione al database:", error.message);
  }
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", database: "connected" });
  } catch (error) {
    res.json({ status: "ok", database: "disconnected" });
  }
});

async function exportInterventi(req, res) {
  try {
    let query = `
      SELECT
        id, nome, cognome, email, telefono, targa, modello, anno,
        chilometraggio, intervento,
        DATE_FORMAT(data_prevista, '%Y-%m-%d') AS data_prevista,
        note, privacy,
        DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at
      FROM interventi
    `;
    let queryParams = [];

    if (req.method === "POST") {
      const { ids } = req.body || {};
      if (!Array.isArray(ids) || !ids.every((id) => Number.isSafeInteger(id) && id > 0)) {
        return res.status(400).json({ message: "Elenco degli interventi non valido." });
      }

      if (ids.length === 0) {
        query += " WHERE 1 = 0";
      } else {
        const placeholders = ids.map(() => "?").join(", ");
        query += ` WHERE id IN (${placeholders}) ORDER BY FIELD(id, ${placeholders})`;
        queryParams = [...ids, ...ids];
      }
    } else {
      query += " ORDER BY created_at DESC";
    }

    const [rows] = await pool.query(query, queryParams);

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Interventi");
    worksheet.columns = [
      { header: "ID", key: "id", width: 10 },
      { header: "Nome", key: "nome", width: 18 },
      { header: "Cognome", key: "cognome", width: 18 },
      { header: "Email", key: "email", width: 28 },
      { header: "Telefono", key: "telefono", width: 18 },
      { header: "Targa", key: "targa", width: 14 },
      { header: "Modello", key: "modello", width: 24 },
      { header: "Anno", key: "anno", width: 10 },
      { header: "Chilometraggio", key: "chilometraggio", width: 18 },
      { header: "Intervento", key: "intervento", width: 22 },
      { header: "Data prevista", key: "data_prevista", width: 16 },
      { header: "Note", key: "note", width: 40 },
      { header: "Privacy", key: "privacy", width: 12 },
      { header: "Creato il", key: "created_at", width: 22 },
    ];
    worksheet.addRows(rows.map((row) => ({
      ...row,
      privacy: row.privacy ? "Sì" : "No",
    })));
    worksheet.getRow(1).font = { bold: true };
    worksheet.autoFilter = {
      from: "A1",
      to: `N${Math.max(rows.length + 1, 1)}`,
    };
    worksheet.views = [{ state: "frozen", ySplit: 1 }];

    const buffer = await workbook.xlsx.writeBuffer();
    res
      .type("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
      .set("Content-Disposition", 'attachment; filename="interventi.xlsx"')
      .send(Buffer.from(buffer));
  } catch (error) {
    console.error("Errore durante l'esportazione degli interventi:", error.message);
    res.status(500).json({
      message: "Errore durante l'esportazione degli interventi.",
      error: error.message,
    });
  }
}

app.route("/api/interventi/export")
  .get(exportInterventi)
  .post(exportInterventi);

app.get("/api/interventi", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM interventi ORDER BY created_at DESC");
    res.json(rows);
  } catch (error) {
    console.error("Errore nel recupero interventi:", error.message);
    res.status(500).json({ message: "Errore nel recupero interventi", error: error.message });
  }
});

app.get("/api/clienti", async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT id, nome, cognome, email, telefono FROM Clienti ORDER BY cognome, nome"
    );
    res.json(rows);
  } catch (error) {
    console.error("Errore nel recupero clienti:", error.message);
    res.status(500).json({ message: "Errore nel recupero clienti", error: error.message });
  }
});

app.get("/api/clienti/export", async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT id, nome, cognome, email, telefono FROM Clienti ORDER BY cognome, nome"
    );

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Clienti");
    worksheet.columns = [
      { header: "ID", key: "id", width: 10 },
      { header: "Nome", key: "nome", width: 18 },
      { header: "Cognome", key: "cognome", width: 18 },
      { header: "Email", key: "email", width: 28 },
      { header: "Telefono", key: "telefono", width: 18 },
    ];
    worksheet.addRows(rows);
    worksheet.getRow(1).font = { bold: true };
    worksheet.autoFilter = {
      from: "A1",
      to: `E${Math.max(rows.length + 1, 1)}`,
    };
    worksheet.views = [{ state: "frozen", ySplit: 1 }];

    const buffer = await workbook.xlsx.writeBuffer();
    res
      .type("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
      .set("Content-Disposition", 'attachment; filename="clienti.xlsx"')
      .send(Buffer.from(buffer));
  } catch (error) {
    console.error("Errore durante l'esportazione dei clienti:", error.message);
    res.status(500).json({
      message: "Errore durante l'esportazione dei clienti.",
      error: error.message,
    });
  }
});

app.post(["/api/interventi", "/api/interventi/add"], async (req, res) => {
  const {
    nome,
    cognome,
    email,
    telefono,
    targa,
    modello,
    anno,
    chilometraggio,
    intervento,
    data,
    note,
    privacy,
  } = req.body;

  const privacyChecked = privacy === "on" || privacy === true || privacy === 1;

  if (!nome || !cognome || !telefono || !targa || !modello || !anno || !intervento || !data || !privacyChecked) {
    return res.status(400).json({
      message: "Dati obbligatori mancanti o privacy non confermata.",
    });
  }

  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    await connection.execute(
      `INSERT INTO Clienti (nome, cognome, email, telefono)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE email = COALESCE(VALUES(email), email)`,
      [
        nome.trim(),
        cognome.trim(),
        email ? email.trim() : null,
        telefono.trim(),
      ]
    );

    const [result] = await connection.execute(
      `INSERT INTO interventi
        (nome, cognome, email, telefono, targa, modello, anno, chilometraggio, intervento, data_prevista, note, privacy)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        nome.trim(),
        cognome.trim(),
        email ? email.trim() : null,
        telefono.trim(),
        targa.trim().toUpperCase(),
        modello.trim(),
        Number(anno),
        chilometraggio !== "" && chilometraggio != null ? Number(chilometraggio) : null,
        intervento,
        data,
        note ? note.trim() : null,
        true,
      ]
    );
    await connection.commit();

    res.status(201).json({
      message: "Intervento salvato correttamente.",
      id: result.insertId,
    });
  } catch (error) {
    if (connection) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error("Errore durante l'annullamento del salvataggio:", rollbackError.message);
      }
    }
    console.error("Errore durante il salvataggio dell'intervento:", error.message);
    res.status(500).json({
      message: "Errore durante il salvataggio dell'intervento.",
      error: error.message,
    });
  } finally {
    connection?.release();
  }
});

initDatabase().then(() => {
  app.listen(port, () => {
    console.log(`Server avviato su http://localhost:${port}`);
  });
});