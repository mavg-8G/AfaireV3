// The package exports the pure JS client, but @types/pg only types its root.
declare module "pg/lib/client.js" {
  import { Client } from "pg";
  export default Client;
}
