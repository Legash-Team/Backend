const { uploadToCloudinary } = require('../config/cloudinary');

exports.uploadMedia = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file was uploaded.',
      });
    }

    const { mimetype, buffer } = req.file;

    // Determine Cloudinary resource type
    let resource_type = 'image';
    if (mimetype.startsWith('video/')) {
      resource_type = 'video';
    } else if (mimetype === 'application/pdf') {
      resource_type = 'raw';
    }

    const result = await uploadToCloudinary(buffer, {
      resource_type,
    });

    return res.status(200).json({
      success: true,
      message: 'File uploaded successfully.',
      url: result.secure_url,
      publicId: result.public_id,
      resourceType: resource_type,
    });
  } catch (error) {
    next(error);
  }
};
