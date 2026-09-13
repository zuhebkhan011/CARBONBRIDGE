import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { assistantApi } from '../../api/assistant';
import './CarbonBridgeAssistant.css';

export function CarbonBridgeAssistant() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [micNotice, setMicNotice] = useState('');
  const [onboardingCard, setOnboardingCard] = useState(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [isNewUser, setIsNewUser] = useState(false);

  const messagesEndRef = useRef(null);
  const chatBodyRef = useRef(null);
  const panelRef = useRef(null);
  const prevMessageCountRef = useRef(0);
  const recognitionRef = useRef(null);
  const inputRef = useRef(null);

  const userRole = user?.role || 'BUYER';
  const userId = user?.id || 'guest';
  const dismissalKey = `cb_onboarding_dismissed_${userId}`;

  // Check onboarding on mount
  useEffect(() => {
    if (!user) return;

    const hasDismissed = localStorage.getItem(dismissalKey) === 'true';

    assistantApi.getOnboarding()
      .then((res) => {
        const data = res?.data?.data || res?.data || res;
        if (data?.onboardingCard) {
          setOnboardingCard(data.onboardingCard);
        }
        if (data?.isNewUser) {
          setIsNewUser(true);
          if (!hasDismissed) {
            setShowOnboarding(true);
          }
        }
        if (data?.starterResponse && messages.length === 0) {
          setConversationId(data.starterResponse.conversationId);
          setMessages([
            {
              role: 'assistant',
              content: data.starterResponse.reply,
              suggestedActions: data.starterResponse.suggestedActions,
              relatedFeatures: data.starterResponse.relatedFeatures,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            },
          ]);
        }
      })
      .catch(() => {
        // Fallback initial greeting if backend is warming up
        if (messages.length === 0) {
          setMessages([
            {
              role: 'assistant',
              content:
                userRole === 'SELLER'
                  ? 'Welcome to CarbonBridge! 👋 I can help you register batches, verify quality with CoA AI, create listings, and optimize transport routes.'
                  : 'Welcome to CarbonBridge! 👋 I can help you post CO₂ requirements, use AI Smart Matching, explore listings, and track deliveries.',
              suggestedActions:
                userRole === 'SELLER'
                  ? [
                      { label: 'Register Batch', action: 'REGISTER_BATCH', path: '/seller/batches/new' },
                      { label: 'Create Listing', action: 'CREATE_LISTING', path: '/seller/listings/new' },
                    ]
                  : [
                      { label: 'Post Requirement', action: 'POST_REQUIREMENT', path: '/requirements/new' },
                      { label: 'Browse Marketplace', action: 'MARKETPLACE', path: '/marketplace' },
                    ],
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            },
          ]);
        }
      });
  }, [user, userRole, dismissalKey]);

  // Handle controlled scrolling without clipping onboarding header
  useEffect(() => {
    if (!isOpen || isMinimized) return;

    // Guard against panel container itself having scrollTop
    if (panelRef.current) {
      panelRef.current.scrollTop = 0;
    }

    if (!chatBodyRef.current) return;

    // When opened with onboarding active, keep scrollTop = 0 so the entire onboarding card is visible
    if (showOnboarding && messages.length <= 1) {
      chatBodyRef.current.scrollTop = 0;
      prevMessageCountRef.current = messages.length;
      return;
    }

    // Scroll chat body only when new messages are appended
    if (messages.length > prevMessageCountRef.current) {
      chatBodyRef.current.scrollTo({
        top: chatBodyRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
    prevMessageCountRef.current = messages.length;
  }, [messages, isOpen, isMinimized, showOnboarding]);

  // Initialize Speech Recognition if supported
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'en-IN'; // Works well for English, Indian English, and Hinglish

      recognition.onstart = () => {
        setIsListening(true);
        setMicNotice('');
      };

      recognition.onresult = (event) => {
        const transcript = Array.from(event.results)
          .map((res) => res[0].transcript)
          .join('');
        setInputText(transcript);
      };

      recognition.onerror = (event) => {
        setIsListening(false);
        if (event.error === 'not-allowed') {
          setMicNotice('Microphone access was denied. Please allow microphone permissions to speak.');
        } else {
          setMicNotice('Could not recognize speech. You can type your question.');
        }
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, []);

  const handleToggleMic = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setMicNotice("Voice input isn't supported in this browser. You can type your question instead.");
      setTimeout(() => setMicNotice(''), 6000);
      return;
    }

    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    } else {
      try {
        setMicNotice('');
        recognitionRef.current?.start();
      } catch {
        recognitionRef.current?.stop();
      }
    }
  };

  const handleSendMessage = async (customText) => {
    const messageToSend = (customText || inputText).trim();
    if (!messageToSend || loading) return;

    setInputText('');
    setMicNotice('');

    // Add user message to thread
    const userMsg = {
      role: 'user',
      content: messageToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    try {
      const res = await assistantApi.chat(messageToSend, conversationId, userRole);
      const data = res?.data?.data || res?.data || res;

      if (data?.conversationId) {
        setConversationId(data.conversationId);
      }

      const assistantMsg = {
        role: 'assistant',
        content: data?.reply || "I'm having trouble retrieving a response right now. Please try again or browse the platform navigation.",
        suggestedActions: data?.suggestedActions || [],
        relatedFeatures: data?.relatedFeatures || [],
        intent: data?.intent,
        isPersonalized: data?.isPersonalized,
        source: data?.source,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: "I'm having trouble connecting to AI services right now. You can still use CarbonBridge normally using the menu.",
          suggestedActions:
            userRole === 'BUYER'
              ? [{ label: 'Post Requirement', action: 'POST_REQUIREMENT', path: '/requirements/new' }]
              : [{ label: 'Create Listing', action: 'CREATE_LISTING', path: '/seller/listings/new' }],
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleActionClick = (action) => {
    if (action.path) {
      navigate(action.path);
      setIsMinimized(true);
    }
  };

  const handleDismissOnboarding = () => {
    setShowOnboarding(false);
    localStorage.setItem(dismissalKey, 'true');
  };

  const handleResetConversation = () => {
    setConversationId('');
    setMessages([
      {
        role: 'assistant',
        content:
          userRole === 'SELLER'
            ? 'Conversation reset. How can I help you with your captured CO₂ lots, auctions, or transport today?'
            : 'Conversation reset. How can I help you with CO₂ procurement, requirements, or smart matching today?',
        suggestedActions:
          userRole === 'SELLER'
            ? [
                { label: 'Register Batch', action: 'REGISTER_BATCH', path: '/seller/batches/new' },
                { label: 'Smart Logistics', action: 'LOGISTICS', path: '/seller/logistics' },
              ]
            : [
                { label: 'Post Requirement', action: 'POST_REQUIREMENT', path: '/requirements/new' },
                { label: 'Smart Matchmaker', action: 'SMART_MATCHING', path: '/dashboard' },
              ],
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ]);
  };

  if (!user) return null;

  return (
    <div className="cb-assistant-wrapper">
      {/* Compact Circular Floating Launcher Button */}
      {!isOpen && (
        <button
          className="cb-assistant-launcher"
          onClick={() => {
            setIsOpen(true);
            setIsMinimized(false);
          }}
          title="CarbonBridge Assistant"
          aria-label="Open CarbonBridge Assistant"
        >
          <div className="cb-launcher-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2a8 8 0 0 0-8 8c0 3.31 2.01 6.16 4.9 7.37L8 22l4.9-1.63A8.001 8.001 0 0 0 20 10a8 8 0 0 0-8-8z" />
              <circle cx="9" cy="10" r="1" fill="currentColor" />
              <circle cx="15" cy="10" r="1" fill="currentColor" />
              <path d="M9.5 14c.83.67 1.67 1 2.5 1s1.67-.33 2.5-1" />
            </svg>
          </div>
          {isNewUser && <span className="cb-launcher-ping" />}
        </button>
      )}

      {/* Floating Assistant Panel */}
      {isOpen && (
        <div ref={panelRef} className={`cb-assistant-panel ${isMinimized ? 'minimized' : ''} ${isMaximized ? 'maximized' : ''}`}>
          {/* Header */}
          <div
            className="cb-assistant-header"
            onClick={isMinimized ? () => setIsMinimized(false) : undefined}
            style={isMinimized ? { cursor: 'pointer' } : undefined}
          >
            <div className="cb-header-left">
              <div className="cb-header-avatar">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2a8 8 0 0 0-8 8c0 3.31 2.01 6.16 4.9 7.37L8 22l4.9-1.63A8.001 8.001 0 0 0 20 10a8 8 0 0 0-8-8z" />
                </svg>
              </div>
              <div>
                <h3 className="cb-header-title">CarbonBridge Assistant</h3>
                <div className="cb-role-tag">
                  <span className="cb-status-dot" />
                  {userRole} Mode
                </div>
              </div>
            </div>

            <div className="cb-header-actions">
              <button
                className="cb-btn-icon"
                onClick={(e) => {
                  e.stopPropagation();
                  handleResetConversation();
                }}
                title="Reset conversation"
                aria-label="Reset conversation"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
                  <path d="M21 3v5h-5" />
                  <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
                  <path d="M3 21v-5h5" />
                </svg>
              </button>
              <button
                className="cb-btn-icon cb-btn-minimize"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsMinimized(!isMinimized);
                }}
                title={isMinimized ? 'Restore assistant' : 'Minimize assistant'}
                aria-label="Minimize assistant"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </button>
              <button
                className="cb-btn-icon cb-btn-maximize"
                onClick={(e) => {
                  e.stopPropagation();
                  if (isMinimized) setIsMinimized(false);
                  setIsMaximized(!isMaximized);
                }}
                title={isMaximized ? 'Restore assistant' : 'Maximize assistant'}
                aria-label="Maximize assistant"
              >
                {isMaximized ? (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 14h6v6m10-10h-6V4m0 6 7-7M3 21l7-7" />
                  </svg>
                ) : (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
                  </svg>
                )}
              </button>
              <button
                className="cb-btn-icon cb-btn-close"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsOpen(false);
                  setIsMinimized(false);
                  setIsMaximized(false);
                }}
                title="Close assistant"
                aria-label="Close assistant"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          </div>

          {!isMinimized && (
            <>
              {/* Scrollable Assistant Body */}
              <div className="cb-assistant-body" ref={chatBodyRef}>
                {/* Onboarding Banner Card */}
                {showOnboarding && onboardingCard && (
                <div className="cb-onboarding-banner">
                  <div className="cb-onboarding-header">
                    <div>
                      <h4 className="cb-onboarding-title">{onboardingCard.title}</h4>
                      <p className="cb-onboarding-sub">{onboardingCard.subtitle}</p>
                    </div>
                    <button
                      className="cb-dismiss-btn"
                      onClick={handleDismissOnboarding}
                      title="Dismiss onboarding"
                    >
                      Dismiss
                    </button>
                  </div>
                  <div className="cb-onboarding-steps">
                    {onboardingCard.steps.slice(0, 3).map((s) => (
                      <div key={s.step} className="cb-onboarding-step-item">
                        <span className="cb-step-num">{s.step}</span>
                        <div className="cb-step-content">
                          <strong>{s.title}</strong>
                          <p>{s.description}</p>
                          {s.action && (
                            <button
                              className="cb-step-action-link"
                              onClick={() => handleActionClick(s.action)}
                            >
                              {s.action.label} &rarr;
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Quick Prompts Chips */}
              <div className="cb-quick-chips">
                <button
                  className="cb-chip"
                  onClick={() => handleSendMessage(userRole === 'BUYER' ? 'I am a Buyer' : 'I am a Seller')}
                >
                  {userRole === 'BUYER' ? "I'm a Buyer" : "I'm a Seller"}
                </button>
                <button
                  className="cb-chip"
                  onClick={() => handleSendMessage('How does CarbonBridge work?')}
                >
                  How CarbonBridge works
                </button>
                <button
                  className="cb-chip"
                  onClick={() => handleSendMessage(userRole === 'BUYER' ? 'How do I buy CO2?' : 'How do I sell CO2?')}
                >
                  {userRole === 'BUYER' ? 'How to buy CO₂' : 'How to sell CO₂'}
                </button>
                <button
                  className="cb-chip"
                  onClick={() => handleSendMessage('Smart Matching kaise kaam karta hai?')}
                >
                  Smart Matching
                </button>
              </div>

              {/* Messages Thread */}
              <div className="cb-messages-container">
                {messages.map((msg, index) => (
                  <div key={index} className={`cb-message-row ${msg.role}`}>
                    {msg.role === 'assistant' && (
                      <div className="cb-msg-avatar">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M12 2a8 8 0 0 0-8 8c0 3.31 2.01 6.16 4.9 7.37L8 22l4.9-1.63A8.001 8.001 0 0 0 20 10a8 8 0 0 0-8-8z" />
                        </svg>
                      </div>
                    )}
                    <div className="cb-message-bubble">
                      {msg.isPersonalized && (
                        <div className="cb-personalized-badge">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                            <circle cx="12" cy="7" r="4" />
                          </svg>
                          <span>Personalized Insight</span>
                        </div>
                      )}
                      <div className="cb-message-text">
                        {msg.content.split('\n').map((line, i) => (
                          <p key={i}>
                            {line.startsWith('• ') ? (
                              <span className="cb-bullet-line">{line}</span>
                            ) : (
                              line
                            )}
                          </p>
                        ))}
                      </div>

                      {/* Suggested Action Buttons */}
                      {msg.suggestedActions && msg.suggestedActions.length > 0 && (
                        <div className="cb-action-buttons-group">
                          {msg.suggestedActions.map((act, actIdx) => (
                            <button
                              key={actIdx}
                              className="cb-action-button"
                              onClick={() => handleActionClick(act)}
                            >
                              <span>{act.label}</span>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <line x1="5" y1="12" x2="19" y2="12" />
                                <polyline points="12 5 19 12 12 19" />
                              </svg>
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Related Features Tags */}
                      {msg.relatedFeatures && msg.relatedFeatures.length > 0 && (
                        <div className="cb-feature-tags">
                          {msg.relatedFeatures.map((tag, tagIdx) => (
                            <span key={tagIdx} className="cb-feature-tag">
                              #{tag.toLowerCase().replace(/_/g, '-')}
                            </span>
                          ))}
                        </div>
                      )}

                      <span className="cb-message-time">{msg.timestamp}</span>
                    </div>
                  </div>
                ))}

                {loading && (
                  <div className="cb-message-row assistant">
                    <div className="cb-msg-avatar">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 2a8 8 0 0 0-8 8c0 3.31 2.01 6.16 4.9 7.37L8 22l4.9-1.63A8.001 8.001 0 0 0 20 10a8 8 0 0 0-8-8z" />
                      </svg>
                    </div>
                    <div className="cb-message-bubble loading">
                      <div className="cb-typing-indicator">
                        <span />
                        <span />
                        <span />
                      </div>
                      <span className="cb-typing-label">Analyzing CarbonBridge workflows...</span>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            </div>

            {/* Notice / Mic State Banner */}
            {micNotice && (
                <div className="cb-notice-banner">
                  <span>{micNotice}</span>
                  <button onClick={() => setMicNotice('')}>&times;</button>
                </div>
              )}

              {/* Input Area */}
              <div className="cb-assistant-footer">
                <div className="cb-input-container">
                  <textarea
                    ref={inputRef}
                    rows="1"
                    className="cb-assistant-input"
                    placeholder={
                      isListening
                        ? 'Listening to speech... Speak now'
                        : 'Ask CarbonBridge Assistant in English, Hindi or Hinglish...'
                    }
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyDown={handleKeyDown}
                  />

                  {/* Microphone Button */}
                  <button
                    type="button"
                    className={`cb-mic-button ${isListening ? 'listening' : ''}`}
                    onClick={handleToggleMic}
                    title={isListening ? 'Stop listening' : 'Speak your question (English / Hindi / Hinglish)'}
                    aria-label="Microphone Voice Input"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                      <line x1="12" y1="19" x2="12" y2="23" />
                      <line x1="8" y1="23" x2="16" y2="23" />
                    </svg>
                  </button>

                  {/* Send Button */}
                  <button
                    type="button"
                    className="cb-send-button"
                    disabled={!inputText.trim() || loading}
                    onClick={() => handleSendMessage()}
                    title="Send message"
                    aria-label="Send message"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="22" y1="2" x2="11" y2="13" />
                      <polygon points="22 2 15 22 11 13 2 9 22 2" />
                    </svg>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
