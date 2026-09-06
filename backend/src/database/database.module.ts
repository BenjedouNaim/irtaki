import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { resolveDatabaseName } from './database-name';

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
 *
 * `forRootAsync`, not `forRoot`: a plain `forRoot({...})` object literal is
 * evaluated when this file is *required*, which — because `app.module.ts`
 * imports this module at the top of the file — happens strictly before the
 * `ConfigModule.forRoot()` call in that same module's decorator argument runs
 * its dotenv load. The connection was therefore frozen from the raw
 * `process.env` before `.env` had been read, so the API silently ignored
 * `backend/.env` entirely: with `DB_NAME=irtaki_smoke` in `.env` and nothing
 * exported, the server connected to `irtaki` while `migration:run` and `seed`
 * — which dotenv-load for themselves — connected to `irtaki_smoke`. Injecting
 * `ConfigService` defers the connection until after configuration is loaded and
 * validated, so one validated value drives every consumer (ISS #145).
 */
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres' as const,
        host: config.get<string>('DB_HOST') ?? '127.0.0.1',
        port: Number(config.get('DB_PORT') ?? 5432),
        // Validated by `EnvironmentVariables` at boot, so this is only ever a
        // supplied value. `resolveDatabaseName` stays the single read site and
        // still refuses a blank one, for the CLI paths that build a DataSource
        // without ConfigModule (see data-source.ts).
        database: resolveDatabaseName({
          ...process.env,
          DB_NAME: config.get<string>('DB_NAME'),
        }),
        username: config.get<string>('DB_USER') ?? 'irtaki',
        password: config.get<string>('DB_PASS') ?? 'irtaki',
        entities: [],
        migrations: [__dirname + '/../../migrations/*.{ts,js}'],
        synchronize: false,
        autoLoadEntities: true,
        logging: false,
      }),
    }),
  ],
})
export class DatabaseModule {}
