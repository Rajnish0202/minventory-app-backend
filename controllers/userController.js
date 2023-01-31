const asyncHandler = require('express-async-handler');
const User = require('../models/userModel');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const Token = require('../models/tokenModel');
const crypto = require('crypto');
const sendEmail = require('../utils/sendEmail');

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE,
  });
};

// Register User

const registerUser = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;

  // Validation
  if (!name || !email || !password) {
    res.status(400);
    throw new Error('Please fill in all required fields');
  }

  if (password.length < 6) {
    res.status(400);
    throw new Error('Password must be up to 6 characters');
  }

  // Check if use email already exixts
  const userExists = await User.findOne({ email });

  if (userExists) {
    res.status(400);
    throw new Error('Email has already been registered');
  }

  // Create new User

  const user = await User.create({ name, email, password });

  // Generate Token
  const token = generateToken(user._id);

  // Send Http-only cookie
  res.cookie('token', token, {
    httpOnly: true,
    expires: new Date(Date.now() + 1000 * 24 * 60 * 60),
  });

  if (user) {
    const { name, email, _id, photo, phone, bio } = user;
    res.status(201).json({
      _id,
      name,
      email,
      phone,
      photo,
      bio,
      token,
    });
  } else {
    res.status(400);
    throw new Error('Invalid user data');
  }
});

// Login User
const loginUser = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  // Validate Request
  if (!email || !password) {
    res.status(400);
    throw new Error('Please add email and password');
  }

  // Check if user exits
  const user = await User.findOne({ email });

  if (!user) {
    res.status(400);
    throw new Error('User not found, please signup ');
  }

  // User Exists, check if password is correct
  const passwordIsCorrect = await bcrypt.compare(password, user.password);

  // Generate Token
  const token = generateToken(user._id);

  // Send Http-only cookie
  if (passwordIsCorrect) {
    res.cookie('token', token, {
      httpOnly: true,
      expires: new Date(Date.now() + 1000 * 24 * 60 * 60 * 30),
    });
  }

  if (user && passwordIsCorrect) {
    const { _id, name, email, photo, phone, bio } = user;
    res.status(200).json({
      _id,
      name,
      email,
      photo,
      phone,
      bio,
      token,
    });
  } else {
    res.status(400);
    throw new Error('Invalid email or password');
  }
});

// Logout User

const logoutUser = asyncHandler(async (req, res) => {
  res.cookie('token', '', {
    httpOnly: true,
    expires: new Date(Date.now()),
  });
  return res.status(200).json({
    message: 'Successfully Logged Out',
  });
});

// Get User Details
const getUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);

  if (user) {
    const { name, email, _id, photo, phone, bio } = user;
    res.status(200).json({
      name,
      email,
      _id,
      photo,
      phone,
      bio,
    });
  } else {
    res.status(400);
    throw new Error('User Not Found');
  }
});

// Get Login Status
const loginStatus = asyncHandler(async (req, res) => {
  const token = req.cookies.token;

  if (!token) {
    return res.json(false);
  }

  // Verify Token
  const verified = jwt.verify(token, process.env.JWT_SECRET);
  if (verified) {
    const user = await User.findById(req.user._id).select('-password');

    res.status(200).json({
      user,
    });
  }

  if (!verified) {
    res.status(404);
    throw new Error('User Not Found');
  }
});

// Update User Profile
const updateUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);

  if (user) {
    const { name, bio, phone, photo, email } = user;
    user.email = email;
    user.name = req.body.name || name;
    user.bio = req.body.bio || bio;
    user.phone = req.body.phone || phone;
    user.photo = req.body.photo || photo;

    const updatedUser = await user.save();
    res.status(200).json({
      _id: updatedUser._id,
      name: updatedUser.name,
      email: updatedUser.email,
      photo: updatedUser.photo,
      phone: updatedUser.phone,
      bio: updatedUser.bio,
      success: true,
    });
  } else {
    res.status(404);
    throw new Error('User Not Found');
  }
});

// Change Password

const changePassword = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);

  const { oldPassword, password } = req.body;

  if (!user) {
    res.status(400);
    throw new Error('User Not Found');
  }

  // Validate
  if (!oldPassword || !password) {
    res.status(400);
    throw new Error('Please add old and new password');
  }

  // Check if old password matches password in db
  const passwordIsCorrect = await bcrypt.compare(oldPassword, user.password);

  // Save new Passeord
  if (passwordIsCorrect && user) {
    user.password = password;
    await user.save();
    res.status(200).send('Password changed successful');
  } else {
    res.status(400);
    throw new Error('Old password is incorrect');
  }
});

// Forgot Password

const forgotPassword = asyncHandler(async (req, res) => {
  // res.send('Password Forgot');

  const { email } = req.body;
  const user = await User.findOne({ email });

  if (!user) {
    res.status(404);
    throw new Error('User does not exist');
  }

  // Delete token if it exists in DB
  let token = await Token.findOne({ userId: user._id });
  if (token) {
    await Token.deleteOne();
  }

  // Create Reset Token
  let resetToken = crypto.randomBytes(32).toString('hex') + user._id;

  // Hashed Token before saving to DB
  const hashedToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');

  // Save token to DB
  await new Token({
    userId: user._id,
    token: hashedToken,
    createdAt: Date.now(),
    expiresAt: Date.now() + 30 * 60 * 1000,
  }).save();

  // Construct Reset Url

  const resetUrl = `${process.env.FRONTEND_URL}/resetpassword/${resetToken}`;

  // Reset Email
  const message = `
  <h2>Hello ${user.name}</h2>
  <p>You requested for a password reset.</p>
  <p>Please use the url below to reset your password.</p>
  <p>This reset link is valid for only 30 minutes.</p>
  <a href=${resetUrl} clicktracking=off>${resetUrl}</a>


  <p>Regards...</p>
  <p>MERN-INVENTORY</p>
  `;

  const subject = 'Password Reset Request';
  const send_to = user.email;
  const sent_from = process.env.EMAIL_USER;

  try {
    await sendEmail(subject, message, send_to, sent_from);
    res.status(200).json({
      success: true,
      message: 'Reset Email Sent',
    });
  } catch (error) {
    res.status(500);
    throw new Error('Email not sent, Please try again');
  }
});

// Reset Password
const resetPassword = asyncHandler(async (req, res) => {
  const { password } = req.body;
  const { resetToken } = req.params;

  // Hashed Token, them compare to Token in DB
  const hashedToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');

  // Find token in DB

  const userToken = await Token.findOne({
    token: hashedToken,
    expiresAt: { $gt: Date.now() },
  });

  if (!userToken) {
    res.status(404);
    throw new Error('Invalid or Expired Token');
  }

  // Find User

  const user = await User.findOne({ _id: userToken.userId });

  user.password = password;
  await user.save();
  res.status(200).json({
    message: 'Password Reset Successful, Please Login',
  });
});

module.exports = {
  registerUser,
  loginUser,
  logoutUser,
  getUser,
  loginStatus,
  updateUser,
  changePassword,
  forgotPassword,
  resetPassword,
};
