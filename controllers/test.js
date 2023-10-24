const $api = require('../http/index');

const getOrders = async () => {
    const url = 'https://api.moysklad.ru/api/remap/1.2/entity/customerorder?filter=state.name=НА СБОРКЕ';
    const result = await $api.get(url);
    console.log(result.data);
}

getOrders();