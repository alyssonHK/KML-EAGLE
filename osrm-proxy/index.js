// Proxy simples para OSRM usando Express
const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 4000;
const OSRM_BASE_URL = 'https://router.project-osrm.org';

app.use(cors());

// Proxy para qualquer rota OSRM
app.get('/osrm/*', async (req, res) => {
  try {
    const osrmPath = req.originalUrl.replace('/osrm', '');
    const url = OSRM_BASE_URL + osrmPath;
    const osrmRes = await fetch(url);
    const data = await osrmRes.text();
    res.status(osrmRes.status).type(osrmRes.headers.get('content-type')).send(data);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao acessar o OSRM', details: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`OSRM Proxy rodando em http://localhost:${PORT}`);
});
