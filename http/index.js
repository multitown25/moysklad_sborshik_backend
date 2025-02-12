const axios = require('axios');
const path = require('path');
require('dotenv').config({path: __dirname + '/.env'});

const tokenMS = process.env.TOKEN_MS;

const $api = axios.create({
    withCredentials: true
});

$api.interceptors.request.use((config) => {
    config.headers.Authorization = `Bearer ${tokenMS}`;
    return config;
});

module.exports = $api;