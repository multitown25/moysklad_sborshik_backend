const $api = require('../http/index');
const OrderModel = require('../models/order-model');
const config = require('../config');
const mysql = require('mysql2/promise');
const redisClient = require('../service/redis-client');
const UserService = require('../service/user-service');

const STATES = new Map([
    ['Собрано', 'https://api.moysklad.ru/api/remap/1.2/entity/customerorder/metadata/states/beaf29eb-b0fd-11ed-0a80-02dc0038a0e5'],
    ['Корректировка', 'https://api.moysklad.ru/api/remap/1.2/entity/customerorder/metadata/states/3ffc2d79-bb34-11ed-0a80-0cd400212101'],
    ['НА УПАКОВКЕ', 'https://api.moysklad.ru/api/remap/1.2/entity/customerorder/metadata/states/45070416-c1ac-11ee-0a80-07e3000021ff'],
    ['РАЗЛИВ МАСЕЛ', 'https://api.moysklad.ru/api/remap/1.2/entity/customerorder/metadata/states/2b3967e8-8474-11ee-0a80-07930027acd1']
]);

const STATE_BY_USER_POSITION = new Map([
    ['Сборщик', 'НА СБОРКЕ'],
    ['Упаковщик', 'НА УПАКОВКЕ'],
    ['Разливщик масел', 'РАЗЛИВ МАСЕЛ']
]);

const NEXT_STATE_BY_USER_POSITION = new Map([
    ['Сборщик', 'https://api.moysklad.ru/api/remap/1.2/entity/customerorder/metadata/states/45070416-c1ac-11ee-0a80-07e3000021ff'],
    ['Упаковщик', 'https://api.moysklad.ru/api/remap/1.2/entity/customerorder/metadata/states/beaf29eb-b0fd-11ed-0a80-02dc0038a0e5'],
    ['Разливщик масел', 'РАЗЛИВ МАСЕЛ']
])

const ORDERS_IN_WORK = 'Orders in work';

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
        // const naSborke = await _getAllOrdersDBQuery(STATE_BY_USER_POSITION.get("Сборщик"));
        const naSborke = [];

        const ukassa = await _getAllOrdersDBQuery('ЮКАССА');
        const zakazOplachen = await _getAllOrdersDBQuery('ЗАКАЗ ОПЛАЧЕН');
        const nalojka = await _getAllOrdersDBQuery('Наложенный платеж');

        const naUpakovke = await _getAllOrdersDBQuery(STATE_BY_USER_POSITION.get("Упаковщик"))
        const naRazliveMasel = await _getAllOrdersDBQuery(STATE_BY_USER_POSITION.get("Разливщик масел"))

        const result = naSborke.map(item => {
            return {
                id: item.id,
                name: item.name,
                status: "НА СБОРКЕ"
            }
        }).concat(naUpakovke.map(item => {
            return {
                id: item.id,
                name: item.name,
                status: "НА УПАКОВКЕ"
            }
        }), naRazliveMasel.map(item => {
            return {
                id: item.id,
                name: item.name,
                status: "РАЗЛИВ МАСЕЛ"
            }
        }), ukassa.map(item => {
            return {
                id: item.id,
                name: item.name,
                status: "ЮКАССА"
            }
        }), zakazOplachen.map(item => {
            return {
                id: item.id,
                name: item.name,
                status: "ЗАКАЗ ОПЛАЧЕН"
            }
        }), nalojka.map(item => {
            return {
                id: item.id,
                name: item.name,
                status: "Наложенный платеж"
            }
        }));
        // console.log(result)
        return result;
    }
    // console.log(result)
    const neededStatus = STATE_BY_USER_POSITION.get(req.user.position);
    const result = await _getAllOrdersDBQuery(neededStatus);
    return result;
}

async function _getAllOrdersDBQuery(status) {
    let query;
    if (status === 'НА СБОРКЕ') {
        query = `SELECT customerorder.id, customerorder.name, customerorder.created, deliver.value AS 'Способ доставки NEW', customerorder.description, priority.value AS priority FROM customerorder LEFT JOIN customerorder_attributes deliver ON deliver.customerorder_id = customerorder.id AND deliver.name = 'Способ доставки NEW' JOIN states ON states.id = customerorder.state JOIN store ON store.id = customerorder.store LEFT JOIN customerorder_attributes priority ON priority.customerorder_id = customerorder.id AND priority.name = 'Приоритетно' WHERE store.name = 'Казань, склад А' AND states.name IN ('ЮКАССА', 'ЗАКАЗ ОПЛАЧЕН', 'Наложенный платеж')`
    } else {
        query = `SELECT customerorder.id, customerorder.name, customerorder.created, deliver.value 'Способ доставки NEW', customerorder.description FROM customerorder LEFT JOIN customerorder_attributes deliver ON deliver.customerorder_id = customerorder.id and deliver.name = 'Способ доставки NEW' JOIN states on states.id = customerorder.state JOIN store on store.id = customerorder.store WHERE store.name = 'Казань, склад А' AND states.name = '${status}'`
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

    const type = STATE_BY_USER_POSITION.get(req.user.position);
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
    const type = STATE_BY_USER_POSITION.get(req.user.position);

    try {
        let allOrdersInWork = await redisClient.hGet(ORDERS_IN_WORK, type);
        console.log('get orders in work by position')
        // console.log(JSON.parse(allOrdersInWork));

        let result;
        if (allOrdersInWork === null) {
            console.log("YES")
            return [];
        }

        result = JSON.parse(allOrdersInWork);
        return result;
    } catch (error) {
        throw error;
    }
}


async function _giveRandomOrder(req) {
    const allOrdersInWorkByPosition = await _getOrdersInWorkByPosition(req);

    const allOrdersFromDB = await _getAllOrders(req);
    if (allOrdersFromDB.length <= 0) {
        console.log('allOrdersFromDB.length <= 0');
        return null;
    }

    let newOrder;

    // priority
    const priorityOrders = allOrdersFromDB.filter(item => item.priority);
    console.log('priorityOrders', priorityOrders);
    if (priorityOrders.length > 0) {
        const randomIndex = Math.floor(Math.random() * (priorityOrders.length));
        newOrder = priorityOrders[randomIndex];
    } else {
        const randomIndex = Math.floor(Math.random() * (allOrdersFromDB.length));
        newOrder = allOrdersFromDB[randomIndex];
    }

    // if (allOrdersInWorkByPosition === null) {
    //     const randomIndex = Math.floor(Math.random() * (allOrdersFromDB.length));
    //     const newOrder = allOrdersFromDB[randomIndex];
    //
    //     return {
    //         id: newOrder.id,
    //         name: newOrder.name,
    //         current: true,
    //         employee: req.user.email,
    //         selectedPositions: {}
    //     };
    // }
    //
    // const allOrdersFromDBExceptOrdersInWork = allOrdersFromDB.filter(itemOrdersFromDB => {
    //     return allOrdersInWorkByPosition.filter(itemOrdersInWork => itemOrdersInWork.id === itemOrdersFromDB.id).length === 0;
    // });
    // // console.log('allOrdersFromDBExceptOrdersInWork', allOrdersFromDBExceptOrdersInWork);
    //
    // if (allOrdersFromDBExceptOrdersInWork.length === 0) {
    //     // console.log('allOrdersFromDBExceptOrdersInWork.length === 0');
    //     return null;
    // }
    // const randomIndex = Math.floor(Math.random() * (allOrdersFromDBExceptOrdersInWork.length));
    // const newOrder = allOrdersFromDBExceptOrdersInWork[randomIndex]
    console.log('new order', newOrder);

    return {
        id: newOrder.id,
        name: newOrder.name,
        current: true,
        employee: req.user.email,
        selectedPositions: {},
        priority: newOrder.priority
    }
}

async function _setOrderInWork(req, newOrder) {
    try {
        const type = STATE_BY_USER_POSITION.get(req.user.position);
        const allOrdersInWorkByPosition = await _getOrdersInWorkByPosition(req);
        allOrdersInWorkByPosition.push(newOrder);
        await redisClient.hSet(ORDERS_IN_WORK, type, JSON.stringify(allOrdersInWorkByPosition));


        // если статус юкасса, наложенный платеж или заказ оплачен - поменять
        if (req.user.position === 'Сборщик') {
            const url = `https://api.moysklad.ru/api/remap/1.2/entity/customerorder/${newOrder.id}`;
            const result = await $api.put(url, {
                state: {
                    meta: {
                        href: 'https://api.moysklad.ru/api/remap/1.2/entity/customerorder/metadata/states/e8b38a07-ab8e-11ed-0a80-04fb003bf463', // НА СБОРКЕ
                        type: 'state',
                        mediaType: "application/json"
                    }
                }
            });
            // console.log('result from changing status to "НА СБОРКЕ"', result);
        }

        // const type = STATE_BY_USER_POSITION.get(req.user.position);
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
        try {
            // give new order

            const newOrder = await _giveRandomOrder(req);
            // console.log('newOrder', newOrder);
            // set it to cache if not null
            if (newOrder) {
                const query = `SELECT customerorder.id AS 'orderId', customerorder.name AS 'orderName', customerorder.created, customerorder.description, deliver.value AS 'delivery', assortment.pathName AS 'pathName', pos.assortment AS 'assortmentId', assortment.name AS 'assortmentName', assortment.article, pos.quantity, assortment.ean13, assortment.type, assortment.miniature FROM customerorder LEFT JOIN customerorder_attributes deliver ON deliver.customerorder_id = customerorder.id AND deliver.name = 'Способ доставки NEW' JOIN customerorder_positions pos ON customerorder.id = pos.customerorder_id LEFT JOIN (SELECT 'product' AS 'type', product.id, product.name, product.pathName, product.article, barcodes.ean13, MIN(images.miniature) AS miniature FROM product LEFT JOIN images ON product.id = images.product_id LEFT JOIN barcodes ON product.id = barcodes.product_id GROUP BY 'type', product.id, product.name, product.pathName, product.article, barcodes.ean13 UNION ALL SELECT 'variant' AS 'type', variant.id, variant.name, product.pathName, IF(MAX(characteristics.value) IS NULL, product.article, CONCAT(product.article, ' ', MAX(characteristics.value))) AS article, barcodes.ean13, MIN(images.miniature) AS miniature FROM variant JOIN product ON product.id = variant.product LEFT JOIN images ON variant.id = images.variant_id LEFT JOIN characteristics ON characteristics.variant_id = variant.id LEFT JOIN barcodes ON variant.id = barcodes.variant_id GROUP BY 'type', variant.id, variant.name, product.pathName, product.article, barcodes.ean13 UNION ALL SELECT 'bundle' AS 'type', bundle.id, if(bundle_counts.components_count=1,bundle.name,components_positions.name), if(bundle_counts.components_count=1,bundle.pathName,components_positions.pathName), if(bundle_counts.components_count=1,bundle.article,components_positions.article), components_positions.ean13, if(bundle_counts.components_count=1,images.miniature,components_positions.miniature) FROM bundle LEFT JOIN (select images.bundle_id, min(images.miniature) as miniature from images group by images.bundle_id) as images ON bundle.id = images.bundle_id JOIN components ON bundle.id = components.bundle_id JOIN (SELECT 'product' AS 'type', product.id, product.name, product.pathName, product.article, barcodes.ean13, MIN(images.miniature) AS miniature FROM product LEFT JOIN images ON product.id = images.product_id LEFT JOIN barcodes ON product.id = barcodes.product_id GROUP BY 'type', product.id, product.name, product.pathName, product.article, barcodes.ean13 UNION ALL SELECT 'variant' AS 'type', variant.id, variant.name, product.pathName, IF(MAX(characteristics.value) IS NULL, product.article, CONCAT(product.article, ' ', MAX(characteristics.value))) AS article, barcodes.ean13, MIN(images.miniature) AS miniature FROM variant JOIN product ON product.id = variant.product LEFT JOIN images ON variant.id = images.variant_id LEFT JOIN characteristics ON characteristics.variant_id = variant.id LEFT JOIN barcodes ON variant.id = barcodes.variant_id GROUP BY 'type', variant.id, variant.name, product.pathName, product.article, barcodes.ean13 ) as components_positions on components_positions.id = components.assortment LEFT JOIN (SELECT bundle_id, COUNT(*) AS components_count FROM components GROUP BY bundle_id ) AS bundle_counts ON bundle_counts.bundle_id = bundle.id UNION ALL SELECT 'service' AS 'type', service.id, service.name, '' as 'pathName', '' AS article, '' AS ean13, '' AS miniature FROM service ) AS assortment ON assortment.id = pos.assortment WHERE customerorder.id = '${newOrder.id}' ORDER BY article`
                const connection = await mysql.createConnection(config.db);
                const [results, fields] = await connection.execute(query);
                await connection.end(() => {
                    console.log('mysql connection closed');
                })
                if (results.length > 0) {
                    // console.log(results);

                    for (let i = 0; i < results.length; i++) {
                        if (results[i].pathName.toLowerCase().endsWith('масла') || results[i].pathName.toLowerCase().endsWith('масла под заказ')) {
                            console.log(results[i].assortmentName + 'TRUE');
                            newOrder.selectedPositions[results[i].assortmentId] = true
                        }
                    }
                }

                await _setOrderInWork(req, newOrder);
                return res.json(newOrder);
            } else {
                return res.json(null);
            }
        } catch (error) {
            next(error);
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
            const type = STATE_BY_USER_POSITION.get(req.user.position);
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

    async getOrderById(req, res, next) {
        // console.log('getOrderById index')
        const orderId = req.params['id'];
        // console.log('orderId', orderId);

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
            await redisClient.hSet(ORDERS_IN_WORK, STATE_BY_USER_POSITION.get(req.user.position), JSON.stringify(updateCache));

            const query = `SELECT 
    customerorder.id AS 'orderId', 
    customerorder.name AS 'orderName', 
    customerorder.created, 
    customerorder.description,
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
    assortment.multiplicity 
FROM 
    customerorder
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
                SELECT 
                    images.product_id, 
                    min(images.miniature) as miniature 
                FROM 
                    images 
                GROUP BY 
                    images.product_id
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
                SELECT 
                    images.variant_id, 
                    min(images.miniature) as miniature 
                FROM 
                    images 
                GROUP BY 
                    images.variant_id
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
                SELECT 
                    images.bundle_id, 
                    MIN(images.miniature) AS miniature 
                FROM 
                    images 
                GROUP BY 
                    images.bundle_id
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
    customerorder.id = '${orderId}'
GROUP BY
    customerorder.id,
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
ORDER BY 
    article`
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
                    console.log('TORG 12');
                    console.log(order.positions[order.positions.length - 1]);
                }
                order.positions = order.positions.filter(item => item.name != "Доставка");
                order.positions = order.positions.map(item => {
                    if (item.article.includes('ММБ') || item.article.includes('ПВ')) {
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

            console.log('ORDER BY ID', order);
            res.json(order);
        } catch (error) {
            next(error);
        }

        await connection.end(() => {
            console.log('mysql connection closed');
        });
    }

    async changeOrderStatus(req, res, next) {
        // console.log('changeOrderStatus index')
        try {
            console.log(req.params)
            const orderId = req.params.id;
            const statusName = req.body.statusName;
            const newDescription = req.body.description;
            // console.log('new desc', newDescription);
            const url = `https://api.moysklad.ru/api/remap/1.2/entity/customerorder/${orderId}`;
            // console.log(url);
            const statusHref = STATES.get(statusName);
            // console.log(statusHref);
            console.log("CHANGE STATUS NAME ON " + statusName);
            // console.log(url)

            let result;
            if (newDescription) {
                result = await $api.put(url, {
                    state: {
                        meta: {
                            href: statusHref,
                            type: 'state',
                            mediaType: "application/json"
                        }
                    },
                    description: newDescription
                });
            } else {
                result = await $api.put(url, {
                    state: {
                        meta: {
                            href: statusHref,
                            type: 'state',
                            mediaType: "application/json"
                        }
                    }
                });
            }

            // requestCounter++;
            // await DoNeedTimeout();
            res.json(result.data);
        } catch (error) {
            // console.log("ERROR")
            next(error);
        }
    }

    async changeOrderBody(req, res, next) {
        console.log('changeOrderBody index')
        try {
            console.log(req.params)
            const orderId = req.params.id;
            const userEmail = req.body.userEmail
            const url = `https://api.moysklad.ru/api/remap/1.2/entity/customerorder/${orderId}`;
            console.log(url);

            const result = await $api.put(url, {
                attributes: [
                    {
                        meta: {
                            "href": "https://api.moysklad.ru/api/remap/1.2/entity/customerorder/metadata/attributes/f1917566-1c0d-11ee-0a80-13cb002a779d",
                            "type": "attributemetadata",
                            "mediaType": "application/json"
                        },
                        value: userEmail
                    }
                ]
            });
            // requestCounter++;
            // await DoNeedTimeout();
            res.json(result.data);
        } catch (error) {
            // console.log("ERROR")
            next(error);
        }
    }

    async getAllOrdersInWork(req, res, next) {
        console.log('getAllOrdersInWork index')
        try {
            console.log('getAllOrdersInWork');
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


    async getOrdersByUser(req, res, next) {
        console.log('getOrdersByUser');
        const userEmail = req.user.email;
        const flagNeedNewOrder = req.body.flag;
        // console.log('params', flagNeedNewOrder);
        console.log('GET ORDERS BY USER', userEmail);

        if (userEmail === "admin") {
            return res.json([]);
        }

        let result;
        try {
            const allOrdersInWorkByPosition = await _getOrdersInWorkByPosition(req);
            const userOrders = allOrdersInWorkByPosition.filter(item => item.employee === userEmail);
            console.log(userOrders);
            res.json(JSON.stringify(userOrders));

        } catch (error) {
            next(error);
        }
    }

    async removeOrderFromWork(req, res, next) {
        try {
            const orderId = req.params['id'];
            const currentUsersOrders = await redisClient.hGetAll(ORDERS_IN_WORK);
            console.log('currentUsersOrders', currentUsersOrders);

            let result;
            for (let key in currentUsersOrders) {
                const orders = JSON.parse(currentUsersOrders[key]);
                const needToRemove = orders.find(item => item.id === orderId);
                // console.log('orders', orders);
                if (needToRemove) {
                    console.log(`order ${orderId} was removed`)
                    const updatedOrders = orders.filter(item => item.id !== orderId);
                    currentUsersOrders[key] = JSON.stringify(updatedOrders);
                    // console.log(currentUsersOrders);
                    result = await redisClient.hSet(ORDERS_IN_WORK, key, currentUsersOrders[key]);
                }
            }

            console.log(result);

            res.json(result);
        } catch (error) {
            next(error);
        }
    }

    async getAllEmployees(req, res, next) {
        try {
            const allUsersFromDB = await UserService.getAllUsers();
            return res.json(allUsersFromDB);
        } catch (error) {
            next(error);
        }
    }

    async changeOrderResponsibleEmployee(req, res, next) {
        try {

        } catch (error) {
            next(error);
        }
    }

    async addToWaitingList(req, res, next) {
        console.log('addToWaitingList index');
        try {
            const orderId = req.body.orderId;
            const reason = req.body.reason;
            const type = STATE_BY_USER_POSITION.get(req.user.position);

            const ordersInWork = await redisClient.hGet(ORDERS_IN_WORK, type).then(data => JSON.parse(data));
            const updatedOrdersInWork = JSON.stringify(ordersInWork.map(item => {
                if (item.id === orderId) {
                    item.current = false;
                    item.waitingReason = reason;
                }
                return item;
            }));

            await redisClient.hSet(ORDERS_IN_WORK, type, updatedOrdersInWork);

            const afterAdd = await _getOrdersInWorkByPosition(req);
            console.log('after adding to waiting list', afterAdd);
            res.json(updatedOrdersInWork);
        } catch (error) {
            next(error);
        }
    }
}

module.exports = new OrderController();
