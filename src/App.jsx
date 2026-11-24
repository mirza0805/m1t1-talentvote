
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


function getDisplayImageUrl(rawUrl) {
  if (!rawUrl) return ''
  try {
    const url = new URL(rawUrl.trim())
    if (!['http:', 'https:'].includes(url.protocol)) return ''
    const host = url.hostname.toLowerCase()
    if (host.endsWith('.supabase.co') && url.pathname.startsWith('/storage/v1/object/public/')) return url.toString()

    // Convert common share links into image-friendly URLs.
    if (host === 'drive.google.com' || host === 'docs.google.com') {
      const match = url.pathname.match(/\/file\/d\/([^/]+)/) || url.searchParams.get('id')?.match(/^(.+)$/)
      const fileId = Array.isArray(match) ? match[1] : match
      if (fileId) return `https://drive.google.com/uc?export=view&id=${encodeURIComponent(fileId)}`
    }
    if (host === 'dropbox.com' || host.endsWith('.dropbox.com')) {
      url.searchParams.set('raw', '1')
      return url.toString()
    }
    if (host === 'photos.app.goo.gl' || host === 'photos.google.com') {
      return url.toString()
    }

    // Proxy public image URLs so common hosts with restrictive hotlink rules can display.
    return `https://images.weserv.nl/?url=${encodeURIComponent(url.toString())}`
  } catch {
    return ''
  }
}

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
  const [voterEmail, setVoterEmail] = useState(() => localStorage.getItem('talentvote_pending_email') || '')
  const [voterOtp, setVoterOtp] = useState('')
  const [otpSent, setOtpSent] = useState(() => localStorage.getItem('talentvote_otp_sent') === 'true')
  const [hasVoted, setHasVoted] = useState(false)
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
  const [participantImageFile, setParticipantImageFile] = useState(null)
  const [imagePreviewUrl, setImagePreviewUrl] = useState('')
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

    // Refresh competition status less frequently for all visitors.
    // Refresh vote totals only while the Results or Admin tab is visible.
    const competitionTimer = window.setInterval(() => {
      if (document.visibilityState === 'visible') loadCompetitions()
    }, 30000)

    const dataTimer = window.setInterval(() => {
      if (
        document.visibilityState === 'visible' &&
        (tab === 'results' || (tab === 'admin' && isAdmin))
      ) {
        loadData()
      }
    }, 15000)

    return () => {
      window.clearInterval(competitionTimer)
      window.clearInterval(dataTimer)
    }
  }, [loadData, loadCompetitions, tab, isAdmin])


  useEffect(() => {
    if (!participantImageFile) {
      setImagePreviewUrl('')
      return
    }
    const preview = URL.createObjectURL(participantImageFile)
    setImagePreviewUrl(preview)
    return () => URL.revokeObjectURL(preview)
  }, [participantImageFile])

  useEffect(() => {
    setEditedCompetitionName(competition?.name || '')
    setVoteAgainStep(0)
  }, [selected, competition?.name])

  useEffect(() => {
    let active = true
    async function checkVote() {
      if (!selected || !user) {
        if (active) {
          setHasVoted(false)
          setVoteReceipt(false)
        }
        return
      }
      const { data, error } = await supabase.rpc('has_voted', {
        p_competition_id: selected,
        p_device_key: getDeviceKey()
      })
      if (!active) return
      if (error) {
        notify('Could not check your voting status: ' + error.message)
        return
      }
      setHasVoted(!!data)
      setVoteReceipt(!!data)
    }
    checkVote()
    return () => { active = false }
  }, [selected, user])

  async function signInWithGoogle() {
    setLoading(true)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: 'https://m1t1-talentvote.pages.dev' }
    })
    if (error) {
      setLoading(false)
      return notify('Google sign-in is not available yet: ' + error.message)
    }
  }

  async function sendVoterOtp(e) {
    e.preventDefault()
    const normalizedEmail = voterEmail.trim().toLowerCase()
    if (!normalizedEmail) return notify('Please enter your email address.')
    setLoading(true)
    setMessage('')
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: normalizedEmail,
        options: { shouldCreateUser: true }
      })
      if (error) {
        notify('Could not send verification code: ' + error.message)
        return
      }
      localStorage.setItem('talentvote_pending_email', normalizedEmail)
      localStorage.setItem('talentvote_otp_sent', 'true')
      setVoterEmail(normalizedEmail)
      setOtpSent(true)
      notify('Verification code sent. Check your Inbox and Spam folder.')
    } catch (error) {
      notify('Could not send verification code. Please check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  async function verifyVoterOtp(e) {
    e.preventDefault()
    if (!/^\d{6}$/.test(voterOtp.trim())) return notify('Please enter the 6-digit verification code.')
    setLoading(true)
    setMessage('')
    try {
      const { error } = await supabase.auth.verifyOtp({
        email: voterEmail.trim().toLowerCase(),
        token: voterOtp.trim(),
        type: 'email'
      })
      if (error) {
        notify('Verification failed: ' + error.message)
        return
      }
      localStorage.removeItem('talentvote_pending_email')
      localStorage.removeItem('talentvote_otp_sent')
      setVoterOtp('')
      setOtpSent(false)
      notify('Email verified. You can now vote.')
    } catch (error) {
      notify('Verification failed. Please check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  async function logout() {
    await supabase.auth.signOut()
    setUser(null)
    setIsAdmin(false)
    setHasVoted(false)
    setVoteReceipt(false)
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
    if (participantImageFile) {
      const allowedTypes = ['image/jpeg', 'image/png', 'image/webp']
      if (!allowedTypes.includes(participantImageFile.type)) return notify('Please choose a JPG, PNG or WEBP image.')
      if (participantImageFile.size > 5 * 1024 * 1024) return notify('Image must be 5 MB or smaller.')
    }
    if (!participantImageFile && imageUrl.trim() && imagePreviewError) {
      return notify('Please use a valid, publicly accessible image URL before adding this participant.')
    }

    setLoading(true)
    let finalImageUrl = imageUrl.trim() || null
    let uploadedPath = null
    if (participantImageFile) {
      const extension = participantImageFile.type === 'image/jpeg' ? 'jpg' : participantImageFile.type === 'image/png' ? 'png' : 'webp'
      uploadedPath = `${selected}/${crypto.randomUUID()}.${extension}`
      const { error: uploadError } = await supabase.storage
        .from('participant-images')
        .upload(uploadedPath, participantImageFile, {
          cacheControl: '3600',
          contentType: participantImageFile.type,
          upsert: false
        })
      if (uploadError) {
        setLoading(false)
        return notify('Image upload failed: ' + uploadError.message)
      }
      const { data: publicData } = supabase.storage.from('participant-images').getPublicUrl(uploadedPath)
      finalImageUrl = publicData.publicUrl
    }

    const { error } = await supabase.from('participants').insert({
      competition_id: selected,
      name: newParticipant.trim(),
      image_url: finalImageUrl
    })
    if (error) {
      if (uploadedPath) await supabase.storage.from('participant-images').remove([uploadedPath])
      setLoading(false)
      return notify('Could not add participant: ' + error.message)
    }
    setNewParticipant('')
    setImageUrl('')
    setParticipantImageFile(null)
    setImagePreviewError(false)
    setLoading(false)
    await loadData()
    notify('Participant and image added successfully')
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
    if (!user) return notify('Please sign in with your email before voting.')
    if (!selected || competition?.status !== 'open') {
      return notify('Voting is not open right now.')
    }
    const confirmed = window.confirm('Confirm your vote? Once submitted, your vote cannot be cancelled or changed.')
    if (!confirmed) return
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
    setHasVoted(true)
    setVoteReceipt(true)
    setVoteAgainStep(0)
    // Avoid an extra participants + totals read for every successful vote.
    // Results are refreshed when the Results tab is opened or its timer runs.
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
          <div className="logo"><img src="/talentvote-logo.svg" alt="M1T1 TalentVote trophy logo" /></div>
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
            <div><Vote /><strong>{isAdmin || competition?.status === 'closed' ? totalVotes : '—'}</strong><small>{isAdmin || competition?.status === 'closed' ? 'Total votes' : 'Votes hidden'}</small></div>
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
            {isAdmin && competition && (
              <button className="edit-next-to-name" onClick={() => { setTab('admin'); setShowAdminLogin(true) }}>
                <Pencil size={13} /> EDIT COMPETITION
              </button>
            )}
          </section>
        )}

        <nav>
          <button className={tab === 'home' ? 'active' : ''} onClick={() => setTab('home')}>Overview</button>
          <button className={tab === 'vote' ? 'active' : ''} onClick={() => setTab('vote')}>Vote</button>
          {(isAdmin || competition?.status === 'closed') && (
            <button className={tab === 'results' ? 'active' : ''} onClick={() => setTab('results')}>Results</button>
          )}
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

            {!user && (
              <div className="email-login">
                <h3>LOGIN WITH GOOGLE</h3>
                <p>Use your Google account to verify your identity and vote. Please sign in before voting starts for a smoother event.</p>
                <button className="primary form-button" disabled={loading} onClick={signInWithGoogle}>
                  {loading ? 'CONNECTING...' : 'CONTINUE WITH GOOGLE'}
                </button>
              </div>
            )}
            {user && !isAdmin && (
              <div className="voter-session">
                <p>Signed in as <strong>{user.email}</strong></p>
                <button className="secondary form-button" onClick={logout}>LOG OUT</button>
              </div>
            )}

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
                {p.image_url ? <img src={getDisplayImageUrl(p.image_url)} alt={p.name} /> :
                  <div className="avatar">{p.name.charAt(0).toUpperCase()}</div>}
                <div className="person"><strong>{p.name}</strong><small>CONTESTANT #{index + 1}</small></div>
                <button className="primary vote-button"
                  disabled={loading || competition?.status !== 'open' || !user || hasVoted}
                  onClick={() => castVote(p.id)}>VOTE</button>
              </div>
            ))}
          </section>
        )}

        {tab === 'results' && (isAdmin || competition?.status === 'closed') && (
          <section className="panel">
            <h2><Trophy /> Final Results</h2>
            <p>Official results are available because voting has closed.</p>
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
              <div className="email-login">
                <p>Organizer access is restricted to the approved Google admin account.</p>
                <button className="primary form-button" disabled={loading} onClick={signInWithGoogle}>
                  {loading ? 'CONNECTING...' : 'SIGN IN WITH GOOGLE'}
                </button>
              </div>
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
                          {p.image_url ? <img src={getDisplayImageUrl(p.image_url)} alt="" /> : <div className="avatar">{p.name.charAt(0).toUpperCase()}</div>}
                          <div><strong>#{i + 1} {p.name}</strong><small>{p.image_url ? 'Image added' : 'No image'}</small></div>
                        </div>
                      ))}
                    </div>

                    <h3>Add Participant</h3>
                    <form onSubmit={addParticipant}>
                      <input placeholder="Participant name" value={newParticipant}
                        onChange={e => setNewParticipant(e.target.value)} required />
                      <label htmlFor="participant-image-file">UPLOAD PARTICIPANT PHOTO</label>
                      <input id="participant-image-file" type="file" accept="image/jpeg,image/png,image/webp"
                        onChange={e => { setParticipantImageFile(e.target.files?.[0] || null); setImageUrl(''); setImagePreviewError(false) }} />
                      <small className="upload-hint">Choose JPG, PNG or WEBP. Maximum 5 MB. You can upload directly from your phone gallery.</small>
                      {!participantImageFile && <input type="url" placeholder="Or paste a public image URL (optional)" value={imageUrl}
                        onChange={e => { setImageUrl(e.target.value); setImagePreviewError(false) }} />}
                      {(imagePreviewUrl || (imageUrl.trim() && !imagePreviewError)) && (
                        <div className="image-preview">
                          <img src={imagePreviewUrl || getDisplayImageUrl(imageUrl)} alt="Participant image preview"
                            onError={() => setImagePreviewError(true)} />
                          <small>IMAGE PREVIEW — this is how voters will see the photo</small>
                        </div>
                      )}
                      {imagePreviewError && <p className="image-error">Image could not be loaded. Please choose another image or check the public URL.</p>}
                      <button className="primary form-button" disabled={loading}><Plus size={14} /> {loading ? 'UPLOADING...' : 'ADD PARTICIPANT'}</button>
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
