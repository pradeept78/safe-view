// Admin-only management of dashboard logins. Users are turned off rather than deleted,
// because their names stay on bills and money records.

const { hashPassword } = require('./db');

const ROLES = ['admin', 'partner'];
const MIN_PASSWORD = 8;

function registerUserRoutes(app, { db, requireLogin, requireAdmin, Problem, text }) {
  const publicUser = (id) => db.prepare('SELECT id, username, name, role, active FROM users WHERE id = ?').get(id);

  function findUser(id) {
    const user = publicUser(Number(id));
    if (!user) throw new Problem(404, 'User not found');
    return user;
  }

  function readDetails(body) {
    const name = text(body.name, 80);
    if (!name) throw new Problem(400, 'Enter a name');
    if (!ROLES.includes(body.role)) throw new Problem(400, 'Choose admin or partner');
    return { name, role: body.role };
  }

  function readPassword(value) {
    const password = String(value ?? '');
    if (password.length < MIN_PASSWORD) throw new Problem(400, `Password must have at least ${MIN_PASSWORD} characters`);
    return hashPassword(password);
  }

  const endSessions = (id) => db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);

  app.get('/api/users', requireLogin, requireAdmin, (req, res) => {
    res.json(db.prepare('SELECT id, username, name, role, active FROM users ORDER BY active DESC, id').all());
  });

  app.post('/api/users', requireLogin, requireAdmin, (req, res) => {
    const details = readDetails(req.body);
    const username = text(req.body.username, 40).toLowerCase();
    if (!/^[a-z0-9._-]{3,40}$/.test(username)) {
      throw new Problem(400, 'Username needs at least 3 characters: letters, numbers, dots, dashes or underscores');
    }
    if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(username)) {
      throw new Problem(409, 'That username is already taken');
    }
    const { hash, salt } = readPassword(req.body.password);
    const { lastInsertRowid } = db.prepare('INSERT INTO users (username, name, role, pass_hash, salt) VALUES (?, ?, ?, ?, ?)')
      .run(username, details.name, details.role, hash, salt);
    res.status(201).json(publicUser(lastInsertRowid));
  });

  app.put('/api/users/:id', requireLogin, requireAdmin, (req, res) => {
    const user = findUser(req.params.id);
    const { name, role } = readDetails(req.body);
    const active = req.body.active ? 1 : 0;

    if (user.role === 'admin' && user.active && (role !== 'admin' || !active)) {
      const admins = db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND active = 1").get().n;
      if (admins <= 1) throw new Problem(400, 'Keep at least one active admin, or nobody could approve bills');
    }

    db.prepare('UPDATE users SET name = ?, role = ?, active = ? WHERE id = ?').run(name, role, active, user.id);
    if (!active) endSessions(user.id);
    res.json(publicUser(user.id));
  });

  app.post('/api/users/:id/password', requireLogin, requireAdmin, (req, res) => {
    const user = findUser(req.params.id);
    const { hash, salt } = readPassword(req.body.newPassword);
    db.prepare('UPDATE users SET pass_hash = ?, salt = ? WHERE id = ?').run(hash, salt, user.id);
    endSessions(user.id);
    res.json({ ok: true });
  });
}

module.exports = { registerUserRoutes };
