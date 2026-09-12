import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Reusable speech-to-text hook utilizing Web Speech API.
 * Configured with 'en-IN' for seamless English, Hindi, and Hinglish recognition.
 *
 * @param {Object} options
 * @param {(transcript: string) => void} options.onTranscript Callback invoked as speech is recognized
 * @param {string} [options.lang='en-IN'] Language code (defaults to en-IN for Indian English / Hindi / Hinglish)
 * @param {string} [options.defaultErrorMessage] Fallback error message
 */
export function useSpeechRecognition({
  onTranscript,
  lang = 'en-IN',
  defaultErrorMessage = 'Could not recognize speech. You can type your requirement instead.',
} = {}) {
  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(true);
  const [micNotice, setMicNotice] = useState('');
  const recognitionRef = useRef(null);

  // Keep latest onTranscript in a ref so useEffect does not re-run on parent re-renders
  const onTranscriptRef = useRef(onTranscript);
  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);

  useEffect(() => {
    const SpeechRecognition =
      typeof window !== 'undefined' &&
      (window.SpeechRecognition || window.webkitSpeechRecognition);

    if (!SpeechRecognition) {
      setIsSupported(false);
      return;
    }

    setIsSupported(true);
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = lang;

    recognition.onstart = () => {
      setIsListening(true);
      setMicNotice('');
    };

    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((res) => res[0].transcript)
        .join('');
      if (onTranscriptRef.current) {
        onTranscriptRef.current(transcript);
      }
    };

    recognition.onerror = (event) => {
      setIsListening(false);
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        setMicNotice('Microphone permission was denied. You can type your requirement instead.');
      } else if (event.error === 'no-speech') {
        setMicNotice('No speech was detected. You can speak again or type your requirement.');
      } else {
        setMicNotice(defaultErrorMessage);
      }
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // ignore cleanup errors
        }
      }
    };
  }, [lang, defaultErrorMessage]);

  const toggleListening = useCallback(() => {
    const SpeechRecognition =
      typeof window !== 'undefined' &&
      (window.SpeechRecognition || window.webkitSpeechRecognition);

    if (!SpeechRecognition) {
      setMicNotice("Voice input isn't supported in this browser. You can type your requirement instead.");
      setTimeout(() => setMicNotice(''), 6000);
      return;
    }

    if (isListening) {
      try {
        recognitionRef.current?.stop();
      } catch {
        // ignore
      }
      setIsListening(false);
    } else {
      try {
        setMicNotice('');
        recognitionRef.current?.start();
      } catch {
        try {
          recognitionRef.current?.stop();
        } catch {
          // ignore
        }
      }
    }
  }, [isListening]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current && isListening) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
      setIsListening(false);
    }
  }, [isListening]);

  return {
    isListening,
    isSupported,
    micNotice,
    setMicNotice,
    toggleListening,
    stopListening,
  };
}
