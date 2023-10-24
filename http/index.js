const axios = require('axios');

const tokenMS = '4fbe404d88f9d1a5409c23b6f37e8693355b999e';

const $api = axios.create({
    withCredentials: true
});

$api.interceptors.request.use((config) => {
    config.headers.Authorization = `Bearer ${tokenMS}`;
    return config;
});

module.exports = $api;