
import React, { useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { Trophy, Users, Vote, Plus, Settings, BarChart3 } from 'lucide-react'

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL || 'https://example.supabase.co',
  import.meta.env.VITE_SUPABASE_ANON_KEY || 'placeholder'
)

export default function App() {
  const [tab, setTab] = useState('home')
  const [contest, setContest] = useState('M1T1 Talent Show')
  const [participants, setParticipants] = useState([
    { id: 1, name: 'Participant 1', votes: 0 },
    { id: 2, name: 'Participant 2', votes: 0 },
    { id: 3, name: 'Participant 3', votes: 0 }
  ])

  const [newName, setNewName] = useState('')

  const total = participants.reduce((sum, p) => sum + p.votes, 0)

  function addParticipant() {
    if (!newName.trim()) return
    setParticipants([...participants, {
      id: Date.now(),
      name: newName.trim(),
      votes: 0
    }])
    setNewName('')
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
        <span className="live">● LIVE EVENT</span>
      </header>

      <main>
        <section className="hero">
          <span className="eyebrow">WELCOME TO</span>
          <h2>{contest}</h2>
          <p>Celebrate talent. Cast your vote.</p>
          <div className="stats">
            <div><Users /><strong>{participants.length}</strong><small>Participants</small></div>
            <div><Vote /><strong>{total}</strong><small>Total votes</small></div>
            <div><Trophy /><strong>1</strong><small>Winner</small></div>
          </div>
        </section>

        <nav>
          <button onClick={() => setTab('home')} className={tab === 'home' ? 'active' : ''}>Overview</button>
          <button onClick={() => setTab('vote')} className={tab === 'vote' ? 'active' : ''}>Vote</button>
          <button onClick={() => setTab('admin')} className={tab === 'admin' ? 'active' : ''}>Admin</button>
        </nav>

        {tab === 'home' && (
          <section className="panel">
            <h2><BarChart3 /> Competition Overview</h2>
            <p>Welcome to M1T1 TalentVote. View participants and support your favourite performance.</p>
            <button className="primary" onClick={() => setTab('vote')}>Vote Now →</button>
          </section>
        )}

        {tab === 'vote' && (
          <section className="panel">
            <h2><Vote /> Choose Your Favourite</h2>
            {participants.map((p, index) => (
              <div className="participant" key={p.id}>
                <div className="avatar">{p.name.charAt(0).toUpperCase()}</div>
                <div className="person">
                  <strong>{p.name}</strong>
                  <small>Contestant #{index + 1}</small>
                </div>
                <button className="primary" onClick={() => {
                  setParticipants(old => old.map(x =>
                    x.id === p.id ? {...x, votes: x.votes + 1} : x
                  ))
                }}>Vote</button>
              </div>
            ))}
          </section>
        )}

        {tab === 'admin' && (
          <section className="panel">
            <h2><Settings /> Admin Panel</h2>
            <label>Competition name</label>
            <input value={contest} onChange={e => setContest(e.target.value)} />
            <h3>Add participant</h3>
            <div className="add">
              <input placeholder="Participant name" value={newName} onChange={e => setNewName(e.target.value)} />
              <button className="primary" onClick={addParticipant}><Plus /></button>
            </div>
            <h3>Live results</h3>
            {[...participants].sort((a,b) => b.votes-a.votes).map(p => (
              <div className="result" key={p.id}>
                <strong>{p.name}</strong>
                <span>{p.votes} votes</span>
              </div>
            ))}
            <p className="note">Demo version: votes are not yet saved to Supabase.</p>
          </section>
        )}
      </main>
      <footer>M1T1 TALENTVOTE • POWERED BY YOUR COMMUNITY</footer>
    </div>
  )
}
