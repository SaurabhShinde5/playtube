import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { User } from "../models/user.model.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import fs from "fs/promises";
import jwt from "jsonwebtoken";

const generateAccessAndRefreshTokens = async (userId) => {
    try {

        const user = await User.findById(userId);

        const accessToken = await user.generateAccessToken();
        const refreshToken = await user.generateRefreshToken();
        user.refreshToken = refreshToken;
        await user.save({validateBeforeSave: false});

        return { accessToken, refreshToken };
        
    } catch (error) {
        throw new ApiError(500, "Failed to generate access and refresh tokens");
    }
    
};

const registerUser = asyncHandler(async (req, res) => {
    const { userName, email, fullName, password } = req.body;

    if (
        [userName, email, fullName, password].some(
            field => !field || field.trim() === ""
        )
    ) {
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

    let coverImageLocalPath = null;
    if(req.files?.coverImage) {
        coverImageLocalPath = req.files?.coverImage?.[0]?.path;
    }

    const avatar = await uploadOnCloudinary(avatarLocalPath);
    const coverImage = coverImageLocalPath ? await uploadOnCloudinary(coverImageLocalPath) : null;
    if(!avatar) {
        throw new ApiError(400, "Failed to upload avatar");
    }

    const user = await User.create({ userName: userName.toLowerCase().trim(), email: email.toLowerCase().trim(), fullName: fullName.trim(), password, avatar: avatar.secure_url, coverImage: coverImage?.secure_url });

    const createdUser = await User.findById(user._id).select("-password -refreshToken");

    if (!createdUser) {
        throw new ApiError(500, "Something went wrong while registering user");
    }

    res.status(201).json(new ApiResponse(201, createdUser, "User registered successfully"));


});

const loginUser = asyncHandler(async (req, res) => {

    //get req body
    const { email, password, userName } = req.body;

    //validate req body
    if((!email && !userName) || !password) {
        throw new ApiError(400, "Email or username and password are required");
    }

    //find user by email
    const user = await User.findOne({
        $or: [
            { email: email?.trim().toLowerCase() },
            { userName: userName?.trim().toLowerCase() },
        ],
    });

    if(!user) {
        throw new ApiError(404, "User not found");
    }

    //compare password
    const isPasswordCorrect = await user.isPasswordCorrect(password);
    if(!isPasswordCorrect) {
        throw new ApiError(401, "Invalid user credentials");
    }

    //generate tokens
    const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(user._id);

    //set cookies options
    const options = {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        maxAge: 1000 * 60 * 60 * 24 * 30, //30 days
    };

    //send response with cookies
    const loggedInUser = await User.findById(user._id)
    .select("-password -refreshToken");
    return res
    .status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(
        new ApiResponse(
            200, 
            {
                user: loggedInUser, accessToken, refreshToken
            },
            "User logged In Successfully"
        )
    )
});

const logoutUser = asyncHandler(async (req, res) => {
    try {
        await User.findByIdAndUpdate(req.user._id, { refreshToken: null }, { returnDocument: "after" });

        const options = {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            maxAge: 0,
        };

        //clear cookies
        return res
        .status(200)
        .clearCookie("accessToken", options)
        .clearCookie("refreshToken", options)
        .json(new ApiResponse(200, null, "User logged out successfully"));
    } catch (error) {
        throw new ApiError(500, "Failed to logout user", [error.message]);
    }
});

const refreshAccessToken = asyncHandler(async (req, res) => {
    try {
        const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken;
        if(!incomingRefreshToken) {
            throw new ApiError(401, "Unauthorized Access as Invalid Refresh Token");
        }
        const decodedToken = jwt.verify(incomingRefreshToken, process.env.REFRESH_TOKEN_SECRET);
        if(!decodedToken) {
            throw new ApiError(401, "Unauthorized Access as refresh token does not match");
        }

        const user = await User.findById(decodedToken?._id).select("-password -refreshToken");
        if(!user) {
            throw new ApiError(401, "Unauthorized Access as Invalid User");
        }

        if(user.refreshToken !== incomingRefreshToken) {
            throw new ApiError(401, "Refresh token is expired or used");
        }

        const options = {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            maxAge: 1000 * 60 * 60 * 24 * 30, //30 days
        };

        const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(user?._id);
        return res
        .status(200)
        .cookie("accessToken", accessToken, options)
        .cookie("refreshToken", refreshToken, options)
        .json(new ApiResponse(200, { accessToken, refreshToken }, "Access token refreshed successfully"));
    } catch (error) {
        throw new ApiError(500, error?.message || "Failed to refresh access token");
    }
});

const changeCurrentPassword = asyncHandler(async (req, res) => {
    try {
        const { oldPassword, newPassword } = req.body;


        if(!oldPassword || !newPassword) {
            throw new ApiError(400, "Old password and new password are required");
        }

        const user = await User.findById(req.user?._id).select("+password");
        if(!user) {
            throw new ApiError(401, "Unauthorized Access as Invalid User");
        }

        const isPasswordCorrect = await user.isPasswordCorrect(oldPassword);
        if(!isPasswordCorrect) {
            throw new ApiError(401, "Invalid old password");
        }

        user.password = newPassword;
        await user.save({ validateBeforeSave: false });
        return res.status(200).json(new ApiResponse(200, {}, "Password changed successfully"));
    } catch (error) {
        throw new ApiError(500, error?.message || "Failed to change password");
    }
});

const getCurrentUser = asyncHandler(async (req, res) => {
    return res.status(200).json(
        new ApiResponse(
            200,
            req.user,
            "User fetched successfully"
        )
    );
});

const updateUserAvatar = asyncHandler(async (req, res) => {
    try {

        const avatarLocalPath = req.file?.path;

        if(!avatarLocalPath) {
            throw new ApiError(400, "Avatar file is required");
        }

        const avatar = await uploadOnCloudinary(avatarLocalPath);
        if(!avatar.secure_url) {
            throw new ApiError(400, "Failed to upload avatar");
        }

        await fs.unlink(avatarLocalPath).catch(() => {});


        const user = await User.findByIdAndUpdate(req.user._id,
            {
                $set: {
                    avatar: avatar.secure_url,
                },
            },
            { returnDocument: "after" }
        ).select("-password -refreshToken");


        return res.status(200).json(new ApiResponse(200, user, "Avatar updated successfully"));
    } catch (error) {
        throw new ApiError(500, error?.message || "Failed to update avatar");
    }
});

const updateUserCoverImage = asyncHandler(async (req, res) => {
    try {

        const coverImageLocalPath = req.file?.path;

        if(!coverImageLocalPath) {
            throw new ApiError(400, "Cover image file is required");
        }

        const coverImage = await uploadOnCloudinary(coverImageLocalPath);
        if(!coverImage.secure_url) {
            throw new ApiError(400, "Failed to upload cover image");
        }

        await fs.unlink(coverImageLocalPath).catch(() => {});


        const user = await User.findByIdAndUpdate(req.user._id,
            {
                $set: {
                    coverImage: coverImage.secure_url,
                },
            },
            { returnDocument: "after" }
        ).select("-password -refreshToken");


        return res.status(200).json(new ApiResponse(200, user, "Cover image updated successfully"));
    } catch (error) {
        throw new ApiError(500, error?.message || "Failed to update cover image");
    }
});

export { registerUser, loginUser, logoutUser, refreshAccessToken, changeCurrentPassword, getCurrentUser, updateUserAvatar, updateUserCoverImage };