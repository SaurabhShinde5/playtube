import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { User } from "../models/user.model.js";
import jwt from "jsonwebtoken";

const verifyJWT = asyncHandler(async (req, res, next) => {
    try {

        const accessToken =
        req.cookies?.accessToken ||
        (req.headers?.authorization?.startsWith("Bearer ")
            ? req.headers.authorization.replace("Bearer ", "")
            : null);

        if(!accessToken) {
            throw new ApiError(401, "Unauthorized Access as Invalid Access Token");
        }

        const decodedToken = jwt.verify(accessToken, process.env.ACCESS_TOKEN_SECRET);
    
        const user = await User.findById(decodedToken?._id).select("-password -refreshToken")
        if(!user) {
            throw new ApiError(401, "Unauthorized Access as Invalid User");
        }
        req.user = user;
        next();
        
    } catch (error) {
        throw new ApiError(401, error?.message || "Unauthorized Access");
    }
});

export default verifyJWT;