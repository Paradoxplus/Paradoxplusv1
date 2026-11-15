import pg from "pg";

const { Pool } = pg;
let pool = null;
let ready = false;

export async function initRecruitmentDatabase() {
  if (!process.env.DATABASE_URL) {
    console.warn("[Recruitment] DATABASE_URL is missing; recruitment database features are disabled.");
    return false;
  }
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });
  try {
    await pool.query("SELECT 1");
    await pool.query(`CREATE TABLE IF NOT EXISTS recruitment_records (
      id BIGSERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      recruit_id TEXT NOT NULL,
      recruiter_id TEXT NOT NULL,
      recruited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      source TEXT NOT NULL DEFAULT 'manual',
      original_nickname TEXT,
      nickname_saved BOOLEAN NOT NULL DEFAULT FALSE,
      UNIQUE (guild_id, recruit_id)
    )`);
    await pool.query("ALTER TABLE recruitment_records ADD COLUMN IF NOT EXISTS original_nickname TEXT");
    await pool.query("ALTER TABLE recruitment_records ADD COLUMN IF NOT EXISTS nickname_saved BOOLEAN NOT NULL DEFAULT FALSE");
    await pool.query("CREATE INDEX IF NOT EXISTS recruitment_records_guild_date_idx ON recruitment_records (guild_id, recruited_at DESC)");
    await pool.query("CREATE INDEX IF NOT EXISTS recruitment_records_recruiter_idx ON recruitment_records (guild_id, recruiter_id, recruited_at DESC)");
    ready = true;
    console.log("[Recruitment] PostgreSQL connected; recruitment tables are ready.");
    return true;
  } catch (error) {
    ready = false;
    console.error("[Recruitment] PostgreSQL initialization failed:", error.message);
    await pool.end().catch(() => {});
    pool = null;
    return false;
  }
}

function requireDatabase() {
  if (!ready || !pool) throw new Error("Recruitment database is not connected. Check DATABASE_URL and PostgreSQL.");
}

export async function recordRecruit({ guildId, recruitId, recruiterId, source = "manual", originalNickname = null }) {
  requireDatabase();
  const inserted = await pool.query(
    `INSERT INTO recruitment_records (guild_id, recruit_id, recruiter_id, source, original_nickname, nickname_saved)
     VALUES ($1, $2, $3, $4, $5, TRUE)
     ON CONFLICT (guild_id, recruit_id) DO NOTHING
     RETURNING id, recruited_at`,
    [guildId, recruitId, recruiterId, source, originalNickname]
  );
  if (!inserted.rowCount) return { duplicate: true, total: await getRecruitTotal(guildId), record: null };
  return { duplicate: false, total: await getRecruitTotal(guildId), record: inserted.rows[0] };
}

export async function removeRecruit(guildId, recruitId) {
  requireDatabase();
  const result = await pool.query(
    `DELETE FROM recruitment_records
     WHERE guild_id = $1 AND recruit_id = $2
     RETURNING recruiter_id, original_nickname, nickname_saved, recruited_at`,
    [guildId, recruitId]
  );
  return result.rows[0] ?? null;
}
async function getRecruitTotal(guildId) {
  requireDatabase();
  const result = await pool.query("SELECT COUNT(*)::int AS total FROM recruitment_records WHERE guild_id = $1", [guildId]);
  return result.rows[0].total;
}

export async function getRecruitStats(guildId, recruiterId) {
  requireDatabase();
  const result = await pool.query(`SELECT COUNT(*)::int AS total,
    COUNT(*) FILTER (WHERE recruited_at >= NOW() - INTERVAL '7 days')::int AS last_7_days,
    COUNT(*) FILTER (WHERE recruited_at >= NOW() - INTERVAL '30 days')::int AS last_30_days,
    MAX(recruited_at) AS latest
    FROM recruitment_records WHERE guild_id = $1 AND recruiter_id = $2`, [guildId, recruiterId]);
  return result.rows[0];
}

export async function getRecruitLeaderboard(guildId, period = "all") {
  requireDatabase();
  const intervals = { daily: "1 day", weekly: "7 days", monthly: "30 days" };
  const interval = intervals[period];
  const query = interval
    ? `SELECT recruiter_id, COUNT(*)::int AS total FROM recruitment_records
       WHERE guild_id = $1 AND recruited_at >= NOW() - $2::interval
       GROUP BY recruiter_id ORDER BY total DESC, recruiter_id ASC LIMIT 10`
    : `SELECT recruiter_id, COUNT(*)::int AS total FROM recruitment_records
       WHERE guild_id = $1 GROUP BY recruiter_id ORDER BY total DESC, recruiter_id ASC LIMIT 10`;
  const result = interval ? await pool.query(query, [guildId, interval]) : await pool.query(query, [guildId]);
  return result.rows;
}

export function isRecruitmentDatabaseReady() {
  return ready;
}


export async function importDatabaseSnapshot(snapshot) {
  requireDatabase();
  if (!snapshot || snapshot.format !== "paradoxplus-postgresql-json-v1" || !Array.isArray(snapshot.tables)) throw new Error("This is not a supported Paradoxplus PostgreSQL backup.");
  const allowedTables = new Set(["recruitment_records"]);
  const table = snapshot.tables.find(item => item?.schema === "public" && item?.name === "recruitment_records");
  if (snapshot.tables.some(item => item?.schema !== "public" || !allowedTables.has(item?.name))) throw new Error("The backup contains an unknown table. Restore stopped to protect the new database.");
  if (!table) return { restored: 0, tables: 0 };
  const allowedColumns = ["id", "guild_id", "recruit_id", "recruiter_id", "recruited_at", "source", "original_nickname", "nickname_saved"];
  const columns = Array.isArray(table.columns) ? table.columns.map(column => column.column_name) : [];
  if (columns.some(column => !allowedColumns.includes(column))) throw new Error("The backup contains an unsupported database column.");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("TRUNCATE TABLE public.recruitment_records RESTART IDENTITY");
    let restored = 0;
    for (const row of (Array.isArray(table.rows) ? table.rows : [])) {
      if (!row || typeof row !== "object" || Array.isArray(row)) throw new Error("Invalid row in database backup.");
      const present = allowedColumns.filter(column => Object.prototype.hasOwnProperty.call(row, column));
      if (!present.length) continue;
      const values = present.map(column => row[column]);
      const placeholders = present.map((_, index) => "$" + (index + 1));
      await client.query("INSERT INTO public.recruitment_records (" + present.map(column => '"' + column + '"').join(",") + ") VALUES (" + placeholders.join(",") + ")", values);
      restored++;
    }
    await client.query("SELECT setval(pg_get_serial_sequence('public.recruitment_records','id'), COALESCE((SELECT MAX(id) FROM public.recruitment_records), 1), EXISTS (SELECT 1 FROM public.recruitment_records))");
    await client.query("COMMIT");
    return { restored, tables: 1 };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}


export async function exportDatabaseSnapshot() {
  requireDatabase();
  const listed = await pool.query(`
    SELECT table_schema, table_name
    FROM information_schema.tables
    WHERE table_type = 'BASE TABLE'
      AND table_schema NOT IN ('pg_catalog', 'information_schema')
    ORDER BY table_schema, table_name
  `);
  const tables = [];
  for (const item of listed.rows) {
    const schema = String(item.table_schema).replace(/"/g, '""');
    const name = String(item.table_name).replace(/"/g, '""');
    const columns = await pool.query(`
      SELECT column_name, data_type, udt_name, is_nullable, column_default, ordinal_position
      FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = $2
      ORDER BY ordinal_position
    `, [item.table_schema, item.table_name]);
    const rows = await pool.query(`SELECT * FROM "${schema}"."${name}"`);
    tables.push({
      schema: item.table_schema,
      name: item.table_name,
      columns: columns.rows,
      rows: rows.rows
    });
  }
  return {
    format: "paradoxplus-postgresql-json-v1",
    exportedAt: new Date().toISOString(),
    tables
  };
}
