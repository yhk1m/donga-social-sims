// tests/atlas/helpers/fakeDom.mjs — 렌더러·zoomer DOM 테스트용 아주 작은 가짜 DOM(새 의존성 없이).
// 렌더러가 쓰는 만큼만: 요소 트리·classList·속성·이벤트(캡처 → 버블, 대상 요소에서만)·리스너 수, 캔버스 2D(아무것도 안 그림),
// ResizeObserver(손으로 부름), requestAnimationFrame(손으로 비움), getComputedStyle, window.devicePixelRatio.
// installFakeDom() 은 globalThis 에 심고, 되돌리는 함수를 돌려준다.

class FakeTarget {
  constructor() { this._listeners = []; }
  addEventListener(type, fn, opts) {
    const capture = typeof opts === 'boolean' ? opts : !!opts?.capture;
    if (!this._listeners.some((l) => l.type === type && l.fn === fn && l.capture === capture)) this._listeners.push({ type, fn, capture });
  }
  removeEventListener(type, fn, opts) {
    const capture = typeof opts === 'boolean' ? opts : !!opts?.capture;
    const i = this._listeners.findIndex((l) => l.type === type && l.fn === fn && l.capture === capture);
    if (i >= 0) this._listeners.splice(i, 1);
  }
  get listenerCount() { return this._listeners.length; }
  /** 이 요소를 대상으로 한 이벤트: 캡처 리스너 먼저, 그다음 나머지(stopImmediatePropagation 존중). */
  dispatch(type, init = {}) {
    const ev = {
      type, target: this, currentTarget: this, defaultPrevented: false, _stop: false, ...init,
      stopImmediatePropagation() { this._stop = true; }, stopPropagation() {}, preventDefault() { this.defaultPrevented = true; },
    };
    for (const phase of [true, false]) {
      for (const l of [...this._listeners]) {
        if (l.type !== type || l.capture !== phase) continue;
        l.fn(ev);
        if (ev._stop) return ev;
      }
    }
    return ev;
  }
}

class FakeNode extends FakeTarget {
  constructor() { super(); this.parentNode = null; this.childNodes = []; }
  get firstChild() { return this.childNodes[0] || null; }
  get children() { return this.childNodes.filter((c) => c instanceof FakeElement); }
  append(...nodes) { for (const n of nodes) this.insertBefore(n, null); }
  insertBefore(n, ref) {
    n.remove();
    n.parentNode = this;
    const i = ref ? this.childNodes.indexOf(ref) : -1;
    if (i < 0) this.childNodes.push(n); else this.childNodes.splice(i, 0, n);
    return n;
  }
  replaceChildren(...nodes) { for (const c of [...this.childNodes]) c.remove(); this.append(...nodes); }
  remove() {
    if (!this.parentNode) return;
    const p = this.parentNode, i = p.childNodes.indexOf(this);
    if (i >= 0) p.childNodes.splice(i, 1);
    this.parentNode = null;
  }
}

class FakeText extends FakeNode {
  constructor(text) { super(); this.textContent = text; }
}

class FakeClassList {
  constructor() { this.set = new Set(); }
  add(...c) { c.forEach((x) => this.set.add(x)); }
  remove(...c) { c.forEach((x) => this.set.delete(x)); }
  contains(c) { return this.set.has(c); }
  toggle(c, on) { if (on ?? !this.set.has(c)) this.set.add(c); else this.set.delete(c); }
  toString() { return [...this.set].join(' '); }
}

class FakeElement extends FakeNode {
  constructor(tag, ns = null) {
    super();
    this.tagName = tag; this.namespaceURI = ns; this.attrs = new Map(); this.classList = new FakeClassList();
    this.style = {}; this.dataset = {}; this._rect = { left: 0, top: 0, width: 0, height: 0 };
  }
  setAttribute(k, v) {
    if (k === 'class') { this.classList = new FakeClassList(); this.classList.add(...String(v).split(/\s+/).filter(Boolean)); return; }
    this.attrs.set(k, String(v));
  }
  getAttribute(k) { return k === 'class' ? this.classList.toString() : this.attrs.has(k) ? this.attrs.get(k) : null; }
  removeAttribute(k) { this.attrs.delete(k); }
  get textContent() { return this.childNodes.map((c) => c.textContent ?? '').join(''); }
  set textContent(v) { this.replaceChildren(new FakeText(String(v))); }
  getBoundingClientRect() { const r = this._rect; return { ...r, right: r.left + r.width, bottom: r.top + r.height, x: r.left, y: r.top }; }
  setPointerCapture() {}
  releasePointerCapture() {}
}

class FakeSVGElement extends FakeElement {}

/** 캔버스 2D: 속성은 저장, 메서드는 아무것도 안 함. measureText 는 글자 수 × 크기 × 0.6. */
function fakeContext(canvas) {
  const target = {
    canvas,
    font: '10px sans-serif',
    measureText(t) { const px = parseFloat(/(\d+(\.\d+)?)px/.exec(this.font)?.[1] || 10); return { width: String(t).length * px * 0.6 }; },
  };
  const noop = () => {};
  return new Proxy(target, {
    get(t, k) { return k in t ? t[k] : noop; },
    set(t, k, v) { t[k] = v; return true; },
  });
}

class FakeCanvas extends FakeElement {
  constructor() { super('canvas'); this.width = 300; this.height = 150; this._ctx = null; }
  getContext() { return (this._ctx ||= fakeContext(this)); }
}

export function installFakeDom() {
  const saved = {};
  const set = (k, v) => { saved[k] = Object.getOwnPropertyDescriptor(globalThis, k); Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true }); };
  const raf = { queue: new Map(), id: 0 };
  const observers = [];
  class ResizeObserver {
    constructor(cb) { this.cb = cb; this.targets = []; this.disconnected = false; observers.push(this); }
    observe(t) { this.targets.push(t); }
    disconnect() { this.disconnected = true; this.targets = []; }
    trigger() { if (!this.disconnected) this.cb([]); }
  }
  set('Node', FakeNode);
  set('SVGElement', FakeSVGElement);
  set('document', {
    createElement: (tag) => (tag === 'canvas' ? new FakeCanvas() : new FakeElement(tag)),
    createElementNS: (ns, tag) => new FakeSVGElement(tag, ns),
    createTextNode: (t) => new FakeText(t),
  });
  set('window', { devicePixelRatio: 1 });
  set('getComputedStyle', () => ({ fontFamily: 'sans-serif' }));
  set('ResizeObserver', ResizeObserver);
  set('requestAnimationFrame', (fn) => { const id = ++raf.id; raf.queue.set(id, fn); return id; });
  set('cancelAnimationFrame', (id) => { raf.queue.delete(id); });
  set('requestIdleCallback', undefined);
  return {
    observers,
    /** 쌓인 rAF 를 비운다(콜백이 새로 건 것도 rounds 번까지). */
    flushRaf(rounds = 10) {
      for (let r = 0; r < rounds && raf.queue.size; r++) {
        const batch = [...raf.queue.entries()];
        raf.queue.clear();
        for (const [, fn] of batch) fn(performance.now());
      }
    },
    get rafPending() { return raf.queue.size; },
    restore() {
      for (const [k, d] of Object.entries(saved)) {
        if (d) Object.defineProperty(globalThis, k, d); else delete globalThis[k];
      }
    },
  };
}
