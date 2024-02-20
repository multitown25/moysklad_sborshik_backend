require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const mongoose = require('mongoose');
const redis = require('redis');
const cookieParser = require('cookie-parser');
const router = require('./routes/index');
const errorMiddleware = require('./middlewares/error-middleware');
// const logger = require('./logger');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.urlencoded({ extended: true }))
app.use(express.json());
// app.use(bodyParser);
app.use(cookieParser());
app.use(cors({
    credentials: true,
    origin: process.env.CLIENT_URL
}));

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
        });

        const redisClient = redis.createClient();
        redisClient.on('error', err => {
            console.log('Redis Client Error', err);
        })
        redisClient.on('ready', () => {console.log('Redis is ready!')});
        await redisClient.connect();
        await redisClient.ping();
        app.listen(PORT, () => console.log(`Server started on PORT = ${PORT}`))
    } catch (e) {
        console.log(e);
        console.log(e?.data);
    }
}

start();
