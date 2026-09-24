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
