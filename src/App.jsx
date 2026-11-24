
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
  const [editingParticipantId, setEditingParticipantId] = useState(null)
  const [editingParticipantName, setEditingParticipantName] = useState('')
  const [editingParticipantImageFile, setEditingParticipantImageFile] = useState(null)
  const [editingParticipantImageUrl, setEditingParticipantImageUrl] = useState('')
  const [editingParticipantRemoveImage, setEditingParticipantRemoveImage] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [voteReceipt, setVoteReceipt] = useState(false)
  const [voteAgainStep, setVoteAgainStep] = useState(0)
  const [enlargedPhoto, setEnlargedPhoto] = useState(null)
  const [showMuslimPrompt, setShowMuslimPrompt] = useState(false)
  const [muslimPromptSeen, setMuslimPromptSeen] = useState(false)
  const [timelineDuration, setTimelineDuration] = useState(60)
  const [timelineBusy, setTimelineBusy] = useState(false)
  const [timelineProgress, setTimelineProgress] = useState(0)
  const [timelineVideoUrl, setTimelineVideoUrl] = useState('')

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
    if (!isAdmin) {
      setTotals({})
      return
    }
    const { data: votes, error: voteError } = await supabase.rpc('get_vote_totals', {
      p_competition_id: selected
    })
    if (voteError) return notify(voteError.message)
    const result = {}
    ;(votes || []).forEach(v => { result[v.participant_id] = Number(v.total_votes) })
    setTotals(result)
  }, [selected, isAdmin])

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
    return () => {
      if (timelineVideoUrl) URL.revokeObjectURL(timelineVideoUrl)
    }
  }, [timelineVideoUrl])

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

  function startEditingParticipant(person) {
    setEditingParticipantId(person.id)
    setEditingParticipantName(person.name || '')
    setEditingParticipantImageFile(null)
    setEditingParticipantImageUrl('')
    setEditingParticipantRemoveImage(false)
  }

  function cancelEditingParticipant() {
    setEditingParticipantId(null)
    setEditingParticipantName('')
    setEditingParticipantImageFile(null)
    setEditingParticipantImageUrl('')
    setEditingParticipantRemoveImage(false)
  }

  async function saveParticipantChanges(e, person) {
    e.preventDefault()
    if (!isAdmin || !person?.id || !editingParticipantName.trim()) {
      return notify('Please enter the participant name.')
    }
    const file = editingParticipantImageFile
    if (file) {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
        return notify('Please choose a JPG, PNG or WEBP image.')
      }
      if (file.size > 5 * 1024 * 1024) return notify('Image must be 5 MB or smaller.')
    }

    setLoading(true)
    let nextImageUrl = person.image_url || null
    let uploadedPath = null
    if (file) {
      const extension = file.type === 'image/jpeg' ? 'jpg' : file.type === 'image/png' ? 'png' : 'webp'
      uploadedPath = `${selected}/${crypto.randomUUID()}.${extension}`
      const { error: uploadError } = await supabase.storage
        .from('participant-images')
        .upload(uploadedPath, file, {
          cacheControl: '3600',
          contentType: file.type,
          upsert: false
        })
      if (uploadError) {
        setLoading(false)
        return notify('Image upload failed: ' + uploadError.message)
      }
      nextImageUrl = supabase.storage.from('participant-images').getPublicUrl(uploadedPath).data.publicUrl
    } else if (editingParticipantImageUrl.trim()) {
      nextImageUrl = editingParticipantImageUrl.trim()
    } else if (editingParticipantRemoveImage) {
      nextImageUrl = null
    }

    const { error } = await supabase.from('participants')
      .update({ name: editingParticipantName.trim(), image_url: nextImageUrl })
      .eq('id', person.id)
      .eq('competition_id', selected)
    if (error) {
      if (uploadedPath) await supabase.storage.from('participant-images').remove([uploadedPath])
      setLoading(false)
      return notify('Could not update participant: ' + error.message)
    }

    cancelEditingParticipant()
    setLoading(false)
    await loadData()
    notify('Participant details updated successfully.')
  }

  async function removeParticipant(person) {
    if (!isAdmin || !person?.id) return
    const confirmed = window.confirm(
      `Remove "${person.name}" from this competition? Participants with recorded votes cannot be removed, to protect the results.`
    )
    if (!confirmed) return
    setLoading(true)
    const { error } = await supabase.rpc('admin_delete_participant', {
      p_participant_id: person.id
    })
    setLoading(false)
    if (error) return notify(error.message)
    if (editingParticipantId === person.id) cancelEditingParticipant()
    await loadData()
    notify('Participant removed.')
  }

  async function changeStatus(status) {
    if (!selected) return
    const { error } = await supabase.from('competitions').update({ status }).eq('id', selected)
    if (error) return notify(error.message)
    await loadCompetitions()
    notify(status === 'open' ? 'Voting is now OPEN' : 'Voting is now CLOSED')
  }

  async function generateVoteTimelineVideo() {
    if (!isAdmin || !competition || competition.status !== 'closed') return notify('Only the organizer can generate a video after voting has closed.')
    if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) return notify('Video recording is not supported. Please use updated Chrome.')

    setTimelineBusy(true)
    setTimelineProgress(0)
    let audioContext
    let stream
    let recorder
    try {
      const { data: events, error } = await supabase.rpc('get_vote_timeline', { p_competition_id: selected })
      if (error) throw error
      if (!events?.length) throw new Error('There are no votes to include in this video.')
      const { data: officialTotals, error: totalsError } = await supabase.rpc('get_vote_totals', {
        p_competition_id: selected
      })
      if (totalsError) throw totalsError
      const officialTotal = (officialTotals || []).reduce((sum, row) => sum + Number(row.total_votes || 0), 0)
      if (officialTotal !== events.length) {
        throw new Error('Vote records and official totals do not match. Video generation stopped to protect result accuracy.')
      }

      const canvas = document.createElement('canvas')
      canvas.width = 1280
      canvas.height = 720
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Could not prepare the video canvas.')
      const supportedFormats = [
        { mime: 'video/mp4;codecs="avc1.42E01E,mp4a.40.2"', ext: 'mp4' },
        { mime: 'video/mp4', ext: 'mp4' },
        { mime: 'video/webm;codecs=vp9,opus', ext: 'webm' },
        { mime: 'video/webm;codecs=vp8,opus', ext: 'webm' },
        { mime: 'video/webm', ext: 'webm' }
      ]
      const selectedFormat = supportedFormats.find(format => MediaRecorder.isTypeSupported(format.mime))
      if (!selectedFormat) throw new Error('MP4/WebM recording is not supported. Please use updated Chrome.')
      const mimeType = selectedFormat.mime
      const fileExtension = selectedFormat.ext

      const people = participants.map(p => ({ id: p.id, name: p.name, image_url: p.image_url, image: null }))
      await Promise.all(people.map(person => new Promise(resolve => {
        if (!person.image_url) return resolve()
        const img = new Image()
        img.crossOrigin = 'anonymous'
        img.onload = () => { person.image = img; resolve() }
        img.onerror = () => resolve()
        img.src = person.image_url
      })))

      // Original suspense soundtrack is synthesized locally and embedded in the exported video.
      const AudioContextClass = window.AudioContext || window.webkitAudioContext
      if (!AudioContextClass) throw new Error('Audio recording is not supported in this browser.')
      audioContext = new AudioContextClass()
      await audioContext.resume()
      if (audioContext.state !== 'running') throw new Error('Please allow audio playback in your browser and try again.')
      const master = audioContext.createGain()
      const compressor = audioContext.createDynamicsCompressor()
      const audioDestination = audioContext.createMediaStreamDestination()
      master.gain.value = 0.88
      compressor.threshold.value = -18
      compressor.knee.value = 18
      compressor.ratio.value = 8
      compressor.attack.value = 0.004
      compressor.release.value = 0.18
      master.connect(compressor)
      compressor.connect(audioDestination)
      const playTone = (frequency, startAt, duration, type, volume) => {
        const oscillator = audioContext.createOscillator()
        const gain = audioContext.createGain()
        oscillator.type = type || 'sine'
        oscillator.frequency.setValueAtTime(frequency, startAt)
        gain.gain.setValueAtTime(0.0001, startAt)
        gain.gain.exponentialRampToValueAtTime(volume || 0.15, startAt + 0.025)
        gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration)
        oscillator.connect(gain)
        gain.connect(master)
        oscillator.start(startAt)
        oscillator.stop(startAt + duration + 0.04)
      }

      stream = canvas.captureStream(30)
      audioDestination.stream.getAudioTracks().forEach(track => stream.addTrack(track))
      recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 5200000 })
      const chunks = []
      const durationMs = Math.max(5, Number(timelineDuration)) * 1000
      const transitionStart = 0.82
      const podiumStart = 0.90
      const counts = {}
      const finalCounts = {}
      events.forEach(event => { finalCounts[event.participant_id] = (finalCounts[event.participant_id] || 0) + 1 })
      const eventTotal = Object.values(finalCounts).reduce((sum, value) => sum + value, 0)
      const officialByParticipant = {}
      ;(officialTotals || []).forEach(row => { officialByParticipant[row.participant_id] = Number(row.total_votes || 0) })
      if (eventTotal !== officialTotal || people.some(person => (finalCounts[person.id] || 0) !== (officialByParticipant[person.id] || 0))) {
        throw new Error('Participant vote totals do not match the official results. Video generation stopped.')
      }
      const finalOrder = people.map(person => ({ ...person, votes: finalCounts[person.id] || 0 }))
        .sort((a, b) => b.votes - a.votes || a.name.localeCompare(b.name))
      const championId = finalOrder[0]?.id
      // Re-stage the reveal order, never the vote records: every real vote appears once.
      // Non-winners are revealed earlier; the eventual winner's real votes build later,
      // creating a genuine low-count start and a gradual climb to the verified final total.
      const groupedEvents = new Map()
      events.forEach(event => {
        if (!groupedEvents.has(event.participant_id)) groupedEvents.set(event.participant_id, [])
        groupedEvents.get(event.participant_id).push(event)
      })
      const replayEvents = []
      groupedEvents.forEach((personEvents, participantId) => {
        personEvents.sort((a, b) => new Date(a.voted_at).getTime() - new Date(b.voted_at).getTime())
        const exponent = participantId === championId ? 0.42 : 1.25
        personEvents.forEach((event, index) => {
          event._replayAt = Math.pow((index + 1) / personEvents.length, exponent)
          replayEvents.push(event)
        })
      })
      replayEvents.sort((a, b) => a._replayAt - b._replayAt)
      let replayIndex = 0
      let nextBeatAt = 0
      let finalChordPlayed = false

      const roundedRect = (x, y, w, h, radius, fill) => {
        ctx.fillStyle = fill
        ctx.beginPath()
        ctx.roundRect(x, y, w, h, radius)
        ctx.fill()
      }
      const drawAvatar = (person, x, y, radius, ring) => {
        ctx.save()
        ctx.beginPath()
        ctx.arc(x, y, radius + 5, 0, Math.PI * 2)
        ctx.fillStyle = ring
        ctx.shadowColor = ring
        ctx.shadowBlur = 22
        ctx.fill()
        ctx.shadowBlur = 0
        ctx.beginPath()
        ctx.arc(x, y, radius, 0, Math.PI * 2)
        ctx.clip()
        if (person.image) {
          const img = person.image
          const scale = Math.max((radius * 2) / img.width, (radius * 2) / img.height)
          const iw = img.width * scale, ih = img.height * scale
          ctx.drawImage(img, x - iw / 2, y - ih / 2, iw, ih)
        } else {
          ctx.fillStyle = '#292052'
          ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2)
          ctx.fillStyle = '#ffffff'
          ctx.font = '800 48px Arial'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText(person.name.slice(0, 1).toUpperCase(), x, y)
        }
        ctx.restore()
      }
      const drawBackground = progress => {
        const bg = ctx.createLinearGradient(0, 0, 1280, 720)
        bg.addColorStop(0, '#08091d')
        bg.addColorStop(.52, '#1b1045')
        bg.addColorStop(1, '#071d3c')
        ctx.fillStyle = bg
        ctx.fillRect(0, 0, 1280, 720)
        const glow = ctx.createRadialGradient(1030, 130, 12, 1030, 130, 520)
        glow.addColorStop(0, 'rgba(0,220,255,' + (0.35 + Math.sin(progress * Math.PI * 18) * 0.16) + ')')
        glow.addColorStop(1, 'rgba(0,220,255,0)')
        ctx.fillStyle = glow
        ctx.fillRect(500, 0, 780, 560)
        for (let i = 0; i < 52; i++) {
          const x = (i * 197 + 73 + progress * (i % 4 + 1) * 95) % 1280
          const y = (i * 113 + 41 + progress * (i % 3 + 1) * 55) % 720
          ctx.fillStyle = i % 3 === 0 ? 'rgba(96,220,255,.55)' : 'rgba(210,155,255,.35)'
          ctx.beginPath()
          ctx.arc(x, y, i % 4 === 0 ? 2.5 : 1.4, 0, Math.PI * 2)
          ctx.fill()
        }
      }
      const getRanking = () => people.map(person => ({ ...person, votes: counts[person.id] || 0 }))
        .sort((a, b) => (b.votes - a.votes) ||
          (a.id === championId ? 1 : b.id === championId ? -1 : a.name.localeCompare(b.name)))
      const drawPodium = (ordered, progress) => {
        ctx.textAlign = 'center'
        ctx.fillStyle = '#ffe6a1'
        ctx.font = '800 18px Arial'
        ctx.fillText('THE MOMENT WE HAVE BEEN WAITING FOR', 640, 92)
        ctx.fillStyle = '#ffffff'
        ctx.font = '900 52px Arial'
        ctx.fillText('FINAL TOP 3', 640, 150)
        ctx.fillStyle = '#c9c6f2'
        ctx.font = '500 19px Arial'
        ctx.fillText(competition.name, 640, 184)
        const top = ordered.slice(0, 3)
        const positions = [
          { x: 640, y: 295, base: 435, height: 170, color: '#ffd65a', place: '1ST' },
          { x: 355, y: 350, base: 485, height: 120, color: '#c7d5ed', place: '2ND' },
          { x: 925, y: 370, base: 515, height: 90, color: '#d99562', place: '3RD' }
        ]
        positions.forEach((pos, index) => {
          const person = top[index]
          if (!person) return
          const rise = Math.min(1, Math.max(0, (progress - podiumStart) / 0.07))
          const y = pos.y + (1 - rise) * 65
          drawAvatar(person, pos.x, y, 58, pos.color)
          ctx.fillStyle = '#ffffff'
          ctx.font = '800 22px Arial'
          ctx.fillText(person.name.slice(0, 18), pos.x, y + 87)
          ctx.fillStyle = '#dcd8ff'
          ctx.font = '700 18px Arial'
          ctx.fillText(person.votes.toLocaleString() + ' VOTES', pos.x, y + 113)
          const baseY = pos.base + (1 - rise) * 65
          const grad = ctx.createLinearGradient(pos.x - 110, baseY, pos.x + 110, baseY + pos.height)
          grad.addColorStop(0, pos.color)
          grad.addColorStop(1, index === 0 ? '#a86bff' : '#423b70')
          roundedRect(pos.x - 112, baseY, 224, pos.height, 18, grad)
          ctx.fillStyle = '#10102d'
          ctx.font = '900 36px Arial'
          ctx.fillText(pos.place, pos.x, baseY + 53)
        })
        ctx.textAlign = 'left'
        ctx.fillStyle = '#ffffff'
        ctx.font = '700 17px Arial'
        ctx.fillText('TOTAL VOTES  •  ' + Object.values(counts).reduce((sum, value) => sum + value, 0).toLocaleString(), 72, 675)
      }
      const drawTransition = (ordered, progress, total) => {
        const t = Math.max(0, Math.min(1, (progress - transitionStart) / (podiumStart - transitionStart)))
        const ease = t * t * (3 - 2 * t)
        ctx.save()
        ctx.fillStyle = 'rgba(5, 4, 24, ' + (0.20 + ease * 0.48) + ')'
        ctx.fillRect(0, 0, 1280, 720)
        const pulse = 1 + Math.sin(t * Math.PI * 10) * 0.06
        const radius = 80 + ease * 420
        const cx = 640, cy = 350
        const burst = ctx.createRadialGradient(cx, cy, 8, cx, cy, radius)
        burst.addColorStop(0, 'rgba(255,225,150,' + (0.34 * (1 - t * 0.45)) + ')')
        burst.addColorStop(0.35, 'rgba(160,110,255,' + (0.22 * (1 - t * 0.3)) + ')')
        burst.addColorStop(1, 'rgba(20,220,255,0)')
        ctx.fillStyle = burst
        ctx.fillRect(0, 0, 1280, 720)
        for (let i = 0; i < 5; i++) {
          ctx.beginPath()
          ctx.arc(cx, cy, radius * (0.35 + i * 0.18) * pulse, 0, Math.PI * 2)
          ctx.strokeStyle = 'rgba(120,225,255,' + (0.55 - i * 0.08) * (1 - t * 0.35) + ')'
          ctx.lineWidth = 3 + (1 - t) * 4
          ctx.stroke()
        }
        ctx.save()
        ctx.translate(cx, cy)
        ctx.rotate((1 - t) * 0.20)
        ctx.scale(1 + ease * 0.22, 1 + ease * 0.22)
        ctx.textAlign = 'center'
        ctx.fillStyle = '#ffe7a6'
        ctx.font = '900 ' + Math.round(30 + ease * 20) + 'px Arial'
        ctx.shadowColor = '#ffb84d'
        ctx.shadowBlur = 30
        ctx.fillText('THE FINAL REVEAL', 0, -35)
        ctx.shadowBlur = 0
        ctx.fillStyle = '#ffffff'
        ctx.font = '900 58px Arial'
        ctx.fillText('TOP 3', 0, 38)
        ctx.restore()
        // Ranking bars sweep into the centre as the stage doors open.
        const top = ordered.slice(0, 3)
        top.forEach((person, index) => {
          const fromX = index === 0 ? 90 : index === 1 ? 640 : 1190
          const x = fromX + (640 - fromX) * ease
          const y = 500 + index * 48 + (index - 1) * (1 - ease) * 45
          ctx.globalAlpha = 1 - ease * 0.65
          roundedRect(x - 170, y, 340 * (1 - ease * 0.35), 12, 8, index === 0 ? '#ffd65a' : '#8b68ff')
          ctx.globalAlpha = 1
        })
        ctx.fillStyle = '#ffffff'
        ctx.font = '700 18px Arial'
        ctx.textAlign = 'center'
        ctx.fillText(total.toLocaleString() + ' VERIFIED VOTES', 640, 660)
        ctx.restore()
      }
      const drawFrame = progress => {
        drawBackground(progress)
        const ordered = getRanking()
        const total = Object.values(counts).reduce((sum, value) => sum + value, 0)
        if (progress >= podiumStart) {
          drawPodium(ordered, progress)
          return
        }
        if (progress >= transitionStart) {
          drawTransition(ordered, progress, total)
          return
        }
        const displayOrdered = ordered
        ctx.fillStyle = '#73eaff'
        ctx.font = '800 19px Arial'
        ctx.fillText('M1T1  •  TALENTVOTE', 72, 62)
        ctx.fillStyle = '#ffffff'
        ctx.font = '900 43px Arial'
        ctx.fillText(progress < 0.08 ? 'THE VOTE IS ON' : progress > 0.70 ? 'THE COMEBACK IS ON!' : 'LIVE VOTE TIMELINE', 72, 119)
        ctx.fillStyle = '#ff9bd5'
        ctx.font = '800 14px Arial'
        ctx.fillText('CINEMATIC COMEBACK REPLAY  •  DISPLAY ORDER IS DRAMATIZED', 74, 177)
        ctx.fillStyle = '#c9c6f2'
        ctx.font = '500 19px Arial'
        ctx.fillText(competition.name, 74, 154)
        const topThree = ordered.slice(0, 3)
        const gap = topThree.length > 1 ? Math.abs(topThree[0].votes - topThree[1].votes) : 0
        const closeRace = total > 0 && gap / Math.max(1, total) < 0.055
        if (progress > 0.72 && closeRace) {
          ctx.fillStyle = '#ff83bb'
          ctx.font = '900 22px Arial'
          ctx.fillText('⚡ THE TOP 3 ARE NECK AND NECK!', 74, 190)
        } else if (progress > 0.72) {
          ctx.fillStyle = '#ffe6a1'
          ctx.font = '800 19px Arial'
          ctx.fillText('THE FINAL COUNTDOWN', 74, 190)
        }
        const maxVotes = Math.max(1, ...ordered.map(p => p.votes))
        const rowTop = 235
        const rowGap = Math.min(67, 405 / Math.max(1, ordered.length))
        displayOrdered.forEach((person, index) => {
          const y = rowTop + index * rowGap
          const isTopThree = index < 3
          const ring = index === 0 ? '#ffd65a' : index === 1 ? '#c7d5ed' : index === 2 ? '#d99562' : '#8b68ff'
          if (isTopThree) drawAvatar(person, 112, y - 4, 25, ring)
          else {
            ctx.fillStyle = '#d5d1f5'
            ctx.font = '700 17px Arial'
            ctx.fillText((index + 1) + '.', 82, y + 5)
          }
          ctx.fillStyle = isTopThree ? '#ffffff' : '#d5d1f5'
          ctx.font = isTopThree ? '800 20px Arial' : '600 17px Arial'
          ctx.fillText((index + 1) + '. ' + person.name.slice(0, 22), isTopThree ? 160 : 115, y + 5)
          ctx.textAlign = 'right'
          ctx.fillStyle = '#ffffff'
          ctx.font = '800 20px Arial'
          ctx.fillText(person.votes.toLocaleString(), 1160, y + 5)
          ctx.textAlign = 'left'
          const barX = 410, barMax = 640, barY = y + 15
          const track = ctx.createLinearGradient(barX, 0, barX + barMax, 0)
          track.addColorStop(0, index === 0 ? '#ffcf56' : '#8b68ff')
          track.addColorStop(1, index === 0 ? '#ff7dba' : '#37d9ef')
          roundedRect(barX, barY, barMax, 14, 8, 'rgba(255,255,255,.12)')
          roundedRect(barX, barY, Math.max(3, (person.votes / maxVotes) * barMax), 14, 8, track)
        })
        ctx.fillStyle = '#c9c6f2'
        ctx.font = '600 17px Arial'
        ctx.fillText('TOTAL VOTES', 76, 664)
        ctx.fillStyle = '#ffffff'
        ctx.font = '900 31px Arial'
        ctx.fillText(total.toLocaleString(), 76, 699)
        ctx.fillStyle = 'rgba(255,255,255,.17)'
        ctx.fillRect(410, 665, 640, 8)
        const progressGradient = ctx.createLinearGradient(410, 0, 1050, 0)
        progressGradient.addColorStop(0, '#a879ff')
        progressGradient.addColorStop(1, '#46e7f2')
        ctx.fillStyle = progressGradient
        ctx.fillRect(410, 665, 640 * progress, 8)
        ctx.fillStyle = '#b9b5e7'
        ctx.font = '600 14px Arial'
        ctx.textAlign = 'right'
        ctx.fillText('VOTES ACCUMULATING', 1160, 699)
        ctx.textAlign = 'left'
      }

      const streamPromise = new Promise((resolve, reject) => {
        recorder.ondataavailable = event => { if (event.data && event.data.size) chunks.push(event.data) }
        recorder.onerror = () => reject(new Error('The browser could not record the video.'))
        recorder.onstop = () => resolve()
      })
      drawFrame(0)
      recorder.start(1000)
      const startedAt = performance.now()
      let lastReported = -1
      await new Promise(resolve => {
        const render = now => {
          const elapsed = Math.min(durationMs, now - startedAt)
          const progress = Math.min(1, elapsed / durationMs)
          const voteProgress = Math.min(1, progress / transitionStart)
          while (replayIndex < replayEvents.length && replayEvents[replayIndex]._replayAt <= voteProgress) {
            const event = replayEvents[replayIndex++]
            counts[event.participant_id] = (counts[event.participant_id] || 0) + 1
          }
          const ranking = getRanking()
          const gap = ranking.length > 1 ? Math.abs(ranking[0].votes - ranking[1].votes) : 0
          const total = Object.values(counts).reduce((sum, value) => sum + value, 0)
          const closeRace = total > 0 && gap / Math.max(1, total) < 0.055
          const audioNow = audioContext.currentTime
          if (progress < podiumStart && audioNow >= nextBeatAt) {
            const comeback = progress > 0.70 && progress < transitionStart
            const tense = (closeRace && progress > 0.55) || comeback
            // Audible repeating low pulse plus brighter rhythmic hit, mixed at a healthy level.
            playTone(comeback ? 110 : tense ? 82 : 64, audioNow, 0.34, 'sawtooth', comeback ? 0.32 : tense ? 0.28 : 0.24)
            playTone(comeback ? 220 : tense ? 164 : 128, audioNow + 0.025, 0.30, 'sine', comeback ? 0.24 : 0.18)
            playTone(comeback ? 880 : tense ? 660 : 440, audioNow + 0.055, 0.16, 'triangle', comeback ? 0.20 : 0.14)
            nextBeatAt = audioNow + (comeback ? 0.22 : tense ? 0.34 : 0.62)
          }
          if (progress >= transitionStart && !finalChordPlayed) {
            finalChordPlayed = true
            const at = audioContext.currentTime + 0.05
            ;[392, 523.25, 659.25, 783.99, 1046.5].forEach((hz, i) => playTone(hz, at + i * 0.16, 1.55, 'triangle', 0.24))
            playTone(98, at, 1.8, 'sine', 0.30)
          }
          drawFrame(progress)
          const percent = Math.floor(progress * 100)
          if (percent !== lastReported) {
            lastReported = percent
            setTimelineProgress(percent)
          }
          if (progress >= 1) resolve()
          else requestAnimationFrame(render)
        }
        requestAnimationFrame(render)
      })
      await new Promise(resolve => setTimeout(resolve, 1200))
      recorder.stop()
      await streamPromise
      stream.getTracks().forEach(track => track.stop())
      audioDestination.stream.getTracks().forEach(track => track.stop())
      await audioContext.close()
      audioContext = null

      const blob = new Blob(chunks, { type: mimeType })
      if (!blob.size) throw new Error('The video file was empty. Please try again.')
      const finalDisplayedTotal = Object.values(finalCounts).reduce((sum, value) => sum + value, 0)
      if (finalDisplayedTotal !== events.length || replayIndex !== events.length) {
        throw new Error('Vote count verification failed. Please regenerate the video; no results were changed.')
      }
      const videoUrl = URL.createObjectURL(blob)
      setTimelineVideoUrl(videoUrl)
      const link = document.createElement('a')
      link.href = videoUrl
      link.download = 'M1T1-TalentVote-Thriller-Timeline.' + fileExtension
      document.body.appendChild(link)
      link.click()
      link.remove()
      notify(fileExtension === 'mp4'
        ? 'MP4 thriller comeback video generated and downloaded.'
        : 'This browser cannot record MP4 directly, so a WebM video was generated instead. Try another updated browser for MP4.')
    } catch (error) {
      if (recorder && recorder.state !== 'inactive') recorder.stop()
      if (stream) stream.getTracks().forEach(track => track.stop())
      if (audioContext && audioContext.state !== 'closed') await audioContext.close()
      notify(error.message || 'Could not generate the timeline video.')
    } finally {
      setTimelineBusy(false)
    }
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

  const voteAgainJokes = [
    'Nice try! Your vote is already safely recorded 😄',
    'The voting box says: one vote only! 📦',
    'Are you sure? The button is getting nervous.',
    'Still here? Your dedication is impressive 😂',
    'The system checked twice. Still one vote!',
    'Even the trophy is asking you to stop 🏆',
    'Your finger is working harder than the contestants!',
    'Plot twist: clicking does not add another vote.',
    'The vote counter is not fooled. Nice try!',
    'Almost there... the button needs a holiday.',
    'One more? The button is starting to sweat...',
    'STRESS? CLICK HERE'
  ]

  function handleVoteAgain() {
    setVoteAgainStep(current => Math.min(current + 1, 12 + extendedVoteJokes.length))
  }

  const extendedVoteJokes = [
  "Why did the computer go to the doctor? It caught a virus.",
  "Why was the maths book sad? It had too many problems.",
  "Why did the Wi-Fi break up with the router? The connection was weak.",
  "Why did the phone wear glasses? It lost its contacts.",
  "Why was the calculator so confident? It knew it could count on itself.",
  "Why did the keyboard win an award? It had all the right keys.",
  "Why was the clock always calm? It knew how to take its time.",
  "Why did the printer get annoyed? Everyone kept pushing its buttons.",
  "Why did the cloud bring an umbrella? It heard there might be a forecast.",
  "Why did the bread go to school? It wanted to be a little smarter.",
  "Why was the fan so popular? Everyone thought it was cool.",
  "Why did the shoes never get lost? They always followed the right steps.",
  "Why did the door get promoted? It was always open to new opportunities.",
  "Why did the ruler do well in class? It knew how to measure up.",
  "Why did the mirror get a good review? It reflected well on everyone.",
  "Why did the moon skip overtime? It only works night shifts.",
  "Why did the ice cube avoid arguments? It didn't want things to heat up.",
  "Why did the egg stay out of trouble? It didn't want to crack under pressure.",
  "Why was the tree good at maths? It knew its roots.",
  "Why was the history book tired? It had too many old stories.",
  "Why was the backpack strong? It carried everyone's problems.",
  "Why was the eraser so helpful? It always fixed mistakes.",
  "Why did the chair stay quiet? It preferred to sit this one out.",
  "Why was the table relaxed? It had everything under control.",
  "Why did the elevator get promoted? It was always moving up.",
  "Why did the map never panic? It always knew the way.",
  "Why did the umbrella get a medal? It stood up for people in the rain.",
  "Why did the fish avoid the internet? It was afraid of phishing.",
  "Why did the cat sit near the computer? It wanted to keep an eye on the mouse.",
  "Why did the bee get hired? It was always buzzing with ideas.",
  "Why did the turtle never rush? It believed in a slow and steady pace.",
  "Why did the octopus multitask so well? It had everything handled.",
  "Why did the bicycle fall over? It was two-tired.",
  "Why did the car love music? It had a great stereo.",
  "Why did the airplane feel confident? It had a solid flight plan.",
  "Why did the rocket arrive early? It wanted to make a quick launch.",
  "Why did the scientist bring a ladder? To reach a higher level.",
  "Why was the atom so friendly? It was positive about making bonds.",
  "Why did the magnet make friends easily? It was attractive.",
  "Why was gravity so serious? It always brought everyone down to earth.",
  "Why are stars so good at their jobs? They always shine.",
  "Why did the rainbow feel cheerful? It saw the bright side in every colour.",
  "Why did calculus need a break? It was reaching its limit.",
  "Why did the integral invite everyone? It liked bringing things together.",
  "Why was the graph so confident? It knew where things were heading.",
  "Why did the fraction feel incomplete? It had not been simplified.",
  "Why is zero so important? It never lets anyone down.",
  "Why did the triangle stay calm? It had three points to make.",
  "Why did the circle avoid arguments? It didn't want any sharp corners.",
  "Why did physics students stay curious? They always wanted to know the force behind things.",
  "Why did chemistry students make good friends? They knew how to bond.",
  "Why did the biology book get popular? It had a lot of cell stories.",
  "Why did the engineer bring a pencil? To draw a better future.",
  "Why did the welder pay attention? A good connection matters.",
  "Why was the screw so dependable? It always held things together.",
  "Why was the sponge a good listener? It absorbed every detail.",
  "Why did the soap feel proud? It made a clean getaway.",
  "Why was the cup relaxed? It knew when to let things go.",
  "Why did the battery feel tired? It was running low.",
  "Why did the charger have so many friends? It gave everyone energy.",
  "Why was the app always busy? It kept getting updates.",
  "Why did the programmer smile? The bug finally left.",
  "Why was the robot polite? It was programmed to be nice.",
  "Why did the AI stay awake? It had too many tabs open.",
  "Why did the pencil get promoted? It had a point.",
  "Why did the notebook look confident? It had everything written down.",
  "Why did the orange stop rolling? It ran out of juice.",
  "Why did the cookie go to the doctor? It felt crumby.",
  "Why did the banana wear sunscreen? It didn't want to peel.",
  "Why did the tomato blush? It saw the salad dressing.",
  "Why did the coffee file a police report? It got mugged.",
  "Why did the tea call its friend? It needed a little support.",
  "Why did the sandwich go to the gym? To get better buns.",
  "Why did the computer get cold? It left its Windows open.",
  "Why did the smartphone need a holiday? It had too many apps to handle.",
  "Why did the camera get promoted? It focused on the details.",
  "Why did the calendar look nervous? Its days were numbered.",
  "Why did the music teacher need a ladder? To reach the high notes.",
  "Why did the piano get locked out? It lost its keys.",
  "Why did the football team bring string? To tie the score.",
  "Why did the goalkeeper bring a pencil? To draw the line.",
  "Why did the student eat their homework? The teacher said it was a piece of cake.",
  "Why did the student bring a ladder to school? They wanted to go to high school.",
  "Why did the exam paper look worried? It was under a lot of pressure.",
  "Why did the library stay quiet? It had too many bookworms.",
  "Why did the dictionary win the argument? It had the last word.",
  "Why did the broom get a promotion? It swept the competition.",
  "Why did the light bulb feel smart? It had a bright idea.",
  "Why did the ocean say hello? It waved.",
  "Why did the river keep moving? It was going with the flow.",
  "Why did the mountain never gossip? It kept everything rock solid.",
  "Why did the cloud get good grades? It was above average.",
  "Why did the clock get invited to every party? It always had the time.",
  "Why did the computer sing? It had a good motherboard.",
  "Why did the mouse bring a suitcase? It was going on a click trip.",
  "Why did the web developer go broke? They used up all their cache.",
  "Why did the website visit the doctor? It had a broken link.",
  "Why did the button feel famous? Everyone kept clicking with it.",
  "Why did the joke cross the road? To get to the punchline.",
  "Why did the trophy smile? It was having a winning day.",
  "Why did the vote button take a break? It was tired of being pressed.",
  "Why are you still clicking? The button is starting to think you're best friends. 😂"
]

  const muslimNoJokes = [
  "Alamak, butang NO pun terkejut. 😂",
  "Awak tekan NO, tapi soalan masih setia menunggu.",
  "NO diterima. Sistem sedang pura-pura kecewa.",
  "Kenapa komputer sejuk? Sebab banyak Windows. 🪟",
  "Kenapa buku matematik sedih? Banyak sangat masalah.",
  "Wi-Fi pergi terapi sebab hubungan asyik terputus.",
  "Kenapa telefon pakai cermin mata? Sebab hilang contacts.",
  "Saya nak buat lawak pasal elektrik, tapi takut mengejutkan.",
  "Kenapa kalkulator yakin? Semua jawapan ada dalam genggamannya.",
  "Keyboard masuk pertandingan sebab ada banyak keyakinan.",
  "Kenapa pensel tak bergaduh? Dia suka berdamai dan menggaris.",
  "Jam dinding selalu sibuk. Masa tak pernah menunggunya.",
  "Kenapa komputer suka muzik? Sebab ada banyak byte.",
  "Printer marah sebab semua orang asyik tekan dia.",
  "Kenapa awan tak pandai simpan rahsia? Semua benda dia luahkan sebagai hujan.",
  "Kenapa roti pergi sekolah? Nak jadi lebih berisi.",
  "Kenapa kipas popular? Semua orang suka dia bila panas.",
  "Kenapa lampu selalu jujur? Dia terang-terangan.",
  "Kenapa kasut tak pernah sesat? Dia ikut langkah.",
  "Kenapa nasi lemak tenang? Sebab hidupnya cukup lengkap.",
  "Kenapa sudu tak boleh menyimpan rahsia? Mulutnya selalu terbuka.",
  "Kenapa pintu pandai berkawan? Dia selalu terbuka.",
  "Kenapa pembaris disiplin? Dia tahu batas.",
  "Kenapa cermin tak menipu? Dia pantulkan keadaan sebenar.",
  "Kenapa bulan tak buat kerja lebih masa? Dia cuma kerja syif malam.",
  "Kenapa kipas tak pandai berlari? Dia cuma berpusing di tempat sama.",
  "Kenapa ais tak suka drama? Dia cepat cair.",
  "Kenapa telur tak suka bergaduh? Takut retak hubungan.",
  "Kenapa pokok pandai matematik? Banyak akar.",
  "Kenapa buku sejarah penat? Banyak kenangan.",
  "Kenapa beg sekolah kuat? Dia tanggung banyak perkara.",
  "Kenapa pemadam selalu membantu? Dia suka betulkan kesilapan.",
  "Kenapa marker terkenal? Sebab dia meninggalkan tanda.",
  "Kenapa kerusi tak bercakap? Dia lebih suka duduk diam.",
  "Kenapa meja tak pernah panik? Dia sentiasa stabil.",
  "Kenapa lif pandai naik pangkat? Kerjanya memang naik turun.",
  "Kenapa bas tak pernah bersendirian? Sentiasa ada penumpang.",
  "Kenapa lampu isyarat tegas? Dia tahu bila perlu berhenti.",
  "Kenapa peta tak keliru? Dia ada hala tuju.",
  "Kenapa kasut sukan rajin? Selalu bergerak ke hadapan.",
  "Kenapa payung baik hati? Dia melindungi orang ketika susah.",
  "Kenapa hujan tak datang awal? Dia tunggu awan beri lampu hijau.",
  "Kenapa ikan tak guna telefon? Takut kena phishing.",
  "Kenapa kucing suka komputer? Sebab ada mouse.",
  "Kenapa ayam lintas jalan? Nak pergi ke seberang, klasik betul.",
  "Kenapa itik tak pandai berahsia? Semua benda quack-quack.",
  "Kenapa lebah rajin? Dia sentiasa busy.",
  "Kenapa kura-kura tak tergesa-gesa? Dia ikut pace sendiri.",
  "Kenapa zirafah nampak jauh? Perspektif dia tinggi.",
  "Kenapa panda suka rehat? Dia memang pakar bertenang.",
  "Kenapa sotong pandai multitasking? Banyak tangan, banyak kerja.",
  "Kenapa gunung tak bergosip? Dia simpan semuanya dalam batu.",
  "Kenapa laut luas? Sebab dia tak suka berkira.",
  "Kenapa sungai tak berhenti? Dia ada banyak aliran.",
  "Kenapa basikal jatuh? Sebab dia dua-tayar-ed.",
  "Kenapa kereta suka muzik? Ada stereo.",
  "Kenapa motosikal tak suka rahsia? Ekzosnya kuat.",
  "Kenapa kapal terbang yakin? Dia sentiasa ada flight plan.",
  "Kenapa roket tak lambat? Dia suka launch awal.",
  "Kenapa saintis bawa tangga? Nak capai tahap lebih tinggi.",
  "Kenapa atom tak kesunyian? Dia ada electron.",
  "Kenapa proton positif? Memang personalitinya begitu.",
  "Kenapa neutron neutral? Dia tak mahu masuk campur.",
  "Kenapa magnet popular? Semua orang tertarik kepadanya.",
  "Kenapa graviti serius? Dia tak suka benda melayang.",
  "Kenapa bulan tak bayar sewa? Dia tinggal di orbit.",
  "Kenapa bintang rajin? Setiap malam dia muncul bekerja.",
  "Kenapa matahari tak main sorok-sorok? Semua orang boleh nampak.",
  "Kenapa pelangi ceria? Banyak warna dalam hidupnya.",
  "Kenapa kalkulus susah move on? Masih mencari limit.",
  "Kenapa integral suka berkawan? Dia suka mengumpulkan semuanya.",
  "Kenapa graf yakin? Dia tahu arah trend.",
  "Kenapa pecahan tak lengkap? Sebab belum dipermudahkan.",
  "Kenapa nombor 8 tenang? Dia sudah seimbang.",
  "Kenapa sifar penting? Jangan pandang rendah pada dia.",
  "Kenapa nombor 1 yakin? Dia percaya pada diri sendiri.",
  "Kenapa segi tiga stabil? Ada tiga point sokongan.",
  "Kenapa bulatan tak ada sudut? Dia tak suka konflik tajam.",
  "Kenapa segi empat kemas? Semua sudut tersusun.",
  "Kenapa fizik suka teka-teki? Semua ada sebab dan kesan.",
  "Kenapa kimia romantik? Mereka suka bonding.",
  "Kenapa biologi suka cerita? Banyak cell plot twist.",
  "Kenapa jurutera bawa pensel? Untuk melakar masa depan.",
  "Kenapa welding perlukan fokus? Sambungan mesti tepat.",
  "Kenapa skru setia? Dia sentiasa memegang janji.",
  "Kenapa span pandai mendengar? Dia menyerap cerita.",
  "Kenapa sabun bersih hati? Dia suka hilangkan masalah.",
  "Kenapa cawan tak stress? Dia tahu cara mengosongkan fikiran.",
  "Kenapa sudut 90 darjah tenang? Hidupnya right angle.",
  "Kenapa komputer tak tidur? Banyak proses berjalan.",
  "Kenapa bateri penat? Tenaganya semakin low.",
  "Kenapa pengecas disukai? Dia selalu memberi tenaga.",
  "Kenapa aplikasi rajin? Sentiasa ada update.",
  "Kenapa kod programmer tersenyum? Akhirnya tiada bug.",
  "Kenapa robot sopan? Dia ikut program.",
  "Kenapa AI tak ponteng? Dia sentiasa online.",
  "Kenapa butang NO tak berhenti? Sebab cerita belum sampai 100!",
  "Ini lawak ke-100! Tahniah, anda berjaya menguji kesabaran butang. 🏆"
]

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
            <div><Vote /><strong>{isAdmin ? totalVotes : '—'}</strong><small>{isAdmin ? 'Total votes' : 'Votes hidden'}</small></div>
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
          {isAdmin && (
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
                <div className="celebration-sparkles" aria-hidden="true"><span>✦</span><span>✧</span><span>✦</span><span>✧</span></div>
                <h3>THANK YOU FOR VOTING!</h3>
                <p>Your vote has been recorded. It cannot be cancelled or changed.</p>
                <button className="vote-again" onClick={handleVoteAgain}>
                  {voteAgainStep >= 12 ? 'VOTE AGAIN 😂' : 'VOTE AGAIN'}
                </button>
                {voteAgainStep > 0 && (
                  <p className="joke" key={voteAgainStep}>
                    {voteAgainStep <= 12 ? voteAgainJokes[voteAgainStep - 1] : extendedVoteJokes[voteAgainStep - 13]}
                  </p>
                )}
                {voteAgainStep >= 12 && !muslimPromptSeen && (
                  <button className="dhikrmath-link" type="button" onClick={() => {
                    setMuslimPromptSeen(true)
                    setShowMuslimPrompt(true)
                  }}>
                    STRESS? CLICK HERE ↗
                  </button>
                )}
              </div>
            )}

            {participants.map((p, index) => (
              <div className="participant" key={p.id}>
                {p.image_url ? (
                  <button className="participant-photo-button" type="button" onClick={() => setEnlargedPhoto({ url: getDisplayImageUrl(p.image_url), name: p.name })} aria-label={`View ${p.name}'s photo`}>
                    <img src={getDisplayImageUrl(p.image_url)} alt={p.name} />
                    <span>VIEW</span>
                  </button>
                ) : <div className="avatar">{p.name.charAt(0).toUpperCase()}</div>}
                <div className="person"><strong>{p.name}</strong><small>CONTESTANT #{index + 1}</small></div>
                <button className="primary vote-button"
                  disabled={loading || competition?.status !== 'open' || !user || hasVoted}
                  onClick={() => castVote(p.id)}>VOTE</button>
              </div>
            ))}
          </section>
        )}

        {tab === 'results' && isAdmin && (
          <section className="panel">
            <h2><Trophy /> Final Results</h2>
            <p>Private organizer view. Only authorized admins can access official results.</p>
            {[...participants].sort((a, b) => (totals[b.id] || 0) - (totals[a.id] || 0))
              .map((p, index) => (
                <div className="result" key={p.id}>
                  <strong>#{index + 1} {p.name}</strong><span>{totals[p.id] || 0} votes</span>
                </div>
              ))}
            <button className="primary" onClick={loadData}><RefreshCw size={14} /> REFRESH</button>
            {isAdmin && competition?.status === 'closed' && (
              <div className="timeline-export">
                <h3>Vote Timeline Video</h3>
                <p>Create a thriller-style replay with a staged last-minute comeback, suspense audio, participant photos and an official Top 3 finale. The comeback changes the visual order only; the final vote totals remain accurate.</p>
                <label htmlFor="timeline-duration">VIDEO DURATION</label>
                <select id="timeline-duration" value={timelineDuration}
                  onChange={e => setTimelineDuration(Number(e.target.value))} disabled={timelineBusy}>
                  <option value="30">30 seconds</option>
                  <option value="60">1 minute</option>
                  <option value="90">1 minute 30 seconds</option>
                  <option value="120">2 minutes</option>
                  <option value="180">3 minutes (maximum)</option>
                </select>
                <button className="primary form-button" onClick={generateVoteTimelineVideo} disabled={timelineBusy}>
                  {timelineBusy ? 'GENERATING VIDEO ' + timelineProgress + '%' : 'GENERATE TIMELINE VIDEO'}
                </button>
                {timelineBusy && <div className="timeline-progress"><span style={{ width: timelineProgress + '%' }} /></div>}
                {timelineVideoUrl && (
                  <div className="timeline-preview">
                    <video src={timelineVideoUrl} controls playsInline />
                    <a href={timelineVideoUrl} download="M1T1-TalentVote-Thriller-Timeline">DOWNLOAD VIDEO AGAIN</a>
                    <small>Format: MP4 when supported by your browser (otherwise WebM) · 16:9 · Up to 3 minutes</small>
                  </div>
                )}
                <small className="upload-hint">Available to the organizer after voting closes. Use an updated Chrome browser to generate and save the video.</small>
              </div>
            )}
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
                        <div className="admin-person participant-admin-card" key={p.id}>
                          {p.image_url ? <img src={getDisplayImageUrl(p.image_url)} alt="" /> : <div className="avatar">{p.name.charAt(0).toUpperCase()}</div>}
                          <div className="participant-admin-info">
                            <strong>#{i + 1} {p.name}</strong>
                            <small>{p.image_url ? 'Image added' : 'No image'}</small>
                            <div className="participant-admin-actions">
                              <button type="button" className="secondary" onClick={() => editingParticipantId === p.id ? cancelEditingParticipant() : startEditingParticipant(p)}>
                                <Pencil size={13} /> {editingParticipantId === p.id ? 'CANCEL' : 'EDIT'}
                              </button>
                              <button type="button" className="danger" disabled={loading} onClick={() => removeParticipant(p)}>
                                <Trash2 size={13} /> REMOVE
                              </button>
                            </div>
                          </div>
                          {editingParticipantId === p.id && (
                            <form className="participant-edit-form" onSubmit={e => saveParticipantChanges(e, p)}>
                              <label htmlFor={`edit-participant-name-${p.id}`}>PARTICIPANT NAME</label>
                              <input id={`edit-participant-name-${p.id}`} value={editingParticipantName}
                                onChange={e => setEditingParticipantName(e.target.value)} required />
                              <label htmlFor={`edit-participant-file-${p.id}`}>REPLACE PHOTO FROM GALLERY</label>
                              <input id={`edit-participant-file-${p.id}`} type="file" accept="image/jpeg,image/png,image/webp"
                                onChange={e => { setEditingParticipantImageFile(e.target.files?.[0] || null); setEditingParticipantImageUrl(''); setEditingParticipantRemoveImage(false) }} />
                              <small className="upload-hint">JPG, PNG or WEBP, maximum 5 MB. Leave unchanged to keep the current photo.</small>
                              {!editingParticipantImageFile && (
                                <input type="url" placeholder="Or enter a new public photo URL"
                                  value={editingParticipantImageUrl}
                                  onChange={e => { setEditingParticipantImageUrl(e.target.value); setEditingParticipantRemoveImage(false) }} />
                              )}
                              {p.image_url && (
                                <label className="remove-photo-option">
                                  <input type="checkbox" checked={editingParticipantRemoveImage}
                                    onChange={e => { setEditingParticipantRemoveImage(e.target.checked); if (e.target.checked) { setEditingParticipantImageFile(null); setEditingParticipantImageUrl('') } }} />
                                  Remove current photo
                                </label>
                              )}
                              <button className="primary form-button" disabled={loading}>
                                <CheckCircle size={13} /> {loading ? 'SAVING...' : 'SAVE CHANGES'}
                              </button>
                            </form>
                          )}
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
      {showMuslimPrompt && (
        <div className="photo-lightbox muslim-prompt-backdrop" role="dialog" aria-modal="true" aria-labelledby="muslim-prompt-title" onClick={() => setShowMuslimPrompt(false)}>
          <div className="muslim-prompt" onClick={e => e.stopPropagation()}>
            <div className="muslim-prompt-icon">☪</div>
            <h2 id="muslim-prompt-title">Are you a Muslim?</h2>
            <p>We have something useful to share with you.</p>
            <div className="muslim-prompt-actions">
              <button type="button" className="primary" onClick={() => { setShowMuslimPrompt(false); window.open('https://dhikrmath.pages.dev', '_blank', 'noopener,noreferrer') }}>YES</button>
              <button type="button" className="secondary" onClick={() => {
                setShowMuslimPrompt(false)
                setVoteAgainStep(13)
              }}>NO</button>
            </div>
          </div>
        </div>
      )}
      {enlargedPhoto && (
        <div className="photo-lightbox" role="dialog" aria-modal="true" aria-label={`${enlargedPhoto.name} photo`} onClick={() => setEnlargedPhoto(null)}>
          <button className="photo-lightbox-close" type="button" onClick={() => setEnlargedPhoto(null)} aria-label="Close photo">×</button>
          <div className="photo-lightbox-content" onClick={e => e.stopPropagation()}>
            <img src={enlargedPhoto.url} alt={enlargedPhoto.name} />
            <strong>{enlargedPhoto.name}</strong>
            <small>Tap outside the photo to close</small>
          </div>
        </div>
      )}
      <footer>M1T1 TALENTVOTE <span>•</span> THE STAGE IS YOURS
        <button className="organizer-link" onClick={() => { setTab('admin'); setShowAdminLogin(true) }}>ORGANIZER LOGIN</button>
      </footer>
    </div>
  )
}
