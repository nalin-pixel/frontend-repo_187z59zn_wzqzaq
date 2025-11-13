import { useEffect, useRef, useState } from 'react'

function App() {
  const baseUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000'

  // Live OBD data
  const [live, setLive] = useState(null)
  const [pids, setPids] = useState({})
  const [dtcs, setDtcs] = useState([])
  const [liveError, setLiveError] = useState('')
  const liveTimer = useRef(null)

  // Voice/chat
  const [listening, setListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [answer, setAnswer] = useState('')
  const [tips, setTips] = useState([])
  const recognitionRef = useRef(null)

  // Setup: fetch supported PIDs
  useEffect(() => {
    fetch(`${baseUrl}/api/obd/pids`).then(r => r.json()).then(d => setPids(d.supported || {})).catch(() => {})
  }, [baseUrl])

  // Poll live data
  useEffect(() => {
    startLive()
    return stopLive
  }, [baseUrl])

  const startLive = () => {
    stopLive()
    liveTimer.current = setInterval(async () => {
      try {
        const r = await fetch(`${baseUrl}/api/obd/live`)
        if (!r.ok) throw new Error('Network')
        const d = await r.json()
        setLive(d)
        setLiveError('')
      } catch (e) {
        setLiveError('Connexion au flux OBD simulé perdue')
      }
    }, 1000)
  }

  const stopLive = () => {
    if (liveTimer.current) {
      clearInterval(liveTimer.current)
      liveTimer.current = null
    }
  }

  const getDiagnostics = async () => {
    try {
      const r = await fetch(`${baseUrl}/api/obd/diagnostics`)
      const d = await r.json()
      setDtcs(d.dtcs || [])
    } catch (e) {
      setDtcs([])
    }
  }

  // Voice recognition and TTS
  const initRecognition = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) return null
    const rec = new SR()
    rec.lang = 'fr-FR'
    rec.interimResults = false
    rec.maxAlternatives = 1
    rec.onresult = (event) => {
      const text = event.results[0][0].transcript
      setTranscript(text)
      askAssistant(text)
    }
    rec.onerror = () => {
      setListening(false)
    }
    rec.onend = () => {
      setListening(false)
    }
    return rec
  }

  const toggleListen = () => {
    if (listening) {
      recognitionRef.current && recognitionRef.current.stop()
      setListening(false)
      return
    }
    const rec = initRecognition()
    if (!rec) {
      setTranscript("La reconnaissance vocale n'est pas supportée sur ce navigateur.")
      return
    }
    recognitionRef.current = rec
    setListening(true)
    rec.start()
  }

  const speak = (text) => {
    if (!('speechSynthesis' in window)) return
    const utter = new SpeechSynthesisUtterance(text)
    utter.lang = 'fr-FR'
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(utter)
  }

  const askAssistant = async (question) => {
    try {
      setAnswer('')
      setTips([])
      const r = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question })
      })
      const d = await r.json()
      setAnswer(d.answer || '')
      setTips(d.tips || [])
      speak(d.answer || '')
    } catch (e) {
      setAnswer('Erreur de communication avec l\'assistant')
    }
  }

  const quickAsk = (q) => {
    setTranscript(q)
    askAssistant(q)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-blue-50 p-6">
      <header className="max-w-6xl mx-auto flex items-center justify-between mb-6">
        <h1 className="text-2xl md:text-3xl font-extrabold text-gray-800">OBD Voice Assistant</h1>
        <span className="text-xs md:text-sm text-gray-500">Backend: {baseUrl}</span>
      </header>

      <main className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Live Data Panel */}
        <section className="lg:col-span-2 bg-white rounded-xl shadow p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-800">Données OBD (simulées)</h2>
            <div className="flex gap-2">
              <button onClick={startLive} className="px-3 py-1.5 text-sm rounded bg-green-600 text-white hover:bg-green-700">Démarrer</button>
              <button onClick={stopLive} className="px-3 py-1.5 text-sm rounded bg-gray-600 text-white hover:bg-gray-700">Arrêter</button>
            </div>
          </div>
          {liveError && (
            <p className="text-sm text-red-600 mb-2">{liveError}</p>
          )}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Metric label="RPM" value={live?.rpm} unit="tr/min"/>
            <Metric label="Vitesse" value={live?.speed} unit="km/h"/>
            <Metric label="Temp. LDR" value={live?.coolant_temp} unit="°C"/>
            <Metric label="Papillon" value={live?.throttle} unit="%"/>
            <Metric label="Charge" value={live?.load} unit="%"/>
            <Metric label="IAT" value={live?.intake_temp} unit="°C"/>
          </div>
          <div className="mt-4 text-xs text-gray-500">
            PIDs supportés: {Object.keys(pids).length > 0 ? Object.entries(pids).map(([k,v]) => `${k} (${v})`).join(', ') : 'Chargement...'}
          </div>
        </section>

        {/* Diagnostics Panel */}
        <section className="bg-white rounded-xl shadow p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xl font-semibold text-gray-800">Codes défaut (DTC)</h2>
            <button onClick={getDiagnostics} className="px-3 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-700">Scanner</button>
          </div>
          {dtcs.length === 0 ? (
            <p className="text-gray-500 text-sm">Aucun code actif détecté pour l'instant.</p>
          ) : (
            <ul className="space-y-2">
              {dtcs.map((d, idx) => (
                <li key={idx} className="border rounded p-2">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-semibold">{d.code}</span>
                    <span className="text-xs px-2 py-0.5 rounded bg-yellow-100 text-yellow-800">Sévérité: {d.severity}</span>
                  </div>
                  <p className="text-sm text-gray-700 mt-1">{d.description}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Voice Assistant Panel */}
        <section className="lg:col-span-3 bg-white rounded-xl shadow p-5">
          <h2 className="text-xl font-semibold text-gray-800 mb-3">Assistant vocal mécanique / électricité / ECU</h2>
          <div className="flex flex-col md:flex-row gap-3 mb-3">
            <button onClick={toggleListen} className={`px-4 py-2 rounded font-semibold text-white ${listening ? 'bg-red-600 hover:bg-red-700' : 'bg-rose-600 hover:bg-rose-700'}`}>
              {listening ? 'Arrêter' : 'Parler 🎤'}
            </button>
            <input
              className="flex-1 border rounded px-3 py-2"
              placeholder="Ou tape ta question (ex: Que signifie P0420 ?)"
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') askAssistant(transcript) }}
            />
            <button onClick={() => askAssistant(transcript)} className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-700 text-white font-semibold">Envoyer</button>
          </div>
          <div className="flex flex-wrap gap-2 mb-4">
            <QuickChip onClick={quickAsk} text="Que signifie P0300 ?" />
            <QuickChip onClick={quickAsk} text="Ralenti instable essence" />
            <QuickChip onClick={quickAsk} text="ELM327: que vérifier ?" />
            <QuickChip onClick={quickAsk} text="Batterie faible: quels tests ?" />
          </div>
          {answer && (
            <div className="bg-gray-50 border rounded p-4">
              <p className="whitespace-pre-wrap text-gray-800">{answer}</p>
              {tips && tips.length > 0 && (
                <ul className="list-disc pl-5 mt-2 text-sm text-gray-700">
                  {tips.map((t, i) => <li key={i}>{t}</li>)}
                </ul>
              )}
            </div>
          )}
        </section>
      </main>

      <footer className="max-w-6xl mx-auto mt-8 text-center text-xs text-gray-500">
        Prototype web. La connexion ELM327 Bluetooth native nécessite une application Android; ceci simule les données pour tester l'UI et l'assistant.
      </footer>
    </div>
  )
}

function Metric({ label, value, unit }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-2xl font-bold text-gray-800">{value ?? '—'}<span className="text-sm ml-1 text-gray-500">{unit}</span></div>
    </div>
  )
}

function QuickChip({ text, onClick }) {
  return (
    <button onClick={() => onClick(text)} className="px-3 py-1.5 rounded-full bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-sm">
      {text}
    </button>
  )
}

export default App
