import postgres from "postgres";

let _sql: postgres.Sql | null = null;

export function getDb() {
  if (!_sql) {
    const connectionString = process.env.POSTGRES_URL;
    if (!connectionString) {
      throw new Error("POSTGRES_URL is not set");
    }
    _sql = postgres(connectionString);
  }
  return _sql;
}
