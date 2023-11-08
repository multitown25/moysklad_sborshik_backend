const { Schema, model } = require('mongoose');

const OrderSchema = new Schema({
    // user: {
    //     type: Schema.Types.ObjectId, 
    //     ref: 'User'
    // },
    userEmail: {
        type: String
    },
    orderId: {
        type: String
    },
    order: {
        type: String
    }

});

module.exports = model('Order', OrderSchema);