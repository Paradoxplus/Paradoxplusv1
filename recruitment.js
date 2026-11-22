import pg from "pg";

const { Pool } = pg;
let pool = null;
let ready = false;


async function migrateExistingDataToNeon(connectionString) {
  const target = new Pool({ connectionString, max: 2, connectionTimeoutMillis: 10000 });
  const supported = ["recruitment_records", "message_archive"];
  try {
    await target.query("SELECT 1");
    await target.query("CREATE TABLE IF NOT EXISTS public.paradoxplus_migration_state (migration_key TEXT PRIMARY KEY, completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
    const done = await target.query("SELECT 1 FROM public.paradoxplus_migration_state WHERE migration_key = $1", ["railway-postgres-to-neon-v1"]);
    if (done.rowCount) {
      console.log("[Neon migration] Existing data migration was already completed; skipping.");
      return;
    }

    const sourceTables = await pool.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);
    const names = sourceTables.rows.map(row => row.table_name);
    const unsupported = names.filter(name => !supported.includes(name));
    if (unsupported.length) {
      throw new Error("Additional source tables need review before cutover: " + unsupported.join(", "));
    }

    let totalInserted = 0;
    for (const table of supported) {
      if (!names.includes(table)) continue;
      const sourceColumns = await pool.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1
        ORDER BY ordinal_position
      `, [table]);
      const targetColumns = await target.query(`
        SELECT column_name, data_type FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1
        ORDER BY ordinal_position
      `, [table]);
      const targetNames = new Set(targetColumns.rows.map(row => row.column_name));
      const targetTypes = new Map(targetColumns.rows.map(row => [row.column_name, row.data_type]));
      const columns = sourceColumns.rows.map(row => row.column_name).filter(name => targetNames.has(name));
      if (!columns.length) throw new Error("No compatible columns found for " + table);
      const orderColumn = table === "recruitment_records" ? "id" : "message_id";
      const countResult = await pool.query('SELECT COUNT(*)::bigint AS count FROM public."' + table + '"');
      const sourceCount = Number(countResult.rows[0].count);
      let offset = 0;
      let inserted = 0;
      while (offset < sourceCount) {
        const selectColumns = columns.map(name => targetTypes.get(name) === "jsonb"
          ? '"' + name + '"::text AS "' + name + '"'
          : '"' + name + '"');
        const batch = await pool.query(
          'SELECT ' + selectColumns.join(",") + ' FROM public."' + table + '" ORDER BY "' + orderColumn + '" LIMIT 500 OFFSET $1',
          [offset]
        );
        if (!batch.rows.length) break;
        const values = [];
        const tuples = batch.rows.map((row, rowIndex) => {
          const placeholders = columns.map((_, columnIndex) => {
            values.push(row[columns[columnIndex]]);
            return "$" + values.length;
          });
          return "(" + placeholders.join(",") + ")";
        });
        const result = await target.query(
          'INSERT INTO public."' + table + '" ("' + columns.join('","') + '") VALUES ' + tuples.join(",") + " ON CONFLICT DO NOTHING",
          values
        );
        inserted += result.rowCount;
        offset += batch.rows.length;
      }
      if (table === "recruitment_records") {
        await target.query("SELECT setval(pg_get_serial_sequence('public.recruitment_records','id'), COALESCE((SELECT MAX(id) FROM public.recruitment_records), 1), EXISTS (SELECT 1 FROM public.recruitment_records))");
      }
      totalInserted += inserted;
      console.log("[Neon migration] " + table + ": source=" + sourceCount + ", newly copied=" + inserted);
    }
    await target.query(
      "INSERT INTO public.paradoxplus_migration_state (migration_key) VALUES ($1) ON CONFLICT DO NOTHING",
      ["railway-postgres-to-neon-v1"]
    );
    console.log("[Neon migration] Completed successfully; newly copied rows=" + totalInserted);
  } finally {
    await target.end().catch(() => {});
  }
}

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

    if (process.env.NEON_DATABASE_URL) {
      try {
        await migrateExistingDataToNeon(process.env.NEON_DATABASE_URL);
      } catch (migrationError) {
        console.error("[Neon migration] Not completed; keeping the current DATABASE_URL active:", migrationError.message);
      }
    }

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

  const tableRules = {
    recruitment_records: ["id", "guild_id", "recruit_id", "recruiter_id", "recruited_at", "source", "original_nickname", "nickname_saved"],
    message_archive: ["message_id", "guild_id", "channel_id", "channel_name", "author_id", "author_tag", "content", "attachments", "embeds", "stickers", "created_at", "edited_at", "archived_at", "deleted_at", "message_url", "event_type"]
  };
  const selected = snapshot.tables.filter(item => item?.schema === "public" && Object.hasOwn(tableRules, item?.name));
  if (snapshot.tables.some(item => item?.schema !== "public" || !Object.hasOwn(tableRules, item?.name))) {
    throw new Error("The backup contains an unknown table. Restore stopped to protect the new database.");
  }
  if (!selected.length) return { restored: 0, tables: 0 };

  for (const table of selected) {
    const allowedColumns = tableRules[table.name];
    const columns = Array.isArray(table.columns) ? table.columns.map(column => column.column_name) : [];
    if (!columns.length || columns.some(column => !allowedColumns.includes(column))) {
      throw new Error("The backup contains unsupported columns for " + table.name + ".");
    }
    if (!Array.isArray(table.rows)) throw new Error("The backup rows are invalid for " + table.name + ".");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (selected.some(table => table.name === "message_archive")) await client.query("TRUNCATE TABLE public.message_archive");
    if (selected.some(table => table.name === "recruitment_records")) await client.query("TRUNCATE TABLE public.recruitment_records RESTART IDENTITY");

    let restored = 0;
    for (const table of selected) {
      const allowedColumns = tableRules[table.name];
      for (const row of table.rows) {
        if (!row || typeof row !== "object" || Array.isArray(row)) throw new Error("Invalid row in database backup.");
        const present = allowedColumns.filter(column => Object.hasOwn(row, column));
        if (!present.length) continue;
        const values = present.map(column => row[column]);
        const placeholders = present.map((_, index) => "$" + (index + 1));
        await client.query(
          "INSERT INTO public." + table.name + " (" + present.map(column => '"' + column + '"').join(",") + ") VALUES (" + placeholders.join(",") + ")",
          values
        );
        restored++;
      }
    }

    if (selected.some(table => table.name === "recruitment_records")) {
      await client.query("SELECT setval(pg_get_serial_sequence('public.recruitment_records','id'), COALESCE((SELECT MAX(id) FROM public.recruitment_records), 1), EXISTS (SELECT 1 FROM public.recruitment_records))");
    }
    await client.query("COMMIT");
    return { restored, tables: selected.length };
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
