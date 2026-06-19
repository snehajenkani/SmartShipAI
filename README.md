# SmartShip AI

Barcode scanning web app for warehouse loaders. Admins upload a fixed
master Route ID → Route Name dataset, and set up the column format for
the loader's daily Excel (since real-world Excels have varying column
names). Loaders just upload their daily Excel and scan — no questions
asked. Scanning a barcode (Tracking ID) looks up the Route ID for that
package, checks it against the admin's master data, and announces the
Route Name via voice — or "Invalid Package" if there's no match.

## Stack

- **Frontend:** React + Vite
- **Backend:** Node.js + Express
- **Database:** MongoDB

## Folder structure

```
SmartShipAI/
├── backend/
│   ├── config/db.js
│   ├── middleware/auth.js
│   ├── models/ (User, MasterData, ShipmentBatch, LoaderExcelMapping)
│   ├── routes/ (auth, admin, scanner)
│   ├── seed.js
│   ├── server.js
│   ├── package.json
│   └── .env.example
└── frontend/
    ├── src/
    │   ├── components/ (ProtectedRoute, CameraScanner)
    │   ├── context/AuthContext.jsx
    │   ├── pages/ (Login, AdminPanel, Scanner)
    │   ├── services/api.js
    │   ├── App.jsx
    │   ├── main.jsx
    │   └── index.css
    ├── index.html
    ├── package.json
    └── vite.config.js
```

## 1. Backend setup

```bash
cd "C:\Users\premk\OneDrive\Desktop\SmartShip AI\backend"
npm install
```

### Configure environment variables

Copy `.env.example` to `.env`:

```bash
copy .env.example .env
```

Edit `.env`:
- `MONGO_URI` — your MongoDB connection string (local or Atlas)
- `JWT_SECRET` — any long random string
- `PORT` — defaults to 5000

### Create login accounts (run once)

This creates one admin account and one shared loader account.

```bash
node seed.js
```

Default accounts created (change these in `seed.js` before running if you want different credentials):
- **Admin:** `admin` / `admin123`
- **Loader (shared by all loaders):** `loader` / `loader123`

### Start the backend

```bash
npm run dev
```

Backend runs at `http://localhost:5000`.

## 2. Frontend setup

Open a new terminal:

```bash
cd "C:\Users\premk\OneDrive\Desktop\SmartShip AI\frontend"
npm install
npm run dev
```

Frontend runs at `http://localhost:3000` and proxies `/api` requests to
the backend automatically.

## 3. Using the app

### As Admin — one-time setup (do this first)

1. Log in with the admin account. You land on the **Admin Panel**.

2. **Admin Excel (Master Data)** card:
   - Select your Route ID → Route Name Excel file.
   - The app reads the column headers and shows two dropdowns.
   - Pick which column is **Route ID** and which is **Route Name**.
   - Click **Confirm & Upload**. This replaces any previous master data.

3. **Loader Excel Format** card:
   - Select a *sample* of the daily shipment Excel that loaders will use
     (the actual column names can be anything — e.g. "Pkg_Code", "Store_No").
   - The app reads the column headers and shows two dropdowns.
   - Pick which column is **Tracking ID** and which is **Route ID**.
   - Click **Confirm & Save Format**. This saves the mapping rule — it does
     NOT save the sample data itself.
   - From now on, every loader upload automatically uses this mapping, with
     no questions asked to the loader. If the loader Excel format changes
     later, just repeat this step with a new sample.

4. Click **Go to Scanner** to also test scanning as admin.

### As Loader

1. Log in with the shared loader account. You land on the **Scanner** page.
2. Upload today's Excel — no questions, no column mapping. The app uses
   the format the admin already configured.
3. The scan input is auto-focused — scan a barcode with a hardware
   scanner, or type a Tracking ID and press Enter.
4. The result card shows the **Route Name** in large text and speaks it
   aloud. If the Route ID doesn't match the master data, it shows and
   speaks **"Invalid Package"**.
5. Scan history builds up below as you go.

## Excel format expectations

### Admin Excel (Master Data)
Any column layout is fine — the admin selects which columns are Route ID
and Route Name from a dropdown after uploading. Example:

| Pkg_Store_Code | Delivery_Route  |
|----------------|-----------------|
| INAPNLR00020   | NELLORE LOCAL   |
| INAPKOV00021   | KOVUR LOCAL     |

### Loader Excel (Daily Shipment Data)
Any column layout is fine too — the admin sets up the mapping once using
a sample file, and it's applied automatically afterward. Optional
metadata rows above the header (Trip Sheet ID, Vehicle, Date, Route) are
parsed automatically if present. Example:

| Trip Sheet ID | 24690937 |
| Vehicle       | AP16TS5262 |
| Date          | ... |
| Route         | NELLORE LOCAL |
| ...blank row... |
| Pkg_Code      | Store_No |
| IMS88854578   | INAPNLR00020 |
| IMS88845602   | INAPKOV00021 |

## Notes

- All loaders share one login (`loader` / `loader123` by default).
  Change this password in `seed.js` before deploying, then re-run
  `node seed.js` (or update the password directly in MongoDB).
- Each new daily Excel upload replaces the "active" batch used for
  scanning — only the most recently uploaded file is used for matches.
- Re-uploading master data fully replaces the previous master dataset.
- The loader Excel column mapping (Tracking ID / Route ID columns) is a
  single saved rule — re-saving it from the Admin Panel replaces the
  previous mapping. Do this whenever the daily Excel format changes.
