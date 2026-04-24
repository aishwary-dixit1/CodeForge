import React, { useEffect, useRef, useState } from 'react';
import './App.css';

const DEFAULT_CODE = {
  python3: 'print("Hello, CodeForge!")',
  nodejs20: 'console.log("Hello, CodeForge!");',
  java17: 'public class Main {\n  public static void main(String[] args) {\n    System.out.println("Hello, CodeForge!");\n  }\n}',
  cpp20: '#include <iostream>\nusing namespace std;\nint main() {\n  cout << "Hello, CodeForge!" << endl;\n  return 0;\n}'
};

function App() {
  const [language, setLanguage] = useState('python3');
  const [code, setCode] = useState(DEFAULT_CODE.python3);
  const [stdin, setStdin] = useState('');
  const [expectedOutput, setExpectedOutput] = useState('');
  const [actualOutput, setActualOutput] = useState('');
  const [status, setStatus] = useState('IDLE');
  const [runtimeMs, setRuntimeMs] = useState(0);
  const [exitCode, setExitCode] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [leftPanelWidth, setLeftPanelWidth] = useState(58);
  const [rightPanelRows, setRightPanelRows] = useState([26, 24, 28, 22]);
  const [dragState, setDragState] = useState(null);

  const mainContentRef = useRef(null);
  const rightPanelRef = useRef(null);

  const API_BASE_URL = 'http://localhost:3000';

  useEffect(() => {
    if (!dragState) {
      return undefined;
    }

    const handleMouseMove = (event) => {
      if (dragState.type === 'main') {
        const container = mainContentRef.current;
        if (!container) {
          return;
        }

        const rect = container.getBoundingClientRect();
        const deltaPercent = ((event.clientX - dragState.startX) / rect.width) * 100;
        const nextWidth = Math.min(78, Math.max(28, dragState.initialLeftWidth + deltaPercent));
        setLeftPanelWidth(nextWidth);
      }

      if (dragState.type === 'right') {
        const panel = rightPanelRef.current;
        if (!panel) {
          return;
        }

        const rect = panel.getBoundingClientRect();
        const totalUnits = dragState.initialRows.reduce((sum, value) => sum + value, 0);
        const deltaUnits = ((event.clientY - dragState.startY) / rect.height) * totalUnits;

        const minRowSize = 12;
        const nextRows = [...dragState.initialRows];
        const current = dragState.index;

        let first = dragState.initialRows[current] + deltaUnits;
        let second = dragState.initialRows[current + 1] - deltaUnits;

        if (first < minRowSize) {
          const diff = minRowSize - first;
          first = minRowSize;
          second -= diff;
        }

        if (second < minRowSize) {
          const diff = minRowSize - second;
          second = minRowSize;
          first -= diff;
        }

        nextRows[current] = first;
        nextRows[current + 1] = second;
        setRightPanelRows(nextRows);
      }
    };

    const handleMouseUp = () => setDragState(null);

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragState]);

  const handleLanguageChange = (e) => {
    const newLanguage = e.target.value;
    setLanguage(newLanguage);
    setCode(DEFAULT_CODE[newLanguage]);
  };

  const handleSubmit = async () => {
    if (!code.trim()) {
      alert('Please write some code!');
      return;
    }

    setIsLoading(true);
    setStatus('SUBMITTING');
    setActualOutput('');
    setExitCode(null);

    try {
      const payload = {
        language,
        code,
        stdin,
        timeout_sec: 10
      };

      if (expectedOutput.trim().length > 0) {
        payload.expected_output = expectedOutput;
      }

      // Submit code
      const submitResponse = await fetch(`${API_BASE_URL}/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!submitResponse.ok) {
        let errorMessage = `Failed to submit code (HTTP ${submitResponse.status})`;
        try {
          const errorData = await submitResponse.json();
          if (Array.isArray(errorData.errors) && errorData.errors.length > 0) {
            errorMessage = errorData.errors.map((item) => item.msg).join(', ');
          } else if (errorData.error) {
            errorMessage = errorData.error;
          }
        } catch (_parseError) {
          // Keep the default message if backend response is not JSON.
        }
        throw new Error(errorMessage);
      }

      const submitData = await submitResponse.json();
      setStatus('QUEUED');

      // Poll for result
      const pollInterval = setInterval(async () => {
        try {
          const pollResponse = await fetch(`${API_BASE_URL}/execute/${submitData.submission_id}`);

          if (!pollResponse.ok) {
            throw new Error('Failed to fetch result');
          }

          const resultData = await pollResponse.json();

          if (resultData.status && resultData.status !== 'QUEUED' && resultData.status !== 'RUNNING') {
            // Result is ready
            clearInterval(pollInterval);
            setStatus(resultData.status);
            setActualOutput(resultData.stdout || '');
            setRuntimeMs(resultData.runtime_ms);
            setExitCode(resultData.exit_code ?? null);
            setIsLoading(false);
          } else if (resultData.status === 'RUNNING') {
            setStatus('RUNNING');
          }
        } catch (error) {
          console.error('Poll error:', error);
        }
      }, 1000);

      // Timeout after 30 seconds
      setTimeout(() => {
        clearInterval(pollInterval);
        if (isLoading) {
          setIsLoading(false);
          setStatus('TIMEOUT');
        }
      }, 30000);
    } catch (error) {
      console.error('Submission error:', error);
      setStatus('ERROR');
      setActualOutput(`Error: ${error.message}`);
      setIsLoading(false);
    }
  };

  const getStatusBadgeClass = () => {
    switch (status) {
      case 'ACCEPTED':
        return 'status-badge accepted';
      case 'WRONG_ANSWER':
        return 'status-badge wrong';
      case 'RUNTIME_ERROR':
      case 'TIME_LIMIT':
      case 'MEMORY_LIMIT':
      case 'SYSTEM_ERROR':
        return 'status-badge error';
      case 'IDLE':
        return 'status-badge idle';
      default:
        return 'status-badge pending';
    }
  };

  const getStatusDisplay = () => {
    if (status === 'SUBMITTING' || status === 'QUEUED' || status === 'RUNNING') {
      return (
        <>
          <span className={getStatusBadgeClass()}>
            <span className="loading-spinner"></span> {status}
          </span>
        </>
      );
    }
    return <span className={getStatusBadgeClass()}>{status}</span>;
  };

  return (
    <div className="container">
      {/* Header */}
      <div className="header">
        <div className="header-title">⚡ CodeForge</div>
        <a
          href="https://github.com/aishwary-dixit1/CodeForge"
          target="_blank"
          rel="noopener noreferrer"
          className="star-button"
        >
          <i className="fas fa-star"></i>
          Star on GitHub
        </a>
      </div>

      {/* Main Content */}
      <div className="main-content" ref={mainContentRef}>
        {/* Left Panel */}
        <div className="left-panel" style={{ width: `${leftPanelWidth}%` }}>
          <div className="editor-header">
            <select
              value={language}
              onChange={handleLanguageChange}
              className="language-selector"
            >
              <option value="python3">Python 3</option>
              <option value="nodejs20">Node.js 20</option>
              <option value="java17">Java 17</option>
              <option value="cpp20">C++ 20</option>
            </select>
            <button
              onClick={handleSubmit}
              disabled={isLoading}
              className="submit-button"
            >
              {isLoading ? 'Running...' : '▶ Run Code'}
            </button>
          </div>
          <textarea
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="code-editor"
            placeholder="Write or paste your code here..."
            spellCheck="false"
          />
        </div>

        <div
          className={`column-resizer ${dragState?.type === 'main' ? 'active' : ''}`}
          onMouseDown={(event) => {
            event.preventDefault();
            setDragState({
              type: 'main',
              startX: event.clientX,
              initialLeftWidth: leftPanelWidth
            });
          }}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize editor and output columns"
        />

        {/* Right Panel */}
        <div
          className="right-panel"
          ref={rightPanelRef}
          style={{
            width: `${100 - leftPanelWidth}%`,
            gridTemplateRows: `${rightPanelRows[0]}fr 8px ${rightPanelRows[1]}fr 8px ${rightPanelRows[2]}fr 8px ${rightPanelRows[3]}fr`
          }}
        >
          {/* Input Block */}
          <div className="output-block">
            <div className="output-header">📥 Input</div>
            <textarea
              value={stdin}
              onChange={(e) => setStdin(e.target.value)}
              className="output-content panel-textarea"
              placeholder="Provide input here (if needed)..."
            />
          </div>

          <div
            className={`row-resizer ${dragState?.type === 'right' && dragState?.index === 0 ? 'active' : ''}`}
            onMouseDown={(event) =>
              setDragState({
                type: 'right',
                startY: event.clientY,
                index: 0,
                initialRows: [...rightPanelRows]
              })
            }
            role="separator"
            aria-orientation="horizontal"
            aria-label="Resize input and expected output"
          />

          {/* Expected Output Block */}
          <div className="output-block">
            <div className="output-header">🎯 Expected Output</div>
            <textarea
              value={expectedOutput}
              onChange={(e) => setExpectedOutput(e.target.value)}
              className="output-content panel-textarea"
              placeholder="Enter expected output for comparison..."
            />
          </div>

          <div
            className={`row-resizer ${dragState?.type === 'right' && dragState?.index === 1 ? 'active' : ''}`}
            onMouseDown={(event) =>
              setDragState({
                type: 'right',
                startY: event.clientY,
                index: 1,
                initialRows: [...rightPanelRows]
              })
            }
            role="separator"
            aria-orientation="horizontal"
            aria-label="Resize expected output and output"
          />

          {/* Actual Output Block */}
          <div className="output-block">
            <div className="output-header">📤 Output</div>
            <div
              className={`output-content ${
                status === 'ACCEPTED' ? 'success' : status.includes('ERROR') ? 'error' : ''
              }`}
            >
              {actualOutput ? (
                <pre style={{ whiteSpace: 'pre-wrap', wordWrap: 'break-word' }}>
                  {actualOutput}
                </pre>
              ) : (
                <span className="empty">Output will appear here...</span>
              )}
            </div>
          </div>

          <div
            className={`row-resizer ${dragState?.type === 'right' && dragState?.index === 2 ? 'active' : ''}`}
            onMouseDown={(event) =>
              setDragState({
                type: 'right',
                startY: event.clientY,
                index: 2,
                initialRows: [...rightPanelRows]
              })
            }
            role="separator"
            aria-orientation="horizontal"
            aria-label="Resize output and status"
          />

          {/* Status Block */}
          <div className="status-block">
            <div className="status-item">
              <span className="status-label">Status</span>
              <span>{getStatusDisplay()}</span>
            </div>
            <div className="status-item">
              <span className="status-label">Runtime</span>
              <span className="status-value">{runtimeMs ? `${runtimeMs}ms` : '--'}</span>
            </div>
            <div className="status-item">
              <span className="status-label">Exit Code</span>
              <span className="status-value">{exitCode !== null ? exitCode : '--'}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
