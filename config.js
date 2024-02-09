require('dotenv').config();
const config = {
    db: {
        host: process.env.SERVER_IP,
            user: process.env.MYSQL_USERNAME,
            password: process.env.MYSQL_PASSWORD,
            database: process.env.DATABASE_NAME,
            connectTimeout: 60000
    }
}

module.exports = config;
