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
      UNIQUE (guild_id, recruit_id)
    )`);
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

export async function recordRecruit({ guildId, recruitId, recruiterId, source = "manual" }) {
  requireDatabase();
  const inserted = await pool.query(
    `INSERT INTO recruitment_records (guild_id, recruit_id, recruiter_id, source)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (guild_id, recruit_id) DO NOTHING
     RETURNING id, recruited_at`,
    [guildId, recruitId, recruiterId, source]
  );
  if (!inserted.rowCount) return { duplicate: true, total: await getRecruitTotal(guildId), record: null };
  return { duplicate: false, total: await getRecruitTotal(guildId), record: inserted.rows[0] };
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
