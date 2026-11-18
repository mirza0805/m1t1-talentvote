
import React, { useEffect, useState, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'
import {
  Trophy, Users, Vote, Plus, LogOut, Lock,
  BarChart3, RefreshCw, CheckCircle, XCircle
} from 'lucide-react'
import './style.css'

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
)

function getDeviceKey() {
  let key = localStorage.getItem('talentvote_device')
  if (!key) {
    key = crypto.randomUUID()
    localStorage.setItem('talentvote_device', key)
  }
  return key
}

export default function App() {
  const [tab, setTab] = useState('home')
  const [user, setUser] = useState(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [competitions, setCompetitions] = useState([])
  const [selected, setSelected] = useState('')
  const [participants, setParticipants] = useState([])
  const [totals, setTotals] = useState({})
  const [newCompetition, setNewCompetition] = useState('')
  const [newParticipant, setNewParticipant] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  const competition = competitions.find(c => c.id === selected)
  const totalVotes = Object.values(totals).reduce((a, b) => a + b, 0)

  const notify = (text) => {
    setMessage(text)
    setTimeout(() => setMessage(''), 4000)
  }

  const checkAdmin = useCallback(async (currentUser) => {
    if (!currentUser) {
      setIsAdmin(false)
      return
    }

    const { data } = await supabase
      .from('admins')
      .select('user_id')
      .eq('user_id', currentUser.id)
      .maybeSingle()

    setIsAdmin(!!data)
  }, [])

  const loadCompetitions = useCallback(async () => {
    const { data, error } = await supabase
      .from('competitions')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) return notify(error.message)

    setCompetitions(data || [])

    if (!selected && data?.length) {
      setSelected(data[0].id)
    }
  }, [selected])

  const loadData = useCallback(async () => {
    if (!selected) return

    const { data: people, error } = await supabase
      .from('participants')
      .select('*')
      .eq('competition_id', selected)
      .order('created_at')

    if (error) return notify(error.message)

    setParticipants(people || [])

    const { data: votes, error: voteError } = await supabase
      .rpc('get_vote_totals', {
        p_competition_id: selected
      })

    if (voteError) return notify(voteError.message)

    const result = {}
    ;(votes || []).forEach(v => {
      result[v.participant_id] = Number(v.total_votes)
    })

    setTotals(result)
  }, [selected])

  useEffect(() => {
    let mounted = true

    async function initialize() {
      const { data } = await supabase.auth.getSession()
      if (!mounted) return

      const currentUser = data.session?.user || null
      setUser(currentUser)
      await checkAdmin(currentUser)
      await loadCompetitions()
    }

    initialize()

    const { data: listener } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        const currentUser = session?.user || null
        setUser(currentUser)
        await checkAdmin(currentUser)
      }
    )

    return () => {
      mounted = false
      listener.subscription.unsubscribe()
    }
  }, [checkAdmin, loadCompetitions])

  useEffect(() => {
    loadData()

    const timer = setInterval(() => {
      loadData()
      loadCompetitions()
    }, 5000)

    return () => clearInterval(timer)
  }, [loadData, loadCompetitions])

  async function login(e) {
    e.preventDefault()
    setLoading(true)

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password
    })

    setLoading(false)

    if (error) return notify(error.message)
    setPassword('')
    notify('Login berjaya')
  }

  async function logout() {
    await supabase.auth.signOut()
    setUser(null)
    setIsAdmin(false)
    setTab('home')
    notify('Anda telah logout')
  }

  async function createCompetition(e) {
    e.preventDefault()
    if (!newCompetition.trim()) return

    const { data, error } = await supabase
      .from('competitions')
      .insert({
        name: newCompetition.trim(),
        status: 'draft'
      })
      .select()
      .single()

    if (error) return notify(error.message)

    setNewCompetition('')
    await loadCompetitions()
    setSelected(data.id)
    notify('Pertandingan berjaya dicipta')
  }

  async function addParticipant(e) {
    e.preventDefault()
    if (!newParticipant.trim() || !selected) return

    const { error } = await supabase
      .from('participants')
      .insert({
        competition_id: selected,
        name: newParticipant.trim(),
        image_url: imageUrl.trim() || null
      })

    if (error) return notify(error.message)

    setNewParticipant('')
    setImageUrl('')
    await loadData()
    notify('Peserta berjaya ditambah')
  }

  async function changeStatus(status) {
    if (!selected) return

    const { error } = await supabase
      .from('competitions')
      .update({ status })
      .eq('id', selected)

    if (error) return notify(error.message)

    await loadCompetitions()
    notify(status === 'open' ? 'Undian dibuka' : 'Undian ditutup')
  }

  async function castVote(participantId) {
    if (!selected || competition?.status !== 'open') {
      return notify('Undian belum dibuka atau telah ditutup')
    }

    setLoading(true)

    const { data, error } = await supabase.rpc('cast_vote', {
      p_competition_id: selected,
      p_participant_id: participantId,
      p_device_key: getDeviceKey()
    })

    setLoading(false)

    if (error) return notify(error.message)

    if (!data?.success) return notify(data?.message || 'Undian gagal')

    notify('Undian anda berjaya direkodkan!')
    await loadData()
  }

  return (
    <div className="app">
      <header>
        <div className="brand">
          <div className="logo"><Trophy /></div>
          <div>
            <h1>TalentVote</h1>
            <p>M1T1 • TALENT SHOW</p>
          </div>
        </div>
        <span className="live">● ONLINE</span>
      </header>

      <main>
        <section className="hero">
          <span className="eyebrow">WELCOME TO</span>
          <h2>{competition?.name || 'M1T1 Talent Show'}</h2>
          <p>Celebrate talent. Cast your vote.</p>

          <div className="stats">
            <div><Users /><strong>{participants.length}</strong><small>Participants</small></div>
            <div><Vote /><strong>{totalVotes}</strong><small>Total votes</small></div>
            <div><Trophy /><strong>{competition?.status === 'open' ? 'LIVE' : '—'}</strong><small>Voting status</small></div>
          </div>
        </section>

        {message && (
          <div className="panel" role="status">{message}</div>
        )}

        {competitions.length > 0 && (
          <section className="panel">
            <label>Select competition</label>
            <select
              value={selected}
              onChange={e => setSelected(e.target.value)}
              style={{
                width: '100%',
                padding: 12,
                marginTop: 10,
                borderRadius: 10,
                background: '#0c1324',
                color: 'white'
              }}
            >
              {competitions.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </section>
        )}

        <nav>
          <button className={tab === 'home' ? 'active' : ''} onClick={() => setTab('home')}>Overview</button>
          <button className={tab === 'vote' ? 'active' : ''} onClick={() => setTab('vote')}>Vote</button>
          <button className={tab === 'results' ? 'active' : ''} onClick={() => setTab('results')}>Results</button>
          <button className={tab === 'admin' ? 'active' : ''} onClick={() => setTab('admin')}>Admin</button>
        </nav>

        {tab === 'home' && (
          <section className="panel">
            <h2><BarChart3 /> Competition Overview</h2>
            <p>Welcome to M1T1 TalentVote. Support your favourite performance!</p>
            <p style={{ marginTop: 15 }}>
              Status: <strong>{competition?.status?.toUpperCase() || 'NO COMPETITION'}</strong>
            </p>
            <button className="primary" onClick={() => setTab('vote')}>
              Vote Now →
            </button>
          </section>
        )}

        {tab === 'vote' && (
          <section className="panel">
            <h2><Vote /> Choose Your Favourite</h2>
            {!competition && <p>Create a competition first.</p>}
            {competition?.status !== 'open' && (
              <p>Voting is currently not open.</p>
            )}

            {participants.map((p, index) => (
              <div className="participant" key={p.id}>
                {p.image_url ? (
                  <img
                    src={p.image_url}
                    alt={p.name}
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 12,
                      objectFit: 'cover'
                    }}
                  />
                ) : (
                  <div className="avatar">
                    {p.name.charAt(0).toUpperCase()}
                  </div>
                )}

                <div className="person">
                  <strong>{p.name}</strong>
                  <small>Contestant #{index + 1}</small>
                </div>

                <button
                  className="primary"
                  disabled={loading || competition?.status !== 'open'}
                  onClick={() => castVote(p.id)}
                >
                  Vote
                </button>
              </div>
            ))}
          </section>
        )}

        {tab === 'results' && (
          <section className="panel">
            <h2><Trophy /> Live Results</h2>
            <p>Results refresh automatically every 5 seconds.</p>

            {[...participants]
              .sort((a, b) => (totals[b.id] || 0) - (totals[a.id] || 0))
              .map((p, index) => (
                <div className="result" key={p.id}>
                  <strong>#{index + 1} {p.name}</strong>
                  <span>{totals[p.id] || 0} votes</span>
                </div>
              ))}

            <button className="primary" onClick={loadData}>
              <RefreshCw size={14} /> Refresh
            </button>
          </section>
        )}

        {tab === 'admin' && (
          <section className="panel">
            <h2><Lock /> Admin Panel</h2>

            {!user && (
              <form onSubmit={login}>
                <label>Admin email</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="admin@email.com"
                />

                <label>Password</label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Admin password"
                />

                <button className="primary" disabled={loading} style={{ marginTop: 15 }}>
                  Login
                </button>
              </form>
            )}

            {user && !isAdmin && (
              <div>
                <p>Akaun ini belum diberikan akses Admin.</p>
                <button className="primary" onClick={logout}>Logout</button>
              </div>
            )}

            {user && isAdmin && (
              <>
                <p>Logged in as: {user.email}</p>
                <button className="primary" onClick={logout}>
                  <LogOut size={14} /> Logout
                </button>

                <h3>Create competition</h3>
                <form onSubmit={createCompetition}>
                  <input
                    placeholder="Competition name"
                    value={newCompetition}
                    onChange={e => setNewCompetition(e.target.value)}
                    required
                  />
                  <button className="primary" style={{ marginTop: 10 }}>
                    <Plus size={14} /> Create
                  </button>
                </form>

                {competition && (
                  <>
                    <h3>Voting control</h3>
                    <p>Current status: {competition.status}</p>

                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      <button
                        className="primary"
                        onClick={() => changeStatus('open')}
                      >
                        <CheckCircle size={14} /> Open voting
                      </button>

                      <button
                        className="primary"
                        onClick={() => changeStatus('closed')}
                      >
                        <XCircle size={14} /> Close voting
                      </button>
                    </div>

                    <h3>Add participant</h3>
                    <form onSubmit={addParticipant}>
                      <input
                        placeholder="Participant name"
                        value={newParticipant}
                        onChange={e => setNewParticipant(e.target.value)}
                        required
                      />

                      <input
                        type="url"
                        placeholder="Image URL (optional)"
                        value={imageUrl}
                        onChange={e => setImageUrl(e.target.value)}
                      />

                      <button className="primary" style={{ marginTop: 10 }}>
                        <Plus size={14} /> Add participant
                      </button>
                    </form>
                  </>
                )}
              </>
            )}
          </section>
        )}
      </main>

      <footer>M1T1 TALENTVOTE • POWERED BY YOUR COMMUNITY</footer>
    </div>
  )
}
