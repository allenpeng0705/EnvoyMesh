let T_, N, U_, v_, R_, Bs, Ws;
let __tla = (async ()=>{
    const f_ = "/assets/loro_wasm_bg-DP4dC0x3.wasm", h_ = async (a = {}, t)=>{
        let _;
        if (t.startsWith("data:")) {
            const n = t.replace(/^data:.*?base64,/, "");
            let r;
            if (typeof Buffer == "function" && typeof Buffer.from == "function") r = Buffer.from(n, "base64");
            else if (typeof atob == "function") {
                const i = atob(n);
                r = new Uint8Array(i.length);
                for(let d = 0; d < i.length; d++)r[d] = i.charCodeAt(d);
            } else throw new Error("Cannot decode base64-encoded data URL");
            _ = await WebAssembly.instantiate(r, a);
        } else {
            const n = await fetch(t), r = n.headers.get("Content-Type") || "";
            if ("instantiateStreaming" in WebAssembly && r.startsWith("application/wasm")) _ = await WebAssembly.instantiateStreaming(n, a);
            else {
                const i = await n.arrayBuffer();
                _ = await WebAssembly.instantiate(i, a);
            }
        }
        return _.instance.exports;
    };
    let e;
    v_ = function(a) {
        e = a;
    };
    const p = new Array(128).fill(void 0);
    p.push(void 0, null, !0, !1);
    function l(a) {
        return p[a];
    }
    let w = 0, $ = null;
    function L() {
        return ($ === null || $.byteLength === 0) && ($ = new Uint8Array(e.memory.buffer)), $;
    }
    const y_ = typeof TextEncoder > "u" ? (0, module.require)("util").TextEncoder : TextEncoder;
    let q = new y_("utf-8");
    const m_ = typeof q.encodeInto == "function" ? function(a, t) {
        return q.encodeInto(a, t);
    } : function(a, t) {
        const _ = q.encode(a);
        return t.set(_), {
            read: a.length,
            written: _.length
        };
    };
    function u(a, t, _) {
        if (_ === void 0) {
            const g = q.encode(a), b = t(g.length, 1) >>> 0;
            return L().subarray(b, b + g.length).set(g), w = g.length, b;
        }
        let n = a.length, r = t(n, 1) >>> 0;
        const i = L();
        let d = 0;
        for(; d < n; d++){
            const g = a.charCodeAt(d);
            if (g > 127) break;
            i[r + d] = g;
        }
        if (d !== n) {
            d !== 0 && (a = a.slice(d)), r = _(r, n, n = d + a.length * 3, 1) >>> 0;
            const g = L().subarray(r + d, r + n), b = m_(a, g);
            d += b.written, r = _(r, n, d, 1) >>> 0;
        }
        return w = d, r;
    }
    let E = null;
    function o() {
        return (E === null || E.buffer.detached === !0 || E.buffer.detached === void 0 && E.buffer !== e.memory.buffer) && (E = new DataView(e.memory.buffer)), E;
    }
    let J = p.length;
    function c(a) {
        J === p.length && p.push(p.length + 1);
        const t = J;
        return J = p[t], p[t] = a, t;
    }
    function I(a, t) {
        try {
            return a.apply(this, t);
        } catch (_) {
            e.__wbindgen_exn_store(c(_));
        }
    }
    const I_ = typeof TextDecoder > "u" ? (0, module.require)("util").TextDecoder : TextDecoder;
    let dt = new I_("utf-8", {
        ignoreBOM: !0,
        fatal: !0
    });
    dt.decode();
    function f(a, t) {
        return a = a >>> 0, dt.decode(L().subarray(a, a + t));
    }
    function k_(a) {
        a < 132 || (p[a] = J, J = a);
    }
    function s(a) {
        const t = l(a);
        return k_(a), t;
    }
    function v(a) {
        return a == null;
    }
    const _t = typeof FinalizationRegistry > "u" ? {
        register: ()=>{},
        unregister: ()=>{}
    } : new FinalizationRegistry((a)=>{
        e.__wbindgen_export_4.get(a.dtor)(a.a, a.b);
    });
    function ct(a, t, _, n) {
        const r = {
            a,
            b: t,
            cnt: 1,
            dtor: _
        }, i = (...d)=>{
            r.cnt++;
            const g = r.a;
            r.a = 0;
            try {
                return n(g, r.b, ...d);
            } finally{
                --r.cnt === 0 ? (e.__wbindgen_export_4.get(r.dtor)(g, r.b), _t.unregister(r)) : r.a = g;
            }
        };
        return i.original = r, _t.register(i, r, r), i;
    }
    function et(a) {
        const t = typeof a;
        if (t == "number" || t == "boolean" || a == null) return `${a}`;
        if (t == "string") return `"${a}"`;
        if (t == "symbol") {
            const r = a.description;
            return r == null ? "Symbol" : `Symbol(${r})`;
        }
        if (t == "function") {
            const r = a.name;
            return typeof r == "string" && r.length > 0 ? `Function(${r})` : "Function";
        }
        if (Array.isArray(a)) {
            const r = a.length;
            let i = "[";
            r > 0 && (i += et(a[0]));
            for(let d = 1; d < r; d++)i += ", " + et(a[d]);
            return i += "]", i;
        }
        const _ = /\[object ([^\]]+)\]/.exec(toString.call(a));
        let n;
        if (_ && _.length > 1) n = _[1];
        else return toString.call(a);
        if (n == "Object") try {
            return "Object(" + JSON.stringify(a) + ")";
        } catch  {
            return "Object";
        }
        return a instanceof Error ? `${a.name}: ${a.message}
${a.stack}` : n;
    }
    function U(a, t) {
        if (!(a instanceof t)) throw new Error(`expected instance of ${t.name}`);
    }
    let h = 128;
    function m(a) {
        if (h == 1) throw new Error("out of js stack");
        return p[--h] = a, h;
    }
    function R(a, t) {
        const _ = t(a.length * 1, 1) >>> 0;
        return L().set(a, _ / 1), w = a.length, _;
    }
    function D(a, t) {
        return a = a >>> 0, L().subarray(a / 1, a / 1 + t);
    }
    function A(a, t) {
        a = a >>> 0;
        const _ = o(), n = [];
        for(let r = a; r < a + 4 * t; r += 4)n.push(s(_.getUint32(r, !0)));
        return n;
    }
    function x_(a, t) {
        try {
            const i = e.__wbindgen_add_to_stack_pointer(-16);
            e.redactJsonUpdates(i, c(a), c(t));
            var _ = o().getInt32(i + 0, !0), n = o().getInt32(i + 4, !0), r = o().getInt32(i + 8, !0);
            if (r) throw s(n);
            return s(_);
        } finally{
            e.__wbindgen_add_to_stack_pointer(16);
        }
    }
    function S_(a) {
        try {
            const r = e.__wbindgen_add_to_stack_pointer(-16), i = R(a, e.__wbindgen_malloc), d = w;
            e.decodeFrontiers(r, i, d);
            var t = o().getInt32(r + 0, !0), _ = o().getInt32(r + 4, !0), n = o().getInt32(r + 8, !0);
            if (n) throw s(_);
            return s(t);
        } finally{
            e.__wbindgen_add_to_stack_pointer(16);
        }
    }
    function x(a, t) {
        const _ = t(a.length * 4, 4) >>> 0, n = o();
        for(let r = 0; r < a.length; r++)n.setUint32(_ + 4 * r, c(a[r]), !0);
        return w = a.length, _;
    }
    function A_(a) {
        try {
            const d = e.__wbindgen_add_to_stack_pointer(-16), g = x(a, e.__wbindgen_malloc), b = w;
            e.encodeFrontiers(d, g, b);
            var t = o().getInt32(d + 0, !0), _ = o().getInt32(d + 4, !0), n = o().getInt32(d + 8, !0), r = o().getInt32(d + 12, !0);
            if (r) throw s(n);
            var i = D(t, _).slice();
            return e.__wbindgen_free(t, _ * 1, 1), i;
        } finally{
            e.__wbindgen_add_to_stack_pointer(16);
        }
    }
    function C_(a, t) {
        try {
            const i = e.__wbindgen_add_to_stack_pointer(-16), d = R(a, e.__wbindgen_malloc), g = w;
            e.decodeImportBlobMeta(i, d, g, t);
            var _ = o().getInt32(i + 0, !0), n = o().getInt32(i + 4, !0), r = o().getInt32(i + 8, !0);
            if (r) throw s(n);
            return s(_);
        } finally{
            e.__wbindgen_add_to_stack_pointer(16);
        }
    }
    function O_() {
        let a, t;
        try {
            const r = e.__wbindgen_add_to_stack_pointer(-16);
            e.LORO_VERSION(r);
            var _ = o().getInt32(r + 0, !0), n = o().getInt32(r + 4, !0);
            return a = _, t = n, f(_, n);
        } finally{
            e.__wbindgen_add_to_stack_pointer(16), e.__wbindgen_free(a, t, 1);
        }
    }
    function F_() {
        e.run();
    }
    R_ = function() {
        e.callPendingEvents();
    };
    function D_() {
        e.setDebug();
    }
    function N_(a, t, _) {
        e._dyn_core__ops__function__FnMut__A____Output___R_as_wasm_bindgen__closure__WasmClosure___describe__invoke__h23bd7b34cf0bced7(a, t, c(_));
    }
    function E_(a, t) {
        e._dyn_core__ops__function__FnMut_____Output___R_as_wasm_bindgen__closure__WasmClosure___describe__invoke__hd82b624f21a7fa96(a, t);
    }
    const rt = typeof FinalizationRegistry > "u" ? {
        register: ()=>{},
        unregister: ()=>{}
    } : new FinalizationRegistry((a)=>e.__wbg_awarenesswasm_free(a >>> 0, 1));
    class L_ {
        __destroy_into_raw() {
            const t = this.__wbg_ptr;
            return this.__wbg_ptr = 0, rt.unregister(this), t;
        }
        free() {
            const t = this.__destroy_into_raw();
            e.__wbg_awarenesswasm_free(t, 0);
        }
        getAllStates() {
            try {
                const r = e.__wbindgen_add_to_stack_pointer(-16);
                e.awarenesswasm_getAllStates(r, this.__wbg_ptr);
                var t = o().getInt32(r + 0, !0), _ = o().getInt32(r + 4, !0), n = o().getInt32(r + 8, !0);
                if (n) throw s(_);
                return s(t);
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        getTimestamp(t) {
            try {
                const d = e.__wbindgen_add_to_stack_pointer(-32);
                e.awarenesswasm_getTimestamp(d, this.__wbg_ptr, c(t));
                var _ = o().getInt32(d + 0, !0), n = o().getFloat64(d + 8, !0), r = o().getInt32(d + 16, !0), i = o().getInt32(d + 20, !0);
                if (i) throw s(r);
                return _ === 0 ? void 0 : n;
            } finally{
                e.__wbindgen_add_to_stack_pointer(32);
            }
        }
        setLocalState(t) {
            e.awarenesswasm_setLocalState(this.__wbg_ptr, c(t));
        }
        removeOutdated() {
            try {
                const r = e.__wbindgen_add_to_stack_pointer(-16);
                e.awarenesswasm_removeOutdated(r, this.__wbg_ptr);
                var t = o().getInt32(r + 0, !0), _ = o().getInt32(r + 4, !0), n = A(t, _).slice();
                return e.__wbindgen_free(t, _ * 4, 4), n;
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        constructor(t, _){
            try {
                const d = e.__wbindgen_add_to_stack_pointer(-16);
                e.awarenesswasm_new(d, c(t), _);
                var n = o().getInt32(d + 0, !0), r = o().getInt32(d + 4, !0), i = o().getInt32(d + 8, !0);
                if (i) throw s(r);
                return this.__wbg_ptr = n >>> 0, rt.register(this, this.__wbg_ptr, this), this;
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        peer() {
            const t = e.awarenesswasm_peer(this.__wbg_ptr);
            return s(t);
        }
        apply(t) {
            try {
                const i = e.__wbindgen_add_to_stack_pointer(-16), d = R(t, e.__wbindgen_malloc), g = w;
                e.awarenesswasm_apply(i, this.__wbg_ptr, d, g);
                var _ = o().getInt32(i + 0, !0), n = o().getInt32(i + 4, !0), r = o().getInt32(i + 8, !0);
                if (r) throw s(n);
                return s(_);
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        peers() {
            try {
                const r = e.__wbindgen_add_to_stack_pointer(-16);
                e.awarenesswasm_peers(r, this.__wbg_ptr);
                var t = o().getInt32(r + 0, !0), _ = o().getInt32(r + 4, !0), n = A(t, _).slice();
                return e.__wbindgen_free(t, _ * 4, 4), n;
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        encode(t) {
            try {
                const g = e.__wbindgen_add_to_stack_pointer(-16);
                e.awarenesswasm_encode(g, this.__wbg_ptr, c(t));
                var _ = o().getInt32(g + 0, !0), n = o().getInt32(g + 4, !0), r = o().getInt32(g + 8, !0), i = o().getInt32(g + 12, !0);
                if (i) throw s(r);
                var d = D(_, n).slice();
                return e.__wbindgen_free(_, n * 1, 1), d;
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        length() {
            return e.awarenesswasm_length(this.__wbg_ptr);
        }
        isEmpty() {
            return e.awarenesswasm_isEmpty(this.__wbg_ptr) !== 0;
        }
        getState(t) {
            try {
                const i = e.__wbindgen_add_to_stack_pointer(-16);
                e.awarenesswasm_getState(i, this.__wbg_ptr, c(t));
                var _ = o().getInt32(i + 0, !0), n = o().getInt32(i + 4, !0), r = o().getInt32(i + 8, !0);
                if (r) throw s(n);
                return s(_);
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        encodeAll() {
            try {
                const r = e.__wbindgen_add_to_stack_pointer(-16);
                e.awarenesswasm_encodeAll(r, this.__wbg_ptr);
                var t = o().getInt32(r + 0, !0), _ = o().getInt32(r + 4, !0), n = D(t, _).slice();
                return e.__wbindgen_free(t, _ * 1, 1), n;
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
    }
    const nt = typeof FinalizationRegistry > "u" ? {
        register: ()=>{},
        unregister: ()=>{}
    } : new FinalizationRegistry((a)=>e.__wbg_changemodifier_free(a >>> 0, 1));
    class T {
        static __wrap(t) {
            t = t >>> 0;
            const _ = Object.create(T.prototype);
            return _.__wbg_ptr = t, nt.register(_, _.__wbg_ptr, _), _;
        }
        __destroy_into_raw() {
            const t = this.__wbg_ptr;
            return this.__wbg_ptr = 0, nt.unregister(this), t;
        }
        free() {
            const t = this.__destroy_into_raw();
            e.__wbg_changemodifier_free(t, 0);
        }
        setMessage(t) {
            const _ = u(t, e.__wbindgen_malloc, e.__wbindgen_realloc), n = w, r = e.changemodifier_setMessage(this.__wbg_ptr, _, n);
            return T.__wrap(r);
        }
        setTimestamp(t) {
            const _ = e.changemodifier_setTimestamp(this.__wbg_ptr, t);
            return T.__wrap(_);
        }
    }
    const ot = typeof FinalizationRegistry > "u" ? {
        register: ()=>{},
        unregister: ()=>{}
    } : new FinalizationRegistry((a)=>e.__wbg_cursor_free(a >>> 0, 1));
    class F {
        static __wrap(t) {
            t = t >>> 0;
            const _ = Object.create(F.prototype);
            return _.__wbg_ptr = t, ot.register(_, _.__wbg_ptr, _), _;
        }
        __destroy_into_raw() {
            const t = this.__wbg_ptr;
            return this.__wbg_ptr = 0, ot.unregister(this), t;
        }
        free() {
            const t = this.__destroy_into_raw();
            e.__wbg_cursor_free(t, 0);
        }
        containerId() {
            const t = e.cursor_containerId(this.__wbg_ptr);
            return s(t);
        }
        pos() {
            try {
                const r = e.__wbindgen_add_to_stack_pointer(-16);
                e.cursor_pos(r, this.__wbg_ptr);
                var t = o().getInt32(r + 0, !0), _ = o().getInt32(r + 4, !0), n = o().getInt32(r + 8, !0);
                if (n) throw s(_);
                return s(t);
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        kind() {
            const t = e.cursor_kind(this.__wbg_ptr);
            return s(t);
        }
        side() {
            const t = e.cursor_side(this.__wbg_ptr);
            return s(t);
        }
        static decode(t) {
            try {
                const i = e.__wbindgen_add_to_stack_pointer(-16), d = R(t, e.__wbindgen_malloc), g = w;
                e.cursor_decode(i, d, g);
                var _ = o().getInt32(i + 0, !0), n = o().getInt32(i + 4, !0), r = o().getInt32(i + 8, !0);
                if (r) throw s(n);
                return F.__wrap(_);
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        encode() {
            try {
                const r = e.__wbindgen_add_to_stack_pointer(-16);
                e.cursor_encode(r, this.__wbg_ptr);
                var t = o().getInt32(r + 0, !0), _ = o().getInt32(r + 4, !0), n = D(t, _).slice();
                return e.__wbindgen_free(t, _ * 1, 1), n;
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
    }
    const it = typeof FinalizationRegistry > "u" ? {
        register: ()=>{},
        unregister: ()=>{}
    } : new FinalizationRegistry((a)=>e.__wbg_ephemeralstorewasm_free(a >>> 0, 1));
    T_ = class {
        __destroy_into_raw() {
            const t = this.__wbg_ptr;
            return this.__wbg_ptr = 0, it.unregister(this), t;
        }
        free() {
            const t = this.__destroy_into_raw();
            e.__wbg_ephemeralstorewasm_free(t, 0);
        }
        getAllStates() {
            try {
                const r = e.__wbindgen_add_to_stack_pointer(-16);
                e.ephemeralstorewasm_getAllStates(r, this.__wbg_ptr);
                var t = o().getInt32(r + 0, !0), _ = o().getInt32(r + 4, !0), n = o().getInt32(r + 8, !0);
                if (n) throw s(_);
                return s(t);
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        removeOutdated() {
            e.ephemeralstorewasm_removeOutdated(this.__wbg_ptr);
        }
        subscribeLocalUpdates(t) {
            const _ = e.ephemeralstorewasm_subscribeLocalUpdates(this.__wbg_ptr, c(t));
            return s(_);
        }
        get(t) {
            const _ = u(t, e.__wbindgen_malloc, e.__wbindgen_realloc), n = w, r = e.ephemeralstorewasm_get(this.__wbg_ptr, _, n);
            return s(r);
        }
        constructor(t){
            const _ = e.ephemeralstorewasm_new(t);
            return this.__wbg_ptr = _ >>> 0, it.register(this, this.__wbg_ptr, this), this;
        }
        set(t, _) {
            const n = u(t, e.__wbindgen_malloc, e.__wbindgen_realloc), r = w;
            e.ephemeralstorewasm_set(this.__wbg_ptr, n, r, c(_));
        }
        keys() {
            try {
                const r = e.__wbindgen_add_to_stack_pointer(-16);
                e.ephemeralstorewasm_keys(r, this.__wbg_ptr);
                var t = o().getInt32(r + 0, !0), _ = o().getInt32(r + 4, !0), n = A(t, _).slice();
                return e.__wbindgen_free(t, _ * 4, 4), n;
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        apply(t) {
            try {
                const r = e.__wbindgen_add_to_stack_pointer(-16), i = R(t, e.__wbindgen_malloc), d = w;
                e.ephemeralstorewasm_apply(r, this.__wbg_ptr, i, d);
                var _ = o().getInt32(r + 0, !0), n = o().getInt32(r + 4, !0);
                if (n) throw s(_);
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        delete(t) {
            const _ = u(t, e.__wbindgen_malloc, e.__wbindgen_realloc), n = w;
            e.ephemeralstorewasm_delete(this.__wbg_ptr, _, n);
        }
        encode(t) {
            try {
                const i = e.__wbindgen_add_to_stack_pointer(-16), d = u(t, e.__wbindgen_malloc, e.__wbindgen_realloc), g = w;
                e.ephemeralstorewasm_encode(i, this.__wbg_ptr, d, g);
                var _ = o().getInt32(i + 0, !0), n = o().getInt32(i + 4, !0), r = D(_, n).slice();
                return e.__wbindgen_free(_, n * 1, 1), r;
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        isEmpty() {
            return e.ephemeralstorewasm_isEmpty(this.__wbg_ptr) !== 0;
        }
        encodeAll() {
            try {
                const r = e.__wbindgen_add_to_stack_pointer(-16);
                e.ephemeralstorewasm_encodeAll(r, this.__wbg_ptr);
                var t = o().getInt32(r + 0, !0), _ = o().getInt32(r + 4, !0), n = D(t, _).slice();
                return e.__wbindgen_free(t, _ * 1, 1), n;
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        subscribe(t) {
            const _ = e.ephemeralstorewasm_subscribe(this.__wbg_ptr, c(t));
            return s(_);
        }
    };
    const H = typeof FinalizationRegistry > "u" ? {
        register: ()=>{},
        unregister: ()=>{}
    } : new FinalizationRegistry((a)=>e.__wbg_lorocounter_free(a >>> 0, 1));
    class M {
        static __wrap(t) {
            t = t >>> 0;
            const _ = Object.create(M.prototype);
            return _.__wbg_ptr = t, H.register(_, _.__wbg_ptr, _), _;
        }
        __destroy_into_raw() {
            const t = this.__wbg_ptr;
            return this.__wbg_ptr = 0, H.unregister(this), t;
        }
        free() {
            const t = this.__destroy_into_raw();
            e.__wbg_lorocounter_free(t, 0);
        }
        isAttached() {
            return e.lorocounter_isAttached(this.__wbg_ptr) !== 0;
        }
        getAttached() {
            const t = e.lorocounter_getAttached(this.__wbg_ptr);
            return s(t);
        }
        getShallowValue() {
            try {
                const r = e.__wbindgen_add_to_stack_pointer(-16);
                e.lorocounter_getShallowValue(r, this.__wbg_ptr);
                var t = o().getFloat64(r + 0, !0), _ = o().getInt32(r + 8, !0), n = o().getInt32(r + 12, !0);
                if (n) throw s(_);
                return t;
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        get id() {
            const t = e.lorocounter_id(this.__wbg_ptr);
            return s(t);
        }
        constructor(){
            const t = e.lorocounter_new();
            return this.__wbg_ptr = t >>> 0, H.register(this, this.__wbg_ptr, this), this;
        }
        kind() {
            const t = e.lorocounter_kind(this.__wbg_ptr);
            return s(t);
        }
        parent() {
            const t = e.lorocounter_parent(this.__wbg_ptr);
            return s(t);
        }
        toJSON() {
            try {
                const r = e.__wbindgen_add_to_stack_pointer(-16);
                e.lorocounter_getShallowValue(r, this.__wbg_ptr);
                var t = o().getFloat64(r + 0, !0), _ = o().getInt32(r + 8, !0), n = o().getInt32(r + 12, !0);
                if (n) throw s(_);
                return t;
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        decrement(t) {
            try {
                const r = e.__wbindgen_add_to_stack_pointer(-16);
                e.lorocounter_decrement(r, this.__wbg_ptr, t);
                var _ = o().getInt32(r + 0, !0), n = o().getInt32(r + 4, !0);
                if (n) throw s(_);
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        get value() {
            try {
                const r = e.__wbindgen_add_to_stack_pointer(-16);
                e.lorocounter_getShallowValue(r, this.__wbg_ptr);
                var t = o().getFloat64(r + 0, !0), _ = o().getInt32(r + 8, !0), n = o().getInt32(r + 12, !0);
                if (n) throw s(_);
                return t;
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        increment(t) {
            try {
                const r = e.__wbindgen_add_to_stack_pointer(-16);
                e.lorocounter_increment(r, this.__wbg_ptr, t);
                var _ = o().getInt32(r + 0, !0), n = o().getInt32(r + 4, !0);
                if (n) throw s(_);
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        subscribe(t) {
            try {
                const i = e.__wbindgen_add_to_stack_pointer(-16);
                e.lorocounter_subscribe(i, this.__wbg_ptr, c(t));
                var _ = o().getInt32(i + 0, !0), n = o().getInt32(i + 4, !0), r = o().getInt32(i + 8, !0);
                if (r) throw s(n);
                return s(_);
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
    }
    const G = typeof FinalizationRegistry > "u" ? {
        register: ()=>{},
        unregister: ()=>{}
    } : new FinalizationRegistry((a)=>e.__wbg_lorodoc_free(a >>> 0, 1));
    N = class {
        static __wrap(t) {
            t = t >>> 0;
            const _ = Object.create(N.prototype);
            return _.__wbg_ptr = t, G.register(_, _.__wbg_ptr, _), _;
        }
        __destroy_into_raw() {
            const t = this.__wbg_ptr;
            return this.__wbg_ptr = 0, G.unregister(this), t;
        }
        free() {
            const t = this.__destroy_into_raw();
            e.__wbg_lorodoc_free(t, 0);
        }
        applyDiff(t) {
            try {
                const r = e.__wbindgen_add_to_stack_pointer(-16);
                e.lorodoc_applyDiff(r, this.__wbg_ptr, c(t));
                var _ = o().getInt32(r + 0, !0), n = o().getInt32(r + 4, !0);
                if (n) throw s(_);
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        isShallow() {
            return e.lorodoc_isShallow(this.__wbg_ptr) !== 0;
        }
        changeCount() {
            return e.lorodoc_changeCount(this.__wbg_ptr) >>> 0;
        }
        getByPath(t) {
            const _ = u(t, e.__wbindgen_malloc, e.__wbindgen_realloc), n = w, r = e.lorodoc_getByPath(this.__wbg_ptr, _, n);
            return s(r);
        }
        getCounter(t) {
            try {
                const i = e.__wbindgen_add_to_stack_pointer(-16);
                e.lorodoc_getCounter(i, this.__wbg_ptr, m(t));
                var _ = o().getInt32(i + 0, !0), n = o().getInt32(i + 4, !0), r = o().getInt32(i + 8, !0);
                if (r) throw s(n);
                return M.__wrap(_);
            } finally{
                e.__wbindgen_add_to_stack_pointer(16), p[h++] = void 0;
            }
        }
        isDetached() {
            return e.lorodoc_isDetached(this.__wbg_ptr) !== 0;
        }
        get peerIdStr() {
            const t = e.lorodoc_peerIdStr(this.__wbg_ptr);
            return s(t);
        }
        setPeerId(t) {
            try {
                const r = e.__wbindgen_add_to_stack_pointer(-16);
                e.lorodoc_setPeerId(r, this.__wbg_ptr, c(t));
                var _ = o().getInt32(r + 0, !0), n = o().getInt32(r + 4, !0);
                if (n) throw s(_);
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        getCursorPos(t) {
            try {
                const i = e.__wbindgen_add_to_stack_pointer(-16);
                U(t, F), e.lorodoc_getCursorPos(i, this.__wbg_ptr, t.__wbg_ptr);
                var _ = o().getInt32(i + 0, !0), n = o().getInt32(i + 4, !0), r = o().getInt32(i + 8, !0);
                if (r) throw s(n);
                return s(_);
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        hasContainer(t) {
            return e.lorodoc_hasContainer(this.__wbg_ptr, c(t)) !== 0;
        }
        importBatch(t) {
            try {
                const i = e.__wbindgen_add_to_stack_pointer(-16);
                e.lorodoc_importBatch(i, this.__wbg_ptr, c(t));
                var _ = o().getInt32(i + 0, !0), n = o().getInt32(i + 4, !0), r = o().getInt32(i + 8, !0);
                if (r) throw s(n);
                return s(_);
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        cmpFrontiers(t, _) {
            try {
                const d = e.__wbindgen_add_to_stack_pointer(-16), g = x(t, e.__wbindgen_malloc), b = w, y = x(_, e.__wbindgen_malloc), k = w;
                e.lorodoc_cmpFrontiers(d, this.__wbg_ptr, g, b, y, k);
                var n = o().getInt32(d + 0, !0), r = o().getInt32(d + 4, !0), i = o().getInt32(d + 8, !0);
                if (i) throw s(r);
                return s(n);
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        debugHistory() {
            e.lorodoc_debugHistory(this.__wbg_ptr);
        }
        static fromSnapshot(t) {
            try {
                const i = e.__wbindgen_add_to_stack_pointer(-16), d = R(t, e.__wbindgen_malloc), g = w;
                e.lorodoc_fromSnapshot(i, d, g);
                var _ = o().getInt32(i + 0, !0), n = o().getInt32(i + 4, !0), r = o().getInt32(i + 8, !0);
                if (r) throw s(n);
                return N.__wrap(_);
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        getChangeAt(t) {
            try {
                const i = e.__wbindgen_add_to_stack_pointer(-16);
                e.lorodoc_getChangeAt(i, this.__wbg_ptr, c(t));
                var _ = o().getInt32(i + 0, !0), n = o().getInt32(i + 4, !0), r = o().getInt32(i + 8, !0);
                if (r) throw s(n);
                return s(_);
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        oplogVersion() {
            const t = e.lorodoc_oplogVersion(this.__wbg_ptr);
            return S.__wrap(t);
        }
        getMovableList(t) {
            try {
                const i = e.__wbindgen_add_to_stack_pointer(-16);
                e.lorodoc_getMovableList(i, this.__wbg_ptr, m(t));
                var _ = o().getInt32(i + 0, !0), n = o().getInt32(i + 4, !0), r = o().getInt32(i + 8, !0);
                if (r) throw s(n);
                return P.__wrap(_);
            } finally{
                e.__wbindgen_add_to_stack_pointer(16), p[h++] = void 0;
            }
        }
        frontiersToVV(t) {
            try {
                const i = e.__wbindgen_add_to_stack_pointer(-16), d = x(t, e.__wbindgen_malloc), g = w;
                e.lorodoc_frontiersToVV(i, this.__wbg_ptr, d, g);
                var _ = o().getInt32(i + 0, !0), n = o().getInt32(i + 4, !0), r = o().getInt32(i + 8, !0);
                if (r) throw s(n);
                return S.__wrap(_);
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        getAllChanges() {
            const t = e.lorodoc_getAllChanges(this.__wbg_ptr);
            return s(t);
        }
        oplogFrontiers() {
            try {
                const r = e.__wbindgen_add_to_stack_pointer(-16);
                e.lorodoc_oplogFrontiers(r, this.__wbg_ptr);
                var t = o().getInt32(r + 0, !0), _ = o().getInt32(r + 4, !0), n = o().getInt32(r + 8, !0);
                if (n) throw s(_);
                return s(t);
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        vvToFrontiers(t) {
            try {
                const i = e.__wbindgen_add_to_stack_pointer(-16);
                U(t, S), e.lorodoc_vvToFrontiers(i, this.__wbg_ptr, t.__wbg_ptr);
                var _ = o().getInt32(i + 0, !0), n = o().getInt32(i + 4, !0), r = o().getInt32(i + 8, !0);
                if (r) throw s(n);
                return s(_);
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        shallowSinceVV() {
            const t = e.lorodoc_shallowSinceVV(this.__wbg_ptr);
            return S.__wrap(t);
        }
        configTextStyle(t) {
            try {
                const r = e.__wbindgen_add_to_stack_pointer(-16);
                e.lorodoc_configTextStyle(r, this.__wbg_ptr, c(t));
                var _ = o().getInt32(r + 0, !0), n = o().getInt32(r + 4, !0);
                if (n) throw s(_);
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        getOpsInChange(t) {
            try {
                const g = e.__wbindgen_add_to_stack_pointer(-16);
                e.lorodoc_getOpsInChange(g, this.__wbg_ptr, c(t));
                var _ = o().getInt32(g + 0, !0), n = o().getInt32(g + 4, !0), r = o().getInt32(g + 8, !0), i = o().getInt32(g + 12, !0);
                if (i) throw s(r);
                var d = A(_, n).slice();
                return e.__wbindgen_free(_, n * 4, 4), d;
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        getShallowValue() {
            try {
                const r = e.__wbindgen_add_to_stack_pointer(-16);
                e.lorodoc_getShallowValue(r, this.__wbg_ptr);
                var t = o().getInt32(r + 0, !0), _ = o().getInt32(r + 4, !0), n = o().getInt32(r + 8, !0);
                if (n) throw s(_);
                return s(t);
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        checkoutToLatest() {
            try {
                const n = e.__wbindgen_add_to_stack_pointer(-16);
                e.lorodoc_checkoutToLatest(n, this.__wbg_ptr);
                var t = o().getInt32(n + 0, !0), _ = o().getInt32(n + 4, !0);
                if (_) throw s(t);
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        cmpWithFrontiers(t) {
            try {
                const i = e.__wbindgen_add_to_stack_pointer(-16), d = x(t, e.__wbindgen_malloc), g = w;
                e.lorodoc_cmpWithFrontiers(i, this.__wbg_ptr, d, g);
                var _ = o().getInt32(i + 0, !0), n = o().getInt32(i + 4, !0), r = o().getInt32(i + 8, !0);
                if (r) throw s(n);
                return _;
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        exportJsonInIdSpan(t) {
            try {
                const i = e.__wbindgen_add_to_stack_pointer(-16);
                e.lorodoc_exportJsonInIdSpan(i, this.__wbg_ptr, c(t));
                var _ = o().getInt32(i + 0, !0), n = o().getInt32(i + 4, !0), r = o().getInt32(i + 8, !0);
                if (r) throw s(n);
                return s(_);
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        subscribeJsonpath(t, _) {
            try {
                const d = e.__wbindgen_add_to_stack_pointer(-16), g = u(t, e.__wbindgen_malloc, e.__wbindgen_realloc), b = w;
                e.lorodoc_subscribeJsonpath(d, this.__wbg_ptr, g, b, c(_));
                var n = o().getInt32(d + 0, !0), r = o().getInt32(d + 4, !0), i = o().getInt32(d + 8, !0);
                if (i) throw s(r);
                return s(n);
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        deleteRootContainer(t) {
            try {
                const r = e.__wbindgen_add_to_stack_pointer(-16);
                e.lorodoc_deleteRootContainer(r, this.__wbg_ptr, c(t));
                var _ = o().getInt32(r + 0, !0), n = o().getInt32(r + 4, !0);
                if (n) throw s(_);
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        exportJsonUpdates(t, _, n) {
            try {
                const g = e.__wbindgen_add_to_stack_pointer(-16);
                e.lorodoc_exportJsonUpdates(g, this.__wbg_ptr, c(t), c(_), v(n) ? 16777215 : n ? 1 : 0);
                var r = o().getInt32(g + 0, !0), i = o().getInt32(g + 4, !0), d = o().getInt32(g + 8, !0);
                if (d) throw s(i);
                return s(r);
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        getContainerById(t) {
            try {
                const i = e.__wbindgen_add_to_stack_pointer(-16);
                e.lorodoc_getContainerById(i, this.__wbg_ptr, c(t));
                var _ = o().getInt32(i + 0, !0), n = o().getInt32(i + 4, !0), r = o().getInt32(i + 8, !0);
                if (r) throw s(n);
                return s(_);
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        getPendingTxnLength() {
            return e.lorodoc_getPendingTxnLength(this.__wbg_ptr) >>> 0;
        }
        importJsonUpdates(t) {
            try {
                const i = e.__wbindgen_add_to_stack_pointer(-16);
                e.lorodoc_importJsonUpdates(i, this.__wbg_ptr, c(t));
                var _ = o().getInt32(i + 0, !0), n = o().getInt32(i + 4, !0), r = o().getInt32(i + 8, !0);
                if (r) throw s(n);
                return s(_);
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        importUpdateBatch(t) {
            try {
                const i = e.__wbindgen_add_to_stack_pointer(-16);
                e.lorodoc_importBatch(i, this.__wbg_ptr, c(t));
                var _ = o().getInt32(i + 0, !0), n = o().getInt32(i + 4, !0), r = o().getInt32(i + 8, !0);
                if (r) throw s(n);
                return s(_);
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        setDetachedEditing(t) {
            e.lorodoc_setDetachedEditing(this.__wbg_ptr, t);
        }
        setRecordTimestamp(t) {
            e.lorodoc_setRecordTimestamp(this.__wbg_ptr, t);
        }
        subscribePreCommit(t) {
            const _ = e.lorodoc_subscribePreCommit(this.__wbg_ptr, c(t));
            return s(_);
        }
        findIdSpansBetween(t, _) {
            try {
                const d = e.__wbindgen_add_to_stack_pointer(-16), g = x(t, e.__wbindgen_malloc), b = w, y = x(_, e.__wbindgen_malloc), k = w;
                e.lorodoc_findIdSpansBetween(d, this.__wbg_ptr, g, b, y, k);
                var n = o().getInt32(d + 0, !0), r = o().getInt32(d + 4, !0), i = o().getInt32(d + 8, !0);
                if (i) throw s(r);
                return s(n);
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        getChangeAtLamport(t, _) {
            try {
                const d = e.__wbindgen_add_to_stack_pointer(-16), g = u(t, e.__wbindgen_malloc, e.__wbindgen_realloc), b = w;
                e.lorodoc_getChangeAtLamport(d, this.__wbg_ptr, g, b, _);
                var n = o().getInt32(d + 0, !0), r = o().getInt32(d + 4, !0), i = o().getInt32(d + 8, !0);
                if (i) throw s(r);
                return s(n);
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        getPathToContainer(t) {
            try {
                const i = e.__wbindgen_add_to_stack_pointer(-16);
                e.lorodoc_getPathToContainer(i, this.__wbg_ptr, c(t));
                var _ = o().getInt32(i + 0, !0), n = o().getInt32(i + 4, !0), r = o().getInt32(i + 8, !0);
                if (r) throw s(n);
                return s(_);
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        getChangedContainersIn(t, _) {
            try {
                const b = e.__wbindgen_add_to_stack_pointer(-16);
                e.lorodoc_getChangedContainersIn(b, this.__wbg_ptr, c(t), _);
                var n = o().getInt32(b + 0, !0), r = o().getInt32(b + 4, !0), i = o().getInt32(b + 8, !0), d = o().getInt32(b + 12, !0);
                if (d) throw s(i);
                var g = A(n, r).slice();
                return e.__wbindgen_free(n, r * 4, 4), g;
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        getDeepValueWithID() {
            const t = e.lorodoc_getDeepValueWithID(this.__wbg_ptr);
            return s(t);
        }
        setNextCommitOrigin(t) {
            const _ = u(t, e.__wbindgen_malloc, e.__wbindgen_realloc), n = w;
            e.lorodoc_setNextCommitOrigin(this.__wbg_ptr, _, n);
        }
        getUncommittedOpsAsJson() {
            try {
                const r = e.__wbindgen_add_to_stack_pointer(-16);
                e.lorodoc_getUncommittedOpsAsJson(r, this.__wbg_ptr);
                var t = o().getInt32(r + 0, !0), _ = o().getInt32(r + 4, !0), n = o().getInt32(r + 8, !0);
                if (n) throw s(_);
                return s(t);
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        setNextCommitMessage(t) {
            const _ = u(t, e.__wbindgen_malloc, e.__wbindgen_realloc), n = w;
            e.lorodoc_setNextCommitMessage(this.__wbg_ptr, _, n);
        }
        setNextCommitOptions(t) {
            try {
                const r = e.__wbindgen_add_to_stack_pointer(-16);
                e.lorodoc_setNextCommitOptions(r, this.__wbg_ptr, c(t));
                var _ = o().getInt32(r + 0, !0), n = o().getInt32(r + 4, !0);
                if (n) throw s(_);
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        shallowSinceFrontiers() {
            try {
                const r = e.__wbindgen_add_to_stack_pointer(-16);
                e.lorodoc_shallowSinceFrontiers(r, this.__wbg_ptr);
                var t = o().getInt32(r + 0, !0), _ = o().getInt32(r + 4, !0), n = o().getInt32(r + 8, !0);
                if (n) throw s(_);
                return s(t);
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        subscribeLocalUpdates(t) {
            const _ = e.lorodoc_subscribeLocalUpdates(this.__wbg_ptr, c(t));
            return s(_);
        }
        travelChangeAncestors(t, _) {
            try {
                const i = e.__wbindgen_add_to_stack_pointer(-16), d = x(t, e.__wbindgen_malloc), g = w;
                e.lorodoc_travelChangeAncestors(i, this.__wbg_ptr, d, g, c(_));
                var n = o().getInt32(i + 0, !0), r = o().getInt32(i + 4, !0);
                if (r) throw s(n);
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        clearNextCommitOptions() {
            e.lorodoc_clearNextCommitOptions(this.__wbg_ptr);
        }
        configDefaultTextStyle(t) {
            try {
                const r = e.__wbindgen_add_to_stack_pointer(-16);
                e.lorodoc_configDefaultTextStyle(r, this.__wbg_ptr, c(t));
                var _ = o().getInt32(r + 0, !0), n = o().getInt32(r + 4, !0);
                if (n) throw s(_);
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        setChangeMergeInterval(t) {
            e.lorodoc_setChangeMergeInterval(this.__wbg_ptr, t);
        }
        setNextCommitTimestamp(t) {
            e.lorodoc_setNextCommitTimestamp(this.__wbg_ptr, t);
        }
        setHideEmptyRootContainers(t) {
            try {
                const r = e.__wbindgen_add_to_stack_pointer(-16);
                e.lorodoc_setHideEmptyRootContainers(r, this.__wbg_ptr, t);
                var _ = o().getInt32(r + 0, !0), n = o().getInt32(r + 4, !0);
                if (n) throw s(_);
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        isDetachedEditingEnabled() {
            return e.lorodoc_isDetachedEditingEnabled(this.__wbg_ptr) !== 0;
        }
        subscribeFirstCommitFromPeer(t) {
            const _ = e.lorodoc_subscribeFirstCommitFromPeer(this.__wbg_ptr, c(t));
            return s(_);
        }
        constructor(){
            const t = e.lorodoc_new();
            return this.__wbg_ptr = t >>> 0, G.register(this, this.__wbg_ptr, this), this;
        }
        diff(t, _, n) {
            try {
                const g = e.__wbindgen_add_to_stack_pointer(-16), b = x(t, e.__wbindgen_malloc), y = w, k = x(_, e.__wbindgen_malloc), C = w;
                e.lorodoc_diff(g, this.__wbg_ptr, b, y, k, C, v(n) ? 16777215 : n ? 1 : 0);
                var r = o().getInt32(g + 0, !0), i = o().getInt32(g + 4, !0), d = o().getInt32(g + 8, !0);
                if (d) throw s(i);
                return s(r);
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        fork() {
            const t = e.lorodoc_fork(this.__wbg_ptr);
            return N.__wrap(t);
        }
        attach() {
            e.lorodoc_attach(this.__wbg_ptr);
        }
        commit(t) {
            try {
                const r = e.__wbindgen_add_to_stack_pointer(-16);
                e.lorodoc_commit(r, this.__wbg_ptr, v(t) ? 0 : c(t));
                var _ = o().getInt32(r + 0, !0), n = o().getInt32(r + 4, !0);
                if (n) throw s(_);
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        detach() {
            e.lorodoc_detach(this.__wbg_ptr);
        }
        export(t) {
            try {
                const g = e.__wbindgen_add_to_stack_pointer(-16);
                e.lorodoc_export(g, this.__wbg_ptr, c(t));
                var _ = o().getInt32(g + 0, !0), n = o().getInt32(g + 4, !0), r = o().getInt32(g + 8, !0), i = o().getInt32(g + 12, !0);
                if (i) throw s(r);
                var d = D(_, n).slice();
                return e.__wbindgen_free(_, n * 1, 1), d;
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        import(t) {
            try {
                const i = e.__wbindgen_add_to_stack_pointer(-16), d = R(t, e.__wbindgen_malloc), g = w;
                e.lorodoc_import(i, this.__wbg_ptr, d, g);
                var _ = o().getInt32(i + 0, !0), n = o().getInt32(i + 4, !0), r = o().getInt32(i + 8, !0);
                if (r) throw s(n);
                return s(_);
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        forkAt(t) {
            try {
                const i = e.__wbindgen_add_to_stack_pointer(-16), d = x(t, e.__wbindgen_malloc), g = w;
                e.lorodoc_forkAt(i, this.__wbg_ptr, d, g);
                var _ = o().getInt32(i + 0, !0), n = o().getInt32(i + 4, !0), r = o().getInt32(i + 8, !0);
                if (r) throw s(n);
                return N.__wrap(_);
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        getMap(t) {
            try {
                const i = e.__wbindgen_add_to_stack_pointer(-16);
                e.lorodoc_getMap(i, this.__wbg_ptr, m(t));
                var _ = o().getInt32(i + 0, !0), n = o().getInt32(i + 4, !0), r = o().getInt32(i + 8, !0);
                if (r) throw s(n);
                return j.__wrap(_);
            } finally{
                e.__wbindgen_add_to_stack_pointer(16), p[h++] = void 0;
            }
        }
        opCount() {
            return e.lorodoc_opCount(this.__wbg_ptr) >>> 0;
        }
        get peerId() {
            const t = e.lorodoc_peerId(this.__wbg_ptr);
            return BigInt.asUintN(64, t);
        }
        toJSON() {
            try {
                const r = e.__wbindgen_add_to_stack_pointer(-16);
                e.lorodoc_toJSON(r, this.__wbg_ptr);
                var t = o().getInt32(r + 0, !0), _ = o().getInt32(r + 4, !0), n = o().getInt32(r + 8, !0);
                if (n) throw s(_);
                return s(t);
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        version() {
            const t = e.lorodoc_version(this.__wbg_ptr);
            return S.__wrap(t);
        }
        checkout(t) {
            try {
                const r = e.__wbindgen_add_to_stack_pointer(-16), i = x(t, e.__wbindgen_malloc), d = w;
                e.lorodoc_checkout(r, this.__wbg_ptr, i, d);
                var _ = o().getInt32(r + 0, !0), n = o().getInt32(r + 4, !0);
                if (n) throw s(_);
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        getList(t) {
            try {
                const i = e.__wbindgen_add_to_stack_pointer(-16);
                e.lorodoc_getList(i, this.__wbg_ptr, m(t));
                var _ = o().getInt32(i + 0, !0), n = o().getInt32(i + 4, !0), r = o().getInt32(i + 8, !0);
                if (r) throw s(n);
                return z.__wrap(_);
            } finally{
                e.__wbindgen_add_to_stack_pointer(16), p[h++] = void 0;
            }
        }
        getText(t) {
            try {
                const i = e.__wbindgen_add_to_stack_pointer(-16);
                e.lorodoc_getText(i, this.__wbg_ptr, m(t));
                var _ = o().getInt32(i + 0, !0), n = o().getInt32(i + 4, !0), r = o().getInt32(i + 8, !0);
                if (r) throw s(n);
                return B.__wrap(_);
            } finally{
                e.__wbindgen_add_to_stack_pointer(16), p[h++] = void 0;
            }
        }
        getTree(t) {
            try {
                const i = e.__wbindgen_add_to_stack_pointer(-16);
                e.lorodoc_getTree(i, this.__wbg_ptr, m(t));
                var _ = o().getInt32(i + 0, !0), n = o().getInt32(i + 4, !0), r = o().getInt32(i + 8, !0);
                if (r) throw s(n);
                return W.__wrap(_);
            } finally{
                e.__wbindgen_add_to_stack_pointer(16), p[h++] = void 0;
            }
        }
        frontiers() {
            try {
                const r = e.__wbindgen_add_to_stack_pointer(-16);
                e.lorodoc_frontiers(r, this.__wbg_ptr);
                var t = o().getInt32(r + 0, !0), _ = o().getInt32(r + 4, !0), n = o().getInt32(r + 8, !0);
                if (n) throw s(_);
                return s(t);
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        JSONPath(t) {
            try {
                const i = e.__wbindgen_add_to_stack_pointer(-16), d = u(t, e.__wbindgen_malloc, e.__wbindgen_realloc), g = w;
                e.lorodoc_JSONPath(i, this.__wbg_ptr, d, g);
                var _ = o().getInt32(i + 0, !0), n = o().getInt32(i + 4, !0), r = o().getInt32(i + 8, !0);
                if (r) throw s(n);
                return s(_);
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        revertTo(t) {
            try {
                const r = e.__wbindgen_add_to_stack_pointer(-16), i = x(t, e.__wbindgen_malloc), d = w;
                e.lorodoc_revertTo(r, this.__wbg_ptr, i, d);
                var _ = o().getInt32(r + 0, !0), n = o().getInt32(r + 4, !0);
                if (n) throw s(_);
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        subscribe(t) {
            const _ = e.lorodoc_subscribe(this.__wbg_ptr, c(t));
            return s(_);
        }
    };
    const K = typeof FinalizationRegistry > "u" ? {
        register: ()=>{},
        unregister: ()=>{}
    } : new FinalizationRegistry((a)=>e.__wbg_lorolist_free(a >>> 0, 1));
    class z {
        static __wrap(t) {
            t = t >>> 0;
            const _ = Object.create(z.prototype);
            return _.__wbg_ptr = t, K.register(_, _.__wbg_ptr, _), _;
        }
        __destroy_into_raw() {
            const t = this.__wbg_ptr;
            return this.__wbg_ptr = 0, K.unregister(this), t;
        }
        free() {
            const t = this.__destroy_into_raw();
            e.__wbg_lorolist_free(t, 0);
        }
        isAttached() {
            return e.lorolist_isAttached(this.__wbg_ptr) !== 0;
        }
        getAttached() {
            const t = e.lorolist_getAttached(this.__wbg_ptr);
            return s(t);
        }
        pushContainer(t) {
            try {
                const i = e.__wbindgen_add_to_stack_pointer(-16);
                e.lorolist_pushContainer(i, this.__wbg_ptr, c(t));
                var _ = o().getInt32(i + 0, !0), n = o().getInt32(i + 4, !0), r = o().getInt32(i + 8, !0);
                if (r) throw s(n);
                return s(_);
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        insertContainer(t, _) {
            try {
                const d = e.__wbindgen_add_to_stack_pointer(-16);
                e.lorolist_insertContainer(d, this.__wbg_ptr, t, c(_));
                var n = o().getInt32(d + 0, !0), r = o().getInt32(d + 4, !0), i = o().getInt32(d + 8, !0);
                if (i) throw s(r);
                return s(n);
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        getShallowValue() {
            const t = e.lorolist_getShallowValue(this.__wbg_ptr);
            return s(t);
        }
        get id() {
            const t = e.lorolist_id(this.__wbg_ptr);
            return s(t);
        }
        get(t) {
            const _ = e.lorolist_get(this.__wbg_ptr, t);
            return s(_);
        }
        constructor(){
            const t = e.lorolist_new();
            return this.__wbg_ptr = t >>> 0, K.register(this, this.__wbg_ptr, this), this;
        }
        pop() {
            try {
                const r = e.__wbindgen_add_to_stack_pointer(-16);
                e.lorolist_pop(r, this.__wbg_ptr);
                var t = o().getInt32(r + 0, !0), _ = o().getInt32(r + 4, !0), n = o().getInt32(r + 8, !0);
                if (n) throw s(_);
                return s(t);
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        kind() {
            const t = e.lorolist_kind(this.__wbg_ptr);
            return s(t);
        }
        push(t) {
            try {
                const r = e.__wbindgen_add_to_stack_pointer(-16);
                e.lorolist_push(r, this.__wbg_ptr, c(t));
                var _ = o().getInt32(r + 0, !0), n = o().getInt32(r + 4, !0);
                if (n) throw s(_);
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        clear() {
            try {
                const n = e.__wbindgen_add_to_stack_pointer(-16);
                e.lorolist_clear(n, this.__wbg_ptr);
                var t = o().getInt32(n + 0, !0), _ = o().getInt32(n + 4, !0);
                if (_) throw s(t);
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        delete(t, _) {
            try {
                const i = e.__wbindgen_add_to_stack_pointer(-16);
                e.lorolist_delete(i, this.__wbg_ptr, t, _);
                var n = o().getInt32(i + 0, !0), r = o().getInt32(i + 4, !0);
                if (r) throw s(n);
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        insert(t, _) {
            try {
                const i = e.__wbindgen_add_to_stack_pointer(-16);
                e.lorolist_insert(i, this.__wbg_ptr, t, c(_));
                var n = o().getInt32(i + 0, !0), r = o().getInt32(i + 4, !0);
                if (r) throw s(n);
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        get length() {
            return e.lorolist_length(this.__wbg_ptr) >>> 0;
        }
        parent() {
            const t = e.lorolist_parent(this.__wbg_ptr);
            return s(t);
        }
        getIdAt(t) {
            try {
                const i = e.__wbindgen_add_to_stack_pointer(-16);
                e.lorolist_getIdAt(i, this.__wbg_ptr, t);
                var _ = o().getInt32(i + 0, !0), n = o().getInt32(i + 4, !0), r = o().getInt32(i + 8, !0);
                if (r) throw s(n);
                return s(_);
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        toJSON() {
            const t = e.lorolist_toJSON(this.__wbg_ptr);
            return s(t);
        }
        toArray() {
            try {
                const r = e.__wbindgen_add_to_stack_pointer(-16);
                e.lorolist_toArray(r, this.__wbg_ptr);
                var t = o().getInt32(r + 0, !0), _ = o().getInt32(r + 4, !0), n = A(t, _).slice();
                return e.__wbindgen_free(t, _ * 4, 4), n;
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        getCursor(t, _) {
            const n = e.lorolist_getCursor(this.__wbg_ptr, t, c(_));
            return n === 0 ? void 0 : F.__wrap(n);
        }
        isDeleted() {
            return e.lorolist_isDeleted(this.__wbg_ptr) !== 0;
        }
        subscribe(t) {
            try {
                const i = e.__wbindgen_add_to_stack_pointer(-16);
                e.lorolist_subscribe(i, this.__wbg_ptr, c(t));
                var _ = o().getInt32(i + 0, !0), n = o().getInt32(i + 4, !0), r = o().getInt32(i + 8, !0);
                if (r) throw s(n);
                return s(_);
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
    }
    const Q = typeof FinalizationRegistry > "u" ? {
        register: ()=>{},
        unregister: ()=>{}
    } : new FinalizationRegistry((a)=>e.__wbg_loromap_free(a >>> 0, 1));
    class j {
        static __wrap(t) {
            t = t >>> 0;
            const _ = Object.create(j.prototype);
            return _.__wbg_ptr = t, Q.register(_, _.__wbg_ptr, _), _;
        }
        __destroy_into_raw() {
            const t = this.__wbg_ptr;
            return this.__wbg_ptr = 0, Q.unregister(this), t;
        }
        free() {
            const t = this.__destroy_into_raw();
            e.__wbg_loromap_free(t, 0);
        }
        isAttached() {
            return e.loromap_isAttached(this.__wbg_ptr) !== 0;
        }
        getAttached() {
            const t = e.loromap_getAttached(this.__wbg_ptr);
            return s(t);
        }
        getLastEditor(t) {
            const _ = u(t, e.__wbindgen_malloc, e.__wbindgen_realloc), n = w, r = e.loromap_getLastEditor(this.__wbg_ptr, _, n);
            return s(r);
        }
        setContainer(t, _) {
            try {
                const d = e.__wbindgen_add_to_stack_pointer(-16), g = u(t, e.__wbindgen_malloc, e.__wbindgen_realloc), b = w;
                e.loromap_setContainer(d, this.__wbg_ptr, g, b, c(_));
                var n = o().getInt32(d + 0, !0), r = o().getInt32(d + 4, !0), i = o().getInt32(d + 8, !0);
                if (i) throw s(r);
                return s(n);
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        getShallowValue() {
            const t = e.loromap_getShallowValue(this.__wbg_ptr);
            return s(t);
        }
        getOrCreateContainer(t, _) {
            try {
                const d = e.__wbindgen_add_to_stack_pointer(-16), g = u(t, e.__wbindgen_malloc, e.__wbindgen_realloc), b = w;
                e.loromap_getOrCreateContainer(d, this.__wbg_ptr, g, b, c(_));
                var n = o().getInt32(d + 0, !0), r = o().getInt32(d + 4, !0), i = o().getInt32(d + 8, !0);
                if (i) throw s(r);
                return s(n);
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        get id() {
            const t = e.loromap_id(this.__wbg_ptr);
            return s(t);
        }
        get(t) {
            const _ = u(t, e.__wbindgen_malloc, e.__wbindgen_realloc), n = w, r = e.loromap_get(this.__wbg_ptr, _, n);
            return s(r);
        }
        constructor(){
            const t = e.loromap_new();
            return this.__wbg_ptr = t >>> 0, Q.register(this, this.__wbg_ptr, this), this;
        }
        keys() {
            try {
                const r = e.__wbindgen_add_to_stack_pointer(-16);
                e.loromap_keys(r, this.__wbg_ptr);
                var t = o().getInt32(r + 0, !0), _ = o().getInt32(r + 4, !0), n = A(t, _).slice();
                return e.__wbindgen_free(t, _ * 4, 4), n;
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        kind() {
            const t = e.loromap_kind(this.__wbg_ptr);
            return s(t);
        }
        get size() {
            return e.loromap_size(this.__wbg_ptr) >>> 0;
        }
        clear() {
            try {
                const n = e.__wbindgen_add_to_stack_pointer(-16);
                e.loromap_clear(n, this.__wbg_ptr);
                var t = o().getInt32(n + 0, !0), _ = o().getInt32(n + 4, !0);
                if (_) throw s(t);
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        delete(t) {
            try {
                const r = e.__wbindgen_add_to_stack_pointer(-16), i = u(t, e.__wbindgen_malloc, e.__wbindgen_realloc), d = w;
                e.loromap_delete(r, this.__wbg_ptr, i, d);
                var _ = o().getInt32(r + 0, !0), n = o().getInt32(r + 4, !0);
                if (n) throw s(_);
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        set(t, _) {
            try {
                const i = e.__wbindgen_add_to_stack_pointer(-16), d = u(t, e.__wbindgen_malloc, e.__wbindgen_realloc), g = w;
                e.loromap_set(i, this.__wbg_ptr, d, g, c(_));
                var n = o().getInt32(i + 0, !0), r = o().getInt32(i + 4, !0);
                if (r) throw s(n);
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        parent() {
            const t = e.loromap_parent(this.__wbg_ptr);
            return s(t);
        }
        values() {
            try {
                const r = e.__wbindgen_add_to_stack_pointer(-16);
                e.loromap_values(r, this.__wbg_ptr);
                var t = o().getInt32(r + 0, !0), _ = o().getInt32(r + 4, !0), n = A(t, _).slice();
                return e.__wbindgen_free(t, _ * 4, 4), n;
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        entries() {
            try {
                const r = e.__wbindgen_add_to_stack_pointer(-16);
                e.loromap_entries(r, this.__wbg_ptr);
                var t = o().getInt32(r + 0, !0), _ = o().getInt32(r + 4, !0), n = A(t, _).slice();
                return e.__wbindgen_free(t, _ * 4, 4), n;
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        toJSON() {
            const t = e.loromap_toJSON(this.__wbg_ptr);
            return s(t);
        }
        isDeleted() {
            return e.loromap_isDeleted(this.__wbg_ptr) !== 0;
        }
        subscribe(t) {
            try {
                const i = e.__wbindgen_add_to_stack_pointer(-16);
                e.loromap_subscribe(i, this.__wbg_ptr, c(t));
                var _ = o().getInt32(i + 0, !0), n = o().getInt32(i + 4, !0), r = o().getInt32(i + 8, !0);
                if (r) throw s(n);
                return s(_);
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
    }
    const X = typeof FinalizationRegistry > "u" ? {
        register: ()=>{},
        unregister: ()=>{}
    } : new FinalizationRegistry((a)=>e.__wbg_loromovablelist_free(a >>> 0, 1));
    class P {
        static __wrap(t) {
            t = t >>> 0;
            const _ = Object.create(P.prototype);
            return _.__wbg_ptr = t, X.register(_, _.__wbg_ptr, _), _;
        }
        __destroy_into_raw() {
            const t = this.__wbg_ptr;
            return this.__wbg_ptr = 0, X.unregister(this), t;
        }
        free() {
            const t = this.__destroy_into_raw();
            e.__wbg_loromovablelist_free(t, 0);
        }
        isAttached() {
            return e.loromovablelist_isAttached(this.__wbg_ptr) !== 0;
        }
        getCreatorAt(t) {
            const _ = e.loromovablelist_getCreatorAt(this.__wbg_ptr, t);
            return s(_);
        }
        getAttached() {
            const t = e.loromovablelist_getAttached(this.__wbg_ptr);
            return s(t);
        }
        setContainer(t, _) {
            try {
                const d = e.__wbindgen_add_to_stack_pointer(-16);
                e.loromovablelist_setContainer(d, this.__wbg_ptr, t, c(_));
                var n = o().getInt32(d + 0, !0), r = o().getInt32(d + 4, !0), i = o().getInt32(d + 8, !0);
                if (i) throw s(r);
                return s(n);
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        getLastMoverAt(t) {
            const _ = e.loromovablelist_getLastMoverAt(this.__wbg_ptr, t);
            return s(_);
        }
        pushContainer(t) {
            try {
                const i = e.__wbindgen_add_to_stack_pointer(-16);
                e.loromovablelist_pushContainer(i, this.__wbg_ptr, c(t));
                var _ = o().getInt32(i + 0, !0), n = o().getInt32(i + 4, !0), r = o().getInt32(i + 8, !0);
                if (r) throw s(n);
                return s(_);
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        getLastEditorAt(t) {
            const _ = e.loromovablelist_getLastEditorAt(this.__wbg_ptr, t);
            return s(_);
        }
        insertContainer(t, _) {
            try {
                const d = e.__wbindgen_add_to_stack_pointer(-16);
                e.loromovablelist_insertContainer(d, this.__wbg_ptr, t, c(_));
                var n = o().getInt32(d + 0, !0), r = o().getInt32(d + 4, !0), i = o().getInt32(d + 8, !0);
                if (i) throw s(r);
                return s(n);
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        getShallowValue() {
            const t = e.loromovablelist_getShallowValue(this.__wbg_ptr);
            return s(t);
        }
        get id() {
            const t = e.loromovablelist_id(this.__wbg_ptr);
            return s(t);
        }
        get(t) {
            const _ = e.loromovablelist_get(this.__wbg_ptr, t);
            return s(_);
        }
        move(t, _) {
            try {
                const i = e.__wbindgen_add_to_stack_pointer(-16);
                e.loromovablelist_move(i, this.__wbg_ptr, t, _);
                var n = o().getInt32(i + 0, !0), r = o().getInt32(i + 4, !0);
                if (r) throw s(n);
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        constructor(){
            const t = e.loromovablelist_new();
            return this.__wbg_ptr = t >>> 0, X.register(this, this.__wbg_ptr, this), this;
        }
        pop() {
            try {
                const r = e.__wbindgen_add_to_stack_pointer(-16);
                e.loromovablelist_pop(r, this.__wbg_ptr);
                var t = o().getInt32(r + 0, !0), _ = o().getInt32(r + 4, !0), n = o().getInt32(r + 8, !0);
                if (n) throw s(_);
                return s(t);
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        set(t, _) {
            try {
                const i = e.__wbindgen_add_to_stack_pointer(-16);
                e.loromovablelist_set(i, this.__wbg_ptr, t, c(_));
                var n = o().getInt32(i + 0, !0), r = o().getInt32(i + 4, !0);
                if (r) throw s(n);
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        kind() {
            const t = e.loromovablelist_kind(this.__wbg_ptr);
            return s(t);
        }
        push(t) {
            try {
                const r = e.__wbindgen_add_to_stack_pointer(-16);
                e.loromovablelist_push(r, this.__wbg_ptr, c(t));
                var _ = o().getInt32(r + 0, !0), n = o().getInt32(r + 4, !0);
                if (n) throw s(_);
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        clear() {
            try {
                const n = e.__wbindgen_add_to_stack_pointer(-16);
                e.loromovablelist_clear(n, this.__wbg_ptr);
                var t = o().getInt32(n + 0, !0), _ = o().getInt32(n + 4, !0);
                if (_) throw s(t);
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        delete(t, _) {
            try {
                const i = e.__wbindgen_add_to_stack_pointer(-16);
                e.loromovablelist_delete(i, this.__wbg_ptr, t, _);
                var n = o().getInt32(i + 0, !0), r = o().getInt32(i + 4, !0);
                if (r) throw s(n);
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        insert(t, _) {
            try {
                const i = e.__wbindgen_add_to_stack_pointer(-16);
                e.loromovablelist_insert(i, this.__wbg_ptr, t, c(_));
                var n = o().getInt32(i + 0, !0), r = o().getInt32(i + 4, !0);
                if (r) throw s(n);
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        get length() {
            return e.loromovablelist_length(this.__wbg_ptr) >>> 0;
        }
        parent() {
            const t = e.loromovablelist_parent(this.__wbg_ptr);
            return s(t);
        }
        toJSON() {
            const t = e.loromovablelist_toJSON(this.__wbg_ptr);
            return s(t);
        }
        toArray() {
            try {
                const r = e.__wbindgen_add_to_stack_pointer(-16);
                e.loromovablelist_toArray(r, this.__wbg_ptr);
                var t = o().getInt32(r + 0, !0), _ = o().getInt32(r + 4, !0), n = A(t, _).slice();
                return e.__wbindgen_free(t, _ * 4, 4), n;
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        getCursor(t, _) {
            const n = e.loromovablelist_getCursor(this.__wbg_ptr, t, c(_));
            return n === 0 ? void 0 : F.__wrap(n);
        }
        isDeleted() {
            return e.loromovablelist_isDeleted(this.__wbg_ptr) !== 0;
        }
        subscribe(t) {
            try {
                const i = e.__wbindgen_add_to_stack_pointer(-16);
                e.loromovablelist_subscribe(i, this.__wbg_ptr, c(t));
                var _ = o().getInt32(i + 0, !0), n = o().getInt32(i + 4, !0), r = o().getInt32(i + 8, !0);
                if (r) throw s(n);
                return s(_);
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
    }
    const Y = typeof FinalizationRegistry > "u" ? {
        register: ()=>{},
        unregister: ()=>{}
    } : new FinalizationRegistry((a)=>e.__wbg_lorotext_free(a >>> 0, 1));
    class B {
        static __wrap(t) {
            t = t >>> 0;
            const _ = Object.create(B.prototype);
            return _.__wbg_ptr = t, Y.register(_, _.__wbg_ptr, _), _;
        }
        __destroy_into_raw() {
            const t = this.__wbg_ptr;
            return this.__wbg_ptr = 0, Y.unregister(this), t;
        }
        free() {
            const t = this.__destroy_into_raw();
            e.__wbg_lorotext_free(t, 0);
        }
        applyDelta(t) {
            try {
                const r = e.__wbindgen_add_to_stack_pointer(-16);
                e.lorotext_applyDelta(r, this.__wbg_ptr, c(t));
                var _ = o().getInt32(r + 0, !0), n = o().getInt32(r + 4, !0);
                if (n) throw s(_);
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        convertPos(t, _, n) {
            const r = u(_, e.__wbindgen_malloc, e.__wbindgen_realloc), i = w, d = u(n, e.__wbindgen_malloc, e.__wbindgen_realloc), g = w, b = e.lorotext_convertPos(this.__wbg_ptr, t, r, i, d, g);
            return s(b);
        }
        deleteUtf8(t, _) {
            try {
                const i = e.__wbindgen_add_to_stack_pointer(-16);
                e.lorotext_deleteUtf8(i, this.__wbg_ptr, t, _);
                var n = o().getInt32(i + 0, !0), r = o().getInt32(i + 4, !0);
                if (r) throw s(n);
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        getEditorOf(t) {
            const _ = e.lorotext_getEditorOf(this.__wbg_ptr, t);
            return s(_);
        }
        insertUtf8(t, _) {
            try {
                const i = e.__wbindgen_add_to_stack_pointer(-16), d = u(_, e.__wbindgen_malloc, e.__wbindgen_realloc), g = w;
                e.lorotext_insertUtf8(i, this.__wbg_ptr, t, d, g);
                var n = o().getInt32(i + 0, !0), r = o().getInt32(i + 4, !0);
                if (r) throw s(n);
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        isAttached() {
            return e.lorotext_isAttached(this.__wbg_ptr) !== 0;
        }
        sliceDelta(t, _) {
            try {
                const d = e.__wbindgen_add_to_stack_pointer(-16);
                e.lorotext_sliceDelta(d, this.__wbg_ptr, t, _);
                var n = o().getInt32(d + 0, !0), r = o().getInt32(d + 4, !0), i = o().getInt32(d + 8, !0);
                if (i) throw s(r);
                return s(n);
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        getAttached() {
            const t = e.lorotext_getAttached(this.__wbg_ptr);
            return s(t);
        }
        updateByLine(t, _) {
            try {
                const i = e.__wbindgen_add_to_stack_pointer(-16), d = u(t, e.__wbindgen_malloc, e.__wbindgen_realloc), g = w;
                e.lorotext_updateByLine(i, this.__wbg_ptr, d, g, c(_));
                var n = o().getInt32(i + 0, !0), r = o().getInt32(i + 4, !0);
                if (r) throw s(n);
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        sliceDeltaUtf8(t, _) {
            try {
                const d = e.__wbindgen_add_to_stack_pointer(-16);
                e.lorotext_sliceDeltaUtf8(d, this.__wbg_ptr, t, _);
                var n = o().getInt32(d + 0, !0), r = o().getInt32(d + 4, !0), i = o().getInt32(d + 8, !0);
                if (i) throw s(r);
                return s(n);
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        getShallowValue() {
            let t, _;
            try {
                const i = e.__wbindgen_add_to_stack_pointer(-16);
                e.lorotext_getShallowValue(i, this.__wbg_ptr);
                var n = o().getInt32(i + 0, !0), r = o().getInt32(i + 4, !0);
                return t = n, _ = r, f(n, r);
            } finally{
                e.__wbindgen_add_to_stack_pointer(16), e.__wbindgen_free(t, _, 1);
            }
        }
        get id() {
            const t = e.lorotext_id(this.__wbg_ptr);
            return s(t);
        }
        constructor(){
            const t = e.lorotext_new();
            return this.__wbg_ptr = t >>> 0, Y.register(this, this.__wbg_ptr, this), this;
        }
        iter(t) {
            try {
                const r = e.__wbindgen_add_to_stack_pointer(-16);
                e.lorotext_iter(r, this.__wbg_ptr, c(t));
                var _ = o().getInt32(r + 0, !0), n = o().getInt32(r + 4, !0);
                if (n) throw s(_);
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        kind() {
            const t = e.lorotext_kind(this.__wbg_ptr);
            return s(t);
        }
        mark(t, _, n) {
            try {
                const d = e.__wbindgen_add_to_stack_pointer(-16), g = u(_, e.__wbindgen_malloc, e.__wbindgen_realloc), b = w;
                e.lorotext_mark(d, this.__wbg_ptr, c(t), g, b, c(n));
                var r = o().getInt32(d + 0, !0), i = o().getInt32(d + 4, !0);
                if (i) throw s(r);
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        push(t) {
            try {
                const r = e.__wbindgen_add_to_stack_pointer(-16), i = u(t, e.__wbindgen_malloc, e.__wbindgen_realloc), d = w;
                e.lorotext_push(r, this.__wbg_ptr, i, d);
                var _ = o().getInt32(r + 0, !0), n = o().getInt32(r + 4, !0);
                if (n) throw s(_);
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        slice(t, _) {
            let n, r;
            try {
                const C = e.__wbindgen_add_to_stack_pointer(-16);
                e.lorotext_slice(C, this.__wbg_ptr, t, _);
                var i = o().getInt32(C + 0, !0), d = o().getInt32(C + 4, !0), g = o().getInt32(C + 8, !0), b = o().getInt32(C + 12, !0), y = i, k = d;
                if (b) throw y = 0, k = 0, s(g);
                return n = y, r = k, f(y, k);
            } finally{
                e.__wbindgen_add_to_stack_pointer(16), e.__wbindgen_free(n, r, 1);
            }
        }
        delete(t, _) {
            try {
                const i = e.__wbindgen_add_to_stack_pointer(-16);
                e.lorotext_delete(i, this.__wbg_ptr, t, _);
                var n = o().getInt32(i + 0, !0), r = o().getInt32(i + 4, !0);
                if (r) throw s(n);
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        insert(t, _) {
            try {
                const i = e.__wbindgen_add_to_stack_pointer(-16), d = u(_, e.__wbindgen_malloc, e.__wbindgen_realloc), g = w;
                e.lorotext_insert(i, this.__wbg_ptr, t, d, g);
                var n = o().getInt32(i + 0, !0), r = o().getInt32(i + 4, !0);
                if (r) throw s(n);
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        get length() {
            return e.lorotext_length(this.__wbg_ptr) >>> 0;
        }
        parent() {
            const t = e.lorotext_parent(this.__wbg_ptr);
            return s(t);
        }
        splice(t, _, n) {
            let r, i;
            try {
                const V = e.__wbindgen_add_to_stack_pointer(-16), u_ = u(n, e.__wbindgen_malloc, e.__wbindgen_realloc), p_ = w;
                e.lorotext_splice(V, this.__wbg_ptr, t, _, u_, p_);
                var d = o().getInt32(V + 0, !0), g = o().getInt32(V + 4, !0), b = o().getInt32(V + 8, !0), y = o().getInt32(V + 12, !0), k = d, C = g;
                if (y) throw k = 0, C = 0, s(b);
                return r = k, i = C, f(k, C);
            } finally{
                e.__wbindgen_add_to_stack_pointer(16), e.__wbindgen_free(r, i, 1);
            }
        }
        unmark(t, _) {
            try {
                const i = e.__wbindgen_add_to_stack_pointer(-16), d = u(_, e.__wbindgen_malloc, e.__wbindgen_realloc), g = w;
                e.lorotext_unmark(i, this.__wbg_ptr, c(t), d, g);
                var n = o().getInt32(i + 0, !0), r = o().getInt32(i + 4, !0);
                if (r) throw s(n);
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        update(t, _) {
            try {
                const i = e.__wbindgen_add_to_stack_pointer(-16), d = u(t, e.__wbindgen_malloc, e.__wbindgen_realloc), g = w;
                e.lorotext_update(i, this.__wbg_ptr, d, g, c(_));
                var n = o().getInt32(i + 0, !0), r = o().getInt32(i + 4, !0);
                if (r) throw s(n);
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        charAt(t) {
            try {
                const i = e.__wbindgen_add_to_stack_pointer(-16);
                e.lorotext_charAt(i, this.__wbg_ptr, t);
                var _ = o().getInt32(i + 0, !0), n = o().getInt32(i + 4, !0), r = o().getInt32(i + 8, !0);
                if (r) throw s(n);
                return String.fromCodePoint(_);
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        toJSON() {
            const t = e.lorotext_toJSON(this.__wbg_ptr);
            return s(t);
        }
        toDelta() {
            try {
                const r = e.__wbindgen_add_to_stack_pointer(-16);
                e.lorotext_toDelta(r, this.__wbg_ptr);
                var t = o().getInt32(r + 0, !0), _ = o().getInt32(r + 4, !0), n = o().getInt32(r + 8, !0);
                if (n) throw s(_);
                return s(t);
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        getCursor(t, _) {
            const n = e.lorotext_getCursor(this.__wbg_ptr, t, c(_));
            return n === 0 ? void 0 : F.__wrap(n);
        }
        isDeleted() {
            return e.lorotext_isDeleted(this.__wbg_ptr) !== 0;
        }
        subscribe(t) {
            try {
                const i = e.__wbindgen_add_to_stack_pointer(-16);
                e.lorotext_subscribe(i, this.__wbg_ptr, c(t));
                var _ = o().getInt32(i + 0, !0), n = o().getInt32(i + 4, !0), r = o().getInt32(i + 8, !0);
                if (r) throw s(n);
                return s(_);
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        toString() {
            let t, _;
            try {
                const i = e.__wbindgen_add_to_stack_pointer(-16);
                e.lorotext_toString(i, this.__wbg_ptr);
                var n = o().getInt32(i + 0, !0), r = o().getInt32(i + 4, !0);
                return t = n, _ = r, f(n, r);
            } finally{
                e.__wbindgen_add_to_stack_pointer(16), e.__wbindgen_free(t, _, 1);
            }
        }
    }
    const Z = typeof FinalizationRegistry > "u" ? {
        register: ()=>{},
        unregister: ()=>{}
    } : new FinalizationRegistry((a)=>e.__wbg_lorotree_free(a >>> 0, 1));
    class W {
        static __wrap(t) {
            t = t >>> 0;
            const _ = Object.create(W.prototype);
            return _.__wbg_ptr = t, Z.register(_, _.__wbg_ptr, _), _;
        }
        __destroy_into_raw() {
            const t = this.__wbg_ptr;
            return this.__wbg_ptr = 0, Z.unregister(this), t;
        }
        free() {
            const t = this.__destroy_into_raw();
            e.__wbg_lorotree_free(t, 0);
        }
        createNode(t, _) {
            try {
                const d = e.__wbindgen_add_to_stack_pointer(-16);
                e.lorotree_createNode(d, this.__wbg_ptr, m(t), v(_) ? 4294967297 : _ >>> 0);
                var n = o().getInt32(d + 0, !0), r = o().getInt32(d + 4, !0), i = o().getInt32(d + 8, !0);
                if (i) throw s(r);
                return O.__wrap(n);
            } finally{
                e.__wbindgen_add_to_stack_pointer(16), p[h++] = void 0;
            }
        }
        isAttached() {
            return e.lorotree_isAttached(this.__wbg_ptr) !== 0;
        }
        getAttached() {
            const t = e.lorotree_getAttached(this.__wbg_ptr);
            return s(t);
        }
        getNodeByID(t) {
            try {
                const _ = e.lorotree_getNodeByID(this.__wbg_ptr, m(t));
                return _ === 0 ? void 0 : O.__wrap(_);
            } finally{
                p[h++] = void 0;
            }
        }
        isNodeDeleted(t) {
            try {
                const i = e.__wbindgen_add_to_stack_pointer(-16);
                e.lorotree_isNodeDeleted(i, this.__wbg_ptr, m(t));
                var _ = o().getInt32(i + 0, !0), n = o().getInt32(i + 4, !0), r = o().getInt32(i + 8, !0);
                if (r) throw s(n);
                return _ !== 0;
            } finally{
                e.__wbindgen_add_to_stack_pointer(16), p[h++] = void 0;
            }
        }
        getShallowValue() {
            const t = e.lorotree_getShallowValue(this.__wbg_ptr);
            return s(t);
        }
        enableFractionalIndex(t) {
            e.lorotree_enableFractionalIndex(this.__wbg_ptr, t);
        }
        disableFractionalIndex() {
            e.lorotree_disableFractionalIndex(this.__wbg_ptr);
        }
        isFractionalIndexEnabled() {
            return e.lorotree_isFractionalIndexEnabled(this.__wbg_ptr) !== 0;
        }
        get id() {
            const t = e.lorotree_id(this.__wbg_ptr);
            return s(t);
        }
        move(t, _, n) {
            try {
                const d = e.__wbindgen_add_to_stack_pointer(-16);
                e.lorotree_move(d, this.__wbg_ptr, m(t), m(_), v(n) ? 4294967297 : n >>> 0);
                var r = o().getInt32(d + 0, !0), i = o().getInt32(d + 4, !0);
                if (i) throw s(r);
            } finally{
                e.__wbindgen_add_to_stack_pointer(16), p[h++] = void 0, p[h++] = void 0;
            }
        }
        constructor(){
            const t = e.lorotree_new();
            return this.__wbg_ptr = t >>> 0, Z.register(this, this.__wbg_ptr, this), this;
        }
        kind() {
            const t = e.lorotree_kind(this.__wbg_ptr);
            return s(t);
        }
        nodes() {
            try {
                const r = e.__wbindgen_add_to_stack_pointer(-16);
                e.lorotree_nodes(r, this.__wbg_ptr);
                var t = o().getInt32(r + 0, !0), _ = o().getInt32(r + 4, !0), n = A(t, _).slice();
                return e.__wbindgen_free(t, _ * 4, 4), n;
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        roots() {
            try {
                const r = e.__wbindgen_add_to_stack_pointer(-16);
                e.lorotree_roots(r, this.__wbg_ptr);
                var t = o().getInt32(r + 0, !0), _ = o().getInt32(r + 4, !0), n = A(t, _).slice();
                return e.__wbindgen_free(t, _ * 4, 4), n;
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        delete(t) {
            try {
                const r = e.__wbindgen_add_to_stack_pointer(-16);
                e.lorotree_delete(r, this.__wbg_ptr, m(t));
                var _ = o().getInt32(r + 0, !0), n = o().getInt32(r + 4, !0);
                if (n) throw s(_);
            } finally{
                e.__wbindgen_add_to_stack_pointer(16), p[h++] = void 0;
            }
        }
        parent() {
            const t = e.lorotree_parent(this.__wbg_ptr);
            return s(t);
        }
        toJSON() {
            const t = e.lorotree_toJSON(this.__wbg_ptr);
            return s(t);
        }
        has(t) {
            try {
                return e.lorotree_has(this.__wbg_ptr, m(t)) !== 0;
            } finally{
                p[h++] = void 0;
            }
        }
        toArray() {
            try {
                const r = e.__wbindgen_add_to_stack_pointer(-16);
                e.lorotree_toArray(r, this.__wbg_ptr);
                var t = o().getInt32(r + 0, !0), _ = o().getInt32(r + 4, !0), n = o().getInt32(r + 8, !0);
                if (n) throw s(_);
                return s(t);
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        getNodes(t) {
            try {
                const i = e.__wbindgen_add_to_stack_pointer(-16);
                e.lorotree_getNodes(i, this.__wbg_ptr, c(t));
                var _ = o().getInt32(i + 0, !0), n = o().getInt32(i + 4, !0), r = o().getInt32(i + 8, !0);
                if (r) throw s(n);
                return s(_);
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        isDeleted() {
            return e.lorotree_isDeleted(this.__wbg_ptr) !== 0;
        }
        subscribe(t) {
            try {
                const i = e.__wbindgen_add_to_stack_pointer(-16);
                e.lorotree_subscribe(i, this.__wbg_ptr, c(t));
                var _ = o().getInt32(i + 0, !0), n = o().getInt32(i + 4, !0), r = o().getInt32(i + 8, !0);
                if (r) throw s(n);
                return s(_);
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
    }
    const at = typeof FinalizationRegistry > "u" ? {
        register: ()=>{},
        unregister: ()=>{}
    } : new FinalizationRegistry((a)=>e.__wbg_lorotreenode_free(a >>> 0, 1));
    class O {
        static __wrap(t) {
            t = t >>> 0;
            const _ = Object.create(O.prototype);
            return _.__wbg_ptr = t, at.register(_, _.__wbg_ptr, _), _;
        }
        __destroy_into_raw() {
            const t = this.__wbg_ptr;
            return this.__wbg_ptr = 0, at.unregister(this), t;
        }
        free() {
            const t = this.__destroy_into_raw();
            e.__wbg_lorotreenode_free(t, 0);
        }
        creationId() {
            try {
                const r = e.__wbindgen_add_to_stack_pointer(-16);
                e.lorotreenode_creationId(r, this.__wbg_ptr);
                var t = o().getInt32(r + 0, !0), _ = o().getInt32(r + 4, !0), n = o().getInt32(r + 8, !0);
                if (n) throw s(_);
                return s(t);
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        isDeleted() {
            try {
                const r = e.__wbindgen_add_to_stack_pointer(-16);
                e.lorotreenode_isDeleted(r, this.__wbg_ptr);
                var t = o().getInt32(r + 0, !0), _ = o().getInt32(r + 4, !0), n = o().getInt32(r + 8, !0);
                if (n) throw s(_);
                return t !== 0;
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        moveBefore(t) {
            try {
                const r = e.__wbindgen_add_to_stack_pointer(-16);
                U(t, O), e.lorotreenode_moveBefore(r, this.__wbg_ptr, t.__wbg_ptr);
                var _ = o().getInt32(r + 0, !0), n = o().getInt32(r + 4, !0);
                if (n) throw s(_);
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        createNode(t) {
            try {
                const i = e.__wbindgen_add_to_stack_pointer(-16);
                e.lorotreenode_createNode(i, this.__wbg_ptr, v(t) ? 4294967297 : t >>> 0);
                var _ = o().getInt32(i + 0, !0), n = o().getInt32(i + 4, !0), r = o().getInt32(i + 8, !0);
                if (r) throw s(n);
                return O.__wrap(_);
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        getLastMoveId() {
            try {
                const r = e.__wbindgen_add_to_stack_pointer(-16);
                e.lorotreenode_getLastMoveId(r, this.__wbg_ptr);
                var t = o().getInt32(r + 0, !0), _ = o().getInt32(r + 4, !0), n = o().getInt32(r + 8, !0);
                if (n) throw s(_);
                return s(t);
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        toJSON() {
            try {
                const r = e.__wbindgen_add_to_stack_pointer(-16);
                e.lorotreenode_toJSON(r, this.__wbg_ptr);
                var t = o().getInt32(r + 0, !0), _ = o().getInt32(r + 4, !0), n = o().getInt32(r + 8, !0);
                if (n) throw s(_);
                return s(t);
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        fractionalIndex() {
            try {
                const r = e.__wbindgen_add_to_stack_pointer(-16);
                e.lorotreenode_fractionalIndex(r, this.__wbg_ptr);
                var t = o().getInt32(r + 0, !0), _ = o().getInt32(r + 4, !0), n = o().getInt32(r + 8, !0);
                if (n) throw s(_);
                return s(t);
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        __getClassname() {
            let t, _;
            try {
                const i = e.__wbindgen_add_to_stack_pointer(-16);
                e.lorotreenode___getClassname(i, this.__wbg_ptr);
                var n = o().getInt32(i + 0, !0), r = o().getInt32(i + 4, !0);
                return t = n, _ = r, f(n, r);
            } finally{
                e.__wbindgen_add_to_stack_pointer(16), e.__wbindgen_free(t, _, 1);
            }
        }
        get id() {
            const t = e.lorotreenode_id(this.__wbg_ptr);
            return s(t);
        }
        move(t, _) {
            try {
                const i = e.__wbindgen_add_to_stack_pointer(-16);
                e.lorotreenode_move(i, this.__wbg_ptr, m(t), v(_) ? 4294967297 : _ >>> 0);
                var n = o().getInt32(i + 0, !0), r = o().getInt32(i + 4, !0);
                if (r) throw s(n);
            } finally{
                e.__wbindgen_add_to_stack_pointer(16), p[h++] = void 0;
            }
        }
        get data() {
            try {
                const r = e.__wbindgen_add_to_stack_pointer(-16);
                e.lorotreenode_data(r, this.__wbg_ptr);
                var t = o().getInt32(r + 0, !0), _ = o().getInt32(r + 4, !0), n = o().getInt32(r + 8, !0);
                if (n) throw s(_);
                return j.__wrap(t);
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        index() {
            try {
                const r = e.__wbindgen_add_to_stack_pointer(-16);
                e.lorotreenode_index(r, this.__wbg_ptr);
                var t = o().getFloat64(r + 0, !0), _ = o().getInt32(r + 8, !0), n = o().getInt32(r + 12, !0);
                if (n) throw s(_);
                return t === 4294967297 ? void 0 : t;
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        parent() {
            try {
                const r = e.__wbindgen_add_to_stack_pointer(-16);
                e.lorotreenode_parent(r, this.__wbg_ptr);
                var t = o().getInt32(r + 0, !0), _ = o().getInt32(r + 4, !0), n = o().getInt32(r + 8, !0);
                if (n) throw s(_);
                return t === 0 ? void 0 : O.__wrap(t);
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        creator() {
            const t = e.lorotreenode_creator(this.__wbg_ptr);
            return s(t);
        }
        children() {
            const t = e.lorotreenode_children(this.__wbg_ptr);
            return s(t);
        }
        moveAfter(t) {
            try {
                const r = e.__wbindgen_add_to_stack_pointer(-16);
                U(t, O), e.lorotreenode_moveAfter(r, this.__wbg_ptr, t.__wbg_ptr);
                var _ = o().getInt32(r + 0, !0), n = o().getInt32(r + 4, !0);
                if (n) throw s(_);
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
    }
    const st = typeof FinalizationRegistry > "u" ? {
        register: ()=>{},
        unregister: ()=>{}
    } : new FinalizationRegistry((a)=>e.__wbg_undomanager_free(a >>> 0, 1));
    U_ = class {
        __destroy_into_raw() {
            const t = this.__wbg_ptr;
            return this.__wbg_ptr = 0, st.unregister(this), t;
        }
        free() {
            const t = this.__destroy_into_raw();
            e.__wbg_undomanager_free(t, 0);
        }
        groupStart() {
            try {
                const n = e.__wbindgen_add_to_stack_pointer(-16);
                e.undomanager_groupStart(n, this.__wbg_ptr);
                var t = o().getInt32(n + 0, !0), _ = o().getInt32(n + 4, !0);
                if (_) throw s(t);
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        topRedoValue() {
            const t = e.undomanager_topRedoValue(this.__wbg_ptr);
            return s(t);
        }
        topUndoValue() {
            const t = e.undomanager_topUndoValue(this.__wbg_ptr);
            return s(t);
        }
        setMaxUndoSteps(t) {
            e.undomanager_setMaxUndoSteps(this.__wbg_ptr, t);
        }
        setMergeInterval(t) {
            e.undomanager_setMergeInterval(this.__wbg_ptr, t);
        }
        addExcludeOriginPrefix(t) {
            const _ = u(t, e.__wbindgen_malloc, e.__wbindgen_realloc), n = w;
            e.undomanager_addExcludeOriginPrefix(this.__wbg_ptr, _, n);
        }
        constructor(t, _){
            U(t, N);
            const n = e.undomanager_new(t.__wbg_ptr, c(_));
            return this.__wbg_ptr = n >>> 0, st.register(this, this.__wbg_ptr, this), this;
        }
        peer() {
            const t = e.undomanager_peer(this.__wbg_ptr);
            return s(t);
        }
        redo() {
            try {
                const r = e.__wbindgen_add_to_stack_pointer(-16);
                e.undomanager_redo(r, this.__wbg_ptr);
                var t = o().getInt32(r + 0, !0), _ = o().getInt32(r + 4, !0), n = o().getInt32(r + 8, !0);
                if (n) throw s(_);
                return t !== 0;
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        undo() {
            try {
                const r = e.__wbindgen_add_to_stack_pointer(-16);
                e.undomanager_undo(r, this.__wbg_ptr);
                var t = o().getInt32(r + 0, !0), _ = o().getInt32(r + 4, !0), n = o().getInt32(r + 8, !0);
                if (n) throw s(_);
                return t !== 0;
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        clear() {
            e.undomanager_clear(this.__wbg_ptr);
        }
        canRedo() {
            return e.undomanager_canRedo(this.__wbg_ptr) !== 0;
        }
        canUndo() {
            return e.undomanager_canUndo(this.__wbg_ptr) !== 0;
        }
        groupEnd() {
            e.undomanager_groupEnd(this.__wbg_ptr);
        }
        setOnPop(t) {
            e.undomanager_setOnPop(this.__wbg_ptr, c(t));
        }
        clearRedo() {
            e.undomanager_clearRedo(this.__wbg_ptr);
        }
        clearUndo() {
            e.undomanager_clearUndo(this.__wbg_ptr);
        }
        setOnPush(t) {
            e.undomanager_setOnPush(this.__wbg_ptr, c(t));
        }
    };
    const tt = typeof FinalizationRegistry > "u" ? {
        register: ()=>{},
        unregister: ()=>{}
    } : new FinalizationRegistry((a)=>e.__wbg_versionvector_free(a >>> 0, 1));
    class S {
        static __wrap(t) {
            t = t >>> 0;
            const _ = Object.create(S.prototype);
            return _.__wbg_ptr = t, tt.register(_, _.__wbg_ptr, _), _;
        }
        __destroy_into_raw() {
            const t = this.__wbg_ptr;
            return this.__wbg_ptr = 0, tt.unregister(this), t;
        }
        free() {
            const t = this.__destroy_into_raw();
            e.__wbg_versionvector_free(t, 0);
        }
        get(t) {
            try {
                const i = e.__wbindgen_add_to_stack_pointer(-16);
                e.versionvector_get(i, this.__wbg_ptr, c(t));
                var _ = o().getFloat64(i + 0, !0), n = o().getInt32(i + 8, !0), r = o().getInt32(i + 12, !0);
                if (r) throw s(n);
                return _ === 4294967297 ? void 0 : _;
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        constructor(t){
            try {
                const i = e.__wbindgen_add_to_stack_pointer(-16);
                e.versionvector_new(i, c(t));
                var _ = o().getInt32(i + 0, !0), n = o().getInt32(i + 4, !0), r = o().getInt32(i + 8, !0);
                if (r) throw s(n);
                return this.__wbg_ptr = _ >>> 0, tt.register(this, this.__wbg_ptr, this), this;
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        static decode(t) {
            try {
                const i = e.__wbindgen_add_to_stack_pointer(-16), d = R(t, e.__wbindgen_malloc), g = w;
                e.versionvector_decode(i, d, g);
                var _ = o().getInt32(i + 0, !0), n = o().getInt32(i + 4, !0), r = o().getInt32(i + 8, !0);
                if (r) throw s(n);
                return S.__wrap(_);
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        encode() {
            try {
                const r = e.__wbindgen_add_to_stack_pointer(-16);
                e.versionvector_encode(r, this.__wbg_ptr);
                var t = o().getInt32(r + 0, !0), _ = o().getInt32(r + 4, !0), n = D(t, _).slice();
                return e.__wbindgen_free(t, _ * 1, 1), n;
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        length() {
            return e.versionvector_length(this.__wbg_ptr) >>> 0;
        }
        remove(t) {
            try {
                const r = e.__wbindgen_add_to_stack_pointer(-16);
                e.versionvector_remove(r, this.__wbg_ptr, c(t));
                var _ = o().getInt32(r + 0, !0), n = o().getInt32(r + 4, !0);
                if (n) throw s(_);
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        setEnd(t) {
            try {
                const r = e.__wbindgen_add_to_stack_pointer(-16);
                e.versionvector_setEnd(r, this.__wbg_ptr, c(t));
                var _ = o().getInt32(r + 0, !0), n = o().getInt32(r + 4, !0);
                if (n) throw s(_);
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        compare(t) {
            U(t, S);
            const _ = e.versionvector_compare(this.__wbg_ptr, t.__wbg_ptr);
            return _ === 4294967297 ? void 0 : _;
        }
        setLast(t) {
            try {
                const r = e.__wbindgen_add_to_stack_pointer(-16);
                e.versionvector_setLast(r, this.__wbg_ptr, c(t));
                var _ = o().getInt32(r + 0, !0), n = o().getInt32(r + 4, !0);
                if (n) throw s(_);
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
        toJSON() {
            const t = e.versionvector_toJSON(this.__wbg_ptr);
            return s(t);
        }
        static parseJSON(t) {
            try {
                const i = e.__wbindgen_add_to_stack_pointer(-16);
                e.versionvector_parseJSON(i, c(t));
                var _ = o().getInt32(i + 0, !0), n = o().getInt32(i + 4, !0), r = o().getInt32(i + 8, !0);
                if (r) throw s(n);
                return S.__wrap(_);
            } finally{
                e.__wbindgen_add_to_stack_pointer(16);
            }
        }
    }
    function gt(a, t) {
        const _ = String(l(t)), n = u(_, e.__wbindgen_malloc, e.__wbindgen_realloc), r = w;
        o().setInt32(a + 4, r, !0), o().setInt32(a + 0, n, !0);
    }
    function lt() {
        return I(function(a, t, _) {
            const n = l(a).apply(l(t), l(_));
            return c(n);
        }, arguments);
    }
    function wt() {
        return I(function(a, t, _) {
            const n = Reflect.apply(l(a), l(t), l(_));
            return c(n);
        }, arguments);
    }
    function bt(a) {
        const t = l(a).buffer;
        return c(t);
    }
    function ut() {
        return I(function(a, t) {
            const _ = l(a).call(l(t));
            return c(_);
        }, arguments);
    }
    function pt() {
        return I(function(a, t, _) {
            const n = l(a).call(l(t), l(_));
            return c(n);
        }, arguments);
    }
    function ft() {
        return I(function(a, t, _, n) {
            const r = l(a).call(l(t), l(_), l(n));
            return c(r);
        }, arguments);
    }
    function ht() {
        return I(function(a, t, _, n, r) {
            const i = l(a).call(l(t), l(_), l(n), l(r));
            return c(i);
        }, arguments);
    }
    function vt(a) {
        const t = T.__wrap(a);
        return c(t);
    }
    function yt(a) {
        const t = l(a).crypto;
        return c(t);
    }
    function mt(a) {
        const t = F.__wrap(a);
        return c(t);
    }
    function It(a) {
        return l(a).done;
    }
    function kt(a) {
        const t = Object.entries(l(a));
        return c(t);
    }
    function xt(a) {
        const t = l(a).entries();
        return c(t);
    }
    function St(a, t) {
        let _, n;
        try {
            _ = a, n = t, console.error(f(a, t));
        } finally{
            e.__wbindgen_free(_, n, 1);
        }
    }
    function At(a, t) {
        console.error(f(a, t));
    }
    function Ct(a) {
        const t = Array.from(l(a));
        return c(t);
    }
    function Ot(a) {
        const t = Object.getOwnPropertySymbols(l(a));
        return c(t);
    }
    function Ft() {
        return I(function(a, t) {
            l(a).getRandomValues(l(t));
        }, arguments);
    }
    function Rt() {
        return I(function(a, t) {
            const _ = Reflect.get(l(a), l(t));
            return c(_);
        }, arguments);
    }
    function Dt(a, t) {
        const _ = l(a)[t >>> 0];
        return c(_);
    }
    function Nt(a, t) {
        return l(a)[t >>> 0];
    }
    function Et(a, t) {
        const _ = l(a)[l(t)];
        return c(_);
    }
    function Lt(a) {
        let t;
        try {
            t = l(a) instanceof ArrayBuffer;
        } catch  {
            t = !1;
        }
        return t;
    }
    function Tt(a) {
        let t;
        try {
            t = l(a) instanceof Map;
        } catch  {
            t = !1;
        }
        return t;
    }
    function Ut(a) {
        let t;
        try {
            t = l(a) instanceof Object;
        } catch  {
            t = !1;
        }
        return t;
    }
    function jt(a) {
        let t;
        try {
            t = l(a) instanceof Uint8Array;
        } catch  {
            t = !1;
        }
        return t;
    }
    function Vt(a) {
        return Array.isArray(l(a));
    }
    function Jt(a) {
        return Number.isSafeInteger(l(a));
    }
    function Mt() {
        return c(Symbol.iterator);
    }
    function zt(a) {
        return l(a).length;
    }
    function Pt(a) {
        return l(a).length;
    }
    function Bt(a, t, _, n, r, i, d, g) {
        let b, y;
        try {
            b = a, y = t, console.log(f(a, t), f(_, n), f(r, i), f(d, g));
        } finally{
            e.__wbindgen_free(b, y, 1);
        }
    }
    function Wt(a, t) {
        console.log(f(a, t));
    }
    function $t(a, t) {
        let _, n;
        try {
            _ = a, n = t, console.log(f(a, t));
        } finally{
            e.__wbindgen_free(_, n, 1);
        }
    }
    function qt(a) {
        const t = M.__wrap(a);
        return c(t);
    }
    function Ht(a) {
        const t = z.__wrap(a);
        return c(t);
    }
    function Gt(a) {
        const t = j.__wrap(a);
        return c(t);
    }
    function Kt(a) {
        const t = P.__wrap(a);
        return c(t);
    }
    function Qt(a) {
        const t = B.__wrap(a);
        return c(t);
    }
    function Xt(a) {
        const t = W.__wrap(a);
        return c(t);
    }
    function Yt(a) {
        const t = O.__wrap(a);
        return c(t);
    }
    function Zt(a, t) {
        performance.mark(f(a, t));
    }
    function te() {
        return I(function(a, t, _, n) {
            let r, i, d, g;
            try {
                r = a, i = t, d = _, g = n, performance.measure(f(a, t), f(_, n));
            } finally{
                e.__wbindgen_free(r, i, 1), e.__wbindgen_free(d, g, 1);
            }
        }, arguments);
    }
    function ee(a) {
        const t = l(a).msCrypto;
        return c(t);
    }
    function _e() {
        const a = new Object;
        return c(a);
    }
    function re() {
        return c(new Map);
    }
    function ne() {
        const a = new Array;
        return c(a);
    }
    function oe() {
        const a = new Error;
        return c(a);
    }
    function ie(a) {
        const t = new Uint8Array(l(a));
        return c(t);
    }
    function ae(a, t) {
        const _ = new Function(f(a, t));
        return c(_);
    }
    function se(a, t, _) {
        const n = new Uint8Array(l(a), t >>> 0, _ >>> 0);
        return c(n);
    }
    function de(a) {
        const t = new Uint8Array(a >>> 0);
        return c(t);
    }
    function ce(a) {
        const t = new Array(a >>> 0);
        return c(t);
    }
    function ge(a) {
        const t = l(a).next;
        return c(t);
    }
    function le() {
        return I(function(a) {
            const t = l(a).next();
            return c(t);
        }, arguments);
    }
    function we(a) {
        const t = l(a).node;
        return c(t);
    }
    function be() {
        return Date.now();
    }
    function ue() {
        return I(function(a) {
            const t = Reflect.ownKeys(l(a));
            return c(t);
        }, arguments);
    }
    function pe(a) {
        const t = l(a).process;
        return c(t);
    }
    function fe(a, t) {
        return l(a).push(l(t));
    }
    function he() {
        return I(function(a, t) {
            l(a).randomFillSync(s(t));
        }, arguments);
    }
    function ve() {
        return I(function() {
            const a = module.require;
            return c(a);
        }, arguments);
    }
    function ye(a) {
        const t = Promise.resolve(l(a));
        return c(t);
    }
    function me(a, t, _) {
        l(a)[t >>> 0] = s(_);
    }
    function Ie(a, t, _) {
        l(a)[s(t)] = s(_);
    }
    function ke(a, t, _) {
        l(a).set(l(t), _ >>> 0);
    }
    function xe(a, t, _) {
        const n = l(a).set(l(t), l(_));
        return c(n);
    }
    function Se() {
        return I(function(a, t, _) {
            return Reflect.set(l(a), l(t), l(_));
        }, arguments);
    }
    function Ae(a, t, _) {
        l(a)[t >>> 0] = _;
    }
    function Ce(a, t) {
        const _ = l(t).stack, n = u(_, e.__wbindgen_malloc, e.__wbindgen_realloc), r = w;
        o().setInt32(a + 4, r, !0), o().setInt32(a + 0, n, !0);
    }
    function Oe() {
        const a = typeof global > "u" ? null : global;
        return v(a) ? 0 : c(a);
    }
    function Fe() {
        const a = typeof globalThis > "u" ? null : globalThis;
        return v(a) ? 0 : c(a);
    }
    function Re() {
        const a = typeof self > "u" ? null : self;
        return v(a) ? 0 : c(a);
    }
    function De() {
        const a = typeof window > "u" ? null : window;
        return v(a) ? 0 : c(a);
    }
    function Ne(a, t, _) {
        const n = l(a).subarray(t >>> 0, _ >>> 0);
        return c(n);
    }
    function Ee(a, t) {
        const _ = l(a).then(l(t));
        return c(_);
    }
    function Le(a) {
        const t = l(a).value;
        return c(t);
    }
    function Te(a) {
        const t = l(a).versions;
        return c(t);
    }
    function Ue(a) {
        const t = S.__wrap(a);
        return c(t);
    }
    function je(a, t) {
        console.warn(f(a, t));
    }
    function Ve(a) {
        return +l(a);
    }
    function Je(a) {
        return c(a);
    }
    function Me(a) {
        const t = BigInt.asUintN(64, a);
        return c(t);
    }
    function ze(a, t) {
        const _ = l(t), n = typeof _ == "bigint" ? _ : void 0;
        o().setBigInt64(a + 8, v(n) ? BigInt(0) : n, !0), o().setInt32(a + 0, !v(n), !0);
    }
    function Pe(a) {
        const t = l(a);
        return typeof t == "boolean" ? t ? 1 : 0 : 2;
    }
    function Be(a) {
        const t = s(a).original;
        return t.cnt-- == 1 ? (t.a = 0, !0) : !1;
    }
    function We(a, t, _) {
        const n = ct(a, t, 10, N_);
        return c(n);
    }
    function $e(a, t, _) {
        const n = ct(a, t, 10, E_);
        return c(n);
    }
    function qe(a, t) {
        const _ = et(l(t)), n = u(_, e.__wbindgen_malloc, e.__wbindgen_realloc), r = w;
        o().setInt32(a + 4, r, !0), o().setInt32(a + 0, n, !0);
    }
    function He(a, t) {
        const _ = new Error(f(a, t));
        return c(_);
    }
    function Ge(a, t) {
        return l(a) in l(t);
    }
    function Ke(a) {
        return Array.isArray(l(a));
    }
    function Qe(a) {
        return typeof l(a) == "bigint";
    }
    function Xe(a) {
        return !l(a);
    }
    function Ye(a) {
        return typeof l(a) == "function";
    }
    function Ze(a) {
        return l(a) === null;
    }
    function t_(a) {
        const t = l(a);
        return typeof t == "object" && t !== null;
    }
    function e_(a) {
        return typeof l(a) == "string";
    }
    function __(a) {
        return l(a) === void 0;
    }
    function r_(a, t) {
        return l(a) === l(t);
    }
    function n_(a, t) {
        return l(a) == l(t);
    }
    function o_() {
        const a = e.memory;
        return c(a);
    }
    function i_(a, t) {
        const _ = l(t), n = typeof _ == "number" ? _ : void 0;
        o().setFloat64(a + 8, v(n) ? 0 : n, !0), o().setInt32(a + 0, !v(n), !0);
    }
    function a_(a) {
        return c(a);
    }
    function s_(a) {
        const t = l(a);
        return c(t);
    }
    function d_(a) {
        s(a);
    }
    function c_(a) {
        throw s(a);
    }
    function g_(a, t) {
        const _ = l(t), n = typeof _ == "string" ? _ : void 0;
        var r = v(n) ? 0 : u(n, e.__wbindgen_malloc, e.__wbindgen_realloc), i = w;
        o().setInt32(a + 4, i, !0), o().setInt32(a + 0, r, !0);
    }
    function l_(a, t) {
        const _ = f(a, t);
        return c(_);
    }
    function w_(a, t) {
        throw new Error(f(a, t));
    }
    function b_(a) {
        const t = typeof l(a);
        return c(t);
    }
    Bs = Object.freeze(Object.defineProperty({
        __proto__: null,
        AwarenessWasm: L_,
        ChangeModifier: T,
        Cursor: F,
        EphemeralStoreWasm: T_,
        LORO_VERSION: O_,
        LoroCounter: M,
        LoroDoc: N,
        LoroList: z,
        LoroMap: j,
        LoroMovableList: P,
        LoroText: B,
        LoroTree: W,
        LoroTreeNode: O,
        UndoManager: U_,
        VersionVector: S,
        __wbg_String_8f0eb39a4a4c2f66: gt,
        __wbg_apply_36be6a55257c99bf: lt,
        __wbg_apply_eb9e9b97497f91e4: wt,
        __wbg_buffer_609cc3eee51ed158: bt,
        __wbg_call_672a4d21634d4a24: ut,
        __wbg_call_7cccdd69e0791ae2: pt,
        __wbg_call_833bed5770ea2041: ft,
        __wbg_call_b8adc8b1d0a0d8eb: ht,
        __wbg_changemodifier_new: vt,
        __wbg_crypto_574e78ad8b13b65f: yt,
        __wbg_cursor_new: mt,
        __wbg_done_769e5ede4b31c67b: It,
        __wbg_entries_3265d4158b33e5dc: kt,
        __wbg_entries_c8a90a7ed73e84ce: xt,
        __wbg_error_7534b8e9a36f1ab4: St,
        __wbg_error_fd027616b8006afa: At,
        __wbg_from_2a5d3e218e67aa85: Ct,
        __wbg_getOwnPropertySymbols_97eebed6fe6e08be: Ot,
        __wbg_getRandomValues_b8f5dbd5f3995a9e: Ft,
        __wbg_get_67b2ba62fc30de12: Rt,
        __wbg_get_b9b93047fe3cf45b: Dt,
        __wbg_getindex_5b00c274b05714aa: Nt,
        __wbg_getwithrefkey_1dc361bd10053bfe: Et,
        __wbg_instanceof_ArrayBuffer_e14585432e3737fc: Lt,
        __wbg_instanceof_Map_f3469ce2244d2430: Tt,
        __wbg_instanceof_Object_7f2dcef8f78644a4: Ut,
        __wbg_instanceof_Uint8Array_17156bcf118086a9: jt,
        __wbg_isArray_a1eab7e0d067391b: Vt,
        __wbg_isSafeInteger_343e2beeeece1bb0: Jt,
        __wbg_iterator_9a24c88df860dc65: Mt,
        __wbg_length_a446193dc22c12f8: zt,
        __wbg_length_e2d2a49132c1b256: Pt,
        __wbg_log_0cc1b7768397bcfe: Bt,
        __wbg_log_62fc5f7c674bfa10: Wt,
        __wbg_log_cb9e190acc5753fb: $t,
        __wbg_lorocounter_new: qt,
        __wbg_lorolist_new: Ht,
        __wbg_loromap_new: Gt,
        __wbg_loromovablelist_new: Kt,
        __wbg_lorotext_new: Qt,
        __wbg_lorotree_new: Xt,
        __wbg_lorotreenode_new: Yt,
        __wbg_mark_7438147ce31e9d4b: Zt,
        __wbg_measure_fb7825c11612c823: te,
        __wbg_msCrypto_a61aeb35a24c1329: ee,
        __wbg_new_405e22f390576ce2: _e,
        __wbg_new_5e0be73521bc8c17: re,
        __wbg_new_78feb108b6472713: ne,
        __wbg_new_8a6f238a6ece86ea: oe,
        __wbg_new_a12002a7f91c75be: ie,
        __wbg_newnoargs_105ed471475aaf50: ae,
        __wbg_newwithbyteoffsetandlength_d97e637ebe145a9a: se,
        __wbg_newwithlength_a381634e90c276d4: de,
        __wbg_newwithlength_c4c419ef0bc8a1f8: ce,
        __wbg_next_25feadfc0913fea9: ge,
        __wbg_next_6574e1a8a62d1055: le,
        __wbg_node_905d3e251edff8a2: we,
        __wbg_now_6727e3e536e11536: be,
        __wbg_ownKeys_3930041068756f1f: ue,
        __wbg_process_dc0fbacc7c1c06f7: pe,
        __wbg_push_737cfc8c1432c2c6: fe,
        __wbg_randomFillSync_ac0988aba3254290: he,
        __wbg_require_60cc747a6bc5215a: ve,
        __wbg_resolve_4851785c9c5f573d: ye,
        __wbg_set_37837023f3d740e8: me,
        __wbg_set_3f1d0b984ed272ed: Ie,
        __wbg_set_65595bdd868b3009: ke,
        __wbg_set_8fc6bf8a5b1071d1: xe,
        __wbg_set_bb8cecf6a62b9f46: Se,
        __wbg_set_wasm: v_,
        __wbg_setindex_dcd71eabf405bde1: Ae,
        __wbg_stack_0ed75d68575b0f3c: Ce,
        __wbg_static_accessor_GLOBAL_88a902d13a557d07: Oe,
        __wbg_static_accessor_GLOBAL_THIS_56578be7e9f832b0: Fe,
        __wbg_static_accessor_SELF_37c5d418e4bf5819: Re,
        __wbg_static_accessor_WINDOW_5de37043a91a9c40: De,
        __wbg_subarray_aa9065fa9dc5df96: Ne,
        __wbg_then_44b73946d2fb3e7d: Ee,
        __wbg_value_cd1ffa7b1ab794f1: Le,
        __wbg_versions_c01dfd4722a88165: Te,
        __wbg_versionvector_new: Ue,
        __wbg_warn_5cdab1103c5473b2: je,
        __wbindgen_as_number: Ve,
        __wbindgen_bigint_from_i64: Je,
        __wbindgen_bigint_from_u64: Me,
        __wbindgen_bigint_get_as_i64: ze,
        __wbindgen_boolean_get: Pe,
        __wbindgen_cb_drop: Be,
        __wbindgen_closure_wrapper746: We,
        __wbindgen_closure_wrapper748: $e,
        __wbindgen_debug_string: qe,
        __wbindgen_error_new: He,
        __wbindgen_in: Ge,
        __wbindgen_is_array: Ke,
        __wbindgen_is_bigint: Qe,
        __wbindgen_is_falsy: Xe,
        __wbindgen_is_function: Ye,
        __wbindgen_is_null: Ze,
        __wbindgen_is_object: t_,
        __wbindgen_is_string: e_,
        __wbindgen_is_undefined: __,
        __wbindgen_jsval_eq: r_,
        __wbindgen_jsval_loose_eq: n_,
        __wbindgen_memory: o_,
        __wbindgen_number_get: i_,
        __wbindgen_number_new: a_,
        __wbindgen_object_clone_ref: s_,
        __wbindgen_object_drop_ref: d_,
        __wbindgen_rethrow: c_,
        __wbindgen_string_get: g_,
        __wbindgen_string_new: l_,
        __wbindgen_throw: w_,
        __wbindgen_typeof: b_,
        callPendingEvents: R_,
        decodeFrontiers: S_,
        decodeImportBlobMeta: C_,
        encodeFrontiers: A_,
        redactJsonUpdates: x_,
        run: F_,
        setDebug: D_
    }, Symbol.toStringTag, {
        value: "Module"
    }));
    URL = globalThis.URL;
    let j_, V_, J_, M_, z_, P_, B_, W_, $_, q_, H_, G_, K_, Q_, X_, Y_, Z_, tr, er, _r, rr, nr, or, ir, ar, sr, dr, cr, gr, lr, wr, br, ur, pr, fr, hr, vr, yr, mr, Ir, kr, xr, Sr, Ar, Cr, Or, Fr, Rr, Dr, Nr, Er, Lr, Tr, Ur, jr, Vr, Jr, Mr, zr, Pr, Br, Wr, $r, qr, Hr, Gr, Kr, Qr, Xr, Yr, Zr, tn, en, _n, rn, nn, on, an, sn, dn, cn, gn, ln, wn, bn, un, pn, fn, hn, vn, yn, mn, In, kn, xn, Sn, An, Cn, On, Fn, Rn, Dn, Nn, En, Ln, Tn, Un, jn, Vn, Jn, Mn, zn, Pn, Bn, Wn, $n, qn, Hn, Gn, Kn, Qn, Xn, Yn, Zn, to, eo, _o, ro, no, oo, io, ao, so, co, go, lo, wo, bo, uo, po, fo, ho, vo, yo, mo, Io, ko, xo, So, Ao, Co, Oo, Fo, Ro, Do, No, Eo, Lo, To, Uo, jo, Vo, Jo, Mo, zo, Po, Bo, Wo, $o, qo, Ho, Go, Ko, Qo, Xo, Yo, Zo, ti, ei, _i, ri, ni, oi, ii, ai, si, di, ci, gi, li, wi, bi, ui, pi, fi, hi, vi, yi, mi, Ii, ki, xi, Si, Ai, Ci, Oi, Fi, Ri, Di, Ni, Ei, Li, Ti, Ui, ji, Vi, Ji, Mi, zi, Pi, Bi, Wi, $i, qi, Hi, Gi, Ki, Qi, Xi, Yi, Zi, ta, ea, _a, ra, na, oa, ia, aa, sa, da, ca, ga, la, wa, ba, ua, pa, fa, ha, va, ya, ma, Ia, ka, xa, Sa, Aa, Ca, Oa, Fa, Ra, Da, Na, Ea, La, Ta, Ua, ja, Va, Ja, Ma, za, Pa, Ba, Wa, $a, qa, Ha, Ga, Ka, Qa, Xa, Ya, Za, ts, es, _s, rs, ns, os, is, as, ss, ds, cs, gs, ls, ws, bs, us, ps, fs, hs, vs, ys, ms, Is, ks, xs, Ss, As, Cs, Os, Fs, Rs, Ds, Ns, Es, Ls, Ts, Us, js, Vs, Js, Ms, zs, Ps;
    j_ = await h_({
        "./loro_wasm_bg.js": {
            __wbindgen_object_drop_ref: d_,
            __wbg_lorotext_new: Qt,
            __wbg_lorotreenode_new: Yt,
            __wbg_lorotree_new: Xt,
            __wbg_lorolist_new: Ht,
            __wbg_loromap_new: Gt,
            __wbg_cursor_new: mt,
            __wbg_loromovablelist_new: Kt,
            __wbg_lorocounter_new: qt,
            __wbg_changemodifier_new: vt,
            __wbg_versionvector_new: Ue,
            __wbindgen_is_function: Ye,
            __wbindgen_number_get: i_,
            __wbindgen_string_get: g_,
            __wbindgen_string_new: l_,
            __wbindgen_boolean_get: Pe,
            __wbindgen_error_new: He,
            __wbindgen_object_clone_ref: s_,
            __wbg_error_fd027616b8006afa: At,
            __wbindgen_cb_drop: Be,
            __wbindgen_is_undefined: __,
            __wbindgen_in: Ge,
            __wbindgen_is_bigint: Qe,
            __wbindgen_bigint_from_i64: Je,
            __wbindgen_jsval_eq: r_,
            __wbindgen_is_object: t_,
            __wbindgen_bigint_from_u64: Me,
            __wbindgen_as_number: Ve,
            __wbindgen_number_new: a_,
            __wbindgen_is_string: e_,
            __wbindgen_is_null: Ze,
            __wbindgen_is_falsy: Xe,
            __wbindgen_typeof: b_,
            __wbg_warn_5cdab1103c5473b2: je,
            __wbg_log_62fc5f7c674bfa10: Wt,
            __wbindgen_is_array: Ke,
            __wbg_log_cb9e190acc5753fb: $t,
            __wbg_log_0cc1b7768397bcfe: Bt,
            __wbg_mark_7438147ce31e9d4b: Zt,
            __wbg_measure_fb7825c11612c823: te,
            __wbg_new_8a6f238a6ece86ea: oe,
            __wbg_stack_0ed75d68575b0f3c: Ce,
            __wbg_error_7534b8e9a36f1ab4: St,
            __wbindgen_jsval_loose_eq: n_,
            __wbg_getwithrefkey_1dc361bd10053bfe: Et,
            __wbg_set_3f1d0b984ed272ed: Ie,
            __wbg_String_8f0eb39a4a4c2f66: gt,
            __wbg_now_6727e3e536e11536: be,
            __wbg_crypto_574e78ad8b13b65f: yt,
            __wbg_process_dc0fbacc7c1c06f7: pe,
            __wbg_versions_c01dfd4722a88165: Te,
            __wbg_node_905d3e251edff8a2: we,
            __wbg_require_60cc747a6bc5215a: ve,
            __wbg_msCrypto_a61aeb35a24c1329: ee,
            __wbg_randomFillSync_ac0988aba3254290: he,
            __wbg_getRandomValues_b8f5dbd5f3995a9e: Ft,
            __wbg_new_5e0be73521bc8c17: re,
            __wbg_new_78feb108b6472713: ne,
            __wbg_new_405e22f390576ce2: _e,
            __wbg_newnoargs_105ed471475aaf50: ae,
            __wbg_new_a12002a7f91c75be: ie,
            __wbg_buffer_609cc3eee51ed158: bt,
            __wbg_newwithbyteoffsetandlength_d97e637ebe145a9a: se,
            __wbg_length_a446193dc22c12f8: zt,
            __wbg_newwithlength_a381634e90c276d4: de,
            __wbg_set_65595bdd868b3009: ke,
            __wbg_subarray_aa9065fa9dc5df96: Ne,
            __wbg_getindex_5b00c274b05714aa: Nt,
            __wbg_setindex_dcd71eabf405bde1: Ae,
            __wbg_done_769e5ede4b31c67b: It,
            __wbg_value_cd1ffa7b1ab794f1: Le,
            __wbg_instanceof_Map_f3469ce2244d2430: Tt,
            __wbg_instanceof_Object_7f2dcef8f78644a4: Ut,
            __wbg_instanceof_Uint8Array_17156bcf118086a9: jt,
            __wbg_instanceof_ArrayBuffer_e14585432e3737fc: Lt,
            __wbg_set_8fc6bf8a5b1071d1: xe,
            __wbg_entries_c8a90a7ed73e84ce: xt,
            __wbg_newwithlength_c4c419ef0bc8a1f8: ce,
            __wbg_get_b9b93047fe3cf45b: Dt,
            __wbg_set_37837023f3d740e8: me,
            __wbg_from_2a5d3e218e67aa85: Ct,
            __wbg_length_e2d2a49132c1b256: Pt,
            __wbg_push_737cfc8c1432c2c6: fe,
            __wbg_isArray_a1eab7e0d067391b: Vt,
            __wbg_isSafeInteger_343e2beeeece1bb0: Jt,
            __wbg_getOwnPropertySymbols_97eebed6fe6e08be: Ot,
            __wbg_entries_3265d4158b33e5dc: kt,
            __wbg_iterator_9a24c88df860dc65: Mt,
            __wbg_static_accessor_GLOBAL_THIS_56578be7e9f832b0: Fe,
            __wbg_call_672a4d21634d4a24: ut,
            __wbg_static_accessor_SELF_37c5d418e4bf5819: Re,
            __wbg_static_accessor_GLOBAL_88a902d13a557d07: Oe,
            __wbg_static_accessor_WINDOW_5de37043a91a9c40: De,
            __wbg_then_44b73946d2fb3e7d: Ee,
            __wbg_resolve_4851785c9c5f573d: ye,
            __wbg_get_67b2ba62fc30de12: Rt,
            __wbg_set_bb8cecf6a62b9f46: Se,
            __wbg_apply_eb9e9b97497f91e4: wt,
            __wbg_ownKeys_3930041068756f1f: ue,
            __wbg_apply_36be6a55257c99bf: lt,
            __wbg_call_7cccdd69e0791ae2: pt,
            __wbg_call_833bed5770ea2041: ft,
            __wbg_call_b8adc8b1d0a0d8eb: ht,
            __wbg_next_25feadfc0913fea9: ge,
            __wbg_next_6574e1a8a62d1055: le,
            __wbindgen_bigint_get_as_i64: ze,
            __wbindgen_memory: o_,
            __wbindgen_throw: w_,
            __wbindgen_rethrow: c_,
            __wbindgen_debug_string: qe,
            __wbindgen_closure_wrapper746: We,
            __wbindgen_closure_wrapper748: $e
        }
    }, f_);
    ({ memory: V_, LORO_VERSION: J_, __wbg_awarenesswasm_free: M_, __wbg_changemodifier_free: z_, __wbg_cursor_free: P_, __wbg_ephemeralstorewasm_free: B_, __wbg_lorocounter_free: W_, __wbg_lorodoc_free: $_, __wbg_lorolist_free: q_, __wbg_loromap_free: H_, __wbg_lorotext_free: G_, __wbg_lorotree_free: K_, __wbg_lorotreenode_free: Q_, __wbg_undomanager_free: X_, __wbg_versionvector_free: Y_, awarenesswasm_apply: Z_, awarenesswasm_encode: tr, awarenesswasm_encodeAll: er, awarenesswasm_getAllStates: _r, awarenesswasm_getState: rr, awarenesswasm_getTimestamp: nr, awarenesswasm_isEmpty: or, awarenesswasm_length: ir, awarenesswasm_new: ar, awarenesswasm_peer: sr, awarenesswasm_peers: dr, awarenesswasm_removeOutdated: cr, awarenesswasm_setLocalState: gr, callPendingEvents: lr, changemodifier_setMessage: wr, changemodifier_setTimestamp: br, cursor_containerId: ur, cursor_decode: pr, cursor_encode: fr, cursor_kind: hr, cursor_pos: vr, cursor_side: yr, decodeFrontiers: mr, decodeImportBlobMeta: Ir, encodeFrontiers: kr, ephemeralstorewasm_apply: xr, ephemeralstorewasm_delete: Sr, ephemeralstorewasm_encode: Ar, ephemeralstorewasm_encodeAll: Cr, ephemeralstorewasm_get: Or, ephemeralstorewasm_getAllStates: Fr, ephemeralstorewasm_isEmpty: Rr, ephemeralstorewasm_keys: Dr, ephemeralstorewasm_new: Nr, ephemeralstorewasm_removeOutdated: Er, ephemeralstorewasm_set: Lr, ephemeralstorewasm_subscribe: Tr, ephemeralstorewasm_subscribeLocalUpdates: Ur, lorocounter_decrement: jr, lorocounter_getAttached: Vr, lorocounter_getShallowValue: Jr, lorocounter_id: Mr, lorocounter_increment: zr, lorocounter_isAttached: Pr, lorocounter_kind: Br, lorocounter_new: Wr, lorocounter_parent: $r, lorocounter_subscribe: qr, lorodoc_JSONPath: Hr, lorodoc_applyDiff: Gr, lorodoc_attach: Kr, lorodoc_changeCount: Qr, lorodoc_checkout: Xr, lorodoc_checkoutToLatest: Yr, lorodoc_clearNextCommitOptions: Zr, lorodoc_cmpFrontiers: tn, lorodoc_cmpWithFrontiers: en, lorodoc_commit: _n, lorodoc_configDefaultTextStyle: rn, lorodoc_configTextStyle: nn, lorodoc_debugHistory: on, lorodoc_deleteRootContainer: an, lorodoc_detach: sn, lorodoc_diff: dn, lorodoc_export: cn, lorodoc_exportJsonInIdSpan: gn, lorodoc_exportJsonUpdates: ln, lorodoc_findIdSpansBetween: wn, lorodoc_fork: bn, lorodoc_forkAt: un, lorodoc_fromSnapshot: pn, lorodoc_frontiers: fn, lorodoc_frontiersToVV: hn, lorodoc_getAllChanges: vn, lorodoc_getByPath: yn, lorodoc_getChangeAt: mn, lorodoc_getChangeAtLamport: In, lorodoc_getChangedContainersIn: kn, lorodoc_getContainerById: xn, lorodoc_getCounter: Sn, lorodoc_getCursorPos: An, lorodoc_getDeepValueWithID: Cn, lorodoc_getList: On, lorodoc_getMap: Fn, lorodoc_getMovableList: Rn, lorodoc_getOpsInChange: Dn, lorodoc_getPathToContainer: Nn, lorodoc_getPendingTxnLength: En, lorodoc_getShallowValue: Ln, lorodoc_getText: Tn, lorodoc_getTree: Un, lorodoc_getUncommittedOpsAsJson: jn, lorodoc_hasContainer: Vn, lorodoc_import: Jn, lorodoc_importBatch: Mn, lorodoc_importJsonUpdates: zn, lorodoc_isDetached: Pn, lorodoc_isDetachedEditingEnabled: Bn, lorodoc_isShallow: Wn, lorodoc_new: $n, lorodoc_opCount: qn, lorodoc_oplogFrontiers: Hn, lorodoc_oplogVersion: Gn, lorodoc_peerId: Kn, lorodoc_peerIdStr: Qn, lorodoc_revertTo: Xn, lorodoc_setChangeMergeInterval: Yn, lorodoc_setDetachedEditing: Zn, lorodoc_setHideEmptyRootContainers: to, lorodoc_setNextCommitMessage: eo, lorodoc_setNextCommitOptions: _o, lorodoc_setNextCommitOrigin: ro, lorodoc_setNextCommitTimestamp: no, lorodoc_setPeerId: oo, lorodoc_setRecordTimestamp: io, lorodoc_shallowSinceFrontiers: ao, lorodoc_shallowSinceVV: so, lorodoc_subscribe: co, lorodoc_subscribeFirstCommitFromPeer: go, lorodoc_subscribeJsonpath: lo, lorodoc_subscribeLocalUpdates: wo, lorodoc_subscribePreCommit: bo, lorodoc_toJSON: uo, lorodoc_travelChangeAncestors: po, lorodoc_version: fo, lorodoc_vvToFrontiers: ho, lorolist_clear: vo, lorolist_delete: yo, lorolist_get: mo, lorolist_getAttached: Io, lorolist_getCursor: ko, lorolist_getIdAt: xo, lorolist_getShallowValue: So, lorolist_id: Ao, lorolist_insert: Co, lorolist_insertContainer: Oo, lorolist_isAttached: Fo, lorolist_isDeleted: Ro, lorolist_kind: Do, lorolist_length: No, lorolist_new: Eo, lorolist_parent: Lo, lorolist_pop: To, lorolist_push: Uo, lorolist_pushContainer: jo, lorolist_subscribe: Vo, lorolist_toArray: Jo, lorolist_toJSON: Mo, loromap_clear: zo, loromap_delete: Po, loromap_entries: Bo, loromap_get: Wo, loromap_getAttached: $o, loromap_getLastEditor: qo, loromap_getOrCreateContainer: Ho, loromap_getShallowValue: Go, loromap_id: Ko, loromap_isAttached: Qo, loromap_isDeleted: Xo, loromap_keys: Yo, loromap_kind: Zo, loromap_new: ti, loromap_parent: ei, loromap_set: _i, loromap_setContainer: ri, loromap_size: ni, loromap_subscribe: oi, loromap_toJSON: ii, loromap_values: ai, loromovablelist_clear: si, loromovablelist_delete: di, loromovablelist_get: ci, loromovablelist_getAttached: gi, loromovablelist_getCreatorAt: li, loromovablelist_getCursor: wi, loromovablelist_getLastEditorAt: bi, loromovablelist_getLastMoverAt: ui, loromovablelist_getShallowValue: pi, loromovablelist_id: fi, loromovablelist_insert: hi, loromovablelist_insertContainer: vi, loromovablelist_isAttached: yi, loromovablelist_isDeleted: mi, loromovablelist_kind: Ii, loromovablelist_length: ki, loromovablelist_move: xi, loromovablelist_new: Si, loromovablelist_parent: Ai, loromovablelist_pop: Ci, loromovablelist_push: Oi, loromovablelist_pushContainer: Fi, loromovablelist_set: Ri, loromovablelist_setContainer: Di, loromovablelist_subscribe: Ni, loromovablelist_toArray: Ei, loromovablelist_toJSON: Li, lorotext_applyDelta: Ti, lorotext_charAt: Ui, lorotext_convertPos: ji, lorotext_delete: Vi, lorotext_deleteUtf8: Ji, lorotext_getAttached: Mi, lorotext_getCursor: zi, lorotext_getEditorOf: Pi, lorotext_getShallowValue: Bi, lorotext_id: Wi, lorotext_insert: $i, lorotext_insertUtf8: qi, lorotext_isAttached: Hi, lorotext_isDeleted: Gi, lorotext_iter: Ki, lorotext_kind: Qi, lorotext_length: Xi, lorotext_mark: Yi, lorotext_new: Zi, lorotext_parent: ta, lorotext_push: ea, lorotext_slice: _a, lorotext_sliceDelta: ra, lorotext_sliceDeltaUtf8: na, lorotext_splice: oa, lorotext_subscribe: ia, lorotext_toDelta: aa, lorotext_toJSON: sa, lorotext_toString: da, lorotext_unmark: ca, lorotext_update: ga, lorotext_updateByLine: la, lorotree_createNode: wa, lorotree_delete: ba, lorotree_disableFractionalIndex: ua, lorotree_enableFractionalIndex: pa, lorotree_getAttached: fa, lorotree_getNodeByID: ha, lorotree_getNodes: va, lorotree_getShallowValue: ya, lorotree_has: ma, lorotree_id: Ia, lorotree_isAttached: ka, lorotree_isDeleted: xa, lorotree_isFractionalIndexEnabled: Sa, lorotree_isNodeDeleted: Aa, lorotree_kind: Ca, lorotree_move: Oa, lorotree_new: Fa, lorotree_nodes: Ra, lorotree_parent: Da, lorotree_roots: Na, lorotree_subscribe: Ea, lorotree_toArray: La, lorotree_toJSON: Ta, lorotreenode___getClassname: Ua, lorotreenode_children: ja, lorotreenode_createNode: Va, lorotreenode_creationId: Ja, lorotreenode_creator: Ma, lorotreenode_data: za, lorotreenode_fractionalIndex: Pa, lorotreenode_getLastMoveId: Ba, lorotreenode_id: Wa, lorotreenode_index: $a, lorotreenode_isDeleted: qa, lorotreenode_move: Ha, lorotreenode_moveAfter: Ga, lorotreenode_moveBefore: Ka, lorotreenode_parent: Qa, lorotreenode_toJSON: Xa, redactJsonUpdates: Ya, run: Za, setDebug: ts, undomanager_addExcludeOriginPrefix: es, undomanager_canRedo: _s, undomanager_canUndo: rs, undomanager_clear: ns, undomanager_clearRedo: os, undomanager_clearUndo: is, undomanager_groupEnd: as, undomanager_groupStart: ss, undomanager_new: ds, undomanager_peer: cs, undomanager_redo: gs, undomanager_setMaxUndoSteps: ls, undomanager_setMergeInterval: ws, undomanager_setOnPop: bs, undomanager_setOnPush: us, undomanager_topRedoValue: ps, undomanager_topUndoValue: fs, undomanager_undo: hs, versionvector_compare: vs, versionvector_decode: ys, versionvector_encode: ms, versionvector_get: Is, versionvector_length: ks, versionvector_new: xs, versionvector_parseJSON: Ss, versionvector_remove: As, versionvector_setEnd: Cs, versionvector_setLast: Os, versionvector_toJSON: Fs, lorodoc_importUpdateBatch: Rs, __wbg_loromovablelist_free: Ds, lorocounter_toJSON: Ns, lorocounter_value: Es, __wbindgen_malloc: Ls, __wbindgen_realloc: Ts, __wbindgen_exn_store: Us, __wbindgen_free: js, __wbindgen_export_4: Vs, __wbindgen_add_to_stack_pointer: Js, _dyn_core__ops__function__FnMut__A____Output___R_as_wasm_bindgen__closure__WasmClosure___describe__invoke__h23bd7b34cf0bced7: Ms, _dyn_core__ops__function__FnMut_____Output___R_as_wasm_bindgen__closure__WasmClosure___describe__invoke__hd82b624f21a7fa96: zs, __wbindgen_start: Ps } = j_);
    Ws = Object.freeze(Object.defineProperty({
        __proto__: null,
        LORO_VERSION: J_,
        __wbg_awarenesswasm_free: M_,
        __wbg_changemodifier_free: z_,
        __wbg_cursor_free: P_,
        __wbg_ephemeralstorewasm_free: B_,
        __wbg_lorocounter_free: W_,
        __wbg_lorodoc_free: $_,
        __wbg_lorolist_free: q_,
        __wbg_loromap_free: H_,
        __wbg_loromovablelist_free: Ds,
        __wbg_lorotext_free: G_,
        __wbg_lorotree_free: K_,
        __wbg_lorotreenode_free: Q_,
        __wbg_undomanager_free: X_,
        __wbg_versionvector_free: Y_,
        __wbindgen_add_to_stack_pointer: Js,
        __wbindgen_exn_store: Us,
        __wbindgen_export_4: Vs,
        __wbindgen_free: js,
        __wbindgen_malloc: Ls,
        __wbindgen_realloc: Ts,
        __wbindgen_start: Ps,
        _dyn_core__ops__function__FnMut__A____Output___R_as_wasm_bindgen__closure__WasmClosure___describe__invoke__h23bd7b34cf0bced7: Ms,
        _dyn_core__ops__function__FnMut_____Output___R_as_wasm_bindgen__closure__WasmClosure___describe__invoke__hd82b624f21a7fa96: zs,
        awarenesswasm_apply: Z_,
        awarenesswasm_encode: tr,
        awarenesswasm_encodeAll: er,
        awarenesswasm_getAllStates: _r,
        awarenesswasm_getState: rr,
        awarenesswasm_getTimestamp: nr,
        awarenesswasm_isEmpty: or,
        awarenesswasm_length: ir,
        awarenesswasm_new: ar,
        awarenesswasm_peer: sr,
        awarenesswasm_peers: dr,
        awarenesswasm_removeOutdated: cr,
        awarenesswasm_setLocalState: gr,
        callPendingEvents: lr,
        changemodifier_setMessage: wr,
        changemodifier_setTimestamp: br,
        cursor_containerId: ur,
        cursor_decode: pr,
        cursor_encode: fr,
        cursor_kind: hr,
        cursor_pos: vr,
        cursor_side: yr,
        decodeFrontiers: mr,
        decodeImportBlobMeta: Ir,
        encodeFrontiers: kr,
        ephemeralstorewasm_apply: xr,
        ephemeralstorewasm_delete: Sr,
        ephemeralstorewasm_encode: Ar,
        ephemeralstorewasm_encodeAll: Cr,
        ephemeralstorewasm_get: Or,
        ephemeralstorewasm_getAllStates: Fr,
        ephemeralstorewasm_isEmpty: Rr,
        ephemeralstorewasm_keys: Dr,
        ephemeralstorewasm_new: Nr,
        ephemeralstorewasm_removeOutdated: Er,
        ephemeralstorewasm_set: Lr,
        ephemeralstorewasm_subscribe: Tr,
        ephemeralstorewasm_subscribeLocalUpdates: Ur,
        lorocounter_decrement: jr,
        lorocounter_getAttached: Vr,
        lorocounter_getShallowValue: Jr,
        lorocounter_id: Mr,
        lorocounter_increment: zr,
        lorocounter_isAttached: Pr,
        lorocounter_kind: Br,
        lorocounter_new: Wr,
        lorocounter_parent: $r,
        lorocounter_subscribe: qr,
        lorocounter_toJSON: Ns,
        lorocounter_value: Es,
        lorodoc_JSONPath: Hr,
        lorodoc_applyDiff: Gr,
        lorodoc_attach: Kr,
        lorodoc_changeCount: Qr,
        lorodoc_checkout: Xr,
        lorodoc_checkoutToLatest: Yr,
        lorodoc_clearNextCommitOptions: Zr,
        lorodoc_cmpFrontiers: tn,
        lorodoc_cmpWithFrontiers: en,
        lorodoc_commit: _n,
        lorodoc_configDefaultTextStyle: rn,
        lorodoc_configTextStyle: nn,
        lorodoc_debugHistory: on,
        lorodoc_deleteRootContainer: an,
        lorodoc_detach: sn,
        lorodoc_diff: dn,
        lorodoc_export: cn,
        lorodoc_exportJsonInIdSpan: gn,
        lorodoc_exportJsonUpdates: ln,
        lorodoc_findIdSpansBetween: wn,
        lorodoc_fork: bn,
        lorodoc_forkAt: un,
        lorodoc_fromSnapshot: pn,
        lorodoc_frontiers: fn,
        lorodoc_frontiersToVV: hn,
        lorodoc_getAllChanges: vn,
        lorodoc_getByPath: yn,
        lorodoc_getChangeAt: mn,
        lorodoc_getChangeAtLamport: In,
        lorodoc_getChangedContainersIn: kn,
        lorodoc_getContainerById: xn,
        lorodoc_getCounter: Sn,
        lorodoc_getCursorPos: An,
        lorodoc_getDeepValueWithID: Cn,
        lorodoc_getList: On,
        lorodoc_getMap: Fn,
        lorodoc_getMovableList: Rn,
        lorodoc_getOpsInChange: Dn,
        lorodoc_getPathToContainer: Nn,
        lorodoc_getPendingTxnLength: En,
        lorodoc_getShallowValue: Ln,
        lorodoc_getText: Tn,
        lorodoc_getTree: Un,
        lorodoc_getUncommittedOpsAsJson: jn,
        lorodoc_hasContainer: Vn,
        lorodoc_import: Jn,
        lorodoc_importBatch: Mn,
        lorodoc_importJsonUpdates: zn,
        lorodoc_importUpdateBatch: Rs,
        lorodoc_isDetached: Pn,
        lorodoc_isDetachedEditingEnabled: Bn,
        lorodoc_isShallow: Wn,
        lorodoc_new: $n,
        lorodoc_opCount: qn,
        lorodoc_oplogFrontiers: Hn,
        lorodoc_oplogVersion: Gn,
        lorodoc_peerId: Kn,
        lorodoc_peerIdStr: Qn,
        lorodoc_revertTo: Xn,
        lorodoc_setChangeMergeInterval: Yn,
        lorodoc_setDetachedEditing: Zn,
        lorodoc_setHideEmptyRootContainers: to,
        lorodoc_setNextCommitMessage: eo,
        lorodoc_setNextCommitOptions: _o,
        lorodoc_setNextCommitOrigin: ro,
        lorodoc_setNextCommitTimestamp: no,
        lorodoc_setPeerId: oo,
        lorodoc_setRecordTimestamp: io,
        lorodoc_shallowSinceFrontiers: ao,
        lorodoc_shallowSinceVV: so,
        lorodoc_subscribe: co,
        lorodoc_subscribeFirstCommitFromPeer: go,
        lorodoc_subscribeJsonpath: lo,
        lorodoc_subscribeLocalUpdates: wo,
        lorodoc_subscribePreCommit: bo,
        lorodoc_toJSON: uo,
        lorodoc_travelChangeAncestors: po,
        lorodoc_version: fo,
        lorodoc_vvToFrontiers: ho,
        lorolist_clear: vo,
        lorolist_delete: yo,
        lorolist_get: mo,
        lorolist_getAttached: Io,
        lorolist_getCursor: ko,
        lorolist_getIdAt: xo,
        lorolist_getShallowValue: So,
        lorolist_id: Ao,
        lorolist_insert: Co,
        lorolist_insertContainer: Oo,
        lorolist_isAttached: Fo,
        lorolist_isDeleted: Ro,
        lorolist_kind: Do,
        lorolist_length: No,
        lorolist_new: Eo,
        lorolist_parent: Lo,
        lorolist_pop: To,
        lorolist_push: Uo,
        lorolist_pushContainer: jo,
        lorolist_subscribe: Vo,
        lorolist_toArray: Jo,
        lorolist_toJSON: Mo,
        loromap_clear: zo,
        loromap_delete: Po,
        loromap_entries: Bo,
        loromap_get: Wo,
        loromap_getAttached: $o,
        loromap_getLastEditor: qo,
        loromap_getOrCreateContainer: Ho,
        loromap_getShallowValue: Go,
        loromap_id: Ko,
        loromap_isAttached: Qo,
        loromap_isDeleted: Xo,
        loromap_keys: Yo,
        loromap_kind: Zo,
        loromap_new: ti,
        loromap_parent: ei,
        loromap_set: _i,
        loromap_setContainer: ri,
        loromap_size: ni,
        loromap_subscribe: oi,
        loromap_toJSON: ii,
        loromap_values: ai,
        loromovablelist_clear: si,
        loromovablelist_delete: di,
        loromovablelist_get: ci,
        loromovablelist_getAttached: gi,
        loromovablelist_getCreatorAt: li,
        loromovablelist_getCursor: wi,
        loromovablelist_getLastEditorAt: bi,
        loromovablelist_getLastMoverAt: ui,
        loromovablelist_getShallowValue: pi,
        loromovablelist_id: fi,
        loromovablelist_insert: hi,
        loromovablelist_insertContainer: vi,
        loromovablelist_isAttached: yi,
        loromovablelist_isDeleted: mi,
        loromovablelist_kind: Ii,
        loromovablelist_length: ki,
        loromovablelist_move: xi,
        loromovablelist_new: Si,
        loromovablelist_parent: Ai,
        loromovablelist_pop: Ci,
        loromovablelist_push: Oi,
        loromovablelist_pushContainer: Fi,
        loromovablelist_set: Ri,
        loromovablelist_setContainer: Di,
        loromovablelist_subscribe: Ni,
        loromovablelist_toArray: Ei,
        loromovablelist_toJSON: Li,
        lorotext_applyDelta: Ti,
        lorotext_charAt: Ui,
        lorotext_convertPos: ji,
        lorotext_delete: Vi,
        lorotext_deleteUtf8: Ji,
        lorotext_getAttached: Mi,
        lorotext_getCursor: zi,
        lorotext_getEditorOf: Pi,
        lorotext_getShallowValue: Bi,
        lorotext_id: Wi,
        lorotext_insert: $i,
        lorotext_insertUtf8: qi,
        lorotext_isAttached: Hi,
        lorotext_isDeleted: Gi,
        lorotext_iter: Ki,
        lorotext_kind: Qi,
        lorotext_length: Xi,
        lorotext_mark: Yi,
        lorotext_new: Zi,
        lorotext_parent: ta,
        lorotext_push: ea,
        lorotext_slice: _a,
        lorotext_sliceDelta: ra,
        lorotext_sliceDeltaUtf8: na,
        lorotext_splice: oa,
        lorotext_subscribe: ia,
        lorotext_toDelta: aa,
        lorotext_toJSON: sa,
        lorotext_toString: da,
        lorotext_unmark: ca,
        lorotext_update: ga,
        lorotext_updateByLine: la,
        lorotree_createNode: wa,
        lorotree_delete: ba,
        lorotree_disableFractionalIndex: ua,
        lorotree_enableFractionalIndex: pa,
        lorotree_getAttached: fa,
        lorotree_getNodeByID: ha,
        lorotree_getNodes: va,
        lorotree_getShallowValue: ya,
        lorotree_has: ma,
        lorotree_id: Ia,
        lorotree_isAttached: ka,
        lorotree_isDeleted: xa,
        lorotree_isFractionalIndexEnabled: Sa,
        lorotree_isNodeDeleted: Aa,
        lorotree_kind: Ca,
        lorotree_move: Oa,
        lorotree_new: Fa,
        lorotree_nodes: Ra,
        lorotree_parent: Da,
        lorotree_roots: Na,
        lorotree_subscribe: Ea,
        lorotree_toArray: La,
        lorotree_toJSON: Ta,
        lorotreenode___getClassname: Ua,
        lorotreenode_children: ja,
        lorotreenode_createNode: Va,
        lorotreenode_creationId: Ja,
        lorotreenode_creator: Ma,
        lorotreenode_data: za,
        lorotreenode_fractionalIndex: Pa,
        lorotreenode_getLastMoveId: Ba,
        lorotreenode_id: Wa,
        lorotreenode_index: $a,
        lorotreenode_isDeleted: qa,
        lorotreenode_move: Ha,
        lorotreenode_moveAfter: Ga,
        lorotreenode_moveBefore: Ka,
        lorotreenode_parent: Qa,
        lorotreenode_toJSON: Xa,
        memory: V_,
        redactJsonUpdates: Ya,
        run: Za,
        setDebug: ts,
        undomanager_addExcludeOriginPrefix: es,
        undomanager_canRedo: _s,
        undomanager_canUndo: rs,
        undomanager_clear: ns,
        undomanager_clearRedo: os,
        undomanager_clearUndo: is,
        undomanager_groupEnd: as,
        undomanager_groupStart: ss,
        undomanager_new: ds,
        undomanager_peer: cs,
        undomanager_redo: gs,
        undomanager_setMaxUndoSteps: ls,
        undomanager_setMergeInterval: ws,
        undomanager_setOnPop: bs,
        undomanager_setOnPush: us,
        undomanager_topRedoValue: ps,
        undomanager_topUndoValue: fs,
        undomanager_undo: hs,
        versionvector_compare: vs,
        versionvector_decode: ys,
        versionvector_encode: ms,
        versionvector_get: Is,
        versionvector_length: ks,
        versionvector_new: xs,
        versionvector_parseJSON: Ss,
        versionvector_remove: As,
        versionvector_setEnd: Cs,
        versionvector_setLast: Os,
        versionvector_toJSON: Fs
    }, Symbol.toStringTag, {
        value: "Module"
    }));
})();
export { T_ as E, N as L, U_ as U, v_ as _, R_ as c, Bs as i, Ws as r, __tla };
