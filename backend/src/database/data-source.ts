import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load env variables
dotenv.config({ path: path.join(__dirname, '../../.env') });

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: parseInt(process.env.DB_PORT ?? '5432', 10),
  username: process.env.DB_USER ?? 'irtaki',
  password: process.env.DB_PASS ?? 'irtaki',
  database: process.env.DB_NAME ?? 'irtaki',
  synchronize: false,
  logging: process.env.NODE_ENV === 'development',
  entities: [path.join(__dirname, '../**/*.entity.{ts,js}')],
  migrations: [path.join(__dirname, '../../migrations/*.{ts,js}')],
});
