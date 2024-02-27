module.exports = class UserDto {
    email;
    id;
    position;

    constructor(model) {
        this.email = model.email;
        this.id = model._id;
        this.position = model.position;
    }
}