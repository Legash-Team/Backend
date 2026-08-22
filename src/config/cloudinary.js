const cloudinary = require('cloudinary').v2;

const isCloudinaryConfigured =
  process.env.CLOUDINARY_CLOUD_NAME &&
  !process.env.CLOUDINARY_CLOUD_NAME.includes('example') &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_SECRET;

if (isCloudinaryConfigured) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
} else {
  console.log('[CLOUDINARY CONFIG] Credentials missing or example. Operating in MOCK mode.');
}

const uploadToCloudinary = (fileBuffer, options = {}) => {
  return new Promise((resolve, reject) => {
    if (!isCloudinaryConfigured || process.env.NODE_ENV === 'test') {
      // Mock successful upload return for test environment / missing credentials
      return resolve({
        secure_url: 'https://res.cloudinary.com/demo/image/upload/v1234567890/sample.jpg',
        public_id: 'mock_public_id',
        resource_type: options.resource_type || 'image',
      });
    }

    const stream = cloudinary.uploader.upload_stream(
      {
        folder: 'legash',
        ...options,
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );
    stream.end(fileBuffer);
  });
};

module.exports = {
  cloudinary,
  uploadToCloudinary,
  isCloudinaryConfigured,
};
