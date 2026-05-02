# Casa Cafe

A tiny local-network coffee ordering service for Cafe Harden guests. Guests open the app on their phone, place an order, and you manage the queue from the barista view.

## Run it

```powershell
python coffee_server.py
```

Or double-click `run-coffee.cmd`.

The default admin password is:

```text
coffeeadmin
```

To use a different password for one run:

```powershell
$env:ADMIN_PASSWORD="your-password"; python coffee_server.py
```

Open the guest view on the host computer:

```text
http://localhost:3000
```

The server prints one or more Wi-Fi addresses like:

```text
http://192.168.1.42:3000
```

People on the same Wi-Fi can open that address from their phone or tablet. The barista dashboard is at:

```text
http://localhost:3000/barista.html
```

The menu admin page is at:

```text
http://localhost:3000/admin.html
```

## Notes

- Orders are stored in `data/orders.json`.
- Menu availability is stored in `data/menu_config.json`.
- Use the admin page to turn drinks, option groups, milk choices, creamer choices, sizes, sweetness levels, and syrups on or off.
- Espresso uses `Single` and `Double` sizes. Other drinks can use `Standard`, `Small`, and `Large` sizes.
- Drinks can use `None`, `Whole`, `2%`, `Skim`, `Almond`, and `Oat` milk when the milk group is shown. Latte and mocha do not offer `None` as a milk option.
- Milk, creamer, and syrup choices are global inventory lists. Add, remove, or mark one unavailable once and it applies everywhere that group is shown.
- Admin can choose a default value for single-select fields like size, milk, creamer, and sweetness.
- Admin can hide an entire option group, such as size, milk, creamer, syrups, or sweetness, for a drink.
- Syrups are disabled when `Unsweetened` is selected.
- Guests see their order status after submitting. When you mark an order `ready` or `done`, their open order page updates and tries to vibrate/play a short tone.
- After ordering, guests are taken to their order status. They can edit the order while it is still `queued`, or return to the menu to place another order.
- Guest order history is tied to the browser/device with a locally stored device ID.
- The barista page can archive completed orders. Archived orders leave the active queue but stay in the data file.
- The barista and admin pages use the same password protection.
- No external dependencies are required.
- If port 3000 is busy, run with another port:

```powershell
$env:PORT=3030; python coffee_server.py
```
