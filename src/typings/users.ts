export enum FloxyUserRole {
  ADMIN = "admin",
  USER = "user"
}

export type FloxyJWTPayload = Pick<DBFloxyUser, "id" | "username" | "email" | "createdAt">