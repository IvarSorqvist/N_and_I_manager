import { createServer } from "node:http";
import { existsSync, createReadStream } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import pg from "pg";

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";
const ROOT = resolve(".");
const PUBLIC_DIR = join(ROOT, "public");
const DATABASE_URL = process.env.DATABASE_URL;
const TODO_STATUSES = new Set(["todo", "ongoing", "blocked", "done"]);
const PRIORITIES = new Set(["", "Low", "Medium", "High"]);
const OWNERS = new Set(["", "Ivar", "Nomeny"]);
const CATEGORIES = new Set(["", "home", "family", "vacation", "economy", "admin"]);
const { Pool } = pg;

const contentTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".ico", "image/x-icon"]
]);

if (!DATABASE_URL) {
  console.error("DATABASE_URL is required. Set it to your Render Postgres connection string.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL.includes("sslmode=require") ? { rejectUnauthorized: false } : undefined
});

function normalizeStatus(value, done = false) {
  const status = String(value || "").trim();

  if (TODO_STATUSES.has(status)) {
    return status;
  }

  return done ? "done" : "todo";
}

function normalizePriority(value) {
  const priority = String(value || "").trim();
  return PRIORITIES.has(priority) ? priority : "";
}

function normalizeOwner(value) {
  const owner = String(value || "").trim();
  return OWNERS.has(owner) ? owner : "";
}

function normalizeCategory(value) {
  const category = String(value || "").trim().toLowerCase();
  return CATEGORIES.has(category) ? category : "";
}

function hydrateTodo(todo) {
  const status = normalizeStatus(todo.status, todo.done);
  const description = String(todo.description ?? todo.notes ?? "").trim();

  return {
    ...todo,
    description,
    notes: description,
    owner: normalizeOwner(todo.owner),
    dueDate: String(todo.dueDate || "").trim(),
    priority: normalizePriority(todo.priority),
    category: normalizeCategory(todo.category),
    status,
    done: status === "done"
  };
}

function todoFromRow(row) {
  return hydrateTodo({
    id: row.id,
    title: row.title,
    description: row.description,
    notes: row.description,
    owner: row.owner,
    dueDate: row.due_date,
    priority: row.priority,
    category: row.category,
    status: row.status,
    done: row.done,
    createdAt: row.created_at?.toISOString?.() || row.created_at,
    updatedAt: row.updated_at?.toISOString?.() || row.updated_at
  });
}

async function ensureDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS todos (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      owner TEXT NOT NULL DEFAULT '',
      due_date TEXT NOT NULL DEFAULT '',
      priority TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'todo',
      done BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    ALTER TABLE todos
      ALTER COLUMN owner SET DEFAULT '',
      ALTER COLUMN priority SET DEFAULT '',
      ALTER COLUMN category SET DEFAULT ''
  `);
}

async function listTodos() {
  const result = await pool.query(`
    SELECT *
    FROM todos
    ORDER BY created_at DESC
  `);

  return result.rows.map(todoFromRow);
}

async function getTodo(id) {
  const result = await pool.query(
    `
      SELECT *
      FROM todos
      WHERE id = $1
    `,
    [id]
  );

  return result.rows[0] ? todoFromRow(result.rows[0]) : null;
}

async function createTodo(payload) {
  const now = new Date();
  const todo = {
    id: randomUUID(),
    ...payload,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  };
  const result = await pool.query(
    `
      INSERT INTO todos (
        id,
        title,
        description,
        owner,
        due_date,
        priority,
        category,
        status,
        done,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `,
    [
      todo.id,
      todo.title,
      todo.description,
      todo.owner,
      todo.dueDate,
      todo.priority,
      todo.category,
      todo.status,
      todo.done,
      todo.createdAt,
      todo.updatedAt
    ]
  );

  return todoFromRow(result.rows[0]);
}

async function updateTodo(id, payload) {
  const result = await pool.query(
    `
      UPDATE todos
      SET
        title = $2,
        description = $3,
        owner = $4,
        due_date = $5,
        priority = $6,
        category = $7,
        status = $8,
        done = $9,
        updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `,
    [
      id,
      payload.title,
      payload.description,
      payload.owner,
      payload.dueDate,
      payload.priority,
      payload.category,
      payload.status,
      payload.done
    ]
  );

  return result.rows[0] ? todoFromRow(result.rows[0]) : null;
}

async function deleteTodo(id) {
  const result = await pool.query(
    `
      DELETE FROM todos
      WHERE id = $1
      RETURNING *
    `,
    [id]
  );

  return result.rows[0] ? todoFromRow(result.rows[0]) : null;
}

async function readJsonBody(req) {
  const chunks = [];

  for await (const chunk of req) {
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function sendError(res, statusCode, message) {
  sendJson(res, statusCode, { error: message });
}

function normalizeTodoPayload(payload) {
  const title = String(payload.title || "").trim();
  const status = normalizeStatus(payload.status, payload.done);
  const description = String(payload.description ?? payload.notes ?? "").trim();

  if (!title) {
    throw new Error("A TODO title is required.");
  }

  return {
    title,
    description,
    notes: description,
    owner: normalizeOwner(payload.owner),
    dueDate: String(payload.dueDate || "").trim(),
    priority: normalizePriority(payload.priority),
    category: normalizeCategory(payload.category),
    status,
    done: status === "done"
  };
}

async function handleTodosApi(req, res, pathname) {
  try {
    if (pathname === "/api/todos" && req.method === "GET") {
      const todos = await listTodos();
      sendJson(res, 200, todos);
      return true;
    }

    if (pathname === "/api/todos" && req.method === "POST") {
      const payload = normalizeTodoPayload(await readJsonBody(req));
      const todo = await createTodo(payload);
      sendJson(res, 201, todo);
      return true;
    }

    const match = pathname.match(/^\/api\/todos\/([^/]+)$/);
    if (!match) {
      return false;
    }

    const id = match[1];
    const current = await getTodo(id);

    if (!current) {
      sendError(res, 404, "TODO not found.");
      return true;
    }

    if (req.method === "PATCH") {
      const body = await readJsonBody(req);
      const next = {
        ...current,
        updatedAt: new Date().toISOString()
      };

      if (Object.hasOwn(body, "done")) {
        next.done = Boolean(body.done);
        next.status = next.done ? "done" : "todo";
      }

      if (Object.hasOwn(body, "status")) {
        next.status = normalizeStatus(body.status, next.done);
        next.done = next.status === "done";
      }

      if (
        Object.hasOwn(body, "title") ||
        Object.hasOwn(body, "description") ||
        Object.hasOwn(body, "notes") ||
        Object.hasOwn(body, "owner") ||
        Object.hasOwn(body, "dueDate") ||
        Object.hasOwn(body, "priority") ||
        Object.hasOwn(body, "category")
      ) {
        Object.assign(next, normalizeTodoPayload({ ...next, ...body }));
      }

      const updated = await updateTodo(id, hydrateTodo(next));
      sendJson(res, 200, updated);
      return true;
    }

    if (req.method === "DELETE") {
      const removed = await deleteTodo(id);
      sendJson(res, 200, removed);
      return true;
    }

    sendError(res, 405, "Method not allowed.");
    return true;
  } catch (error) {
    sendError(res, 400, error.message || "Invalid request.");
    return true;
  }
}

function serveStatic(req, res, pathname) {
  const requestedPath = pathname === "/" ? "/index.html" : pathname;
  const filePath = normalize(join(PUBLIC_DIR, requestedPath));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    sendError(res, 403, "Forbidden.");
    return;
  }

  if (!existsSync(filePath)) {
    sendError(res, 404, "Not found.");
    return;
  }

  const contentType = contentTypes.get(extname(filePath)) || "application/octet-stream";
  res.writeHead(200, { "content-type": contentType });
  createReadStream(filePath).pipe(res);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  if (url.pathname.startsWith("/api/")) {
    const handled = await handleTodosApi(req, res, url.pathname);

    if (!handled) {
      sendError(res, 404, "API route not found.");
    }

    return;
  }

  serveStatic(req, res, url.pathname);
});

await ensureDatabase();

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`Port ${PORT} is already in use.`);
    console.error(`Stop the existing server or run this app on another port: PORT=3001 npm start`);
    process.exit(1);
  }

  throw error;
});

server.listen(PORT, HOST, () => {
  console.log(`N_and_I_manager is running at http://${HOST}:${PORT}`);
});
