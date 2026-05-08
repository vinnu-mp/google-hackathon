import mongoose from "mongoose";
import { DB_NAME } from "../constants.js";

export const connectDB = async () => {
  try {
    const connectionInstance = await mongoose.connect(
      `${process.env.MONGO_URI}/${DB_NAME}`,
    );
    console.log(
      `DB CONNECTED !! DB HOST: ${connectionInstance.connection.host}`,
    );
  } catch (error) {
    console.log("ERROR CONNECTING TO DB", error);
    process.exit(1);
  }
};

export default connectDB;
