const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const routes = require('./routes');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS
app.use(cors());

// Body parser middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from public folder
app.use(express.static(path.join(__dirname, '../public')));

// Mount API routes
app.use('/api', routes);

// Fallback route serving index.html for single-page dashboard
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) {
    return next();
  }
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Start Express server if script is run directly
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`==================================================`);
    console.log(`🚀 Incident Response Agent Server listening on port ${PORT}`);
    console.log(`👉 API Endpoints:`);
    console.log(`   - POST http://localhost:${PORT}/api/incident`);
    console.log(`   - GET  http://localhost:${PORT}/api/incidents`);
    console.log(`==================================================`);
  });
}

module.exports = app;
