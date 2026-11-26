import mongoose from 'mongoose';

const READY_STATES = ['disconnected', 'connected', 'connecting', 'disconnecting'];

export async function connectMongo(uri, logger) {
  mongoose.set('strictQuery', true);
  mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));
  mongoose.connection.on('reconnected', () => logger.info('MongoDB reconnected'));
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  logger.info('MongoDB connected');
}

export function mongoStatus() {
  return READY_STATES[mongoose.connection.readyState] ?? 'unknown';
}

export async function closeMongo() {
  await mongoose.connection.close();
}
