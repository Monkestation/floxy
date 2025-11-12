/** biome-ignore-all lint/correctness/noUnusedVariables: <> */

interface Table {
  _tableName: string;
}

type ConvertTable<T> = Omit<T, "_tableName">;

interface _DBFloxyUser extends Table {
  _tableName: "users";
  id: string;
  username: string;
  passwordHash: string;
  email: string;
  role: import("./users.ts").FloxyUserRole;
  createdAt: number;
  updatedAt: number;
}

type DBFloxyUser = ConvertTable<_DBFloxyUser>;

interface _DBMediaEntry extends Table {
  _tableName: "media";
  id: string;
  url: string;
  extension: string;
  status: MediaQueueStatus;
  // Error for the last failure, if any
  error: string | null;
  metadata: string; // JSON stringified
  reencode: string | null; // JSON stringified
  createdAt: number;
  updatedAt: number;
  liveAt?: number;
  deleted: boolean;
  ttl: number;
}

type DBMediaEntry = ConvertTable<_DBMediaEntry>;

interface _DBActionLogEntry extends Table {
  _tableName: "logs";
  id: string;
  action: string;
  userId: string;
  timestamp: number;
  message: string;
  details: string; // JSON stringified
}

type DBActionLogEntry = ConvertTable<_DBActionLogEntry>;
