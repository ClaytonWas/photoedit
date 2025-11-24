// Modules
const express = require('express')
const path = require('path')

// Server initalization
const app = express()
const port = process.env.PORT || 3000
const distPath = path.join(__dirname, 'dist')

app.use(express.static(distPath))

app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'))
});

// Server start
app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});