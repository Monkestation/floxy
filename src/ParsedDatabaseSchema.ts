export const Schema = [
  {
    name: "users",
    columns: [
      { name: "id", type: "text" },
      { name: "username", type: "text" },
      { name: "passwordHash", type: "text" },
      { name: "email", type: "text" },
      { name: "role", type: "text" },
      { name: "createdAt", type: "integer" },
      { name: "updatedAt", type: "integer" },
    ],
  },
  {
    name: "media",
    columns: [
      { name: "id", type: "text" },
      { name: "url", type: "text" },
      { name: "status", type: "text" },
      { name: "metadata", type: "text" },
      { name: "createdAt", type: "integer" },
      { name: "updatedAt", type: "integer" },
      { name: "deleted", type: "boolean" },
      { name: "ttl", type: "integer" },
    ],
  },
  {
    name: "logs",
    columns: [
      { name: "id", type: "text" },
      { name: "action", type: "text" },
      { name: "userId", type: "text" },
      { name: "timestamp", type: "integer" },
      { name: "message", type: "text" },
      { name: "details", type: "text" },
    ],
  },
];
