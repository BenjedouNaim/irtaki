import { DataSource } from 'typeorm';
import { uuidv7 } from 'uuidv7';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environmental variables
dotenv.config({ path: path.join(__dirname, '../.env') });

const dbHost = process.env.DB_HOST ?? 'localhost';
const dbPort = parseInt(process.env.DB_PORT ?? '5432', 10);
const dbUser = process.env.DB_USER ?? 'irtaki';
const dbPass = process.env.DB_PASS ?? 'irtaki';
const dbName = process.env.DB_NAME ?? 'irtaki';

async function seed() {
  // Production guard
  if (process.env.NODE_ENV === 'production') {
    console.error('CRITICAL: Seed script cannot be run in production environment!');
    process.exit(1);
  }

  console.log(`Connecting to database ${dbName} on ${dbHost}:${dbPort}...`);
  const dataSource = new DataSource({
    type: 'postgres',
    host: dbHost,
    port: dbPort,
    username: dbUser,
    password: dbPass,
    database: dbName,
    synchronize: false,
    entities: [], // Using raw queries for seeding to avoid entity import complexities
  });

  await dataSource.initialize();
  console.log('Database connected successfully. Seeding data...');

  try {
    // 1. Seed Notification Categories (DBT-15)
    console.log('Seeding notification categories...');
    const categories = [
      { code: 'N-01', description: 'Daily report not yet submitted', is_mutable: true },
      { code: 'N-02', description: 'Weekly report available', is_mutable: true },
      { code: 'N-03', description: 'Join request accepted', is_mutable: false },
      { code: 'N-04', description: 'Join request rejected', is_mutable: false },
      { code: 'N-05', description: 'New join request received', is_mutable: true },
      { code: 'N-06', description: 'Payment due soon', is_mutable: true },
      { code: 'N-07', description: 'Student at risk', is_mutable: true },
      { code: 'N-08', description: 'Removed from group', is_mutable: false },
    ];

    for (const cat of categories) {
      await dataSource.query(`
        INSERT INTO "notification_categories" ("code", "description", "is_mutable")
        VALUES ($1, $2, $3)
        ON CONFLICT ("code") DO UPDATE 
        SET "description" = EXCLUDED.description, "is_mutable" = EXCLUDED.is_mutable;
      `, [cat.code, cat.description, cat.is_mutable]);
    }

    // 2. Seed Users (DBT-01)
    console.log('Seeding users (Admin, Teachers, Assistants)...');
    // Pre-calculated argon2id hash for password: 'password123'
    const defaultPasswordHash = '$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHQ$RdescudvJCsgt3h5vd4x/g';

    const users = [
      {
        id: uuidv7(),
        email: 'admin@irtaki.tn',
        password_hash: defaultPasswordHash,
        role: 'Admin',
        full_name: 'System Admin',
        gender: 'Male',
        timezone: 'Africa/Tunis',
        must_change_password: true,
      },
      {
        id: uuidv7(),
        email: 'teacher1@irtaki.tn',
        password_hash: defaultPasswordHash,
        role: 'Teacher',
        full_name: 'Teacher One',
        gender: 'Male',
        timezone: 'Africa/Tunis',
        must_change_password: false,
      },
      {
        id: uuidv7(),
        email: 'teacher2@irtaki.tn',
        password_hash: defaultPasswordHash,
        role: 'Teacher',
        full_name: 'Teacher Two',
        gender: 'Female',
        timezone: 'Africa/Tunis',
        must_change_password: false,
      },
      {
        id: uuidv7(),
        email: 'assistant1@irtaki.tn',
        password_hash: defaultPasswordHash,
        role: 'Assistant',
        full_name: 'Assistant One',
        gender: 'Male',
        timezone: 'Africa/Tunis',
        must_change_password: false,
      },
      {
        id: uuidv7(),
        email: 'assistant2@irtaki.tn',
        password_hash: defaultPasswordHash,
        role: 'Assistant',
        full_name: 'Assistant Two',
        gender: 'Female',
        timezone: 'Africa/Tunis',
        must_change_password: false,
      },
    ];

    for (const u of users) {
      await dataSource.query(`
        INSERT INTO "users" ("id", "email", "password_hash", "role", "full_name", "gender", "timezone", "must_change_password")
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT ("email") DO NOTHING;
      `, [u.id, u.email, u.password_hash, u.role, u.full_name, u.gender, u.timezone, u.must_change_password]);
    }

    // 3. Seed Reference Data Version (DBT-13)
    console.log('Seeding reference data version...');
    await dataSource.query(`
      INSERT INTO "reference_data_version" ("id", "dataset_version")
      VALUES (true, '1.0.0-placeholder')
      ON CONFLICT ("id") DO NOTHING;
    `);

    console.log('Seeding completed successfully!');
  } catch (error) {
    console.error('Error during seeding:', error);
  } finally {
    await dataSource.destroy();
  }
}

void seed();
