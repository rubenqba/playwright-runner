import { registerAs } from '@nestjs/config';
import { MongooseModuleFactoryOptions } from '@nestjs/mongoose';

export default registerAs(
  'db.mongodb',
  (): MongooseModuleFactoryOptions => ({
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017',
    auth:
      process.env.MONGODB_USERNAME && process.env.MONGODB_PASSWORD
        ? {
            username: process.env.MONGODB_USERNAME,
            password: process.env.MONGODB_PASSWORD,
          }
        : undefined,
  }),
);
