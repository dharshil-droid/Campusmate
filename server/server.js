import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';

if (!process.env.JWT_SECRET) { console.error('JWT_SECRET is missing. Add it to server/.env'); process.exit(1); }
const app = express();
app.set('trust proxy', 1);
app.use(cors({ origin: process.env.CLIENT_URL || true }));
app.use(express.json({ limit: '50kb' }));

const str = (max, required = false) => ({ type: String, trim: true, maxlength: max, required });
const day = { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ };
const owner = { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true };
const model = (name, def) => mongoose.model(name, new mongoose.Schema(def, { timestamps: true }));

const subjectSchema = new mongoose.Schema({
  user: owner,
  name: str(60, true),
  attended: { type: Number, min: 0, default: 0 },
  conducted: { type: Number, min: 0, default: 0 },
  target: { type: Number, min: 1, max: 100, default: 75 },
}, { timestamps: true });
subjectSchema.pre('validate', function (next) {
  if (this.attended > this.conducted) this.invalidate('attended', 'Classes attended cannot exceed classes conducted');
  next();
});
const Subject = mongoose.model('Subject', subjectSchema);

const Assignment = model('Assignment', {
  user: owner, title: str(100, true), desc: str(300), subject: str(60),
  type: { type: String, enum: ['Assignment', 'Exam'], default: 'Assignment' },
  due: day,
  priority: { type: String, enum: ['High', 'Medium', 'Low'], default: 'Medium' },
  done: { type: Boolean, default: false },
});
const Task = model('Task', {
  user: owner, title: str(100, true), subject: str(60), date: day, done: { type: Boolean, default: false },
});

const wrap = fn => (req, res) => fn(req, res).catch(e => {
  const bad = ['ValidationError', 'CastError'].includes(e.name);
  if (!bad) console.error(e);
  res.status(bad ? 400 : 500).json({ error: bad ? e.message : 'Server error' });
});

const User = model('User', {
  name: str(60, true),
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, match: /^\S+@\S+\.\S+$/ },
  passwordHash: { type: String, required: true },
});
const sign = u => jwt.sign({ id: u._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
const pub = u => ({ id: u._id, name: u.name, email: u.email });
const clean = v => String(v ?? '').toLowerCase().trim();

app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, max: 60, standardHeaders: true, legacyHeaders: false }));
app.post('/api/auth/register', wrap(async (q, s) => {
  const { name, email, password } = q.body;
  if (typeof password !== 'string' || password.length < 8) return s.status(400).json({ error: 'Password must be at least 8 characters' });
  if (await User.exists({ email: clean(email) })) return s.status(409).json({ error: 'An account with this email already exists' });
  const u = await User.create({ name, email, passwordHash: await bcrypt.hash(password, 10) });
  s.status(201).json({ token: sign(u), user: pub(u) });
}));
app.post('/api/auth/login', wrap(async (q, s) => {
  const u = await User.findOne({ email: clean(q.body.email) });
  if (!u || !(await bcrypt.compare(String(q.body.password ?? ''), u.passwordHash))) return s.status(401).json({ error: 'Incorrect email or password' });
  s.json({ token: sign(u), user: pub(u) });
}));

const auth = (q, s, next) => {
  try {
    q.uid = jwt.verify((q.headers.authorization || '').replace('Bearer ', ''), process.env.JWT_SECRET).id;
    next();
  } catch {
    s.status(401).json({ error: 'Please log in again' });
  }
};
app.get('/api/auth/me', auth, wrap(async (q, s) => {
  const u = await User.findById(q.uid);
  if (!u) return s.status(401).json({ error: 'Please log in again' });
  s.json({ user: pub(u) });
}));

function crud(path, Model) {
  const r = express.Router();
  r.use(auth);
  r.get('/', wrap(async (q, s) => s.json(await Model.find({ user: q.uid }).sort({ createdAt: 1 }))));
  r.post('/', wrap(async (q, s) => s.status(201).json(await Model.create({ ...q.body, _id: undefined, user: q.uid }))));
  r.patch('/:id', wrap(async (q, s) => {
    const d = await Model.findOne({ _id: q.params.id, user: q.uid });
    if (!d) return s.status(404).json({ error: 'Not found' });
    delete q.body._id; delete q.body.user;
    d.set(q.body);
    await d.save();
    s.json(d);
  }));
  r.delete('/:id', wrap(async (q, s) => { await Model.findOneAndDelete({ _id: q.params.id, user: q.uid }); s.status(204).end(); }));
  app.use('/api/' + path, r);
}
crud('subjects', Subject);
crud('assignments', Assignment);
crud('tasks', Task);
app.get('/api/health', (_q, s) => s.json({ ok: true }));

const port = process.env.PORT || 5000;
mongoose.connect(process.env.MONGODB_URI)
  .then(() => app.listen(port, () => console.log(`CampusMate API running on port ${port}`)))
  .catch(e => { console.error('MongoDB connection failed:', e.message); process.exit(1); });
