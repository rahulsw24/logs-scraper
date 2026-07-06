import React, { useState } from 'react';

export default function App() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Environment Selection Config
  const [environment, setEnvironment] = useState('prod'); // 'prod' | 'uat' | 'staging'
  const [logGroup, setLogGroup] = useState('source');

  // Time Selection Configurations
  const [rangeMode, setRangeMode] = useState('relative'); // 'relative' | 'custom'
  const [timePeriod, setTimePeriod] = useState('12h');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const [searchTerm, setSearchTerm] = useState('');
  const [expandedIndex, setExpandedIndex] = useState(null);

  // Unified configuration lookup for environments
  const envConfig = {
    prod: {
      domain: 'https://shop.vendis.com.au',
      poolId: 'gpool812642',
      pageSize: '1000'
    },
    uat: {
      domain: 'https://uat-admin.vendis.com.au',
      poolId: 'gpoole048a3',
      pageSize: '100'
    },
    staging: {
      domain: 'https://staging.vendis.com.au',
      poolId: 'gpoold4a251',
      pageSize: '9999'
    }
  };

  const fetchLogsDirectly = async () => {
    setLoading(true);
    setError(null);
    try {
      const config = envConfig[environment] || envConfig.prod;

      // Dynamically compute parameter options based on target criteria
      let queryParams = `pool_id=${config.poolId}&project_pk=1720&metric=LogStream&log_group=${logGroup}&page_size=${config.pageSize}`;

      // Conditional timeframe block
      if (rangeMode === 'custom') {
        if (!startDate || !endDate) {
          throw new Error('Please select both a valid start and end timestamp window.');
        }
        const formatSecString = (val) => val.length === 16 ? `${val}:00` : val;
        queryParams += `&start_datetime=${formatSecString(startDate)}&end_datetime=${formatSecString(endDate)}`;
      } else {
        queryParams += `&timePeriod=${timePeriod}`;
      }

      const targetUrl = `${config.domain}/metrics/?${queryParams}`;

      const response = await fetch(targetUrl, {
        method: 'GET',
        headers: {
          'Cookie': 'ARRAffinity=c5a7757e69685973957f147f7f547fda25aa575bf0a4b54c17c0da5eb7f451e6; ARRAffinitySameSite=c5a7757e69685973957f147f7f547fda25aa575bf0a4b54c17c0da5eb7f451e6'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP Error Status: ${response.status}`);
      }

      const data = await response.json();
      const parsedLogs = data.LogStream?.events || (Array.isArray(data) ? data : []);
      setLogs(parsedLogs);
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

  const filteredLogs = logs.filter(log => {
    const hayStack = `${log.Message} ${log.Timestamp}`.toLowerCase();
    return hayStack.includes(searchTerm.toLowerCase());
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 font-mono selection:bg-sky-500 selection:text-white">
      {/* App Header */}
      <header className="border-b border-slate-800 pb-4 mb-6">
        <h1 className="text-2xl font-bold text-sky-400 flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-emerald-500 animate-pulse"></span>
          Vendis Multi-Env LogStream Debugger
        </h1>
        <p className="text-xs text-slate-500 mt-1">Direct unproxied transaction window monitor</p>
      </header>

      {/* Control Console */}
      <div className="bg-slate-900 p-5 rounded-lg border border-slate-800 mb-6 shadow-xl flex flex-col gap-5">

        {/* Core Environments & Target Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="flex flex-col gap-2">
            <label className="text-xs font-bold text-slate-400 tracking-wider uppercase">Environment Target</label>
            <div className="grid grid-cols-3 bg-slate-950 p-1 rounded border border-slate-800 text-center text-xs font-bold">
              <button
                className={`py-1.5 rounded transition-colors ${environment === 'prod' ? 'bg-sky-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
                onClick={() => setEnvironment('prod')}
              >PROD</button>
              <button
                className={`py-1.5 rounded transition-colors ${environment === 'uat' ? 'bg-amber-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
                onClick={() => setEnvironment('uat')}
              >UAT</button>
              <button
                className={`py-1.5 rounded transition-colors ${environment === 'staging' ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
                onClick={() => setEnvironment('staging')}
              >STAGING</button>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs font-bold text-slate-400 tracking-wider uppercase">Lambda Target</label>
            <select
              className="p-2 bg-slate-800 border border-slate-700 text-slate-200 rounded outline-none focus:border-sky-500 text-sm h-[38px]"
              value={logGroup}
              onChange={(e) => setLogGroup(e.target.value)}
            >
              <option value="source">source</option>
              <option value="webapi_handler">webapi_handler</option>
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs font-bold text-slate-400 tracking-wider uppercase">Timeline Window Method</label>
            <div className="grid grid-cols-2 bg-slate-950 p-1 rounded border border-slate-800 text-center text-xs font-bold">
              <button
                className={`py-1.5 rounded transition-colors ${rangeMode === 'relative' ? 'bg-slate-800 text-sky-400' : 'text-slate-500'}`}
                onClick={() => setRangeMode('relative')}
              >Quick Interval</button>
              <button
                className={`py-1.5 rounded transition-colors ${rangeMode === 'custom' ? 'bg-slate-800 text-sky-400' : 'text-slate-500'}`}
                onClick={() => setRangeMode('custom')}
              >Specific Datetime</button>
            </div>
          </div>
        </div>

        {/* Conditional Interval / Custom Range Row */}
        <div className="border-t border-slate-800/60 pt-4 flex flex-wrap gap-4 items-end">
          {rangeMode === 'relative' ? (
            <div className="flex flex-col gap-2">
              <label className="text-xs font-bold text-slate-400 tracking-wider uppercase">Interval Back window</label>
              <select
                className="p-2 bg-slate-800 border border-slate-700 text-slate-200 rounded w-48 outline-none focus:border-sky-500 text-sm"
                value={timePeriod}
                onChange={(e) => setTimePeriod(e.target.value)}
              >
                <option value="30m">30 Minutes</option>
                <option value="1h">1 Hour</option>
                <option value="12h">12 Hours</option>
                <option value="1d">1 Day</option>
              </select>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full md:w-auto md:flex md:flex-row items-end">
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-slate-400 tracking-wider uppercase">Start Timestamp</label>
                <input
                  type="datetime-local"
                  className="p-2 bg-slate-800 border border-slate-700 text-slate-200 rounded outline-none focus:border-sky-500 text-sm [color-scheme:dark]"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-slate-400 tracking-wider uppercase">End Timestamp</label>
                <input
                  type="datetime-local"
                  className="p-2 bg-slate-800 border border-slate-700 text-slate-200 rounded outline-none focus:border-sky-500 text-sm [color-scheme:dark]"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>
          )}

          {/* Action Trigger Button */}
          <button
            className={`ml-auto px-6 py-2 rounded font-bold text-sm text-white transition-all shadow-md active:scale-95 w-full md:w-auto h-[38px] ${loading
              ? 'bg-slate-700 cursor-not-allowed'
              : environment === 'prod'
                ? 'bg-sky-600 hover:bg-sky-500'
                : environment === 'uat'
                  ? 'bg-amber-600 hover:bg-amber-500'
                  : 'bg-purple-600 hover:bg-purple-500'
              }`}
            onClick={fetchLogsDirectly}
            disabled={loading}
          >
            {loading ? 'Streaming Records...' : `Fetch logs from ${environment.toUpperCase()}`}
          </button>
        </div>
      </div>

      {/* Local Filter Bar */}
      {logs.length > 0 && (
        <div className="relative mb-4">
          <input
            className="w-full p-3 pl-10 bg-slate-900 border border-slate-800 text-slate-200 rounded-lg text-sm outline-none focus:border-slate-700 transition-colors"
            type="text"
            placeholder="Filter live screen logs (e.g. SKU, Status Code, RequestID)..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <span className="absolute left-3 top-3.5 text-slate-500 text-sm">🔍</span>
          <span className="absolute right-3 top-3 text-xs bg-slate-800 text-slate-400 px-2.5 py-1 rounded-full border border-slate-700">
            {filteredLogs.length} of {logs.length} events matching
          </span>
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-950/40 border border-red-900 text-red-400 rounded-lg mb-6 text-sm flex gap-2">
          <span>⚠️</span>
          <div>{error}</div>
        </div>
      )}

      {/* Terminal Container */}
      <div className="border border-slate-800 rounded-lg overflow-hidden bg-slate-950 shadow-2xl">
        {filteredLogs.length === 0 ? (
          <div className="p-12 text-slate-600 text-center text-sm">
            {loading ? 'Polling active logs from target cloud environment...' : 'Terminal idle. Fire a stream fetch to examine transactions.'}
          </div>
        ) : (
          <div className="divide-y divide-slate-900">
            {filteredLogs.map((log, index) => {
              const isExpanded = expandedIndex === index;
              const msg = log.Message || '';

              const isError = msg.includes('status 4') || msg.includes('status 5') || msg.toLowerCase().includes('fail');
              const isStart = msg.startsWith('START') || msg.startsWith('INIT_START');
              const isShadow = msg.startsWith('REPORT') || msg.startsWith('END');

              let borderClass = 'border-l-4 border-l-slate-700';
              if (isError) borderClass = 'border-l-4 border-l-rose-500';
              else if (isStart) borderClass = 'border-l-4 border-l-amber-500';
              else if (isShadow) borderClass = 'border-l-4 border-l-purple-500';
              else if (msg.includes('[INFO]')) borderClass = 'border-l-4 border-l-emerald-500';

              return (
                <div key={index} className={`transition-colors ${isExpanded ? 'bg-slate-900/50' : 'hover:bg-slate-900/20'}`}>
                  {/* Row Summary */}
                  <div
                    className={`flex gap-4 p-3 items-center cursor-pointer text-xs ${borderClass}`}
                    onClick={() => setExpandedIndex(isExpanded ? null : index)}
                  >
                    <span className="text-slate-500 font-semibold select-none whitespace-nowrap">{log.Timestamp}</span>

                    <span className={`flex-1 truncate font-mono tracking-tight ${isError ? 'text-rose-300' : isStart ? 'text-amber-200' : 'text-slate-300'}`}>
                      {msg}
                    </span>

                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded transition-colors ${isExpanded ? 'bg-sky-950 text-sky-400' : 'bg-slate-900 text-slate-400'}`}>
                      {isExpanded ? 'CLOSE ▲' : 'VIEW ▼'}
                    </span>
                  </div>

                  {/* Expanded Inspector Panel */}
                  {isExpanded && (
                    <div className="px-4 pb-4 pt-1 bg-slate-950/60 border-t border-slate-900">
                      <div className="flex justify-between items-center mb-2 text-[11px] text-slate-500 border-b border-slate-900 pb-2">
                        <span><strong>Stream Source Instance:</strong> {log.LogStreamName}</span>
                      </div>

                      <pre className="p-4 bg-slate-900/80 rounded border border-slate-800 text-xs text-slate-300 overflow-x-auto whitespace-pre-wrap break-all leading-relaxed max-h-[500px] overflow-y-auto">
                        {makeHumanReadable(log.Message)}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}git