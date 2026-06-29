import "dotenv/config";
import connectDB from "./db/index.js";
import app from "./app.js";

connectDB().then(() => {

    app.on("error", (error) => {
        console.log("Error starting the server:", error);
        process.exit(1);
    });

  app.listen(process.env.PORT, () => {
    console.log(`Server is running on port ${process.env.PORT}`);
  });
}).catch((error) => console.log("Error connecting to MongoDB:", error));
