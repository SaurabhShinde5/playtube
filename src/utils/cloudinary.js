import { v2 as cloudinary } from "cloudinary";
import fs from "fs/promises";

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

export const uploadOnCloudinary = async (localFilePath) => {
    if (!localFilePath) return null;

    try {
        const result = await cloudinary.uploader.upload(localFilePath, {
            use_filename: true,
            unique_filename: false,
            overwrite: true,
            resource_type: "auto",
        });

        console.log("result", result);

        await fs.unlink(localFilePath).catch(() => {});

        return result;
    } catch (error) {
        console.error("Cloudinary upload failed:", error);

        await fs.unlink(localFilePath).catch(() => {});

        return null;
    }
};