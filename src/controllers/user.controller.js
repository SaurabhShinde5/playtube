import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { User } from "../models/user.model.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";

const registerUser = asyncHandler(async (req, res) => {
    const { userName, email, fullName, password } = req.body;

    if([userName, email, fullName, password].some(field => field === undefined)) {
        throw new ApiError(400, "All fields are required");
    }

    const existingUser = await User.findOne({ $or: [{ userName }, { email }] });
    if (existingUser) {
        throw new ApiError(409, "User already exists");
    }


    const avatarLocalPath = req.files?.avatar[0]?.path;

    if(!avatarLocalPath) {
        throw new ApiError(400, "Avatar is required");
    }

    const coverImageLocalPath = req.files?.coverImage[0]?.path;

    const avatar = await uploadOnCloudinary(avatarLocalPath);
    const coverImage = await uploadOnCloudinary(coverImageLocalPath);
    if(!avatar) {
        throw new ApiError(400, "Failed to upload avatar");
    }

    const user = await User.create({ userName, email, fullName, password, avatar: avatar.secure_url, coverImage: coverImage?.secure_url });

    const createdUser = await User.findById(user._id).select("-password -refreshToken");

    console.log("createdUser", createdUser);
    res.status(201).json(new ApiResponse(201, createdUser, "User registered successfully"));


});

export { registerUser };