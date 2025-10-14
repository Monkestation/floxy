import { Knex } from "knex";

export class DatabaseManager {
  readonly client: Knex.Client;

  private connectionOptions: Knex.Config;
  constructor(connectionOptions: Knex.Config) {
    this.connectionOptions = connectionOptions;
    this.client = new Knex.Client({
      ...connectionOptions,
      connection: {
        ...(connectionOptions.connection as Knex.ConnectionConfigProvider),
        supportBigNumbers: true,
      },
    });
  }

  private async initSchema() {
    await this.client.raw(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'user',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    await this.client.raw(`CREATE TABLE IF NOT EXISTS media_cache (
      id TEXT PRIMARY KEY,
      url TEXT NOT NULL,
      file_path TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size INTEGER NOT NULL,
      valid_until DATETIME NOT NULL,
      is_deleted BOOLEAN DEFAULT 0,
      metadata TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    await this.client.raw(`CREATE INDEX IF NOT EXISTS idx_media_cache_valid_until ON media_cache (valid_until)`);
    await this.client.raw(`CREATE TABLE IF NOT EXISTS cache_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      media_id TEXT NOT NULL,
      action TEXT NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      notes TEXT,
      FOREIGN KEY (media_id) REFERENCES media_cache(id) ON DELETE CASCADE
    )`);
  }

  public async connect() {
    await this.initSchema();
  }

}