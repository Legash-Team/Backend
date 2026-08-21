const multer = require('multer');

// Configure in-memory storage to prevent local disk writes
const storage = multer.memoryStorage();

// Accept common image types, video types, and PDF documents
const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'video/mp4',
    'video/mpeg',
    'video/quicktime',
    'application/pdf',
  ];

  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    const error = new Error('Invalid file type. Supported formats: images (JPEG/PNG/GIF/WebP), videos (MP4/MPEG/MOV), and PDFs.');
    error.statusCode = 400;
    cb(error, false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB maximum file size
  },
});

module.exports = upload;
