import dotenv from "dotenv";
import "dotenv/config";
dotenv.config();

import express from "express";
import connectDB from "./db/index.js";
import app from "./app.js";

const PORT = process.env.PORT || 5000;

connectDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log("SERVER STARTED ON PORT", PORT);
    });
  })
  .catch((err) => {
    console.log("ERROR CONNECTING TO DB", err);
  });
