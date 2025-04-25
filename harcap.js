(() => {
    if (window.__HAR_CAPTURE_SCRIPT_LOADED) return;
    window.__HAR_CAPTURE_SCRIPT_LOADED = true;
  
    // HAR collector
    window.__HAR_COLLECTOR = {
      _entries: [],
      finish() {
        if (window.__HAR_PERF_OBS) window.__HAR_PERF_OBS.disconnect();
        return Promise.resolve({
          log: {
            version: '1.2',
            creator: { name: 'five9-har-capture', version: '1.0' },
            pages: [],
            entries: this._entries
          }
        });
      }
    };
  
    // — XMLHttpRequest override —
    const NativeXHR = window.XMLHttpRequest;
    class HAR_XHR extends NativeXHR {
      constructor() {
        super();
        this._start = 0;
        this._method = null;
        this._url = null;
        this._reqHeaders = {};
        this.addEventListener('loadstart', () => { this._start = Date.now(); });
        this.addEventListener('loadend', () => {
          const end = Date.now();
          const text = (this.responseType === '' || this.responseType === 'text')
            ? this.responseText : '';
          window.__HAR_COLLECTOR._entries.push({
            startedDateTime: new Date(this._start).toISOString(),
            time: end - this._start,
            request: {
              method: this._method, url: this._url, httpVersion: '',
              headers: Object.entries(this._reqHeaders).map(([n,v])=>({name:n,value:v})),
              queryString: [], postData: this._reqBody ? {
                mimeType: this._reqHeaders['Content-Type']||'', text: this._reqBody
              } : undefined,
              headersSize:-1, bodySize: this._reqBody ? this._reqBody.length : 0
            },
            response: {
              status:this.status, statusText:this.statusText, httpVersion:'',
              headers:[], 
              content:{ size: text.length, mimeType:this.getResponseHeader('Content-Type')||'', text },
              redirectURL:this.getResponseHeader('Location')||'', headersSize:-1, bodySize:text.length
            },
            timings:{ send:0, wait:end-this._start, receive:0 }
          });
        });
      }
      open(m,u,...rest){ this._method=m; this._url=u; return super.open(m,u,...rest) }
      setRequestHeader(n,v){ this._reqHeaders[n]=v; return super.setRequestHeader(n,v) }
      send(b){ this._reqBody = typeof b==='string'?b:''; return super.send(b) }
    }
    window.XMLHttpRequest = HAR_XHR;
  
    // — fetch override —
    const _fetch = window.fetch;
    window.fetch = (input, init={}) => {
      const start = Date.now();
      const method = init.method||'GET';
      const url = typeof input==='string'?input:(input.url||'');
      const hdrs = {};
      if (init.headers) {
        if (init.headers.forEach) init.headers.forEach((v,k)=>hdrs[k]=v);
        else Object.assign(hdrs, init.headers);
      }
      const body = init.body;
      return _fetch(input, init).then(res => {
        return res.clone().text().then(text => {
          const end = Date.now();
          window.__HAR_COLLECTOR._entries.push({
            startedDateTime: new Date(start).toISOString(),
            time: end - start,
            request:{
              method, url, httpVersion:'',
              headers: Object.entries(hdrs).map(([n,v])=>({name:n,value:v})),
              queryString:[], postData: body?{mimeType:hdrs['Content-Type']||'',text:body.toString()}:undefined,
              headersSize:-1, bodySize: body?body.toString().length:0
            },
            response:{
              status:res.status, statusText:res.statusText, httpVersion:'',
              headers:[], 
              content:{ size:text.length, mimeType:res.headers.get('Content-Type')||'', text },
              redirectURL:res.headers.get('Location')||'', headersSize:-1, bodySize:text.length
            },
            timings:{ send:0, wait:end-start, receive:0 }
          });
          return res;
        });
      });
    };
  
    // — performance observer for resources —
    try {
      const obs = new PerformanceObserver(list => {
        list.getEntries().forEach(e => {
          if (e.entryType==='resource') {
            const start = e.startTime + performance.timing.navigationStart;
            window.__HAR_COLLECTOR._entries.push({
              startedDateTime: new Date(start).toISOString(),
              time: e.duration,
              request:{ method:'GET', url:e.name, httpVersion:'', headers:[],queryString:[],headersSize:-1,bodySize:e.decodedBodySize },
              response:{ status:0,statusText:'',httpVersion:'',headers:[],
                content:{ size:e.decodedBodySize, mimeType:e.initiatorType, text:'' },
                redirectURL:'',headersSize:-1,bodySize:e.decodedBodySize
              },
              timings:{ send:0, wait:0, receive:e.duration }
            });
          }
        });
      });
      obs.observe({ type:'resource', buffered:true });
      window.__HAR_PERF_OBS = obs;
    } catch (e){}
  })();