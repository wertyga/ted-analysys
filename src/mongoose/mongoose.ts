import mongoose, { ConnectOptions } from 'mongoose';

const mongooseProps: ConnectOptions = {};
mongoose.set('strictQuery', false);

const mongooseConnect = async (callback = () => {}) => {
  try {
    await mongoose.connect(
      `mongodb://127.0.0.1/${process.env.DB_NAME}`,
      mongooseProps,
    );

    console.log('-- Mongoose connect -- ' + 'DB: ' + process.env.DB_NAME);
    callback();
  } catch (e) {
    console.error(e.message);
  }
};

export default mongooseConnect;
