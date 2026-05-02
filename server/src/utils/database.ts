import { createPostgres, DatabaseConnectionParams, DatabasePostgresOptions } from '@immich/sql-tools';
import {
  AliasedRawBuilder,
  DeduplicateJoinsPlugin,
  Expression,
  ExpressionBuilder,
  Kysely,
  KyselyConfig,
  NotNull,
  Selectable,
  sql,
} from 'kysely';
import { jsonArrayFrom, jsonObjectFrom } from 'kysely/helpers/postgres';
import { AssetFileType, AssetStatus, AssetVisibility } from 'src/enum';
import { DB } from 'src/schema';
import { columns, lockableProperties, LockableProperty, Person } from 'src/database';
export { columns } from 'src/database';

export const createDatabase = (params: DatabaseConnectionParams, config?: KyselyConfig): Kysely<DB> => {
  const { pool, adapter, introspector, queryCompiler } = createPostgres(params as DatabasePostgresOptions) as any;
  return new Kysely<DB>({
    dialect: {
      createAdapter: () => adapter,
      createIntrospector: () => introspector,
      createPool: () => pool,
      createDriver: (config: any) => adapter.createDriver(config),
      createQueryCompiler: () => queryCompiler,
    } as any,
    plugins: [new DeduplicateJoinsPlugin()],
    ...config,
  });
};

export const getKyselyConfig = (params: DatabaseConnectionParams): KyselyConfig => {
  const { pool, adapter, introspector, queryCompiler } = createPostgres(params as DatabasePostgresOptions) as any;
  return {
    dialect: {
      createAdapter: () => adapter,
      createIntrospector: () => introspector,
      createPool: () => pool,
      createDriver: (config: any) => adapter.createDriver(config),
      createQueryCompiler: () => queryCompiler,
    } as any,
    plugins: [new DeduplicateJoinsPlugin()],
  };
};

export const asUuid = (id: string | Expression<any>) => sql<string>\`\${id}::uuid\`;
export const anyUuid = (ids: string[]) => sql<string>\`ANY(\${sql.val(ids)}::uuid[])\`;

export const searchAssetBuilder = (db: Kysely<DB>, options: { id?: string; withDeleted?: boolean; ownerId?: string; livePhotoVideoId?: string; libraryId?: string; userIds?: string[]; personIds?: string[]; albumIds?: string[]; tagIds?: string[] } = {}) => {
  let query = db.selectFrom('asset');

  if (options.id) {
    query = query.where('asset.id', '=', asUuid(options.id) as any);
  }

  if (!options.withDeleted) {
    query = query.where('asset.deletedAt', 'is', null);
  }

  if (options.ownerId) {
    query = query.where('asset.ownerId', '=', asUuid(options.ownerId) as any);
  }
  
  if (options.libraryId) {
    query = query.where('asset.libraryId', '=', asUuid(options.libraryId) as any);
  }

  if (options.livePhotoVideoId) {
    query = query.where('asset.livePhotoVideoId', '=', asUuid(options.livePhotoVideoId) as any);
  }
  
  if (options.userIds) {
    query = query.where('asset.ownerId', '=', anyUuid(options.userIds) as any);
  }
  
  if (options.personIds) {
    query = query.innerJoin('asset_face', 'asset_face.assetId', 'asset.id').where('asset_face.personId', '=', anyUuid(options.personIds) as any);
  }
  
  if (options.albumIds) {
    query = query.innerJoin('album_asset', 'album_asset.assetId', 'asset.id').where('album_asset.albumId', '=', anyUuid(options.albumIds) as any);
  }
  
  if (options.tagIds) {
    query = query.innerJoin('tag_asset', 'tag_asset.assetId', 'asset.id').where('tag_asset.tagId', '=', anyUuid(options.tagIds) as any);
  }

  return query;
};

export const withExif = <O>(qb: any) => {
  return qb.leftJoin('asset_exif', 'asset_exif.assetId', 'asset.id');
};

export const withExifInner = <O>(qb: any) => {
  return qb.innerJoin('asset_exif', 'asset_exif.assetId', 'asset.id');
};

export const withDefaultVisibility = <O>(qb: any) => {
  return qb.where('asset.visibility', '!=', AssetVisibility.Hidden);
};

export const withFilePath = (eb: ExpressionBuilder<DB, any>, type: AssetFileType) => {
  return eb
    .selectFrom('asset_file')
    .select('path')
    .whereRef('asset_file.assetId', '=', 'asset.id')
    .where('asset_file.type', '=', type)
    .limit(1);
};

export const withFiles = (eb: ExpressionBuilder<DB, any>) => {
  return jsonArrayFrom(
    eb
      .selectFrom('asset_file')
      .select(columns.asset_file as any)
      .whereRef('asset_file.assetId', '=', 'asset.id')
      .orderBy('asset_file.type', 'asc'),
  ).as('files');
};

export const withTags = (eb: ExpressionBuilder<DB, any>) => {
  return jsonArrayFrom(
    eb
      .selectFrom('tag_asset')
      .innerJoin('tag', 'tag.id', 'tag_asset.tagId')
      .select(columns.tag as any)
      .whereRef('tag_asset.assetId', '=', 'asset.id')
      .orderBy('tag.value', 'asc'),
  ).as('tags');
};

export const withFaces = (eb: ExpressionBuilder<DB, any>) => {
  return jsonArrayFrom(
    eb
      .selectFrom('asset_face')
      .selectAll()
      .select((eb) =>
        jsonObjectFrom(
          eb
            .selectFrom('person')
            .selectAll()
            .whereRef('person.id', '=', 'asset_face.personId')
            .where('person.isHidden', '=', false),
        ).as('person'),
      )
      .whereRef('asset_face.assetId', '=', 'asset.id')
      .where('asset_face.deletedAt', 'is', null)
      .where('asset_face.isVisible', '=', true),
  ).as('faces');
};

export const withOwner = (eb: ExpressionBuilder<DB, any>) => {
  return jsonObjectFrom(eb.selectFrom('user').select(columns.user as any).whereRef('user.id', '=', 'asset.ownerId')).as(
    'owner',
  );
};

export const removeUndefinedKeys = <T extends object>(target: T, source: Partial<T>): T => {
  for (const key in source) {
    if (source[key] !== undefined) {
      target[key] = source[key] as T[Extract<keyof T, string>];
    }
  }
  return target;
};

export const updateLockedColumns = <T extends Record<string, unknown> & { lockedProperties?: LockableProperty[] }>(
  exif: T,
) => {
  exif.lockedProperties = lockableProperties.filter((property) => property in exif);
  return exif;
};

export const isAssetChecksumConstraint = (error: any) => {
  return error.code === '23505' && error.constraint === 'asset_checksum_key';
};

export const tokenizeForSearch = (text: string) => {
  return text.split(/\s+/).filter(Boolean);
};

export const dummy = sql\`(select 1)\`.as('dummy');

export const vectorIndexQuery = (eb: ExpressionBuilder<DB, any>, index: string) => {
  return sql\`1\`;
};

export const ASSET_CHECKSUM_CONSTRAINT = 'asset_checksum_key';
