import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Search, ChevronDown, ChevronUp, AlertTriangle, Sun, Moon,
  Calendar, Copy, Check, RefreshCw, X, Circle
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Static config — every value below is a literal string on purpose (no
// template-built class names) so the styles resolve without a JIT compiler.
// ---------------------------------------------------------------------------

const ENV_CONFIG = {
  prod: {
    label: 'Production',
    domain: 'https://shop.vendis.com.au',
    poolId: 'gpool812642',
    pageSize: '9999',
  },
  uat: {
    label: 'UAT',
    domain: 'https://uat-admin.vendis.com.au',
    poolId: 'gpoole048a3',
    pageSize: '9999',
  },
  staging: {
    label: 'Staging',
    domain: 'https://staging.vendis.com.au',
    poolId: 'gpoold4a251',
    pageSize: '9999',
  },
};

// One accent per environment. This is the app's signature move: the whole
// control deck re-tints to match whichever environment is armed, so it's
// never ambiguous — at a glance — whether you're about to query prod.
const ACCENTS = {
  prod: {
    topbar: 'bg-rose-500',
    dot: 'bg-rose-500',
    segActive: 'bg-rose-600 text-white shadow-sm shadow-rose-950/40',
    btn: 'bg-rose-600 hover:bg-rose-500',
    ring: 'focus:border-rose-500',
    text: 'text-rose-400',
    textStrongDark: 'text-rose-300',
    textStrongLight: 'text-rose-700',
    chipDark: 'bg-rose-500/10 text-rose-300 border-rose-500/30',
    chipLight: 'bg-rose-50 text-rose-700 border-rose-200',
  },
  uat: {
    topbar: 'bg-amber-500',
    dot: 'bg-amber-500',
    segActive: 'bg-amber-600 text-white shadow-sm shadow-amber-950/40',
    btn: 'bg-amber-600 hover:bg-amber-500',
    ring: 'focus:border-amber-500',
    text: 'text-amber-400',
    textStrongDark: 'text-amber-300',
    textStrongLight: 'text-amber-700',
    chipDark: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
    chipLight: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  staging: {
    topbar: 'bg-indigo-500',
    dot: 'bg-indigo-500',
    segActive: 'bg-indigo-600 text-white shadow-sm shadow-indigo-950/40',
    btn: 'bg-indigo-600 hover:bg-indigo-500',
    ring: 'focus:border-indigo-500',
    text: 'text-indigo-400',
    textStrongDark: 'text-indigo-300',
    textStrongLight: 'text-indigo-700',
    chipDark: 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30',
    chipLight: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  },
};

const RANGE_GROUPS = [
  {
    label: 'Minutes',
    options: [
      { value: '1m', label: '1m' },
      { value: '2m', label: '2m' },
      { value: '5m', label: '5m' },
      { value: '10m', label: '10m' },
      { value: '15m', label: '15m' },
      { value: '30m', label: '30m' },
    ],
  },
  {
    label: 'Hours+',
    options: [
      { value: '1h', label: '1h' },
      { value: '12h', label: '12h' },
      { value: '1d', label: '1d' },
    ],
  },
];

function severityFor(message, logGroup, darkMode) {
  const text = message || '';
  if (
    text.includes('status 4') ||
    text.includes('status 5') ||
    text.toLowerCase().includes('fail') ||
    text.toLowerCase().includes('error')
  ) {
    return {
      label: 'ERROR',
      rail: 'bg-rose-500',
      chip: darkMode
        ? 'bg-rose-500/10 text-rose-300 border-rose-500/30'
        : 'bg-rose-50 text-rose-700 border-rose-200',
      row: darkMode ? 'text-rose-200' : 'text-rose-800',
    };
  }
  if (text.startsWith('START') || text.startsWith('INIT_START')) {
    return {
      label: 'START',
      rail: 'bg-amber-400',
      chip: darkMode
        ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
        : 'bg-amber-50 text-amber-700 border-amber-200',
      row: darkMode ? 'text-amber-100' : 'text-amber-900',
    };
  }
  if (text.startsWith('REPORT') || text.startsWith('END')) {
    return {
      label: 'METRIC',
      rail: 'bg-indigo-400',
      chip: darkMode
        ? 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30'
        : 'bg-indigo-50 text-indigo-700 border-indigo-200',
      row: darkMode ? 'text-indigo-100' : 'text-indigo-900',
    };
  }
  return {
    label: logGroup.toUpperCase(),
    rail: darkMode ? 'bg-neutral-600' : 'bg-neutral-400',
    chip: darkMode
      ? 'bg-neutral-500/10 text-neutral-300 border-neutral-500/30'
      : 'bg-neutral-100 text-neutral-700 border-neutral-300',
    row: darkMode ? 'text-neutral-200' : 'text-neutral-800',
  };
}

function formatStamp(val) {
  if (!val) return '';
  try {
    const d = new Date(val);
    if (Number.isNaN(d.getTime())) return val;
    return d.toLocaleString(undefined, {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return val;
  }
}

export default function App() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [darkMode, setDarkMode] = useState(true);

  const [environment, setEnvironment] = useState('prod');
  const [logGroup, setLogGroup] = useState('source');

  const [rangeUnit, setRangeUnit] = useState('12h');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [draftStart, setDraftStart] = useState('');
  const [draftEnd, setDraftEnd] = useState('');
  const [showRangePicker, setShowRangePicker] = useState(false);

  const [searchTerm, setSearchTerm] = useState('');
  const [expandedIndex, setExpandedIndex] = useState(null);
  const [copiedIndex, setCopiedIndex] = useState(null);

  const pickerRef = useRef(null);
  const accent = ACCENTS[environment];

  useEffect(() => {
    function handleClickOutside(e) {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) {
        setShowRangePicker(false);
      }
    }
    if (showRangePicker) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showRangePicker]);

  const openRangePicker = () => {
    setDraftStart(customStart);
    setDraftEnd(customEnd);
    setShowRangePicker(true);
  };

  const applyCustomRange = () => {
    if (!draftStart || !draftEnd) return;
    setCustomStart(draftStart);
    setCustomEnd(draftEnd);
    setRangeUnit('custom');
    setShowRangePicker(false);
  };

  const clearCustomRange = () => {
    setCustomStart('');
    setCustomEnd('');
    setRangeUnit('12h');
    setShowRangePicker(false);
  };

  const fetchLogsDirectly = async () => {
    setLoading(true);
    setError(null);
    try {
      const config = ENV_CONFIG[environment] || ENV_CONFIG.prod;
      let queryParams = `pool_id=${config.poolId}&project_pk=1720&metric=LogStream&log_group=${logGroup}&page_size=${config.pageSize}`;

      if (rangeUnit === 'custom') {
        if (!customStart || !customEnd) {
          throw new Error('Select both a start and end timestamp before fetching.');
        }
        const formatSecString = (val) => (val.length === 16 ? `${val}:00` : val);
        queryParams += `&start_datetime=${formatSecString(customStart)}&end_datetime=${formatSecString(customEnd)}`;
      } else {
        queryParams += `&timePeriod=${rangeUnit}`;
      }

      const targetUrl = `${config.domain}/metrics/?${queryParams}`;

      const response = await fetch(targetUrl, {
        method: 'GET',
        headers: {
          'Cookie': 'ARRAffinity=c5a7757e69685973957f147f7f547fda25aa575bf0a4b54c17c0da5eb7f451e6; ARRAffinitySameSite=c5a7757e69685973957f147f7f547fda25aa575bf0a4b54c17c0da5eb7f451e6',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error status: ${response.status}`);
      }

      const data = await response.json();
      const parsedLogs = data.LogStream?.events || (Array.isArray(data) ? data : []);
      setLogs(parsedLogs);
      setExpandedIndex(null);
    } catch (err) {
      setError(err.message || 'Failed to fetch logs directly from the endpoint.');
    } finally {
      setLoading(false);
    }
  };

  const makeHumanReadable = (rawMessage) => {
    if (!rawMessage) return '';
    try {
      let cleanStr = rawMessage;
      if (cleanStr.includes("content b'")) {
        const match = cleanStr.match(/content b'(.*?)'(\s*:\s*status\s*\d+)?$/s);
        if (match) cleanStr = match[1];
      } else {
        cleanStr = cleanStr.replace(/^(updated_data|Data at source),\s*/, '');
      }
      const standardizedJson = cleanStr
        .replace(/'/g, '"')
        .replace(/None/g, 'null')
        .replace(/True/g, 'true')
        .replace(/False/g, 'false');
      return JSON.stringify(JSON.parse(standardizedJson), null, 2);
    } catch (e) {
      return rawMessage;
    }
  };

  const handleCopy = (text, index) => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 1500);
    });
  };

  const filteredLogs = useMemo(
    () =>
      logs.filter((log) => {
        const hayStack = `${log.Message} ${log.Timestamp}`.toLowerCase();
        return hayStack.includes(searchTerm.toLowerCase());
      }),
    [logs, searchTerm]
  );

  const customRangeLabel =
    customStart && customEnd
      ? `${formatStamp(customStart)} → ${formatStamp(customEnd)}`
      : 'Custom range';

  const bg = darkMode ? 'bg-neutral-950 text-neutral-100' : 'bg-neutral-50 text-neutral-900';
  const panel = darkMode ? 'bg-neutral-900 border-neutral-800' : 'bg-white border-neutral-200';
  const panelSoft = darkMode ? 'bg-neutral-900/60 border-neutral-800' : 'bg-neutral-50 border-neutral-200';
  const inputCls = darkMode
    ? `bg-neutral-950 border-neutral-800 text-neutral-100 ${accent.ring}`
    : `bg-white border-neutral-300 text-neutral-900 ${accent.ring}`;
  const labelCls = darkMode ? 'text-neutral-500' : 'text-neutral-500';
  const mutedCls = darkMode ? 'text-neutral-500' : 'text-neutral-500';

  return (
    <div className={`min-h-screen font-mono transition-colors duration-150 overflow-x-hidden ${bg}`}>
      {/* Signature accent rail — tints with the armed environment */}
      <div className={`h-1 w-full ${accent.topbar} transition-colors duration-300`} />

      <div className="w-full px-6 py-6">
        {/* Terminal chrome header */}
        <header className={`rounded-t-xl border px-4 py-3 flex items-center justify-between ${panel}`}>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-rose-500/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-amber-500/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/70" />
            </div>
            <span className={`text-xs ${mutedCls}`}>
              vendis <span className="opacity-50">/</span> logstream-debugger{' '}
              <span className="opacity-50">/</span>{' '}
              <span className={accent.text}>{environment}</span>
            </span>
          </div>
          <button
            onClick={() => setDarkMode(!darkMode)}
            className={`p-2 rounded-lg border transition-colors ${darkMode
              ? 'bg-neutral-950 border-neutral-800 text-amber-400 hover:bg-neutral-800'
              : 'bg-neutral-50 border-neutral-300 text-neutral-600 hover:bg-neutral-100'
              }`}
            aria-label="Toggle theme"
          >
            {darkMode ? <Sun size={14} /> : <Moon size={14} />}
          </button>
        </header>

        <div className={`border-x px-5 py-2 ${darkMode ? 'border-neutral-800' : 'border-neutral-200'}`}>
          <h1 className="text-lg font-sans font-bold tracking-tight flex items-center gap-2">
            <Circle size={8} className={`${loading ? 'animate-pulse' : ''} fill-emerald-500 text-emerald-500`} />
            LogStream Debugger
          </h1>
          <p className={`text-xs mt-0.5 font-sans ${mutedCls}`}>Active transaction stream inspector</p>
        </div>

        {/* Control deck */}
        <div className={`border-x border-b rounded-b-xl px-5 py-5 mb-6 flex flex-col gap-5 ${panel}`}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Environment */}
            <div className="flex flex-col gap-2">
              <label className={`text-[11px] font-sans font-bold tracking-wider uppercase ${labelCls}`}>
                Target environment
              </label>
              <div className={`grid grid-cols-3 p-1 rounded-lg border text-center text-xs font-sans font-bold ${darkMode ? 'bg-neutral-950 border-neutral-800' : 'bg-neutral-100 border-neutral-200'
                }`}>
                {Object.keys(ENV_CONFIG).map((key) => (
                  <button
                    key={key}
                    onClick={() => setEnvironment(key)}
                    className={`py-1.5 rounded-md transition-all ${environment === key
                      ? ACCENTS[key].segActive
                      : darkMode ? 'text-neutral-500 hover:text-neutral-300' : 'text-neutral-500 hover:text-neutral-700'
                      }`}
                  >
                    {ENV_CONFIG[key].label.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {/* Lambda target */}
            <div className="flex flex-col gap-2">
              <label className={`text-[11px] font-sans font-bold tracking-wider uppercase ${labelCls}`}>
                Lambda target
              </label>
              <select
                className={`w-full p-2 rounded-lg outline-none text-sm h-[38px] border transition-colors ${inputCls}`}
                value={logGroup}
                onChange={(e) => setLogGroup(e.target.value)}
              >
                <option value="source">source</option>
                <option value="webapi_handler">webapi_handler</option>
              </select>
            </div>
          </div>

          {/* Time range — full-width row, grouped by scale */}
          <div className="flex flex-col gap-2 relative" ref={pickerRef}>
            <label className={`text-[11px] font-sans font-bold tracking-wider uppercase ${labelCls}`}>
              Time range
            </label>
            <div className={`flex items-center gap-1 flex-wrap p-1.5 rounded-lg border ${darkMode ? 'bg-neutral-950 border-neutral-800' : 'bg-neutral-100 border-neutral-200'
              }`}>
              {RANGE_GROUPS.map((group, gi) => (
                <React.Fragment key={group.label}>
                  {gi > 0 && <div className={`w-px h-6 mx-1.5 ${darkMode ? 'bg-neutral-800' : 'bg-neutral-300'}`} />}
                  <span className={`text-[9px] font-sans font-bold uppercase tracking-wider pr-1 ${mutedCls}`}>
                    {group.label}
                  </span>
                  {group.options.map((preset) => (
                    <button
                      key={preset.value}
                      onClick={() => setRangeUnit(preset.value)}
                      className={`px-2.5 h-8 rounded-md text-xs font-sans font-bold transition-colors ${rangeUnit === preset.value
                        ? accent.segActive
                        : darkMode
                          ? 'text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200'
                          : 'text-neutral-500 hover:bg-white hover:text-neutral-800'
                        }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </React.Fragment>
              ))}

              <div className={`w-px h-6 mx-1.5 ${darkMode ? 'bg-neutral-800' : 'bg-neutral-300'}`} />

              <button
                onClick={openRangePicker}
                className={`flex items-center gap-1.5 px-3 h-8 rounded-md text-xs font-sans font-bold transition-colors ${rangeUnit === 'custom'
                  ? accent.segActive
                  : darkMode
                    ? 'text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200'
                    : 'text-neutral-500 hover:bg-white hover:text-neutral-800'
                  }`}
              >
                <Calendar size={13} />
                {customRangeLabel}
              </button>
            </div>

            {/* Custom range popover */}
            {showRangePicker && (
              <div className={`absolute z-20 top-full mt-2 right-0 w-72 rounded-xl border shadow-xl p-4 flex flex-col gap-3 ${panel}`}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-sans font-bold uppercase tracking-wide">Custom range</span>
                  <button onClick={() => setShowRangePicker(false)} className={mutedCls}>
                    <X size={14} />
                  </button>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className={`text-[11px] font-sans ${labelCls}`}>Start</label>
                  <input
                    type="datetime-local"
                    value={draftStart}
                    onChange={(e) => setDraftStart(e.target.value)}
                    className={`p-2 rounded-lg outline-none text-sm border ${inputCls} ${darkMode ? '[color-scheme:dark]' : '[color-scheme:light]'}`}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className={`text-[11px] font-sans ${labelCls}`}>End</label>
                  <input
                    type="datetime-local"
                    value={draftEnd}
                    onChange={(e) => setDraftEnd(e.target.value)}
                    className={`p-2 rounded-lg outline-none text-sm border ${inputCls} ${darkMode ? '[color-scheme:dark]' : '[color-scheme:light]'}`}
                  />
                </div>
                <div className="flex justify-between gap-2 pt-1">
                  <button
                    onClick={clearCustomRange}
                    className={`text-xs font-sans font-bold px-3 py-1.5 rounded-lg border ${darkMode ? 'border-neutral-800 text-neutral-400 hover:bg-neutral-800' : 'border-neutral-200 text-neutral-500 hover:bg-neutral-100'
                      }`}
                  >
                    Clear
                  </button>
                  <button
                    onClick={applyCustomRange}
                    disabled={!draftStart || !draftEnd}
                    className={`text-xs font-sans font-bold px-3 py-1.5 rounded-lg text-white transition-colors disabled:opacity-40 ${accent.btn}`}
                  >
                    Apply range
                  </button>
                </div>
              </div>
            )}
          </div>


          <div className={`flex justify-end border-t pt-4 ${darkMode ? 'border-neutral-800/60' : 'border-neutral-200'}`}>
            <button
              className={`flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg font-sans font-bold text-sm text-white transition-all active:scale-95 w-full sm:w-auto disabled:opacity-50 disabled:cursor-not-allowed ${accent.btn}`}
              onClick={fetchLogsDirectly}
              disabled={loading}
            >
              {loading ? <RefreshCw size={14} className="animate-spin" /> : null}
              {loading ? 'Fetching…' : `Fetch logs from ${ENV_CONFIG[environment].label}`}
            </button>
          </div>
        </div>

        {/* Search / stats bar */}
        {logs.length > 0 && (
          <div className="relative mb-5">
            <input
              className={`w-full p-3 pl-10 pr-40 rounded-xl text-sm outline-none border transition-colors ${inputCls}`}
              type="text"
              placeholder="Filter by message or timestamp…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <Search size={15} className={`absolute left-3.5 top-3.5 ${mutedCls}`} />
            <span className={`absolute right-3 top-2.5 text-[11px] font-sans font-bold px-2.5 py-1.5 rounded-lg border ${darkMode ? 'bg-neutral-900 text-neutral-300 border-neutral-800' : 'bg-neutral-100 text-neutral-700 border-neutral-200'
              }`}>
              {filteredLogs.length} matches · limit {ENV_CONFIG[environment].pageSize}
            </span>
          </div>
        )}

        {error && (
          <div className={`p-4 rounded-xl mb-6 text-sm flex gap-3 border ${darkMode ? 'bg-rose-500/10 text-rose-300 border-rose-500/20' : 'bg-rose-50 text-rose-700 border-rose-200'
            }`}>
            <AlertTriangle size={16} className="shrink-0 mt-0.5" />
            <div>
              <strong className="font-sans">Request failed.</strong> {error}
            </div>
          </div>
        )}

        {/* Log stream panel */}
        <div className={`border rounded-xl overflow-hidden shadow-xl ${panel}`}>
          {filteredLogs.length === 0 ? (
            <div className={`p-16 text-center text-sm font-sans ${mutedCls}`}>
              {loading ? 'Connecting to remote cluster…' : 'Terminal ready. Run a query to see log entries here.'}
            </div>
          ) : (
            <div className={`divide-y ${darkMode ? 'divide-neutral-800' : 'divide-neutral-200'}`}>
              {filteredLogs.map((log, index) => {
                const isExpanded = expandedIndex === index;
                const sev = severityFor(log.Message, logGroup, darkMode);
                const readable = makeHumanReadable(log.Message);

                return (
                  <div key={index} className="flex">
                    <div className={`w-1 shrink-0 ${sev.rail}`} />
                    <div className={`flex-1 min-w-0 transition-colors ${isExpanded ? panelSoft : ''}`}>
                      <div
                        onClick={() => setExpandedIndex(isExpanded ? null : index)}
                        className="flex flex-col md:flex-row md:items-center gap-3 p-3 text-xs cursor-pointer min-w-0 select-none"
                      >
                        <span className={`whitespace-nowrap md:w-32 shrink-0 ${mutedCls}`}>{log.Timestamp}</span>
                        <span className={`w-20 text-center text-[10px] px-1.5 py-0.5 font-sans font-bold rounded border shrink-0 ${sev.chip}`}>
                          {sev.label}
                        </span>
                        <div className={`flex-1 min-w-0 ${isExpanded ? 'overflow-x-auto log-scroll' : 'overflow-hidden'}`}>
                          <span className={`block pr-2 ${sev.row} ${isExpanded ? 'whitespace-nowrap' : 'truncate'}`}>{log.Message}</span>
                        </div>
                        <div className="shrink-0">
                          {isExpanded ? (
                            <ChevronUp size={14} className={accent.text} />
                          ) : (
                            <ChevronDown size={14} className={mutedCls} />
                          )}
                        </div>
                      </div>

                      {isExpanded && (
                        <div className={`px-4 pb-4 pt-1 border-t flex flex-col gap-3 min-w-0 ${darkMode ? 'border-neutral-800' : 'border-neutral-200'}`}>
                          <div className={`flex justify-between items-center gap-3 text-[11px] min-w-0 ${mutedCls}`}>
                            <div className="flex items-center gap-1.5 min-w-0 overflow-x-auto log-scroll">
                              <span className="font-sans shrink-0">Log stream:</span>
                              <code className={`px-1 py-0.5 rounded whitespace-nowrap ${accent.text} ${darkMode ? 'bg-neutral-800' : 'bg-neutral-100'}`}>
                                {log.LogStreamName || '—'}
                              </code>
                            </div>
                            <button
                              onClick={() => handleCopy(readable, index)}
                              className={`flex items-center gap-1 font-sans font-bold px-2 py-1 rounded border transition-colors shrink-0 ${darkMode ? 'border-neutral-800 hover:bg-neutral-800' : 'border-neutral-200 hover:bg-neutral-100'
                                }`}
                            >
                              {copiedIndex === index ? <Check size={12} /> : <Copy size={12} />}
                              {copiedIndex === index ? 'Copied' : 'Copy'}
                            </button>
                          </div>
                          <pre className={`p-4 rounded-lg text-xs overflow-x-auto whitespace-pre-wrap break-all leading-relaxed max-h-[420px] overflow-y-auto border log-scroll ${darkMode ? 'bg-neutral-950 border-neutral-800 text-neutral-200' : 'bg-neutral-50 border-neutral-200 text-neutral-800'
                            }`}>
                            {readable}
                          </pre>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <style>{`
        .log-scroll { scrollbar-width: thin; scrollbar-color: ${darkMode ? '#404040 transparent' : '#c7c7c7 transparent'}; }
        .log-scroll::-webkit-scrollbar { height: 5px; }
        .log-scroll::-webkit-scrollbar-track { background: transparent; }
        .log-scroll::-webkit-scrollbar-thumb { background: ${darkMode ? '#404040' : '#c7c7c7'}; border-radius: 9999px; }
      `}</style>
    </div>
  );
}