#!/usr/bin/env python3
"""Minimal zero-dependency Chrome DevTools Protocol helper (owner: opus-pageant-director).

Used by tests/smoke.py and available to any test script:

  from cdp import Browser
  with Browser(width=1280, height=800) as b:
    b.goto('index.html?level=1-1')          # path relative to the repo root (served in-process)
    print(b.eval('JSON.stringify(window.__PAGEANT__.getState())'))
    b.screenshot('/tmp/bv1xyn/shots/x.png')

Chrome runs headless with an isolated throwaway profile under /tmp/bv1xyn and --no-proxy-server
(a system proxy would otherwise intercept http://127.0.0.1 and the page never loads).
"""
import base64
import functools
import http.server
import json
import os
import shutil
import socket
import struct
import subprocess
import tempfile
import threading
import time
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TMP = '/tmp/bv1xyn'
CHROME = os.environ.get('CHROME_BIN', '/usr/bin/google-chrome')


class _Quiet(http.server.SimpleHTTPRequestHandler):
  log = None

  def log_message(self, fmt, *args):
    if _Quiet.log is not None:
      _Quiet.log.append((self.command, self.path, args[1] if len(args) > 1 else ''))

  def end_headers(self):
    self.send_header('Cache-Control', 'no-store')
    super().end_headers()


def _free_port():
  with socket.socket() as s:
    s.bind(('127.0.0.1', 0))
    return s.getsockname()[1]


class _WS:
  """Tiny RFC-6455 client (text frames only, client->server masked)."""

  def __init__(self, url):
    assert url.startswith('ws://')
    hostport, path = url[5:].split('/', 1)
    host, port = hostport.split(':')
    self.sock = socket.create_connection((host, int(port)), timeout=60)
    key = base64.b64encode(os.urandom(16)).decode()
    req = (f'GET /{path} HTTP/1.1\r\nHost: {hostport}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n'
           f'Sec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n')
    self.sock.sendall(req.encode())
    resp = b''
    while b'\r\n\r\n' not in resp:
      resp += self.sock.recv(4096)
    if b' 101 ' not in resp.split(b'\r\n')[0]:
      raise RuntimeError('websocket handshake failed: ' + resp[:200].decode(errors='replace'))
    self.buf = resp.split(b'\r\n\r\n', 1)[1]

  def send(self, text):
    data = text.encode()
    hdr = bytearray([0x81])
    n = len(data)
    if n < 126:
      hdr.append(0x80 | n)
    elif n < 65536:
      hdr.append(0x80 | 126); hdr += struct.pack('>H', n)
    else:
      hdr.append(0x80 | 127); hdr += struct.pack('>Q', n)
    mask = os.urandom(4)
    hdr += mask
    self.sock.sendall(bytes(hdr) + bytes(b ^ mask[i % 4] for i, b in enumerate(data)))

  def _read(self, n):
    while len(self.buf) < n:
      chunk = self.sock.recv(1 << 20)
      if not chunk:
        raise ConnectionError('websocket closed')
      self.buf += chunk
    out, self.buf = self.buf[:n], self.buf[n:]
    return out

  def recv(self):
    msg = b''
    while True:
      b0, b1 = self._read(2)
      n = b1 & 0x7f
      if n == 126:
        n = struct.unpack('>H', self._read(2))[0]
      elif n == 127:
        n = struct.unpack('>Q', self._read(8))[0]
      if b1 & 0x80:
        mask = self._read(4)
        payload = bytes(b ^ mask[i % 4] for i, b in enumerate(self._read(n)))
      else:
        payload = self._read(n)
      op = b0 & 0x0f
      if op == 0x8:
        raise ConnectionError('websocket closed by peer')
      if op in (0x9, 0xA):
        continue
      msg += payload
      if b0 & 0x80:
        return msg.decode(errors='replace')


class Browser:
  def __init__(self, width=1280, height=800, root=ROOT, mobile=False):
    self.width, self.height, self.root, self.mobile = width, height, root, mobile
    self.requests = []
    self.console = []
    self.exceptions = []

  def __enter__(self):
    os.makedirs(TMP, exist_ok=True)
    _Quiet.log = self.requests
    handler = functools.partial(_Quiet, directory=self.root)
    self.srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler)
    self.http_port = self.srv.server_address[1]
    threading.Thread(target=self.srv.serve_forever, daemon=True).start()
    self.profile = tempfile.mkdtemp(prefix='chrome_cdp_', dir=TMP)
    self.dbg_port = _free_port()
    cmd = [CHROME, '--headless=new', '--ozone-platform=headless', '--no-sandbox', '--disable-dev-shm-usage',
           '--no-first-run', '--no-default-browser-check', '--no-proxy-server', '--disable-background-networking',
           '--disable-extensions', '--disable-sync', '--mute-audio', '--hide-scrollbars=false',
           f'--window-size={self.width},{self.height}', f'--remote-debugging-port={self.dbg_port}',
           '--remote-allow-origins=*', f'--user-data-dir={self.profile}', 'about:blank']
    home = os.path.join(self.profile, 'home')
    os.makedirs(home, exist_ok=True)
    env = {'PATH': '/usr/local/bin:/usr/bin:/bin', 'HOME': home, 'TMPDIR': self.profile,
           'XDG_CONFIG_HOME': os.path.join(home, '.config'), 'XDG_CACHE_HOME': os.path.join(home, '.cache'),
           'LANG': 'en_US.UTF-8'}
    self.proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, stdin=subprocess.DEVNULL,
                                 env=env, cwd=self.profile, start_new_session=True)
    ws_url = None
    for _ in range(150):
      try:
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        with opener.open(f'http://127.0.0.1:{self.dbg_port}/json/list', timeout=1) as r:
          for t in json.load(r):
            if t.get('type') == 'page':
              ws_url = t['webSocketDebuggerUrl']; break
        if ws_url:
          break
      except Exception:
        pass
      time.sleep(0.1)
    if not ws_url:
      self.__exit__(None, None, None)
      raise RuntimeError('chrome devtools endpoint not available')
    self.ws = _WS(ws_url)
    self._id = 0
    self.cmd('Page.enable'); self.cmd('Runtime.enable')
    self.cmd('Emulation.setDeviceMetricsOverride', width=self.width, height=self.height,
             deviceScaleFactor=1, mobile=self.mobile)
    if self.mobile:
      self.cmd('Emulation.setTouchEmulationEnabled', enabled=True, maxTouchPoints=5)
    return self

  def __exit__(self, *exc):
    try:
      self.proc.terminate(); self.proc.wait(timeout=5)
    except Exception:
      try:
        self.proc.kill()
      except Exception:
        pass
    try:
      self.srv.shutdown()
    except Exception:
      pass
    shutil.rmtree(getattr(self, 'profile', ''), ignore_errors=True)

  def cmd(self, method, **params):
    self._id += 1
    my = self._id
    self.ws.send(json.dumps({'id': my, 'method': method, 'params': params}))
    while True:
      msg = json.loads(self.ws.recv())
      if msg.get('id') == my:
        if 'error' in msg:
          raise RuntimeError(f'{method}: {msg["error"]}')
        return msg.get('result', {})
      m = msg.get('method')
      if m == 'Runtime.consoleAPICalled':
        p = msg['params']
        self.console.append((p.get('type'), ' '.join(str(a.get('value', a.get('description', ''))) for a in p.get('args', []))))
      elif m == 'Runtime.exceptionThrown':
        d = msg['params'].get('exceptionDetails', {})
        self.exceptions.append(d.get('exception', {}).get('description') or d.get('text'))

  def goto(self, path, wait_expr='window.__PAGEANT__ !== undefined', timeout=20):
    url = f'http://127.0.0.1:{self.http_port}/{path.lstrip("/")}'
    self.cmd('Page.navigate', url=url)
    t0 = time.time()
    while time.time() - t0 < timeout:
      try:
        if self.eval(f'!!({wait_expr})'):
          return True
      except RuntimeError:
        pass
      time.sleep(0.15)
    return False

  def eval(self, expr, await_promise=True):
    r = self.cmd('Runtime.evaluate', expression=expr, returnByValue=True, awaitPromise=await_promise)
    if 'exceptionDetails' in r:
      d = r['exceptionDetails']
      raise RuntimeError((d.get('exception') or {}).get('description') or d.get('text'))
    return r.get('result', {}).get('value')

  def screenshot(self, path, fmt=None, quality=85):
    fmt = fmt or ('jpeg' if path.lower().endswith(('.jpg', '.jpeg')) else 'png')
    kw = {'format': fmt}
    if fmt == 'jpeg':
      kw['quality'] = quality
    data = self.cmd('Page.captureScreenshot', **kw)['data']
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'wb') as f:
      f.write(base64.b64decode(data))
    return path

  def tap(self, x, y):
    for t in ('mousePressed', 'mouseReleased'):
      self.cmd('Input.dispatchMouseEvent', type=t, x=x, y=y, button='left', clickCount=1)

  def drag(self, x0, y0, x1, y1, steps=12):
    self.cmd('Input.dispatchMouseEvent', type='mousePressed', x=x0, y=y0, button='left', clickCount=1)
    for i in range(1, steps + 1):
      self.cmd('Input.dispatchMouseEvent', type='mouseMoved', x=x0 + (x1 - x0) * i / steps,
               y=y0 + (y1 - y0) * i / steps, button='left')
    self.cmd('Input.dispatchMouseEvent', type='mouseReleased', x=x1, y=y1, button='left', clickCount=1)
