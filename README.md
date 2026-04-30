# N_and_I_manager

A small local-first family dashboard. The first implemented tab is shared TODOs, with data persisted to `data/todos.json` on the machine running the server.

## Run Locally

```sh
npm start
```

Open `http://localhost:3000`.

For development with automatic server restarts:

```sh
npm run dev
```

## LAN Or EC2 Hosting

The server reads `PORT` and `HOST` from the environment.

```sh
HOST=0.0.0.0 PORT=3000 npm start
```

On EC2, run the same command behind a process manager such as `systemd` or `pm2`, then put Nginx or an AWS load balancer in front of it when you want HTTPS and a domain.

## Structure

- `server.mjs`: static file server plus TODO API.
- `public/`: browser app, styles, and client-side behavior.
- `data/`: local JSON persistence created on first start.
