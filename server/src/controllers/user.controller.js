import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/apiError.js";
import { ApiResponse } from "../utils/apiResponse.js";
import User from "../models/user.model.js";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { sendVerificationEmail, sendWelcomeEmail } from "../services/emails.js";

const generateAccessAndRefreshTokens = async (userId) => {
  try {
    const user = await User.findById(userId);
    const accessToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();

    user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: false });

    return { accessToken, refreshToken };
  } catch (error) {
    throw new ApiError(
      500,
      "Something went wrong while generating referesh and access token",
    );
  }
};

const refreshAccessToken = asyncHandler(async (req, res) => {
  const incomingRefreshToken =
    req.cookies.refreshToken || req.body.refreshToken;

  if (!incomingRefreshToken) {
    throw new ApiError(401, "unauthorized request, refresh token not found");
  }

  try {
    const decodedToken = jwt.verify(
      incomingRefreshToken,
      process.env.REFRESH_TOKEN_SECRET,
    );

    const user = await User.findById(decodedToken?.id);

    if (!user) {
      throw new ApiError(401, "Invalid refresh token!!");
    }

    if (incomingRefreshToken !== user?.refreshToken) {
      throw new ApiError(401, "Refresh token is expired or used");
    }

    const options = {
      httpOnly: true,
      secure: true,
    };

    const { accessToken, refreshToken: newRefreshToken } =
      await generateAccessAndRefreshTokens(user._id);

    return res
      .status(200)
      .cookie("accessToken", accessToken, options)
      .cookie("refreshToken", newRefreshToken, options)
      .json(
        new ApiResponse(
          200,
          { accessToken, refreshToken: newRefreshToken },
          "Access token refreshed",
        ),
      );
  } catch (error) {
    throw new ApiError(401, error?.message || "Invalid refresh token");
  }
});

const registerUser = asyncHandler(async (req, res) => {
  const { username, email, fullname, password } = req.body;

  if (
    [username, email, fullname, password].some((field) => field?.trim() === "")
  ) {
    throw new ApiError(400, "All fields are required !");
  }

  const existingUser = await User.findOne({ $or: [{ email }, { username }] });

  if (existingUser) {
    throw new ApiError(400, "User with username or email already exists!");
  }

  const verificationToken = Math.floor(
    100000 + Math.random() * 900000,
  ).toString();

  const user = await User.create({
    username,
    email,
    fullname,
    password,
    verificationToken,
    verificationTokenExpiry: Date.now() + 10 * 60 * 1000,
  });

  const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(
    user._id,
  );

  const createdUser = await User.findById(user._id).select(
    "-password -refreshToken",
  );

  await sendVerificationEmail(email, username, verificationToken);

  const options = {
    httpOnly: true,
    secure: true,
  };

  res
    .status(201)
    .cookie("refreshToken", refreshToken, options)
    .cookie("accessToken", accessToken, options)
    .json(
      new ApiResponse(
        201,
        {
          user: createdUser,
          accessToken,
          refreshToken,
        },
        "User registered successfully",
      ),
    );
});

const verifyEmail = asyncHandler(async (req, res) => {
  const { otp } = req.body;

  if (!otp || otp.trim() === "") {
    throw new ApiError(400, "OTP is required !");
  }

  const user = await User.findOne({
    verificationToken: otp,
    verificationTokenExpiry: { $gt: Date.now() },
  });

  if (!user) {
    throw new ApiError(400, "Invalid or expired OTP !");
  }

  user.isVarified = true;
  user.verificationToken = undefined;
  user.verificationTokenExpiry = undefined;

  await user.save({ validationBeforeSave: false });
  await sendWelcomeEmail(user.email, user.username);

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "Email verified successfully"));
});

const loginUser = asyncHandler(async (req, res) => {
  const { username, email, password } = req.body;

  if (!(username || email) || !password) {
    throw new ApiError(400, "All fields are mandatory !");
  }

  let query = [];
  if (username) query.push({ username });
  if (email) query.push({ email });

  const user = await User.findOne({ $or: query });

  if (!user) {
    throw new ApiError(400, "Invalid credentials !");
  }

  const isPasswordCorrect = await user.isPasswordCorrect(password);

  if (!isPasswordCorrect) {
    throw new ApiError(400, "Invalid password !");
  }

  if (!user.isVarified) {
    throw new ApiError(400, "Please verify your email before logging in !");
  }

  const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(
    user._id,
  );

  const loggedInUser = await User.findById(user._id).select(
    "-password -refreshToken",
  );

  const options = {
    httpOnly: true,
    secure: true,
  };

  res
    .status(200)
    .cookie("refreshToken", refreshToken, options)
    .cookie("accessToken", accessToken, options)
    .json(
      new ApiResponse(
        200,
        { user: loggedInUser, accessToken, refreshToken },
        "User logged in successfully",
      ),
    );
});

const logoutUser = asyncHandler(async (req, res) => {
  await User.findByIdAndUpdate(
    req.user._id,
    { $unset: { refreshToken: 1 } },
    { returnDocument: "after" },
  );

  const options = {
    httpOnly: true,
    secure: true,
  };

  return res
    .status(200)
    .clearCookie("accessToken", options)
    .clearCookie("refreshToken", options)
    .json(new ApiResponse(200, {}, "User logged Out"));
});

const getCurrentUser = asyncHandler(async (req, res) => {
  return res
    .status(200)
    .json(new ApiResponse(200, req.user, "User fetched successfully"));
});

export {
  refreshAccessToken,
  registerUser,
  verifyEmail,
  loginUser,
  logoutUser,
  getCurrentUser,
};
