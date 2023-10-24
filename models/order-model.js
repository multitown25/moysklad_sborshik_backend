const { Schema, model } = require('mongoose');

const OrderSchema = new Schema({
    user: {
        type: Schema.Types.ObjectId, 
        ref: 'User'
    },
    orderId: {
        type: String
    }
});

module.exports = model('Order', OrderSchema);