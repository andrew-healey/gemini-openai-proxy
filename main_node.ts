import { serve } from "@hono/node-server"
import { app } from "./src/app.ts"
console.log("Listening on http://localhost:8081/")
serve({
  fetch: app.fetch,
  port: 8081,
})
