export class ApiError extends Error {
    constructor(
        statusCode,
        message = "Something went wrong",
        errors = [],
        options = {}
    ) {
        super(message, options);

        this.name = "ApiError";
        this.statusCode = statusCode;
        this.success = false;
        this.data = null;
        this.errors = errors;

        Error.captureStackTrace(this, this.constructor);
    }
}