const state = {
  todos: [],
  search: "",
  expandedTodoIds: new Set()
};

const kanbanColumns = [
  { id: "todo", title: "TODO" },
  { id: "ongoing", title: "Ongoing" },
  { id: "blocked", title: "Blocked" },
  { id: "done", title: "Done" }
];

const elements = {
  form: document.querySelector("#todoForm"),
  titleInput: document.querySelector("#titleInput"),
  ownerInput: document.querySelector("#ownerInput"),
  dueDateInput: document.querySelector("#dueDateInput"),
  priorityInput: document.querySelector("#priorityInput"),
  categoryInput: document.querySelector("#categoryInput"),
  descriptionInput: document.querySelector("#descriptionInput"),
  board: document.querySelector("#todoBoard"),
  template: document.querySelector("#todoTemplate"),
  counter: document.querySelector("#todoCounter"),
  emptyState: document.querySelector("#emptyState"),
  syncStatus: document.querySelector("#syncStatus"),
  searchInput: document.querySelector("#searchInput")
};

function setStatus(text) {
  elements.syncStatus.textContent = text;
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: {
      "content-type": "application/json",
      ...options.headers
    },
    ...options
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Request failed." }));
    throw new Error(error.error || "Request failed.");
  }

  return response.json();
}

function formatDueDate(value) {
  if (!value) {
    return "";
  }

  const date = new Date(`${value}T00:00:00`);
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric"
  }).format(date);
}

function getVisibleTodos() {
  const term = state.search.toLowerCase();

  return state.todos.filter((todo) => {
    const searchable = [
      todo.title,
      todo.owner,
      todo.description,
      todo.dueDate,
      todo.priority,
      todo.category,
      todo.status
    ]
      .join(" ")
      .toLowerCase();

    return searchable.includes(term);
  });
}

function getTodoStatus(todo) {
  if (kanbanColumns.some((column) => column.id === todo.status)) {
    return todo.status;
  }

  return todo.done ? "done" : "todo";
}

function makeTag(label, value, variant = "") {
  const tag = document.createElement("span");
  tag.className = variant ? `todo-tag ${variant}` : "todo-tag";
  tag.textContent = `${label}: ${value}`;
  return tag;
}

function renderTodoCard(todo) {
  const fragment = elements.template.content.cloneNode(true);
  const item = fragment.querySelector(".todo-item");
  const title = fragment.querySelector(".todo-title");
  const tags = fragment.querySelector(".todo-tags");
  const description = fragment.querySelector(".todo-description");
  const deleteButton = fragment.querySelector(".delete-button");
  const expanded = state.expandedTodoIds.has(todo.id);

  item.dataset.todoId = todo.id;
  item.classList.toggle("done", getTodoStatus(todo) === "done");
  item.classList.toggle("expanded", expanded);
  item.setAttribute("aria-expanded", String(expanded));
  title.textContent = todo.title;

  tags.replaceChildren(
    makeTag("Due", formatDueDate(todo.dueDate) || "No date"),
    makeTag("Priority", todo.priority || "Medium", `priority-${String(todo.priority || "Medium").toLowerCase()}`),
    makeTag("Owner", todo.owner || "Family"),
    makeTag("Category", todo.category || "General")
  );

  description.textContent = todo.description || "No description added.";
  description.hidden = !expanded;

  item.addEventListener("click", (event) => {
    if (event.target.closest("button")) {
      return;
    }

    toggleDescription(todo.id);
  });

  item.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    toggleDescription(todo.id);
  });

  item.addEventListener("dragstart", (event) => {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", todo.id);
    item.classList.add("dragging");
  });

  item.addEventListener("dragend", () => {
    item.classList.remove("dragging");
    document.querySelectorAll(".kanban-column.drop-target").forEach((column) => {
      column.classList.remove("drop-target");
    });
  });

  deleteButton.addEventListener("click", () => deleteTodo(todo.id));

  return fragment;
}

function renderColumn(column, todos) {
  const section = document.createElement("section");
  const header = document.createElement("div");
  const title = document.createElement("h3");
  const count = document.createElement("span");
  const cards = document.createElement("div");

  section.className = "kanban-column";
  section.dataset.status = column.id;
  header.className = "kanban-column-header";
  count.className = "column-count";
  cards.className = "kanban-cards";
  title.textContent = column.title;
  count.textContent = String(todos.length);

  header.replaceChildren(title, count);
  section.replaceChildren(header, cards);

  for (const todo of todos) {
    cards.append(renderTodoCard(todo));
  }

  section.addEventListener("dragover", (event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    section.classList.add("drop-target");
  });

  section.addEventListener("dragleave", (event) => {
    if (!section.contains(event.relatedTarget)) {
      section.classList.remove("drop-target");
    }
  });

  section.addEventListener("drop", async (event) => {
    event.preventDefault();
    section.classList.remove("drop-target");

    const todoId = event.dataTransfer.getData("text/plain");
    const todo = state.todos.find((item) => item.id === todoId);

    if (!todo || getTodoStatus(todo) === column.id) {
      return;
    }

    try {
      await updateTodo(todoId, { status: column.id });
    } catch (error) {
      setStatus("Error");
      window.alert(error.message);
    }
  });

  return section;
}

function render() {
  const visibleTodos = getVisibleTodos();
  const openCount = state.todos.filter((todo) => getTodoStatus(todo) !== "done").length;

  elements.counter.textContent = `${openCount} open`;
  elements.board.replaceChildren();
  elements.emptyState.hidden = visibleTodos.length > 0;

  for (const column of kanbanColumns) {
    const columnTodos = visibleTodos.filter((todo) => getTodoStatus(todo) === column.id);
    elements.board.append(renderColumn(column, columnTodos));
  }
}

function toggleDescription(id) {
  if (state.expandedTodoIds.has(id)) {
    state.expandedTodoIds.delete(id);
  } else {
    state.expandedTodoIds.add(id);
  }

  render();
}

async function loadTodos() {
  setStatus("Loading");
  state.todos = await api("/api/todos");
  setStatus("Local");
  render();
}

async function addTodo(formData) {
  setStatus("Saving");
  const todo = await api("/api/todos", {
    method: "POST",
    body: JSON.stringify(Object.fromEntries(formData))
  });
  state.todos.unshift(todo);
  setStatus("Local");
  render();
}

async function updateTodo(id, changes) {
  setStatus("Saving");
  const updated = await api(`/api/todos/${id}`, {
    method: "PATCH",
    body: JSON.stringify(changes)
  });
  state.todos = state.todos.map((todo) => (todo.id === id ? updated : todo));
  setStatus("Local");
  render();
}

async function deleteTodo(id) {
  setStatus("Saving");
  await api(`/api/todos/${id}`, { method: "DELETE" });
  state.todos = state.todos.filter((todo) => todo.id !== id);
  state.expandedTodoIds.delete(id);
  setStatus("Local");
  render();
}

elements.form.addEventListener("submit", async (event) => {
  event.preventDefault();

  try {
    await addTodo(new FormData(elements.form));
    elements.form.reset();
    elements.titleInput.focus();
  } catch (error) {
    setStatus("Error");
    window.alert(error.message);
  }
});

elements.searchInput.addEventListener("input", (event) => {
  state.search = event.target.value;
  render();
});

try {
  await loadTodos();
} catch (error) {
  setStatus("Error");
  elements.emptyState.hidden = false;
  elements.emptyState.textContent = error.message;
}
