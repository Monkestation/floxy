/** biome-ignore-all lint/style/noNonNullAssertion: shut up pretty please uwu */
import Knex from "knex";
import { Schema as ParsedDatabaseSchema } from "../ParsedDatabaseSchema.js";
import type { FloxyUserRole } from "../typings/users.js";
import logger from "../utils/logger.js";

type Column = {
  name: string;
  type: "text" | "boolean" | "integer" | "binary";
  unique?: boolean;
};

type Table = {
  name: string;
  columns: Column[];
};

export class DatabaseManager {
  readonly client: Knex.Knex;

  private connectionOptions: Knex.Knex.Config;
  constructor(connectionOptions: Knex.Knex.Config) {
    this.connectionOptions = connectionOptions;
    this.client = Knex(connectionOptions);
  }

  public async initSchema() {
    // @ts-expect-error It'll be fine
    const tables: Table[] = ParsedDatabaseSchema;

    for (const table of tables) {
      const connClient = this.connectionOptions.client as string;
      const existingColumns: { name: string }[] = [];

      if (!(await this.client.schema.hasTable(table.name))) {
        await this.client.schema.createTable(table.name, (k) => {
          // Add the necessary columns for each table
          for (const column of table.columns) {
            const columnType =
              column.type as keyof Knex.Knex.CreateTableBuilder;
            const e = (
              k[columnType] as (name: string) => Knex.Knex.ColumnBuilder
            )(column.name);
            if (column.unique) e.unique();
          }
        });
      }

      if (["better-sqlite3", "sqlite3"].includes(connClient)) {
        const result = await this.client.raw<{ name: string }[]>(
          `PRAGMA table_info(${table.name});`,
        );
        for (const column of result)
          existingColumns.push({ name: column.name });
      } else if (["mysql", "mysql2"].includes(connClient)) {
        const result = await this.client.raw<{ Field: string }[][]>(
          `SHOW columns from ${table.name}`,
        );
        if (result && result.length !== 0 && Array.isArray(result[0]))
          for (const column of result[0])
            existingColumns.push({ name: column.Field });

        // console.log(existingColumns);
      }

      if (await this.client.schema.hasTable(table.name)) {
        // Check if the table has the necessary columns and add them if they don't exist
        for (const column of table.columns) {
          // const check = (await this.client.schema.hasColumn(table.name, column.name));
          // logger.debug(`Table ${table.name} column ${column.name} ${check}`);
          const check = existingColumns.some((e) => e.name === column.name);
          // logger.debug(JSON.stringify(existingColumns.map(e=>e.name)));
          // logger.debug(`checking column ${column.name}, check: ${check}`);
          if (!check) {
            // logger.debug(`column: ${column.name} not in ${table.name}`);
            await this.client.schema.table(table.name, (k) => {
              const e = (
                k[column.type] as (name: string) => Knex.Knex.AlterColumnBuilder
              )(column.name);
              if (column.unique) e.unique();
            });
          }
        }
      }

      // Iterate through the existing columns and delete any that aren't in the schema
      for (const column of existingColumns) {
        if (!table.columns.some((c) => c.name === column.name)) {
          logger.debug(
            `Table ${table.name} column ${column.name} not in schema`,
          );
          await this.client.schema.table(table.name, (k) => {
            k.dropColumn(column.name);
          });
        }
      }

      logger.info("Finished initSchema on ByondDatabaseManager");
    }
  }

  public async connect() {
    await this.initSchema();
  }

  /** BEGIN MEDIA ENTRIES */

  public async getMediaEntryById(id: string) {
    const entry = await this.client<DBMediaEntry>("media")
      .select()
      .where({ id });
    return entry;
  }

  public async getMediaEntryByUrl(url: string) {
    const entry = await this.client<DBMediaEntry>("media")
      .select()
      .where({ url });
    return entry;
  }

  // this shit below is kinda gay af and i need to find a better way to do it because why would you update by url.

  public async upsertMediaById(id: string, data: Partial<DBMediaEntry>) {
    const existingEntry = await this.getMediaEntryById(id);
    if (existingEntry) {
      await this.client<DBMediaEntry>("media").where({ id }).update(data);
    } else {
      await this.client<DBMediaEntry>("media").insert({ id, ...data });
    }
  }

  public async updateOrCreateByUrl(url: string, data: Partial<DBMediaEntry>) {
    const existingEntry = await this.getMediaEntryByUrl(url);
    if (existingEntry) {
      await this.client<DBMediaEntry>("media").where({ url }).update(data);
    } else {
      await this.client<DBMediaEntry>("media").insert({ url, ...data });
    }
  }

  /** END MEDIA CACHE ENTRIES */

  /** BEGIN USERS */

  public async upsertUser({
    username,
    passwordHash,
    email,
    role,
  }: {
    username: string;
    passwordHash: string;
    email: string;
    role: FloxyUserRole;
  }): Promise<DBFloxyUser> {
    const now = Date.now();

    const existingUser = await this.client<DBFloxyUser>("users")
      .where({ username })
      .orWhere({ email })
      .first();

    if (existingUser) {
      await this.client<DBFloxyUser>("users")
        .where({ id: existingUser.id })
        .update({
          passwordHash,
          role,
          updatedAt: now,
        });

      return (await this.getUserById(existingUser.id))!;
    } else {
      const id = crypto.randomUUID();

      await this.client<DBFloxyUser>("users").insert({
        id,
        username,
        passwordHash,
        email,
        role,
        createdAt: now,
        updatedAt: now,
      });

      return (await this.getUserById(id))!;
    }
  }

  /**
   * Updates a user by ID.
   * @param id The user ID.
   * @param updates The fields to update.
   * @param noReturn If true, returns void instead of the updated user.
   * @returns The updated user or void.
   */
  public async updateUserById(
    id: string,
    updates: Partial<{
      username: string;
      passwordHash: string;
      email: string;
      role: FloxyUserRole;
    }>,
  ): Promise<DBFloxyUser> {
    const now = Date.now();

    const affected = await this.client<DBFloxyUser>("users")
      .where({ id })
      .update({
        ...updates,
        updatedAt: now,
      });

    if (affected === 0) {
      throw new Error(`No user found with id: ${id}`);
    }

    const updatedUser = await this.getUserById(id);
    if (!updatedUser) throw new Error(`User not found after update: ${id}`);
    return updatedUser;
  }

  public async getUserByUsername(username: string) {
    const user = await this.client<DBFloxyUser>("users")
      .where({ username })
      .first();
    return user || null;
  }

  public async getUserById(id: string) {
    const user = await this.client<DBFloxyUser>("users").where({ id }).first();
    return user || null;
  }

  public async getAllUsers(): Promise<DBFloxyUser[]> {
    const users = await this.client<DBFloxyUser>("users").select();
    return users;
  }

  public async deleteUserById(id: string) {
    await this.client<DBFloxyUser>("users").where({ id }).delete();
  }


  /** END USERS */

  public async createLogEntry(
    action: string,
    userId: string,
    message: string,
    details: Record<string, unknown>,
  ) {
    const id = crypto.randomUUID();
    const timestamp = Date.now();

    await this.client<DBActionLogEntry>("logs").insert({
      id,
      action,
      userId,
      timestamp,
      message,
      details: JSON.stringify(details),
    });
  }
}
