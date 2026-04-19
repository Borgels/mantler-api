import { writeFileSync } from "node:fs";

import { app } from "../src/app.js";

const spec = app.getOpenAPI31Document({
  openapi: "3.1.0",
  info: { title: "Mantler API", version: "0.1.0" },
});

writeFileSync("openapi.json", `${JSON.stringify(spec, null, 2)}\n`);
