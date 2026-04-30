const state = {
  todos: [],
  filter: "all",
  search: ""
};

const elements = {
  form: document.querySelector("#todoForm"),
  titleInput: document.querySelector("#titleInput"),
  ownerInput: document.querySelector("#ownerInput"),
  dueDateInput: document.querySelector("#dueDateInput"),
  notesInput: document.querySelector("#notesInput"),
  list: document.querySelector("#todoList"),
  template: document.querySelector("#todoTemplate"),
  counter: document.querySelector("#todoCounter"),
  emptyState: document.querySelector("#emptyState"),
  syncStatus: document.querySelector("#syncStatus"),
  searchInput: document.querySelector("#searchInput"),
  filters: [...document.querySelectorAll(".filter")]
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
    const matchesFilter =
      state.filter === "all" ||
      (state.filter === "open" && !todo.done) ||
      (state.filter === "done" && todo.done);

    const searchable = `${todo.title} ${todo.owner} ${todo.notes} ${todo.dueDate}`.toLowerCase();
    return matchesFilter && searchable.includes(term);
  });
}

function render() {
  const visibleTodos = getVisibleTodos();
  const openCount = state.todos.filter((todo) => !todo.done).length;

  elements.counter.textContent = `${openCount} open`;
  elements.list.replaceChildren();
  elements.emptyState.hidden = visibleTodos.length > 0;

  for (const todo of visibleTodos) {
    const fragment = elements.template.content.cloneNode(true);
    const item = fragment.querySelector(".todo-item");
    const checkbox = fragment.querySelector(".todo-check");
    const title = fragment.querySelector(".todo-title");
    const meta = fragment.querySelector(".todo-meta");
    const notes = fragment.querySelector(".todo-notes");
    const deleteButton = fragment.querySelector(".delete-button");
    const metaParts = [todo.owner || "Family", formatDueDate(todo.dueDate)].filter(Boolean);

    item.classList.toggle("done", todo.done);
    checkbox.checked = todo.done;
    title.textContent = todo.title;
    meta.textContent = metaParts.join(" · ");
    notes.textContent = todo.notes || "";
    notes.hidden = !todo.notes;

    checkbox.addEventListener("change", () => updateTodo(todo.id, { done: checkbox.checked }));
    deleteButton.addEventListener("click", () => deleteTodo(todo.id));

    elements.list.append(fragment);
  }
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

for (const filterButton of elements.filters) {
  filterButton.addEventListener("click", () => {
    state.filter = filterButton.dataset.filter;

    for (const button of elements.filters) {
      button.classList.toggle("active", button === filterButton);
    }

    render();
  });
}

try {
  await loadTodos();
} catch (error) {
  setStatus("Error");
  elements.emptyState.hidden = false;
  elements.emptyState.textContent = error.message;
}
