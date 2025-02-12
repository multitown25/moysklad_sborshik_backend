const $api = require('../http/index');
const OrderModel = require('../models/order-model');
const config = require('../config');
const mysql = require('mysql2/promise');
const redisClient = require('../service/redis-client');
const UserService = require('../service/user-service');
const { STATE_BY_USER_POSITION_FOR_WORK, STATE_BY_USER_POSITION_IN_WORK, DEMAND_STATES } = require('../moysklad/data');
// let ALLOW_TO_GET_NEW_ORDER = true;
// let GIVE_NEW_ORDER = true;

// const STATES = new Map([
//     ['Собрано', 'https://api.moysklad.ru/api/remap/1.2/entity/demand/metadata/states/7d385378-49c9-11ec-0a80-089e00198b92'],
//     ['Корректировка', 'https://api.moysklad.ru/api/remap/1.2/entity/demand/metadata/states/4a52efe0-41ff-11ec-0a80-02d0001cfb4f'],
//     ['Упаковано', 'https://api.moysklad.ru/api/remap/1.2/entity/demand/metadata/states/4f90421c-11a3-11ef-0a80-063a00036159'],
//     ['Розлив', 'https://api.moysklad.ru/api/remap/1.2/entity/demand/metadata/states/1cfb1e34-f642-11ee-0a80-00fc000840c9']
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
    const query = `SELECT demand.id,
       demand.name,
       demand.created,
       deliver.value  AS 'Способ доставки NEW',
       demand.description,
       priority.value AS priority,
       sborshik.value AS sborshik,
       customerorder.name as customerorderName
FROM demand
         LEFT JOIN
     demand_attributes deliver ON deliver.demand_id = demand.id AND deliver.name = 'Способ доставки NEW'
         JOIN
     states ON states.id = demand.state
         JOIN
     store ON store.id = demand.store
         LEFT JOIN
     demand_attributes priority ON priority.demand_id = demand.id AND priority.name = 'Приоритетно'
         LEFT JOIN
     demand_attributes sborshik ON sborshik.demand_id = demand.id AND sborshik.name = 'Сборщик'
     LEFT JOIN
        customerorder on demand.customerOrder = customerorder.id
WHERE demand.id = '${id}'`

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
        query = `SELECT demand.id,
       demand.name,
       demand.created,
       deliver.value  AS 'Способ доставки NEW',
       demand.description,
       priority.value AS priority,
       states.name as state
FROM demand
         LEFT JOIN demand_attributes deliver ON deliver.demand_id = demand.id AND deliver.name = 'Способ доставки NEW'
         JOIN states ON states.id = demand.state
         JOIN store ON store.id = demand.store
         LEFT JOIN demand_attributes priority ON priority.demand_id = demand.id AND priority.name = 'Приоритетно'
WHERE store.name = 'Казань, склад А'
  AND demand.deleted IS NULL
  AND states.name IN ('Розлив', 'Готов к сборке', 'На сборке', 'Собрано', 'На упаковке', 'Упаковано', 'Корректировка')`
    } else {
        query = `SELECT demand.id,
       demand.name,
       demand.created,
       deliver.value  AS 'Способ доставки NEW',
       demand.description,
       priority.value AS priority,
       sborshik.value AS sborshik,
       customerorder.name as customerorderName
FROM demand
         LEFT JOIN
     demand_attributes deliver ON deliver.demand_id = demand.id AND deliver.name = 'Способ доставки NEW'
         JOIN
     states ON states.id = demand.state
         JOIN
     store ON store.id = demand.store
         LEFT JOIN
     demand_attributes priority ON priority.demand_id = demand.id AND priority.name = 'Приоритетно'
         LEFT JOIN
     demand_attributes sborshik ON sborshik.demand_id = demand.id AND sborshik.name = 'Сборщик'
     LEFT JOIN
    customerorder ON demand.customerOrder = customerorder.id
WHERE store.name = 'Казань, склад А'
  AND demand.deleted IS NULL
  AND states.name = '${status}'`
    }
    const connection = await mysql.createConnection(config.db);
    const [results, fields] = await connection.execute(query);
    await connection.end(() => {
        console.log('mysql connection closed');
    })

    return results;
}

// async function _getOrdersInWorkByUser(req) {
//     let res;
//
//     const type = STATE_BY_USER_POSITION_IN_WORK.get(req.user.position);
//     const userName = req.user.email
//
//     const allOrdersInWorkNoParsed = await redisClient.hGet(ORDERS_IN_WORK, type);
//     const allOrdersInWork = JSON.parse(allOrdersInWorkNoParsed);
//
//     if (!allOrdersInWork || allOrdersInWork.filter(item => item.employee === userName).length === 0) {
//         res = [];
//
//     } else {
//         // return only this user orders in work
//         res = allOrdersInWork.filter(item => item.employee === userName);
//     }
//     return res;
//     // return [];
// }

async function _getDemandsInWorkByPosition(req) {
    const type = STATE_BY_USER_POSITION_IN_WORK.get(req.user.position);

    try {
        let allOrdersInWork = await redisClient.hGet(ORDERS_IN_WORK, type);

        if (allOrdersInWork === null) {
            // console.log("YES")
            return [];
        }

        const result = JSON.parse(allOrdersInWork);
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
    const allOrdersInWorkByPosition = await _getDemandsInWorkByPosition(req);
    console.log('orders in work by position');
    console.log(allOrdersInWorkByPosition);
    console.log(order.id);
    return !!allOrdersInWorkByPosition.find(item => item.id === order.id);
}


async function _giveRandomOrder(req) {
    const allOrdersInWorkByPosition = await _getDemandsInWorkByPosition(req);

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
        priority: newOrder.priority,
        customerorderName: newOrder.customerorderName
    };
}

async function _setOrderInWork(req, newOrder) {
    try {
        const type = STATE_BY_USER_POSITION_IN_WORK.get(req.user.position);
        const allOrdersInWorkByPosition = await _getDemandsInWorkByPosition(req);
        allOrdersInWorkByPosition.push(newOrder);
        await redisClient.hSet(ORDERS_IN_WORK, type, JSON.stringify(allOrdersInWorkByPosition));


        const url = `https://api.moysklad.ru/api/remap/1.2/entity/demand/${newOrder.id}`;
        const nextStatus = DEMAND_STATES.get('На упаковке'); // На упаковке
        const result = await $api.put(url, {
            state: {
                meta: {
                    href: nextStatus,
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

async function _changeOrderBody(demandId, email, position) {
    // console.log('changeOrderBody index')
    try {
        // console.log(req.params)
        const demandUrl = `https://api.moysklad.ru/api/remap/1.2/entity/demand/${demandId}`;
        const updateDemand = await $api.put(demandUrl, {
            attributes: [
                {
                    meta: {
                        "href": "https://api.moysklad.ru/api/remap/1.2/entity/demand/metadata/attributes/46bbb4eb-0c1f-11ef-0a80-037a0002bd44", // Доп поле "Упаковщик"
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

class DemandController {
    async getAllDemands(req, res, next) {
        try {
            // console.log('getAllOrders index')
            const result = await _getAllOrders(req);


            res.json(result)
        } catch (error) {
            next(error);
        }
    }


    async getNewDemand(req, res, next) {
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
                            priority: order.priority,
                            customerorderName: order.customerorderName
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
                    const query = `SELECT demand.id           AS 'orderId',
       demand.name         AS 'orderName',
       demand.created,
       demand.description,
       deliver.value       AS 'delivery',
       assortment.pathName AS 'pathName',
       pos.assortment      AS 'assortmentId',
       assortment.name     AS 'assortmentName',
       assortment.article,
       pos.quantity,
       assortment.ean13,
       assortment.type,
       assortment.miniature
FROM demand
         LEFT JOIN demand_attributes deliver ON deliver.demand_id = demand.id AND deliver.name = 'Способ доставки NEW'
         JOIN demand_positions pos ON demand.id = pos.demand_id
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
WHERE demand.id = '${newOrder.id}'
ORDER BY article`
                    const connection = await mysql.createConnection(config.db);
                    const [results, fields] = await connection.execute(query);
                    await connection.end(() => {
                        console.log('mysql connection closed');
                    })
                    if (results.length > 0 && req.user.position === 'Сборщик') {
                        // console.log(results);

                        for (let i = 0; i < results.length; i++) {
                            if (results[i].pathName?.toLowerCase().endsWith('масла') || results[i].pathName?.toLowerCase().endsWith('масла под заказ')) {
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
            const demandId = req.params['id'];
            const updateRows = req.body.updateRows
            // console.log('id', orderId);
            // console.log('updatedIndices', updatedIndices);
            const currentUsersOrders = await _getDemandsInWorkByPosition(req).then(arr => arr.map(item => {
                if (item.id === demandId) {
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


    async getDemandById(req, res, next) {
        // console.log('getOrderById index')
        const demandId = req.params['id'];
        console.log('demandId', demandId);

        const connection = await mysql.createConnection(config.db);
        try {
            // set order current true
            const currentOrders = await _getDemandsInWorkByPosition(req);
            const updateCache = currentOrders.map(item => {
                if (item.id === demandId) {
                    item.current = true;
                }
                return item;
            });
            await redisClient.hSet(ORDERS_IN_WORK, STATE_BY_USER_POSITION_IN_WORK.get(req.user.position), JSON.stringify(updateCache));

            const query = `SELECT
    demand.id AS 'demandId',
    demand.name AS 'demandName',
    demand.created,
    demand.description,
    pinned_docs.value as pinnedDoc,
    deliver.value AS 'delivery',
    assortment.pathName AS 'pathName',
    assortment.extraid AS 'assortmentId',
    assortment.name AS 'assortmentName',
    assortment.article,
    sum(pos.quantity) as quantity,
    assortment.ean13,
    assortment.type,
    assortment.miniature,
    assortment.multiplicity,
    customerorder.name as orderName
FROM
    demand
LEFT JOIN
    demand_attributes pinned_docs
ON
    pinned_docs.demand_id = demand.id
    AND pinned_docs.name = 'Закрывающие документы'
LEFT JOIN
    customerorder
ON
    customerorder.id = demand.customerOrder
LEFT JOIN
    demand_attributes deliver
ON
    deliver.demand_id = demand.id
    AND deliver.name = 'Способ доставки NEW'

JOIN
    demand_positions pos
ON
    demand.id = pos.demand_id
JOIN
    (
        SELECT
            'product' AS 'type',
            product.id,
            product.id as extraid,
            product.name,
            product.pathName,
            product.article,
            barcodes.ean13,
            images.miniature AS miniature,
            multiplicity.value as multiplicity
        FROM
            product
        LEFT JOIN
            (
                SELECT i.product_id, i.miniature
                FROM images i
                 JOIN (SELECT product_id, MIN(id) AS min_id
                       FROM images
                       GROUP BY product_id) AS min_images ON i.product_id = min_images.product_id AND i.id = min_images.min_id

                    ) AS images
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
        SELECT
            'variant' AS 'type',
            variant.id,
            variant.id as extraid,
            variant.name,
            product.pathName,
            IF(MAX(characteristics.value) IS NULL, product.article, CONCAT(product.article, ' ', MAX(characteristics.value))) AS article,
            barcodes.ean13,
            images.miniature AS miniature,
            multiplicity.value as multiplicity
        FROM
            variant
        JOIN
            product
        ON
            product.id = variant.product
        LEFT JOIN
            (
                SELECT i.variant_id, i.miniature
FROM images i
         JOIN (SELECT variant_id, MIN(id) AS min_id
               FROM images
               GROUP BY variant_id) AS min_images ON i.variant_id = min_images.variant_id AND i.id = min_images.min_id

            ) AS images
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
        GROUP BY
            variant.id,
            variant.name,
            product.pathName,
            product.article,
            barcodes.ean13,
            images.miniature,
            multiplicity.value
        UNION ALL
        SELECT
            'bundle' AS 'type',
            bundle.id,
            IF(bundle_counts.components_count=1, bundle.id, components_positions.id),
            IF(bundle_counts.components_count=1, bundle.name, components_positions.name),
            IF(bundle_counts.components_count=1, bundle.pathName, components_positions.pathName),
            IF(bundle_counts.components_count=1, bundle.article, components_positions.article),
            components_positions.ean13,
            IF(bundle_counts.components_count=1, images.miniature, components_positions.miniature),
            multiplicity.value as multiplicity
        FROM
            bundle
        LEFT JOIN
            (
                SELECT i.bundle_id, i.miniature
FROM images i
         JOIN (SELECT bundle_id, MIN(id) AS min_id
               FROM images
               GROUP BY bundle_id) AS min_images ON i.bundle_id = min_images.bundle_id AND i.id = min_images.min_id

            ) AS images
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
            (
                SELECT
                    'product' AS 'type',
                    product.id,
                    product.name,
                    product.pathName,
                    product.article,
                    barcodes.ean13,
                    MIN(images.miniature) AS miniature
                FROM
                    product
                LEFT JOIN
                    images
                ON
                    product.id = images.product_id
                LEFT JOIN
                    barcodes
                ON
                    product.id = barcodes.product_id
                GROUP BY
                    'type',
                    product.id,
                    product.name,
                    product.pathName,
                    product.article,
                    barcodes.ean13
                UNION ALL
                SELECT
                    'variant' AS 'type',
                    variant.id,
                    variant.name,
                    product.pathName,
                    IF(MAX(characteristics.value) IS NULL, product.article, CONCAT(product.article, ' ', MAX(characteristics.value))) AS article,
                    barcodes.ean13,
                    MIN(images.miniature) AS miniature
                FROM
                    variant
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
                GROUP BY
                    'type',
                    variant.id,
                    variant.name,
                    product.pathName,
                    product.article,
                    barcodes.ean13
            ) AS components_positions
        ON
            components_positions.id = components.assortment
        LEFT JOIN
            (
                SELECT
                    bundle_id,
                    COUNT(*) AS components_count
                FROM
                    components
                GROUP BY
                    bundle_id
            ) AS bundle_counts
        ON
            bundle_counts.bundle_id = bundle.id
    ) AS assortment
ON
    assortment.id = pos.assortment
WHERE
    demand.id = '${demandId}'
GROUP BY
    demand.id,
    demand.name,
    demand.created,
    demand.description,
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
ORDER BY
    article`
            const [results, fields] = await connection.execute(query);

            let order;
            if (results.length > 0) {
                order = {
                    id: results[0].demandId,
                    name: results[0].demandName,
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
                    }),
                    orderName: results[0].orderName
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
            const demandId = req.params.id;
            const statusName = req.body.statusName;
            // const reason = req.body.reason;
            const url = `https://api.moysklad.ru/api/remap/1.2/entity/demand/${demandId}`;
            const href = DEMAND_STATES.get(statusName);

            const result = await $api.put(url, {
                state: {
                    meta: {
                        href,
                        type: 'state',
                        mediaType: "application/json"
                    }
                },
            });

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


    async getDemandsInWorkByUser(req, res, next) {
        const userEmail = req.user.email;
        if (userEmail === "admin") {
            return res.json([]);
        }

        try {
            const allOrdersInWorkByPosition = await _getDemandsInWorkByPosition(req);
            const userOrders = allOrdersInWorkByPosition.filter(item => item.employee === userEmail);

            res.json(JSON.stringify(userOrders));
        } catch (error) {
            next(error);
        }
    }

    async removeOrderFromWork(req, res, next) {
        try {
            const demandId = req.params['id'];
            const currentUsersDemands = await redisClient.hGetAll(ORDERS_IN_WORK);

            let result;
            for (let key in currentUsersDemands) {
                const demands = JSON.parse(currentUsersDemands[key]);
                const needToRemove = demands.find(item => item.id === demandId);
                // console.log('orders', orders);
                if (needToRemove) {
                    // console.log(`order ${orderId} was removed`)
                    const updatedDemands = demands.filter(item => item.id !== demandId);
                    currentUsersDemands[key] = JSON.stringify(updatedDemands);
                    // console.log(currentUsersOrders);
                    result = await redisClient.hSet(ORDERS_IN_WORK, key, currentUsersDemands[key]);
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
        try {
            const demandId = req.body.demandId;
            const typeType = req.body.type;
            const reason = req.body.reason;
            // console.log(reason)
            const type = STATE_BY_USER_POSITION_IN_WORK.get(req.user.position);

            const ordersInWork = await redisClient.hGet(ORDERS_IN_WORK, type).then(data => JSON.parse(data));
            const updatedOrdersInWork = JSON.stringify(ordersInWork.map(item => {
                if (item.id === demandId) {
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

module.exports = new DemandController();