import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Search, ChevronDown, ChevronUp, AlertTriangle, Sun, Moon,
  Calendar, Copy, Check, RefreshCw, X, Circle, Terminal, Network,
  Upload, Inbox,
} from 'lucide-react';

// ===========================================================================
// Shared config — literal strings only, no template-built class names, so
// styles resolve without a JIT compiler.
// ===========================================================================

const ENV_CONFIG = {
  prod: {
    label: 'Production',
    domain: 'https://shop.vendis.com.au',
    poolId: 'gpool812642',
    pageSize: '9999',
  },
  uat: {
    label: 'UAT',
    domain: 'https://uat.vendis.com.au',
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

// One accent per environment — the control deck re-tints to match whichever
// environment is armed, so it's never ambiguous whether you're about to
// query prod.
const ACCENTS = {
  prod: {
    topbar: 'bg-rose-500',
    segActive: 'bg-rose-600 text-white shadow-sm shadow-rose-950/40',
    btn: 'bg-rose-600 hover:bg-rose-500',
    ring: 'focus:border-rose-500',
    text: 'text-rose-400',
  },
  uat: {
    topbar: 'bg-amber-500',
    segActive: 'bg-amber-600 text-white shadow-sm shadow-amber-950/40',
    btn: 'bg-amber-600 hover:bg-amber-500',
    ring: 'focus:border-amber-500',
    text: 'text-amber-400',
  },
  staging: {
    topbar: 'bg-indigo-500',
    segActive: 'bg-indigo-600 text-white shadow-sm shadow-indigo-950/40',
    btn: 'bg-indigo-600 hover:bg-indigo-500',
    ring: 'focus:border-indigo-500',
    text: 'text-indigo-400',
  },
};

// Fixed accent for the API Explorer page — it has no "environment" concept,
// so it gets its own steady identity instead of borrowing one from Logs.
const EXPLORER_ACCENT = {
  topbar: 'bg-sky-500',
  segActive: 'bg-sky-600 text-white shadow-sm shadow-sky-950/40',
  btn: 'bg-sky-600 hover:bg-sky-500',
  ring: 'focus:border-sky-500',
  text: 'text-sky-400',
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

function methodBadgeClasses(method, darkMode) {
  if (method === 'GET') {
    return darkMode
      ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
      : 'bg-emerald-50 text-emerald-700 border-emerald-200';
  }
  return darkMode
    ? 'bg-sky-500/10 text-sky-300 border-sky-500/30'
    : 'bg-sky-50 text-sky-700 border-sky-200';
}

// ===========================================================================
// Page 1 — LogStream Debugger
// ===========================================================================

function LogStreamPage({ darkMode, environment, setEnvironment, panel, panelSoft, inputCls, labelCls, mutedCls }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

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

  return (
    <>
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
    </>
  );
}

// ===========================================================================
// Page 2 — Query ↔ API Explorer
// ===========================================================================

// The dataset originally auto-loaded from an inline <script> in the HTML
// version. Kept as-is so behaviour matches exactly; replaceable via upload.
const EMBEDDED_API_DATA = [{ "query_pk": 165, "query_title": "Admin Portal - Dashboard Vendor Order Status 360 View", "apis": [{ "api_pk": 255, "api_name": "Admin Portal - Dashboard Vendor Order Status 360 View", "api_url": "get-vendor-order-status/", "method": "POST" }] }, { "query_pk": 253, "query_title": "Admin Portal - Vendor Order Cancelled Status List", "apis": [{ "api_pk": 288, "api_name": "Admin Portal - Vendor Order Cancelled Status List", "api_url": "get-vendor-order-cancelled-status-list/", "method": "POST" }] }, { "query_pk": 48, "query_title": "Admin Portal - Order List", "apis": [{ "api_pk": 308, "api_name": "admin-portal-order-list", "api_url": "admin-portal-order-list/", "method": "POST" }, { "api_pk": 152, "api_name": "Order Listing", "api_url": "orderlisting/", "method": "POST" }, { "api_pk": 176, "api_name": "orderlisting-query", "api_url": "orderlisting-query/", "method": "POST" }, { "api_pk": 269, "api_name": "Admin Portal - Order List", "api_url": "get-order-list/", "method": "POST" }] }, { "query_pk": 31, "query_title": "get-product-variant-id", "apis": [{ "api_pk": 148, "api_name": "get-product-variant-id", "api_url": "get-product-variant-id/", "method": "POST" }] }, { "query_pk": 182, "query_title": "new sale query 2", "apis": [{ "api_pk": 355, "api_name": "new sale query 2", "api_url": "new_sale_query_2/", "method": "POST" }] }, { "query_pk": 137, "query_title": "create-array-objects", "apis": [{ "api_pk": 175, "api_name": "get-variants", "api_url": "get-variants/", "method": "POST" }] }, { "query_pk": 251, "query_title": "Admin Portal - Vendor Order Pending Payment Status List", "apis": [{ "api_pk": 289, "api_name": "Admin Portal - Vendor Order Pending Payment Status List", "api_url": "vendor-order-pending-payment-status-list/", "method": "POST" }] }, { "query_pk": 168, "query_title": "Admin Portal - Dashboard Vendor Recents Order 360 View", "apis": [{ "api_pk": 256, "api_name": "Admin Portal - Dashboard Vendor Recents Order 360 View", "api_url": "get-vendor-recents-order/", "method": "POST" }] }, { "query_pk": 25, "query_title": "Admin Portal - Product List", "apis": [{ "api_pk": 145, "api_name": "Admin Portal - Product List", "api_url": "product-query/", "method": "POST" }] }, { "query_pk": 231, "query_title": "CSO_Orderlineitem", "apis": [{ "api_pk": 309, "api_name": "CSO_Orderlineitem", "api_url": "cso_orderlineitem/", "method": "POST" }, { "api_pk": 279, "api_name": "CSO_orderlineitem", "api_url": "cos_orderlineitem/", "method": "POST" }] }, { "query_pk": 201, "query_title": "get-category-value", "apis": [{ "api_pk": 356, "api_name": "get-category-value", "api_url": "get-category-value/", "method": "POST" }] }, { "query_pk": 44, "query_title": "Admin Portal - Product Detail 360 View", "apis": [{ "api_pk": 149, "api_name": "product-details-summary", "api_url": "product-details-summary/", "method": "POST" }, { "api_pk": 180, "api_name": "product-details-360", "api_url": "product-details-360-query/", "method": "POST" }, { "api_pk": 272, "api_name": "Admin Portal - Product Detail 360 View", "api_url": "get-product-detail/", "method": "POST" }] }, { "query_pk": 35, "query_title": "Admin Portal - Product List 360 View", "apis": [{ "api_pk": 150, "api_name": "product-variant-query", "api_url": "product-variant-query/", "method": "POST" }, { "api_pk": 181, "api_name": "product-query-360", "api_url": "product-query-360/", "method": "POST" }, { "api_pk": 271, "api_name": "Admin Portal - Product List 360 View", "api_url": "get-product-list/", "method": "POST" }] }, { "query_pk": 49, "query_title": "Admin Portal - Vendor Product", "apis": [{ "api_pk": 151, "api_name": "vendor-product-query", "api_url": "vendor-product-query/", "method": "POST" }, { "api_pk": 277, "api_name": "Admin Portal - Vendor Product", "api_url": "get-vendor-product-list/", "method": "POST" }] }, { "query_pk": 43, "query_title": "order_lineitemloop", "apis": [{ "api_pk": 156, "api_name": "magento_order_orderlineitem", "api_url": "magento_order_orderlineitem/", "method": "POST" }, { "api_pk": 250, "api_name": "order_lineitemloop", "api_url": "order_lineitemloop/", "method": "POST" }, { "api_pk": 201, "api_name": "item-loop-through-query", "api_url": "item-loop-through-query/", "method": "POST" }] }, { "query_pk": 250, "query_title": "Admin Portal - Vendor Order Rejected Status List", "apis": [{ "api_pk": 290, "api_name": "Admin Portal - Vendor Order Rejected Status List", "api_url": "vendor-order-rejected-status-list/", "method": "POST" }] }, { "query_pk": 189, "query_title": "get-vendor-details", "apis": [{ "api_pk": 310, "api_name": "Vendor Portal - Get Vendor Details", "api_url": "get-vendor-details/", "method": "POST" }] }, { "query_pk": 170, "query_title": "product-update-query", "apis": [{ "api_pk": 357, "api_name": "product-update-query", "api_url": "product-update-query/", "method": "POST" }] }, { "query_pk": 180, "query_title": "Admin Portal - Dashboard Vendor Products 360 View", "apis": [{ "api_pk": 257, "api_name": "Admin Portal - Dashboard Vendor Products 360 View", "api_url": "get-vendor-product/", "method": "POST" }] }, { "query_pk": 16, "query_title": "iframe_query", "apis": [{ "api_pk": 146, "api_name": "iframe-query", "api_url": "iframe-query/", "method": "POST" }] }, { "query_pk": 41, "query_title": "Admin Portal - Order List 360 View", "apis": [{ "api_pk": 153, "api_name": "Order 360 View", "api_url": "order360view/", "method": "POST" }, { "api_pk": 178, "api_name": "order 360 view", "api_url": "order360view-query/", "method": "POST" }, { "api_pk": 274, "api_name": "Admin Portal - Order List 360 View", "api_url": "get-orders-list/", "method": "POST" }] }, { "query_pk": 108, "query_title": "categories-test", "apis": [{ "api_pk": 233, "api_name": "Category-test-api", "api_url": "category_test_api/", "method": "POST" }, { "api_pk": 323, "api_name": "categories-test", "api_url": "categories-test/", "method": "POST" }, { "api_pk": 232, "api_name": "categories-test api", "api_url": "categories_test_api/", "method": "POST" }] }, { "query_pk": 233, "query_title": "vendor-order-card-query", "apis": [{ "api_pk": 311, "api_name": "Vendor Portal - Order Card Query", "api_url": "vendor-order-card-query/", "method": "POST" }] }, { "query_pk": 249, "query_title": "Admin Portal - Vendor Order Processed Status List", "apis": [{ "api_pk": 291, "api_name": "Admin Portal - Vendor Order Processed Status List", "api_url": "vendor-order-processed-status-list/", "method": "POST" }] }, { "query_pk": 181, "query_title": "Admin Portal - Dashboard Vendor Average Value 360 View", "apis": [{ "api_pk": 258, "api_name": "Admin Portal - Dashboard Vendor Average Value 360 View", "api_url": "get-vendor-average-value/", "method": "POST" }] }, { "query_pk": 84, "query_title": "empty_query", "apis": [{ "api_pk": 212, "api_name": "empty_query", "api_url": "empty_query/", "method": "POST" }] }, { "query_pk": 101, "query_title": "participant-extra-data", "apis": [{ "api_pk": 215, "api_name": "participant-extra-data", "api_url": "participant-extra-data/", "method": "POST" }] }, { "query_pk": 24, "query_title": "order details", "apis": [{ "api_pk": 147, "api_name": "order details api", "api_url": "orderdetails/", "method": "POST" }] }, { "query_pk": 57, "query_title": "Admin Portal - Participant Order 360 View", "apis": [{ "api_pk": 183, "api_name": "participant_order_query", "api_url": "participant_order_query/", "method": "POST" }, { "api_pk": 276, "api_name": "Admin Portal - Participant Order 360 View", "api_url": "get-participant-order/", "method": "POST" }] }, { "query_pk": 52, "query_title": "Admin Portal - Order Line Item List 360 View", "apis": [{ "api_pk": 154, "api_name": "Order Line Item Listing", "api_url": "orderlineitemlisting/", "method": "POST" }, { "api_pk": 177, "api_name": "OrderLineItem_Listing-query", "api_url": "OrderLineItem_Listing-query/", "method": "POST" }, { "api_pk": 273, "api_name": "Admin Portal - Order Line Item List 360 View", "api_url": "get-order-line-item-list/", "method": "POST" }] }, { "query_pk": 248, "query_title": "Admin Portal - Vendor Order Ready For Processing Status List", "apis": [{ "api_pk": 292, "api_name": "Admin Portal - Vendor Order Ready For Processing Status List", "api_url": "vendor-order-ready-for-processing-status-list/", "method": "POST" }] }, { "query_pk": 199, "query_title": "get-website-id", "apis": [{ "api_pk": 312, "api_name": "get-website-id", "api_url": "get-website-id/", "method": "POST" }] }, { "query_pk": 179, "query_title": "Admin Portal - Dashboard Vendor Pending Orders 360 View", "apis": [{ "api_pk": 259, "api_name": "Admin Portal - Dashboard Vendor Pending Orders 360 View", "api_url": "get-vendor-pending-order/", "method": "POST" }] }, { "query_pk": 50, "query_title": "Admin Portal - Vendor Order Listing", "apis": [{ "api_pk": 155, "api_name": "Vendor Order Listing", "api_url": "vendororderlisting/", "method": "POST" }, { "api_pk": 179, "api_name": "vendor-order-listing-query", "api_url": "vendor-order-listing-query/", "method": "POST" }, { "api_pk": 278, "api_name": "Admin Portal - Vendor Order Listing", "api_url": "get-vendor-order-listing/", "method": "POST" }] }, { "query_pk": 247, "query_title": "Admin Portal - Vendor Order Pending Status List", "apis": [{ "api_pk": 293, "api_name": "Admin Portal - Vendor Order Pending Status List", "api_url": "vendor-order-pending-status-list/", "method": "POST" }] }, { "query_pk": 229, "query_title": "CSO_Approve_Order", "apis": [{ "api_pk": 313, "api_name": "CSO_Approve_Order", "api_url": "cso_approve_order/", "method": "POST" }] }, { "query_pk": 178, "query_title": "Admin Portal - Dashboard Vendor Fulfilled Orders 360 View", "apis": [{ "api_pk": 260, "api_name": "Admin Portal - Dashboard Vendor Fulfilled Orders 360 View", "api_url": "get-vendor-fulfilled-orders/", "method": "POST" }] }, { "query_pk": 127, "query_title": "product-query-test", "apis": [{ "api_pk": 166, "api_name": "vendor filter", "api_url": "vendor-test/", "method": "POST" }] }, { "query_pk": 117, "query_title": "Cancel Query", "apis": [{ "api_pk": 199, "api_name": "Cancel Query", "api_url": "Cancel Query/", "method": "POST" }] }, { "query_pk": 177, "query_title": "Admin Portal - Dashboard Vendor Total Orders 360 View", "apis": [{ "api_pk": 261, "api_name": "Admin Portal - Dashboard Vendor Total Orders 360 View", "api_url": "get-vendor-total-orders/", "method": "POST" }] }, { "query_pk": 94, "query_title": "order_clubbing", "apis": [{ "api_pk": 208, "api_name": "clubbing-invoice", "api_url": "clubbing-invoice/", "method": "POST" }, { "api_pk": 248, "api_name": "order_clubbing", "api_url": "order_clubbing/", "method": "POST" }] }, { "query_pk": 246, "query_title": "Admin Portal - Order Pending Status List", "apis": [{ "api_pk": 294, "api_name": "Admin Portal - Order Pending Status List", "api_url": "order-pending-status-list/", "method": "POST" }] }, { "query_pk": 217, "query_title": "send-back-response", "apis": [{ "api_pk": 314, "api_name": "send-back-response", "api_url": "send-back-response/", "method": "POST" }] }, { "query_pk": 143, "query_title": "generate-rejection-mail", "apis": [{ "api_pk": 219, "api_name": "generate-rejection-mail", "api_url": "generate-rejection-mail/", "method": "POST" }] }, { "query_pk": 146, "query_title": "ship-query", "apis": [{ "api_pk": 220, "api_name": "ship-query", "api_url": "ship-query/", "method": "POST" }] }, { "query_pk": 142, "query_title": "generate-email-body", "apis": [{ "api_pk": 221, "api_name": "generate-email-body", "api_url": "generate-email-body/", "method": "POST" }] }, { "query_pk": 81, "query_title": "get_product_variant", "apis": [{ "api_pk": 222, "api_name": "get_product_variant", "api_url": "get_product_variant/", "method": "POST" }] }, { "query_pk": 148, "query_title": "get-vendor-prefix", "apis": [{ "api_pk": 223, "api_name": "get-vendor-prefix", "api_url": "get-vendor-prefix/", "method": "POST" }] }, { "query_pk": 161, "query_title": "Admin Portal -  Dashboard Order Status", "apis": [{ "api_pk": 262, "api_name": "Admin Portal -  Dashboard Order Status", "api_url": "get-order-status/", "method": "POST" }] }, { "query_pk": 245, "query_title": "Admin Portal - Order Ready For Processing Status List", "apis": [{ "api_pk": 295, "api_name": "Admin Portal - Order Ready For Processing Status List", "api_url": "order-ready-for-processing-status-list/", "method": "POST" }] }, { "query_pk": 110, "query_title": "check-if-vendor-exists", "apis": [{ "api_pk": 315, "api_name": "check-if-vendor-exists", "api_url": "check-if-vendor-exists/", "method": "POST" }] }, { "query_pk": 150, "query_title": "magento-validation-payload", "apis": [{ "api_pk": 224, "api_name": "magento-validation-payload", "api_url": "magento-validation-payload/", "method": "POST" }] }, { "query_pk": 186, "query_title": "Get-Product-Meta", "apis": [{ "api_pk": 316, "api_name": "Get-Product-Meta", "api_url": "get-product-meta/", "method": "POST" }] }, { "query_pk": 162, "query_title": "Admin Portal - Dashboard Order Listing", "apis": [{ "api_pk": 263, "api_name": "Admin Portal - Dashboard Order Listing", "api_url": "get-order-listing/", "method": "POST" }] }, { "query_pk": 244, "query_title": "Admin Portal - Order Processed Status List", "apis": [{ "api_pk": 296, "api_name": "Admin Portal - Order Processed Status List", "api_url": "order-processed-status-list/", "method": "POST" }] }, { "query_pk": 56, "query_title": "Admin Portal - Participant Details 360 View", "apis": [{ "api_pk": 184, "api_name": "participant_details_query", "api_url": "participant_details_query/", "method": "POST" }, { "api_pk": 275, "api_name": "Admin Portal - Participant Details 360 View", "api_url": "get-participant-details/", "method": "POST" }] }, { "query_pk": 152, "query_title": "generate-invalid-sku-payload", "apis": [{ "api_pk": 225, "api_name": "generate-invalid-sku-payload", "api_url": "generate-invalid-sku-payload/", "method": "POST" }] }, { "query_pk": 149, "query_title": "remove-invalid-and-make-magento-payload", "apis": [{ "api_pk": 226, "api_name": "remove-invalid-and-make-magento-payload", "api_url": "remove-invalid-and-make-magento-payload/", "method": "POST" }] }, { "query_pk": 213, "query_title": "ParentChildFetch", "apis": [{ "api_pk": 317, "api_name": "ParentChildFetch", "api_url": "ParentChildFetch/", "method": "POST" }] }, { "query_pk": 172, "query_title": "Admin Portal - Dashboard Only Products", "apis": [{ "api_pk": 264, "api_name": "Admin Portal - Dashboard Only Products", "api_url": "get-products/", "method": "POST" }] }, { "query_pk": 243, "query_title": "Admin Portal - Order Rejected Status List", "apis": [{ "api_pk": 297, "api_name": "Admin Portal - Order Rejected Status List", "api_url": "order-rejected-status-list/", "method": "POST" }] }, { "query_pk": 55, "query_title": "Admin Portal - Participant List", "apis": [{ "api_pk": 185, "api_name": "participant_query", "api_url": "participant_query/", "method": "POST" }, { "api_pk": 270, "api_name": "Admin Portal - Participant List", "api_url": "get-participant-list/", "method": "POST" }] }, { "query_pk": 51, "query_title": "onboarding_form", "apis": [{ "api_pk": 227, "api_name": "onboarding_form", "api_url": "onboarding_form/", "method": "POST" }] }, { "query_pk": 107, "query_title": "empty-query", "apis": [{ "api_pk": 228, "api_name": "empty-query", "api_url": "empty-query/", "method": "POST" }] }, { "query_pk": 174, "query_title": "Admin Portal - Dashboard Sales", "apis": [{ "api_pk": 265, "api_name": "Admin Portal - Dashboard Sales", "api_url": "get-sales/", "method": "POST" }] }, { "query_pk": 242, "query_title": "Admin Portal - Order Pending Payment Status List", "apis": [{ "api_pk": 298, "api_name": "Admin Portal - Order Pending Payment Status List", "api_url": "order-pending-payment-status-list/", "method": "POST" }] }, { "query_pk": 134, "query_title": "reviews", "apis": [{ "api_pk": 229, "api_name": "reviews", "api_url": "reviews/", "method": "POST" }] }, { "query_pk": 156, "query_title": "pincode-filter", "apis": [{ "api_pk": 230, "api_name": "get-all-pincode", "api_url": "get-all-pincode/", "method": "GET" }] }, { "query_pk": 202, "query_title": "get-category-value-compare", "apis": [{ "api_pk": 231, "api_name": "CatagoryItem", "api_url": "CatagoryItem/", "method": "POST" }] }, { "query_pk": 208, "query_title": "master-validation-query", "apis": [{ "api_pk": 318, "api_name": "master-validation-query", "api_url": "master-validation-query/", "method": "POST" }] }, { "query_pk": 175, "query_title": "Admin Portal - Dashboard Participant", "apis": [{ "api_pk": 266, "api_name": "Admin Portal - Dashboard Participant", "api_url": "get-participant/", "method": "POST" }] }, { "query_pk": 105, "query_title": "status_order_ad", "apis": [{ "api_pk": 157, "api_name": "order_status_ad", "api_url": "orderstatusad/", "method": "GET" }] }, { "query_pk": 241, "query_title": "Admin Portal - Order Cancelled Status List", "apis": [{ "api_pk": 299, "api_name": "Admin Portal - Order Cancelled Status List", "api_url": "order-cancelled-status-list/", "method": "POST" }] }, { "query_pk": 211, "query_title": "UUID-Check", "apis": [{ "api_pk": 319, "api_name": "UUID-Check", "api_url": "UUID-Check/", "method": "POST" }] }, { "query_pk": 222, "query_title": "vendis_magento_status_map", "apis": [{ "api_pk": 245, "api_name": "vendis_magento_status_map", "api_url": "vendis_magento_status_map/", "method": "POST" }] }, { "query_pk": 187, "query_title": "Vendor_welcome", "apis": [{ "api_pk": 320, "api_name": "Vendor_welcome", "api_url": "vendor_welcome/", "method": "POST" }] }, { "query_pk": 173, "query_title": "Admin Portal - Dashboard Vendors", "apis": [{ "api_pk": 267, "api_name": "Admin Portal - Dashboard Vendors", "api_url": "get-vendors/", "method": "POST" }] }, { "query_pk": 115, "query_title": "order_getparticipant", "apis": [{ "api_pk": 246, "api_name": "order_getparticipant", "api_url": "order_getparticipant/", "method": "POST" }, { "api_pk": 209, "api_name": "test-query", "api_url": "test-query/", "method": "POST" }] }, { "query_pk": 53, "query_title": "Temp_Query", "apis": [{ "api_pk": 205, "api_name": "Temp_Query", "api_url": "Temp_Query/", "method": "POST" }] }, { "query_pk": 188, "query_title": "Admin Portal -  Dashboard Pending Products", "apis": [{ "api_pk": 268, "api_name": "Admin Portal -  Dashboard Pending Products", "api_url": "get-pending-products/", "method": "POST" }] }, { "query_pk": 212, "query_title": "Attribute_payload", "apis": [{ "api_pk": 321, "api_name": "Attribute_payload", "api_url": "Attribute_payload/", "method": "POST" }] }, { "query_pk": 122, "query_title": "order_payloadprocess", "apis": [{ "api_pk": 247, "api_name": "order_payloadprocess", "api_url": "order_payloadprocess/", "method": "POST" }] }, { "query_pk": 87, "query_title": "check-if-query-exists", "apis": [{ "api_pk": 182, "api_name": "check-if-query-exists", "api_url": "check-if-query-exists/", "method": "POST" }] }, { "query_pk": 185, "query_title": "Payload-Generation", "apis": [{ "api_pk": 322, "api_name": "Payload-Generation", "api_url": "Payload-Generation/", "method": "POST" }] }, { "query_pk": 123, "query_title": "order_vendormail", "apis": [{ "api_pk": 249, "api_name": "order_vendormail", "api_url": "order_vendormail/", "method": "POST" }] }, { "query_pk": 42, "query_title": "Magento_order", "apis": [{ "api_pk": 200, "api_name": "Magento_order", "api_url": "Magento_order/", "method": "POST" }] }, { "query_pk": 230, "query_title": "CSO_reject_order", "apis": [{ "api_pk": 324, "api_name": "CSO_reject_order", "api_url": "cso_reject_order/", "method": "POST" }] }, { "query_pk": 269, "query_title": "update-order-array", "apis": [{ "api_pk": 325, "api_name": "update-order-array", "api_url": "update-order-array/", "method": "POST" }] }, { "query_pk": 69, "query_title": "Product_upload", "apis": [{ "api_pk": 203, "api_name": "Product_upload", "api_url": "Product_upload/", "method": "POST" }] }, { "query_pk": 70, "query_title": "Get_Product_ID", "apis": [{ "api_pk": 204, "api_name": "Get_Product_ID", "api_url": "Get_Product_ID/", "method": "POST" }] }, { "query_pk": 98, "query_title": "confirmorder_preprocess", "apis": [{ "api_pk": 251, "api_name": "confirmorder_preprocess", "api_url": "confirmorder_preprocess/", "method": "POST" }] }, { "query_pk": 121, "query_title": "test-clubbing", "apis": [{ "api_pk": 210, "api_name": "test-clubbing", "api_url": "test-clubbing/", "method": "POST" }] }, { "query_pk": 236, "query_title": "cso-order-type-edit", "apis": [{ "api_pk": 326, "api_name": "cso-order-type-edit", "api_url": "cso-order-type-edit/", "method": "POST" }] }, { "query_pk": 86, "query_title": "check-if-order-exists", "apis": [{ "api_pk": 213, "api_name": "check-if-order-exists", "api_url": "check-if-order-exists/", "method": "POST" }] }, { "query_pk": 147, "query_title": "get-latest-vendor", "apis": [{ "api_pk": 216, "api_name": "get-latest-vendor", "api_url": "get-latest-vendor/", "method": "POST" }] }, { "query_pk": 118, "query_title": "confirmorder_emailbody", "apis": [{ "api_pk": 252, "api_name": "confirmorder_emailbody", "api_url": "confirmorder_emailbody/", "method": "POST" }] }, { "query_pk": 23, "query_title": "iframe_query_test", "apis": [{ "api_pk": 202, "api_name": "iframe_query_test", "api_url": "iframe_query_test/", "method": "POST" }] }, { "query_pk": 119, "query_title": "rejectorder_fetchpm", "apis": [{ "api_pk": 253, "api_name": "rejectorder_fetchpm", "api_url": "rejectorder_fetchpm/", "method": "POST" }, { "api_pk": 214, "api_name": "fetch_pm_order", "api_url": "fetch_pm_order/", "method": "POST" }] }, { "query_pk": 203, "query_title": "payload_attribute", "apis": [{ "api_pk": 327, "api_name": "payload_attribute", "api_url": "payload_attribute/", "method": "POST" }] }, { "query_pk": 268, "query_title": "UpdateShipment", "apis": [{ "api_pk": 328, "api_name": "UpdateShipment", "api_url": "updateshipment/", "method": "POST" }] }, { "query_pk": 88, "query_title": "check-order", "apis": [{ "api_pk": 211, "api_name": "check-order", "api_url": "check-order/", "method": "POST" }] }, { "query_pk": 135, "query_title": "get-line-item-pk", "apis": [{ "api_pk": 217, "api_name": "get-line-item-pk", "api_url": "get-line-item-pk/", "method": "POST" }] }, { "query_pk": 141, "query_title": "transform-items", "apis": [{ "api_pk": 218, "api_name": "transform-items", "api_url": "transform-items/", "method": "POST" }] }, { "query_pk": 153, "query_title": "inventory-listing", "apis": [{ "api_pk": 194, "api_name": "inventory-listing", "api_url": "inventory-listing/", "method": "POST" }] }, { "query_pk": 59, "query_title": "My details vendor", "apis": [{ "api_pk": 195, "api_name": "My details vendor", "api_url": "My details vendor/", "method": "POST" }] }, { "query_pk": 60, "query_title": "staff-query", "apis": [{ "api_pk": 196, "api_name": "staff-query", "api_url": "staff-query/", "method": "POST" }] }, { "query_pk": 100, "query_title": "check-json", "apis": [{ "api_pk": 197, "api_name": "check-json", "api_url": "check-json/", "method": "POST" }] }, { "query_pk": 99, "query_title": "Mail edit", "apis": [{ "api_pk": 198, "api_name": "Mail edit", "api_url": "Mail edit/", "method": "POST" }] }, { "query_pk": 270, "query_title": "payment-check-reminder", "apis": [{ "api_pk": 329, "api_name": "payment-check-reminder", "api_url": "payment-check-reminder/", "method": "POST" }] }, { "query_pk": 109, "query_title": "Order-Query-New", "apis": [{ "api_pk": 206, "api_name": "Order-Query-New", "api_url": "Order-Query-New/", "method": "POST" }] }, { "query_pk": 93, "query_title": "trim-link-invoice", "apis": [{ "api_pk": 207, "api_name": "trim-link-invoice", "api_url": "trim-link-invoice/", "method": "POST" }] }, { "query_pk": 237, "query_title": "cso-cancel-order", "apis": [{ "api_pk": 330, "api_name": "cso-cancel-order", "api_url": "cso-cancel-order/", "method": "POST" }] }, { "query_pk": 263, "query_title": "all-order-cancelled", "apis": [{ "api_pk": 331, "api_name": "all-order-cancelled", "api_url": "all-order-cancelled/", "method": "POST" }] }, { "query_pk": 204, "query_title": "ErrorHandling_Attribute", "apis": [{ "api_pk": 332, "api_name": "ErrorHandling_Attribute", "api_url": "ErrorHandling_Attribute/", "method": "POST" }] }, { "query_pk": 214, "query_title": "admin-product-error-reporting", "apis": [{ "api_pk": 242, "api_name": "Error_Admin", "api_url": "error-report/", "method": "POST" }] }, { "query_pk": 257, "query_title": "item-to-be-shipped", "apis": [{ "api_pk": 333, "api_name": "item-to-be-shipped", "api_url": "item-to-be-shipped/", "method": "POST" }] }, { "query_pk": 215, "query_title": "vendor-product-error-reporting", "apis": [{ "api_pk": 243, "api_name": "Error_Vendor", "api_url": "error-report-vendor/", "method": "POST" }] }, { "query_pk": 228, "query_title": "check-if-all-items-shipped", "apis": [{ "api_pk": 334, "api_name": "check-if-all-items-shipped", "api_url": "check-if-all-items-shipped/", "method": "POST" }] }, { "query_pk": 238, "query_title": "create_magento_invoice_condition", "apis": [{ "api_pk": 335, "api_name": "create_magento_invoice_condition", "api_url": "create_magento_invoice_condition/", "method": "POST" }] }, { "query_pk": 219, "query_title": "Token_Generate_Bearer", "apis": [{ "api_pk": 244, "api_name": "token_generate", "api_url": "token-generate-bearer/", "method": "POST" }] }, { "query_pk": 258, "query_title": "shipment_checkorder", "apis": [{ "api_pk": 336, "api_name": "shipment_checkorder", "api_url": "shipment_checkorder/", "method": "POST" }] }, { "query_pk": 265, "query_title": "Processed_invoice", "apis": [{ "api_pk": 337, "api_name": "Processed_invoice", "api_url": "processed_invoice/", "method": "POST" }] }, { "query_pk": 261, "query_title": "order_ship_check", "apis": [{ "api_pk": 338, "api_name": "order_ship_check", "api_url": "order_ship_check/", "method": "POST" }] }, { "query_pk": 264, "query_title": "restock-items", "apis": [{ "api_pk": 339, "api_name": "restock-items", "api_url": "restock-items/", "method": "POST" }] }, { "query_pk": 239, "query_title": "cancel-order-magento", "apis": [{ "api_pk": 340, "api_name": "cancel-order-magento", "api_url": "cancel-order-magento/", "method": "POST" }] }, { "query_pk": 235, "query_title": "ready-for-order-processing-check", "apis": [{ "api_pk": 341, "api_name": "ready-for-order-processing-check", "api_url": "ready-for-order-processing-check/", "method": "POST" }] }, { "query_pk": 260, "query_title": "Admin Portal - Vendor Status Name", "apis": [{ "api_pk": 307, "api_name": "Admin Portal - Vendor Status Name", "api_url": "vendor-status-name/", "method": "GET" }] }, { "query_pk": 234, "query_title": "ready-for-processing-check", "apis": [{ "api_pk": 342, "api_name": "ready-for-processing-check", "api_url": "ready-for-processing-check/", "method": "POST" }] }, { "query_pk": 256, "query_title": "Admin Portal - Vendor Tab Count", "apis": [{ "api_pk": 304, "api_name": "Admin Portal - Vendor Tab Count", "api_url": "vendor-tab-count/", "method": "POST" }] }, { "query_pk": 225, "query_title": "edit-order-cso-form", "apis": [{ "api_pk": 254, "api_name": "edit-order-cso-form", "api_url": "edit-order-cso-form/", "method": "POST" }] }, { "query_pk": 267, "query_title": "get-all-notes", "apis": [{ "api_pk": 343, "api_name": "get-all-notes", "api_url": "get-all-notes/", "method": "POST" }] }, { "query_pk": 255, "query_title": "Admin Portal - Tab Count", "apis": [{ "api_pk": 305, "api_name": "Admin Portal - Tab Count", "api_url": "tab-count/", "method": "POST" }] }, { "query_pk": 259, "query_title": "delivery_address", "apis": [{ "api_pk": 306, "api_name": "delivery_address", "api_url": "delivery_address/", "method": "POST" }] }, { "query_pk": 266, "query_title": "get-all-order-pks", "apis": [{ "api_pk": 344, "api_name": "get-all-order-pks", "api_url": "get-all-order-pks/", "method": "POST" }] }, { "query_pk": 218, "query_title": "get-prod-options", "apis": [{ "api_pk": 345, "api_name": "get-prod-options", "api_url": "get-prod-options/", "method": "POST" }] }, { "query_pk": 210, "query_title": "original-query-prod", "apis": [{ "api_pk": 346, "api_name": "original-query-prod", "api_url": "original-query-prod/", "method": "POST" }] }, { "query_pk": 171, "query_title": "variant-query-update", "apis": [{ "api_pk": 347, "api_name": "variant-query-update", "api_url": "variant-query-update/", "method": "POST" }] }, { "query_pk": 223, "query_title": "compare-total-count", "apis": [{ "api_pk": 348, "api_name": "compare-total-count", "api_url": "compare-total-count/", "method": "POST" }] }, { "query_pk": 216, "query_title": "compare-total-variants", "apis": [{ "api_pk": 349, "api_name": "compare-total-variants", "api_url": "compare-total-variants/", "method": "POST" }] }, { "query_pk": 205, "query_title": "Category_new_attribute", "apis": [{ "api_pk": 350, "api_name": "Category_new_attribute", "api_url": "Category_new_attribute/", "method": "POST" }] }, { "query_pk": 184, "query_title": "Pending_approval", "apis": [{ "api_pk": 352, "api_name": "Pending_approval", "api_url": "Pending_approval/", "method": "POST" }] }, { "query_pk": 271, "query_title": "get-user-token", "apis": [{ "api_pk": 353, "api_name": "get-user-token", "api_url": "get-user-token/", "method": "POST" }] }, { "query_pk": 160, "query_title": "new sales query", "apis": [{ "api_pk": 354, "api_name": "new sales query", "api_url": "new_sales_query/", "method": "POST" }] }];

function ApiExplorerPage({ darkMode, panel, inputCls, mutedCls }) {
  const [data, setData] = useState(EMBEDDED_API_DATA);
  const [searchTerm, setSearchTerm] = useState('');
  const [copiedKey, setCopiedKey] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  const handleCopy = (text, key) => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1500);
    });
  };

  const loadJSON = (text) => {
    try {
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) {
        alert('Expected a JSON array.');
        return;
      }
      setData(parsed);
      setSearchTerm('');
    } catch (e) {
      alert('Invalid JSON file: ' + e.message);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => loadJSON(ev.target.result);
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => loadJSON(ev.target.result);
    reader.readAsText(file);
  };

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return data;
    return data.filter((item) => {
      if (item.query_title.toLowerCase().includes(q)) return true;
      if (String(item.query_pk).includes(q)) return true;
      return item.apis.some(
        (a) =>
          a.api_name.toLowerCase().includes(q) ||
          a.api_url.toLowerCase().includes(q) ||
          String(a.api_pk).includes(q)
      );
    });
  }, [data, searchTerm]);

  const CopyBtn = ({ text, k }) => (
    <button
      onClick={() => handleCopy(text, k)}
      className={`inline-flex items-center justify-center w-6 h-6 rounded transition-colors shrink-0 ${copiedKey === k
          ? 'text-emerald-500'
          : darkMode
            ? `${mutedCls} hover:bg-neutral-800 hover:text-sky-400`
            : `${mutedCls} hover:bg-neutral-100 hover:text-sky-600`
        }`}
      title="Copy"
    >
      {copiedKey === k ? <Check size={12} /> : <Copy size={12} />}
    </button>
  );

  return (
    <>
      <div className={`border-x px-5 py-2 ${darkMode ? 'border-neutral-800' : 'border-neutral-200'}`}>
        <h1 className="text-lg font-sans font-bold tracking-tight flex items-center gap-2">
          <Network size={16} className="text-sky-400" />
          Query ↔ API Explorer
        </h1>
        <p className={`text-xs mt-0.5 font-sans ${mutedCls}`}>Browse query-to-endpoint mappings</p>
      </div>

      {/* Toolbar */}
      <div className={`border-x border-b rounded-b-xl px-5 py-4 mb-6 flex items-center gap-3 flex-wrap ${panel}`}>
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={14} className={`absolute left-3 top-1/2 -translate-y-1/2 ${mutedCls}`} />
          <input
            className={`w-full pl-9 pr-3 py-2 rounded-lg text-sm outline-none border transition-colors ${inputCls}`}
            placeholder="Search queries or APIs…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <button
          onClick={() => fileInputRef.current?.click()}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-sans font-bold transition-colors ${darkMode
              ? 'border-neutral-800 text-neutral-300 hover:border-sky-500 hover:text-sky-400'
              : 'border-neutral-200 text-neutral-700 hover:border-sky-500 hover:text-sky-600'
            }`}
        >
          <Upload size={13} />
          Upload JSON
        </button>
        <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleFileChange} />
        <span className={`text-[11px] font-sans font-bold ml-auto ${mutedCls}`}>
          Showing {filtered.length} of {data.length}
        </span>
      </div>

      {data.length === 0 ? (
        <div
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-xl p-16 text-center cursor-pointer transition-colors ${dragOver
              ? (darkMode ? 'border-sky-500 bg-sky-500/5' : 'border-sky-500 bg-sky-50')
              : (darkMode ? 'border-neutral-800' : 'border-neutral-300')
            }`}
        >
          <Inbox size={32} className={`mx-auto mb-3 ${mutedCls}`} />
          <p className={`text-sm font-sans font-semibold ${darkMode ? 'text-neutral-300' : 'text-neutral-700'}`}>
            Drop your JSON file here
          </p>
          <p className={`text-xs font-sans mt-1 ${mutedCls}`}>
            or click "Upload JSON" above — supports the query_api_mapping format
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className={`p-16 text-center text-sm font-sans ${mutedCls}`}>No matches found.</div>
      ) : (
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
          {filtered.map((item) => (
            <div
              key={item.query_pk}
              className={`rounded-xl border overflow-hidden flex flex-col transition-colors hover:border-sky-500/50 ${panel}`}
            >
              <div className={`px-4 py-3 border-b flex items-start justify-between gap-2 ${darkMode ? 'border-neutral-800' : 'border-neutral-200'}`}>
                <div className="text-sm font-sans font-bold leading-snug flex-1">{item.query_title}</div>
                <span className={`text-[10px] font-mono font-medium px-1.5 py-0.5 rounded shrink-0 ${darkMode ? 'bg-neutral-800 text-neutral-400' : 'bg-neutral-100 text-neutral-600'
                  }`}>
                  Q#{item.query_pk}
                </span>
              </div>

              <div className="p-4 flex flex-col gap-3">
                <div className={`flex items-center gap-2 rounded-lg px-2.5 py-2 ${darkMode ? 'bg-neutral-950' : 'bg-neutral-50'}`}>
                  <span className={`text-[10px] font-sans font-bold uppercase tracking-wide shrink-0 ${mutedCls}`}>Query</span>
                  <span className="flex-1 min-w-0 truncate text-xs">{item.query_title}</span>
                  <CopyBtn text={item.query_title} k={`${item.query_pk}-title`} />
                </div>
                <div className={`flex items-center gap-2 rounded-lg px-2.5 py-2 ${darkMode ? 'bg-neutral-950' : 'bg-neutral-50'}`}>
                  <span className={`text-[10px] font-sans font-bold uppercase tracking-wide shrink-0 ${mutedCls}`}>Query PK</span>
                  <span className="flex-1 min-w-0 truncate text-xs">{item.query_pk}</span>
                  <CopyBtn text={String(item.query_pk)} k={`${item.query_pk}-pk`} />
                </div>

                <div className={`text-[10px] font-sans font-bold uppercase tracking-wide flex items-center gap-2 ${mutedCls}`}>
                  {item.apis.length} API{item.apis.length !== 1 ? 's' : ''}
                  <span className={`flex-1 h-px ${darkMode ? 'bg-neutral-800' : 'bg-neutral-200'}`} />
                </div>

                <div className="flex flex-col gap-2">
                  {item.apis.map((api) => (
                    <div
                      key={api.api_pk}
                      className={`rounded-lg border px-2.5 py-2 flex flex-col gap-1.5 ${darkMode ? 'border-neutral-800' : 'border-neutral-200'}`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border shrink-0 ${methodBadgeClasses(api.method, darkMode)}`}>
                          {api.method}
                        </span>
                        <span className="flex-1 min-w-0 truncate text-xs font-sans font-semibold">{api.api_name}</span>
                        <span className={`text-[10px] font-mono shrink-0 ${mutedCls}`}>#{api.api_pk}</span>
                        <CopyBtn text={api.api_name} k={`${api.api_pk}-name`} />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="flex-1 min-w-0 truncate text-[11px] font-mono text-sky-400">{api.api_url}</span>
                        <CopyBtn text={api.api_url} k={`${api.api_pk}-url`} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// ===========================================================================
// Root App — shared chrome, theme, and page switcher
// ===========================================================================

export default function App() {
  const [darkMode, setDarkMode] = useState(true);
  const [page, setPage] = useState('logs'); // 'logs' | 'explorer'
  const [environment, setEnvironment] = useState('prod');

  const accent = page === 'logs' ? ACCENTS[environment] : EXPLORER_ACCENT;

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
      {/* Signature accent rail — tints with the active page/environment */}
      <div className={`h-1 w-full ${accent.topbar} transition-colors duration-300`} />

      <div className="w-full px-6 py-6">
        {/* Terminal chrome header */}
        <header className={`rounded-t-xl border px-4 py-3 flex items-center justify-between gap-3 flex-wrap ${panel}`}>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-rose-500/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-amber-500/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/70" />
            </div>
            <span className={`text-xs ${mutedCls}`}>
              vendis <span className="opacity-50">/</span>{' '}
              {page === 'logs' ? (
                <>
                  logstream-debugger <span className="opacity-50">/</span>{' '}
                  <span className={accent.text}>{environment}</span>
                </>
              ) : (
                <span className={accent.text}>api-explorer</span>
              )}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Page switcher */}
            <div className={`flex items-center p-1 rounded-lg border text-xs font-sans font-bold ${darkMode ? 'bg-neutral-950 border-neutral-800' : 'bg-neutral-100 border-neutral-200'
              }`}>
              <button
                onClick={() => setPage('logs')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all ${page === 'logs'
                    ? ACCENTS[environment].segActive
                    : darkMode ? 'text-neutral-500 hover:text-neutral-300' : 'text-neutral-500 hover:text-neutral-700'
                  }`}
              >
                <Terminal size={12} /> Logs
              </button>
              <button
                onClick={() => setPage('explorer')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all ${page === 'explorer'
                    ? EXPLORER_ACCENT.segActive
                    : darkMode ? 'text-neutral-500 hover:text-neutral-300' : 'text-neutral-500 hover:text-neutral-700'
                  }`}
              >
                <Network size={12} /> API Explorer
              </button>
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
          </div>
        </header>

        {page === 'logs' ? (
          <LogStreamPage
            darkMode={darkMode}
            environment={environment}
            setEnvironment={setEnvironment}
            panel={panel}
            panelSoft={panelSoft}
            inputCls={inputCls}
            labelCls={labelCls}
            mutedCls={mutedCls}
          />
        ) : (
          <ApiExplorerPage
            darkMode={darkMode}
            panel={panel}
            panelSoft={panelSoft}
            inputCls={inputCls}
            labelCls={labelCls}
            mutedCls={mutedCls}
          />
        )}
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