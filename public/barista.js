const loginFormEl = document.querySelector("#barista-login-form");
const loginMessageEl = document.querySelector("#barista-login-message");
const passwordEl = document.querySelector("#barista-password");
const baristaAppEl = document.querySelector("#barista-app");
const lockBaristaEl = document.querySelector("#lock-barista");
const ordersEl = document.querySelector("#barista-orders");
const archiveCompletedEl = document.querySelector("#archive-completed");
const archiveMessageEl = document.querySelector("#archive-message");
const statuses = ["queued", "making", "ready", "done"];
let poller = null;

function baristaPassword() {
  return sessionStorage.getItem("baristaPassword") || "";
}

function baristaHeaders() {
  return {
    "content-type": "application/json",
    "x-admin-password": baristaPassword()
  };
}

function showBarista(isUnlocked) {
  loginFormEl.classList.toggle("hidden", isUnlocked);
  baristaAppEl.classList.toggle("hidden", !isUnlocked);
  if (!isUnlocked && poller) {
    clearInterval(poller);
    poller = null;
  }
}

function formatTime(value) {
  return new Intl.DateTimeFormat([], {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date(value));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function orderDetails(order) {
  return [
    order.size,
    order.milk,
    order.creamer ? `Creamer: ${order.creamer}` : "",
    order.sweetness,
    formatTime(order.createdAt)
  ].filter(Boolean).map(escapeHtml).join(" | ");
}

async function updateStatus(id, status) {
  const response = await fetch(`/api/orders/${id}/status`, {
    method: "PATCH",
    headers: baristaHeaders(),
    body: JSON.stringify({ status })
  });
  if (response.status === 401) {
    sessionStorage.removeItem("baristaPassword");
    showBarista(false);
    loginMessageEl.textContent = "Barista password required.";
    return;
  }
  await loadOrders();
}

async function archiveCompleted() {
  archiveMessageEl.textContent = "Archiving...";
  const response = await fetch("/api/orders/archive-completed", {
    method: "POST",
    headers: { "x-admin-password": baristaPassword() }
  });
  const data = await response.json();
  if (response.status === 401) {
    sessionStorage.removeItem("baristaPassword");
    showBarista(false);
    loginMessageEl.textContent = data.error || "Barista password required.";
    return;
  }
  archiveMessageEl.textContent = response.ok
    ? `Archived ${data.archivedCount} completed order${data.archivedCount === 1 ? "" : "s"}.`
    : data.error || "Could not archive completed orders.";
  await loadOrders();
}

function renderOrders(orders) {
  if (orders.length === 0) {
    ordersEl.innerHTML = `<p class="empty-state">No orders yet.</p>`;
    return;
  }

  ordersEl.replaceChildren(...orders.map((order) => {
    const card = document.createElement("article");
    card.className = "order-card";

    const actions = statuses.map((status) => (
      `<button class="status-button" data-id="${order.id}" data-status="${status}">${status}</button>`
    )).join("");

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
      <div class="status-actions">${actions}</div>
    `;
    return card;
  }));
}

async function loadOrders() {
  const response = await fetch("/api/barista/orders", {
    headers: { "x-admin-password": baristaPassword() }
  });
  const data = await response.json();
  if (response.status === 401) {
    sessionStorage.removeItem("baristaPassword");
    showBarista(false);
    loginMessageEl.textContent = data.error || "Barista password required.";
    return false;
  }
  renderOrders(data.orders);
  showBarista(true);
  return true;
}

loginFormEl.addEventListener("submit", async (event) => {
  event.preventDefault();
  sessionStorage.setItem("baristaPassword", passwordEl.value);
  loginMessageEl.textContent = "Checking...";
  const ok = await loadOrders();
  if (ok) {
    passwordEl.value = "";
    loginMessageEl.textContent = "";
    poller = setInterval(loadOrders, 3000);
  } else {
    passwordEl.select();
  }
});

ordersEl.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-id]");
  if (!button) return;
  updateStatus(button.dataset.id, button.dataset.status);
});
archiveCompletedEl.addEventListener("click", archiveCompleted);
lockBaristaEl.addEventListener("click", () => {
  sessionStorage.removeItem("baristaPassword");
  archiveMessageEl.textContent = "";
  showBarista(false);
});

showBarista(false);
if (baristaPassword()) {
  loadOrders().then((ok) => {
    if (ok) poller = setInterval(loadOrders, 3000);
  });
}
