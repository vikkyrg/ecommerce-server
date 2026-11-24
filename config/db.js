import mongoose from 'mongoose';

const connectDB = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/ns_stone_chemicals';
    const conn = await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 10000,  // 10 s — Atlas needs more time than 2 s
      socketTimeoutMS: 45000,
      maxPoolSize: 10,
      retryWrites: true,
    });
    console.log(`[DB] MongoDB Connected: ${conn.connection.host} (db: ${conn.connection.name})`);

    // Log state changes so crashes/reconnects are visible in logs
    mongoose.connection.on('disconnected', () =>
      console.warn('[DB] MongoDB disconnected. Waiting for reconnect...')
    );
    mongoose.connection.on('reconnected', () =>
      console.log('[DB] MongoDB reconnected.')
    );
    mongoose.connection.on('error', err =>
      console.error('[DB] MongoDB connection error:', err.message)
    );

    return true;
  } catch (error) {
    console.error(`[DB] MongoDB connection failed: ${error.message}`);
    console.warn('[DB] Running in local JSON fallback mode.');
    return false;
  }
};

export default connectDB;
