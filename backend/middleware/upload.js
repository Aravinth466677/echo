const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Create storage configuration based on environment
const createStorage = () => {
  const isProduction = process.env.NODE_ENV === 'production';
  const isVercel = process.env.VERCEL === '1';
  
  // For serverless platforms (Vercel, Netlify), use memory storage
  if (isProduction && (isVercel || !fs.existsSync('./uploads'))) {
    console.log('📁 Using memory storage for file uploads (serverless environment)');
    return multer.memoryStorage();
  }
  
  // For regular deployments with file system access
  console.log('📁 Using disk storage for file uploads');
  
  // Ensure uploads directory exists
  const uploadsDir = path.join(__dirname, '..', 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    try {
      fs.mkdirSync(uploadsDir, { recursive: true });
      console.log('✅ Created uploads directory');
    } catch (error) {
      console.error('❌ Cannot create uploads directory:', error.message);
      // Fall back to memory storage
      return multer.memoryStorage();
    }
  }
  
  return multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
      // Generate unique filename
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const extension = path.extname(file.originalname);
      cb(null, `${uniqueSuffix}${extension}`);
    }
  });
};

// File filter for security
const fileFilter = (req, file, cb) => {
  // Allowed file extensions
  const allowedExtensions = /\.(jpg|jpeg|png|webp|heic|heif)$/i;
  
  // Check file extension
  const extname = allowedExtensions.test(path.extname(file.originalname).toLowerCase());
  
  // Check MIME type
  const mimetype = file.mimetype && file.mimetype.startsWith('image/');
  
  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error('Only image files are allowed (jpg, jpeg, png, webp, heic, heif)'));
  }
};

// Create multer configuration
const createUploadMiddleware = () => {
  const storage = createStorage();
  
  return multer({
    storage: storage,
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB limit
      files: 1 // Single file upload
    },
    fileFilter: fileFilter
  });
};

// Error handler for multer errors
const handleUploadError = (error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    console.error('❌ Multer error:', error.message);
    
    switch (error.code) {
      case 'LIMIT_FILE_SIZE':
        return res.status(413).json({ 
          error: 'File too large. Maximum size is 10MB.' 
        });
      case 'LIMIT_FILE_COUNT':
        return res.status(400).json({ 
          error: 'Too many files. Only one file allowed.' 
        });
      case 'LIMIT_UNEXPECTED_FILE':
        return res.status(400).json({ 
          error: 'Unexpected file field. Use "evidence" as field name.' 
        });
      default:
        return res.status(400).json({ 
          error: `Upload error: ${error.message}` 
        });
    }
  } else if (error) {
    console.error('❌ Upload error:', error.message);
    return res.status(400).json({ 
      error: error.message || 'File upload failed' 
    });
  }
  
  next();
};

// Helper function to process uploaded file
const processUploadedFile = (file) => {
  if (!file) {
    return null;
  }
  
  const isMemoryStorage = !!file.buffer;
  
  return {
    filename: file.filename || `memory_${Date.now()}${path.extname(file.originalname)}`,
    originalname: file.originalname,
    mimetype: file.mimetype,
    size: file.size,
    path: file.path || null, // null for memory storage
    buffer: file.buffer || null, // null for disk storage
    isMemoryStorage: isMemoryStorage
  };
};

// Export upload middleware and utilities
module.exports = {
  upload: createUploadMiddleware(),
  handleUploadError,
  processUploadedFile,
  
  // Single file upload middleware
  single: (fieldName = 'evidence') => {
    const upload = createUploadMiddleware();
    return upload.single(fieldName);
  }
};