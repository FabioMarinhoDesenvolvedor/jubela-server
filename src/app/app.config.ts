import { registerAs } from '@nestjs/config';

export default registerAs('app', () => {
  const database = {
    type: process.env.DATABASE_TYPE as 'postgres',
    host: process.env.DATABASE_HOST,
    port: +process.env.DATABASE_PORT,
    username: process.env.DATABASE_USERNAME,
    database: process.env.DATABASE_NAME,
    password: process.env.DATABASE_PASSWORD,
    autoLoadEntities: process.env.DATABASE_AUTOLOADENTITIES === 'true',
    synchronize: process.env.DATABASE_SYNCHRONIZE === 'true',
  };
  return database;
});
