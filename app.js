const express = require('express');
const path = require('path');
require('dotenv').config({path: __dirname + '/.env'});
const cors = require('cors');
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');
const router = require('./routes/index');
const errorMiddleware = require('./middlewares/error-middleware');
// const logger = require('./logger');
const morgan = require('morgan');
const fs = require('fs');

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

morgan.token('user', (req) => {
    return req.user?.email;
})
const accessLogStream = fs.createWriteStream(path.join(__dirname, 'backend.log'), { flags: 'a' })
app.use(morgan(':date[iso] :method :url :user', { stream: accessLogStream }))

app.use('/api', router);

app.use('*', (req, res, next) => {
    res.sendFile(path.resolve(__dirname, '../../../../var/www/sborshikapp.flx-it.ru', 'index.html'));
});

app.use(errorMiddleware);

const start = async () => {
    try {
        await mongoose.connect(process.env.DB_URL, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });


        app.listen(PORT, () => console.log(`Server started on PORT = ${PORT}`))
    } catch (e) {
        console.log(e);
        console.log(e?.data);
    }
}

start();
