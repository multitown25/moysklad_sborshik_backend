// const $api = require('../http/index');
//
// const getOrders = async () => {
//     const url = 'https://api.moysklad.ru/api/remap/1.2/entity/customerorder?filter=state.name=НА СБОРКЕ';
//     const result = await $api.get(url);
//     console.log(result.data);
// }
//
// getOrders();

const DB = [
    {
        id: '2a2bf22d-73cc-11ee-0a80-1439001d5fba',
        name: '26266',
        created: "2023-10-26T06:52:01.311Z",
        'Способ доставки NEW': 'ПЭК',
        description: 'тест'
    },
    {
        id: '5f7774dd-73cc-11ee-0a80-0284001c953f',
        name: '26268',
        created: "2023-10-26T06:53:30.675Z",
        'Способ доставки NEW': 'Самовывоз',
        description: 'тестdfdsfsd'
    },
    {
        id: '8501c3f5-73cc-11ee-0a80-05bd001c4f0a',
        name: '26269',
        created: "2023-10-26T06:54:33.650Z",
        'Способ доставки NEW': 'Самовывоз',
        description: 'тест'
    }
]

const inWork = [
    {
        id: '2a2bf22d-73cc-11ee-0a80-1439001d5fba',
        name: '26266',
        employee: 'Андрей',
        current: true
    }
]

const obj = {
    id: '8501c3f5-73cc-11ee-0a80-05bd001c4f0a',
    name: '26269',
    current: true,
    employee: 'Андрей',
    selectedPositions: []
}

if (!obj) {
    console.log(obj)
}


// const arr = DB.concat(inWork);
// console.log(arr);