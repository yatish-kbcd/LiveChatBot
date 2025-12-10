import { useState, useRef, useEffect } from 'react';

function App() {
  const [isStreaming, setIsStreaming] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isContinuous, setIsContinuous] = useState(false);
  const recognitionRef = useRef(null);
  const synthRef = useRef(null);



  useEffect(() => {
    // Initialize speech recognition
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = 'en-US';

      recognitionRef.current.onstart = () => setIsListening(true);
      recognitionRef.current.onend = () => {
        setIsListening(false);
        if (isContinuous) {
          // Restart listening after a short delay if in continuous mode
          setTimeout(() => {
            if (isContinuous && !isSpeaking && !isStreaming) {
              startListening();
            }
          }, 500);
        }
      };
      recognitionRef.current.onresult = (event) => {
        const transcript = event.results[event.results.length - 1][0].transcript;
        handleSend(transcript);
      };
      recognitionRef.current.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
        if (isContinuous) {
          // Try to restart listening after error in continuous mode
          setTimeout(() => {
            if (isContinuous && !isSpeaking && !isStreaming) {
              startListening();
            }
          }, 1000);
        }
      };
    }

    // Initialize speech synthesis
    if ('speechSynthesis' in window) {
      synthRef.current = window.speechSynthesis;
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      if (synthRef.current) {
        synthRef.current.cancel();
      }
    };
  }, []);

  const handleSend = async (message) => {
    setIsStreaming(true);

    try {
      const response = await fetch('http://localhost:3001/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message }),
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullResponse = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        fullResponse += chunk;
      }

      // Automatically speak the response
      speakMessage(fullResponse);
    } catch (error) {
      console.error('Error:', error);
      speakMessage('Sorry, I encountered an error. Please try again.');
    } finally {
      setIsStreaming(false);
    }
  };

  const startListening = () => {
    if (recognitionRef.current && !isListening) {
      recognitionRef.current.start();
    }
  };

  const startContinuousConversation = () => {
    setIsContinuous(true);
    startListening();
  };

  const stopContinuousConversation = () => {
    setIsContinuous(false);
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    stopSpeaking();
  };

  const speakMessage = (text) => {
    if (synthRef.current && text) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => {
        setIsSpeaking(false);
        if (isContinuous && !isStreaming) {
          // Restart listening after speaking in continuous mode
          setTimeout(() => startListening(), 300);
        }
      };
      synthRef.current.speak(utterance);
    }
  };

  const stopSpeaking = () => {
    if (synthRef.current) {
      synthRef.current.cancel();
      setIsSpeaking(false);
    }
  };

  return (
    <div className="h-screen flex flex-col bg-gray-100">
      <header className="bg-blue-500 text-white p-4">
        <h1 className="text-xl font-bold">Voice Assistant</h1>
      </header>

      <div className="flex-1 flex flex-col items-center justify-center p-8">
        <div className="text-center space-y-8">
          {/* Status Indicators */}
          <div className="space-y-4">
            {isListening && (
              <div className="text-2xl text-red-600 flex items-center justify-center space-x-2">
                <span className="animate-pulse">🎤</span>
                <span className="animate-pulse">Listening...</span>
              </div>
            )}

            {isStreaming && (
              <div className="text-2xl text-blue-600 flex items-center justify-center space-x-2">
                <span className="animate-spin">⏳</span>
                <span>Processing...</span>
              </div>
            )}

            {isSpeaking && (
              <div className="text-2xl text-green-600 flex items-center justify-center space-x-2">
                <span className="animate-pulse">🔊</span>
                <span>Speaking...</span>
              </div>
            )}
          </div>

          {/* Control Buttons */}
          {!isContinuous ? (
            <>
              {/* Start Continuous Conversation Button */}
              <button
                onClick={startContinuousConversation}
                disabled={isStreaming || isListening || isSpeaking}
                className={`w-32 h-32 rounded-full text-6xl transition-all duration-200 focus:outline-none focus:ring-4 cursor-pointer focus:ring-blue-300 ${
                  isListening
                    ? 'bg-red-500 text-white animate-pulse'
                    : isStreaming || isSpeaking
                    ? 'bg-gray-400 text-gray-200 cursor-not-allowed'
                    : 'bg-blue-500 text-white hover:bg-blue-600 active:scale-95'
                }`}
              >
                🎤
              </button>

              <p className="text-gray-600 text-lg">
                {!isListening && !isStreaming && !isSpeaking
                  ? 'Tap to start continuous conversation'
                  : 'Please wait...'}
              </p>
            </>
          ) : (
            <>
              {/* Stop Continuous Conversation Button */}
              <button
                onClick={stopContinuousConversation}
                className="px-8 py-4 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors duration-200 focus:outline-none focus:ring-4 focus:ring-red-300 text-xl font-semibold"
              >
                Stop Conversation
              </button>

              <p className="text-gray-600 text-lg">
                Continuous conversation active - listening for your questions...
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
