import mongoose, { ConnectOptions } from 'mongoose';

const mongooseProps: ConnectOptions = {};
mongoose.set('strictQuery', false);

const mongooseConnect = async (callback: () => void | Promise<void> = () => {}) => {
  try {
    await mongoose.connect(
      `mongodb://127.0.0.1/${process.env.DB_NAME}`,
      mongooseProps,
    );

    console.log('-- Mongoose connect -- ' + 'DB: ' + process.env.DB_NAME);
    await callback();
  } catch (e) {
    console.error(e.message);
    throw e;
  }
};

export default mongooseConnect;
