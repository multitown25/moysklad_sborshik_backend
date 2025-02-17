const $api = require('../http/index');
const config = require('../config');
const mysql = require('mysql2/promise');
const redisClient = require('../service/redis-client');
const UserService = require('../service/user-service');
const OrderService = require('../service/order-service');
const { STATE_BY_USER_POSITION_FOR_WORK, STATE_BY_USER_POSITION_IN_WORK, ORDER_STATES,
    ORDER_POSITIONS_HREFS
} = require('../moysklad/data');
// let ALLOW_TO_GET_NEW_ORDER = true;
// let GIVE_NEW_ORDER = true;

// const STATES_DEMANDS = new Map([
//     ['Собрано', 'https://api.moysklad.ru/api/remap/1.2/entity/demand/metadata/states/7d385378-49c9-11ec-0a80-089e00198b92'],
//     ['Корректировка', 'https://api.moysklad.ru/api/remap/1.2/entity/demand/metadata/states/4a52efe0-41ff-11ec-0a80-02d0001cfb4f'],
//     ['Упаковано', 'https://api.moysklad.ru/api/remap/1.2/entity/demand/metadata/states/4f90421c-11a3-11ef-0a80-063a00036159'],
//     ['Розлив', 'https://api.moysklad.ru/api/remap/1.2/entity/demand/metadata/states/1cfb1e34-f642-11ee-0a80-00fc000840c9']
// ]);
//
// const STATES_CUSTOMERORDER = new Map([
//     ['Собрано', 'https://api.moysklad.ru/api/remap/1.2/entity/customerorder/metadata/states/beaf29eb-b0fd-11ed-0a80-02dc0038a0e5'],
//     ['Корректировка', 'https://api.moysklad.ru/api/remap/1.2/entity/customerorder/metadata/states/3ffc2d79-bb34-11ed-0a80-0cd400212101'],
//     ['Упаковано', 'https://api.moysklad.ru/api/remap/1.2/entity/customerorder/metadata/states/85a191e0-32cf-11ef-0a80-1672000a4a13']
// ]);

// const STATE_BY_USER_POSITION_FOR_WORK = new Map([
//     ['Сборщик', 'Готов к сборке'],
//     ['Упаковщик', 'Собрано'],
//     ['Разливщик масел', 'Розлив']
// ]);
//
// const STATE_BY_USER_POSITION_IN_WORK = new Map([
//     ['Сборщик', 'На сборке'],
//     ['Упаковщик', 'На упаковке'],
//     ['Разливщик масел', 'На розливе']
// ]);

// const USER_FIELD_BY_POSITION = new Map([
//     ['Сборщик', {
//         customerOrder: 'https://api.moysklad.ru/api/remap/1.2/entity/customerorder/metadata/attributes/f1917566-1c0d-11ee-0a80-13cb002a779d',
//         demand: 'https://api.moysklad.ru/api/remap/1.2/entity/demand/metadata/attributes/8bd7882b-ebfe-11ee-0a80-07750004a8d8'
//     }],
//     ['Упаковщик', {
//         customerOrder: 'https://api.moysklad.ru/api/remap/1.2/entity/customerorder/metadata/attributes/05de3ee3-1bbc-11ef-0a80-08aa002fc1f8',
//         demand: 'https://api.moysklad.ru/api/remap/1.2/entity/demand/metadata/attributes/46bbb4eb-0c1f-11ef-0a80-037a0002bd44'
//     }],
//     ['Разливщик масел', '']
// ])

// const NEXT_STATE_BY_USER_POSITION = new Map([
//     ['Сборщик', 'https://api.moysklad.ru/api/remap/1.2/entity/demand/metadata/states/4a52eefa-41ff-11ec-0a80-02d0001cfb4c'], // На сборке
//     ['Упаковщик', 'https://api.moysklad.ru/api/remap/1.2/entity/demand/metadata/states/4a52ef52-41ff-11ec-0a80-02d0001cfb4d'], // На упаковке
//     ['Разливщик масел', 'https://api.moysklad.ru/api/remap/1.2/entity/demand/metadata/states/4a52ef9d-41ff-11ec-0a80-02d0001cfb4e'] // Готов к сборке
// ])

const ORDERS_IN_WORK = 'Orders in work';
const PACKER_ORDERS = 'Packer orders';

let requestCounter = 0;

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function DoNeedTimeout() {
    if (requestCounter >= 45) {
        console.log('WE ARE SLEEPING')
        await sleep(3200);
        requestCounter = 0;
        console.log('WE WOKE UP')
    }
}

async function _getAllOrders(req) {
    if (req.user.position === "admin") {
        const allOrders = await _getAllOrdersDBQuery('ВСЕ');
        const result = allOrders.map(item => {
            return {
                id: item.id,
                name: item.name,
                status: item.state
            }
        })
        return result;
    }
    // console.log(result)
    const neededStatus = STATE_BY_USER_POSITION_FOR_WORK.get(req.user.position);
    const result = await _getAllOrdersDBQuery(neededStatus);
    return result;
}

//
async function _getOrderById(id) {
    const query = `SELECT
    customerorder.id,
    customerorder.name,
    customerorder.created,
    deliver.value AS 'Способ доставки NEW',
    customerorder.description,
    priority.value AS priority,
    sborshik.value AS sborshik
FROM
    customerorder
LEFT JOIN
    customerorder_attributes deliver ON deliver.customerorder_id = customerorder.id AND deliver.name = 'Способ доставки NEW'
JOIN
    states ON states.id = customerorder.state
JOIN
    store ON store.id = customerorder.store
LEFT JOIN
    customerorder_attributes priority ON priority.customerorder_id = customerorder.id AND priority.name = 'Приоритетно'
LEFT JOIN
     customerorder_attributes sborshik ON sborshik.customerorder_id = customerorder.id AND sborshik.name = 'Сборщик'
WHERE
    customerorder.id = '${id}'`

    const connection = await mysql.createConnection(config.db);
    const [results, fields] = await connection.execute(query);
    await connection.end(() => {
        console.log('mysql connection closed');
    })
    console.log('from getOrderById', results);
    return results[0];
}

async function _getAllOrdersDBQuery(status) {
    let query;
    if (status === 'ВСЕ') {
        query = `SELECT customerorder.id,
       customerorder.name,
       customerorder.created,
       deliver.value  AS 'Способ доставки NEW',
       customerorder.description,
       priority.value AS priority
FROM customerorder
         LEFT JOIN customerorder_attributes deliver
                   ON deliver.customerorder_id = customerorder.id AND deliver.name = 'Способ доставки NEW'
         JOIN states ON states.id = customerorder.state
         JOIN store ON store.id = customerorder.store
         LEFT JOIN customerorder_attributes priority
                   ON priority.customerorder_id = customerorder.id AND priority.name = 'Приоритетно'
WHERE store.name = 'Казань, склад А'
  AND customerorder.deleted IS NULL
  AND states.name IN ('НА СБОРКЕ')`
    } else {
        query = `SELECT customerorder.id,
       customerorder.name,
       max(if(SUBSTRING_INDEX(SUBSTRING_INDEX(customerorder_diff.newValue, '''name'': ''', -1), '''}', 1) in ('Наложенный платеж','ЗАКАЗ ОПЛАЧЕН'),customerorder_audit.moment,null)) as created,
       deliver.value  AS 'Способ доставки NEW',
       customerorder.description,
       priority.value AS priority
FROM customerorder
         LEFT JOIN
     customerorder_attributes deliver
     ON deliver.customerorder_id = customerorder.id AND deliver.name = 'Способ доставки NEW'
         JOIN
     states ON states.id = customerorder.state
         JOIN
     store ON store.id = customerorder.store
         LEFT JOIN
     customerorder_attributes priority ON priority.customerorder_id = customerorder.id AND priority.name = 'Приоритетно'
    LEFT join customerorder_audit on customerorder.id = customerorder_audit.customerorder_id
    LEFT join customerorder_diff on customerorder_audit.id = customerorder_diff.audit_id and customerorder_diff.name = 'state'
WHERE store.name = 'Казань, склад А'
  AND customerorder.deleted IS NULL
  AND states.name = '${status}'

group by customerorder.id, customerorder.name, deliver.value, customerorder.description, priority.value`
    }
    const connection = await mysql.createConnection(config.db);
    const [results, fields] = await connection.execute(query);
    await connection.end(() => {
        console.log('mysql connection closed');
    })

    return results;
}

async function _getOrdersInWorkByUser(req) {
    let res;

    const type = STATE_BY_USER_POSITION_IN_WORK.get(req.user.position);
    const userName = req.user.email

    const allOrdersInWorkNoParsed = await redisClient.hGet(ORDERS_IN_WORK, type);
    const allOrdersInWork = JSON.parse(allOrdersInWorkNoParsed);

    if (!allOrdersInWork || allOrdersInWork.filter(item => item.employee === userName).length === 0) {
        res = [];

    } else {
        // return only this user orders in work
        res = allOrdersInWork.filter(item => item.employee === userName);
    }
    return res;
    // return [];
}

async function _getOrdersInWorkByPosition(req) {
    const type = STATE_BY_USER_POSITION_IN_WORK.get(req.user.position);

    try {
        let allOrdersInWork = await redisClient.hGet(ORDERS_IN_WORK, type);
        // console.log('get orders in work by position')
        // console.log(JSON.parse(allOrdersInWork));

        let result;
        if (allOrdersInWork === null) {
            // console.log("YES")
            return [];
        }

        result = JSON.parse(allOrdersInWork);
        return result;
    } catch (error) {
        throw error;
    }
}

async function _addToOrderQueueForPacker(orderId) {
    let currentPackerOrder = await redisClient.get(PACKER_ORDERS)
        .then(data => {
            if (data === null) {
                return []
            } else {
                return JSON.parse(data);
            }
        });

    if (!currentPackerOrder.find(item => item === orderId)) { // если есть, возвращать ошибку?
        currentPackerOrder.push({id: orderId});
    }
    await redisClient.set(PACKER_ORDERS, JSON.stringify(currentPackerOrder));
}

async function _giveOrderFromOrderQueueForPacker(req) {
    let newOrder;
    let currentPackerOrder = await redisClient.get(PACKER_ORDERS).then(data => JSON.parse(data));
    if (currentPackerOrder === null || currentPackerOrder.length < 1) {
        newOrder = null
        return newOrder;
    }
    newOrder = currentPackerOrder.shift();
    await redisClient.set(PACKER_ORDERS, JSON.stringify(currentPackerOrder));

    newOrder = await _getOrderById(newOrder.id).then(data => data[0]);
    return {
        id: newOrder.id,
        name: newOrder.name,
        current: true,
        employee: req.user.email,
        selectedPositions: {},
        priority: newOrder.priority
    }
}

async function hasOrderTaken(order, req) {
    const allOrdersInWorkByPosition = await _getOrdersInWorkByPosition(req);
    console.log('orders in work by position');
    console.log(allOrdersInWorkByPosition);
    console.log(order.id);
    return !!allOrdersInWorkByPosition.find(item => item.id === order.id);
}


async function _giveRandomOrder(req) {
    const allOrdersInWorkByPosition = await _getOrdersInWorkByPosition(req);

    const allOrdersFromDB = await _getAllOrders(req);
    if (allOrdersFromDB.length <= 0) {
        console.log('allOrdersFromDB.length <= 0');
        return null;
    }

    const allOrdersFromDBExceptOrdersInWork = allOrdersFromDB.filter(itemOrdersFromDB => {
        return allOrdersInWorkByPosition.filter(itemOrdersInWork => itemOrdersInWork.id === itemOrdersFromDB.id).length === 0;
    });
    // console.log('allOrdersFromDBExceptOrdersInWork', allOrdersFromDBExceptOrdersInWork);

    if (allOrdersFromDBExceptOrdersInWork.length === 0) {
        // console.log('allOrdersFromDBExceptOrdersInWork.length === 0');
        return null;
    }

    let newOrder;

    // ПРИОРИТЕТНОСТЬ

    // 1. С оплаты прошло более 48 часов
    const redZoneOrdersDate = new Date();
    const redZoneOrders = allOrdersFromDBExceptOrdersInWork.filter(item => {
        // const orderDate = new Date(item.created);
        const diffInMs = redZoneOrdersDate - item.created;
        const diffInHours = diffInMs / (1000 * 60 * 60);
        return diffInHours >= 48
    });

    redZoneOrders.sort((a, b) => a.created - b.created);
    // console.log(redZoneOrders.length);

    // // При создании доп отгрузки нужно чтобы эта новая отгрузка попалась тому же сборщику. Можно сделать по полю "Сборщик"
    // if (req.user.position === 'Упаковщик') {
    //     const ordersWithFilledSborshikField = allOrdersFromDB.filter(order => order.sborshik === req.user.email);
    //     console.log(`Orders with filled field for ${req.user.email}`, ordersWithFilledSborshikField);
    //     if (ordersWithFilledSborshikField.length > 0) {
    //         newOrder = ordersWithFilledSborshikField.pop();
    //
    //         return {
    //             id: newOrder.id,
    //             name: newOrder.name,
    //             current: true,
    //             employee: req.user.email,
    //             selectedPositions: {},
    //             priority: newOrder.priority
    //         };
    //     }
    // }

    // 2. Самовывоз
    const takeAwayOrders = allOrdersFromDBExceptOrdersInWork.filter(item => item.priority === 'Самовывоз');

    // 3. Приоритет
    const priorityOrders = allOrdersFromDBExceptOrdersInWork.filter(item => item.priority === 'Приоритет');

    // 4. Сначала должны падать заказы, которые были оплачены раньше
    allOrdersFromDBExceptOrdersInWork.sort((a, b) => a.created - b.created);
    // console.log('sorted orders', allOrdersFromDBExceptOrdersInWork);
    if (redZoneOrders.length > 0) {
        newOrder = redZoneOrders.shift();
        console.log('ЗАКАЗ ИЗ КРАСНОЙ ЗОНЫ', 'USER', req.user.email);
    } else if (takeAwayOrders.length > 0) {
        newOrder = takeAwayOrders.shift();
        console.log('ЗАКАЗ CАМОВЫВОЗ', 'USER', req.user.email);
    } else if (priorityOrders.length > 0) {
        newOrder = priorityOrders.shift();
        console.log('ЗАКАЗ ПРИОРИТЕТ', 'USER', req.user.email);
    } else {
        newOrder = allOrdersFromDBExceptOrdersInWork.shift();
        console.log('ЗАКАЗ ОБЫЧНЫЙ', 'USER', req.user.email);
    }
    // // priority
    // const priorityOrders = allOrdersFromDB.filter(item => item.priority);
    // console.log('priorityOrders', priorityOrders);
    // if (priorityOrders.length > 0) {
    //     const randomIndex = Math.floor(Math.random() * (priorityOrders.length));
    //     newOrder = priorityOrders[randomIndex];
    // } else {
    //     const randomIndex = Math.floor(Math.random() * (allOrdersFromDB.length));
    //     newOrder = allOrdersFromDB[randomIndex];
    // }

    return {
        id: newOrder.id,
        name: newOrder.name,
        current: true,
        employee: req.user.email,
        selectedPositions: {},
        priority: newOrder.priority
    };
}

async function _addOrderToDB(userEmail, orderId, orderName) {
    try {
        const result = await OrderService.addToDB(userEmail, orderId, orderName);
        console.log('Заказ успешно добавлен в базу данных!', result);
        return result;

    } catch (error) {
        throw error;
    }
}

async function isOrderProcessed(orderId) {
    try {
        const processedOrders = await OrderService.getAllProcessedOrders();
        if (processedOrders.find(item => item.orderId === orderId)) {
            console.log('Заказ уже был в работе!', orderId);
            return true;
        }
        console.log('Заказа нет в базе, можно работать..', orderId);
        return false;

    } catch (error) {
        throw error;
    }
}

async function _setOrderInWork(req, newOrder) {
    try {
        const type = STATE_BY_USER_POSITION_IN_WORK.get(req.user.position);
        const allOrdersInWorkByPosition = await _getOrdersInWorkByPosition(req);
        allOrdersInWorkByPosition.push(newOrder);
        await redisClient.hSet(ORDERS_IN_WORK, type, JSON.stringify(allOrdersInWorkByPosition));

        await _addOrderToDB(req.user.email, newOrder.id, newOrder.name);

        const url = `https://api.moysklad.ru/api/remap/1.2/entity/customerorder/${newOrder.id}`;
        const result = await $api.put(url, {
            state: {
                meta: {
                    href: "https://api.moysklad.ru/api/remap/1.2/entity/customerorder/metadata/states/5be16e1c-b7b6-11ef-0a80-114c001ec82a", // На сборке
                    type: 'state',
                    mediaType: "application/json"
                }
            }
        });

        await _changeOrderBody(newOrder.id, req.user.email, req.user.position);

        // если статус юкасса, наложенный платеж или заказ оплачен - поменять
        // if (req.user.position === 'Сборщик') {
        //     const url = `https://api.moysklad.ru/api/remap/1.2/entity/customerorder/${newOrder.id}`;
        //     const result = await $api.put(url, {
        //         state: {
        //             meta: {
        //                 href: 'https://api.moysklad.ru/api/remap/1.2/entity/customerorder/metadata/states/e8b38a07-ab8e-11ed-0a80-04fb003bf463', // НА СБОРКЕ
        //                 type: 'state',
        //                 mediaType: "application/json"
        //             }
        //         }
        //     });
        //     // console.log('result from changing status to "НА СБОРКЕ"', result);
        // }

        // const type = STATE_BY_USER_POSITION_FOR_WORK.get(req.user.position);
        //
        // const orderId = req.params['id'];
        // const currentUserOrders = await _getOrdersInWorkByUser(req);
        // // console.log(currentUserOrders);
        // // console.log(orderId);
        // console.log('SET ORDER IN WORK', orderId);
        // currentUserOrders.find(item => item.current === true) ? currentUserOrders.find(item => item.current === true).current = false : ""
        // currentUserOrders.find(item => item.id === orderId).current = true;
        // await redisClient.hSet(ORDERS_IN_WORK, type, JSON.stringify(currentUserOrders));
        // console.log('current user orders after set order in work', currentUserOrders);


    } catch (error) {
        throw error;
    }
}

async function _changeOrderBody(orderId, email, position) {
    // console.log('changeOrderBody index')
    try {
        // console.log(req.params)
        const orderUrl = `https://api.moysklad.ru/api/remap/1.2/entity/customerorder/${orderId}`;
        const sborshikHref = ORDER_POSITIONS_HREFS.get('Сборщик'); // Доп поле "Сборщик"
        console.log(orderUrl);

        const updateOrder = await $api.put(orderUrl, {
            attributes: [
                {
                    meta: {
                        "href": sborshikHref,
                        "type": "attributemetadata",
                        "mediaType": "application/json"
                    },
                    value: email
                }
            ]
        });

        // requestCounter++;
        // await DoNeedTimeout();
        // res.json(result.data);
    } catch (error) {
        // console.log("ERROR")
        throw error;
    }
}

class OrderController {
    async getAllOrders(req, res, next) {
        try {
            // console.log('getAllOrders index')
            const result = await _getAllOrders(req);


            res.json(result)
        } catch (error) {
            next(error);
        }
    }


    async getNewOrder(req, res, next) {
        // console.log('getNeweOrder index');
        // if (!ALLOW_TO_GET_NEW_ORDER) {
        //     await sleep(1500);
        // }
        const orderId = req.body.orderId;
        let GIVE_NEW_ORDER = true;
        try {
            while (GIVE_NEW_ORDER) {
                // give new order
                // ALLOW_TO_GET_NEW_ORDER = false;

                // let newOrder;
                // // for packer first try to get order from queue, if there is no order then get it randomly
                // if (req.user.position === 'Упаковщик') {
                //     newOrder = await _giveOrderFromOrderQueueForPacker(req);
                //     console.log('забрали из очереди упаковщика заказ', newOrder);
                // }
                // if (newOrder === null || newOrder === undefined) {
                //     console.log('выдаем из общего пула..')
                //     newOrder = await _giveRandomOrder(req);
                // }
                let newOrder;
                if (orderId) {
                    newOrder = await _getOrderById(orderId).then(order => {
                        return {
                            id: order.id,
                            name: order.name,
                            current: true,
                            employee: req.user.email,
                            selectedPositions: {},
                            priority: order.priority
                        };
                    });
                } else {
                    newOrder = await _giveRandomOrder(req);
                }
                const whenNewOrderWasGet = new Date().toLocaleString("ru-RU", {timeZone: "Europe/Moscow"});
                console.log(`${whenNewOrderWasGet} : ${req.user.email} : _giveRandomOrder() : ${JSON.stringify(newOrder)}`)
                // console.log('newOrder', newOrder);
                // set it to cache if not null
                if (newOrder) {
                    const query = `SELECT customerorder.id    AS 'orderId',
       customerorder.name  AS 'orderName',
       customerorder.created,
       customerorder.description,
       deliver.value       AS 'delivery',
       assortment.pathName AS 'pathName',
       pos.assortment      AS 'assortmentId',
       assortment.name     AS 'assortmentName',
       assortment.article,
       pos.quantity,
       assortment.ean13,
       assortment.type,
       assortment.miniature
FROM customerorder
         LEFT JOIN customerorder_attributes deliver
                   ON deliver.customerorder_id = customerorder.id AND deliver.name = 'Способ доставки NEW'
         JOIN customerorder_positions pos ON customerorder.id = pos.customerorder_id
         LEFT JOIN (SELECT 'product'             AS 'type',
                           product.id,
                           product.name,
                           product.pathName,
                           product.article,
                           barcodes.ean13,
                           MIN(images.miniature) AS miniature
                    FROM product
                             LEFT JOIN images ON product.id = images.product_id
                             LEFT JOIN barcodes ON product.id = barcodes.product_id
                    GROUP BY 'type', product.id, product.name, product.pathName, product.article, barcodes.ean13
                    UNION ALL
                    SELECT 'variant'                                                    AS 'type',
                           variant.id,
                           variant.name,
                           product.pathName,
                           IF(MAX(characteristics.value) IS NULL, product.article,
                              CONCAT(product.article, ' ', MAX(characteristics.value))) AS article,
                           barcodes.ean13,
                           MIN(images.miniature)                                        AS miniature
                    FROM variant
                             JOIN product ON product.id = variant.product
                             LEFT JOIN images ON variant.id = images.variant_id
                             LEFT JOIN characteristics ON characteristics.variant_id = variant.id
                             LEFT JOIN barcodes ON variant.id = barcodes.variant_id
                    GROUP BY 'type', variant.id, variant.name, product.pathName, product.article, barcodes.ean13
                    UNION ALL
                    SELECT 'bundle' AS 'type',
                           bundle.id,
                           if(bundle_counts.components_count = 1, bundle.name, components_positions.name),
                           if(bundle_counts.components_count = 1, bundle.pathName, components_positions.pathName),
                           if(bundle_counts.components_count = 1, bundle.article, components_positions.article),
                           components_positions.ean13,
                           if(bundle_counts.components_count = 1, images.miniature, components_positions.miniature)
                    FROM bundle
                             LEFT JOIN (select images.bundle_id, min(images.miniature) as miniature
                                        from images
                                        group by images.bundle_id) as images ON bundle.id = images.bundle_id
                             JOIN components ON bundle.id = components.bundle_id
                             JOIN (SELECT 'product'             AS 'type',
                                          product.id,
                                          product.name,
                                          product.pathName,
                                          product.article,
                                          barcodes.ean13,
                                          MIN(images.miniature) AS miniature
                                   FROM product
                                            LEFT JOIN images ON product.id = images.product_id
                                            LEFT JOIN barcodes ON product.id = barcodes.product_id
                                   GROUP BY 'type', product.id, product.name, product.pathName, product.article,
                                            barcodes.ean13
                                   UNION ALL
                                   SELECT 'variant'                                                    AS 'type',
                                          variant.id,
                                          variant.name,
                                          product.pathName,
                                          IF(MAX(characteristics.value) IS NULL, product.article,
                                             CONCAT(product.article, ' ', MAX(characteristics.value))) AS article,
                                          barcodes.ean13,
                                          MIN(images.miniature)                                        AS miniature
                                   FROM variant
                                            JOIN product ON product.id = variant.product
                                            LEFT JOIN images ON variant.id = images.variant_id
                                            LEFT JOIN characteristics ON characteristics.variant_id = variant.id
                                            LEFT JOIN barcodes ON variant.id = barcodes.variant_id
                                   GROUP BY 'type', variant.id, variant.name, product.pathName, product.article,
                                            barcodes.ean13) as components_positions
                                  on components_positions.id = components.assortment
                             LEFT JOIN (SELECT bundle_id, COUNT(*) AS components_count
                                        FROM components
                                        GROUP BY bundle_id) AS bundle_counts ON bundle_counts.bundle_id = bundle.id
                    UNION ALL
                    SELECT 'service' AS 'type',
                           service.id,
                           service.name,
                           ''        as 'pathName',
                           ''        AS article,
                           ''        AS ean13,
                           ''        AS miniature
                    FROM service) AS assortment ON assortment.id = pos.assortment
WHERE customerorder.id = '${newOrder.id}'
ORDER BY article`
                    const connection = await mysql.createConnection(config.db);
                    const [results, fields] = await connection.execute(query);
                    await connection.end(() => {
                        console.log('mysql connection closed');
                    })
                    if (results.length > 0 && req.user.position === 'Сборщик') {
                        // console.log(results);

                        for (let i = 0; i < results.length; i++) {
                            if (results[i].pathName?.toLowerCase()?.endsWith('масла') || results[i].pathName?.toLowerCase()?.endsWith('масла под заказ')) {
                                // console.log(results[i].assortmentName + 'TRUE');
                                newOrder.selectedPositions[results[i].assortmentId] = true
                            }
                        }
                    }

                    GIVE_NEW_ORDER = await hasOrderTaken(newOrder, req);
                    console.log(GIVE_NEW_ORDER);
                    if (!GIVE_NEW_ORDER) { // if empty arr or null/undefined
                        await _setOrderInWork(req, newOrder);
                        const whenNewOrderWasSetToWrk = new Date().toLocaleString("ru-RU", {timeZone: "Europe/Moscow"});
                        console.log(`${whenNewOrderWasSetToWrk} : ${req.user.email} : _setOrderInWork : ${JSON.stringify(newOrder)}`)
                        return res.json(newOrder);
                    }
                    console.log('TRYING AGAIN TO TAKE NEW ORDER..', newOrder, req.user.email)
                } else {
                    return res.json(null);
                }
            }
        } catch (error) {
            next(error);
        } finally {
            // ALLOW_TO_GET_NEW_ORDER = true;
        }
    }

    // async setOrderInWork(req, res, next) {
    //     try {
    //         const result = await _setOrderInWork(req);
    //         res.json(result)
    //     } catch (error) {
    //         next(error);
    //     }
    // }

    async updateSelectedRows(req, res, next) {
        try {
            const type = STATE_BY_USER_POSITION_IN_WORK.get(req.user.position);
            const orderId = req.params['id'];
            const updateRows = req.body.updateRows
            // console.log('id', orderId);
            // console.log('updatedIndices', updatedIndices);
            const currentUsersOrders = await _getOrdersInWorkByPosition(req).then(arr => arr.map(item => {
                if (item.id === orderId) {
                    item.selectedPositions = updateRows;
                }
                return item;
            }));

            await redisClient.hSet(ORDERS_IN_WORK, type, JSON.stringify(currentUsersOrders));
            res.json()
        } catch (error) {
            next(error);
        }
    }

    async getOrderByScan(req, res, next) {
        const orderNumber = req.params['orderNumber'].split("o")[1];
        console.log(orderNumber);
        const connection = await mysql.createConnection(config.db);
        const query = `SELECT customerorder.id,
       customerorder.name,
       states.name as state
FROM customerorder
    LEFT JOIN
    states
    ON
    customerorder.state = states.id
WHERE customerorder.name = '${orderNumber}'`

        try {
            const [results, fields] = await connection.execute(query);
            // console.log(results);

            const orders = await Promise.all(results.map(async (item) => {
                const orderIsTaken = await hasOrderTaken(item, req);
                const isProcessed = await isOrderProcessed(item.id);

                return {
                    ...item,
                    isAvailable: !orderIsTaken && item.state === STATE_BY_USER_POSITION_FOR_WORK.get(req.user.position) && !isProcessed
                }
            }));

            console.log(orders);

            res.json(orders);
        } catch (error) {
            next(error);
        }

        await connection.end(() => {
            console.log('mysql connection closed');
        });
    }

    async getOrderById(req, res, next) {
        // console.log('getOrderById index')
        const orderId = req.params['id'];
        console.log('orderId', orderId);
        const userPosition = req.user.position;

        const connection = await mysql.createConnection(config.db);
        try {
            // set order current true
            const currentOrders = await _getOrdersInWorkByPosition(req);
            const updateCache = currentOrders.map(item => {
                if (item.id === orderId) {
                    item.current = true;
                }
                return item;
            });
            await redisClient.hSet(ORDERS_IN_WORK, STATE_BY_USER_POSITION_IN_WORK.get(req.user.position), JSON.stringify(updateCache));

            const query = `SELECT customerorder.id    AS 'orderId',
       customerorder.name  AS 'orderName',
       customerorder.created,
       customerorder.description,
       pinned_docs.value   as pinnedDoc,
       deliver.value       AS 'delivery',
       assortment.pathName AS 'pathName',
       assortment.extraid  AS 'assortmentId',
       assortment.name     AS 'assortmentName',
       assortment.article,
       sum(pos.quantity)   as quantity,
       assortment.ean13,
       assortment.type,
       assortment.miniature,
       assortment.multiplicity
FROM customerorder
         LEFT JOIN
     customerorder_attributes pinned_docs
     ON
         pinned_docs.customerorder_id = customerorder.id
             AND pinned_docs.name = 'Закрывающие документы'
         LEFT JOIN
     customerorder_attributes deliver
     ON
         deliver.customerorder_id = customerorder.id
             AND deliver.name = 'Способ доставки NEW'

         JOIN
     customerorder_positions pos
     ON
         customerorder.id = pos.customerorder_id
         LEFT JOIN
     (SELECT 'product'          AS 'type',
             product.id,
             product.id         as extraid,
             product.name,
             product.pathName,
             product.article,
             barcodes.ean13,
             images.miniature   AS miniature,
             multiplicity.value as multiplicity
      FROM product
               LEFT JOIN
           (SELECT images.product_id,
                   min(images.miniature) as miniature
            FROM images
            GROUP BY images.product_id) AS images
           ON
               product.id = images.product_id
               LEFT JOIN
           product_attributes multiplicity
           ON
               product.id = multiplicity.product_id
                   AND multiplicity.name = 'Кратность заказа'
               LEFT JOIN
           barcodes
           ON
               product.id = barcodes.product_id
      UNION ALL
      SELECT 'variant'                                                    AS 'type',
             variant.id,
             variant.id                                                   as extraid,
             variant.name,
             product.pathName,
             IF(MAX(characteristics.value) IS NULL, product.article,
                CONCAT(product.article, ' ', MAX(characteristics.value))) AS article,
             barcodes.ean13,
             images.miniature                                             AS miniature,
             multiplicity.value                                           as multiplicity
      FROM variant
               JOIN
           product
           ON
               product.id = variant.product
               LEFT JOIN
           (SELECT images.variant_id,
                   min(images.miniature) as miniature
            FROM images
            GROUP BY images.variant_id) AS images
           ON
               variant.id = images.variant_id
               LEFT JOIN
           characteristics
           ON
               characteristics.variant_id = variant.id
               LEFT JOIN
           barcodes
           ON
               variant.id = barcodes.variant_id
               LEFT JOIN
           product_attributes multiplicity
           ON
               product.id = multiplicity.product_id
                   AND multiplicity.name = 'Кратность заказа'
      GROUP BY variant.id,
               variant.name,
               product.pathName,
               product.article,
               barcodes.ean13,
               images.miniature,
               multiplicity.value
      UNION ALL
      SELECT 'bundle'           AS 'type',
             bundle.id,
             IF(bundle_counts.components_count = 1, bundle.id, components_positions.id),
             IF(bundle_counts.components_count = 1, bundle.name, components_positions.name),
             IF(bundle_counts.components_count = 1, bundle.pathName, components_positions.pathName),
             IF(bundle_counts.components_count = 1, bundle.article, components_positions.article),
             components_positions.ean13,
             IF(bundle_counts.components_count = 1, images.miniature, components_positions.miniature),
             multiplicity.value as multiplicity
      FROM bundle
               LEFT JOIN
           (SELECT images.bundle_id,
                   MIN(images.miniature) AS miniature
            FROM images
            GROUP BY images.bundle_id) AS images
           ON
               bundle.id = images.bundle_id
               LEFT JOIN
           bundle_attributes multiplicity
           ON
               bundle.id = multiplicity.bundle_id
                   AND multiplicity.name = 'Кратность заказа'
               JOIN
           components
           ON
               bundle.id = components.bundle_id
               JOIN
           (SELECT 'product'             AS 'type',
                   product.id,
                   product.name,
                   product.pathName,
                   product.article,
                   barcodes.ean13,
                   MIN(images.miniature) AS miniature
            FROM product
                     LEFT JOIN
                 images
                 ON
                     product.id = images.product_id
                     LEFT JOIN
                 barcodes
                 ON
                     product.id = barcodes.product_id
            GROUP BY 'type',
                     product.id,
                     product.name,
                     product.pathName,
                     product.article,
                     barcodes.ean13
            UNION ALL
            SELECT 'variant'                                                    AS 'type',
                   variant.id,
                   variant.name,
                   product.pathName,
                   IF(MAX(characteristics.value) IS NULL, product.article,
                      CONCAT(product.article, ' ', MAX(characteristics.value))) AS article,
                   barcodes.ean13,
                   MIN(images.miniature)                                        AS miniature
            FROM variant
                     JOIN
                 product
                 ON
                     product.id = variant.product
                     LEFT JOIN
                 images
                 ON
                     variant.id = images.variant_id
                     LEFT JOIN
                 characteristics
                 ON
                     characteristics.variant_id = variant.id
                     LEFT JOIN
                 barcodes
                 ON
                     variant.id = barcodes.variant_id
            GROUP BY 'type',
                     variant.id,
                     variant.name,
                     product.pathName,
                     product.article,
                     barcodes.ean13) AS components_positions
           ON
               components_positions.id = components.assortment
               LEFT JOIN
           (SELECT bundle_id,
                   COUNT(*) AS components_count
            FROM components
            GROUP BY bundle_id) AS bundle_counts
           ON
               bundle_counts.bundle_id = bundle.id) AS assortment
     ON
         assortment.id = pos.assortment
WHERE customerorder.id = '${orderId}'
GROUP BY customerorder.id,
         customerorder.name,
         customerorder.created,
         customerorder.description,
         deliver.value,
         assortment.pathName,
         assortment.extraid,
         assortment.name,
         assortment.article,
         assortment.ean13,
         assortment.type,
         assortment.miniature,
         assortment.multiplicity,
         pinned_docs.value
ORDER BY article`
            const [results, fields] = await connection.execute(query);

            let order;
            if (results.length > 0) {
                order = {
                    id: results[0].orderId,
                    name: results[0].orderName,
                    created: results[0].created,
                    delivery: results[0].delivery,
                    description: results[0].description,
                    pinnedDoc: results[0].pinnedDoc,
                    positions: results.map(item => {
                        return {
                            id: item.assortmentId,
                            name: item.assortmentName,
                            article: item.article,
                            quantity: item.quantity,
                            barcode: item.ean13,
                            type: item.type,
                            image: item.miniature,
                            pathName: item.pathName,
                            multiplicity: item.multiplicity
                        }
                    })
                }

                if (order.pinnedDoc === 'ТОРГ 12') {
                    order.positions.push({
                        id: 'torg12doc_like_position',
                        name: 'ТОРГ 12',
                        article: 'ТОРГ 12',
                        type: 'doc',
                        image: '',
                        pathName: '',
                        multiplicity: null
                    });
                    // console.log('TORG 12');
                    console.log(order.positions[order.positions.length - 1]);
                }
                order.positions = order.positions.filter(item => item.name != "Доставка");
                order.positions = order.positions.map(item => {
                    if (item.article?.includes('ММБ') || item.article?.includes('ПВ')) {
                        item.article += ` (${item.name})`;
                    }
                    if (item.multiplicity) {
                        item.article += ` кратность ${item.multiplicity}`
                    }
                    return item;
                });
                // order.positions.sort((a, b) => {
                //     if (a.article < b.article) {
                //         return -1;
                //     }
                //     if (a.article > b.article) {
                //         return 1;
                //     }
                //     return 0;
                // });

            } else {
                order = null;
            }

            // console.log('ORDER BY ID', order);
            const whenNewOrderWasSendToServer = new Date().toLocaleString("ru-RU", {timeZone: "Europe/Moscow"});
            console.log(`${whenNewOrderWasSendToServer} : ${req.user.email} : getDemandById() : ${JSON.stringify(order)}`)
            res.json(order);
        } catch (error) {
            next(error);
        }

        await connection.end(() => {
            console.log('mysql connection closed');
        });
    }

    async changeStatus(req, res, next) {
        try {
            const orderId = req.params.id;
            const statusName = req.body.statusName;
            // const reason = req.body.reason;
            const url = `https://api.moysklad.ru/api/remap/1.2/entity/customerorder/${orderId}`;
            const href = ORDER_STATES.get(statusName);

            const result = await $api.put(url, {
                state: {
                    meta: {
                        href,
                        type: 'state',
                        mediaType: "application/json"
                    }
                },
            })

            res.json(result.data);
        } catch (error) {
            // console.log("ERROR")
            next(error);
        }
    }

    async getAllOrdersInWork(req, res, next) {
        // console.log('getAllOrdersInWork index')
        try {
            // console.log('getAllOrdersInWork');
            const allOrdersInWork = await redisClient.hGetAll(ORDERS_IN_WORK);
            const allOrders = [];

            for (let key in allOrdersInWork) {
                const arr = JSON.parse(allOrdersInWork[key]).map(item => {
                    return {
                        id: item.id,
                        name: item.name,
                        employee: item.employee,
                        status: key
                    }
                })
                allOrders.push(arr);
            }

            const result = allOrders.flat();
            // console.log(result);
            res.json(result);
        } catch (error) {
            next(error);
        }
    }


    async getOrdersInWorkByUser(req, res, next) {
        const userEmail = req.user.email;
        if (userEmail === "admin") {
            return res.json([]);
        }

        try {
            const allOrdersInWorkByPosition = await _getOrdersInWorkByPosition(req);
            const userOrders = allOrdersInWorkByPosition.filter(item => item.employee === userEmail);

            res.json(JSON.stringify(userOrders));

        } catch (error) {
            next(error);
        }
    }

    async removeOrderFromWork(req, res, next) {
        try {
            const orderId = req.params['id'];
            const currentUsersOrders = await redisClient.hGetAll(ORDERS_IN_WORK);

            let result;
            for (let key in currentUsersOrders) {
                const orders = JSON.parse(currentUsersOrders[key]);
                const needToRemove = orders.find(item => item.id === orderId);
                if (needToRemove) {
                    const updatedOrders = orders.filter(item => item.id !== orderId);
                    currentUsersOrders[key] = JSON.stringify(updatedOrders);
                    result = await redisClient.hSet(ORDERS_IN_WORK, key, currentUsersOrders[key]);
                }
            }

            res.json(result);
        } catch (error) {
            next(error);
        }
    }

    async getAllEmployees(req, res, next) {
        try {
            const allUsersFromDB = await UserService.getAllUsers();
            return res.json(allUsersFromDB.filter(user => user.email !== 'admin'));
        } catch (error) {
            next(error);
        }
    }

    async changeOrderResponsibleEmployee(req, res, next) {
        try {
            const orderId = req.body.orderId;
            const newEmployee = req.body.newEmployee;
            // console.log(newEmployee);
            // console.log('you were trying to change order:', orderId);

            const currentUsersOrders = await redisClient.hGetAll(ORDERS_IN_WORK);
            // console.log('currentUsersOrders', currentUsersOrders);

            let result = [];
            for (let key in currentUsersOrders) {
                const orders = JSON.parse(currentUsersOrders[key]);
                const needToUpdate = orders.find(item => item.id === orderId);
                // console.log('orders', orders);
                if (needToUpdate) {
                    const indexToUpdate = orders.findIndex(item => item.id === orderId);
                    orders[indexToUpdate] = {
                        ...needToUpdate,
                        employee: newEmployee.email
                    };

                    currentUsersOrders[key] = JSON.stringify(orders);
                    // // console.log(currentUsersOrders);
                    await redisClient.hSet(ORDERS_IN_WORK, key, currentUsersOrders[key]);
                }
                result.push(orders.map(item => {
                    return {
                        id: item.id,
                        name: item.name,
                        employee: item.employee,
                        status: key
                    }
                }));
            }

            // console.log(result);

            res.json(result.flat());
        } catch (error) {
            next(error);
        }
    }

    async addToWaitingList(req, res, next) {
        // console.log('addToWaitingList index');
        try {
            const orderId = req.body.orderId;
            const typeType = req.body.type;
            const reason = req.body.reason;
            // console.log(reason)
            const type = STATE_BY_USER_POSITION_IN_WORK.get(req.user.position);

            const ordersInWork = await redisClient.hGet(ORDERS_IN_WORK, type).then(data => JSON.parse(data));
            const updatedOrdersInWork = JSON.stringify(ordersInWork.map(item => {
                if (item.id === orderId) {
                    item.current = false;
                    item[typeType] = reason;
                }
                return item;
            }));

            await redisClient.hSet(ORDERS_IN_WORK, type, updatedOrdersInWork);

            res.json(updatedOrdersInWork);
        } catch (error) {
            next(error);
        }
    }
}

module.exports = new OrderController();
