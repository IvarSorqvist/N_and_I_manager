# N_and_I_manager

A small family dashboard. The first implemented tab is shared TODOs, with data persisted in Postgres.

## Run Locally

These steps assume Postgres is installed with Homebrew.

Install the app dependencies once:

```sh
npm install
```

Start Postgres:

```sh
brew services start postgresql@18
```

Create the local app database the first time you run the project:

```sh
createdb n_and_i_manager
```

Start the web server:

```sh
DATABASE_URL=postgresql://localhost:5432/n_and_i_manager npm start
```

Open `http://localhost:3000`.

For development with automatic server restarts:

```sh
DATABASE_URL=postgresql://localhost:5432/n_and_i_manager npm run dev
```

The app creates the `todos` table automatically when the web server starts.

## Stop Locally

Stop the web server by pressing `Ctrl+C` in the terminal where `npm start` or `npm run dev` is running.

Stop Postgres:

```sh
brew services stop postgresql@18
```

## LAN Or EC2 Hosting

The server reads `PORT`, `HOST`, and `DATABASE_URL` from the environment.

```sh
HOST=0.0.0.0 PORT=3000 DATABASE_URL=postgresql://user:password@host:5432/database npm start
```

On EC2, run the same command behind a process manager such as `systemd` or `pm2`, then put Nginx or an AWS load balancer in front of it when you want HTTPS and a domain.

## Structure

- `server.mjs`: static file server plus TODO API.
- `public/`: browser app, styles, and client-side behavior.
- `render.yaml`: Render web service and Postgres database configuration.
