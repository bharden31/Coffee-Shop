let menu = [];
let syrups = [];
let selectedDrinkId = null;
let trackedOrder = null;
let statusPoller = null;
let readyAlertPlayed = false;
let editOrderId = null;
const DEVICE_ID_KEY = "houseCoffeeDeviceId";

const menuEl = document.querySelector("#menu");
const sizeEl = document.querySelector("#size");
const milkEl = document.querySelector("#milk");
const creamerEl = document.querySelector("#creamer");
const sweetnessEl = document.querySelector("#sweetness");
const optionFields = {
  size: document.querySelector("#size-field"),
  milk: document.querySelector("#milk-field"),
  creamer: document.querySelector("#creamer-field"),
  sweetness: document.querySelector("#sweetness-field")
};
const optionSelects = {
  size: sizeEl,
  milk: milkEl,
  creamer: creamerEl,
  sweetness: sweetnessEl
};
const syrupsEl = document.querySelector("#syrups");
const syrupsFieldEl = document.querySelector("#syrups-field");
const formEl = document.querySelector("#order-form");
const formModeEl = document.querySelector("#form-mode");
const submitOrderEl = document.querySelector("#submit-order");
const cancelEditEl = document.querySelector("#cancel-edit");
const messageEl = document.querySelector("#form-message");
const orderListEl = document.querySelector("#order-list");
const orderCountEl = document.querySelector("#order-count");
const guestStatusEl = document.querySelector("#guest-status");
const guestStatusTitleEl = document.querySelector("#guest-status-title");
const guestStatusDetailEl = document.querySelector("#guest-status-detail");
const editOrderEl = document.querySelector("#edit-order");
const newOrderEl = document.querySelector("#new-order");
const guestHistoryEl = document.querySelector("#guest-history");
const historyListEl = document.querySelector("#history-list");
const guestNameEl = document.querySelector("#guest-name");
const notesEl = document.querySelector("#notes");

function deviceId() {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function optionNodes(values) {
  return values.map((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    return option;
  });
}

function setOptions(select, values) {
  select.replaceChildren(...optionNodes(values));
}

function selectedDrink() {
  return menu.find((drink) => drink.id === selectedDrinkId);
}

function setSelectValue(select, value) {
  if ([...select.options].some((option) => option.value === value)) {
    select.value = value;
  }
}

function checkedSyrups() {
  return [...document.querySelectorAll("input[name='syrups']:checked")].map((input) => input.value);
}

function orderPayload() {
  return {
    name: guestNameEl.value,
    drinkId: selectedDrinkId,
    size: sizeEl.value,
    milk: milkEl.value,
    creamer: creamerEl.value,
    sweetness: sweetnessEl.value,
    syrups: checkedSyrups(),
    notes: notesEl.value,
    deviceId: deviceId()
  };
}

function renderOptions() {
  const drink = selectedDrink();
  if (!drink) {
    Object.entries(optionSelects).forEach(([group, select]) => {
      setOptions(select, []);
      optionFields[group].classList.add("hidden");
    });
    return;
  }
  Object.entries(optionSelects).forEach(([group, select]) => {
    const values = drink.options[group] || [];
    optionFields[group].classList.toggle("hidden", values.length === 0);
    setOptions(select, values);
    if (drink.defaults?.[group] && values.includes(drink.defaults[group])) {
      select.value = drink.defaults[group];
    }
  });
}

function renderSyrups(selected = []) {
  const drinkSyrups = selectedDrink()?.options.syrups || [];
  syrupsFieldEl.classList.toggle("hidden", drinkSyrups.length === 0);
  if (drinkSyrups.length === 0) {
    syrupsEl.innerHTML = `<p class="empty-state">No syrups available right now.</p>`;
    return;
  }

  const disabled = !optionFields.sweetness.classList.contains("hidden") && sweetnessEl.value === "Unsweetened";
  const selectedSet = new Set(selected);
  syrupsEl.replaceChildren(...drinkSyrups.map((syrup) => {
    const label = document.createElement("label");
    label.className = "check-choice";
    label.innerHTML = `
      <input type="checkbox" name="syrups" value="${escapeHtml(syrup)}" ${!disabled && selectedSet.has(syrup) ? "checked" : ""} ${disabled ? "disabled" : ""}>
      <span>${escapeHtml(syrup)}</span>
    `;
    return label;
  }));
  if (disabled) {
    const note = document.createElement("p");
    note.className = "empty-state";
    note.textContent = "Syrups are not available with unsweetened drinks.";
    syrupsEl.append(note);
  }
}

function renderMenu() {
  if (menu.length === 0) {
    selectedDrinkId = null;
    menuEl.innerHTML = `<p class="empty-state">No drinks are available right now.</p>`;
    renderOptions();
    return;
  }

  if (!selectedDrink()) {
    selectedDrinkId = menu[0].id;
  }

  const cards = menu.map((drink) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = `drink-card${drink.id === selectedDrinkId ? " is-selected" : ""}`;
    card.setAttribute("aria-pressed", drink.id === selectedDrinkId ? "true" : "false");
    card.dataset.drinkId = drink.id;
    card.innerHTML = `<strong>${escapeHtml(drink.name)}</strong><span>${escapeHtml(drink.description)}</span>`;
    card.addEventListener("click", () => {
      selectedDrinkId = drink.id;
      renderMenu();
      renderOptions();
      renderSyrups(checkedSyrups());
    });
    return card;
  });
  menuEl.replaceChildren(...cards);
}

function formatTime(value) {
  return new Intl.DateTimeFormat([], { hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function orderDetails(order) {
  const parts = [
    order.size,
    order.milk,
    order.creamer ? `Creamer: ${order.creamer}` : "",
    order.sweetness,
    formatTime(order.createdAt)
  ].filter(Boolean).map(escapeHtml);
  return parts.join(" | ");
}

function renderOrders(orders) {
  const visible = orders.filter((order) => order.status !== "done");
  orderCountEl.textContent = `${visible.length} waiting`;

  if (visible.length === 0) {
    orderListEl.innerHTML = `<p class="empty-state">No open orders yet.</p>`;
    return;
  }

  orderListEl.replaceChildren(...visible.map((order) => {
    const card = document.createElement("article");
    card.className = "order-card";
    card.innerHTML = `
      <div class="order-top">
        <div>
          <h3>${escapeHtml(order.name)}: ${escapeHtml(order.drinkName)}</h3>
          <p class="order-meta">${orderDetails(order)}</p>
          ${order.syrups?.length ? `<p class="order-meta">Syrups: ${order.syrups.map(escapeHtml).join(", ")}</p>` : ""}
        </div>
        <span class="status-pill ${order.status}">${order.status}</span>
      </div>
      ${order.notes ? `<p class="order-note">${escapeHtml(order.notes)}</p>` : ""}
    `;
    return card;
  }));
}

function renderHistory(orders) {
  if (orders.length === 0) {
    guestHistoryEl.classList.add("hidden");
    return;
  }

  guestHistoryEl.classList.remove("hidden");
  historyListEl.replaceChildren(...orders.map((order) => {
    const card = document.createElement("article");
    card.className = "order-card";
    card.innerHTML = `
      <div class="order-top">
        <div>
          <h3>${escapeHtml(order.drinkName)}</h3>
          <p class="order-meta">${orderDetails(order)}</p>
          ${order.syrups?.length ? `<p class="order-meta">Syrups: ${order.syrups.map(escapeHtml).join(", ")}</p>` : ""}
        </div>
        <span class="status-pill ${order.status}">${order.status}</span>
      </div>
      <div class="status-actions">
        <button class="status-button" data-track-order="${order.id}" type="button">View status</button>
      </div>
    `;
    return card;
  }));
}

function statusText(order) {
  if (order.status === "queued") return "You're in the queue.";
  if (order.status === "making") return "Your drink is being made.";
  if (order.status === "ready") return "Your drink is ready.";
  if (order.status === "done") return "Enjoy your drink.";
  return "Order sent.";
}

function playReadyAlert() {
  if (readyAlertPlayed) return;
  readyAlertPlayed = true;
  if (navigator.vibrate) {
    navigator.vibrate([160, 80, 160]);
  }
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    const context = new AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.4);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.42);
  } catch {
    // The visible status is the source of truth; audio is optional.
  }
}

function renderGuestStatus(order) {
  trackedOrder = order;
  guestStatusEl.classList.remove("hidden", "is-ready");
  guestStatusTitleEl.textContent = statusText(order);
  guestStatusDetailEl.innerHTML = `
    ${escapeHtml(order.drinkName)} | ${orderDetails(order)}
    ${order.syrups?.length ? `<br>Syrups: ${order.syrups.map(escapeHtml).join(", ")}` : ""}
  `;
  editOrderEl.classList.toggle("hidden", order.status !== "queued");
  if (order.status === "ready" || order.status === "done") {
    guestStatusEl.classList.add("is-ready");
    playReadyAlert();
  }
}

async function loadTrackedOrder() {
  if (!trackedOrder?.id) return;
  const response = await fetch(`/api/orders/${trackedOrder.id}`);
  if (!response.ok) return;
  const data = await response.json();
  renderGuestStatus(data.order);
}

function trackOrder(order) {
  readyAlertPlayed = false;
  renderGuestStatus(order);
  if (statusPoller) clearInterval(statusPoller);
  statusPoller = setInterval(loadTrackedOrder, 2500);
}

async function loadDeviceHistory() {
  const response = await fetch(`/api/devices/${encodeURIComponent(deviceId())}/orders`);
  if (!response.ok) return;
  const data = await response.json();
  renderHistory(data.orders);

  const active = data.orders.find((order) => order.status !== "done");
  if (!trackedOrder && active) {
    trackOrder(active);
    showStatus();
  }
}

function showStatus() {
  guestStatusEl.classList.remove("hidden");
  formEl.classList.add("hidden");
  guestStatusEl.scrollIntoView({ behavior: "smooth", block: "start" });
}

function showMenu() {
  editOrderId = null;
  formModeEl.textContent = "New order";
  submitOrderEl.textContent = "Send order";
  cancelEditEl.classList.add("hidden");
  messageEl.textContent = "";
  formEl.reset();
  renderMenu();
  renderOptions();
  renderSyrups();
  formEl.classList.remove("hidden");
  formEl.scrollIntoView({ behavior: "smooth", block: "start" });
}

function fillForm(order) {
  guestNameEl.value = order.name;
  selectedDrinkId = order.drinkId;
  renderMenu();
  renderOptions();
  setSelectValue(sizeEl, order.size);
  setSelectValue(milkEl, order.milk);
  setSelectValue(creamerEl, order.creamer);
  setSelectValue(sweetnessEl, order.sweetness);
  renderSyrups(order.syrups || []);
  notesEl.value = order.notes || "";
}

function startEdit() {
  if (!trackedOrder || trackedOrder.status !== "queued") return;
  editOrderId = trackedOrder.id;
  fillForm(trackedOrder);
  formModeEl.textContent = "Editing order";
  submitOrderEl.textContent = "Save changes";
  cancelEditEl.classList.remove("hidden");
  messageEl.textContent = "";
  formEl.classList.remove("hidden");
  formEl.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function loadMenu() {
  const response = await fetch("/api/menu");
  const data = await response.json();
  menu = data.menu;
  syrups = data.syrups;
  selectedDrinkId = selectedDrinkId ?? menu[0]?.id ?? null;
  renderMenu();
  renderOptions();
  renderSyrups();
}

async function loadOrders() {
  const response = await fetch("/api/orders");
  const data = await response.json();
  renderOrders(data.orders);
}

async function submitOrder() {
  const isEditing = Boolean(editOrderId);
  const response = await fetch(isEditing ? `/api/orders/${editOrderId}` : "/api/orders", {
    method: isEditing ? "PATCH" : "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(orderPayload())
  });

  const data = await response.json();
  if (!response.ok) {
    messageEl.textContent = data.error || "That order did not go through.";
    if (response.status === 409) {
      editOrderId = null;
      await loadTrackedOrder();
      showStatus();
    }
    return;
  }

  editOrderId = null;
  messageEl.textContent = isEditing ? "Order updated." : `Order sent. ${data.order.drinkName} coming up.`;
  trackOrder(data.order);
  await loadOrders();
  await loadDeviceHistory();
  showStatus();
}

formEl.addEventListener("submit", async (event) => {
  event.preventDefault();
  messageEl.textContent = editOrderId ? "Saving..." : "Sending...";
  await submitOrder();
});

editOrderEl.addEventListener("click", startEdit);
newOrderEl.addEventListener("click", showMenu);
cancelEditEl.addEventListener("click", () => {
  editOrderId = null;
  showStatus();
});
sweetnessEl.addEventListener("change", () => renderSyrups(checkedSyrups()));
historyListEl.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-track-order]");
  if (!button) return;
  const response = await fetch(`/api/orders/${button.dataset.trackOrder}`);
  if (!response.ok) return;
  const data = await response.json();
  trackOrder(data.order);
  showStatus();
});

loadMenu();
loadOrders();
loadDeviceHistory();
setInterval(loadOrders, 3000);
setInterval(loadDeviceHistory, 7000);
