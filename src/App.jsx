
import React, { useEffect, useState, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'
import {
  Trophy, Users, Vote, Plus, LogOut, Lock, BarChart3,
  RefreshCw, CheckCircle, XCircle, Trash2, Star, Pencil, Image as ImageIcon
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
  const [editedCompetitionName, setEditedCompetitionName] = useState('')
  const [showAdminLogin, setShowAdminLogin] = useState(false)
  const [imagePreviewError, setImagePreviewError] = useState(false)
  const [newParticipant, setNewParticipant] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [voteReceipt, setVoteReceipt] = useState(false)
  const [voteAgainStep, setVoteAgainStep] = useState(0)

  const competition = competitions.find(c => c.id === selected)
  const totalVotes = Object.values(totals).reduce((a, b) => a + b, 0)

  const notify = (text) => {
    setMessage(text)
    window.setTimeout(() => setMessage(''), 4500)
  }

  const checkAdmin = useCallback(async (currentUser) => {
    if (!currentUser) {
      setIsAdmin(false)
      return
    }
    const { data } = await supabase.from('admins').select('user_id')
      .eq('user_id', currentUser.id).maybeSingle()
    setIsAdmin(!!data)
  }, [])

  const loadCompetitions = useCallback(async () => {
    const { data, error } = await supabase.from('competitions').select('*')
      .order('created_at', { ascending: false })
    if (error) return notify(error.message)
    setCompetitions(data || [])
    if (!selected && data?.length) setSelected(data[0].id)
  }, [selected])

  const loadData = useCallback(async () => {
    if (!selected) {
      setParticipants([])
      setTotals({})
      return
    }
    const { data: people, error } = await supabase.from('participants').select('*')
      .eq('competition_id', selected).order('created_at')
    if (error) return notify(error.message)
    setParticipants(people || [])
    const { data: votes, error: voteError } = await supabase.rpc('get_vote_totals', {
      p_competition_id: selected
    })
    if (voteError) return notify(voteError.message)
    const result = {}
    ;(votes || []).forEach(v => { result[v.participant_id] = Number(v.total_votes) })
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
    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const currentUser = session?.user || null
      setUser(currentUser)
      await checkAdmin(currentUser)
    })
    return () => {
      mounted = false
      listener.subscription.unsubscribe()
    }
  }, [checkAdmin, loadCompetitions])

  useEffect(() => {
    loadData()
    const timer = window.setInterval(() => {
      loadData()
      loadCompetitions()
    }, 5000)
    return () => window.clearInterval(timer)
  }, [loadData, loadCompetitions])

  useEffect(() => {
    setEditedCompetitionName(competition?.name || '')
    setVoteReceipt(false)
    setVoteAgainStep(0)
  }, [selected])

  async function login(e) {
    e.preventDefault()
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (error) return notify(error.message)
    setPassword('')
    notify('Admin login successful')
  }

  async function logout() {
    await supabase.auth.signOut()
    setUser(null)
    setIsAdmin(false)
    setTab('home')
    notify('You have logged out')
  }

  async function createCompetition(e) {
    e.preventDefault()
    if (!newCompetition.trim()) return
    const { data, error } = await supabase.from('competitions')
      .insert({ name: newCompetition.trim(), status: 'draft' }).select().single()
    if (error) return notify(error.message)
    setNewCompetition('')
    await loadCompetitions()
    setSelected(data.id)
    notify('Competition created')
  }

  async function renameCompetition(e) {
    e.preventDefault()
    if (!selected || !editedCompetitionName.trim()) return
    const { error } = await supabase.from('competitions')
      .update({ name: editedCompetitionName.trim() }).eq('id', selected)
    if (error) return notify('Could not update competition: ' + error.message)
    await loadCompetitions()
    notify('Competition name updated')
  }

  async function addParticipant(e) {
    e.preventDefault()
    if (!newParticipant.trim() || !selected) return
    const { error } = await supabase.from('participants').insert({
      competition_id: selected,
      name: newParticipant.trim(),
      image_url: imageUrl.trim() || null
    })
    if (error) return notify(error.message)
    setNewParticipant('')
    setImageUrl('')
    await loadData()
    notify('Participant added')
  }

  async function changeStatus(status) {
    if (!selected) return
    const { error } = await supabase.from('competitions').update({ status }).eq('id', selected)
    if (error) return notify(error.message)
    await loadCompetitions()
    notify(status === 'open' ? 'Voting is now OPEN' : 'Voting is now CLOSED')
  }

  async function deleteCompetition() {
    if (!selected || !competition) return
    const confirmed = window.confirm(
      'Delete "' + competition.name + '" permanently? This may also remove its participants and votes. This action cannot be undone.'
    )
    if (!confirmed) return
    const { error } = await supabase.from('competitions').delete().eq('id', selected)
    if (error) return notify('Could not delete competition: ' + error.message)
    setSelected('')
    setVoteReceipt(false)
    await loadCompetitions()
    notify('Competition deleted')
  }

  async function castVote(participantId) {
    if (!selected || competition?.status !== 'open') {
      return notify('Voting is not open right now.')
    }
    const confirmed = window.confirm('Confirm your vote? Once submitted, your vote cannot be cancelled or changed.')
    if (!confirmed) return
    const localVoteKey = 'talentvote_voted_' + selected
    if (localStorage.getItem(localVoteKey)) {
      setVoteReceipt(true)
      return notify('This device has already voted in this competition.')
    }
    setLoading(true)
    const { data, error } = await supabase.rpc('cast_vote', {
      p_competition_id: selected,
      p_participant_id: participantId,
      p_device_key: getDeviceKey()
    })
    setLoading(false)
    if (error) return notify(error.message)
    if (!data?.success) {
      const serverMessage = data?.message || 'You have already voted in this competition.'
      setVoteReceipt(true)
      setVoteAgainStep(0)
      return notify(serverMessage)
    }
    localStorage.setItem(localVoteKey, '1')
    setVoteReceipt(true)
    setVoteAgainStep(0)
    await loadData()
  }

  function handleVoteAgain() {
    if (voteAgainStep === 0) {
      setVoteAgainStep(1)
    } else {
      setVoteAgainStep(2)
    }
  }

  return (
    <div className="app">
      <header>
        <div className="brand">
          <div className="logo"><img src="/talentvote-logo.png" alt="M1T1 TalentVote logo" /></div>
          <div><h1>M1T1 <span>TalentVote</span></h1><p>THE STAGE IS YOURS</p></div>
        </div>
        <span className="live">● ONLINE</span>
      </header>

      <main>
        <section className="hero">
          <span className="eyebrow">WELCOME TO M1T1</span>
          <h2>{competition?.name || 'M1T1 Talent Show'}</h2>
          <p>Celebrate talent. Cast your vote.</p>
          <div className="hero-rule" />
          <div className="stats">
            <div><Users /><strong>{participants.length}</strong><small>Participants</small></div>
            <div><Vote /><strong>{totalVotes}</strong><small>Total votes</small></div>
            <div><Trophy /><strong>{competition?.status === 'open' ? 'LIVE' : '—'}</strong><small>Voting status</small></div>
          </div>
        </section>

        {message && <div className="toast" role="status">{message}</div>}

        {competitions.length > 0 && (
          <section className="panel competition-picker">
            <label htmlFor="competition-select">SELECT COMPETITION</label>
            <select id="competition-select" value={selected}
              onChange={e => setSelected(e.target.value)}>
              {competitions.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </section>
        )}

        <nav>
          <button className={tab === 'home' ? 'active' : ''} onClick={() => setTab('home')}>Overview</button>
          <button className={tab === 'vote' ? 'active' : ''} onClick={() => setTab('vote')}>Vote</button>
          <button className={tab === 'results' ? 'active' : ''} onClick={() => setTab('results')}>Results</button>
        </nav>

        {tab === 'home' && (
          <section className="panel">
            <h2><BarChart3 /> Competition Overview</h2>
            <p>Welcome to M1T1 TalentVote. Support your favourite performance!</p>
            <p className="status-line">STATUS: <strong>{competition?.status?.toUpperCase() || 'NO COMPETITION'}</strong></p>
            <button className="primary" onClick={() => setTab('vote')}>VOTE NOW <span>→</span></button>
          </section>
        )}

        {tab === 'vote' && (
          <section className="panel">
            <h2><Vote /> Choose Your Favourite</h2>
            {!competition && <p>Create a competition first.</p>}
            {competition && competition.status !== 'open' && <p className="closed-note">Voting is currently not open.</p>}

            {voteReceipt && (
              <div className="thankyou">
                <div className="success-icon"><CheckCircle size={27} /></div>
                <h3>THANK YOU FOR VOTING!</h3>
                <p>Your vote has been recorded. It cannot be cancelled or changed.</p>
                <button className="vote-again" onClick={handleVoteAgain} disabled={voteAgainStep >= 2}>
                  VOTE AGAIN
                </button>
                {voteAgainStep === 1 && <p className="joke">HAHA YOU ONLY CAN VOTE 1 TIME ONLY</p>}
                {voteAgainStep === 2 && <p className="joke">LOL. TWICE!</p>}
              </div>
            )}

            {participants.map((p, index) => (
              <div className="participant" key={p.id}>
                {p.image_url ? <img src={p.image_url} alt={p.name} /> :
                  <div className="avatar">{p.name.charAt(0).toUpperCase()}</div>}
                <div className="person"><strong>{p.name}</strong><small>CONTESTANT #{index + 1}</small></div>
                <button className="primary vote-button"
                  disabled={loading || competition?.status !== 'open' || voteReceipt}
                  onClick={() => castVote(p.id)}>VOTE</button>
              </div>
            ))}
          </section>
        )}

        {tab === 'results' && (
          <section className="panel">
            <h2><Trophy /> Live Results</h2>
            <p>Results refresh automatically every 5 seconds.</p>
            {[...participants].sort((a, b) => (totals[b.id] || 0) - (totals[a.id] || 0))
              .map((p, index) => (
                <div className="result" key={p.id}>
                  <strong>#{index + 1} {p.name}</strong><span>{totals[p.id] || 0} votes</span>
                </div>
              ))}
            <button className="primary" onClick={loadData}><RefreshCw size={14} /> REFRESH</button>
          </section>
        )}

        {tab === 'admin' && (
          <section className="panel">
            <h2><Lock /> Admin Panel</h2>
            {!user && showAdminLogin && (
              <form onSubmit={login}>
                <label>ADMIN EMAIL</label>
                <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="admin@email.com" />
                <label>PASSWORD</label>
                <input type="password" required value={password} onChange={e => setPassword(e.target.value)} placeholder="Admin password" />
                <button className="primary form-button" disabled={loading}>LOGIN</button>
              </form>
            )}
            {!user && !showAdminLogin && <p>Organizer access only.</p>}
            {user && !isAdmin && <div><p>This account has not been granted Admin access.</p><button className="primary" onClick={logout}>LOGOUT</button></div>}
            {user && isAdmin && (
              <>
                <p className="admin-email">Logged in as: {user.email}</p>
                <button className="secondary" onClick={logout}><LogOut size={14} /> LOGOUT</button>

                {competition && (
                  <div className="edit-competition">
                    <div className="edit-title"><Pencil size={16} /><strong>EDIT SELECTED COMPETITION</strong></div>
                    <form onSubmit={renameCompetition} className="inline-edit">
                      <input aria-label="Competition name" value={editedCompetitionName}
                        onChange={e => setEditedCompetitionName(e.target.value)} required />
                      <button className="primary" type="submit">SAVE NAME</button>
                    </form>
                  </div>
                )}

                <h3>Create Competition</h3>
                <form onSubmit={createCompetition}>
                  <input placeholder="Competition name" value={newCompetition}
                    onChange={e => setNewCompetition(e.target.value)} required />
                  <button className="primary form-button"><Plus size={14} /> CREATE COMPETITION</button>
                </form>

                {competition && (
                  <>
                    <h3>Competition Management</h3>
                    <p className="status-line">CURRENT STATUS: <strong>{competition.status?.toUpperCase()}</strong></p>
                    <div className="admin-actions">
                      <button className="primary" onClick={() => changeStatus('open')}><CheckCircle size={14} /> OPEN VOTING</button>
                      <button className="secondary" onClick={() => changeStatus('closed')}><XCircle size={14} /> CLOSE VOTING</button>
                      <button className="danger" onClick={deleteCompetition}><Trash2 size={14} /> DELETE COMPETITION</button>
                    </div>

                    <h3>Participants in this Competition ({participants.length})</h3>
                    {participants.length === 0 && <p>No participants added yet.</p>}
                    <div className="admin-participants">
                      {participants.map((p, i) => (
                        <div className="admin-person" key={p.id}>
                          {p.image_url ? <img src={p.image_url} alt="" /> : <div className="avatar">{p.name.charAt(0).toUpperCase()}</div>}
                          <div><strong>#{i + 1} {p.name}</strong><small>{p.image_url ? 'Image added' : 'No image'}</small></div>
                        </div>
                      ))}
                    </div>

                    <h3>Add Participant</h3>
                    <form onSubmit={addParticipant}>
                      <input placeholder="Participant name" value={newParticipant}
                        onChange={e => setNewParticipant(e.target.value)} required />
                      <input type="url" placeholder="Image URL (optional)" value={imageUrl}
                        onChange={e => { setImageUrl(e.target.value); setImagePreviewError(false) }} />
                      {imageUrl.trim() && !imagePreviewError && (
                        <div className="image-preview">
                          <img src={imageUrl.trim()} alt="Participant image preview"
                            onError={() => setImagePreviewError(true)} />
                          <small>IMAGE PREVIEW — this is how voters will see the photo</small>
                        </div>
                      )}
                      {imagePreviewError && <p className="image-error">Image URL could not be loaded. Check that it is a direct, publicly accessible image link.</p>}
                      <button className="primary form-button"><Plus size={14} /> ADD PARTICIPANT</button>
                    </form>
                  </>
                )}
              </>
            )}
          </section>
        )}
      </main>
      <footer>M1T1 TALENTVOTE <span>•</span> THE STAGE IS YOURS
        <button className="organizer-link" onClick={() => { setTab('admin'); setShowAdminLogin(true) }}>ORGANIZER LOGIN</button>
      </footer>
    </div>
  )
}
