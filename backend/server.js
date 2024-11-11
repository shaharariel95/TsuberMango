require('dotenv').config();
const express = require('express');
const cors = require('cors')
const sheetRoutes = require('./routes/sheetRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.use('/', sheetRoutes);

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
