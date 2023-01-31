const asyncHandler = require('express-async-handler');
const Product = require('../models/productModel');
const cloudinary = require('../utils/cloudinary');
const { fileSizeFormatter } = require('../utils/fileUpload');

const createProduct = asyncHandler(async (req, res) => {
  const { name, sku, category, quantity, price, description } = req.body;

  // Validation
  if (!name || !category || !quantity || !sku || !price || !description) {
    res.status(400);
    throw new Error('Please fill in all fields');
  }

  // Handle Image upload
  let fileData = {};
  if (req.file) {
    // Save Image to cloudinay
    let uploadedFile;
    try {
      uploadedFile = await cloudinary.uploader.upload(req.file.path, {
        folder: 'MERN-INVENTORY',
        resource_type: 'image',
      });
    } catch (error) {
      res.status(500);
      throw new Error('Image could not be uploaded');
    }

    fileData = {
      fileName: req.file.originalname,
      filePath: uploadedFile.secure_url,
      fileType: req.file.mimetype,
      fileSize: fileSizeFormatter(req.file.size, 2),
    };
  }

  // Create Product

  const product = await Product.create({
    user: req.user.id,
    name,
    category,
    sku,
    price,
    description,
    quantity,
    image: fileData,
  });

  res.status(201).json(product);
});

// Get All Products
const getProducts = asyncHandler(async (req, res) => {
  const products = await Product.find({ user: req.user.id }).sort('-createdAt');

  res.status(200).json({ productsCount: products.length, products });
});

// Get Single Product
const getProduct = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);

  // If Product doesn't exist
  if (!product) {
    res.status(404);
    throw new Error('Product not found');
  }

  // Match product to its User

  if (product.user.toString() !== req.user.id) {
    res.status(401);
    throw new Error('User not authorized');
  }

  res.status(200).json(product);
});

// Delete Product

const deleteProduct = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);

  // If Product doesn't exist
  if (!product) {
    res.status(404);
    throw new Error('Product not found');
  }

  // Match product to its User
  if (product.user.toString() !== req.user.id) {
    res.status(401);
    throw new Error('User not authorized');
  }

  // await cloudinary.uploader.destroy(product.image.public_id, {
  //   folder: 'MERN-INVENTORY',
  // });

  await product.remove();
  res
    .status(200)
    .json({ message: 'Product deleted successfully', success: true });
});

// Update Product
const updateProduct = asyncHandler(async (req, res) => {
  const { name, category, quantity, price, description } = req.body;

  const product = await Product.findById(req.params.id);

  // if product does not exist
  if (!product) {
    res.status(404);
    throw new Error('Product not found');
  }

  // Match product to its user
  if (product.user.toString() !== req.user.id) {
    res.status(401);
    throw new Error('User not authorized');
  }

  // Handle Image upload
  let fileData = {};
  if (req.file) {
    // Save Image to cloudinay
    let uploadedFile;
    try {
      uploadedFile = await cloudinary.uploader.upload(req.file.path, {
        folder: 'MERN-INVENTORY',
        resource_type: 'image',
      });
    } catch (error) {
      res.status(500);
      throw new Error('Image could not be uploaded');
    }

    fileData = {
      fileName: req.file.originalname,
      filePath: uploadedFile.secure_url,
      fileType: req.file.mimetype,
      fileSize: fileSizeFormatter(req.file.size, 2),
    };
  }

  // Update Product

  const updatedProduct = await Product.findByIdAndUpdate(
    { _id: req.params.id },
    {
      name,
      category,
      price,
      description,
      quantity,
      image: Object.keys(fileData).length === 0 ? product?.image : fileData,
    },
    {
      new: true,
      runValidators: true,
    }
  );

  res.status(200).json({
    success: true,
    updatedProduct,
  });
});

module.exports = {
  createProduct,
  getProducts,
  getProduct,
  deleteProduct,
  updateProduct,
};
