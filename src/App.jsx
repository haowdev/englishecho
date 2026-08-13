import { useEffect, useRef, useState } from 'react'
import { Check, ChevronLeft, ChevronRight, History, Mic, Pause, RotateCcw, Sparkles, Volume2, X } from 'lucide-react'
import './App.css'
import './theme.css'

const practiceSentenceBank = [
  'Every time you pause to notice the exact words people use, you give yourself a stronger path toward speaking English with clarity and confidence.',
  'A patient learner understands that steady practice on ordinary days creates the confidence needed for difficult conversations later.',
  'When you listen for the rhythm of a sentence instead of translating each word, English begins to sound more natural and memorable.',
  'Small improvements are easy to overlook, but they gradually turn a hesitant speaker into someone who can share ideas with ease.',
  'The most useful question in a conversation is often a simple one that invites the other person to explain what matters to them.',
  'Reading aloud for a few focused minutes each day helps your mouth become familiar with sounds that once felt unfamiliar.',
  'You do not need perfect vocabulary to communicate well when you pay attention, speak clearly, and respond with genuine curiosity.',
  'A thoughtful pause can make your next sentence more precise, and it gives your listener time to follow your meaning.',
  'People remember how a conversation made them feel, so kindness and careful listening are as valuable as accurate grammar.',
  'The best way to prepare for an unexpected question is to build the habit of explaining your everyday thoughts in English.',
  'Progress becomes easier to see when you compare your current speaking habits with the person you were a few weeks ago.',
  'Each new expression becomes more useful when you connect it to a real situation you might describe to a friend or colleague.',
]
const onlineQuoteUrl = 'https://dummyjson.com/quotes?limit=200&skip='
const minimumSentenceLength = 70
const trainingHistoryStorageKey = 'echo-english.training-history'
const trainingProgressStorageKey = 'echo-english.training-progress'
const trainingLastPracticeStorageKey = 'echo-english.last-practice'
const splitIntoSentences = (text) => (text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? []).map((sentence) => sentence.trim()).filter(Boolean)
const normalizeWords = (text) => text.toLowerCase().match(/[a-z]+(?:'[a-z]+)?/g) ?? []
const functionWords = new Set(['a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'for', 'from', 'he', 'her', 'his', 'i', 'in', 'is', 'it', 'me', 'my', 'of', 'on', 'or', 'our', 'she', 'that', 'the', 'their', 'them', 'they', 'to', 'was', 'we', 'were', 'with', 'you', 'your'])
const readTrainingHistory = () => {
  try {
    const saved = JSON.parse(window.localStorage.getItem(trainingHistoryStorageKey) || '[]')
    return Array.isArray(saved) ? saved.filter((item) => typeof item === 'string').slice(0, 5) : []
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
  const [text, setText] = useState('')
  const [sentences, setSentences] = useState([])
  const [activeIndex, setActiveIndex] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [result, setResult] = useState(null)
  const [notice, setNotice] = useState('')
  const [trainingProgress, setTrainingProgress] = useState(readTrainingProgress)
  const [trainingHistory, setTrainingHistory] = useState(readTrainingHistory)
  const [activeView, setActiveView] = useState('start')
  const [sentenceScores, setSentenceScores] = useState([])
  const recognitionRef = useRef(null)
  const microphoneStreamRef = useRef(null)
  const recordingSilenceTimeoutRef = useRef(null)
  const finishRecordingRef = useRef(null)
  const activeSentence = sentences[activeIndex] ?? ''
  const activeScore = sentenceScores[activeIndex]?.overall
  const sentenceStatus = activeScore === undefined ? 'unread' : activeScore >= 90 ? 'excellent' : activeScore <= 70 ? 'needs-work' : 'in-progress'
  const progress = sentences.length ? ((activeIndex + 1) / sentences.length) * 100 : 0
  const scoredSentenceCount = sentenceScores.filter((score) => typeof score?.overall === 'number').length
  const isPracticeComplete = sentences.length > 0 && scoredSentenceCount === sentences.length
  const scoreTotal = sentenceScores.reduce((total, score) => total + (score?.overall ?? 0), 0)
  const averageScore = isPracticeComplete ? Math.round(scoreTotal / sentences.length) : 0

  useEffect(() => () => {
    window.speechSynthesis?.cancel()
    recognitionRef.current?.abort()
    microphoneStreamRef.current?.getTracks().forEach((track) => track.stop())
    clearTimeout(recordingSilenceTimeoutRef.current)
  }, [])

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
    const next = [value, ...readTrainingHistory().filter((saved) => saved !== value)].slice(0, 5)
    const progress = readTrainingProgress()
    Object.keys(progress).forEach((savedText) => {
      if (!next.includes(savedText)) delete progress[savedText]
    })
    try {
      window.localStorage.setItem(trainingHistoryStorageKey, JSON.stringify(next))
      window.localStorage.setItem(trainingLastPracticeStorageKey, value)
      window.localStorage.setItem(trainingProgressStorageKey, JSON.stringify(progress))
    } catch {}
    setTrainingHistory(next)
    setTrainingProgress(progress)
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
    setActiveView('practice')
  }
  const pickPracticeSentences = (items) => [...new Set(items)]
    .filter((sentence) => sentence.length >= minimumSentenceLength)
    .sort(() => Math.random() - 0.5)
    .slice(0, 10)
  const generatePracticeSentences = async () => {
    setIsGenerating(true)
    let nextSentences = []
    try {
      const skip = Math.floor(Math.random() * 1254)
      const response = await fetch(`${onlineQuoteUrl}${skip}`)
      if (!response.ok) throw new Error('Unable to load online quotes')
      const data = await response.json()
      nextSentences = pickPracticeSentences((data.quotes ?? []).flatMap(({ quote }) => splitIntoSentences(quote)))
    } catch {
      nextSentences = []
    }
    if (nextSentences.length < 10) nextSentences = pickPracticeSentences(practiceSentenceBank)
    const generatedText = nextSentences.join(' ')
    setText(generatedText)
    saveTrainingText(generatedText)
    restorePractice(generatedText, nextSentences)
    setNotice(nextSentences.length === 10 ? '' : '未能准备足够的练习句子，请再试一次。')
    setIsGenerating(false)
    if (nextSentences.length) setActiveView('practice')
  }
  const speak = () => {
    if (!activeSentence || !window.speechSynthesis) return
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(activeSentence)
    utterance.lang = 'en-US'; utterance.rate = 0.84
    utterance.onstart = () => setIsPlaying(true); utterance.onend = () => setIsPlaying(false); utterance.onerror = () => setIsPlaying(false)
    window.speechSynthesis.speak(utterance)
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

  const resumePractice = (savedText, savedPractice = readTrainingProgress()[savedText]) => {
    const savedSentences = Array.isArray(savedPractice?.sentences) ? savedPractice.sentences : splitIntoSentences(savedText)
    setText(savedText)
    saveTrainingText(savedText)
    restorePractice(savedText, savedSentences)
    setActiveView('practice')
  }
  const practiceEntries = trainingHistory.map((savedText) => [savedText, trainingProgress[savedText] ?? { sentences: splitIntoSentences(savedText), scores: [] }])

  return <main className="app-shell">
    <header className="topbar"><a className="brand" href="#top" onClick={() => setActiveView('start')}><span className="brand-mark" aria-hidden="true"><span className="echo-core" /><span className="echo-wave echo-wave-near" /><span className="echo-wave echo-wave-far" /></span><span>Echo English</span></a>{activeView !== 'start' && <button className="history-button" onClick={() => setActiveView(activeView === 'history' ? 'start' : 'history')}><History size={16} />{activeView === 'history' ? '返回首页' : '练习历史'}</button>}</header>
    {activeView === 'start' ? <section className="start-page" id="top"><div className="start-heading"><p className="eyebrow">SPEAKING PRACTICE</p><h1>今天想怎样练习？</h1><p>选择一种方式，马上开始逐句跟读。</p></div><div className="start-options"><button className="start-option" onClick={generatePracticeSentences} disabled={isGenerating}><span className="start-option-icon"><Sparkles size={22} /></span><span><b>{isGenerating ? '正在准备...' : '随机 10 句话'}</b><small>从英文句库中随机挑选练习内容</small></span><ChevronRight size={20} /></button><button className="start-option" onClick={() => setActiveView('history')} disabled={!trainingHistory.length}><span className="start-option-icon"><History size={22} /></span><span><b>继续以前的练习</b><small>{trainingHistory.length ? `选择已保存的练习（最多保存 5 篇）` : '还没有可以继续的练习'}</small></span><ChevronRight size={20} /></button><button className="start-option" onClick={() => { setText(''); setNotice(''); setActiveView('input') }}><span className="start-option-icon"><Mic size={22} /></span><span><b>输入新的句子开始</b><small>粘贴英文内容，系统会自动按句拆分</small></span><ChevronRight size={20} /></button></div></section> : activeView === 'history' ? <section className="history-page" id="top"><div className="history-heading"><div><p className="eyebrow">SAVED PRACTICES</p><h1>选择以前的练习</h1><p>最多保存 5 篇练习；每句话会保留本机最高得分。</p></div><span>{practiceEntries.length} / 5 篇</span></div>{practiceEntries.length ? <div className="history-list">{practiceEntries.map(([savedText, practice], practiceIndex) => <article className="history-entry" key={savedText}><div className="history-entry-heading"><div><p className="eyebrow">练习 {practiceIndex + 1}</p><h2>{savedText.slice(0, 88)}{savedText.length > 88 ? '...' : ''}</h2></div><button className="secondary-button" onClick={() => resumePractice(savedText, practice)}>继续练习 <ChevronRight size={17} /></button></div><ol className="history-scores">{practice.sentences.map((sentence, sentenceIndex) => { const score = practice.scores[sentenceIndex]; return <li key={`${sentenceIndex}-${sentence}`}><span className="history-sentence">{sentence}</span><span className={`history-score ${score?.overall >= 90 ? 'complete' : ''}`}>{score ? `${score.overall} 分` : '未测试'}</span></li> })}</ol></article>)}</div> : <div className="history-empty"><History size={24} /><h2>还没有已保存的练习</h2><p>开始一次练习后，它会保存在这台设备的浏览器中。</p></div>}</section> : <>
    <section className={`workspace ${activeView === 'practice' ? 'practice-workspace' : 'input-workspace'}`} id="top">
      {activeView === 'input' && <aside className="editor-panel"><div className="panel-heading"><div><p className="eyebrow">YOUR SCRIPT</p><h1>输入你的练习内容</h1></div></div>
        <p className="editor-hint">输入一段英文，网站会自动拆分为逐句练习。</p>
        <textarea value={text} onChange={(event) => setText(event.target.value)} aria-label="英文练习文本" placeholder="Paste an English paragraph here..." />
        <div className="editor-footer"><span>{splitIntoSentences(text).length} sentences</span><div className="editor-actions"><button className="generate-button" onClick={generatePracticeSentences} disabled={isGenerating}>{isGenerating ? <Pause size={16} /> : <Sparkles size={16} />}{isGenerating ? '正在寻找...' : '网上随机 10 句'}</button><button className="primary-button" onClick={prepareText}>开始练习 <ChevronRight size={17} /></button></div></div>
      </aside>}
      {activeView === 'practice' && <section className="practice-panel" aria-live="polite"><div className="session-header"><div><p className="eyebrow">SHADOWING SESSION</p><h2>逐句跟读</h2></div><div className="sentence-count">{activeIndex + 1} <span>/ {sentences.length}</span></div></div>
        {isPracticeComplete ? <section className="completion-panel"><p className="eyebrow">SESSION COMPLETE</p><h3>本次平均得分</h3><div className="completion-donut"><svg viewBox="0 0 120 120" aria-label={`平均得分 ${averageScore} 分`} role="img"><circle className="donut-track" cx="60" cy="60" r="48" pathLength="100" /><circle className="donut-value" cx="60" cy="60" r="48" pathLength="100" strokeDasharray={`${averageScore} ${100 - averageScore}`} /></svg><div><strong>{averageScore}</strong><span>分</span></div></div><p className="completion-detail">总分 {scoreTotal} ÷ {sentences.length} 句</p></section> : <><div className="progress-track"><span style={{ width: `${progress}%` }} /></div>
        <article className={`sentence-card ${sentenceStatus}`}><span className="quote-mark">“</span><p>{activeSentence || '准备好后，从左侧输入英文文本。'}</p><button className="listen-button" onClick={isPlaying ? () => { window.speechSynthesis?.cancel(); setIsPlaying(false) } : speak} disabled={!activeSentence || isRecording}>{isPlaying ? <Pause size={18} fill="currentColor" /> : <Volume2 size={19} />}{isPlaying ? '停止播放' : '听原句'}</button></article>
        <div className="record-area"><button className={`record-button ${isRecording ? 'recording' : ''}`} onClick={isRecording ? () => finishRecordingRef.current?.() : startRecording} disabled={!activeSentence} aria-label={isRecording ? '停止录音' : '开始录音'}>{isRecording ? <X size={28} /> : <Mic size={29} />}</button><div><h3>{isRecording ? '正在聆听...' : '按下并开始跟读'}</h3><p>{isRecording ? '说完后再次点击停止录音' : '请允许浏览器使用麦克风'}</p></div></div>
        {notice && <p className="notice">{notice}</p>}
        {transcript && <div className="transcript-box"><p className="eyebrow">识别到的内容</p><p>{transcript}</p></div>}
        {result && <section className="score-card"><div className="score-ring"><strong>{result.overall}</strong><span>分</span></div><div className="score-copy"><p className="eyebrow">本句表现</p><h3>{result.overall >= 85 ? '表达很自然' : result.overall >= 65 ? '继续保持节奏' : '再试一次，会更好'}</h3><div className="metrics"><span>词汇准确度 <b>{result.accuracy}%</b></span><span>节奏匹配 <b>{result.pace}%</b></span></div></div>{result.overall < 90 ? <button className="secondary-button" onClick={retryAttempt}><RotateCcw size={17} />重新挑战</button> : <button className="icon-button" onClick={() => { setTranscript(''); setResult(null) }} title="重新跟读" aria-label="重新跟读"><RotateCcw size={19} /></button>}</section>}
        <nav className="navigation" aria-label="切换练习句子"><button className="sentence-nav-button previous" onClick={() => changeSentence(-1)} disabled={isRecording || activeIndex === 0}><ChevronLeft size={18} /><span>上一句</span></button><button className="sentence-nav-button next" onClick={() => changeSentence(1)} disabled={isRecording || activeIndex === sentences.length - 1}><span>下一句</span><ChevronRight size={18} /></button></nav></>}
      </section>}
    </section>
    {activeView === 'practice' && <footer><Check size={15} /> 使用浏览器本地语音能力，录音不会上传。</footer>}
    </>}
  </main>
}

export default App
