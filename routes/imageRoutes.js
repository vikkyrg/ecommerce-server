import express from 'express';
import mongoose from 'mongoose';

const router = express.Router();

let gridfsBucket = null;

const getBucket = () => {
  if (!gridfsBucket && mongoose.connection.readyState === 1) {
    gridfsBucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
      bucketName: 'images'
    });
  }
  return gridfsBucket;
};

// Stream image by file ID or filename
router.get('/:idOrFilename', async (req, res) => {
  try {
    const bucket = getBucket();
    if (!bucket) {
      return res.status(503).json({ message: 'Database image storage not available' });
    }

    const { idOrFilename } = req.params;
    let fileDoc = null;

    // Check if valid ObjectId
    if (mongoose.Types.ObjectId.isValid(idOrFilename)) {
      const id = new mongoose.Types.ObjectId(idOrFilename);
      const files = await mongoose.connection.db.collection('images.files').find({ _id: id }).toArray();
      if (files && files.length > 0) {
        fileDoc = files[0];
      }
    }

    // If not found by ObjectId, try finding by filename
    if (!fileDoc) {
      const files = await mongoose.connection.db.collection('images.files').find({ filename: idOrFilename }).toArray();
      if (files && files.length > 0) {
        fileDoc = files[0];
      }
    }

    if (!fileDoc) {
      return res.status(404).json({ message: 'Image not found' });
    }

    const contentType = fileDoc.contentType || (fileDoc.filename.endsWith('.webp') ? 'image/webp' : 'image/jpeg');
    res.set('Content-Type', contentType);
    res.set('Cache-Control', 'public, max-age=86400'); // Cache 24 hours

    const downloadStream = bucket.openDownloadStream(fileDoc._id);
    downloadStream.on('error', (err) => {
      console.error('[GridFS stream error]:', err.message);
      if (!res.headersSent) {
        res.status(500).json({ message: 'Error streaming image' });
      }
    });

    downloadStream.pipe(res);
  } catch (error) {
    console.error('[Image route error]:', error.message);
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
