import mongoose from 'mongoose';
// ...existing code...

let isConnected = false;

export async function connectToDatabase() {
  if (isConnected || mongoose.connection.readyState === 1) return;

  const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || '';
  if (!MONGO_URI) {
    throw new Error('Please define the MONGO_URI environment variable');
  }

  try {
    await mongoose.connect(MONGO_URI);
    isConnected = true;
    console.log('MongoDB connected');
  } catch (error) {
    console.error('Error connecting to MongoDB', error);
    throw error;
  }
}