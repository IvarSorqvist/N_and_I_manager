import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync, createReadStream } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { randomUUID } from "node:crypto";

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "localhost";
const ROOT = resolve(".");
const PUBLIC_DIR = join(ROOT, "public");
const DATA_DIR = join(ROOT, "data");
const TODOS_FILE = join(DATA_DIR, "todos.json");

const contentTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".ico", "image/x-icon"]
]);

async function ensureDataFile() {
  await mkdir(DATA_DIR, { recursive: true });

  if (!existsSync(TODOS_FILE)) {
    const now = new Date().toISOString();
    const starterTodos = [
      {
        id: randomUUID(),
        title: "Return package before Sunday",
        notes: "",
        owner: "Family",
        dueDate: "",
        done: false,
        createdAt: now,
        updatedAt: now
      },
      {
        id: randomUUID(),
        title: "Call mum",
        notes: "",
        owner: "Family",
        dueDate: "",
        done: false,
        createdAt: now,
        updatedAt: now
      },
      {
        id: randomUUID(),
        title: "Plan summer vacation",
        notes: "",
        owner: "Family",
        dueDate: "",
        done: false,
        createdAt: now,
        updatedAt: now
      }
    ];

    await writeTodos(starterTodos);
  }
}

async function readTodos() {
  await ensureDataFile();
  const raw = await readFile(TODOS_FILE, "utf8");
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : [];
}

async function writeTodos(todos) {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(TODOS_FILE, `${JSON.stringify(todos, null, 2)}\n`);
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

  if (!title) {
    throw new Error("A TODO title is required.");
  }

  return {
    title,
    notes: String(payload.notes || "").trim(),
    owner: String(payload.owner || "Family").trim() || "Family",
    dueDate: String(payload.dueDate || "").trim()
  };
}

async function handleTodosApi(req, res, pathname) {
  try {
    if (pathname === "/api/todos" && req.method === "GET") {
      const todos = await readTodos();
      sendJson(res, 200, todos);
      return true;
    }

    if (pathname === "/api/todos" && req.method === "POST") {
      const payload = normalizeTodoPayload(await readJsonBody(req));
      const now = new Date().toISOString();
      const todo = {
        id: randomUUID(),
        ...payload,
        done: false,
        createdAt: now,
        updatedAt: now
      };
      const todos = await readTodos();
      todos.unshift(todo);
      await writeTodos(todos);
      sendJson(res, 201, todo);
      return true;
    }

    const match = pathname.match(/^\/api\/todos\/([^/]+)$/);
    if (!match) {
      return false;
    }

    const id = match[1];
    const todos = await readTodos();
    const index = todos.findIndex((todo) => todo.id === id);

    if (index === -1) {
      sendError(res, 404, "TODO not found.");
      return true;
    }

    if (req.method === "PATCH") {
      const body = await readJsonBody(req);
      const current = todos[index];
      const next = {
        ...current,
        updatedAt: new Date().toISOString()
      };

      if (Object.hasOwn(body, "done")) {
        next.done = Boolean(body.done);
      }

      if (
        Object.hasOwn(body, "title") ||
        Object.hasOwn(body, "notes") ||
        Object.hasOwn(body, "owner") ||
        Object.hasOwn(body, "dueDate")
      ) {
        Object.assign(next, normalizeTodoPayload({ ...current, ...body }));
      }

      todos[index] = next;
      await writeTodos(todos);
      sendJson(res, 200, next);
      return true;
    }

    if (req.method === "DELETE") {
      const [removed] = todos.splice(index, 1);
      await writeTodos(todos);
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

await ensureDataFile();

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
