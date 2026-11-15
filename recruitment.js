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
    await pool.query(`CREATE TABLE IF NOT EXISTS message_archive (
      message_id TEXT PRIMARY KEY,
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      channel_name TEXT,
      author_id TEXT,
      author_tag TEXT,
      content TEXT NOT NULL DEFAULT '',
      attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
      embeds JSONB NOT NULL DEFAULT '[]'::jsonb,
      stickers JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ,
      edited_at TIMESTAMPTZ,
      archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      deleted_at TIMESTAMPTZ,
      message_url TEXT,
      event_type TEXT NOT NULL DEFAULT 'create'
    )`);
    await pool.query("CREATE INDEX IF NOT EXISTS message_archive_guild_channel_date_idx ON message_archive (guild_id, channel_id, created_at DESC)");
    await pool.query("CREATE INDEX IF NOT EXISTS message_archive_deleted_idx ON message_archive (guild_id, channel_id, deleted_at) WHERE deleted_at IS NOT NULL");

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


function serializeArchivedMessage(message) {
  return {
    messageId: message.id,
    guildId: message.guildId,
    channelId: message.channelId,
    channelName: message.channel?.name ?? null,
    authorId: message.author?.id ?? null,
    authorTag: message.author?.tag ?? message.author?.username ?? null,
    content: typeof message.content === "string" ? message.content : "",
    attachments: [...(message.attachments?.values?.() ?? [])].map(item => ({
      id: item.id,
      name: item.name ?? null,
      url: item.url ?? null,
      contentType: item.contentType ?? null,
      size: item.size ?? null,
      width: item.width ?? null,
      height: item.height ?? null,
      spoiler: Boolean(item.spoiler)
    })),
    embeds: [...(message.embeds ?? [])].map(embed => {
      try { return embed.toJSON(); } catch { return {}; }
    }),
    stickers: [...(message.stickers?.values?.() ?? [])].map(sticker => ({
      id: sticker.id,
      name: sticker.name,
      url: sticker.url ?? null
    })),
    createdAt: message.createdAt ?? null,
    editedAt: message.editedAt ?? null,
    messageUrl: message.url ?? null
  };
}

export async function archiveDiscordMessage(message, eventType = "create") {
  requireDatabase();
  if (!message?.guildId || !message?.id) return false;
  const data = serializeArchivedMessage(message);
  if (eventType === "delete" && !message.author) {
    const result = await pool.query(
      "UPDATE message_archive SET deleted_at = NOW(), event_type = 'delete' WHERE message_id = $1 AND guild_id = $2",
      [message.id, message.guildId]
    );
    return result.rowCount > 0;
  }
  await pool.query(
    `INSERT INTO message_archive
      (message_id, guild_id, channel_id, channel_name, author_id, author_tag, content, attachments, embeds, stickers, created_at, edited_at, archived_at, deleted_at, message_url, event_type)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10::jsonb,$11,$12,NOW(),CASE WHEN $13 = 'delete' THEN NOW() ELSE NULL END,$14,$13)
     ON CONFLICT (message_id) DO UPDATE SET
       channel_name = COALESCE(EXCLUDED.channel_name, message_archive.channel_name),
       author_id = COALESCE(EXCLUDED.author_id, message_archive.author_id),
       author_tag = COALESCE(EXCLUDED.author_tag, message_archive.author_tag),
       content = CASE WHEN EXCLUDED.content <> '' THEN EXCLUDED.content ELSE message_archive.content END,
       attachments = CASE WHEN EXCLUDED.attachments <> '[]'::jsonb THEN EXCLUDED.attachments ELSE message_archive.attachments END,
       embeds = CASE WHEN EXCLUDED.embeds <> '[]'::jsonb THEN EXCLUDED.embeds ELSE message_archive.embeds END,
       stickers = CASE WHEN EXCLUDED.stickers <> '[]'::jsonb THEN EXCLUDED.stickers ELSE message_archive.stickers END,
       edited_at = COALESCE(EXCLUDED.edited_at, message_archive.edited_at),
       deleted_at = CASE WHEN EXCLUDED.event_type = 'delete' THEN NOW() ELSE message_archive.deleted_at END,
       message_url = COALESCE(EXCLUDED.message_url, message_archive.message_url),
       event_type = EXCLUDED.event_type`,
    [
      data.messageId, data.guildId, data.channelId, data.channelName,
      data.authorId, data.authorTag, data.content,
      JSON.stringify(data.attachments), JSON.stringify(data.embeds),
      JSON.stringify(data.stickers), data.createdAt, data.editedAt,
      eventType, data.messageUrl
    ]
  );
  return true;
}

export async function getArchivedChannelMessages(guildId, channelId, deletedOnly = false, limit = 1000) {
  requireDatabase();
  const safeLimit = Math.max(1, Math.min(1000, Number(limit) || 1000));
  const result = await pool.query(
    `SELECT message_id, author_id, author_tag, content, attachments, embeds, stickers,
            created_at, edited_at, deleted_at, message_url
     FROM message_archive
     WHERE guild_id = $1 AND channel_id = $2
       AND ($3::boolean = FALSE OR deleted_at IS NOT NULL)
     ORDER BY created_at ASC NULLS LAST
     LIMIT $4`,
    [guildId, channelId, deletedOnly, safeLimit]
  );
  return result.rows;
}

export async function pruneMessageArchive() {
  requireDatabase();
  // Message archive retention is permanent; this function intentionally deletes nothing.
  return 0;
}
