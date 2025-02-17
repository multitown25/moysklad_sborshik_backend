const DEMAND_STATES = new Map([
    ['Собрано', 'https://api.moysklad.ru/api/remap/1.2/entity/demand/metadata/states/823ee513-b7b6-11ef-0a80-0027001ed57b'],
    ['На упаковке', 'https://api.moysklad.ru/api/remap/1.2/entity/demand/metadata/states/82413f79-b7b6-11ef-0a80-0027001ed57e'],
    ['Упаковано', 'https://api.moysklad.ru/api/remap/1.2/entity/demand/metadata/states/824304a7-b7b6-11ef-0a80-0027001ed580'],
    ['Корректировка', 'https://api.moysklad.ru/api/remap/1.2/entity/demand/metadata/states/824e35c1-b7b6-11ef-0a80-0027001ed58c'],
    ['Готов к отгрузке', 'https://api.moysklad.ru/api/remap/1.2/entity/demand/metadata/states/8244d3c4-b7b6-11ef-0a80-0027001ed582']
]);

const ORDER_STATES = new Map([
    ['Собрано', 'https://api.moysklad.ru/api/remap/1.2/entity/customerorder/metadata/states/5be95c83-b7b6-11ef-0a80-114c001ec833'],
    ['На упаковке', 'https://api.moysklad.ru/api/remap/1.2/entity/customerorder/metadata/states/5c019154-b7b6-11ef-0a80-114c001ec85a'],
    ['Упаковано', 'https://api.moysklad.ru/api/remap/1.2/entity/customerorder/metadata/states/5c03fab6-b7b6-11ef-0a80-114c001ec85c'],
    ['Корректировка', 'https://api.moysklad.ru/api/remap/1.2/entity/customerorder/metadata/states/5be3dd8f-b7b6-11ef-0a80-114c001ec82f'],
    ['Успешно реализовано', 'https://api.moysklad.ru/api/remap/1.2/entity/customerorder/metadata/states/5bedeec3-b7b6-11ef-0a80-114c001ec837']
]);
const DEMAND_POSITIONS_HREFS = new Map([
    ['Упаковщик', 'https://api.moysklad.ru/api/remap/1.2/entity/demand/metadata/attributes/1047768f-b6c2-11ef-0a80-1a950004cd65'],
    ['Сборщик', 'https://api.moysklad.ru/api/remap/1.2/entity/demand/metadata/attributes/104771b5-b6c2-11ef-0a80-1a950004cd64']
]);
const ORDER_POSITIONS_HREFS = new Map([
   ['Упаковщик', 'https://api.moysklad.ru/api/remap/1.2/entity/customerorder/metadata/attributes/93096cca-b606-11ef-0a80-0c2c0031f95f'],
   ['Сборщик', 'https://api.moysklad.ru/api/remap/1.2/entity/customerorder/metadata/attributes/6a6ae09c-b604-11ef-0a80-185a0031c320']
]);

// для бд
const STATE_BY_USER_POSITION_FOR_WORK = new Map([
    ['Сборщик', 'Распечатано'], // Статус перед этим?
    ['Упаковщик', 'Собрано'],
    ['Разливщик масел', 'Розлив']
]);

// для редиса
const STATE_BY_USER_POSITION_IN_WORK = new Map([
    ['Сборщик', 'На сборке'],
    ['Упаковщик', 'На упаковке'],
    ['Разливщик масел', 'На розливе']
]);

module.exports = {DEMAND_STATES, ORDER_STATES, STATE_BY_USER_POSITION_IN_WORK, STATE_BY_USER_POSITION_FOR_WORK, DEMAND_POSITIONS_HREFS, ORDER_POSITIONS_HREFS}