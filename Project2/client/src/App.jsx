import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';

const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api'
});

const inr = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
});

export default function App() {
    const [token, setToken] = useState('');
    const [user, setUser] = useState(null);
    const [workers, setWorkers] = useState([]);
    const [bookings, setBookings] = useState([]);
    const [mode, setMode] = useState('login');
    const [form, setForm] = useState({
        name: '',
        email: '',
        password: '',
        role: 'customer',
        serviceType: '',
        experienceYears: '0',
        hourlyRate: ''
    });
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');

    const authApi = useMemo(() => {
        if (!token) return api;
        return axios.create({
            baseURL: api.defaults.baseURL,
            headers: { Authorization: `Bearer ${token}` }
        });
    }, [token]);

    async function loadWorkers() {
        const response = await api.get('/workers');
        setWorkers(response.data);
    }

    async function loadBookings(client = authApi) {
        const response = await client.get('/bookings/mine');
        setBookings(response.data);
    }

    useEffect(() => {
        loadWorkers().catch(() => setError('Could not load workers. Is the API running?'));
    }, []);

    useEffect(() => {
        if (token && user?.role === 'customer') {
            loadBookings().catch(() => setError('Could not load your bookings.'));
        } else {
            setBookings([]);
        }
    }, [token, user]);

    function updateForm(event) {
        setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
    }

    async function submitAuth(event) {
        event.preventDefault();
        setError('');
        setMessage('');
        try {
            if (mode === 'register') {
                await api.post('/auth/register', {
                    ...form,
                    experienceYears: Number(form.experienceYears),
                    hourlyRate: Number(form.hourlyRate)
                });
                setMode('login');
                setMessage('Account created. Sign in to continue.');
                return;
            }
            const response = await api.post('/auth/login', {
                email: form.email,
                password: form.password
            });
            setToken(response.data.token);
            setUser(response.data.user);
            setMessage('You are signed in.');
        } catch (requestError) {
            setError(requestError.response?.data?.error || 'Request failed. Please try again.');
        }
    }

    async function bookWorker(worker) {
        if (!token || user?.role !== 'customer') {
            setError('Sign in as a customer to request a booking.');
            return;
        }
        const answer = window.prompt(`How many hours would you like to book ${worker.name}?`, '1');
        if (answer === null) return;
        const hours = Number(answer);
        if (!Number.isFinite(hours) || hours <= 0 || hours > 24) {
            setError('Enter a booking duration from 0 to 24 hours.');
            return;
        }

        setError('');
        setMessage('');
        try {
            const response = await authApi.post('/bookings', { workerId: worker.id, hours });
            setMessage(`Booking request created for ${inr.format(response.data.totalAmount)}.`);
            await loadBookings();
        } catch (requestError) {
            setError(requestError.response?.data?.error || 'Could not create the booking.');
        }
    }

    function signOut() {
        setToken('');
        setUser(null);
        setBookings([]);
        setMessage('You have signed out.');
    }

    return (
        <main className="page-shell">
            <header className="topbar">
                <a className="brand" href="/" aria-label="AtoZ home">
                    <span className="brand-mark">A</span>
                    <span>AtoZ<span className="brand-light">GigServices</span></span>
                </a>
                <span className="location-pill"><span className="live-dot" /> Telangana · India</span>
            </header>

            <section className="hero">
                <div className="hero-copy">
                    <p className="eyebrow">LOCAL SKILLS, ONE PLACE</p>
                    <h1>Get the right help.<br /><span>Right around the corner.</span></h1>
                    <p className="hero-description">Discover independent service professionals and request a booking with confidence.</p>
                    <div className="hero-note"><span className="note-icon">✳</span> Built for your neighborhood, starting in Telangana</div>
                </div>
                <div className="hero-art" aria-hidden="true">
                    <div className="sun" />
                    <div className="hill hill-back" />
                    <div className="hill hill-front" />
                    <div className="art-card"><span>✦</span><strong>Local talent.<br />Great work.</strong></div>
                    <span className="sparkle sparkle-one">✳</span>
                    <span className="sparkle sparkle-two">✳</span>
                </div>
            </section>

            <section className="content-grid">
                <div className="directory">
                    <div className="section-heading">
                        <div>
                            <p className="eyebrow">MEET YOUR NEIGHBORS</p>
                            <h2>Available professionals</h2>
                        </div>
                        <span className="count-pill">{workers.length} available</span>
                    </div>

                    {error && <p className="notice error" role="alert">{error}</p>}
                    {message && <p className="notice success" role="status">{message}</p>}

                    <div className="worker-grid">
                        {workers.map((worker, index) => (
                            <article className="worker-card" key={worker.id}>
                                <div className={`avatar avatar-${index % 4}`}>{worker.name.slice(0, 1).toUpperCase()}</div>
                                <div className="worker-info">
                                    <div className="worker-title">
                                        <div>
                                            <h3>{worker.name}</h3>
                                            <p>{worker.serviceType}</p>
                                        </div>
                                        <span className="verified" title="Listed professional">✓</span>
                                    </div>
                                    <div className="worker-meta">
                                        <span>✦ {worker.experienceYears} yrs experience</span>
                                        <span className="rate">{inr.format(worker.hourlyRate)}<small> / hr</small></span>
                                    </div>
                                    <button className="button button-outline" onClick={() => bookWorker(worker)}>
                                        Request booking <span aria-hidden="true">→</span>
                                    </button>
                                </div>
                            </article>
                        ))}
                        {!workers.length && <div className="empty-state">No professionals are listed yet. Add a worker account to get started.</div>}
                    </div>
                </div>

                <aside className="account-panel">
                    <div className="panel-heading">
                        <p className="eyebrow">{user ? 'YOUR ACCOUNT' : 'GET STARTED'}</p>
                        <h2>{user ? 'Welcome aboard' : mode === 'login' ? 'Good to see you' : 'Join the community'}</h2>
                        <p>{user ? 'Your account is ready to use.' : 'Sign in to request a service or create your account in a minute.'}</p>
                    </div>

                    {user ? (
                        <div className="signed-in">
                            <div className="signed-in-icon">✓</div>
                            <p>Signed in as <strong>{user.role}</strong></p>
                            {user.role === 'gigworker' && <p>Your profile is in the directory when available.</p>}
                            <button className="button button-dark" onClick={signOut}>Sign out</button>
                        </div>
                    ) : (
                        <>
                            <div className="mode-tabs">
                                <button className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>Sign in</button>
                                <button className={mode === 'register' ? 'active' : ''} onClick={() => setMode('register')}>Create account</button>
                            </div>
                            <form className="auth-form" onSubmit={submitAuth}>
                                {mode === 'register' && (
                                    <>
                                        <label>
                                            Full name
                                            <input name="name" autoComplete="name" required maxLength="100" value={form.name} onChange={updateForm} placeholder="Your name" />
                                        </label>
                                        <label>
                                            I want to
                                            <select name="role" value={form.role} onChange={updateForm}>
                                                <option value="customer">Find a service</option>
                                                <option value="gigworker">Offer a service</option>
                                            </select>
                                        </label>
                                        {form.role === 'gigworker' && (
                                            <>
                                                <label>
                                                    Service
                                                    <input name="serviceType" required maxLength="100" value={form.serviceType} onChange={updateForm} placeholder="e.g. Electrician" />
                                                </label>
                                                <div className="field-row">
                                                    <label>
                                                        Experience (years)
                                                        <input name="experienceYears" type="number" min="0" max="80" required value={form.experienceYears} onChange={updateForm} />
                                                    </label>
                                                    <label>
                                                        Hourly rate (₹)
                                                        <input name="hourlyRate" type="number" min="1" step="0.01" required value={form.hourlyRate} onChange={updateForm} placeholder="500" />
                                                    </label>
                                                </div>
                                            </>
                                        )}
                                    </>
                                )}
                                <label>
                                    Email address
                                    <input name="email" type="email" autoComplete="email" required value={form.email} onChange={updateForm} placeholder="you@example.com" />
                                </label>
                                <label>
                                    Password
                                    <input name="password" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength="8" required value={form.password} onChange={updateForm} placeholder="At least 8 characters" />
                                </label>
                                <button className="button button-dark" type="submit">
                                    {mode === 'login' ? 'Sign in' : 'Create account'} <span aria-hidden="true">→</span>
                                </button>
                            </form>
                            <p className="switch-mode">
                                {mode === 'login' ? 'New to AtoZ?' : 'Already have an account?'}
                                <button onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
                                    {mode === 'login' ? 'Create account' : 'Sign in'}
                                </button>
                            </p>
                        </>
                    )}

                    {user?.role === 'customer' && (
                        <div className="booking-list">
                            <h3>Your booking requests</h3>
                            {!bookings.length && <p>No bookings yet.</p>}
                            {bookings.map((booking) => (
                                <div className="booking-row" key={booking.id}>
                                    <span><strong>{booking.serviceType}</strong><small>{booking.workerName} · {booking.hours} hr</small></span>
                                    <span>{inr.format(booking.totalAmount)}<small>{booking.status}</small></span>
                                </div>
                            ))}
                        </div>
                    )}
                    <div className="secure-note"><span>⌑</span> Your account information stays private.</div>
                </aside>
            </section>

            <footer><span>© {new Date().getFullYear()} AtoZGigServices</span><span>Made for local communities <b>✳</b></span></footer>
        </main>
    );
}
