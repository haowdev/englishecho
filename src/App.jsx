import { useEffect, useRef, useState } from 'react'
import { Check, ChevronLeft, ChevronRight, History, Keyboard, Mic, Pause, RotateCcw, Sparkles, Trash2, Volume2, X } from 'lucide-react'
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
const defaultPassingScore = 80
const religiousContentPattern = /\b(?:allah|angel|bible|buddha|buddhist|christ|christian|church|divine|faith|god|goddess|heaven|hell|hindu|islam|jesus|mosque|muslim|pope|prayer|pray|priest|prophet|quran|religion|religious|scripture|spiritual|synagogue|temple|worship)\b/i
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
const firstIncompleteSentence = (scores, count, passingScore, startAt = 0) => {
  const index = Array.from({ length: count }, (_, sentenceIndex) => sentenceIndex).findIndex((sentenceIndex) => sentenceIndex >= startAt && (!scores[sentenceIndex] || scores[sentenceIndex].overall < passingScore))
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
  const [isGenerating, setIsGenerating] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [result, setResult] = useState(null)
  const [notice, setNotice] = useState('')
  const [trainingProgress, setTrainingProgress] = useState(readTrainingProgress)
  const [trainingHistory, setTrainingHistory] = useState(readTrainingHistory)
  const [activeView, setActiveView] = useState('start')
  const [sentenceScores, setSentenceScores] = useState([])
  const [passingScore, setPassingScore] = useState(80)
  const [isSavedPractice, setIsSavedPractice] = useState(false)
  const [selectedWord, setSelectedWord] = useState('')
  const [wordLookup, setWordLookup] = useState({ word: '', status: 'idle', translation: '' })
  const [isNativeDictation, setIsNativeDictation] = useState(false)
  const recognitionRef = useRef(null)
  const wordAudioRef = useRef(null)
  const nativeDictationInputRef = useRef(null)
  const recordingSilenceTimeoutRef = useRef(null)
  const finishRecordingRef = useRef(null)
  const activeSentence = sentences[activeIndex] ?? ''
  const activeScore = sentenceScores[activeIndex]?.overall
  const sentenceStatus = activeScore === undefined ? 'unread' : activeScore >= passingScore ? 'excellent' : activeScore <= 70 ? 'needs-work' : 'in-progress'
  const progress = sentences.length ? ((activeIndex + 1) / sentences.length) * 100 : 0
  const isPracticeComplete = sentences.length > 0 && sentences.every((_, index) => sentenceScores[index]?.overall >= passingScore)
  const canProceedToNext = activeScore >= passingScore
  const scoreTotal = sentenceScores.reduce((total, score) => total + (score?.overall ?? 0), 0)
  const averageScore = isPracticeComplete ? Math.round(scoreTotal / sentences.length) : 0

  const practiceStateRef = useRef({
    text,
    sentences,
    activeIndex,
    activeSentence,
    sentenceScores,
    passingScore,
    isSavedPractice,
  })
  practiceStateRef.current = {
    text,
    sentences,
    activeIndex,
    activeSentence,
    sentenceScores,
    passingScore,
    isSavedPractice,
  }

  const closeRecognitionSession = () => {
    clearTimeout(recordingSilenceTimeoutRef.current)
    recordingSilenceTimeoutRef.current = null
    finishRecordingRef.current = null
    setIsRecording(false)
    const current = recognitionRef.current
    if (current) {
      current.onstart = null
      current.onresult = null
      current.onerror = null
      current.onend = null
      try { current.stop() } catch {}
    }
  }

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        wordAudioRef.current?.pause()
        window.speechSynthesis?.cancel()
        closeRecognitionSession()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      wordAudioRef.current?.pause()
      window.speechSynthesis?.cancel()
      closeRecognitionSession()
    }
  }, [])

  useEffect(() => {
    if (activeView !== 'practice' || isPracticeComplete) {
      closeRecognitionSession()
    }
  }, [activeView, isPracticeComplete])

  useEffect(() => {
    setSelectedWord('')
  }, [activeSentence])

  useEffect(() => {
    if (!selectedWord) {
      setWordLookup({ word: '', status: 'idle', translation: '' })
      return undefined
    }
    const controller = new AbortController()
    setWordLookup({ word: selectedWord, status: 'loading', translation: '' })
    const lookUpWord = async () => {
      try {
        const response = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(selectedWord)}&langpair=en|zh-CN`, { signal: controller.signal })
        if (!response.ok) throw new Error('Unable to translate word')
        const data = await response.json()
        const translation = data.responseData?.translatedText?.trim()
        setWordLookup({
          word: selectedWord,
          status: translation ? 'ready' : 'unavailable',
          translation: translation || '暂时没有找到中文释义',
        })
      } catch (error) {
        if (error.name !== 'AbortError') setWordLookup({ word: selectedWord, status: 'unavailable', translation: '暂时无法查询中文释义' })
      }
    }
    lookUpWord()
    return () => controller.abort()
  }, [selectedWord])

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
    closeRecognitionSession()
    const savedScores = readSentenceScores(nextText, nextSentences)
    const incompleteIndex = firstIncompleteSentence(savedScores, nextSentences.length, passingScore)
    setSentences(nextSentences)
    setSelectedWord('')
    setSentenceScores(savedScores)
    setActiveIndex(incompleteIndex === -1 ? 0 : incompleteIndex)
    setTranscript(''); setResult(null)
    setNotice(incompleteIndex === -1 ? `本篇练习的所有句子均已达到 ${passingScore} 分。` : savedScores.length ? `已恢复本机成绩，从第 ${incompleteIndex + 1} 句继续。` : `${nextSentences.length} 个句子已准备好。`)
  }
  const saveSentenceScore = (sentenceIndex, attempt) => {
    const { text: currentText, sentences: currentSentences, isSavedPractice: currentIsSaved } = practiceStateRef.current
    setSentenceScores((previous) => {
      const next = [...previous]
      const savedAttempt = next[sentenceIndex]?.overall > attempt.overall ? next[sentenceIndex] : attempt
      next[sentenceIndex] = savedAttempt
      if (!currentIsSaved) return next
      const progress = readTrainingProgress()
      progress[currentText] = { sentences: currentSentences, scores: next }
      try { window.localStorage.setItem(trainingProgressStorageKey, JSON.stringify(progress)) } catch {}
      setTrainingProgress(progress)
      return next
    })
  }
  const prepareText = () => {
    const nextSentences = splitIntoSentences(text)
    if (!nextSentences.length) { setNotice('请输入至少一个英文句子。'); return }
    setIsSavedPractice(true)
    saveTrainingText(text)
    restorePractice(text, nextSentences)
    setActiveView('practice')
  }
  const pickPracticeSentences = (items) => [...new Set(items)]
    .filter((sentence) => sentence.length >= minimumSentenceLength)
    .filter((sentence) => !religiousContentPattern.test(sentence))
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
    setIsSavedPractice(false)
    restorePractice(generatedText, nextSentences)
    setNotice(nextSentences.length === 10 ? '' : '未能准备足够的练习句子，请再试一次。')
    setIsGenerating(false)
    if (nextSentences.length) setActiveView('practice')
  }
  const speakWordWithTTS = (word) => {
    if (!window.speechSynthesis) return
    try {
      window.speechSynthesis.cancel()
      window.speechSynthesis.resume?.()
      const utterance = new SpeechSynthesisUtterance(word)
      utterance.lang = 'en-US'
      utterance.rate = 0.85
      const voices = window.speechSynthesis.getVoices?.() ?? []
      const englishVoice = voices.find((v) => v.lang === 'en-US' || v.lang === 'en_US') || voices.find((v) => v.lang?.startsWith('en'))
      if (englishVoice) utterance.voice = englishVoice
      window.speechSynthesis.speak(utterance)
    } catch {}
  }
  const speakWord = (word) => {
    if (!word) return
    closeRecognitionSession()
    window.speechSynthesis?.cancel()
    try {
      if (!wordAudioRef.current) {
        wordAudioRef.current = new Audio()
      }
      const audio = wordAudioRef.current
      audio.pause()
      audio.src = `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(word)}&type=2`
      const playPromise = audio.play()
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(() => speakWordWithTTS(word))
      }
    } catch {
      speakWordWithTTS(word)
    }
  }
  const renderSentenceWords = (sentence) => (sentence.match(/[A-Za-z]+(?:'[A-Za-z]+)?|[^A-Za-z]+/g) ?? []).map((part, index) => {
    if (!/^[A-Za-z]+(?:'[A-Za-z]+)?$/.test(part)) return <span key={`${part}-${index}`}>{part}</span>
    const word = part.toLowerCase()
    return <button className={`sentence-word ${selectedWord === word ? 'selected' : ''}`} key={`${part}-${index}`} onClick={() => { setSelectedWord(word); speakWord(word) }} aria-label={`查询并朗读 ${part}`}>{part}</button>
  })
  const startNativeDictation = () => {
    closeRecognitionSession()
    wordAudioRef.current?.pause()
    window.speechSynthesis?.cancel()
    setIsNativeDictation(true)
    setTranscript('')
    setResult(null)
    setNotice('请使用系统英文键盘上的听写按钮说出这句话（或直接输入），然后点击评分。')
    requestAnimationFrame(() => nativeDictationInputRef.current?.focus())
  }
  const scoreNativeDictation = () => {
    const spoken = transcript.trim()
    if (!spoken) { setNotice('请先完成听写。'); return }
    const attempt = scoreAttempt(activeSentence, spoken)
    setResult(attempt)
    saveSentenceScore(activeIndex, attempt)
    setIsNativeDictation(false)
    setNotice('')
    if (attempt.overall >= passingScore && activeIndex < sentences.length - 1) {
      const nextScores = [...sentenceScores]
      nextScores[activeIndex] = attempt
      const nextIndex = firstIncompleteSentence(nextScores, sentences.length, passingScore, activeIndex + 1)
      if (nextIndex !== -1) { setActiveIndex(nextIndex); setTranscript(''); setResult(null) }
    }
  }
  const startRecording = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) { startNativeDictation(); return }
    clearTimeout(recordingSilenceTimeoutRef.current)
    recordingSilenceTimeoutRef.current = null
    finishRecordingRef.current = null
    if (wordAudioRef.current && !wordAudioRef.current.paused) {
      wordAudioRef.current.pause()
    }
    if (window.speechSynthesis?.speaking || window.speechSynthesis?.pending) {
      window.speechSynthesis.cancel()
    }
    setIsNativeDictation(false)
    setTranscript('')
    setResult(null)
    setNotice('')

    if (!recognitionRef.current) {
      recognitionRef.current = new SpeechRecognition()
    }
    const recognition = recognitionRef.current
    const targetSentence = activeSentence
    const targetIndex = activeIndex
    let latestSpoken = ''
    let hasFinalized = false
    let isStopping = false

    const finalizeAttempt = () => {
      if (hasFinalized) return
      hasFinalized = true
      clearTimeout(recordingSilenceTimeoutRef.current)
      recordingSilenceTimeoutRef.current = null
      finishRecordingRef.current = null
      setIsRecording(false)
      const spoken = latestSpoken.trim()
      if (!spoken) return
      const { sentences: currentSentences, sentenceScores: currentScores, passingScore: currentPassingScore } = practiceStateRef.current
      const attempt = scoreAttempt(targetSentence, spoken)
      setResult(attempt)
      saveSentenceScore(targetIndex, attempt)
      if (attempt.overall >= currentPassingScore && targetIndex < currentSentences.length - 1) {
        const nextScores = [...currentScores]
        nextScores[targetIndex] = attempt
        const nextIndex = firstIncompleteSentence(nextScores, currentSentences.length, currentPassingScore, targetIndex + 1)
        if (nextIndex !== -1) {
          setActiveIndex(nextIndex)
          setTranscript('')
          setResult(null)
        }
      }
    }

    const stopAttempt = () => {
      clearTimeout(recordingSilenceTimeoutRef.current)
      recordingSilenceTimeoutRef.current = null
      if (hasFinalized || isStopping) return
      isStopping = true
      try {
        recognition.stop()
      } catch {
        finalizeAttempt()
        return
      }
      recordingSilenceTimeoutRef.current = setTimeout(finalizeAttempt, 1000)
    }

    finishRecordingRef.current = stopAttempt

    recognition.lang = 'en-US'
    recognition.interimResults = true
    recognition.continuous = true
    recognition.maxAlternatives = 3

    recognition.onstart = () => {
      if (hasFinalized) return
      setIsRecording(true)
      clearTimeout(recordingSilenceTimeoutRef.current)
      recordingSilenceTimeoutRef.current = setTimeout(() => {
        if (!latestSpoken.trim() && !hasFinalized) {
          stopAttempt()
          setNotice('未检测到语音输入，已自动退出录音。')
        }
      }, 8000)
    }

    recognition.onresult = (event) => {
      if (hasFinalized) return
      const spoken = Array.from(event.results)
        .map((item) => {
          const candidates = Array.from(item, (alternative) => alternative?.transcript ?? '').filter(Boolean)
          if (!candidates.length) return ''
          return candidates.reduce((best, candidate) =>
            scoreAttempt(targetSentence, candidate).overall > scoreAttempt(targetSentence, best).overall ? candidate : best
          )
        })
        .join(' ')
        .trim()
      if (!spoken) return
      latestSpoken = spoken
      setTranscript(spoken)
      if (isStopping) return
      clearTimeout(recordingSilenceTimeoutRef.current)
      const targetWordCount = normalizeWords(targetSentence).length
      const spokenWordCount = normalizeWords(spoken).length
      const isComplete = targetWordCount > 0 && spokenWordCount >= targetWordCount
      recordingSilenceTimeoutRef.current = setTimeout(stopAttempt, isComplete ? 900 : 1500)
    }

    recognition.onerror = (event) => {
      if (hasFinalized) return
      if (event.error === 'aborted' || isStopping || latestSpoken.trim()) {
        return
      }
      const messages = {
        'no-speech': '没有听到可识别的语音。请靠近麦克风重试，或点击右侧键盘图标使用系统键盘听写。',
        'audio-capture': '语音识别无法读取麦克风。请关闭正在使用麦克风的其他程序，或切换键盘听写。',
        'not-allowed': '语音识别未获准访问麦克风。请在浏览器权限中允许麦克风访问，或切换键盘听写。',
        'service-not-allowed': '当前浏览器限制了网页语音识别服务，已为您切换至系统键盘听写模式。',
        network: '语音识别服务需要网络连接。请检查网络后重试，或切换键盘听写。',
      }
      if (event.error === 'service-not-allowed') {
        startNativeDictation()
        return
      }
      setNotice(messages[event.error] || `语音识别未能完成（${event.error}）。请重试。`)
      stopAttempt()
    }

    recognition.onend = () => {
      finalizeAttempt()
    }

    setIsRecording(true)
    try {
      recognition.start()
    } catch {
      try {
        const freshRecognition = new SpeechRecognition()
        freshRecognition.lang = 'en-US'
        freshRecognition.interimResults = true
        freshRecognition.continuous = true
        freshRecognition.maxAlternatives = 3
        freshRecognition.onstart = recognition.onstart
        freshRecognition.onresult = recognition.onresult
        freshRecognition.onerror = recognition.onerror
        freshRecognition.onend = recognition.onend
        recognitionRef.current = freshRecognition
        freshRecognition.start()
      } catch {
        finalizeAttempt()
        setNotice('无法启动语音识别，请稍后再试或使用右侧键盘听写。')
      }
    }
  }
  const retryAttempt = () => {
    startRecording()
  }
  const changeSentence = (step) => {
    const next = activeIndex + step
    if (step > 0 && !canProceedToNext) {
      setNotice(`本句达到 ${passingScore} 分后才能进入下一句。`)
      return
    }
    if (next >= 0 && next < sentences.length) {
      closeRecognitionSession()
      setActiveIndex(next)
      setTranscript('')
      setResult(sentenceScores[next] || null)
    }
  }

  const resumePractice = (savedText, savedPractice = readTrainingProgress()[savedText]) => {
    const savedSentences = Array.isArray(savedPractice?.sentences) ? savedPractice.sentences : splitIntoSentences(savedText)
    setText(savedText)
    setIsSavedPractice(true)
    saveTrainingText(savedText)
    restorePractice(savedText, savedSentences)
    setActiveView('practice')
  }
  const clearTrainingHistory = () => {
    if (!window.confirm('确定清空本机保存的所有练习和成绩吗？此操作无法撤销。')) return
    window.localStorage.removeItem(trainingHistoryStorageKey)
    window.localStorage.removeItem(trainingProgressStorageKey)
    window.localStorage.removeItem(trainingLastPracticeStorageKey)
    setTrainingHistory([])
    setTrainingProgress({})
    setIsSavedPractice(false)
  }
  const practiceEntries = trainingHistory.map((savedText) => [savedText, trainingProgress[savedText] ?? { sentences: splitIntoSentences(savedText), scores: [] }])

  return <main className="app-shell">
    <header className="topbar"><a className="brand" href="#top" onClick={() => setActiveView('start')}><span className="brand-mark" aria-hidden="true"><span className="echo-core" /><span className="echo-wave echo-wave-near" /><span className="echo-wave echo-wave-far" /></span><span>Echo English</span></a>{activeView !== 'start' && <div className="history-actions">{activeView === 'history' && <button className="history-button" onClick={clearTrainingHistory} title="清空本机记录"><Trash2 size={16} />清空本机记录</button>}<button className="history-button" onClick={() => setActiveView(activeView === 'history' ? 'start' : 'history')}><History size={16} />{activeView === 'history' ? '返回首页' : '练习历史'}</button></div>}</header>
    {activeView === 'start' && <div className="start-score-setting"><label className="passing-score">最低分 <input type="number" min="50" max="100" value={passingScore} onChange={(event) => setPassingScore(Math.max(50, Math.min(100, Number(event.target.value) || 50)))} /> <span>分</span></label></div>}
    {activeView === 'start' ? <section className="start-page" id="top"><div className="start-heading"><p className="eyebrow">SPEAKING PRACTICE</p><h1>今天想怎样练习？</h1><p>选择一种方式，马上开始逐句跟读。</p></div><div className="start-options"><button className="start-option" onClick={generatePracticeSentences} disabled={isGenerating}><span className="start-option-icon"><Sparkles size={22} /></span><span><b>{isGenerating ? '正在准备...' : '随机 10 句话'}</b><small>从英文句库中随机挑选练习内容</small></span><ChevronRight size={20} /></button><button className="start-option" onClick={() => setActiveView('history')} disabled={!trainingHistory.length}><span className="start-option-icon"><History size={22} /></span><span><b>继续以前的练习</b><small>{trainingHistory.length ? `选择已保存的练习（最多保存 5 篇）` : '还没有可以继续的练习'}</small></span><ChevronRight size={20} /></button><button className="start-option" onClick={() => { setText(''); setNotice(''); setActiveView('input') }}><span className="start-option-icon"><Mic size={22} /></span><span><b>输入新的句子开始</b><small>粘贴英文内容，系统会自动按句拆分</small></span><ChevronRight size={20} /></button></div></section> : activeView === 'history' ? <section className="history-page" id="top"><div className="history-heading"><div><p className="eyebrow">SAVED PRACTICES</p><h1>选择以前的练习</h1><p>最多保存 5 篇练习；每句话会保留本机最高得分。</p></div><span>{practiceEntries.length} / 5 篇</span></div>{practiceEntries.length ? <div className="history-list">{practiceEntries.map(([savedText, practice], practiceIndex) => <article className="history-entry" key={savedText}><div className="history-entry-heading"><div><p className="eyebrow">练习 {practiceIndex + 1}</p><h2>{savedText.slice(0, 88)}{savedText.length > 88 ? '...' : ''}</h2></div><button className="secondary-button" onClick={() => resumePractice(savedText, practice)}>继续练习 <ChevronRight size={17} /></button></div><ol className="history-scores">{practice.sentences.map((sentence, sentenceIndex) => { const score = practice.scores[sentenceIndex]; return <li key={`${sentenceIndex}-${sentence}`}><span className="history-sentence">{sentence}</span><span className={`history-score ${score?.overall >= 90 ? 'complete' : ''}`}>{score ? `${score.overall} 分` : '未测试'}</span></li> })}</ol></article>)}</div> : <div className="history-empty"><History size={24} /><h2>还没有已保存的练习</h2><p>开始一次练习后，它会保存在这台设备的浏览器中。</p></div>}</section> : <>
    <section className={`workspace ${activeView === 'practice' ? 'practice-workspace' : 'input-workspace'}`} id="top">
      {activeView === 'input' && <aside className="editor-panel"><div className="panel-heading"><div><p className="eyebrow">YOUR SCRIPT</p><h1>输入你的练习内容</h1></div></div>
        <p className="editor-hint">输入一段英文，网站会自动拆分为逐句练习。</p>
        <textarea value={text} onChange={(event) => setText(event.target.value)} aria-label="英文练习文本" placeholder="Paste an English paragraph here..." />
        <div className="editor-footer"><span>{splitIntoSentences(text).length} sentences</span><div className="editor-actions"><button className="generate-button" onClick={generatePracticeSentences} disabled={isGenerating}>{isGenerating ? <Pause size={16} /> : <Sparkles size={16} />}{isGenerating ? '正在寻找...' : '网上随机 10 句'}</button><button className="primary-button" onClick={prepareText}>开始练习 <ChevronRight size={17} /></button></div></div>
      </aside>}
          {activeView === 'practice' && <section className="practice-panel" aria-live="polite"><div className="session-header"><div><p className="eyebrow">SHADOWING SESSION</p><h2>逐句跟读</h2></div><div className="sentence-count">{activeIndex + 1} <span>/ {sentences.length}</span></div></div>
        {isPracticeComplete ? <section className="completion-panel"><p className="eyebrow">SESSION COMPLETE</p><h3>本次平均得分</h3><div className="completion-donut"><svg viewBox="0 0 120 120" aria-label={`平均得分 ${averageScore} 分`} role="img"><circle className="donut-track" cx="60" cy="60" r="48" pathLength="100" /><circle className="donut-value" cx="60" cy="60" r="48" pathLength="100" strokeDasharray={`${averageScore} ${100 - averageScore}`} /></svg><div><strong>{averageScore}</strong><span>分</span></div></div><p className="completion-detail">总分 {scoreTotal} ÷ {sentences.length} 句</p></section> : <><div className="progress-track"><span style={{ width: `${progress}%` }} /></div>
        <article className={`sentence-card ${sentenceStatus}`}><span className="quote-mark">“</span><p>{activeSentence ? renderSentenceWords(activeSentence) : '准备好后，从左侧输入英文文本。'}</p>{selectedWord && <div className="word-lookup" role="status"><div><span>{selectedWord}</span><strong>{wordLookup.word === selectedWord && wordLookup.status === 'loading' ? '正在查询中文释义...' : wordLookup.translation}</strong></div><button className="word-listen-button" onClick={() => speakWord(selectedWord)} title="朗读单词" aria-label={`朗读 ${selectedWord}`}><Volume2 size={18} /></button></div>}</article>
        <div className="record-area"><button className={`record-button ${isRecording ? 'recording' : ''}`} onClick={isRecording ? () => finishRecordingRef.current?.() : startRecording} disabled={!activeSentence} aria-label={isRecording ? '停止录音' : '开始录音'}>{isRecording ? <X size={28} /> : <Mic size={29} />}</button><div><h3>{isRecording ? '正在聆听...' : isNativeDictation ? '使用系统键盘听写' : '按下并开始跟读'}</h3><p>{isRecording ? '说完后再次点击停止录音' : isNativeDictation ? '完成后点击评分' : '请允许浏览器使用麦克风，或用右侧键盘听写'}</p></div><div className="record-controls"><button className={`dictation-toggle-button ${isNativeDictation ? 'active' : ''}`} onClick={() => { if (isNativeDictation) { setIsNativeDictation(false); setNotice('') } else { startNativeDictation() } }} disabled={!activeSentence || isRecording} title={isNativeDictation ? '关闭键盘听写' : '使用键盘听写'} aria-label={isNativeDictation ? '关闭键盘听写' : '使用键盘听写'}><Keyboard size={18} /></button></div></div>
        {isNativeDictation && <div className="native-dictation"><textarea ref={nativeDictationInputRef} value={transcript} onChange={(event) => setTranscript(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); scoreNativeDictation() } }} rows="3" lang="en-US" autoCapitalize="sentences" placeholder="Use the English keyboard dictation..." aria-label="系统键盘听写结果" /><div><button className="secondary-button" onClick={() => { setIsNativeDictation(false); setNotice('') }}>取消</button><button className="primary-button" onClick={scoreNativeDictation}>评分 <ChevronRight size={17} /></button></div></div>}
        {notice && <p className="notice">{notice}</p>}
        {transcript && <div className="transcript-box"><p className="eyebrow">识别到的内容</p><p>{transcript}</p></div>}
        {result && <section className="score-card"><div className="score-ring"><strong>{result.overall}</strong><span>分</span></div><div className="score-copy"><p className="eyebrow">本句表现</p><h3>{result.overall >= passingScore ? '已达到通关标准' : '再试一次，会更好'}</h3><div className="metrics"><span>词汇准确度 <b>{result.accuracy}%</b></span><span>节奏匹配 <b>{result.pace}%</b></span></div></div>{result.overall < passingScore ? <button className="secondary-button" onClick={retryAttempt}><RotateCcw size={17} />重新挑战</button> : <button className="icon-button" onClick={retryAttempt} title="重新跟读" aria-label="重新跟读"><RotateCcw size={19} /></button>}</section>}
        <nav className="navigation" aria-label="切换练习句子"><button className="sentence-nav-button previous" onClick={() => changeSentence(-1)} disabled={isRecording || activeIndex === 0}><ChevronLeft size={18} /><span>上一句</span></button><button className="sentence-nav-button next" onClick={() => changeSentence(1)} disabled={isRecording || activeIndex === sentences.length - 1 || !canProceedToNext}><span>下一句</span><ChevronRight size={18} /></button></nav></>}
      </section>}
    </section>
    {activeView === 'practice' && <footer><Check size={15} /> 使用浏览器本地语音能力，录音不会上传。</footer>}
    </>}
  </main>
}

export default App