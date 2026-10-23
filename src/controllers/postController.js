// Backend/src/controllers/postController.js
const Post = require('../models/Post');

/**
 * Create a new blood center post.
 * Restricted to authenticated Admin users. Super Admin is explicitly rejected with 403.
 */
exports.createPost = async (req, res, next) => {
  try {
    if (req.user?.role === 'superadmin') {
      return res.status(403).json({
        success: false,
        error: 'Super Admin cannot create Blood Center posts.',
      });
    }

    if (req.user?.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Only Blood Center admins can create posts.',
      });
    }

    const { content, mediaUrl, mediaType } = req.body;

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Content is required.',
      });
    }

    if (content.trim().length > 2000) {
      return res.status(400).json({
        success: false,
        error: 'Content cannot exceed 2000 characters.',
      });
    }

    if (mediaType && mediaType !== 'image' && mediaType !== 'video') {
      return res.status(400).json({
        success: false,
        error: 'Invalid mediaType. Allowed types: image, video.',
      });
    }

    const post = await Post.create({
      author: req.user.id,
      content: content.trim(),
      mediaUrl: mediaUrl || null,
      mediaType: mediaType || null,
    });

    return res.status(201).json({
      success: true,
      message: 'Post created successfully.',
      post: {
        id: post._id,
        content: post.content,
        mediaUrl: post.mediaUrl,
        mediaType: post.mediaType,
        createdAt: post.createdAt,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Retrieve posts created by the currently authenticated Admin.
 */
exports.getMyPosts = async (req, res, next) => {
  try {
    const posts = await Post.find({
      author: req.user.id,
      isDeleted: { $ne: true },
    }).sort({ createdAt: -1 });

    const formattedPosts = posts.map((p) => ({
      id: p._id,
      content: p.content,
      mediaUrl: p.mediaUrl,
      mediaType: p.mediaType,
      createdAt: p.createdAt,
    }));

    return res.status(200).json({
      success: true,
      posts: formattedPosts,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Paginated public/donor feed of blood center posts (newest first).
 */
exports.getFeed = async (req, res, next) => {
  try {
    let page = parseInt(req.query.page, 10);
    let limit = parseInt(req.query.limit, 10);

    if (isNaN(page) || page < 1) page = 1;
    if (isNaN(limit) || limit < 1) limit = 20;
    if (limit > 50) limit = 50;

    const skip = (page - 1) * limit;

    const [total, posts] = await Promise.all([
      Post.countDocuments({ isDeleted: { $ne: true } }),
      Post.find({ isDeleted: { $ne: true } })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('author', 'name centerName'),
    ]);

    const feed = posts.map((p) => ({
      id: p._id,
      content: p.content,
      mediaUrl: p.mediaUrl,
      mediaType: p.mediaType,
      authorName: p.author?.centerName || p.author?.name || 'Blood Center',
      createdAt: p.createdAt,
    }));

    return res.status(200).json({
      success: true,
      feed,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (error) {
    next(error);
  }
};
