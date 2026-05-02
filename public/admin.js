let config = null;

const formEl = document.querySelector("#admin-form");
const loginFormEl = document.querySelector("#login-form");
const drinkConfigEl = document.querySelector("#drink-config");
const milkConfigEl = document.querySelector("#milk-config");
const creamerConfigEl = document.querySelector("#creamer-config");
const syrupConfigEl = document.querySelector("#syrup-config");
const messageEl = document.querySelector("#admin-message");
const loginMessageEl = document.querySelector("#login-message");
const passwordEl = document.querySelector("#admin-password");
const newMilkEl = document.querySelector("#new-milk");
const addMilkEl = document.querySelector("#add-milk");
const newCreamerEl = document.querySelector("#new-creamer");
const addCreamerEl = document.querySelector("#add-creamer");
const newSyrupEl = document.querySelector("#new-syrup");
const addSyrupEl = document.querySelector("#add-syrup");
const lockAdminEl = document.querySelector("#lock-admin");
const MILK_REQUIRED_DRINKS = new Set(["latte", "mocha"]);

function adminPassword() {
  return sessionStorage.getItem("adminPassword") || "";
}

function adminHeaders() {
  return {
    "content-type": "application/json",
    "x-admin-password": adminPassword()
  };
}

function showAdmin(isUnlocked) {
  loginFormEl.classList.toggle("hidden", isUnlocked);
  formEl.classList.toggle("hidden", !isUnlocked);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function checkbox(id, label, checked, attributes = "") {
  return `
    <label class="check-choice">
      <input id="${id}" type="checkbox" ${checked ? "checked" : ""} ${attributes}>
      <span>${escapeHtml(label)}</span>
    </label>
  `;
}

function valuesForGroup(drink, group, normalized) {
  if (group === "milk") {
    return (config.milks || [])
      .filter((item) => item.available)
      .map((item) => item.name)
      .filter((name) => !(MILK_REQUIRED_DRINKS.has(drink.id) && name === "None"));
  }
  if (group === "creamer") return (config.creamers || []).filter((item) => item.available).map((item) => item.name);
  return (normalized.items || []).filter((item) => item.available).map((item) => item.name);
}

function defaultSelect(drinkIndex, group, values, value) {
  if (group === "syrups" || values.length === 0) return "";
  const options = values.map((item) => (
    `<option value="${escapeHtml(item)}" ${item === value ? "selected" : ""}>${escapeHtml(item)}</option>`
  )).join("");
  return `
    <label class="default-select">
      Default
      <select data-kind="default" data-drink="${drinkIndex}" data-group="${escapeHtml(group)}">
        ${options}
      </select>
    </label>
  `;
}

function renderDrinks() {
  drinkConfigEl.replaceChildren(...config.drinks.map((drink, drinkIndex) => {
    const card = document.createElement("article");
    card.className = "admin-card";

    const optionGroups = Object.entries(drink.options).map(([group, optionConfig]) => {
      const normalized = Array.isArray(optionConfig)
        ? { enabled: true, items: optionConfig }
        : optionConfig;
      const defaultValues = valuesForGroup(drink, group, normalized);
      if (group !== "syrups" && defaultValues.length > 0 && !defaultValues.includes(normalized.defaultValue)) {
        normalized.defaultValue = defaultValues[0];
      }
      return `
      <div class="option-block">
        <div class="section-heading compact-heading">
          <h3>${escapeHtml(group)}</h3>
          ${checkbox(
            `drink-${drinkIndex}-${group}-enabled`,
            "Show group",
            normalized.enabled,
            `data-kind="group" data-drink="${drinkIndex}" data-group="${escapeHtml(group)}"`
          )}
        </div>
        ${defaultSelect(drinkIndex, group, defaultValues, normalized.defaultValue)}
        <div class="choice-grid">
          ${(normalized.items || []).map((option, optionIndex) => checkbox(
            `drink-${drinkIndex}-${group}-${optionIndex}`,
            option.name,
            option.available,
            `data-kind="option" data-drink="${drinkIndex}" data-group="${escapeHtml(group)}" data-option="${optionIndex}"`
          )).join("")}
        </div>
      </div>
    `;
    }).join("");

    card.innerHTML = `
      <div class="admin-card-header">
        <div>
          <h2>${escapeHtml(drink.name)}</h2>
          <p class="order-meta">${escapeHtml(drink.description)}</p>
        </div>
        ${checkbox(
          `drink-${drinkIndex}-available`,
          "Available",
          drink.available,
          `data-kind="drink" data-drink="${drinkIndex}"`
        )}
      </div>
      <div class="admin-options">${optionGroups}</div>
    `;
    return card;
  }));
}

function renderInventory(kind, container) {
  const items = config[kind] || [];
  if (items.length === 0) {
    container.innerHTML = `<p class="empty-state">No options configured.</p>`;
    return;
  }

  container.replaceChildren(...items.map((item, itemIndex) => {
    const row = document.createElement("div");
    row.className = "admin-syrup-row";
    row.innerHTML = `
      ${checkbox(
        `${kind}-${itemIndex}`,
        item.name,
        item.available,
        `data-kind="inventory" data-inventory="${kind}" data-index="${itemIndex}"`
      )}
      <button class="status-button remove-button" type="button" data-remove-inventory="${kind}" data-index="${itemIndex}">Remove</button>
    `;
    return row;
  }));
}

function render() {
  renderDrinks();
  renderInventory("milks", milkConfigEl);
  renderInventory("creamers", creamerConfigEl);
  renderInventory("syrups", syrupConfigEl);
}

function updateFromCheckbox(input) {
  const kind = input.dataset.kind;
  if (kind === "drink") {
    config.drinks[Number(input.dataset.drink)].available = input.checked;
    return;
  }
  if (kind === "option") {
    const drink = config.drinks[Number(input.dataset.drink)];
    const group = drink.options[input.dataset.group];
    const items = Array.isArray(group) ? group : group.items;
    items[Number(input.dataset.option)].available = input.checked;
    return;
  }
  if (kind === "group") {
    const drink = config.drinks[Number(input.dataset.drink)];
    const group = drink.options[input.dataset.group];
    if (Array.isArray(group)) {
      drink.options[input.dataset.group] = { enabled: input.checked, items: group };
    } else {
      group.enabled = input.checked;
    }
    return;
  }
  if (kind === "default") {
    const drink = config.drinks[Number(input.dataset.drink)];
    const group = drink.options[input.dataset.group];
    if (Array.isArray(group)) {
      drink.options[input.dataset.group] = { enabled: true, defaultValue: input.value, items: group };
    } else {
      group.defaultValue = input.value;
    }
    return;
  }
  if (kind === "inventory") {
    config[input.dataset.inventory][Number(input.dataset.index)].available = input.checked;
  }
}

function addInventoryItem(kind, input, container) {
  const name = input.value.trim();
  if (!name) return;
  config[kind] = config[kind] || [];
  if (!config[kind].some((item) => item.name.toLowerCase() === name.toLowerCase())) {
    config[kind].push({ name, available: true });
  }
  input.value = "";
  renderInventory(kind, container);
}

function handleInventoryRemove(event) {
  const button = event.target.closest("button[data-remove-inventory]");
  if (!button) return;
  const kind = button.dataset.removeInventory;
  config[kind].splice(Number(button.dataset.index), 1);
  render();
}

function handleInventoryChange(event) {
  const input = event.target.closest("input[type='checkbox']");
  if (!input) return;
  updateFromCheckbox(input);
}

async function loadConfig() {
  const response = await fetch("/api/admin/config", {
    headers: { "x-admin-password": adminPassword() }
  });
  if (response.status === 401) {
    sessionStorage.removeItem("adminPassword");
    showAdmin(false);
    loginMessageEl.textContent = "Enter the admin password.";
    return false;
  }
  config = await response.json();
  render();
  showAdmin(true);
  return true;
}

async function saveConfig() {
  messageEl.textContent = "Saving...";
  const response = await fetch("/api/admin/config", {
    method: "PUT",
    headers: adminHeaders(),
    body: JSON.stringify(config)
  });
  config = await response.json();
  if (response.status === 401) {
    sessionStorage.removeItem("adminPassword");
    showAdmin(false);
    loginMessageEl.textContent = config.error || "Admin password required.";
    return;
  }
  render();
  messageEl.textContent = response.ok ? "Menu saved." : config.error || "Could not save menu.";
}

loginFormEl.addEventListener("submit", async (event) => {
  event.preventDefault();
  sessionStorage.setItem("adminPassword", passwordEl.value);
  loginMessageEl.textContent = "Checking...";
  const ok = await loadConfig();
  if (ok) {
    passwordEl.value = "";
    loginMessageEl.textContent = "";
  } else {
    passwordEl.select();
  }
});

drinkConfigEl.addEventListener("change", (event) => {
  const input = event.target.closest("input[type='checkbox'], select[data-kind='default']");
  if (!input) return;
  updateFromCheckbox(input);
});

milkConfigEl.addEventListener("change", handleInventoryChange);
creamerConfigEl.addEventListener("change", handleInventoryChange);
syrupConfigEl.addEventListener("change", handleInventoryChange);
milkConfigEl.addEventListener("click", handleInventoryRemove);
creamerConfigEl.addEventListener("click", handleInventoryRemove);
syrupConfigEl.addEventListener("click", handleInventoryRemove);

addMilkEl.addEventListener("click", () => addInventoryItem("milks", newMilkEl, milkConfigEl));
addCreamerEl.addEventListener("click", () => addInventoryItem("creamers", newCreamerEl, creamerConfigEl));
addSyrupEl.addEventListener("click", () => addInventoryItem("syrups", newSyrupEl, syrupConfigEl));

formEl.addEventListener("submit", async (event) => {
  event.preventDefault();
  await saveConfig();
});

lockAdminEl.addEventListener("click", () => {
  sessionStorage.removeItem("adminPassword");
  config = null;
  showAdmin(false);
  messageEl.textContent = "";
});

showAdmin(false);
if (adminPassword()) {
  loadConfig();
}
