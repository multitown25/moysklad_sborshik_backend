require('dotenv').config();
const fs = require('fs');
const express = require('express');
const path = require('path');
// const bodyParser = require('body-parser');
const cors = require('cors');
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');
const router = require('./routes/index');
const jwt = require('jsonwebtoken');
const errorMiddleware = require('./middlewares/error-middleware');
// const logger = require('./logger');

const app = express();
const tokenMS = '4fbe404d88f9d1a5409c23b6f37e8693355b999e';
const PORT = process.env.PORT || 5000;

app.use(express.urlencoded({ extended: true }))
app.use(express.json());
// app.use(bodyParser);
app.use(cookieParser());
app.use(cors({
    credentials: true,
    origin: process.env.CLIENT_URL
}));


// const root = path.join(__dirname, '../../var/www/build');
// app.use(express.static(root));

// app.use('/', (req, res, next) => {
//     // res.setHeader(
//     //     'Access-Control-Allow-Origin',
//     //     ''
//     // );
//     res.setHeader(
//         'Access-Control-Allow-Headers',
//         'Content-Type'
//     );
//     next();
// })

// app.use(express.static(path.join(__dirname, '../../../var/www/build')));

// app.use('*', (req, res, next) => {
//     res.setHeader(
//         'Access-Control-Allow-Origin',
//         '*'
//     );
//     res.setHeader(
//         'Access-Control-Allow-Headers',
//         'Content-Type'
//     );
//     next();
// });
app.use('/api', router);

app.use('*', (req, res, next) => {
    res.sendFile(path.resolve(__dirname, '../../../../var/www/build', 'index.html'));
});

app.use(errorMiddleware);

const start = async () => {
    try {
        await mongoose.connect(process.env.DB_URL, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        })
        app.listen(PORT, () => console.log(`Server started on PORT = ${PORT}`))
    } catch (e) {
        console.log(e);
        console.log(e?.data);
    }
}

start();
