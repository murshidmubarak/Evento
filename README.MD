# EventOps ERP

Event management ERP for managing clients, events, quotations, payments, event managers, workers, recruitment, wages, and event operations.

## Tech Stack

- **Frontend**: React, Vite, Tailwind CSS, React Router, Axios
- **Backend**: Node.js, Express, Mongoose
- **Database**: MongoDB

## Project Structure

```
EVENTOPS/
├── backend/          # Express API server
├── frontend/         # React application
├── docs/             # Project documentation
├── tests/            # Test files
├── AGENTS.md         # Development rules
└── README.md
```

## Setup

### Prerequisites

- Node.js (v18+)
- MongoDB (local or Atlas)

### Backend

```bash
cd backend
cp .env.example .env    # then edit .env with your MongoDB URI
npm install
npm run dev
```

The API runs at `http://localhost:5000`.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The app runs at `http://localhost:5173`.

## Architecture

This project uses a **Modular Monolith** architecture. See [docs/06-architecture.md](docs/06-architecture.md) for details.

## Continuous Integration (CI)

Automated quality and regression checks run via GitHub Actions on every push to `main` and on all pull requests targeting `main`.

### Workflow Pipeline (`.github/workflows/ci.yml`)

The CI pipeline runs two isolated, parallel jobs:

1. **Backend (`backend-ci`)**:
   - Spawns isolated service containers for **MongoDB 8.0** and **Redis 7**.
   - Runs on **Node.js 24 LTS**.
   - Installs dependencies reproducibly with `npm ci`.
   - Executes TypeScript type-checking (`npm run type-check`).
   - Executes the automated test suite with dynamic test database isolation (`npm test`).
   - Verifies the production build bundle (`npm run build`).

2. **Frontend (`frontend-ci`)**:
   - Runs on **Node.js 24 LTS**.
   - Installs dependencies reproducibly with `npm ci`.
   - Runs code quality and lint checks (`npm run lint`).
   - Executes frontend automated tests (`npm test`).
   - Verifies the production bundle build (`npm run build`).

### Inspecting Results & Merge Policy

- View workflow runs and diagnostic logs in the **Actions** tab on GitHub or directly within Pull Request status checks.
- All checks in both jobs (backend and frontend) must pass green before a pull request can be merged into `main`.

