const state = {
  todos: [],
  search: "",
  filters: {
    owner: "all",
    priority: "all",
    category: "all"
  },
  sortBy: "created",
  expandedTodoIds: new Set(),
  editingTodoId: null,
  editDrafts: new Map()
};

const kanbanColumns = [
  { id: "todo", title: "TODO" },
  { id: "ongoing", title: "Ongoing" },
  { id: "blocked", title: "Blocked" },
  { id: "done", title: "Done" }
];

const ownerOptions = ["", "Ivar", "Nomeny"];
const priorityOptions = ["", "Low", "Medium", "High"];
const categoryOptions = ["", "home", "family", "vacation", "economy", "admin"];
const priorityRank = new Map([
  ["High", 0],
  ["Medium", 1],
  ["Low", 2],
  ["", 3]
]);

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
  searchInput: document.querySelector("#searchInput"),
  ownerFilter: document.querySelector("#ownerFilter"),
  priorityFilter: document.querySelector("#priorityFilter"),
  categoryFilter: document.querySelector("#categoryFilter"),
  sortSelect: document.querySelector("#sortSelect")
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

    return searchable.includes(term) && matchesTagFilters(todo);
  });
}

function matchesTagFilters(todo) {
  const owner = normalizeOwner(todo.owner);
  const priority = normalizePriority(todo.priority);
  const category = normalizeCategory(todo.category);

  return (
    (state.filters.owner === "all" || owner === state.filters.owner) &&
    (state.filters.priority === "all" || priority === state.filters.priority) &&
    (state.filters.category === "all" || category === state.filters.category)
  );
}

function getTodoStatus(todo) {
  if (kanbanColumns.some((column) => column.id === todo.status)) {
    return todo.status;
  }

  return todo.done ? "done" : "todo";
}

function normalizeOwner(value) {
  return ownerOptions.includes(value) ? value : ownerOptions[0];
}

function normalizeCategory(value) {
  return categoryOptions.includes(value) ? value : categoryOptions[0];
}

function normalizePriority(value) {
  return priorityOptions.includes(value) ? value : priorityOptions[0];
}

function compareByCreated(a, b) {
  return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
}

function compareByPriority(a, b) {
  const rankDelta = priorityRank.get(normalizePriority(a.priority)) - priorityRank.get(normalizePriority(b.priority));

  if (rankDelta !== 0) {
    return rankDelta;
  }

  return compareByCreated(a, b);
}

function compareByDueDate(a, b) {
  const aDate = a.dueDate || "9999-12-31";
  const bDate = b.dueDate || "9999-12-31";
  const dateDelta = aDate.localeCompare(bDate);

  if (dateDelta !== 0) {
    return dateDelta;
  }

  return compareByPriority(a, b);
}

function sortTodos(todos) {
  const sorted = [...todos];

  if (state.sortBy === "priority") {
    return sorted.sort(compareByPriority);
  }

  if (state.sortBy === "dueDate") {
    return sorted.sort(compareByDueDate);
  }

  return sorted.sort(compareByCreated);
}

function makeTag(label, value, variant = "") {
  const tag = document.createElement("span");
  tag.className = variant ? `todo-tag ${variant}` : "todo-tag";
  tag.textContent = `${label}: ${value}`;
  return tag;
}

function getSavedEditValues(todo) {
  return {
    title: todo.title,
    owner: normalizeOwner(todo.owner),
    dueDate: todo.dueDate || "",
    priority: normalizePriority(todo.priority),
    category: normalizeCategory(todo.category),
    description: todo.description || ""
  };
}

function getEditDraft(todo) {
  return state.editDrafts.get(todo.id) || getSavedEditValues(todo);
}

function setEditDraft(id, form) {
  state.editDrafts.set(id, Object.fromEntries(new FormData(form)));
}

function renderTodoCard(todo) {
  const fragment = elements.template.content.cloneNode(true);
  const item = fragment.querySelector(".todo-item");
  const title = fragment.querySelector(".todo-title");
  const tags = fragment.querySelector(".todo-tags");
  const deleteButton = fragment.querySelector(".delete-button");
  const editForm = fragment.querySelector(".todo-edit-form");
  const cancelButton = fragment.querySelector(".cancel-button");
  const expanded = state.expandedTodoIds.has(todo.id);
  const editing = state.editingTodoId === todo.id;

  item.dataset.todoId = todo.id;
  item.classList.toggle("done", getTodoStatus(todo) === "done");
  item.classList.toggle("expanded", expanded);
  item.classList.toggle("editing", editing);
  item.setAttribute("aria-expanded", String(editing));
  item.draggable = !editing;
  title.textContent = todo.title;

  const tagNodes = [
    todo.dueDate ? makeTag("Due", formatDueDate(todo.dueDate)) : null,
    normalizePriority(todo.priority)
      ? makeTag("Priority", normalizePriority(todo.priority), `priority-${normalizePriority(todo.priority).toLowerCase()}`)
      : null,
    normalizeOwner(todo.owner) ? makeTag("Owner", normalizeOwner(todo.owner)) : null,
    normalizeCategory(todo.category) ? makeTag("Category", normalizeCategory(todo.category)) : null
  ].filter(Boolean);
  tags.replaceChildren(...tagNodes);
  tags.hidden = tagNodes.length === 0;
  editForm.hidden = !editing;

  if (editing) {
    const draft = getEditDraft(todo);
    editForm.elements.title.value = draft.title;
    editForm.elements.owner.value = draft.owner;
    editForm.elements.dueDate.value = draft.dueDate;
    editForm.elements.priority.value = draft.priority;
    editForm.elements.category.value = draft.category;
    editForm.elements.description.value = draft.description;
  }

  item.addEventListener("click", (event) => {
    if (event.target.closest("button, input, select, textarea, form")) {
      return;
    }

    if (editing) {
      stopEditingTodo({ preserveDraft: true });
      return;
    }

    startEditingTodo(todo.id);
  });

  item.addEventListener("keydown", (event) => {
    if (event.target.closest("button, input, select, textarea, form")) {
      return;
    }

    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    if (editing) {
      stopEditingTodo({ preserveDraft: true });
      return;
    }

    startEditingTodo(todo.id);
  });

  item.addEventListener("dragstart", (event) => {
    if (editing) {
      event.preventDefault();
      return;
    }

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

  editForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    try {
      await saveTodoEdits(todo.id, new FormData(editForm));
    } catch (error) {
      setStatus("Error");
      window.alert(error.message);
    }
  });
  editForm.addEventListener("input", () => setEditDraft(todo.id, editForm));
  editForm.addEventListener("change", () => setEditDraft(todo.id, editForm));
  cancelButton.addEventListener("click", () => stopEditingTodo({ discardDraft: true }));
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
    const columnTodos = sortTodos(visibleTodos.filter((todo) => getTodoStatus(todo) === column.id));
    elements.board.append(renderColumn(column, columnTodos));
  }
}

function startEditingTodo(id) {
  state.expandedTodoIds = new Set([id]);
  state.editingTodoId = id;
  render();
}

function stopEditingTodo({ preserveDraft = false, discardDraft = false } = {}) {
  if (preserveDraft && state.editingTodoId) {
    const editForm = document.querySelector(`.todo-item[data-todo-id="${state.editingTodoId}"] .todo-edit-form`);

    if (editForm) {
      setEditDraft(state.editingTodoId, editForm);
    }
  }

  if (discardDraft && state.editingTodoId) {
    state.editDrafts.delete(state.editingTodoId);
  }

  state.expandedTodoIds.clear();
  state.editingTodoId = null;
  render();
}

async function saveTodoEdits(id, formData) {
  const changes = Object.fromEntries(formData);
  await updateTodo(id, changes, { renderAfter: false });
  state.editDrafts.delete(id);
  state.editingTodoId = null;
  state.expandedTodoIds.clear();
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

async function updateTodo(id, changes, options = {}) {
  const { renderAfter = true } = options;
  setStatus("Saving");
  const updated = await api(`/api/todos/${id}`, {
    method: "PATCH",
    body: JSON.stringify(changes)
  });
  state.todos = state.todos.map((todo) => (todo.id === id ? updated : todo));
  setStatus("Local");
  if (renderAfter) {
    render();
  }
}

async function deleteTodo(id) {
  setStatus("Saving");
  await api(`/api/todos/${id}`, { method: "DELETE" });
  state.todos = state.todos.filter((todo) => todo.id !== id);
  state.expandedTodoIds.delete(id);
  state.editDrafts.delete(id);
  if (state.editingTodoId === id) {
    state.editingTodoId = null;
  }
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

elements.ownerFilter.addEventListener("change", (event) => {
  state.filters.owner = event.target.value;
  render();
});

elements.priorityFilter.addEventListener("change", (event) => {
  state.filters.priority = event.target.value;
  render();
});

elements.categoryFilter.addEventListener("change", (event) => {
  state.filters.category = event.target.value;
  render();
});

elements.sortSelect.addEventListener("change", (event) => {
  state.sortBy = event.target.value;
  render();
});

try {
  await loadTodos();
} catch (error) {
  setStatus("Error");
  elements.emptyState.hidden = false;
  elements.emptyState.textContent = error.message;
}
