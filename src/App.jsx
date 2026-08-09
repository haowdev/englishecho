import { useEffect, useRef, useState } from 'react'
import { Check, ChevronLeft, ChevronRight, CircleHelp, History, Mic, Pause, RotateCcw, Sparkles, Volume2, X } from 'lucide-react'
import './App.css'

const sampleText = `Great speakers are not born overnight. They grow through small, deliberate repetitions. Listen closely, speak with intention, and let every sentence become a little more natural.`
const practiceSentenceBank = [
  'I like to begin my day with a clear plan.',
  'The train arrives at the station in ten minutes.',
  'She explained the idea with a simple example.',
  'A short walk can help me focus again.',
  'We should check the details before making a decision.',
  'The weather is perfect for an afternoon outside.',
  'He asked a thoughtful question during the meeting.',
  'Learning a language takes patience and regular practice.',
  'Please let me know when you are ready to start.',
  'The small cafe serves fresh bread every morning.',
  'I remembered to bring my notebook and a pen.',
  'They found a quiet place to talk after lunch.',
  'This new habit is becoming easier every week.',
  'Could you repeat that sentence a little more slowly?',
  'The team celebrated after finishing the project.',
]
const trainingDraftStorageKey = 'echo-english.training-draft'
const trainingHistoryStorageKey = 'echo-english.training-history'
const trainingProgressStorageKey = 'echo-english.training-progress'
const splitIntoSentences = (text) => (text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? []).map((sentence) => sentence.trim()).filter(Boolean)
const normalizeWords = (text) => text.toLowerCase().match(/[a-z]+(?:'[a-z]+)?/g) ?? []
const functionWords = new Set(['a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'for', 'from', 'he', 'her', 'his', 'i', 'in', 'is', 'it', 'me', 'my', 'of', 'on', 'or', 'our', 'she', 'that', 'the', 'their', 'them', 'they', 'to', 'was', 'we', 'were', 'with', 'you', 'your'])
const readLocalStorage = (key, fallback) => {
  try { return window.localStorage.getItem(key) || fallback } catch { return fallback }
}
const readTrainingHistory = () => {
  try {
    const saved = JSON.parse(window.localStorage.getItem(trainingHistoryStorageKey) || '[]')
    return Array.isArray(saved) ? saved.filter((item) => typeof item === 'string') : []
  } catch { return [] }
}
const readTrainingProgress = () => {
  try {
    const saved = JSON.parse(window.localStorage.getItem(trainingProgressStorageKey) || '{}')
    return saved && typeof saved === 'object' ? saved : {}
  } catch { return {} }
}
const readSentenceScores = (text, sentences) => {
  const saved = readTrainingProgress()[text]
  if (!saved || !Array.isArray(saved.sentences) || !Array.isArray(saved.scores)) return []
  return saved.sentences.length === sentences.length && saved.sentences.every((sentence, index) => sentence === sentences[index]) ? saved.scores : []
}
const firstIncompleteSentence = (scores, count, startAt = 0) => {
  const index = scores.findIndex((score, sentenceIndex) => sentenceIndex >= startAt && (!score || score.overall < 90))
  return index === -1 ? -1 : index
}
const editDistance = (first, second) => {
  const previous = Array.from({ length: second.length + 1 }, (_, index) => index)
  for (let firstIndex = 1; firstIndex <= first.length; firstIndex += 1) {
    const current = [firstIndex]
    for (let secondIndex = 1; secondIndex <= second.length; secondIndex += 1) {
      current[secondIndex] = first[firstIndex - 1] === second[secondIndex - 1]
        ? previous[secondIndex - 1]
        : Math.min(previous[secondIndex], current[secondIndex - 1], previous[secondIndex - 1]) + 1
    }
    previous.splice(0, previous.length, ...current)
  }
  return previous[second.length]
}

const scoreAttempt = (target, spoken) => {
  const targetWords = normalizeWords(target)
  const spokenWords = normalizeWords(spoken)
  let targetIndex = 0
  let matchedWeight = 0
  const targetWeight = targetWords.reduce((total, word) => total + (functionWords.has(word) ? 0.35 : 1), 0)
  spokenWords.forEach((word) => {
    const foundAt = targetWords.indexOf(word, targetIndex)
    if (foundAt !== -1) { matchedWeight += functionWords.has(targetWords[foundAt]) ? 0.35 : 1; targetIndex = foundAt + 1; return }
    const similarAt = targetWords.findIndex((targetWord, index) => index >= targetIndex && targetWord.length >= 4 && word.length >= 4 && editDistance(targetWord, word) <= 1)
    if (similarAt !== -1) { matchedWeight += (functionWords.has(targetWords[similarAt]) ? 0.35 : 1) * 0.85; targetIndex = similarAt + 1 }
  })
  const rawAccuracy = targetWeight ? Math.round((matchedWeight / targetWeight) * 100) : 0
  const accuracy = spokenWords.length >= 2 ? Math.round(100 - (100 - rawAccuracy) * 0.7) : rawAccuracy
  const pace = spokenWords.length ? Math.min(100, Math.round((Math.min(spokenWords.length, targetWords.length) / Math.max(spokenWords.length, targetWords.length)) * 100)) : 0
  return { accuracy, pace, overall: Math.round(accuracy * 0.8 + pace * 0.2) }
}

function App() {
  const [text, setText] = useState(() => readLocalStorage(trainingDraftStorageKey, sampleText))
  const [sentences, setSentences] = useState(() => splitIntoSentences(readLocalStorage(trainingDraftStorageKey, sampleText)))
  const [activeIndex, setActiveIndex] = useState(() => {
    const initialText = readLocalStorage(trainingDraftStorageKey, sampleText)
    const initialSentences = splitIntoSentences(initialText)
    const incompleteIndex = firstIncompleteSentence(readSentenceScores(initialText, initialSentences), initialSentences.length)
    return incompleteIndex === -1 ? 0 : incompleteIndex
  })
  const [isPlaying, setIsPlaying] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [result, setResult] = useState(null)
  const [notice, setNotice] = useState('')
  const [speakers, setSpeakers] = useState([])
  const [selectedSpeaker, setSelectedSpeaker] = useState('')
  const [isTestingMicrophone, setIsTestingMicrophone] = useState(false)
  const [microphoneLevel, setMicrophoneLevel] = useState(0)
  const [trainingHistory, setTrainingHistory] = useState(readTrainingHistory)
  const [trainingProgress, setTrainingProgress] = useState(readTrainingProgress)
  const [activeView, setActiveView] = useState('practice')
  const [sentenceScores, setSentenceScores] = useState(() => {
    const initialText = readLocalStorage(trainingDraftStorageKey, sampleText)
    return readSentenceScores(initialText, splitIntoSentences(initialText))
  })
  const recognitionRef = useRef(null)
  const microphoneStreamRef = useRef(null)
  const microphoneTestFrameRef = useRef(null)
  const microphoneTestTimeoutRef = useRef(null)
  const microphoneTestContextRef = useRef(null)
  const microphoneTestHeardSoundRef = useRef(false)
  const recordingSilenceTimeoutRef = useRef(null)
  const finishRecordingRef = useRef(null)
  const activeSentence = sentences[activeIndex] ?? ''
  const activeScore = sentenceScores[activeIndex]?.overall
  const sentenceStatus = activeScore === undefined ? 'unread' : activeScore >= 90 ? 'excellent' : activeScore <= 70 ? 'needs-work' : 'in-progress'
  const progress = sentences.length ? ((activeIndex + 1) / sentences.length) * 100 : 0

  useEffect(() => () => {
    window.speechSynthesis?.cancel()
    recognitionRef.current?.abort()
    microphoneStreamRef.current?.getTracks().forEach((track) => track.stop())
    cancelAnimationFrame(microphoneTestFrameRef.current)
    clearTimeout(microphoneTestTimeoutRef.current)
    clearTimeout(recordingSilenceTimeoutRef.current)
    microphoneTestContextRef.current?.close()
  }, [])

  useEffect(() => {
    try { window.localStorage.setItem(trainingDraftStorageKey, text) } catch {}
  }, [text])

  const loadDevices = async () => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      setNotice('当前浏览器不支持设备列表。')
      return
    }
    const devices = await navigator.mediaDevices.enumerateDevices()
    const outputs = devices.filter((device) => device.kind === 'audiooutput')
    setSpeakers(outputs)
    if (!selectedSpeaker && outputs[0]) setSelectedSpeaker(outputs[0].deviceId)
  }

  const requestMicrophone = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setNotice('当前浏览器不支持麦克风访问。')
      return false
    }
    try {
      microphoneStreamRef.current?.getTracks().forEach((track) => track.stop())
      microphoneStreamRef.current = await navigator.mediaDevices.getUserMedia({
        audio: true,
      })
      await loadDevices()
      setNotice('默认麦克风已准备好。')
      return true
    } catch (error) {
      const messages = {
        NotAllowedError: '浏览器未获准使用麦克风。请点击地址栏的站点权限图标并允许麦克风访问。',
        NotFoundError: '未检测到可用麦克风。请检查设备连接及 Windows 的输入设备设置。',
        NotReadableError: '麦克风正被其他应用占用，或 Windows 无法访问该设备。请关闭占用程序后重试。',
      }
      setNotice(messages[error.name] || '无法访问默认麦克风，请检查浏览器权限和 Windows 输入设备。')
      return false
    }
  }

  const saveTrainingText = (value) => {
    setTrainingHistory((previous) => {
      const next = [value, ...previous.filter((saved) => saved !== value)].slice(0, 8)
      try { window.localStorage.setItem(trainingHistoryStorageKey, JSON.stringify(next)) } catch {}
      return next
    })
  }
  const restorePractice = (nextText, nextSentences) => {
    const savedScores = readSentenceScores(nextText, nextSentences)
    const incompleteIndex = firstIncompleteSentence(savedScores, nextSentences.length)
    setSentences(nextSentences)
    setSentenceScores(savedScores)
    setActiveIndex(incompleteIndex === -1 ? 0 : incompleteIndex)
    setTranscript(''); setResult(null)
    setNotice(incompleteIndex === -1 ? '本篇练习的所有句子均已达到 90 分。' : savedScores.length ? `已恢复本机成绩，从第 ${incompleteIndex + 1} 句继续。` : `${nextSentences.length} 个句子已准备好。`)
  }
  const saveSentenceScore = (sentenceIndex, attempt) => {
    setSentenceScores((previous) => {
      const next = [...previous]
      const savedAttempt = next[sentenceIndex]?.overall > attempt.overall ? next[sentenceIndex] : attempt
      next[sentenceIndex] = savedAttempt
      const progress = readTrainingProgress()
      progress[text] = { sentences, scores: next }
      try { window.localStorage.setItem(trainingProgressStorageKey, JSON.stringify(progress)) } catch {}
      setTrainingProgress(progress)
      return next
    })
  }
  const prepareText = () => {
    const nextSentences = splitIntoSentences(text)
    if (!nextSentences.length) { setNotice('请输入至少一个英文句子。'); return }
    saveTrainingText(text)
    restorePractice(text, nextSentences)
  }
  const generatePracticeSentences = () => {
    const nextSentences = [...practiceSentenceBank]
      .sort(() => Math.random() - 0.5)
      .slice(0, 10)
    const generatedText = nextSentences.join(' ')
    setText(generatedText)
    saveTrainingText(generatedText)
    restorePractice(generatedText, nextSentences)
  }
  const speak = () => {
    if (!activeSentence || !window.speechSynthesis) return
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(activeSentence)
    utterance.lang = 'en-US'; utterance.rate = 0.84
    utterance.onstart = () => setIsPlaying(true); utterance.onend = () => setIsPlaying(false); utterance.onerror = () => setIsPlaying(false)
    window.speechSynthesis.speak(utterance)
  }
  const selectSpeaker = (deviceId) => {
    setSelectedSpeaker(deviceId)
    setNotice('已保存播放设备选择。原生朗读由浏览器控制，请在浏览器或系统声音设置中将该设备设为默认输出。')
  }
  const stopMicrophoneTest = (completed = false) => {
    cancelAnimationFrame(microphoneTestFrameRef.current)
    clearTimeout(microphoneTestTimeoutRef.current)
    microphoneTestContextRef.current?.close()
    microphoneTestContextRef.current = null
    microphoneStreamRef.current?.getTracks().forEach((track) => track.stop())
    microphoneStreamRef.current = null
    setIsTestingMicrophone(false)
    setMicrophoneLevel(0)
    if (completed) setNotice(microphoneTestHeardSoundRef.current ? '默认麦克风测试完成，已检测到你的声音。' : '未检测到声音。请检查 Windows 或浏览器的默认输入设备及输入音量。')
  }
  const testMicrophone = async () => {
    if (isTestingMicrophone) { stopMicrophoneTest(true); return }
    setNotice('正在准备麦克风测试，请说几句话...')
    microphoneTestHeardSoundRef.current = false
    const microphoneReady = await requestMicrophone()
    if (!microphoneReady) return
    const AudioContextClass = window.AudioContext || window.webkitAudioContext
    if (!AudioContextClass) { setNotice('当前浏览器不支持麦克风音量测试。'); return }
    const audioContext = new AudioContextClass()
    const analyser = audioContext.createAnalyser()
    const samples = new Uint8Array(analyser.fftSize)
    audioContext.createMediaStreamSource(microphoneStreamRef.current).connect(analyser)
    microphoneTestContextRef.current = audioContext
    setIsTestingMicrophone(true)
    const measureLevel = () => {
      analyser.getByteTimeDomainData(samples)
      const energy = samples.reduce((total, sample) => total + (sample - 128) ** 2, 0) / samples.length
      const level = Math.min(100, Math.round(Math.sqrt(energy) * 7))
      if (level >= 5) microphoneTestHeardSoundRef.current = true
      setMicrophoneLevel(level)
      microphoneTestFrameRef.current = requestAnimationFrame(measureLevel)
    }
    measureLevel()
    microphoneTestTimeoutRef.current = setTimeout(() => stopMicrophoneTest(true), 10000)
  }
  const startRecording = async () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) { setNotice('当前浏览器不支持语音识别。请使用最新版 Chrome 或 Edge。'); return }
    const microphoneIsReady = microphoneStreamRef.current?.getAudioTracks().some((track) => track.readyState === 'live')
    if (!microphoneIsReady) {
      setNotice('正在准备麦克风...')
      const microphoneReady = await requestMicrophone()
      if (!microphoneReady) return
    }
    setTranscript(''); setResult(null); setNotice('')
    const recognition = new SpeechRecognition()
    let latestSpoken = ''
    let hasScored = false
    const finishAttempt = () => {
      clearTimeout(recordingSilenceTimeoutRef.current)
      if (hasScored || recognitionRef.current !== recognition) return
      if (!latestSpoken) { recognition.stop(); return }
      hasScored = true
      const attempt = scoreAttempt(activeSentence, latestSpoken)
      setResult(attempt)
      saveSentenceScore(activeIndex, attempt)
      recognition.stop()
      if (attempt.overall >= 90 && activeIndex < sentences.length - 1) {
        const nextScores = [...sentenceScores]
        nextScores[activeIndex] = attempt
        const nextIndex = firstIncompleteSentence(nextScores, sentences.length, activeIndex + 1)
        if (nextIndex !== -1) { setActiveIndex(nextIndex); setTranscript(''); setResult(null) }
      }
    }
    finishRecordingRef.current = finishAttempt
    recognition.lang = 'en-US'; recognition.interimResults = true; recognition.continuous = true; recognition.maxAlternatives = 3
    recognition.onstart = () => { if (recognitionRef.current === recognition) setIsRecording(true) }
    recognition.onresult = (event) => {
      if (recognitionRef.current !== recognition) return
      const spoken = Array.from(event.results).map((item) => {
        const candidates = Array.from(item, (alternative) => alternative.transcript)
        return candidates.reduce((best, candidate) => scoreAttempt(activeSentence, candidate).overall > scoreAttempt(activeSentence, best).overall ? candidate : best)
      }).join(' ')
      latestSpoken = spoken
      setTranscript(spoken)
      clearTimeout(recordingSilenceTimeoutRef.current)
      recordingSilenceTimeoutRef.current = setTimeout(finishAttempt, 2000)
    }
    recognition.onerror = (event) => {
      if (recognitionRef.current !== recognition || event.error === 'aborted') return
      const messages = {
        'no-speech': '没有听到可识别的语音。请靠近麦克风，用正常音量完整说一句英文；语音识别会使用浏览器或 Windows 的默认输入设备，请将测试成功的麦克风设为默认设备后重试。',
        'audio-capture': '语音识别无法读取麦克风。请关闭正在使用麦克风的其他程序后重试。',
        'not-allowed': '语音识别未获准访问麦克风。请在地址栏的站点权限中允许麦克风访问。',
        'service-not-allowed': '当前浏览器不允许使用在线语音识别服务。请使用最新版 Chrome 或 Edge。',
        network: '语音识别服务需要网络连接。请检查网络后重试。',
      }
      setNotice(messages[event.error] || `语音识别未能完成（${event.error}）。请重试。`)
    }
    recognition.onend = () => { if (recognitionRef.current === recognition) { setIsRecording(false); finishRecordingRef.current = null } }
    microphoneStreamRef.current?.getTracks().forEach((track) => track.stop())
    microphoneStreamRef.current = null
    recognitionRef.current = recognition; recognition.start()
  }
  const retryAttempt = () => {
    clearTimeout(recordingSilenceTimeoutRef.current)
    recognitionRef.current?.abort()
    recognitionRef.current = null
    setIsRecording(false); setTranscript(''); setResult(null); setNotice('')
    startRecording()
  }
  const changeSentence = (step) => {
    const next = activeIndex + step
    if (next >= 0 && next < sentences.length) { setActiveIndex(next); setTranscript(''); setResult(sentenceScores[next] || null) }
  }

  const resumePractice = (savedText, savedPractice) => {
    const savedSentences = Array.isArray(savedPractice.sentences) ? savedPractice.sentences : splitIntoSentences(savedText)
    setText(savedText)
    saveTrainingText(savedText)
    restorePractice(savedText, savedSentences)
    setActiveView('practice')
  }

  const practiceEntries = Object.entries(trainingProgress).filter(([, practice]) => Array.isArray(practice?.sentences) && Array.isArray(practice?.scores))

  return <main className="app-shell">
    <header className="topbar"><a className="brand" href="#top" onClick={() => setActiveView('practice')}><span className="brand-mark"><Sparkles size={18} /></span><span>Echo English</span></a><button className="history-button" onClick={() => setActiveView(activeView === 'practice' ? 'history' : 'practice')}><History size={16} />{activeView === 'practice' ? '练习历史' : '返回练习'}</button></header>
    {activeView === 'history' ? <section className="history-page" id="top"><div className="history-heading"><div><p className="eyebrow">LOCAL HISTORY</p><h1>练习历史</h1><p>每句话只保留本机缓存中的最佳得分。</p></div><span>{practiceEntries.length} 篇</span></div>{practiceEntries.length ? <div className="history-list">{practiceEntries.map(([savedText, practice], practiceIndex) => <article className="history-entry" key={savedText}><div className="history-entry-heading"><div><p className="eyebrow">练习 {practiceIndex + 1}</p><h2>{savedText.slice(0, 88)}{savedText.length > 88 ? '...' : ''}</h2></div><button className="secondary-button" onClick={() => resumePractice(savedText, practice)}>继续练习 <ChevronRight size={17} /></button></div><ol className="history-scores">{practice.sentences.map((sentence, sentenceIndex) => { const score = practice.scores[sentenceIndex]; return <li key={`${sentenceIndex}-${sentence}`}><span className="history-sentence">{sentence}</span><span className={`history-score ${score?.overall >= 90 ? 'complete' : ''}`}>{score ? `${score.overall} 分` : '未测试'}</span></li> })}</ol></article>)}</div> : <div className="history-empty"><History size={24} /><h2>还没有已评分的练习</h2><p>完成一次跟读后，每句话的最高分会保存在这台设备的浏览器中。</p></div>}</section> : <>
    <section className="workspace" id="top">
      <aside className="editor-panel"><div className="panel-heading"><div><p className="eyebrow">YOUR SCRIPT</p><h1>输入你的练习内容</h1></div><button className="help-button" title="评分说明" aria-label="评分说明"><CircleHelp size={18} /></button></div>
        <p className="editor-hint">输入一段英文，网站会自动拆分为逐句练习。</p>
        <details className="device-settings"><summary>设备设置</summary><div className="speaker-picker"><label htmlFor="speaker">播放设备</label><div><select id="speaker" value={selectedSpeaker} onChange={(event) => selectSpeaker(event.target.value)} disabled={!speakers.length}><option value="">系统默认播放设备</option>{speakers.map((speaker, index) => <option key={speaker.deviceId} value={speaker.deviceId}>{speaker.label || `扬声器 ${index + 1}`}</option>)}</select><button className="detect-button" onClick={loadDevices} disabled={isRecording || isTestingMicrophone}>刷新设备</button></div><p>原生朗读由浏览器输出到系统默认设备。</p></div><div className="microphone-picker"><div className="microphone-test-copy"><label>麦克风</label><p>使用 Windows 或浏览器当前的默认输入设备。</p></div><button className="detect-button" onClick={testMicrophone} disabled={isRecording}>{isTestingMicrophone ? '结束测试' : '测试麦克风'}</button>{isTestingMicrophone && <div className="microphone-level" aria-label={`麦克风音量 ${microphoneLevel}%`}><span style={{ width: `${microphoneLevel}%` }} /></div>}</div></details>
        <textarea value={text} onChange={(event) => setText(event.target.value)} aria-label="英文练习文本" placeholder="Paste an English paragraph here..." />
        {trainingHistory.length > 0 && <div className="saved-training-texts"><label htmlFor="saved-training-text">最近练习</label><select id="saved-training-text" defaultValue="" onChange={(event) => { if (event.target.value) setText(event.target.value); event.target.value = '' }}><option value="" disabled>打开本机保存的文本</option>{trainingHistory.map((saved, index) => <option key={saved} value={saved}>{`练习 ${index + 1}: ${saved.slice(0, 54)}${saved.length > 54 ? '...' : ''}`}</option>)}</select></div>}
        <div className="editor-footer"><span>{splitIntoSentences(text).length} sentences</span><div className="editor-actions"><button className="generate-button" onClick={generatePracticeSentences}><Sparkles size={16} />随机 10 句</button><button className="primary-button" onClick={prepareText}>开始练习 <ChevronRight size={17} /></button></div></div>
      </aside>
      <section className="practice-panel" aria-live="polite"><div className="session-header"><div><p className="eyebrow">SHADOWING SESSION</p><h2>逐句跟读</h2></div><div className="sentence-count">{activeIndex + 1} <span>/ {sentences.length}</span></div></div>
        <div className="progress-track"><span style={{ width: `${progress}%` }} /></div>
        <article className={`sentence-card ${sentenceStatus}`}><span className="quote-mark">“</span><p>{activeSentence || '准备好后，从左侧输入英文文本。'}</p><button className="listen-button" onClick={isPlaying ? () => { window.speechSynthesis?.cancel(); setIsPlaying(false) } : speak} disabled={!activeSentence}>{isPlaying ? <Pause size={18} fill="currentColor" /> : <Volume2 size={19} />}{isPlaying ? '停止播放' : '听原句'}</button></article>
        <div className="record-area"><button className={`record-button ${isRecording ? 'recording' : ''}`} onClick={isRecording ? () => finishRecordingRef.current?.() : startRecording} disabled={!activeSentence} aria-label={isRecording ? '停止录音' : '开始录音'}>{isRecording ? <X size={28} /> : <Mic size={29} />}</button><div><h3>{isRecording ? '正在聆听...' : '按下并开始跟读'}</h3><p>{isRecording ? '说完后再次点击停止录音' : '请允许浏览器使用麦克风'}</p></div></div>
        {notice && <p className="notice">{notice}</p>}
        {transcript && <div className="transcript-box"><p className="eyebrow">识别到的内容</p><p>{transcript}</p></div>}
        {result && <section className="score-card"><div className="score-ring"><strong>{result.overall}</strong><span>分</span></div><div className="score-copy"><p className="eyebrow">本句表现</p><h3>{result.overall >= 85 ? '表达很自然' : result.overall >= 65 ? '继续保持节奏' : '再试一次，会更好'}</h3><div className="metrics"><span>词汇准确度 <b>{result.accuracy}%</b></span><span>节奏匹配 <b>{result.pace}%</b></span></div></div>{result.overall < 90 ? <button className="secondary-button" onClick={retryAttempt}><RotateCcw size={17} />重新挑战</button> : <button className="icon-button" onClick={() => { setTranscript(''); setResult(null) }} title="重新跟读" aria-label="重新跟读"><RotateCcw size={19} /></button>}</section>}
        <div className="navigation"><button className="secondary-button" onClick={() => changeSentence(-1)} disabled={activeIndex === 0}><ChevronLeft size={18} /> 上一句</button><button className="secondary-button" onClick={() => changeSentence(1)} disabled={activeIndex === sentences.length - 1}>下一句 <ChevronRight size={18} /></button></div>
      </section>
    </section>
    <footer><Check size={15} /> 使用浏览器本地语音能力，录音不会上传。</footer>
    </>}
  </main>
}

export default App
