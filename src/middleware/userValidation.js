const Joi = require("joi");
const { createError } = require("../helpers/errors/createError");

const loginValidation = (req, res, next) => {
    try {
        const schema = Joi.object({
            email: Joi.string()
                .email({ minDomainSegments: 2, tlds: { allow: ["com", "net"] } })
                .required(),
            password: Joi.string().min(6).max(15).required(),
        });

        const { error } = schema.validate(req.body);
        if (error) {
            throw createError(400, "JoiError. Missing required field");
        }

        next();
    } catch (error) {
        next(error);
    }
};

const signupValidation = (req, res, next) => {
    try {
        const schema = Joi.object({
            email: Joi.string()
                .email({ minDomainSegments: 2, tlds: { allow: ["com", "net"] } })
                .required(),
            name: Joi.string().required(),
            password: Joi.string().min(6).max(15).required(),
        });

        const { error } = schema.validate(req.body);
        if (error) {
            throw createError(400, "JoiError. Missing required field");
        }

        next();
    } catch (error) {
        next(error);
    }
};

module.exports = {
    loginValidation,
    signupValidation,
};
