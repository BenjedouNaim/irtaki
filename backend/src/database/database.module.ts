import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

/**
 * DatabaseModule — wires the TypeORM connection for the entire application.
 *
 * Rules enforced here (TD-03, ADR-028):
 *  - synchronize: false  — schema is managed exclusively by hand-reviewed migrations
 *  - autoLoadEntities: false — entities are registered per-module via TypeOrmModule.forFeature()
 *  - logging: false      — SQL logging is a per-environment concern; off by default
 *
 * Connection values come from environment variables so no credentials are
 * committed to source control.
 */
@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST ?? '127.0.0.1',
      port: parseInt(process.env.DB_PORT ?? '5432', 10),
      database: process.env.DB_NAME ?? 'irtaki',
      username: process.env.DB_USER ?? 'irtaki',
      password: process.env.DB_PASS ?? 'irtaki',
      entities: [],
      migrations: [__dirname + '/../../migrations/*.{ts,js}'],
      synchronize: false,
      autoLoadEntities: true,
      logging: false,
    }),
  ],
})
export class DatabaseModule {}
