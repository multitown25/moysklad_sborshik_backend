const ApiError = require('../exceptions/api-error');
const fs = require('fs/promises');

module.exports = function (err, req, res, next) {
    console.log(err);
    const errorDate = new Date().toLocaleString("ru-RU", { timeZone: "Europe/Moscow" });
    fs.appendFile('error_log.txt', JSON.stringify({date: errorDate, errors: err.errors, message: err.message, status: err.status}) + '\n');
    if (err instanceof ApiError) {
        return res.status(err.status).json({message: err.message, errors: err.errors})
    }
    return res.status(500).json({message: 'Непредвиденная ошибка'})

};
