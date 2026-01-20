const { app } = require("@azure/functions");
const { TableClient, AzureNamedKeyCredential } = require("@azure/data-tables");

// --- CORS (for local dev + simple use) ---
function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

// --- Connection string parser (safe, simple) ---
function parseConnStr(conn) {
  const parts = Object.fromEntries(
    conn
      .split(";")
      .filter(Boolean)
      .map((kv) => {
        const i = kv.indexOf("=");
        return [kv.slice(0, i), kv.slice(i + 1)];
      })
  );
  return parts;
}

// --- Table client using AccountName/AccountKey (avoids SAS parsing problems) ---
function getTableClient() {
  const conn = process.env.AzureWebJobsStorage;
  const tableName = process.env.STORAGE_TABLE_NAME || "Assets";
  if (!conn) throw new Error("AzureWebJobsStorage not set");

  const p = parseConnStr(conn);
  const accountName = p.AccountName;
  const accountKey = p.AccountKey;
  const protocol = p.DefaultEndpointsProtocol || "https";
  const suffix = p.EndpointSuffix || "core.windows.net";

  if (!accountName || !accountKey) {
    throw new Error("AccountName/AccountKey missing in connection string");
  }

  const tableEndpoint = `${protocol}://${accountName}.table.${suffix}`;
  const credential = new AzureNamedKeyCredential(accountName, accountKey);

  return new TableClient(tableEndpoint, tableName, credential);
}

app.http("assets", {
  route: "assets",
  methods: ["GET", "POST", "OPTIONS"],
  authLevel: "anonymous",
  handler: async (request, context) => {
    // Preflight for CORS
    if (request.method === "OPTIONS") {
      return { status: 204, headers: cors() };
    }

    try {
      const table = getTableClient();

      // POST = upsert asset assignment
      if (request.method === "POST") {
        const body = await request.json();
        const { assetNo, dept, assignedTo, assignedAt } = body || {};

        if (!assetNo || !dept || !assignedTo) {
          return {
            status: 400,
            headers: cors(),
            jsonBody: { ok: false, error: "assetNo, dept, assignedTo required" },
          };
        }

        const now = new Date().toISOString();

        const entity = {
          partitionKey: "assets",
          rowKey: String(assetNo).trim(),
          assetNo: String(assetNo).trim(),
          dept: String(dept).trim(),
          assignedTo: String(assignedTo).trim(),
          assignedAt: assignedAt || now,
          updatedAt: now,
        };

        await table.upsertEntity(entity, "Replace");

        return {
          status: 200,
          headers: cors(),
          jsonBody: { ok: true, saved: entity },
        };
      }

      // GET = list recent assets
      const max = Math.min(parseInt(request.query.get("max") || "20", 10), 100);

      const items = [];
      const iter = table.listEntities({
        queryOptions: { filter: "PartitionKey eq 'assets'" },
      });

      for await (const e of iter) {
        items.push(e);
        if (items.length >= 200) break;
      }

      items.sort((a, b) =>
        String(b.assignedAt || "").localeCompare(String(a.assignedAt || ""))
      );

      return {
        status: 200,
        headers: cors(),
        jsonBody: { ok: true, items: items.slice(0, max) },
      };
    } catch (err) {
      context.log(err);
      return {
        status: 500,
        headers: cors(),
        jsonBody: { ok: false, error: err?.message || String(err) },
      };
    }
  },
});
