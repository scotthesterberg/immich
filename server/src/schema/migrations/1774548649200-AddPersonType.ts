import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await sql`DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'person_type_enum') THEN
      CREATE TYPE "person_type_enum" AS ENUM ('human', 'dog', 'cat');
    END IF;
  END $$;`.execute(db);

  await sql`ALTER TABLE "person" ADD COLUMN IF NOT EXISTS "type" "person_type_enum" NOT NULL DEFAULT 'human'`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE "person" DROP COLUMN IF EXISTS "type"`.execute(db);
  await sql`DROP TYPE IF EXISTS "person_type_enum"`.execute(db);
}
