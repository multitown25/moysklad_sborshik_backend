const DEMAND_STATES = new Map([
    ['Собрано', 'https://api.moysklad.ru/api/remap/1.2/entity/demand/metadata/states/7d385378-49c9-11ec-0a80-089e00198b92'],
    ['На упаковке', 'https://api.moysklad.ru/api/remap/1.2/entity/demand/metadata/states/4a52ef52-41ff-11ec-0a80-02d0001cfb4d'],
    ['Упаковано', 'https://api.moysklad.ru/api/remap/1.2/entity/demand/metadata/states/4f90421c-11a3-11ef-0a80-063a00036159'],
    ['Корректировка', 'https://api.moysklad.ru/api/remap/1.2/entity/demand/metadata/states/4a52efe0-41ff-11ec-0a80-02d0001cfb4f'],
    ['Готов к отгрузке', 'https://api.moysklad.ru/api/remap/1.2/entity/demand/metadata/states/69c982a4-1d3e-11ef-0a80-0c8500022c29']
]);

const ORDER_STATES = new Map([
    ['Собрано', 'https://api.moysklad.ru/api/remap/1.2/entity/customerorder/metadata/states/beaf29eb-b0fd-11ed-0a80-02dc0038a0e5'],
    ['На упаковке', 'https://api.moysklad.ru/api/remap/1.2/entity/customerorder/metadata/states/45070416-c1ac-11ee-0a80-07e3000021ff'],
    ['Упаковано', 'https://api.moysklad.ru/api/remap/1.2/entity/demand/metadata/states/4f90421c-11a3-11ef-0a80-063a00036159'],
    ['Корректировка', 'https://api.moysklad.ru/api/remap/1.2/entity/customerorder/metadata/states/3ffc2d79-bb34-11ed-0a80-0cd400212101'],
    ['Успешно реализовано', 'https://api.moysklad.ru/api/remap/1.2/entity/customerorder/metadata/states/aa42eb7b-3488-11ec-0a80-051e00323076']
]);

// для бд
const STATE_BY_USER_POSITION_FOR_WORK = new Map([
    ['Сборщик', 'НА СБОРКЕ'], // Статус перед этим?
    ['Упаковщик', 'Собрано'],
    ['Разливщик масел', 'Розлив']
]);

// для редиса
const STATE_BY_USER_POSITION_IN_WORK = new Map([
    ['Сборщик', 'На сборке'],
    ['Упаковщик', 'На упаковке'],
    ['Разливщик масел', 'На розливе']
]);

module.exports = {DEMAND_STATES, ORDER_STATES, STATE_BY_USER_POSITION_IN_WORK, STATE_BY_USER_POSITION_FOR_WORK}