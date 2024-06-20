"use strict";
(self["webpackChunkart_interface_v1"] = self["webpackChunkart_interface_v1"] || []).push([[686],{

/***/ 70296:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.createCurve = exports.getHash = void 0;
/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
const hmac_1 = __webpack_require__(24864);
const utils_1 = __webpack_require__(44214);
const weierstrass_js_1 = __webpack_require__(57875);
// connects noble-curves to noble-hashes
function getHash(hash) {
    return {
        hash,
        hmac: (key, ...msgs) => (0, hmac_1.hmac)(hash, key, (0, utils_1.concatBytes)(...msgs)),
        randomBytes: utils_1.randomBytes,
    };
}
exports.getHash = getHash;
function createCurve(curveDef, defHash) {
    const create = (hash) => (0, weierstrass_js_1.weierstrass)({ ...curveDef, ...getHash(hash) });
    return Object.freeze({ ...create(defHash), create });
}
exports.createCurve = createCurve;
//# sourceMappingURL=_shortw_utils.js.map

/***/ }),

/***/ 9748:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.validateBasic = exports.wNAF = void 0;
/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
// Abelian group utilities
const modular_js_1 = __webpack_require__(51881);
const utils_js_1 = __webpack_require__(92258);
const _0n = BigInt(0);
const _1n = BigInt(1);
// Elliptic curve multiplication of Point by scalar. Fragile.
// Scalars should always be less than curve order: this should be checked inside of a curve itself.
// Creates precomputation tables for fast multiplication:
// - private scalar is split by fixed size windows of W bits
// - every window point is collected from window's table & added to accumulator
// - since windows are different, same point inside tables won't be accessed more than once per calc
// - each multiplication is 'Math.ceil(CURVE_ORDER / 𝑊) + 1' point additions (fixed for any scalar)
// - +1 window is neccessary for wNAF
// - wNAF reduces table size: 2x less memory + 2x faster generation, but 10% slower multiplication
// TODO: Research returning 2d JS array of windows, instead of a single window. This would allow
// windows to be in different memory locations
function wNAF(c, bits) {
    const constTimeNegate = (condition, item) => {
        const neg = item.negate();
        return condition ? neg : item;
    };
    const opts = (W) => {
        const windows = Math.ceil(bits / W) + 1; // +1, because
        const windowSize = 2 ** (W - 1); // -1 because we skip zero
        return { windows, windowSize };
    };
    return {
        constTimeNegate,
        // non-const time multiplication ladder
        unsafeLadder(elm, n) {
            let p = c.ZERO;
            let d = elm;
            while (n > _0n) {
                if (n & _1n)
                    p = p.add(d);
                d = d.double();
                n >>= _1n;
            }
            return p;
        },
        /**
         * Creates a wNAF precomputation window. Used for caching.
         * Default window size is set by `utils.precompute()` and is equal to 8.
         * Number of precomputed points depends on the curve size:
         * 2^(𝑊−1) * (Math.ceil(𝑛 / 𝑊) + 1), where:
         * - 𝑊 is the window size
         * - 𝑛 is the bitlength of the curve order.
         * For a 256-bit curve and window size 8, the number of precomputed points is 128 * 33 = 4224.
         * @returns precomputed point tables flattened to a single array
         */
        precomputeWindow(elm, W) {
            const { windows, windowSize } = opts(W);
            const points = [];
            let p = elm;
            let base = p;
            for (let window = 0; window < windows; window++) {
                base = p;
                points.push(base);
                // =1, because we skip zero
                for (let i = 1; i < windowSize; i++) {
                    base = base.add(p);
                    points.push(base);
                }
                p = base.double();
            }
            return points;
        },
        /**
         * Implements ec multiplication using precomputed tables and w-ary non-adjacent form.
         * @param W window size
         * @param precomputes precomputed tables
         * @param n scalar (we don't check here, but should be less than curve order)
         * @returns real and fake (for const-time) points
         */
        wNAF(W, precomputes, n) {
            // TODO: maybe check that scalar is less than group order? wNAF behavious is undefined otherwise
            // But need to carefully remove other checks before wNAF. ORDER == bits here
            const { windows, windowSize } = opts(W);
            let p = c.ZERO;
            let f = c.BASE;
            const mask = BigInt(2 ** W - 1); // Create mask with W ones: 0b1111 for W=4 etc.
            const maxNumber = 2 ** W;
            const shiftBy = BigInt(W);
            for (let window = 0; window < windows; window++) {
                const offset = window * windowSize;
                // Extract W bits.
                let wbits = Number(n & mask);
                // Shift number by W bits.
                n >>= shiftBy;
                // If the bits are bigger than max size, we'll split those.
                // +224 => 256 - 32
                if (wbits > windowSize) {
                    wbits -= maxNumber;
                    n += _1n;
                }
                // This code was first written with assumption that 'f' and 'p' will never be infinity point:
                // since each addition is multiplied by 2 ** W, it cannot cancel each other. However,
                // there is negate now: it is possible that negated element from low value
                // would be the same as high element, which will create carry into next window.
                // It's not obvious how this can fail, but still worth investigating later.
                // Check if we're onto Zero point.
                // Add random point inside current window to f.
                const offset1 = offset;
                const offset2 = offset + Math.abs(wbits) - 1; // -1 because we skip zero
                const cond1 = window % 2 !== 0;
                const cond2 = wbits < 0;
                if (wbits === 0) {
                    // The most important part for const-time getPublicKey
                    f = f.add(constTimeNegate(cond1, precomputes[offset1]));
                }
                else {
                    p = p.add(constTimeNegate(cond2, precomputes[offset2]));
                }
            }
            // JIT-compiler should not eliminate f here, since it will later be used in normalizeZ()
            // Even if the variable is still unused, there are some checks which will
            // throw an exception, so compiler needs to prove they won't happen, which is hard.
            // At this point there is a way to F be infinity-point even if p is not,
            // which makes it less const-time: around 1 bigint multiply.
            return { p, f };
        },
        wNAFCached(P, precomputesMap, n, transform) {
            // @ts-ignore
            const W = P._WINDOW_SIZE || 1;
            // Calculate precomputes on a first run, reuse them after
            let comp = precomputesMap.get(P);
            if (!comp) {
                comp = this.precomputeWindow(P, W);
                if (W !== 1) {
                    precomputesMap.set(P, transform(comp));
                }
            }
            return this.wNAF(W, comp, n);
        },
    };
}
exports.wNAF = wNAF;
function validateBasic(curve) {
    (0, modular_js_1.validateField)(curve.Fp);
    (0, utils_js_1.validateObject)(curve, {
        n: 'bigint',
        h: 'bigint',
        Gx: 'field',
        Gy: 'field',
    }, {
        nBitLength: 'isSafeInteger',
        nByteLength: 'isSafeInteger',
    });
    // Set defaults
    return Object.freeze({
        ...(0, modular_js_1.nLength)(curve.n, curve.nBitLength),
        ...curve,
        ...{ p: curve.Fp.ORDER },
    });
}
exports.validateBasic = validateBasic;
//# sourceMappingURL=curve.js.map

/***/ }),

/***/ 93895:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.createHasher = exports.isogenyMap = exports.hash_to_field = exports.expand_message_xof = exports.expand_message_xmd = void 0;
const modular_js_1 = __webpack_require__(51881);
const utils_js_1 = __webpack_require__(92258);
function validateDST(dst) {
    if (dst instanceof Uint8Array)
        return dst;
    if (typeof dst === 'string')
        return (0, utils_js_1.utf8ToBytes)(dst);
    throw new Error('DST must be Uint8Array or string');
}
// Octet Stream to Integer. "spec" implementation of os2ip is 2.5x slower vs bytesToNumberBE.
const os2ip = utils_js_1.bytesToNumberBE;
// Integer to Octet Stream (numberToBytesBE)
function i2osp(value, length) {
    if (value < 0 || value >= 1 << (8 * length)) {
        throw new Error(`bad I2OSP call: value=${value} length=${length}`);
    }
    const res = Array.from({ length }).fill(0);
    for (let i = length - 1; i >= 0; i--) {
        res[i] = value & 0xff;
        value >>>= 8;
    }
    return new Uint8Array(res);
}
function strxor(a, b) {
    const arr = new Uint8Array(a.length);
    for (let i = 0; i < a.length; i++) {
        arr[i] = a[i] ^ b[i];
    }
    return arr;
}
function isBytes(item) {
    if (!(item instanceof Uint8Array))
        throw new Error('Uint8Array expected');
}
function isNum(item) {
    if (!Number.isSafeInteger(item))
        throw new Error('number expected');
}
// Produces a uniformly random byte string using a cryptographic hash function H that outputs b bits
// https://www.rfc-editor.org/rfc/rfc9380#section-5.3.1
function expand_message_xmd(msg, DST, lenInBytes, H) {
    isBytes(msg);
    isBytes(DST);
    isNum(lenInBytes);
    // https://www.rfc-editor.org/rfc/rfc9380#section-5.3.3
    if (DST.length > 255)
        DST = H((0, utils_js_1.concatBytes)((0, utils_js_1.utf8ToBytes)('H2C-OVERSIZE-DST-'), DST));
    const { outputLen: b_in_bytes, blockLen: r_in_bytes } = H;
    const ell = Math.ceil(lenInBytes / b_in_bytes);
    if (ell > 255)
        throw new Error('Invalid xmd length');
    const DST_prime = (0, utils_js_1.concatBytes)(DST, i2osp(DST.length, 1));
    const Z_pad = i2osp(0, r_in_bytes);
    const l_i_b_str = i2osp(lenInBytes, 2); // len_in_bytes_str
    const b = new Array(ell);
    const b_0 = H((0, utils_js_1.concatBytes)(Z_pad, msg, l_i_b_str, i2osp(0, 1), DST_prime));
    b[0] = H((0, utils_js_1.concatBytes)(b_0, i2osp(1, 1), DST_prime));
    for (let i = 1; i <= ell; i++) {
        const args = [strxor(b_0, b[i - 1]), i2osp(i + 1, 1), DST_prime];
        b[i] = H((0, utils_js_1.concatBytes)(...args));
    }
    const pseudo_random_bytes = (0, utils_js_1.concatBytes)(...b);
    return pseudo_random_bytes.slice(0, lenInBytes);
}
exports.expand_message_xmd = expand_message_xmd;
// Produces a uniformly random byte string using an extendable-output function (XOF) H.
// 1. The collision resistance of H MUST be at least k bits.
// 2. H MUST be an XOF that has been proved indifferentiable from
//    a random oracle under a reasonable cryptographic assumption.
// https://www.rfc-editor.org/rfc/rfc9380#section-5.3.2
function expand_message_xof(msg, DST, lenInBytes, k, H) {
    isBytes(msg);
    isBytes(DST);
    isNum(lenInBytes);
    // https://www.rfc-editor.org/rfc/rfc9380#section-5.3.3
    // DST = H('H2C-OVERSIZE-DST-' || a_very_long_DST, Math.ceil((lenInBytes * k) / 8));
    if (DST.length > 255) {
        const dkLen = Math.ceil((2 * k) / 8);
        DST = H.create({ dkLen }).update((0, utils_js_1.utf8ToBytes)('H2C-OVERSIZE-DST-')).update(DST).digest();
    }
    if (lenInBytes > 65535 || DST.length > 255)
        throw new Error('expand_message_xof: invalid lenInBytes');
    return (H.create({ dkLen: lenInBytes })
        .update(msg)
        .update(i2osp(lenInBytes, 2))
        // 2. DST_prime = DST || I2OSP(len(DST), 1)
        .update(DST)
        .update(i2osp(DST.length, 1))
        .digest());
}
exports.expand_message_xof = expand_message_xof;
/**
 * Hashes arbitrary-length byte strings to a list of one or more elements of a finite field F
 * https://www.rfc-editor.org/rfc/rfc9380#section-5.2
 * @param msg a byte string containing the message to hash
 * @param count the number of elements of F to output
 * @param options `{DST: string, p: bigint, m: number, k: number, expand: 'xmd' | 'xof', hash: H}`, see above
 * @returns [u_0, ..., u_(count - 1)], a list of field elements.
 */
function hash_to_field(msg, count, options) {
    (0, utils_js_1.validateObject)(options, {
        DST: 'stringOrUint8Array',
        p: 'bigint',
        m: 'isSafeInteger',
        k: 'isSafeInteger',
        hash: 'hash',
    });
    const { p, k, m, hash, expand, DST: _DST } = options;
    isBytes(msg);
    isNum(count);
    const DST = validateDST(_DST);
    const log2p = p.toString(2).length;
    const L = Math.ceil((log2p + k) / 8); // section 5.1 of ietf draft link above
    const len_in_bytes = count * m * L;
    let prb; // pseudo_random_bytes
    if (expand === 'xmd') {
        prb = expand_message_xmd(msg, DST, len_in_bytes, hash);
    }
    else if (expand === 'xof') {
        prb = expand_message_xof(msg, DST, len_in_bytes, k, hash);
    }
    else if (expand === '_internal_pass') {
        // for internal tests only
        prb = msg;
    }
    else {
        throw new Error('expand must be "xmd" or "xof"');
    }
    const u = new Array(count);
    for (let i = 0; i < count; i++) {
        const e = new Array(m);
        for (let j = 0; j < m; j++) {
            const elm_offset = L * (j + i * m);
            const tv = prb.subarray(elm_offset, elm_offset + L);
            e[j] = (0, modular_js_1.mod)(os2ip(tv), p);
        }
        u[i] = e;
    }
    return u;
}
exports.hash_to_field = hash_to_field;
function isogenyMap(field, map) {
    // Make same order as in spec
    const COEFF = map.map((i) => Array.from(i).reverse());
    return (x, y) => {
        const [xNum, xDen, yNum, yDen] = COEFF.map((val) => val.reduce((acc, i) => field.add(field.mul(acc, x), i)));
        x = field.div(xNum, xDen); // xNum / xDen
        y = field.mul(y, field.div(yNum, yDen)); // y * (yNum / yDev)
        return { x, y };
    };
}
exports.isogenyMap = isogenyMap;
function createHasher(Point, mapToCurve, def) {
    if (typeof mapToCurve !== 'function')
        throw new Error('mapToCurve() must be defined');
    return {
        // Encodes byte string to elliptic curve.
        // hash_to_curve from https://www.rfc-editor.org/rfc/rfc9380#section-3
        hashToCurve(msg, options) {
            const u = hash_to_field(msg, 2, { ...def, DST: def.DST, ...options });
            const u0 = Point.fromAffine(mapToCurve(u[0]));
            const u1 = Point.fromAffine(mapToCurve(u[1]));
            const P = u0.add(u1).clearCofactor();
            P.assertValidity();
            return P;
        },
        // Encodes byte string to elliptic curve.
        // encode_to_curve from https://www.rfc-editor.org/rfc/rfc9380#section-3
        encodeToCurve(msg, options) {
            const u = hash_to_field(msg, 1, { ...def, DST: def.encodeDST, ...options });
            const P = Point.fromAffine(mapToCurve(u[0])).clearCofactor();
            P.assertValidity();
            return P;
        },
    };
}
exports.createHasher = createHasher;
//# sourceMappingURL=hash-to-curve.js.map

/***/ }),

/***/ 51881:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.mapHashToField = exports.getMinHashLength = exports.getFieldBytesLength = exports.hashToPrivateScalar = exports.FpSqrtEven = exports.FpSqrtOdd = exports.Field = exports.nLength = exports.FpIsSquare = exports.FpDiv = exports.FpInvertBatch = exports.FpPow = exports.validateField = exports.isNegativeLE = exports.FpSqrt = exports.tonelliShanks = exports.invert = exports.pow2 = exports.pow = exports.mod = void 0;
/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
// Utilities for modular arithmetics and finite fields
const utils_js_1 = __webpack_require__(92258);
// prettier-ignore
const _0n = BigInt(0), _1n = BigInt(1), _2n = BigInt(2), _3n = BigInt(3);
// prettier-ignore
const _4n = BigInt(4), _5n = BigInt(5), _8n = BigInt(8);
// prettier-ignore
const _9n = BigInt(9), _16n = BigInt(16);
// Calculates a modulo b
function mod(a, b) {
    const result = a % b;
    return result >= _0n ? result : b + result;
}
exports.mod = mod;
/**
 * Efficiently raise num to power and do modular division.
 * Unsafe in some contexts: uses ladder, so can expose bigint bits.
 * @example
 * pow(2n, 6n, 11n) // 64n % 11n == 9n
 */
// TODO: use field version && remove
function pow(num, power, modulo) {
    if (modulo <= _0n || power < _0n)
        throw new Error('Expected power/modulo > 0');
    if (modulo === _1n)
        return _0n;
    let res = _1n;
    while (power > _0n) {
        if (power & _1n)
            res = (res * num) % modulo;
        num = (num * num) % modulo;
        power >>= _1n;
    }
    return res;
}
exports.pow = pow;
// Does x ^ (2 ^ power) mod p. pow2(30, 4) == 30 ^ (2 ^ 4)
function pow2(x, power, modulo) {
    let res = x;
    while (power-- > _0n) {
        res *= res;
        res %= modulo;
    }
    return res;
}
exports.pow2 = pow2;
// Inverses number over modulo
function invert(number, modulo) {
    if (number === _0n || modulo <= _0n) {
        throw new Error(`invert: expected positive integers, got n=${number} mod=${modulo}`);
    }
    // Euclidean GCD https://brilliant.org/wiki/extended-euclidean-algorithm/
    // Fermat's little theorem "CT-like" version inv(n) = n^(m-2) mod m is 30x slower.
    let a = mod(number, modulo);
    let b = modulo;
    // prettier-ignore
    let x = _0n, y = _1n, u = _1n, v = _0n;
    while (a !== _0n) {
        // JIT applies optimization if those two lines follow each other
        const q = b / a;
        const r = b % a;
        const m = x - u * q;
        const n = y - v * q;
        // prettier-ignore
        b = a, a = r, x = u, y = v, u = m, v = n;
    }
    const gcd = b;
    if (gcd !== _1n)
        throw new Error('invert: does not exist');
    return mod(x, modulo);
}
exports.invert = invert;
/**
 * Tonelli-Shanks square root search algorithm.
 * 1. https://eprint.iacr.org/2012/685.pdf (page 12)
 * 2. Square Roots from 1; 24, 51, 10 to Dan Shanks
 * Will start an infinite loop if field order P is not prime.
 * @param P field order
 * @returns function that takes field Fp (created from P) and number n
 */
function tonelliShanks(P) {
    // Legendre constant: used to calculate Legendre symbol (a | p),
    // which denotes the value of a^((p-1)/2) (mod p).
    // (a | p) ≡ 1    if a is a square (mod p)
    // (a | p) ≡ -1   if a is not a square (mod p)
    // (a | p) ≡ 0    if a ≡ 0 (mod p)
    const legendreC = (P - _1n) / _2n;
    let Q, S, Z;
    // Step 1: By factoring out powers of 2 from p - 1,
    // find q and s such that p - 1 = q*(2^s) with q odd
    for (Q = P - _1n, S = 0; Q % _2n === _0n; Q /= _2n, S++)
        ;
    // Step 2: Select a non-square z such that (z | p) ≡ -1 and set c ≡ zq
    for (Z = _2n; Z < P && pow(Z, legendreC, P) !== P - _1n; Z++)
        ;
    // Fast-path
    if (S === 1) {
        const p1div4 = (P + _1n) / _4n;
        return function tonelliFast(Fp, n) {
            const root = Fp.pow(n, p1div4);
            if (!Fp.eql(Fp.sqr(root), n))
                throw new Error('Cannot find square root');
            return root;
        };
    }
    // Slow-path
    const Q1div2 = (Q + _1n) / _2n;
    return function tonelliSlow(Fp, n) {
        // Step 0: Check that n is indeed a square: (n | p) should not be ≡ -1
        if (Fp.pow(n, legendreC) === Fp.neg(Fp.ONE))
            throw new Error('Cannot find square root');
        let r = S;
        // TODO: will fail at Fp2/etc
        let g = Fp.pow(Fp.mul(Fp.ONE, Z), Q); // will update both x and b
        let x = Fp.pow(n, Q1div2); // first guess at the square root
        let b = Fp.pow(n, Q); // first guess at the fudge factor
        while (!Fp.eql(b, Fp.ONE)) {
            if (Fp.eql(b, Fp.ZERO))
                return Fp.ZERO; // https://en.wikipedia.org/wiki/Tonelli%E2%80%93Shanks_algorithm (4. If t = 0, return r = 0)
            // Find m such b^(2^m)==1
            let m = 1;
            for (let t2 = Fp.sqr(b); m < r; m++) {
                if (Fp.eql(t2, Fp.ONE))
                    break;
                t2 = Fp.sqr(t2); // t2 *= t2
            }
            // NOTE: r-m-1 can be bigger than 32, need to convert to bigint before shift, otherwise there will be overflow
            const ge = Fp.pow(g, _1n << BigInt(r - m - 1)); // ge = 2^(r-m-1)
            g = Fp.sqr(ge); // g = ge * ge
            x = Fp.mul(x, ge); // x *= ge
            b = Fp.mul(b, g); // b *= g
            r = m;
        }
        return x;
    };
}
exports.tonelliShanks = tonelliShanks;
function FpSqrt(P) {
    // NOTE: different algorithms can give different roots, it is up to user to decide which one they want.
    // For example there is FpSqrtOdd/FpSqrtEven to choice root based on oddness (used for hash-to-curve).
    // P ≡ 3 (mod 4)
    // √n = n^((P+1)/4)
    if (P % _4n === _3n) {
        // Not all roots possible!
        // const ORDER =
        //   0x1a0111ea397fe69a4b1ba7b6434bacd764774b84f38512bf6730d2a0f6b0f6241eabfffeb153ffffb9feffffffffaaabn;
        // const NUM = 72057594037927816n;
        const p1div4 = (P + _1n) / _4n;
        return function sqrt3mod4(Fp, n) {
            const root = Fp.pow(n, p1div4);
            // Throw if root**2 != n
            if (!Fp.eql(Fp.sqr(root), n))
                throw new Error('Cannot find square root');
            return root;
        };
    }
    // Atkin algorithm for q ≡ 5 (mod 8), https://eprint.iacr.org/2012/685.pdf (page 10)
    if (P % _8n === _5n) {
        const c1 = (P - _5n) / _8n;
        return function sqrt5mod8(Fp, n) {
            const n2 = Fp.mul(n, _2n);
            const v = Fp.pow(n2, c1);
            const nv = Fp.mul(n, v);
            const i = Fp.mul(Fp.mul(nv, _2n), v);
            const root = Fp.mul(nv, Fp.sub(i, Fp.ONE));
            if (!Fp.eql(Fp.sqr(root), n))
                throw new Error('Cannot find square root');
            return root;
        };
    }
    // P ≡ 9 (mod 16)
    if (P % _16n === _9n) {
        // NOTE: tonelli is too slow for bls-Fp2 calculations even on start
        // Means we cannot use sqrt for constants at all!
        //
        // const c1 = Fp.sqrt(Fp.negate(Fp.ONE)); //  1. c1 = sqrt(-1) in F, i.e., (c1^2) == -1 in F
        // const c2 = Fp.sqrt(c1);                //  2. c2 = sqrt(c1) in F, i.e., (c2^2) == c1 in F
        // const c3 = Fp.sqrt(Fp.negate(c1));     //  3. c3 = sqrt(-c1) in F, i.e., (c3^2) == -c1 in F
        // const c4 = (P + _7n) / _16n;           //  4. c4 = (q + 7) / 16        # Integer arithmetic
        // sqrt = (x) => {
        //   let tv1 = Fp.pow(x, c4);             //  1. tv1 = x^c4
        //   let tv2 = Fp.mul(c1, tv1);           //  2. tv2 = c1 * tv1
        //   const tv3 = Fp.mul(c2, tv1);         //  3. tv3 = c2 * tv1
        //   let tv4 = Fp.mul(c3, tv1);           //  4. tv4 = c3 * tv1
        //   const e1 = Fp.equals(Fp.square(tv2), x); //  5.  e1 = (tv2^2) == x
        //   const e2 = Fp.equals(Fp.square(tv3), x); //  6.  e2 = (tv3^2) == x
        //   tv1 = Fp.cmov(tv1, tv2, e1); //  7. tv1 = CMOV(tv1, tv2, e1)  # Select tv2 if (tv2^2) == x
        //   tv2 = Fp.cmov(tv4, tv3, e2); //  8. tv2 = CMOV(tv4, tv3, e2)  # Select tv3 if (tv3^2) == x
        //   const e3 = Fp.equals(Fp.square(tv2), x); //  9.  e3 = (tv2^2) == x
        //   return Fp.cmov(tv1, tv2, e3); //  10.  z = CMOV(tv1, tv2, e3)  # Select the sqrt from tv1 and tv2
        // }
    }
    // Other cases: Tonelli-Shanks algorithm
    return tonelliShanks(P);
}
exports.FpSqrt = FpSqrt;
// Little-endian check for first LE bit (last BE bit);
const isNegativeLE = (num, modulo) => (mod(num, modulo) & _1n) === _1n;
exports.isNegativeLE = isNegativeLE;
// prettier-ignore
const FIELD_FIELDS = [
    'create', 'isValid', 'is0', 'neg', 'inv', 'sqrt', 'sqr',
    'eql', 'add', 'sub', 'mul', 'pow', 'div',
    'addN', 'subN', 'mulN', 'sqrN'
];
function validateField(field) {
    const initial = {
        ORDER: 'bigint',
        MASK: 'bigint',
        BYTES: 'isSafeInteger',
        BITS: 'isSafeInteger',
    };
    const opts = FIELD_FIELDS.reduce((map, val) => {
        map[val] = 'function';
        return map;
    }, initial);
    return (0, utils_js_1.validateObject)(field, opts);
}
exports.validateField = validateField;
// Generic field functions
/**
 * Same as `pow` but for Fp: non-constant-time.
 * Unsafe in some contexts: uses ladder, so can expose bigint bits.
 */
function FpPow(f, num, power) {
    // Should have same speed as pow for bigints
    // TODO: benchmark!
    if (power < _0n)
        throw new Error('Expected power > 0');
    if (power === _0n)
        return f.ONE;
    if (power === _1n)
        return num;
    let p = f.ONE;
    let d = num;
    while (power > _0n) {
        if (power & _1n)
            p = f.mul(p, d);
        d = f.sqr(d);
        power >>= _1n;
    }
    return p;
}
exports.FpPow = FpPow;
/**
 * Efficiently invert an array of Field elements.
 * `inv(0)` will return `undefined` here: make sure to throw an error.
 */
function FpInvertBatch(f, nums) {
    const tmp = new Array(nums.length);
    // Walk from first to last, multiply them by each other MOD p
    const lastMultiplied = nums.reduce((acc, num, i) => {
        if (f.is0(num))
            return acc;
        tmp[i] = acc;
        return f.mul(acc, num);
    }, f.ONE);
    // Invert last element
    const inverted = f.inv(lastMultiplied);
    // Walk from last to first, multiply them by inverted each other MOD p
    nums.reduceRight((acc, num, i) => {
        if (f.is0(num))
            return acc;
        tmp[i] = f.mul(acc, tmp[i]);
        return f.mul(acc, num);
    }, inverted);
    return tmp;
}
exports.FpInvertBatch = FpInvertBatch;
function FpDiv(f, lhs, rhs) {
    return f.mul(lhs, typeof rhs === 'bigint' ? invert(rhs, f.ORDER) : f.inv(rhs));
}
exports.FpDiv = FpDiv;
// This function returns True whenever the value x is a square in the field F.
function FpIsSquare(f) {
    const legendreConst = (f.ORDER - _1n) / _2n; // Integer arithmetic
    return (x) => {
        const p = f.pow(x, legendreConst);
        return f.eql(p, f.ZERO) || f.eql(p, f.ONE);
    };
}
exports.FpIsSquare = FpIsSquare;
// CURVE.n lengths
function nLength(n, nBitLength) {
    // Bit size, byte size of CURVE.n
    const _nBitLength = nBitLength !== undefined ? nBitLength : n.toString(2).length;
    const nByteLength = Math.ceil(_nBitLength / 8);
    return { nBitLength: _nBitLength, nByteLength };
}
exports.nLength = nLength;
/**
 * Initializes a finite field over prime. **Non-primes are not supported.**
 * Do not init in loop: slow. Very fragile: always run a benchmark on a change.
 * Major performance optimizations:
 * * a) denormalized operations like mulN instead of mul
 * * b) same object shape: never add or remove keys
 * * c) Object.freeze
 * @param ORDER prime positive bigint
 * @param bitLen how many bits the field consumes
 * @param isLE (def: false) if encoding / decoding should be in little-endian
 * @param redef optional faster redefinitions of sqrt and other methods
 */
function Field(ORDER, bitLen, isLE = false, redef = {}) {
    if (ORDER <= _0n)
        throw new Error(`Expected Field ORDER > 0, got ${ORDER}`);
    const { nBitLength: BITS, nByteLength: BYTES } = nLength(ORDER, bitLen);
    if (BYTES > 2048)
        throw new Error('Field lengths over 2048 bytes are not supported');
    const sqrtP = FpSqrt(ORDER);
    const f = Object.freeze({
        ORDER,
        BITS,
        BYTES,
        MASK: (0, utils_js_1.bitMask)(BITS),
        ZERO: _0n,
        ONE: _1n,
        create: (num) => mod(num, ORDER),
        isValid: (num) => {
            if (typeof num !== 'bigint')
                throw new Error(`Invalid field element: expected bigint, got ${typeof num}`);
            return _0n <= num && num < ORDER; // 0 is valid element, but it's not invertible
        },
        is0: (num) => num === _0n,
        isOdd: (num) => (num & _1n) === _1n,
        neg: (num) => mod(-num, ORDER),
        eql: (lhs, rhs) => lhs === rhs,
        sqr: (num) => mod(num * num, ORDER),
        add: (lhs, rhs) => mod(lhs + rhs, ORDER),
        sub: (lhs, rhs) => mod(lhs - rhs, ORDER),
        mul: (lhs, rhs) => mod(lhs * rhs, ORDER),
        pow: (num, power) => FpPow(f, num, power),
        div: (lhs, rhs) => mod(lhs * invert(rhs, ORDER), ORDER),
        // Same as above, but doesn't normalize
        sqrN: (num) => num * num,
        addN: (lhs, rhs) => lhs + rhs,
        subN: (lhs, rhs) => lhs - rhs,
        mulN: (lhs, rhs) => lhs * rhs,
        inv: (num) => invert(num, ORDER),
        sqrt: redef.sqrt || ((n) => sqrtP(f, n)),
        invertBatch: (lst) => FpInvertBatch(f, lst),
        // TODO: do we really need constant cmov?
        // We don't have const-time bigints anyway, so probably will be not very useful
        cmov: (a, b, c) => (c ? b : a),
        toBytes: (num) => (isLE ? (0, utils_js_1.numberToBytesLE)(num, BYTES) : (0, utils_js_1.numberToBytesBE)(num, BYTES)),
        fromBytes: (bytes) => {
            if (bytes.length !== BYTES)
                throw new Error(`Fp.fromBytes: expected ${BYTES}, got ${bytes.length}`);
            return isLE ? (0, utils_js_1.bytesToNumberLE)(bytes) : (0, utils_js_1.bytesToNumberBE)(bytes);
        },
    });
    return Object.freeze(f);
}
exports.Field = Field;
function FpSqrtOdd(Fp, elm) {
    if (!Fp.isOdd)
        throw new Error(`Field doesn't have isOdd`);
    const root = Fp.sqrt(elm);
    return Fp.isOdd(root) ? root : Fp.neg(root);
}
exports.FpSqrtOdd = FpSqrtOdd;
function FpSqrtEven(Fp, elm) {
    if (!Fp.isOdd)
        throw new Error(`Field doesn't have isOdd`);
    const root = Fp.sqrt(elm);
    return Fp.isOdd(root) ? Fp.neg(root) : root;
}
exports.FpSqrtEven = FpSqrtEven;
/**
 * "Constant-time" private key generation utility.
 * Same as mapKeyToField, but accepts less bytes (40 instead of 48 for 32-byte field).
 * Which makes it slightly more biased, less secure.
 * @deprecated use mapKeyToField instead
 */
function hashToPrivateScalar(hash, groupOrder, isLE = false) {
    hash = (0, utils_js_1.ensureBytes)('privateHash', hash);
    const hashLen = hash.length;
    const minLen = nLength(groupOrder).nByteLength + 8;
    if (minLen < 24 || hashLen < minLen || hashLen > 1024)
        throw new Error(`hashToPrivateScalar: expected ${minLen}-1024 bytes of input, got ${hashLen}`);
    const num = isLE ? (0, utils_js_1.bytesToNumberLE)(hash) : (0, utils_js_1.bytesToNumberBE)(hash);
    return mod(num, groupOrder - _1n) + _1n;
}
exports.hashToPrivateScalar = hashToPrivateScalar;
/**
 * Returns total number of bytes consumed by the field element.
 * For example, 32 bytes for usual 256-bit weierstrass curve.
 * @param fieldOrder number of field elements, usually CURVE.n
 * @returns byte length of field
 */
function getFieldBytesLength(fieldOrder) {
    if (typeof fieldOrder !== 'bigint')
        throw new Error('field order must be bigint');
    const bitLength = fieldOrder.toString(2).length;
    return Math.ceil(bitLength / 8);
}
exports.getFieldBytesLength = getFieldBytesLength;
/**
 * Returns minimal amount of bytes that can be safely reduced
 * by field order.
 * Should be 2^-128 for 128-bit curve such as P256.
 * @param fieldOrder number of field elements, usually CURVE.n
 * @returns byte length of target hash
 */
function getMinHashLength(fieldOrder) {
    const length = getFieldBytesLength(fieldOrder);
    return length + Math.ceil(length / 2);
}
exports.getMinHashLength = getMinHashLength;
/**
 * "Constant-time" private key generation utility.
 * Can take (n + n/2) or more bytes of uniform input e.g. from CSPRNG or KDF
 * and convert them into private scalar, with the modulo bias being negligible.
 * Needs at least 48 bytes of input for 32-byte private key.
 * https://research.kudelskisecurity.com/2020/07/28/the-definitive-guide-to-modulo-bias-and-how-to-avoid-it/
 * FIPS 186-5, A.2 https://csrc.nist.gov/publications/detail/fips/186/5/final
 * RFC 9380, https://www.rfc-editor.org/rfc/rfc9380#section-5
 * @param hash hash output from SHA3 or a similar function
 * @param groupOrder size of subgroup - (e.g. secp256k1.CURVE.n)
 * @param isLE interpret hash bytes as LE num
 * @returns valid private scalar
 */
function mapHashToField(key, fieldOrder, isLE = false) {
    const len = key.length;
    const fieldLen = getFieldBytesLength(fieldOrder);
    const minLen = getMinHashLength(fieldOrder);
    // No small numbers: need to understand bias story. No huge numbers: easier to detect JS timings.
    if (len < 16 || len < minLen || len > 1024)
        throw new Error(`expected ${minLen}-1024 bytes of input, got ${len}`);
    const num = isLE ? (0, utils_js_1.bytesToNumberBE)(key) : (0, utils_js_1.bytesToNumberLE)(key);
    // `mod(x, 11)` can sometimes produce 0. `mod(x, 10) + 1` is the same, but no 0
    const reduced = mod(num, fieldOrder - _1n) + _1n;
    return isLE ? (0, utils_js_1.numberToBytesLE)(reduced, fieldLen) : (0, utils_js_1.numberToBytesBE)(reduced, fieldLen);
}
exports.mapHashToField = mapHashToField;
//# sourceMappingURL=modular.js.map

/***/ }),

/***/ 92258:
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.validateObject = exports.createHmacDrbg = exports.bitMask = exports.bitSet = exports.bitGet = exports.bitLen = exports.utf8ToBytes = exports.equalBytes = exports.concatBytes = exports.ensureBytes = exports.numberToVarBytesBE = exports.numberToBytesLE = exports.numberToBytesBE = exports.bytesToNumberLE = exports.bytesToNumberBE = exports.hexToBytes = exports.hexToNumber = exports.numberToHexUnpadded = exports.bytesToHex = void 0;
/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
// 100 lines of code in the file are duplicated from noble-hashes (utils).
// This is OK: `abstract` directory does not use noble-hashes.
// User may opt-in into using different hashing library. This way, noble-hashes
// won't be included into their bundle.
const _0n = BigInt(0);
const _1n = BigInt(1);
const _2n = BigInt(2);
const u8a = (a) => a instanceof Uint8Array;
const hexes = /* @__PURE__ */ Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'));
/**
 * @example bytesToHex(Uint8Array.from([0xca, 0xfe, 0x01, 0x23])) // 'cafe0123'
 */
function bytesToHex(bytes) {
    if (!u8a(bytes))
        throw new Error('Uint8Array expected');
    // pre-caching improves the speed 6x
    let hex = '';
    for (let i = 0; i < bytes.length; i++) {
        hex += hexes[bytes[i]];
    }
    return hex;
}
exports.bytesToHex = bytesToHex;
function numberToHexUnpadded(num) {
    const hex = num.toString(16);
    return hex.length & 1 ? `0${hex}` : hex;
}
exports.numberToHexUnpadded = numberToHexUnpadded;
function hexToNumber(hex) {
    if (typeof hex !== 'string')
        throw new Error('hex string expected, got ' + typeof hex);
    // Big Endian
    return BigInt(hex === '' ? '0' : `0x${hex}`);
}
exports.hexToNumber = hexToNumber;
/**
 * @example hexToBytes('cafe0123') // Uint8Array.from([0xca, 0xfe, 0x01, 0x23])
 */
function hexToBytes(hex) {
    if (typeof hex !== 'string')
        throw new Error('hex string expected, got ' + typeof hex);
    const len = hex.length;
    if (len % 2)
        throw new Error('padded hex string expected, got unpadded hex of length ' + len);
    const array = new Uint8Array(len / 2);
    for (let i = 0; i < array.length; i++) {
        const j = i * 2;
        const hexByte = hex.slice(j, j + 2);
        const byte = Number.parseInt(hexByte, 16);
        if (Number.isNaN(byte) || byte < 0)
            throw new Error('Invalid byte sequence');
        array[i] = byte;
    }
    return array;
}
exports.hexToBytes = hexToBytes;
// BE: Big Endian, LE: Little Endian
function bytesToNumberBE(bytes) {
    return hexToNumber(bytesToHex(bytes));
}
exports.bytesToNumberBE = bytesToNumberBE;
function bytesToNumberLE(bytes) {
    if (!u8a(bytes))
        throw new Error('Uint8Array expected');
    return hexToNumber(bytesToHex(Uint8Array.from(bytes).reverse()));
}
exports.bytesToNumberLE = bytesToNumberLE;
function numberToBytesBE(n, len) {
    return hexToBytes(n.toString(16).padStart(len * 2, '0'));
}
exports.numberToBytesBE = numberToBytesBE;
function numberToBytesLE(n, len) {
    return numberToBytesBE(n, len).reverse();
}
exports.numberToBytesLE = numberToBytesLE;
// Unpadded, rarely used
function numberToVarBytesBE(n) {
    return hexToBytes(numberToHexUnpadded(n));
}
exports.numberToVarBytesBE = numberToVarBytesBE;
/**
 * Takes hex string or Uint8Array, converts to Uint8Array.
 * Validates output length.
 * Will throw error for other types.
 * @param title descriptive title for an error e.g. 'private key'
 * @param hex hex string or Uint8Array
 * @param expectedLength optional, will compare to result array's length
 * @returns
 */
function ensureBytes(title, hex, expectedLength) {
    let res;
    if (typeof hex === 'string') {
        try {
            res = hexToBytes(hex);
        }
        catch (e) {
            throw new Error(`${title} must be valid hex string, got "${hex}". Cause: ${e}`);
        }
    }
    else if (u8a(hex)) {
        // Uint8Array.from() instead of hash.slice() because node.js Buffer
        // is instance of Uint8Array, and its slice() creates **mutable** copy
        res = Uint8Array.from(hex);
    }
    else {
        throw new Error(`${title} must be hex string or Uint8Array`);
    }
    const len = res.length;
    if (typeof expectedLength === 'number' && len !== expectedLength)
        throw new Error(`${title} expected ${expectedLength} bytes, got ${len}`);
    return res;
}
exports.ensureBytes = ensureBytes;
/**
 * Copies several Uint8Arrays into one.
 */
function concatBytes(...arrays) {
    const r = new Uint8Array(arrays.reduce((sum, a) => sum + a.length, 0));
    let pad = 0; // walk through each item, ensure they have proper type
    arrays.forEach((a) => {
        if (!u8a(a))
            throw new Error('Uint8Array expected');
        r.set(a, pad);
        pad += a.length;
    });
    return r;
}
exports.concatBytes = concatBytes;
function equalBytes(b1, b2) {
    // We don't care about timing attacks here
    if (b1.length !== b2.length)
        return false;
    for (let i = 0; i < b1.length; i++)
        if (b1[i] !== b2[i])
            return false;
    return true;
}
exports.equalBytes = equalBytes;
/**
 * @example utf8ToBytes('abc') // new Uint8Array([97, 98, 99])
 */
function utf8ToBytes(str) {
    if (typeof str !== 'string')
        throw new Error(`utf8ToBytes expected string, got ${typeof str}`);
    return new Uint8Array(new TextEncoder().encode(str)); // https://bugzil.la/1681809
}
exports.utf8ToBytes = utf8ToBytes;
// Bit operations
/**
 * Calculates amount of bits in a bigint.
 * Same as `n.toString(2).length`
 */
function bitLen(n) {
    let len;
    for (len = 0; n > _0n; n >>= _1n, len += 1)
        ;
    return len;
}
exports.bitLen = bitLen;
/**
 * Gets single bit at position.
 * NOTE: first bit position is 0 (same as arrays)
 * Same as `!!+Array.from(n.toString(2)).reverse()[pos]`
 */
function bitGet(n, pos) {
    return (n >> BigInt(pos)) & _1n;
}
exports.bitGet = bitGet;
/**
 * Sets single bit at position.
 */
const bitSet = (n, pos, value) => {
    return n | ((value ? _1n : _0n) << BigInt(pos));
};
exports.bitSet = bitSet;
/**
 * Calculate mask for N bits. Not using ** operator with bigints because of old engines.
 * Same as BigInt(`0b${Array(i).fill('1').join('')}`)
 */
const bitMask = (n) => (_2n << BigInt(n - 1)) - _1n;
exports.bitMask = bitMask;
// DRBG
const u8n = (data) => new Uint8Array(data); // creates Uint8Array
const u8fr = (arr) => Uint8Array.from(arr); // another shortcut
/**
 * Minimal HMAC-DRBG from NIST 800-90 for RFC6979 sigs.
 * @returns function that will call DRBG until 2nd arg returns something meaningful
 * @example
 *   const drbg = createHmacDRBG<Key>(32, 32, hmac);
 *   drbg(seed, bytesToKey); // bytesToKey must return Key or undefined
 */
function createHmacDrbg(hashLen, qByteLen, hmacFn) {
    if (typeof hashLen !== 'number' || hashLen < 2)
        throw new Error('hashLen must be a number');
    if (typeof qByteLen !== 'number' || qByteLen < 2)
        throw new Error('qByteLen must be a number');
    if (typeof hmacFn !== 'function')
        throw new Error('hmacFn must be a function');
    // Step B, Step C: set hashLen to 8*ceil(hlen/8)
    let v = u8n(hashLen); // Minimal non-full-spec HMAC-DRBG from NIST 800-90 for RFC6979 sigs.
    let k = u8n(hashLen); // Steps B and C of RFC6979 3.2: set hashLen, in our case always same
    let i = 0; // Iterations counter, will throw when over 1000
    const reset = () => {
        v.fill(1);
        k.fill(0);
        i = 0;
    };
    const h = (...b) => hmacFn(k, v, ...b); // hmac(k)(v, ...values)
    const reseed = (seed = u8n()) => {
        // HMAC-DRBG reseed() function. Steps D-G
        k = h(u8fr([0x00]), seed); // k = hmac(k || v || 0x00 || seed)
        v = h(); // v = hmac(k || v)
        if (seed.length === 0)
            return;
        k = h(u8fr([0x01]), seed); // k = hmac(k || v || 0x01 || seed)
        v = h(); // v = hmac(k || v)
    };
    const gen = () => {
        // HMAC-DRBG generate() function
        if (i++ >= 1000)
            throw new Error('drbg: tried 1000 values');
        let len = 0;
        const out = [];
        while (len < qByteLen) {
            v = h();
            const sl = v.slice();
            out.push(sl);
            len += v.length;
        }
        return concatBytes(...out);
    };
    const genUntil = (seed, pred) => {
        reset();
        reseed(seed); // Steps D-G
        let res = undefined; // Step H: grind until k is in [1..n-1]
        while (!(res = pred(gen())))
            reseed();
        reset();
        return res;
    };
    return genUntil;
}
exports.createHmacDrbg = createHmacDrbg;
// Validating curves and fields
const validatorFns = {
    bigint: (val) => typeof val === 'bigint',
    function: (val) => typeof val === 'function',
    boolean: (val) => typeof val === 'boolean',
    string: (val) => typeof val === 'string',
    stringOrUint8Array: (val) => typeof val === 'string' || val instanceof Uint8Array,
    isSafeInteger: (val) => Number.isSafeInteger(val),
    array: (val) => Array.isArray(val),
    field: (val, object) => object.Fp.isValid(val),
    hash: (val) => typeof val === 'function' && Number.isSafeInteger(val.outputLen),
};
// type Record<K extends string | number | symbol, T> = { [P in K]: T; }
function validateObject(object, validators, optValidators = {}) {
    const checkField = (fieldName, type, isOptional) => {
        const checkVal = validatorFns[type];
        if (typeof checkVal !== 'function')
            throw new Error(`Invalid validator "${type}", expected function`);
        const val = object[fieldName];
        if (isOptional && val === undefined)
            return;
        if (!checkVal(val, object)) {
            throw new Error(`Invalid param ${String(fieldName)}=${val} (${typeof val}), expected ${type}`);
        }
    };
    for (const [fieldName, type] of Object.entries(validators))
        checkField(fieldName, type, false);
    for (const [fieldName, type] of Object.entries(optValidators))
        checkField(fieldName, type, true);
    return object;
}
exports.validateObject = validateObject;
// validate type tests
// const o: { a: number; b: number; c: number } = { a: 1, b: 5, c: 6 };
// const z0 = validateObject(o, { a: 'isSafeInteger' }, { c: 'bigint' }); // Ok!
// // Should fail type-check
// const z1 = validateObject(o, { a: 'tmp' }, { c: 'zz' });
// const z2 = validateObject(o, { a: 'isSafeInteger' }, { c: 'zz' });
// const z3 = validateObject(o, { test: 'boolean', z: 'bug' });
// const z4 = validateObject(o, { a: 'boolean', z: 'bug' });
//# sourceMappingURL=utils.js.map

/***/ }),

/***/ 57875:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.mapToCurveSimpleSWU = exports.SWUFpSqrtRatio = exports.weierstrass = exports.weierstrassPoints = exports.DER = void 0;
/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
// Short Weierstrass curve. The formula is: y² = x³ + ax + b
const mod = __webpack_require__(51881);
const ut = __webpack_require__(92258);
const utils_js_1 = __webpack_require__(92258);
const curve_js_1 = __webpack_require__(9748);
function validatePointOpts(curve) {
    const opts = (0, curve_js_1.validateBasic)(curve);
    ut.validateObject(opts, {
        a: 'field',
        b: 'field',
    }, {
        allowedPrivateKeyLengths: 'array',
        wrapPrivateKey: 'boolean',
        isTorsionFree: 'function',
        clearCofactor: 'function',
        allowInfinityPoint: 'boolean',
        fromBytes: 'function',
        toBytes: 'function',
    });
    const { endo, Fp, a } = opts;
    if (endo) {
        if (!Fp.eql(a, Fp.ZERO)) {
            throw new Error('Endomorphism can only be defined for Koblitz curves that have a=0');
        }
        if (typeof endo !== 'object' ||
            typeof endo.beta !== 'bigint' ||
            typeof endo.splitScalar !== 'function') {
            throw new Error('Expected endomorphism with beta: bigint and splitScalar: function');
        }
    }
    return Object.freeze({ ...opts });
}
// ASN.1 DER encoding utilities
const { bytesToNumberBE: b2n, hexToBytes: h2b } = ut;
exports.DER = {
    // asn.1 DER encoding utils
    Err: class DERErr extends Error {
        constructor(m = '') {
            super(m);
        }
    },
    _parseInt(data) {
        const { Err: E } = exports.DER;
        if (data.length < 2 || data[0] !== 0x02)
            throw new E('Invalid signature integer tag');
        const len = data[1];
        const res = data.subarray(2, len + 2);
        if (!len || res.length !== len)
            throw new E('Invalid signature integer: wrong length');
        // https://crypto.stackexchange.com/a/57734 Leftmost bit of first byte is 'negative' flag,
        // since we always use positive integers here. It must always be empty:
        // - add zero byte if exists
        // - if next byte doesn't have a flag, leading zero is not allowed (minimal encoding)
        if (res[0] & 0b10000000)
            throw new E('Invalid signature integer: negative');
        if (res[0] === 0x00 && !(res[1] & 0b10000000))
            throw new E('Invalid signature integer: unnecessary leading zero');
        return { d: b2n(res), l: data.subarray(len + 2) }; // d is data, l is left
    },
    toSig(hex) {
        // parse DER signature
        const { Err: E } = exports.DER;
        const data = typeof hex === 'string' ? h2b(hex) : hex;
        if (!(data instanceof Uint8Array))
            throw new Error('ui8a expected');
        let l = data.length;
        if (l < 2 || data[0] != 0x30)
            throw new E('Invalid signature tag');
        if (data[1] !== l - 2)
            throw new E('Invalid signature: incorrect length');
        const { d: r, l: sBytes } = exports.DER._parseInt(data.subarray(2));
        const { d: s, l: rBytesLeft } = exports.DER._parseInt(sBytes);
        if (rBytesLeft.length)
            throw new E('Invalid signature: left bytes after parsing');
        return { r, s };
    },
    hexFromSig(sig) {
        // Add leading zero if first byte has negative bit enabled. More details in '_parseInt'
        const slice = (s) => (Number.parseInt(s[0], 16) & 0b1000 ? '00' + s : s);
        const h = (num) => {
            const hex = num.toString(16);
            return hex.length & 1 ? `0${hex}` : hex;
        };
        const s = slice(h(sig.s));
        const r = slice(h(sig.r));
        const shl = s.length / 2;
        const rhl = r.length / 2;
        const sl = h(shl);
        const rl = h(rhl);
        return `30${h(rhl + shl + 4)}02${rl}${r}02${sl}${s}`;
    },
};
// Be friendly to bad ECMAScript parsers by not using bigint literals
// prettier-ignore
const _0n = BigInt(0), _1n = BigInt(1), _2n = BigInt(2), _3n = BigInt(3), _4n = BigInt(4);
function weierstrassPoints(opts) {
    const CURVE = validatePointOpts(opts);
    const { Fp } = CURVE; // All curves has same field / group length as for now, but they can differ
    const toBytes = CURVE.toBytes ||
        ((_c, point, _isCompressed) => {
            const a = point.toAffine();
            return ut.concatBytes(Uint8Array.from([0x04]), Fp.toBytes(a.x), Fp.toBytes(a.y));
        });
    const fromBytes = CURVE.fromBytes ||
        ((bytes) => {
            // const head = bytes[0];
            const tail = bytes.subarray(1);
            // if (head !== 0x04) throw new Error('Only non-compressed encoding is supported');
            const x = Fp.fromBytes(tail.subarray(0, Fp.BYTES));
            const y = Fp.fromBytes(tail.subarray(Fp.BYTES, 2 * Fp.BYTES));
            return { x, y };
        });
    /**
     * y² = x³ + ax + b: Short weierstrass curve formula
     * @returns y²
     */
    function weierstrassEquation(x) {
        const { a, b } = CURVE;
        const x2 = Fp.sqr(x); // x * x
        const x3 = Fp.mul(x2, x); // x2 * x
        return Fp.add(Fp.add(x3, Fp.mul(x, a)), b); // x3 + a * x + b
    }
    // Validate whether the passed curve params are valid.
    // We check if curve equation works for generator point.
    // `assertValidity()` won't work: `isTorsionFree()` is not available at this point in bls12-381.
    // ProjectivePoint class has not been initialized yet.
    if (!Fp.eql(Fp.sqr(CURVE.Gy), weierstrassEquation(CURVE.Gx)))
        throw new Error('bad generator point: equation left != right');
    // Valid group elements reside in range 1..n-1
    function isWithinCurveOrder(num) {
        return typeof num === 'bigint' && _0n < num && num < CURVE.n;
    }
    function assertGE(num) {
        if (!isWithinCurveOrder(num))
            throw new Error('Expected valid bigint: 0 < bigint < curve.n');
    }
    // Validates if priv key is valid and converts it to bigint.
    // Supports options allowedPrivateKeyLengths and wrapPrivateKey.
    function normPrivateKeyToScalar(key) {
        const { allowedPrivateKeyLengths: lengths, nByteLength, wrapPrivateKey, n } = CURVE;
        if (lengths && typeof key !== 'bigint') {
            if (key instanceof Uint8Array)
                key = ut.bytesToHex(key);
            // Normalize to hex string, pad. E.g. P521 would norm 130-132 char hex to 132-char bytes
            if (typeof key !== 'string' || !lengths.includes(key.length))
                throw new Error('Invalid key');
            key = key.padStart(nByteLength * 2, '0');
        }
        let num;
        try {
            num =
                typeof key === 'bigint'
                    ? key
                    : ut.bytesToNumberBE((0, utils_js_1.ensureBytes)('private key', key, nByteLength));
        }
        catch (error) {
            throw new Error(`private key must be ${nByteLength} bytes, hex or bigint, not ${typeof key}`);
        }
        if (wrapPrivateKey)
            num = mod.mod(num, n); // disabled by default, enabled for BLS
        assertGE(num); // num in range [1..N-1]
        return num;
    }
    const pointPrecomputes = new Map();
    function assertPrjPoint(other) {
        if (!(other instanceof Point))
            throw new Error('ProjectivePoint expected');
    }
    /**
     * Projective Point works in 3d / projective (homogeneous) coordinates: (x, y, z) ∋ (x=x/z, y=y/z)
     * Default Point works in 2d / affine coordinates: (x, y)
     * We're doing calculations in projective, because its operations don't require costly inversion.
     */
    class Point {
        constructor(px, py, pz) {
            this.px = px;
            this.py = py;
            this.pz = pz;
            if (px == null || !Fp.isValid(px))
                throw new Error('x required');
            if (py == null || !Fp.isValid(py))
                throw new Error('y required');
            if (pz == null || !Fp.isValid(pz))
                throw new Error('z required');
        }
        // Does not validate if the point is on-curve.
        // Use fromHex instead, or call assertValidity() later.
        static fromAffine(p) {
            const { x, y } = p || {};
            if (!p || !Fp.isValid(x) || !Fp.isValid(y))
                throw new Error('invalid affine point');
            if (p instanceof Point)
                throw new Error('projective point not allowed');
            const is0 = (i) => Fp.eql(i, Fp.ZERO);
            // fromAffine(x:0, y:0) would produce (x:0, y:0, z:1), but we need (x:0, y:1, z:0)
            if (is0(x) && is0(y))
                return Point.ZERO;
            return new Point(x, y, Fp.ONE);
        }
        get x() {
            return this.toAffine().x;
        }
        get y() {
            return this.toAffine().y;
        }
        /**
         * Takes a bunch of Projective Points but executes only one
         * inversion on all of them. Inversion is very slow operation,
         * so this improves performance massively.
         * Optimization: converts a list of projective points to a list of identical points with Z=1.
         */
        static normalizeZ(points) {
            const toInv = Fp.invertBatch(points.map((p) => p.pz));
            return points.map((p, i) => p.toAffine(toInv[i])).map(Point.fromAffine);
        }
        /**
         * Converts hash string or Uint8Array to Point.
         * @param hex short/long ECDSA hex
         */
        static fromHex(hex) {
            const P = Point.fromAffine(fromBytes((0, utils_js_1.ensureBytes)('pointHex', hex)));
            P.assertValidity();
            return P;
        }
        // Multiplies generator point by privateKey.
        static fromPrivateKey(privateKey) {
            return Point.BASE.multiply(normPrivateKeyToScalar(privateKey));
        }
        // "Private method", don't use it directly
        _setWindowSize(windowSize) {
            this._WINDOW_SIZE = windowSize;
            pointPrecomputes.delete(this);
        }
        // A point on curve is valid if it conforms to equation.
        assertValidity() {
            if (this.is0()) {
                // (0, 1, 0) aka ZERO is invalid in most contexts.
                // In BLS, ZERO can be serialized, so we allow it.
                // (0, 0, 0) is wrong representation of ZERO and is always invalid.
                if (CURVE.allowInfinityPoint && !Fp.is0(this.py))
                    return;
                throw new Error('bad point: ZERO');
            }
            // Some 3rd-party test vectors require different wording between here & `fromCompressedHex`
            const { x, y } = this.toAffine();
            // Check if x, y are valid field elements
            if (!Fp.isValid(x) || !Fp.isValid(y))
                throw new Error('bad point: x or y not FE');
            const left = Fp.sqr(y); // y²
            const right = weierstrassEquation(x); // x³ + ax + b
            if (!Fp.eql(left, right))
                throw new Error('bad point: equation left != right');
            if (!this.isTorsionFree())
                throw new Error('bad point: not in prime-order subgroup');
        }
        hasEvenY() {
            const { y } = this.toAffine();
            if (Fp.isOdd)
                return !Fp.isOdd(y);
            throw new Error("Field doesn't support isOdd");
        }
        /**
         * Compare one point to another.
         */
        equals(other) {
            assertPrjPoint(other);
            const { px: X1, py: Y1, pz: Z1 } = this;
            const { px: X2, py: Y2, pz: Z2 } = other;
            const U1 = Fp.eql(Fp.mul(X1, Z2), Fp.mul(X2, Z1));
            const U2 = Fp.eql(Fp.mul(Y1, Z2), Fp.mul(Y2, Z1));
            return U1 && U2;
        }
        /**
         * Flips point to one corresponding to (x, -y) in Affine coordinates.
         */
        negate() {
            return new Point(this.px, Fp.neg(this.py), this.pz);
        }
        // Renes-Costello-Batina exception-free doubling formula.
        // There is 30% faster Jacobian formula, but it is not complete.
        // https://eprint.iacr.org/2015/1060, algorithm 3
        // Cost: 8M + 3S + 3*a + 2*b3 + 15add.
        double() {
            const { a, b } = CURVE;
            const b3 = Fp.mul(b, _3n);
            const { px: X1, py: Y1, pz: Z1 } = this;
            let X3 = Fp.ZERO, Y3 = Fp.ZERO, Z3 = Fp.ZERO; // prettier-ignore
            let t0 = Fp.mul(X1, X1); // step 1
            let t1 = Fp.mul(Y1, Y1);
            let t2 = Fp.mul(Z1, Z1);
            let t3 = Fp.mul(X1, Y1);
            t3 = Fp.add(t3, t3); // step 5
            Z3 = Fp.mul(X1, Z1);
            Z3 = Fp.add(Z3, Z3);
            X3 = Fp.mul(a, Z3);
            Y3 = Fp.mul(b3, t2);
            Y3 = Fp.add(X3, Y3); // step 10
            X3 = Fp.sub(t1, Y3);
            Y3 = Fp.add(t1, Y3);
            Y3 = Fp.mul(X3, Y3);
            X3 = Fp.mul(t3, X3);
            Z3 = Fp.mul(b3, Z3); // step 15
            t2 = Fp.mul(a, t2);
            t3 = Fp.sub(t0, t2);
            t3 = Fp.mul(a, t3);
            t3 = Fp.add(t3, Z3);
            Z3 = Fp.add(t0, t0); // step 20
            t0 = Fp.add(Z3, t0);
            t0 = Fp.add(t0, t2);
            t0 = Fp.mul(t0, t3);
            Y3 = Fp.add(Y3, t0);
            t2 = Fp.mul(Y1, Z1); // step 25
            t2 = Fp.add(t2, t2);
            t0 = Fp.mul(t2, t3);
            X3 = Fp.sub(X3, t0);
            Z3 = Fp.mul(t2, t1);
            Z3 = Fp.add(Z3, Z3); // step 30
            Z3 = Fp.add(Z3, Z3);
            return new Point(X3, Y3, Z3);
        }
        // Renes-Costello-Batina exception-free addition formula.
        // There is 30% faster Jacobian formula, but it is not complete.
        // https://eprint.iacr.org/2015/1060, algorithm 1
        // Cost: 12M + 0S + 3*a + 3*b3 + 23add.
        add(other) {
            assertPrjPoint(other);
            const { px: X1, py: Y1, pz: Z1 } = this;
            const { px: X2, py: Y2, pz: Z2 } = other;
            let X3 = Fp.ZERO, Y3 = Fp.ZERO, Z3 = Fp.ZERO; // prettier-ignore
            const a = CURVE.a;
            const b3 = Fp.mul(CURVE.b, _3n);
            let t0 = Fp.mul(X1, X2); // step 1
            let t1 = Fp.mul(Y1, Y2);
            let t2 = Fp.mul(Z1, Z2);
            let t3 = Fp.add(X1, Y1);
            let t4 = Fp.add(X2, Y2); // step 5
            t3 = Fp.mul(t3, t4);
            t4 = Fp.add(t0, t1);
            t3 = Fp.sub(t3, t4);
            t4 = Fp.add(X1, Z1);
            let t5 = Fp.add(X2, Z2); // step 10
            t4 = Fp.mul(t4, t5);
            t5 = Fp.add(t0, t2);
            t4 = Fp.sub(t4, t5);
            t5 = Fp.add(Y1, Z1);
            X3 = Fp.add(Y2, Z2); // step 15
            t5 = Fp.mul(t5, X3);
            X3 = Fp.add(t1, t2);
            t5 = Fp.sub(t5, X3);
            Z3 = Fp.mul(a, t4);
            X3 = Fp.mul(b3, t2); // step 20
            Z3 = Fp.add(X3, Z3);
            X3 = Fp.sub(t1, Z3);
            Z3 = Fp.add(t1, Z3);
            Y3 = Fp.mul(X3, Z3);
            t1 = Fp.add(t0, t0); // step 25
            t1 = Fp.add(t1, t0);
            t2 = Fp.mul(a, t2);
            t4 = Fp.mul(b3, t4);
            t1 = Fp.add(t1, t2);
            t2 = Fp.sub(t0, t2); // step 30
            t2 = Fp.mul(a, t2);
            t4 = Fp.add(t4, t2);
            t0 = Fp.mul(t1, t4);
            Y3 = Fp.add(Y3, t0);
            t0 = Fp.mul(t5, t4); // step 35
            X3 = Fp.mul(t3, X3);
            X3 = Fp.sub(X3, t0);
            t0 = Fp.mul(t3, t1);
            Z3 = Fp.mul(t5, Z3);
            Z3 = Fp.add(Z3, t0); // step 40
            return new Point(X3, Y3, Z3);
        }
        subtract(other) {
            return this.add(other.negate());
        }
        is0() {
            return this.equals(Point.ZERO);
        }
        wNAF(n) {
            return wnaf.wNAFCached(this, pointPrecomputes, n, (comp) => {
                const toInv = Fp.invertBatch(comp.map((p) => p.pz));
                return comp.map((p, i) => p.toAffine(toInv[i])).map(Point.fromAffine);
            });
        }
        /**
         * Non-constant-time multiplication. Uses double-and-add algorithm.
         * It's faster, but should only be used when you don't care about
         * an exposed private key e.g. sig verification, which works over *public* keys.
         */
        multiplyUnsafe(n) {
            const I = Point.ZERO;
            if (n === _0n)
                return I;
            assertGE(n); // Will throw on 0
            if (n === _1n)
                return this;
            const { endo } = CURVE;
            if (!endo)
                return wnaf.unsafeLadder(this, n);
            // Apply endomorphism
            let { k1neg, k1, k2neg, k2 } = endo.splitScalar(n);
            let k1p = I;
            let k2p = I;
            let d = this;
            while (k1 > _0n || k2 > _0n) {
                if (k1 & _1n)
                    k1p = k1p.add(d);
                if (k2 & _1n)
                    k2p = k2p.add(d);
                d = d.double();
                k1 >>= _1n;
                k2 >>= _1n;
            }
            if (k1neg)
                k1p = k1p.negate();
            if (k2neg)
                k2p = k2p.negate();
            k2p = new Point(Fp.mul(k2p.px, endo.beta), k2p.py, k2p.pz);
            return k1p.add(k2p);
        }
        /**
         * Constant time multiplication.
         * Uses wNAF method. Windowed method may be 10% faster,
         * but takes 2x longer to generate and consumes 2x memory.
         * Uses precomputes when available.
         * Uses endomorphism for Koblitz curves.
         * @param scalar by which the point would be multiplied
         * @returns New point
         */
        multiply(scalar) {
            assertGE(scalar);
            let n = scalar;
            let point, fake; // Fake point is used to const-time mult
            const { endo } = CURVE;
            if (endo) {
                const { k1neg, k1, k2neg, k2 } = endo.splitScalar(n);
                let { p: k1p, f: f1p } = this.wNAF(k1);
                let { p: k2p, f: f2p } = this.wNAF(k2);
                k1p = wnaf.constTimeNegate(k1neg, k1p);
                k2p = wnaf.constTimeNegate(k2neg, k2p);
                k2p = new Point(Fp.mul(k2p.px, endo.beta), k2p.py, k2p.pz);
                point = k1p.add(k2p);
                fake = f1p.add(f2p);
            }
            else {
                const { p, f } = this.wNAF(n);
                point = p;
                fake = f;
            }
            // Normalize `z` for both points, but return only real one
            return Point.normalizeZ([point, fake])[0];
        }
        /**
         * Efficiently calculate `aP + bQ`. Unsafe, can expose private key, if used incorrectly.
         * Not using Strauss-Shamir trick: precomputation tables are faster.
         * The trick could be useful if both P and Q are not G (not in our case).
         * @returns non-zero affine point
         */
        multiplyAndAddUnsafe(Q, a, b) {
            const G = Point.BASE; // No Strauss-Shamir trick: we have 10% faster G precomputes
            const mul = (P, a // Select faster multiply() method
            ) => (a === _0n || a === _1n || !P.equals(G) ? P.multiplyUnsafe(a) : P.multiply(a));
            const sum = mul(this, a).add(mul(Q, b));
            return sum.is0() ? undefined : sum;
        }
        // Converts Projective point to affine (x, y) coordinates.
        // Can accept precomputed Z^-1 - for example, from invertBatch.
        // (x, y, z) ∋ (x=x/z, y=y/z)
        toAffine(iz) {
            const { px: x, py: y, pz: z } = this;
            const is0 = this.is0();
            // If invZ was 0, we return zero point. However we still want to execute
            // all operations, so we replace invZ with a random number, 1.
            if (iz == null)
                iz = is0 ? Fp.ONE : Fp.inv(z);
            const ax = Fp.mul(x, iz);
            const ay = Fp.mul(y, iz);
            const zz = Fp.mul(z, iz);
            if (is0)
                return { x: Fp.ZERO, y: Fp.ZERO };
            if (!Fp.eql(zz, Fp.ONE))
                throw new Error('invZ was invalid');
            return { x: ax, y: ay };
        }
        isTorsionFree() {
            const { h: cofactor, isTorsionFree } = CURVE;
            if (cofactor === _1n)
                return true; // No subgroups, always torsion-free
            if (isTorsionFree)
                return isTorsionFree(Point, this);
            throw new Error('isTorsionFree() has not been declared for the elliptic curve');
        }
        clearCofactor() {
            const { h: cofactor, clearCofactor } = CURVE;
            if (cofactor === _1n)
                return this; // Fast-path
            if (clearCofactor)
                return clearCofactor(Point, this);
            return this.multiplyUnsafe(CURVE.h);
        }
        toRawBytes(isCompressed = true) {
            this.assertValidity();
            return toBytes(Point, this, isCompressed);
        }
        toHex(isCompressed = true) {
            return ut.bytesToHex(this.toRawBytes(isCompressed));
        }
    }
    Point.BASE = new Point(CURVE.Gx, CURVE.Gy, Fp.ONE);
    Point.ZERO = new Point(Fp.ZERO, Fp.ONE, Fp.ZERO);
    const _bits = CURVE.nBitLength;
    const wnaf = (0, curve_js_1.wNAF)(Point, CURVE.endo ? Math.ceil(_bits / 2) : _bits);
    // Validate if generator point is on curve
    return {
        CURVE,
        ProjectivePoint: Point,
        normPrivateKeyToScalar,
        weierstrassEquation,
        isWithinCurveOrder,
    };
}
exports.weierstrassPoints = weierstrassPoints;
function validateOpts(curve) {
    const opts = (0, curve_js_1.validateBasic)(curve);
    ut.validateObject(opts, {
        hash: 'hash',
        hmac: 'function',
        randomBytes: 'function',
    }, {
        bits2int: 'function',
        bits2int_modN: 'function',
        lowS: 'boolean',
    });
    return Object.freeze({ lowS: true, ...opts });
}
function weierstrass(curveDef) {
    const CURVE = validateOpts(curveDef);
    const { Fp, n: CURVE_ORDER } = CURVE;
    const compressedLen = Fp.BYTES + 1; // e.g. 33 for 32
    const uncompressedLen = 2 * Fp.BYTES + 1; // e.g. 65 for 32
    function isValidFieldElement(num) {
        return _0n < num && num < Fp.ORDER; // 0 is banned since it's not invertible FE
    }
    function modN(a) {
        return mod.mod(a, CURVE_ORDER);
    }
    function invN(a) {
        return mod.invert(a, CURVE_ORDER);
    }
    const { ProjectivePoint: Point, normPrivateKeyToScalar, weierstrassEquation, isWithinCurveOrder, } = weierstrassPoints({
        ...CURVE,
        toBytes(_c, point, isCompressed) {
            const a = point.toAffine();
            const x = Fp.toBytes(a.x);
            const cat = ut.concatBytes;
            if (isCompressed) {
                return cat(Uint8Array.from([point.hasEvenY() ? 0x02 : 0x03]), x);
            }
            else {
                return cat(Uint8Array.from([0x04]), x, Fp.toBytes(a.y));
            }
        },
        fromBytes(bytes) {
            const len = bytes.length;
            const head = bytes[0];
            const tail = bytes.subarray(1);
            // this.assertValidity() is done inside of fromHex
            if (len === compressedLen && (head === 0x02 || head === 0x03)) {
                const x = ut.bytesToNumberBE(tail);
                if (!isValidFieldElement(x))
                    throw new Error('Point is not on curve');
                const y2 = weierstrassEquation(x); // y² = x³ + ax + b
                let y = Fp.sqrt(y2); // y = y² ^ (p+1)/4
                const isYOdd = (y & _1n) === _1n;
                // ECDSA
                const isHeadOdd = (head & 1) === 1;
                if (isHeadOdd !== isYOdd)
                    y = Fp.neg(y);
                return { x, y };
            }
            else if (len === uncompressedLen && head === 0x04) {
                const x = Fp.fromBytes(tail.subarray(0, Fp.BYTES));
                const y = Fp.fromBytes(tail.subarray(Fp.BYTES, 2 * Fp.BYTES));
                return { x, y };
            }
            else {
                throw new Error(`Point of length ${len} was invalid. Expected ${compressedLen} compressed bytes or ${uncompressedLen} uncompressed bytes`);
            }
        },
    });
    const numToNByteStr = (num) => ut.bytesToHex(ut.numberToBytesBE(num, CURVE.nByteLength));
    function isBiggerThanHalfOrder(number) {
        const HALF = CURVE_ORDER >> _1n;
        return number > HALF;
    }
    function normalizeS(s) {
        return isBiggerThanHalfOrder(s) ? modN(-s) : s;
    }
    // slice bytes num
    const slcNum = (b, from, to) => ut.bytesToNumberBE(b.slice(from, to));
    /**
     * ECDSA signature with its (r, s) properties. Supports DER & compact representations.
     */
    class Signature {
        constructor(r, s, recovery) {
            this.r = r;
            this.s = s;
            this.recovery = recovery;
            this.assertValidity();
        }
        // pair (bytes of r, bytes of s)
        static fromCompact(hex) {
            const l = CURVE.nByteLength;
            hex = (0, utils_js_1.ensureBytes)('compactSignature', hex, l * 2);
            return new Signature(slcNum(hex, 0, l), slcNum(hex, l, 2 * l));
        }
        // DER encoded ECDSA signature
        // https://bitcoin.stackexchange.com/questions/57644/what-are-the-parts-of-a-bitcoin-transaction-input-script
        static fromDER(hex) {
            const { r, s } = exports.DER.toSig((0, utils_js_1.ensureBytes)('DER', hex));
            return new Signature(r, s);
        }
        assertValidity() {
            // can use assertGE here
            if (!isWithinCurveOrder(this.r))
                throw new Error('r must be 0 < r < CURVE.n');
            if (!isWithinCurveOrder(this.s))
                throw new Error('s must be 0 < s < CURVE.n');
        }
        addRecoveryBit(recovery) {
            return new Signature(this.r, this.s, recovery);
        }
        recoverPublicKey(msgHash) {
            const { r, s, recovery: rec } = this;
            const h = bits2int_modN((0, utils_js_1.ensureBytes)('msgHash', msgHash)); // Truncate hash
            if (rec == null || ![0, 1, 2, 3].includes(rec))
                throw new Error('recovery id invalid');
            const radj = rec === 2 || rec === 3 ? r + CURVE.n : r;
            if (radj >= Fp.ORDER)
                throw new Error('recovery id 2 or 3 invalid');
            const prefix = (rec & 1) === 0 ? '02' : '03';
            const R = Point.fromHex(prefix + numToNByteStr(radj));
            const ir = invN(radj); // r^-1
            const u1 = modN(-h * ir); // -hr^-1
            const u2 = modN(s * ir); // sr^-1
            const Q = Point.BASE.multiplyAndAddUnsafe(R, u1, u2); // (sr^-1)R-(hr^-1)G = -(hr^-1)G + (sr^-1)
            if (!Q)
                throw new Error('point at infinify'); // unsafe is fine: no priv data leaked
            Q.assertValidity();
            return Q;
        }
        // Signatures should be low-s, to prevent malleability.
        hasHighS() {
            return isBiggerThanHalfOrder(this.s);
        }
        normalizeS() {
            return this.hasHighS() ? new Signature(this.r, modN(-this.s), this.recovery) : this;
        }
        // DER-encoded
        toDERRawBytes() {
            return ut.hexToBytes(this.toDERHex());
        }
        toDERHex() {
            return exports.DER.hexFromSig({ r: this.r, s: this.s });
        }
        // padded bytes of r, then padded bytes of s
        toCompactRawBytes() {
            return ut.hexToBytes(this.toCompactHex());
        }
        toCompactHex() {
            return numToNByteStr(this.r) + numToNByteStr(this.s);
        }
    }
    const utils = {
        isValidPrivateKey(privateKey) {
            try {
                normPrivateKeyToScalar(privateKey);
                return true;
            }
            catch (error) {
                return false;
            }
        },
        normPrivateKeyToScalar: normPrivateKeyToScalar,
        /**
         * Produces cryptographically secure private key from random of size
         * (groupLen + ceil(groupLen / 2)) with modulo bias being negligible.
         */
        randomPrivateKey: () => {
            const length = mod.getMinHashLength(CURVE.n);
            return mod.mapHashToField(CURVE.randomBytes(length), CURVE.n);
        },
        /**
         * Creates precompute table for an arbitrary EC point. Makes point "cached".
         * Allows to massively speed-up `point.multiply(scalar)`.
         * @returns cached point
         * @example
         * const fast = utils.precompute(8, ProjectivePoint.fromHex(someonesPubKey));
         * fast.multiply(privKey); // much faster ECDH now
         */
        precompute(windowSize = 8, point = Point.BASE) {
            point._setWindowSize(windowSize);
            point.multiply(BigInt(3)); // 3 is arbitrary, just need any number here
            return point;
        },
    };
    /**
     * Computes public key for a private key. Checks for validity of the private key.
     * @param privateKey private key
     * @param isCompressed whether to return compact (default), or full key
     * @returns Public key, full when isCompressed=false; short when isCompressed=true
     */
    function getPublicKey(privateKey, isCompressed = true) {
        return Point.fromPrivateKey(privateKey).toRawBytes(isCompressed);
    }
    /**
     * Quick and dirty check for item being public key. Does not validate hex, or being on-curve.
     */
    function isProbPub(item) {
        const arr = item instanceof Uint8Array;
        const str = typeof item === 'string';
        const len = (arr || str) && item.length;
        if (arr)
            return len === compressedLen || len === uncompressedLen;
        if (str)
            return len === 2 * compressedLen || len === 2 * uncompressedLen;
        if (item instanceof Point)
            return true;
        return false;
    }
    /**
     * ECDH (Elliptic Curve Diffie Hellman).
     * Computes shared public key from private key and public key.
     * Checks: 1) private key validity 2) shared key is on-curve.
     * Does NOT hash the result.
     * @param privateA private key
     * @param publicB different public key
     * @param isCompressed whether to return compact (default), or full key
     * @returns shared public key
     */
    function getSharedSecret(privateA, publicB, isCompressed = true) {
        if (isProbPub(privateA))
            throw new Error('first arg must be private key');
        if (!isProbPub(publicB))
            throw new Error('second arg must be public key');
        const b = Point.fromHex(publicB); // check for being on-curve
        return b.multiply(normPrivateKeyToScalar(privateA)).toRawBytes(isCompressed);
    }
    // RFC6979: ensure ECDSA msg is X bytes and < N. RFC suggests optional truncating via bits2octets.
    // FIPS 186-4 4.6 suggests the leftmost min(nBitLen, outLen) bits, which matches bits2int.
    // bits2int can produce res>N, we can do mod(res, N) since the bitLen is the same.
    // int2octets can't be used; pads small msgs with 0: unacceptatble for trunc as per RFC vectors
    const bits2int = CURVE.bits2int ||
        function (bytes) {
            // For curves with nBitLength % 8 !== 0: bits2octets(bits2octets(m)) !== bits2octets(m)
            // for some cases, since bytes.length * 8 is not actual bitLength.
            const num = ut.bytesToNumberBE(bytes); // check for == u8 done here
            const delta = bytes.length * 8 - CURVE.nBitLength; // truncate to nBitLength leftmost bits
            return delta > 0 ? num >> BigInt(delta) : num;
        };
    const bits2int_modN = CURVE.bits2int_modN ||
        function (bytes) {
            return modN(bits2int(bytes)); // can't use bytesToNumberBE here
        };
    // NOTE: pads output with zero as per spec
    const ORDER_MASK = ut.bitMask(CURVE.nBitLength);
    /**
     * Converts to bytes. Checks if num in `[0..ORDER_MASK-1]` e.g.: `[0..2^256-1]`.
     */
    function int2octets(num) {
        if (typeof num !== 'bigint')
            throw new Error('bigint expected');
        if (!(_0n <= num && num < ORDER_MASK))
            throw new Error(`bigint expected < 2^${CURVE.nBitLength}`);
        // works with order, can have different size than numToField!
        return ut.numberToBytesBE(num, CURVE.nByteLength);
    }
    // Steps A, D of RFC6979 3.2
    // Creates RFC6979 seed; converts msg/privKey to numbers.
    // Used only in sign, not in verify.
    // NOTE: we cannot assume here that msgHash has same amount of bytes as curve order, this will be wrong at least for P521.
    // Also it can be bigger for P224 + SHA256
    function prepSig(msgHash, privateKey, opts = defaultSigOpts) {
        if (['recovered', 'canonical'].some((k) => k in opts))
            throw new Error('sign() legacy options not supported');
        const { hash, randomBytes } = CURVE;
        let { lowS, prehash, extraEntropy: ent } = opts; // generates low-s sigs by default
        if (lowS == null)
            lowS = true; // RFC6979 3.2: we skip step A, because we already provide hash
        msgHash = (0, utils_js_1.ensureBytes)('msgHash', msgHash);
        if (prehash)
            msgHash = (0, utils_js_1.ensureBytes)('prehashed msgHash', hash(msgHash));
        // We can't later call bits2octets, since nested bits2int is broken for curves
        // with nBitLength % 8 !== 0. Because of that, we unwrap it here as int2octets call.
        // const bits2octets = (bits) => int2octets(bits2int_modN(bits))
        const h1int = bits2int_modN(msgHash);
        const d = normPrivateKeyToScalar(privateKey); // validate private key, convert to bigint
        const seedArgs = [int2octets(d), int2octets(h1int)];
        // extraEntropy. RFC6979 3.6: additional k' (optional).
        if (ent != null) {
            // K = HMAC_K(V || 0x00 || int2octets(x) || bits2octets(h1) || k')
            const e = ent === true ? randomBytes(Fp.BYTES) : ent; // generate random bytes OR pass as-is
            seedArgs.push((0, utils_js_1.ensureBytes)('extraEntropy', e)); // check for being bytes
        }
        const seed = ut.concatBytes(...seedArgs); // Step D of RFC6979 3.2
        const m = h1int; // NOTE: no need to call bits2int second time here, it is inside truncateHash!
        // Converts signature params into point w r/s, checks result for validity.
        function k2sig(kBytes) {
            // RFC 6979 Section 3.2, step 3: k = bits2int(T)
            const k = bits2int(kBytes); // Cannot use fields methods, since it is group element
            if (!isWithinCurveOrder(k))
                return; // Important: all mod() calls here must be done over N
            const ik = invN(k); // k^-1 mod n
            const q = Point.BASE.multiply(k).toAffine(); // q = Gk
            const r = modN(q.x); // r = q.x mod n
            if (r === _0n)
                return;
            // Can use scalar blinding b^-1(bm + bdr) where b ∈ [1,q−1] according to
            // https://tches.iacr.org/index.php/TCHES/article/view/7337/6509. We've decided against it:
            // a) dependency on CSPRNG b) 15% slowdown c) doesn't really help since bigints are not CT
            const s = modN(ik * modN(m + r * d)); // Not using blinding here
            if (s === _0n)
                return;
            let recovery = (q.x === r ? 0 : 2) | Number(q.y & _1n); // recovery bit (2 or 3, when q.x > n)
            let normS = s;
            if (lowS && isBiggerThanHalfOrder(s)) {
                normS = normalizeS(s); // if lowS was passed, ensure s is always
                recovery ^= 1; // // in the bottom half of N
            }
            return new Signature(r, normS, recovery); // use normS, not s
        }
        return { seed, k2sig };
    }
    const defaultSigOpts = { lowS: CURVE.lowS, prehash: false };
    const defaultVerOpts = { lowS: CURVE.lowS, prehash: false };
    /**
     * Signs message hash with a private key.
     * ```
     * sign(m, d, k) where
     *   (x, y) = G × k
     *   r = x mod n
     *   s = (m + dr)/k mod n
     * ```
     * @param msgHash NOT message. msg needs to be hashed to `msgHash`, or use `prehash`.
     * @param privKey private key
     * @param opts lowS for non-malleable sigs. extraEntropy for mixing randomness into k. prehash will hash first arg.
     * @returns signature with recovery param
     */
    function sign(msgHash, privKey, opts = defaultSigOpts) {
        const { seed, k2sig } = prepSig(msgHash, privKey, opts); // Steps A, D of RFC6979 3.2.
        const C = CURVE;
        const drbg = ut.createHmacDrbg(C.hash.outputLen, C.nByteLength, C.hmac);
        return drbg(seed, k2sig); // Steps B, C, D, E, F, G
    }
    // Enable precomputes. Slows down first publicKey computation by 20ms.
    Point.BASE._setWindowSize(8);
    // utils.precompute(8, ProjectivePoint.BASE)
    /**
     * Verifies a signature against message hash and public key.
     * Rejects lowS signatures by default: to override,
     * specify option `{lowS: false}`. Implements section 4.1.4 from https://www.secg.org/sec1-v2.pdf:
     *
     * ```
     * verify(r, s, h, P) where
     *   U1 = hs^-1 mod n
     *   U2 = rs^-1 mod n
     *   R = U1⋅G - U2⋅P
     *   mod(R.x, n) == r
     * ```
     */
    function verify(signature, msgHash, publicKey, opts = defaultVerOpts) {
        const sg = signature;
        msgHash = (0, utils_js_1.ensureBytes)('msgHash', msgHash);
        publicKey = (0, utils_js_1.ensureBytes)('publicKey', publicKey);
        if ('strict' in opts)
            throw new Error('options.strict was renamed to lowS');
        const { lowS, prehash } = opts;
        let _sig = undefined;
        let P;
        try {
            if (typeof sg === 'string' || sg instanceof Uint8Array) {
                // Signature can be represented in 2 ways: compact (2*nByteLength) & DER (variable-length).
                // Since DER can also be 2*nByteLength bytes, we check for it first.
                try {
                    _sig = Signature.fromDER(sg);
                }
                catch (derError) {
                    if (!(derError instanceof exports.DER.Err))
                        throw derError;
                    _sig = Signature.fromCompact(sg);
                }
            }
            else if (typeof sg === 'object' && typeof sg.r === 'bigint' && typeof sg.s === 'bigint') {
                const { r, s } = sg;
                _sig = new Signature(r, s);
            }
            else {
                throw new Error('PARSE');
            }
            P = Point.fromHex(publicKey);
        }
        catch (error) {
            if (error.message === 'PARSE')
                throw new Error(`signature must be Signature instance, Uint8Array or hex string`);
            return false;
        }
        if (lowS && _sig.hasHighS())
            return false;
        if (prehash)
            msgHash = CURVE.hash(msgHash);
        const { r, s } = _sig;
        const h = bits2int_modN(msgHash); // Cannot use fields methods, since it is group element
        const is = invN(s); // s^-1
        const u1 = modN(h * is); // u1 = hs^-1 mod n
        const u2 = modN(r * is); // u2 = rs^-1 mod n
        const R = Point.BASE.multiplyAndAddUnsafe(P, u1, u2)?.toAffine(); // R = u1⋅G + u2⋅P
        if (!R)
            return false;
        const v = modN(R.x);
        return v === r;
    }
    return {
        CURVE,
        getPublicKey,
        getSharedSecret,
        sign,
        verify,
        ProjectivePoint: Point,
        Signature,
        utils,
    };
}
exports.weierstrass = weierstrass;
/**
 * Implementation of the Shallue and van de Woestijne method for any weierstrass curve.
 * TODO: check if there is a way to merge this with uvRatio in Edwards; move to modular.
 * b = True and y = sqrt(u / v) if (u / v) is square in F, and
 * b = False and y = sqrt(Z * (u / v)) otherwise.
 * @param Fp
 * @param Z
 * @returns
 */
function SWUFpSqrtRatio(Fp, Z) {
    // Generic implementation
    const q = Fp.ORDER;
    let l = _0n;
    for (let o = q - _1n; o % _2n === _0n; o /= _2n)
        l += _1n;
    const c1 = l; // 1. c1, the largest integer such that 2^c1 divides q - 1.
    // We need 2n ** c1 and 2n ** (c1-1). We can't use **; but we can use <<.
    // 2n ** c1 == 2n << (c1-1)
    const _2n_pow_c1_1 = _2n << (c1 - _1n - _1n);
    const _2n_pow_c1 = _2n_pow_c1_1 * _2n;
    const c2 = (q - _1n) / _2n_pow_c1; // 2. c2 = (q - 1) / (2^c1)  # Integer arithmetic
    const c3 = (c2 - _1n) / _2n; // 3. c3 = (c2 - 1) / 2            # Integer arithmetic
    const c4 = _2n_pow_c1 - _1n; // 4. c4 = 2^c1 - 1                # Integer arithmetic
    const c5 = _2n_pow_c1_1; // 5. c5 = 2^(c1 - 1)                  # Integer arithmetic
    const c6 = Fp.pow(Z, c2); // 6. c6 = Z^c2
    const c7 = Fp.pow(Z, (c2 + _1n) / _2n); // 7. c7 = Z^((c2 + 1) / 2)
    let sqrtRatio = (u, v) => {
        let tv1 = c6; // 1. tv1 = c6
        let tv2 = Fp.pow(v, c4); // 2. tv2 = v^c4
        let tv3 = Fp.sqr(tv2); // 3. tv3 = tv2^2
        tv3 = Fp.mul(tv3, v); // 4. tv3 = tv3 * v
        let tv5 = Fp.mul(u, tv3); // 5. tv5 = u * tv3
        tv5 = Fp.pow(tv5, c3); // 6. tv5 = tv5^c3
        tv5 = Fp.mul(tv5, tv2); // 7. tv5 = tv5 * tv2
        tv2 = Fp.mul(tv5, v); // 8. tv2 = tv5 * v
        tv3 = Fp.mul(tv5, u); // 9. tv3 = tv5 * u
        let tv4 = Fp.mul(tv3, tv2); // 10. tv4 = tv3 * tv2
        tv5 = Fp.pow(tv4, c5); // 11. tv5 = tv4^c5
        let isQR = Fp.eql(tv5, Fp.ONE); // 12. isQR = tv5 == 1
        tv2 = Fp.mul(tv3, c7); // 13. tv2 = tv3 * c7
        tv5 = Fp.mul(tv4, tv1); // 14. tv5 = tv4 * tv1
        tv3 = Fp.cmov(tv2, tv3, isQR); // 15. tv3 = CMOV(tv2, tv3, isQR)
        tv4 = Fp.cmov(tv5, tv4, isQR); // 16. tv4 = CMOV(tv5, tv4, isQR)
        // 17. for i in (c1, c1 - 1, ..., 2):
        for (let i = c1; i > _1n; i--) {
            let tv5 = i - _2n; // 18.    tv5 = i - 2
            tv5 = _2n << (tv5 - _1n); // 19.    tv5 = 2^tv5
            let tvv5 = Fp.pow(tv4, tv5); // 20.    tv5 = tv4^tv5
            const e1 = Fp.eql(tvv5, Fp.ONE); // 21.    e1 = tv5 == 1
            tv2 = Fp.mul(tv3, tv1); // 22.    tv2 = tv3 * tv1
            tv1 = Fp.mul(tv1, tv1); // 23.    tv1 = tv1 * tv1
            tvv5 = Fp.mul(tv4, tv1); // 24.    tv5 = tv4 * tv1
            tv3 = Fp.cmov(tv2, tv3, e1); // 25.    tv3 = CMOV(tv2, tv3, e1)
            tv4 = Fp.cmov(tvv5, tv4, e1); // 26.    tv4 = CMOV(tv5, tv4, e1)
        }
        return { isValid: isQR, value: tv3 };
    };
    if (Fp.ORDER % _4n === _3n) {
        // sqrt_ratio_3mod4(u, v)
        const c1 = (Fp.ORDER - _3n) / _4n; // 1. c1 = (q - 3) / 4     # Integer arithmetic
        const c2 = Fp.sqrt(Fp.neg(Z)); // 2. c2 = sqrt(-Z)
        sqrtRatio = (u, v) => {
            let tv1 = Fp.sqr(v); // 1. tv1 = v^2
            const tv2 = Fp.mul(u, v); // 2. tv2 = u * v
            tv1 = Fp.mul(tv1, tv2); // 3. tv1 = tv1 * tv2
            let y1 = Fp.pow(tv1, c1); // 4. y1 = tv1^c1
            y1 = Fp.mul(y1, tv2); // 5. y1 = y1 * tv2
            const y2 = Fp.mul(y1, c2); // 6. y2 = y1 * c2
            const tv3 = Fp.mul(Fp.sqr(y1), v); // 7. tv3 = y1^2; 8. tv3 = tv3 * v
            const isQR = Fp.eql(tv3, u); // 9. isQR = tv3 == u
            let y = Fp.cmov(y2, y1, isQR); // 10. y = CMOV(y2, y1, isQR)
            return { isValid: isQR, value: y }; // 11. return (isQR, y) isQR ? y : y*c2
        };
    }
    // No curves uses that
    // if (Fp.ORDER % _8n === _5n) // sqrt_ratio_5mod8
    return sqrtRatio;
}
exports.SWUFpSqrtRatio = SWUFpSqrtRatio;
/**
 * Simplified Shallue-van de Woestijne-Ulas Method
 * https://www.rfc-editor.org/rfc/rfc9380#section-6.6.2
 */
function mapToCurveSimpleSWU(Fp, opts) {
    mod.validateField(Fp);
    if (!Fp.isValid(opts.A) || !Fp.isValid(opts.B) || !Fp.isValid(opts.Z))
        throw new Error('mapToCurveSimpleSWU: invalid opts');
    const sqrtRatio = SWUFpSqrtRatio(Fp, opts.Z);
    if (!Fp.isOdd)
        throw new Error('Fp.isOdd is not implemented!');
    // Input: u, an element of F.
    // Output: (x, y), a point on E.
    return (u) => {
        // prettier-ignore
        let tv1, tv2, tv3, tv4, tv5, tv6, x, y;
        tv1 = Fp.sqr(u); // 1.  tv1 = u^2
        tv1 = Fp.mul(tv1, opts.Z); // 2.  tv1 = Z * tv1
        tv2 = Fp.sqr(tv1); // 3.  tv2 = tv1^2
        tv2 = Fp.add(tv2, tv1); // 4.  tv2 = tv2 + tv1
        tv3 = Fp.add(tv2, Fp.ONE); // 5.  tv3 = tv2 + 1
        tv3 = Fp.mul(tv3, opts.B); // 6.  tv3 = B * tv3
        tv4 = Fp.cmov(opts.Z, Fp.neg(tv2), !Fp.eql(tv2, Fp.ZERO)); // 7.  tv4 = CMOV(Z, -tv2, tv2 != 0)
        tv4 = Fp.mul(tv4, opts.A); // 8.  tv4 = A * tv4
        tv2 = Fp.sqr(tv3); // 9.  tv2 = tv3^2
        tv6 = Fp.sqr(tv4); // 10. tv6 = tv4^2
        tv5 = Fp.mul(tv6, opts.A); // 11. tv5 = A * tv6
        tv2 = Fp.add(tv2, tv5); // 12. tv2 = tv2 + tv5
        tv2 = Fp.mul(tv2, tv3); // 13. tv2 = tv2 * tv3
        tv6 = Fp.mul(tv6, tv4); // 14. tv6 = tv6 * tv4
        tv5 = Fp.mul(tv6, opts.B); // 15. tv5 = B * tv6
        tv2 = Fp.add(tv2, tv5); // 16. tv2 = tv2 + tv5
        x = Fp.mul(tv1, tv3); // 17.   x = tv1 * tv3
        const { isValid, value } = sqrtRatio(tv2, tv6); // 18. (is_gx1_square, y1) = sqrt_ratio(tv2, tv6)
        y = Fp.mul(tv1, u); // 19.   y = tv1 * u  -> Z * u^3 * y1
        y = Fp.mul(y, value); // 20.   y = y * y1
        x = Fp.cmov(x, tv3, isValid); // 21.   x = CMOV(x, tv3, is_gx1_square)
        y = Fp.cmov(y, value, isValid); // 22.   y = CMOV(y, y1, is_gx1_square)
        const e1 = Fp.isOdd(u) === Fp.isOdd(y); // 23.  e1 = sgn0(u) == sgn0(y)
        y = Fp.cmov(Fp.neg(y), y, e1); // 24.   y = CMOV(-y, y, e1)
        x = Fp.div(x, tv4); // 25.   x = x / tv4
        return { x, y };
    };
}
exports.mapToCurveSimpleSWU = mapToCurveSimpleSWU;
//# sourceMappingURL=weierstrass.js.map

/***/ }),

/***/ 67540:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.encodeToCurve = exports.hashToCurve = exports.schnorr = exports.secp256k1 = void 0;
/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
const sha256_1 = __webpack_require__(64524);
const utils_1 = __webpack_require__(44214);
const modular_js_1 = __webpack_require__(51881);
const weierstrass_js_1 = __webpack_require__(57875);
const utils_js_1 = __webpack_require__(92258);
const hash_to_curve_js_1 = __webpack_require__(93895);
const _shortw_utils_js_1 = __webpack_require__(70296);
const secp256k1P = BigInt('0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2f');
const secp256k1N = BigInt('0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141');
const _1n = BigInt(1);
const _2n = BigInt(2);
const divNearest = (a, b) => (a + b / _2n) / b;
/**
 * √n = n^((p+1)/4) for fields p = 3 mod 4. We unwrap the loop and multiply bit-by-bit.
 * (P+1n/4n).toString(2) would produce bits [223x 1, 0, 22x 1, 4x 0, 11, 00]
 */
function sqrtMod(y) {
    const P = secp256k1P;
    // prettier-ignore
    const _3n = BigInt(3), _6n = BigInt(6), _11n = BigInt(11), _22n = BigInt(22);
    // prettier-ignore
    const _23n = BigInt(23), _44n = BigInt(44), _88n = BigInt(88);
    const b2 = (y * y * y) % P; // x^3, 11
    const b3 = (b2 * b2 * y) % P; // x^7
    const b6 = ((0, modular_js_1.pow2)(b3, _3n, P) * b3) % P;
    const b9 = ((0, modular_js_1.pow2)(b6, _3n, P) * b3) % P;
    const b11 = ((0, modular_js_1.pow2)(b9, _2n, P) * b2) % P;
    const b22 = ((0, modular_js_1.pow2)(b11, _11n, P) * b11) % P;
    const b44 = ((0, modular_js_1.pow2)(b22, _22n, P) * b22) % P;
    const b88 = ((0, modular_js_1.pow2)(b44, _44n, P) * b44) % P;
    const b176 = ((0, modular_js_1.pow2)(b88, _88n, P) * b88) % P;
    const b220 = ((0, modular_js_1.pow2)(b176, _44n, P) * b44) % P;
    const b223 = ((0, modular_js_1.pow2)(b220, _3n, P) * b3) % P;
    const t1 = ((0, modular_js_1.pow2)(b223, _23n, P) * b22) % P;
    const t2 = ((0, modular_js_1.pow2)(t1, _6n, P) * b2) % P;
    const root = (0, modular_js_1.pow2)(t2, _2n, P);
    if (!Fp.eql(Fp.sqr(root), y))
        throw new Error('Cannot find square root');
    return root;
}
const Fp = (0, modular_js_1.Field)(secp256k1P, undefined, undefined, { sqrt: sqrtMod });
exports.secp256k1 = (0, _shortw_utils_js_1.createCurve)({
    a: BigInt(0),
    b: BigInt(7),
    Fp,
    n: secp256k1N,
    // Base point (x, y) aka generator point
    Gx: BigInt('55066263022277343669578718895168534326250603453777594175500187360389116729240'),
    Gy: BigInt('32670510020758816978083085130507043184471273380659243275938904335757337482424'),
    h: BigInt(1),
    lowS: true,
    /**
     * secp256k1 belongs to Koblitz curves: it has efficiently computable endomorphism.
     * Endomorphism uses 2x less RAM, speeds up precomputation by 2x and ECDH / key recovery by 20%.
     * For precomputed wNAF it trades off 1/2 init time & 1/3 ram for 20% perf hit.
     * Explanation: https://gist.github.com/paulmillr/eb670806793e84df628a7c434a873066
     */
    endo: {
        beta: BigInt('0x7ae96a2b657c07106e64479eac3434e99cf0497512f58995c1396c28719501ee'),
        splitScalar: (k) => {
            const n = secp256k1N;
            const a1 = BigInt('0x3086d221a7d46bcde86c90e49284eb15');
            const b1 = -_1n * BigInt('0xe4437ed6010e88286f547fa90abfe4c3');
            const a2 = BigInt('0x114ca50f7a8e2f3f657c1108d9d44cfd8');
            const b2 = a1;
            const POW_2_128 = BigInt('0x100000000000000000000000000000000'); // (2n**128n).toString(16)
            const c1 = divNearest(b2 * k, n);
            const c2 = divNearest(-b1 * k, n);
            let k1 = (0, modular_js_1.mod)(k - c1 * a1 - c2 * a2, n);
            let k2 = (0, modular_js_1.mod)(-c1 * b1 - c2 * b2, n);
            const k1neg = k1 > POW_2_128;
            const k2neg = k2 > POW_2_128;
            if (k1neg)
                k1 = n - k1;
            if (k2neg)
                k2 = n - k2;
            if (k1 > POW_2_128 || k2 > POW_2_128) {
                throw new Error('splitScalar: Endomorphism failed, k=' + k);
            }
            return { k1neg, k1, k2neg, k2 };
        },
    },
}, sha256_1.sha256);
// Schnorr signatures are superior to ECDSA from above. Below is Schnorr-specific BIP0340 code.
// https://github.com/bitcoin/bips/blob/master/bip-0340.mediawiki
const _0n = BigInt(0);
const fe = (x) => typeof x === 'bigint' && _0n < x && x < secp256k1P;
const ge = (x) => typeof x === 'bigint' && _0n < x && x < secp256k1N;
/** An object mapping tags to their tagged hash prefix of [SHA256(tag) | SHA256(tag)] */
const TAGGED_HASH_PREFIXES = {};
function taggedHash(tag, ...messages) {
    let tagP = TAGGED_HASH_PREFIXES[tag];
    if (tagP === undefined) {
        const tagH = (0, sha256_1.sha256)(Uint8Array.from(tag, (c) => c.charCodeAt(0)));
        tagP = (0, utils_js_1.concatBytes)(tagH, tagH);
        TAGGED_HASH_PREFIXES[tag] = tagP;
    }
    return (0, sha256_1.sha256)((0, utils_js_1.concatBytes)(tagP, ...messages));
}
// ECDSA compact points are 33-byte. Schnorr is 32: we strip first byte 0x02 or 0x03
const pointToBytes = (point) => point.toRawBytes(true).slice(1);
const numTo32b = (n) => (0, utils_js_1.numberToBytesBE)(n, 32);
const modP = (x) => (0, modular_js_1.mod)(x, secp256k1P);
const modN = (x) => (0, modular_js_1.mod)(x, secp256k1N);
const Point = exports.secp256k1.ProjectivePoint;
const GmulAdd = (Q, a, b) => Point.BASE.multiplyAndAddUnsafe(Q, a, b);
// Calculate point, scalar and bytes
function schnorrGetExtPubKey(priv) {
    let d_ = exports.secp256k1.utils.normPrivateKeyToScalar(priv); // same method executed in fromPrivateKey
    let p = Point.fromPrivateKey(d_); // P = d'⋅G; 0 < d' < n check is done inside
    const scalar = p.hasEvenY() ? d_ : modN(-d_);
    return { scalar: scalar, bytes: pointToBytes(p) };
}
/**
 * lift_x from BIP340. Convert 32-byte x coordinate to elliptic curve point.
 * @returns valid point checked for being on-curve
 */
function lift_x(x) {
    if (!fe(x))
        throw new Error('bad x: need 0 < x < p'); // Fail if x ≥ p.
    const xx = modP(x * x);
    const c = modP(xx * x + BigInt(7)); // Let c = x³ + 7 mod p.
    let y = sqrtMod(c); // Let y = c^(p+1)/4 mod p.
    if (y % _2n !== _0n)
        y = modP(-y); // Return the unique point P such that x(P) = x and
    const p = new Point(x, y, _1n); // y(P) = y if y mod 2 = 0 or y(P) = p-y otherwise.
    p.assertValidity();
    return p;
}
/**
 * Create tagged hash, convert it to bigint, reduce modulo-n.
 */
function challenge(...args) {
    return modN((0, utils_js_1.bytesToNumberBE)(taggedHash('BIP0340/challenge', ...args)));
}
/**
 * Schnorr public key is just `x` coordinate of Point as per BIP340.
 */
function schnorrGetPublicKey(privateKey) {
    return schnorrGetExtPubKey(privateKey).bytes; // d'=int(sk). Fail if d'=0 or d'≥n. Ret bytes(d'⋅G)
}
/**
 * Creates Schnorr signature as per BIP340. Verifies itself before returning anything.
 * auxRand is optional and is not the sole source of k generation: bad CSPRNG won't be dangerous.
 */
function schnorrSign(message, privateKey, auxRand = (0, utils_1.randomBytes)(32)) {
    const m = (0, utils_js_1.ensureBytes)('message', message);
    const { bytes: px, scalar: d } = schnorrGetExtPubKey(privateKey); // checks for isWithinCurveOrder
    const a = (0, utils_js_1.ensureBytes)('auxRand', auxRand, 32); // Auxiliary random data a: a 32-byte array
    const t = numTo32b(d ^ (0, utils_js_1.bytesToNumberBE)(taggedHash('BIP0340/aux', a))); // Let t be the byte-wise xor of bytes(d) and hash/aux(a)
    const rand = taggedHash('BIP0340/nonce', t, px, m); // Let rand = hash/nonce(t || bytes(P) || m)
    const k_ = modN((0, utils_js_1.bytesToNumberBE)(rand)); // Let k' = int(rand) mod n
    if (k_ === _0n)
        throw new Error('sign failed: k is zero'); // Fail if k' = 0.
    const { bytes: rx, scalar: k } = schnorrGetExtPubKey(k_); // Let R = k'⋅G.
    const e = challenge(rx, px, m); // Let e = int(hash/challenge(bytes(R) || bytes(P) || m)) mod n.
    const sig = new Uint8Array(64); // Let sig = bytes(R) || bytes((k + ed) mod n).
    sig.set(rx, 0);
    sig.set(numTo32b(modN(k + e * d)), 32);
    // If Verify(bytes(P), m, sig) (see below) returns failure, abort
    if (!schnorrVerify(sig, m, px))
        throw new Error('sign: Invalid signature produced');
    return sig;
}
/**
 * Verifies Schnorr signature.
 * Will swallow errors & return false except for initial type validation of arguments.
 */
function schnorrVerify(signature, message, publicKey) {
    const sig = (0, utils_js_1.ensureBytes)('signature', signature, 64);
    const m = (0, utils_js_1.ensureBytes)('message', message);
    const pub = (0, utils_js_1.ensureBytes)('publicKey', publicKey, 32);
    try {
        const P = lift_x((0, utils_js_1.bytesToNumberBE)(pub)); // P = lift_x(int(pk)); fail if that fails
        const r = (0, utils_js_1.bytesToNumberBE)(sig.subarray(0, 32)); // Let r = int(sig[0:32]); fail if r ≥ p.
        if (!fe(r))
            return false;
        const s = (0, utils_js_1.bytesToNumberBE)(sig.subarray(32, 64)); // Let s = int(sig[32:64]); fail if s ≥ n.
        if (!ge(s))
            return false;
        const e = challenge(numTo32b(r), pointToBytes(P), m); // int(challenge(bytes(r)||bytes(P)||m))%n
        const R = GmulAdd(P, s, modN(-e)); // R = s⋅G - e⋅P
        if (!R || !R.hasEvenY() || R.toAffine().x !== r)
            return false; // -eP == (n-e)P
        return true; // Fail if is_infinite(R) / not has_even_y(R) / x(R) ≠ r.
    }
    catch (error) {
        return false;
    }
}
exports.schnorr = (() => ({
    getPublicKey: schnorrGetPublicKey,
    sign: schnorrSign,
    verify: schnorrVerify,
    utils: {
        randomPrivateKey: exports.secp256k1.utils.randomPrivateKey,
        lift_x,
        pointToBytes,
        numberToBytesBE: utils_js_1.numberToBytesBE,
        bytesToNumberBE: utils_js_1.bytesToNumberBE,
        taggedHash,
        mod: modular_js_1.mod,
    },
}))();
const isoMap = /* @__PURE__ */ (() => (0, hash_to_curve_js_1.isogenyMap)(Fp, [
    // xNum
    [
        '0x8e38e38e38e38e38e38e38e38e38e38e38e38e38e38e38e38e38e38daaaaa8c7',
        '0x7d3d4c80bc321d5b9f315cea7fd44c5d595d2fc0bf63b92dfff1044f17c6581',
        '0x534c328d23f234e6e2a413deca25caece4506144037c40314ecbd0b53d9dd262',
        '0x8e38e38e38e38e38e38e38e38e38e38e38e38e38e38e38e38e38e38daaaaa88c',
    ],
    // xDen
    [
        '0xd35771193d94918a9ca34ccbb7b640dd86cd409542f8487d9fe6b745781eb49b',
        '0xedadc6f64383dc1df7c4b2d51b54225406d36b641f5e41bbc52a56612a8c6d14',
        '0x0000000000000000000000000000000000000000000000000000000000000001', // LAST 1
    ],
    // yNum
    [
        '0x4bda12f684bda12f684bda12f684bda12f684bda12f684bda12f684b8e38e23c',
        '0xc75e0c32d5cb7c0fa9d0a54b12a0a6d5647ab046d686da6fdffc90fc201d71a3',
        '0x29a6194691f91a73715209ef6512e576722830a201be2018a765e85a9ecee931',
        '0x2f684bda12f684bda12f684bda12f684bda12f684bda12f684bda12f38e38d84',
    ],
    // yDen
    [
        '0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffff93b',
        '0x7a06534bb8bdb49fd5e9e6632722c2989467c1bfc8e8d978dfb425d2685c2573',
        '0x6484aa716545ca2cf3a70c3fa8fe337e0a3d21162f0d6299a7bf8192bfd2a76f',
        '0x0000000000000000000000000000000000000000000000000000000000000001', // LAST 1
    ],
].map((i) => i.map((j) => BigInt(j)))))();
const mapSWU = /* @__PURE__ */ (() => (0, weierstrass_js_1.mapToCurveSimpleSWU)(Fp, {
    A: BigInt('0x3f8731abdd661adca08a5558f0f5d272e953d363cb6f0e5d405447c01a444533'),
    B: BigInt('1771'),
    Z: Fp.create(BigInt('-11')),
}))();
const htf = /* @__PURE__ */ (() => (0, hash_to_curve_js_1.createHasher)(exports.secp256k1.ProjectivePoint, (scalars) => {
    const { x, y } = mapSWU(Fp.create(scalars[0]));
    return isoMap(x, y);
}, {
    DST: 'secp256k1_XMD:SHA-256_SSWU_RO_',
    encodeDST: 'secp256k1_XMD:SHA-256_SSWU_NU_',
    p: Fp.ORDER,
    m: 1,
    k: 128,
    expand: 'xmd',
    hash: sha256_1.sha256,
}))();
exports.hashToCurve = (() => htf.hashToCurve)();
exports.encodeToCurve = (() => htf.encodeToCurve)();
//# sourceMappingURL=secp256k1.js.map

/***/ }),

/***/ 63888:
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.output = exports.exists = exports.hash = exports.bytes = exports.bool = exports.number = void 0;
function number(n) {
    if (!Number.isSafeInteger(n) || n < 0)
        throw new Error(`Wrong positive integer: ${n}`);
}
exports.number = number;
function bool(b) {
    if (typeof b !== 'boolean')
        throw new Error(`Expected boolean, not ${b}`);
}
exports.bool = bool;
function bytes(b, ...lengths) {
    if (!(b instanceof Uint8Array))
        throw new Error('Expected Uint8Array');
    if (lengths.length > 0 && !lengths.includes(b.length))
        throw new Error(`Expected Uint8Array of length ${lengths}, not of length=${b.length}`);
}
exports.bytes = bytes;
function hash(hash) {
    if (typeof hash !== 'function' || typeof hash.create !== 'function')
        throw new Error('Hash should be wrapped by utils.wrapConstructor');
    number(hash.outputLen);
    number(hash.blockLen);
}
exports.hash = hash;
function exists(instance, checkFinished = true) {
    if (instance.destroyed)
        throw new Error('Hash instance has been destroyed');
    if (checkFinished && instance.finished)
        throw new Error('Hash#digest() has already been called');
}
exports.exists = exists;
function output(out, instance) {
    bytes(out);
    const min = instance.outputLen;
    if (out.length < min) {
        throw new Error(`digestInto() expects output buffer of length at least ${min}`);
    }
}
exports.output = output;
const assert = { number, bool, bytes, hash, exists, output };
exports["default"] = assert;
//# sourceMappingURL=_assert.js.map

/***/ }),

/***/ 45406:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.SHA2 = void 0;
const _assert_js_1 = __webpack_require__(63888);
const utils_js_1 = __webpack_require__(44214);
// Polyfill for Safari 14
function setBigUint64(view, byteOffset, value, isLE) {
    if (typeof view.setBigUint64 === 'function')
        return view.setBigUint64(byteOffset, value, isLE);
    const _32n = BigInt(32);
    const _u32_max = BigInt(0xffffffff);
    const wh = Number((value >> _32n) & _u32_max);
    const wl = Number(value & _u32_max);
    const h = isLE ? 4 : 0;
    const l = isLE ? 0 : 4;
    view.setUint32(byteOffset + h, wh, isLE);
    view.setUint32(byteOffset + l, wl, isLE);
}
// Base SHA2 class (RFC 6234)
class SHA2 extends utils_js_1.Hash {
    constructor(blockLen, outputLen, padOffset, isLE) {
        super();
        this.blockLen = blockLen;
        this.outputLen = outputLen;
        this.padOffset = padOffset;
        this.isLE = isLE;
        this.finished = false;
        this.length = 0;
        this.pos = 0;
        this.destroyed = false;
        this.buffer = new Uint8Array(blockLen);
        this.view = (0, utils_js_1.createView)(this.buffer);
    }
    update(data) {
        (0, _assert_js_1.exists)(this);
        const { view, buffer, blockLen } = this;
        data = (0, utils_js_1.toBytes)(data);
        const len = data.length;
        for (let pos = 0; pos < len;) {
            const take = Math.min(blockLen - this.pos, len - pos);
            // Fast path: we have at least one block in input, cast it to view and process
            if (take === blockLen) {
                const dataView = (0, utils_js_1.createView)(data);
                for (; blockLen <= len - pos; pos += blockLen)
                    this.process(dataView, pos);
                continue;
            }
            buffer.set(data.subarray(pos, pos + take), this.pos);
            this.pos += take;
            pos += take;
            if (this.pos === blockLen) {
                this.process(view, 0);
                this.pos = 0;
            }
        }
        this.length += data.length;
        this.roundClean();
        return this;
    }
    digestInto(out) {
        (0, _assert_js_1.exists)(this);
        (0, _assert_js_1.output)(out, this);
        this.finished = true;
        // Padding
        // We can avoid allocation of buffer for padding completely if it
        // was previously not allocated here. But it won't change performance.
        const { buffer, view, blockLen, isLE } = this;
        let { pos } = this;
        // append the bit '1' to the message
        buffer[pos++] = 0b10000000;
        this.buffer.subarray(pos).fill(0);
        // we have less than padOffset left in buffer, so we cannot put length in current block, need process it and pad again
        if (this.padOffset > blockLen - pos) {
            this.process(view, 0);
            pos = 0;
        }
        // Pad until full block byte with zeros
        for (let i = pos; i < blockLen; i++)
            buffer[i] = 0;
        // Note: sha512 requires length to be 128bit integer, but length in JS will overflow before that
        // You need to write around 2 exabytes (u64_max / 8 / (1024**6)) for this to happen.
        // So we just write lowest 64 bits of that value.
        setBigUint64(view, blockLen - 8, BigInt(this.length * 8), isLE);
        this.process(view, 0);
        const oview = (0, utils_js_1.createView)(out);
        const len = this.outputLen;
        // NOTE: we do division by 4 later, which should be fused in single op with modulo by JIT
        if (len % 4)
            throw new Error('_sha2: outputLen should be aligned to 32bit');
        const outLen = len / 4;
        const state = this.get();
        if (outLen > state.length)
            throw new Error('_sha2: outputLen bigger than state');
        for (let i = 0; i < outLen; i++)
            oview.setUint32(4 * i, state[i], isLE);
    }
    digest() {
        const { buffer, outputLen } = this;
        this.digestInto(buffer);
        const res = buffer.slice(0, outputLen);
        this.destroy();
        return res;
    }
    _cloneInto(to) {
        to || (to = new this.constructor());
        to.set(...this.get());
        const { blockLen, buffer, length, finished, destroyed, pos } = this;
        to.length = length;
        to.pos = pos;
        to.finished = finished;
        to.destroyed = destroyed;
        if (length % blockLen)
            to.buffer.set(buffer);
        return to;
    }
}
exports.SHA2 = SHA2;
//# sourceMappingURL=_sha2.js.map

/***/ }),

/***/ 74853:
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.add5L = exports.add5H = exports.add4H = exports.add4L = exports.add3H = exports.add3L = exports.add = exports.rotlBL = exports.rotlBH = exports.rotlSL = exports.rotlSH = exports.rotr32L = exports.rotr32H = exports.rotrBL = exports.rotrBH = exports.rotrSL = exports.rotrSH = exports.shrSL = exports.shrSH = exports.toBig = exports.split = exports.fromBig = void 0;
const U32_MASK64 = /* @__PURE__ */ BigInt(2 ** 32 - 1);
const _32n = /* @__PURE__ */ BigInt(32);
// We are not using BigUint64Array, because they are extremely slow as per 2022
function fromBig(n, le = false) {
    if (le)
        return { h: Number(n & U32_MASK64), l: Number((n >> _32n) & U32_MASK64) };
    return { h: Number((n >> _32n) & U32_MASK64) | 0, l: Number(n & U32_MASK64) | 0 };
}
exports.fromBig = fromBig;
function split(lst, le = false) {
    let Ah = new Uint32Array(lst.length);
    let Al = new Uint32Array(lst.length);
    for (let i = 0; i < lst.length; i++) {
        const { h, l } = fromBig(lst[i], le);
        [Ah[i], Al[i]] = [h, l];
    }
    return [Ah, Al];
}
exports.split = split;
const toBig = (h, l) => (BigInt(h >>> 0) << _32n) | BigInt(l >>> 0);
exports.toBig = toBig;
// for Shift in [0, 32)
const shrSH = (h, _l, s) => h >>> s;
exports.shrSH = shrSH;
const shrSL = (h, l, s) => (h << (32 - s)) | (l >>> s);
exports.shrSL = shrSL;
// Right rotate for Shift in [1, 32)
const rotrSH = (h, l, s) => (h >>> s) | (l << (32 - s));
exports.rotrSH = rotrSH;
const rotrSL = (h, l, s) => (h << (32 - s)) | (l >>> s);
exports.rotrSL = rotrSL;
// Right rotate for Shift in (32, 64), NOTE: 32 is special case.
const rotrBH = (h, l, s) => (h << (64 - s)) | (l >>> (s - 32));
exports.rotrBH = rotrBH;
const rotrBL = (h, l, s) => (h >>> (s - 32)) | (l << (64 - s));
exports.rotrBL = rotrBL;
// Right rotate for shift===32 (just swaps l&h)
const rotr32H = (_h, l) => l;
exports.rotr32H = rotr32H;
const rotr32L = (h, _l) => h;
exports.rotr32L = rotr32L;
// Left rotate for Shift in [1, 32)
const rotlSH = (h, l, s) => (h << s) | (l >>> (32 - s));
exports.rotlSH = rotlSH;
const rotlSL = (h, l, s) => (l << s) | (h >>> (32 - s));
exports.rotlSL = rotlSL;
// Left rotate for Shift in (32, 64), NOTE: 32 is special case.
const rotlBH = (h, l, s) => (l << (s - 32)) | (h >>> (64 - s));
exports.rotlBH = rotlBH;
const rotlBL = (h, l, s) => (h << (s - 32)) | (l >>> (64 - s));
exports.rotlBL = rotlBL;
// JS uses 32-bit signed integers for bitwise operations which means we cannot
// simple take carry out of low bit sum by shift, we need to use division.
function add(Ah, Al, Bh, Bl) {
    const l = (Al >>> 0) + (Bl >>> 0);
    return { h: (Ah + Bh + ((l / 2 ** 32) | 0)) | 0, l: l | 0 };
}
exports.add = add;
// Addition with more than 2 elements
const add3L = (Al, Bl, Cl) => (Al >>> 0) + (Bl >>> 0) + (Cl >>> 0);
exports.add3L = add3L;
const add3H = (low, Ah, Bh, Ch) => (Ah + Bh + Ch + ((low / 2 ** 32) | 0)) | 0;
exports.add3H = add3H;
const add4L = (Al, Bl, Cl, Dl) => (Al >>> 0) + (Bl >>> 0) + (Cl >>> 0) + (Dl >>> 0);
exports.add4L = add4L;
const add4H = (low, Ah, Bh, Ch, Dh) => (Ah + Bh + Ch + Dh + ((low / 2 ** 32) | 0)) | 0;
exports.add4H = add4H;
const add5L = (Al, Bl, Cl, Dl, El) => (Al >>> 0) + (Bl >>> 0) + (Cl >>> 0) + (Dl >>> 0) + (El >>> 0);
exports.add5L = add5L;
const add5H = (low, Ah, Bh, Ch, Dh, Eh) => (Ah + Bh + Ch + Dh + Eh + ((low / 2 ** 32) | 0)) | 0;
exports.add5H = add5H;
// prettier-ignore
const u64 = {
    fromBig, split, toBig,
    shrSH, shrSL,
    rotrSH, rotrSL, rotrBH, rotrBL,
    rotr32H, rotr32L,
    rotlSH, rotlSL, rotlBH, rotlBL,
    add, add3L, add3H, add4L, add4H, add5H, add5L,
};
exports["default"] = u64;
//# sourceMappingURL=_u64.js.map

/***/ }),

/***/ 71634:
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.crypto = void 0;
exports.crypto = typeof globalThis === 'object' && 'crypto' in globalThis ? globalThis.crypto : undefined;
//# sourceMappingURL=crypto.js.map

/***/ }),

/***/ 24864:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.hmac = exports.HMAC = void 0;
const _assert_js_1 = __webpack_require__(63888);
const utils_js_1 = __webpack_require__(44214);
// HMAC (RFC 2104)
class HMAC extends utils_js_1.Hash {
    constructor(hash, _key) {
        super();
        this.finished = false;
        this.destroyed = false;
        (0, _assert_js_1.hash)(hash);
        const key = (0, utils_js_1.toBytes)(_key);
        this.iHash = hash.create();
        if (typeof this.iHash.update !== 'function')
            throw new Error('Expected instance of class which extends utils.Hash');
        this.blockLen = this.iHash.blockLen;
        this.outputLen = this.iHash.outputLen;
        const blockLen = this.blockLen;
        const pad = new Uint8Array(blockLen);
        // blockLen can be bigger than outputLen
        pad.set(key.length > blockLen ? hash.create().update(key).digest() : key);
        for (let i = 0; i < pad.length; i++)
            pad[i] ^= 0x36;
        this.iHash.update(pad);
        // By doing update (processing of first block) of outer hash here we can re-use it between multiple calls via clone
        this.oHash = hash.create();
        // Undo internal XOR && apply outer XOR
        for (let i = 0; i < pad.length; i++)
            pad[i] ^= 0x36 ^ 0x5c;
        this.oHash.update(pad);
        pad.fill(0);
    }
    update(buf) {
        (0, _assert_js_1.exists)(this);
        this.iHash.update(buf);
        return this;
    }
    digestInto(out) {
        (0, _assert_js_1.exists)(this);
        (0, _assert_js_1.bytes)(out, this.outputLen);
        this.finished = true;
        this.iHash.digestInto(out);
        this.oHash.update(out);
        this.oHash.digestInto(out);
        this.destroy();
    }
    digest() {
        const out = new Uint8Array(this.oHash.outputLen);
        this.digestInto(out);
        return out;
    }
    _cloneInto(to) {
        // Create new instance without calling constructor since key already in state and we don't know it.
        to || (to = Object.create(Object.getPrototypeOf(this), {}));
        const { oHash, iHash, finished, destroyed, blockLen, outputLen } = this;
        to = to;
        to.finished = finished;
        to.destroyed = destroyed;
        to.blockLen = blockLen;
        to.outputLen = outputLen;
        to.oHash = oHash._cloneInto(to.oHash);
        to.iHash = iHash._cloneInto(to.iHash);
        return to;
    }
    destroy() {
        this.destroyed = true;
        this.oHash.destroy();
        this.iHash.destroy();
    }
}
exports.HMAC = HMAC;
/**
 * HMAC: RFC2104 message authentication code.
 * @param hash - function that would be used e.g. sha256
 * @param key - message key
 * @param message - message data
 */
const hmac = (hash, key, message) => new HMAC(hash, key).update(message).digest();
exports.hmac = hmac;
exports.hmac.create = (hash, key) => new HMAC(hash, key);
//# sourceMappingURL=hmac.js.map

/***/ }),

/***/ 64003:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.ripemd160 = exports.RIPEMD160 = void 0;
const _sha2_js_1 = __webpack_require__(45406);
const utils_js_1 = __webpack_require__(44214);
// https://homes.esat.kuleuven.be/~bosselae/ripemd160.html
// https://homes.esat.kuleuven.be/~bosselae/ripemd160/pdf/AB-9601/AB-9601.pdf
const Rho = /* @__PURE__ */ new Uint8Array([7, 4, 13, 1, 10, 6, 15, 3, 12, 0, 9, 5, 2, 14, 11, 8]);
const Id = /* @__PURE__ */ Uint8Array.from({ length: 16 }, (_, i) => i);
const Pi = /* @__PURE__ */ Id.map((i) => (9 * i + 5) % 16);
let idxL = [Id];
let idxR = [Pi];
for (let i = 0; i < 4; i++)
    for (let j of [idxL, idxR])
        j.push(j[i].map((k) => Rho[k]));
const shifts = /* @__PURE__ */ [
    [11, 14, 15, 12, 5, 8, 7, 9, 11, 13, 14, 15, 6, 7, 9, 8],
    [12, 13, 11, 15, 6, 9, 9, 7, 12, 15, 11, 13, 7, 8, 7, 7],
    [13, 15, 14, 11, 7, 7, 6, 8, 13, 14, 13, 12, 5, 5, 6, 9],
    [14, 11, 12, 14, 8, 6, 5, 5, 15, 12, 15, 14, 9, 9, 8, 6],
    [15, 12, 13, 13, 9, 5, 8, 6, 14, 11, 12, 11, 8, 6, 5, 5],
].map((i) => new Uint8Array(i));
const shiftsL = /* @__PURE__ */ idxL.map((idx, i) => idx.map((j) => shifts[i][j]));
const shiftsR = /* @__PURE__ */ idxR.map((idx, i) => idx.map((j) => shifts[i][j]));
const Kl = /* @__PURE__ */ new Uint32Array([
    0x00000000, 0x5a827999, 0x6ed9eba1, 0x8f1bbcdc, 0xa953fd4e,
]);
const Kr = /* @__PURE__ */ new Uint32Array([
    0x50a28be6, 0x5c4dd124, 0x6d703ef3, 0x7a6d76e9, 0x00000000,
]);
// The rotate left (circular left shift) operation for uint32
const rotl = (word, shift) => (word << shift) | (word >>> (32 - shift));
// It's called f() in spec.
function f(group, x, y, z) {
    if (group === 0)
        return x ^ y ^ z;
    else if (group === 1)
        return (x & y) | (~x & z);
    else if (group === 2)
        return (x | ~y) ^ z;
    else if (group === 3)
        return (x & z) | (y & ~z);
    else
        return x ^ (y | ~z);
}
// Temporary buffer, not used to store anything between runs
const BUF = /* @__PURE__ */ new Uint32Array(16);
class RIPEMD160 extends _sha2_js_1.SHA2 {
    constructor() {
        super(64, 20, 8, true);
        this.h0 = 0x67452301 | 0;
        this.h1 = 0xefcdab89 | 0;
        this.h2 = 0x98badcfe | 0;
        this.h3 = 0x10325476 | 0;
        this.h4 = 0xc3d2e1f0 | 0;
    }
    get() {
        const { h0, h1, h2, h3, h4 } = this;
        return [h0, h1, h2, h3, h4];
    }
    set(h0, h1, h2, h3, h4) {
        this.h0 = h0 | 0;
        this.h1 = h1 | 0;
        this.h2 = h2 | 0;
        this.h3 = h3 | 0;
        this.h4 = h4 | 0;
    }
    process(view, offset) {
        for (let i = 0; i < 16; i++, offset += 4)
            BUF[i] = view.getUint32(offset, true);
        // prettier-ignore
        let al = this.h0 | 0, ar = al, bl = this.h1 | 0, br = bl, cl = this.h2 | 0, cr = cl, dl = this.h3 | 0, dr = dl, el = this.h4 | 0, er = el;
        // Instead of iterating 0 to 80, we split it into 5 groups
        // And use the groups in constants, functions, etc. Much simpler
        for (let group = 0; group < 5; group++) {
            const rGroup = 4 - group;
            const hbl = Kl[group], hbr = Kr[group]; // prettier-ignore
            const rl = idxL[group], rr = idxR[group]; // prettier-ignore
            const sl = shiftsL[group], sr = shiftsR[group]; // prettier-ignore
            for (let i = 0; i < 16; i++) {
                const tl = (rotl(al + f(group, bl, cl, dl) + BUF[rl[i]] + hbl, sl[i]) + el) | 0;
                al = el, el = dl, dl = rotl(cl, 10) | 0, cl = bl, bl = tl; // prettier-ignore
            }
            // 2 loops are 10% faster
            for (let i = 0; i < 16; i++) {
                const tr = (rotl(ar + f(rGroup, br, cr, dr) + BUF[rr[i]] + hbr, sr[i]) + er) | 0;
                ar = er, er = dr, dr = rotl(cr, 10) | 0, cr = br, br = tr; // prettier-ignore
            }
        }
        // Add the compressed chunk to the current hash value
        this.set((this.h1 + cl + dr) | 0, (this.h2 + dl + er) | 0, (this.h3 + el + ar) | 0, (this.h4 + al + br) | 0, (this.h0 + bl + cr) | 0);
    }
    roundClean() {
        BUF.fill(0);
    }
    destroy() {
        this.destroyed = true;
        this.buffer.fill(0);
        this.set(0, 0, 0, 0, 0);
    }
}
exports.RIPEMD160 = RIPEMD160;
/**
 * RIPEMD-160 - a hash function from 1990s.
 * @param message - msg that would be hashed
 */
exports.ripemd160 = (0, utils_js_1.wrapConstructor)(() => new RIPEMD160());
//# sourceMappingURL=ripemd160.js.map

/***/ }),

/***/ 64524:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.sha224 = exports.sha256 = void 0;
const _sha2_js_1 = __webpack_require__(45406);
const utils_js_1 = __webpack_require__(44214);
// SHA2-256 need to try 2^128 hashes to execute birthday attack.
// BTC network is doing 2^67 hashes/sec as per early 2023.
// Choice: a ? b : c
const Chi = (a, b, c) => (a & b) ^ (~a & c);
// Majority function, true if any two inpust is true
const Maj = (a, b, c) => (a & b) ^ (a & c) ^ (b & c);
// Round constants:
// first 32 bits of the fractional parts of the cube roots of the first 64 primes 2..311)
// prettier-ignore
const SHA256_K = /* @__PURE__ */ new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
]);
// Initial state (first 32 bits of the fractional parts of the square roots of the first 8 primes 2..19):
// prettier-ignore
const IV = /* @__PURE__ */ new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
]);
// Temporary buffer, not used to store anything between runs
// Named this way because it matches specification.
const SHA256_W = /* @__PURE__ */ new Uint32Array(64);
class SHA256 extends _sha2_js_1.SHA2 {
    constructor() {
        super(64, 32, 8, false);
        // We cannot use array here since array allows indexing by variable
        // which means optimizer/compiler cannot use registers.
        this.A = IV[0] | 0;
        this.B = IV[1] | 0;
        this.C = IV[2] | 0;
        this.D = IV[3] | 0;
        this.E = IV[4] | 0;
        this.F = IV[5] | 0;
        this.G = IV[6] | 0;
        this.H = IV[7] | 0;
    }
    get() {
        const { A, B, C, D, E, F, G, H } = this;
        return [A, B, C, D, E, F, G, H];
    }
    // prettier-ignore
    set(A, B, C, D, E, F, G, H) {
        this.A = A | 0;
        this.B = B | 0;
        this.C = C | 0;
        this.D = D | 0;
        this.E = E | 0;
        this.F = F | 0;
        this.G = G | 0;
        this.H = H | 0;
    }
    process(view, offset) {
        // Extend the first 16 words into the remaining 48 words w[16..63] of the message schedule array
        for (let i = 0; i < 16; i++, offset += 4)
            SHA256_W[i] = view.getUint32(offset, false);
        for (let i = 16; i < 64; i++) {
            const W15 = SHA256_W[i - 15];
            const W2 = SHA256_W[i - 2];
            const s0 = (0, utils_js_1.rotr)(W15, 7) ^ (0, utils_js_1.rotr)(W15, 18) ^ (W15 >>> 3);
            const s1 = (0, utils_js_1.rotr)(W2, 17) ^ (0, utils_js_1.rotr)(W2, 19) ^ (W2 >>> 10);
            SHA256_W[i] = (s1 + SHA256_W[i - 7] + s0 + SHA256_W[i - 16]) | 0;
        }
        // Compression function main loop, 64 rounds
        let { A, B, C, D, E, F, G, H } = this;
        for (let i = 0; i < 64; i++) {
            const sigma1 = (0, utils_js_1.rotr)(E, 6) ^ (0, utils_js_1.rotr)(E, 11) ^ (0, utils_js_1.rotr)(E, 25);
            const T1 = (H + sigma1 + Chi(E, F, G) + SHA256_K[i] + SHA256_W[i]) | 0;
            const sigma0 = (0, utils_js_1.rotr)(A, 2) ^ (0, utils_js_1.rotr)(A, 13) ^ (0, utils_js_1.rotr)(A, 22);
            const T2 = (sigma0 + Maj(A, B, C)) | 0;
            H = G;
            G = F;
            F = E;
            E = (D + T1) | 0;
            D = C;
            C = B;
            B = A;
            A = (T1 + T2) | 0;
        }
        // Add the compressed chunk to the current hash value
        A = (A + this.A) | 0;
        B = (B + this.B) | 0;
        C = (C + this.C) | 0;
        D = (D + this.D) | 0;
        E = (E + this.E) | 0;
        F = (F + this.F) | 0;
        G = (G + this.G) | 0;
        H = (H + this.H) | 0;
        this.set(A, B, C, D, E, F, G, H);
    }
    roundClean() {
        SHA256_W.fill(0);
    }
    destroy() {
        this.set(0, 0, 0, 0, 0, 0, 0, 0);
        this.buffer.fill(0);
    }
}
// Constants from https://nvlpubs.nist.gov/nistpubs/FIPS/NIST.FIPS.180-4.pdf
class SHA224 extends SHA256 {
    constructor() {
        super();
        this.A = 0xc1059ed8 | 0;
        this.B = 0x367cd507 | 0;
        this.C = 0x3070dd17 | 0;
        this.D = 0xf70e5939 | 0;
        this.E = 0xffc00b31 | 0;
        this.F = 0x68581511 | 0;
        this.G = 0x64f98fa7 | 0;
        this.H = 0xbefa4fa4 | 0;
        this.outputLen = 28;
    }
}
/**
 * SHA2-256 hash function
 * @param message - data that would be hashed
 */
exports.sha256 = (0, utils_js_1.wrapConstructor)(() => new SHA256());
exports.sha224 = (0, utils_js_1.wrapConstructor)(() => new SHA224());
//# sourceMappingURL=sha256.js.map

/***/ }),

/***/ 2724:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.shake256 = exports.shake128 = exports.keccak_512 = exports.keccak_384 = exports.keccak_256 = exports.keccak_224 = exports.sha3_512 = exports.sha3_384 = exports.sha3_256 = exports.sha3_224 = exports.Keccak = exports.keccakP = void 0;
const _assert_js_1 = __webpack_require__(63888);
const _u64_js_1 = __webpack_require__(74853);
const utils_js_1 = __webpack_require__(44214);
// SHA3 (keccak) is based on a new design: basically, the internal state is bigger than output size.
// It's called a sponge function.
// Various per round constants calculations
const [SHA3_PI, SHA3_ROTL, _SHA3_IOTA] = [[], [], []];
const _0n = /* @__PURE__ */ BigInt(0);
const _1n = /* @__PURE__ */ BigInt(1);
const _2n = /* @__PURE__ */ BigInt(2);
const _7n = /* @__PURE__ */ BigInt(7);
const _256n = /* @__PURE__ */ BigInt(256);
const _0x71n = /* @__PURE__ */ BigInt(0x71);
for (let round = 0, R = _1n, x = 1, y = 0; round < 24; round++) {
    // Pi
    [x, y] = [y, (2 * x + 3 * y) % 5];
    SHA3_PI.push(2 * (5 * y + x));
    // Rotational
    SHA3_ROTL.push((((round + 1) * (round + 2)) / 2) % 64);
    // Iota
    let t = _0n;
    for (let j = 0; j < 7; j++) {
        R = ((R << _1n) ^ ((R >> _7n) * _0x71n)) % _256n;
        if (R & _2n)
            t ^= _1n << ((_1n << /* @__PURE__ */ BigInt(j)) - _1n);
    }
    _SHA3_IOTA.push(t);
}
const [SHA3_IOTA_H, SHA3_IOTA_L] = /* @__PURE__ */ (0, _u64_js_1.split)(_SHA3_IOTA, true);
// Left rotation (without 0, 32, 64)
const rotlH = (h, l, s) => (s > 32 ? (0, _u64_js_1.rotlBH)(h, l, s) : (0, _u64_js_1.rotlSH)(h, l, s));
const rotlL = (h, l, s) => (s > 32 ? (0, _u64_js_1.rotlBL)(h, l, s) : (0, _u64_js_1.rotlSL)(h, l, s));
// Same as keccakf1600, but allows to skip some rounds
function keccakP(s, rounds = 24) {
    const B = new Uint32Array(5 * 2);
    // NOTE: all indices are x2 since we store state as u32 instead of u64 (bigints to slow in js)
    for (let round = 24 - rounds; round < 24; round++) {
        // Theta θ
        for (let x = 0; x < 10; x++)
            B[x] = s[x] ^ s[x + 10] ^ s[x + 20] ^ s[x + 30] ^ s[x + 40];
        for (let x = 0; x < 10; x += 2) {
            const idx1 = (x + 8) % 10;
            const idx0 = (x + 2) % 10;
            const B0 = B[idx0];
            const B1 = B[idx0 + 1];
            const Th = rotlH(B0, B1, 1) ^ B[idx1];
            const Tl = rotlL(B0, B1, 1) ^ B[idx1 + 1];
            for (let y = 0; y < 50; y += 10) {
                s[x + y] ^= Th;
                s[x + y + 1] ^= Tl;
            }
        }
        // Rho (ρ) and Pi (π)
        let curH = s[2];
        let curL = s[3];
        for (let t = 0; t < 24; t++) {
            const shift = SHA3_ROTL[t];
            const Th = rotlH(curH, curL, shift);
            const Tl = rotlL(curH, curL, shift);
            const PI = SHA3_PI[t];
            curH = s[PI];
            curL = s[PI + 1];
            s[PI] = Th;
            s[PI + 1] = Tl;
        }
        // Chi (χ)
        for (let y = 0; y < 50; y += 10) {
            for (let x = 0; x < 10; x++)
                B[x] = s[y + x];
            for (let x = 0; x < 10; x++)
                s[y + x] ^= ~B[(x + 2) % 10] & B[(x + 4) % 10];
        }
        // Iota (ι)
        s[0] ^= SHA3_IOTA_H[round];
        s[1] ^= SHA3_IOTA_L[round];
    }
    B.fill(0);
}
exports.keccakP = keccakP;
class Keccak extends utils_js_1.Hash {
    // NOTE: we accept arguments in bytes instead of bits here.
    constructor(blockLen, suffix, outputLen, enableXOF = false, rounds = 24) {
        super();
        this.blockLen = blockLen;
        this.suffix = suffix;
        this.outputLen = outputLen;
        this.enableXOF = enableXOF;
        this.rounds = rounds;
        this.pos = 0;
        this.posOut = 0;
        this.finished = false;
        this.destroyed = false;
        // Can be passed from user as dkLen
        (0, _assert_js_1.number)(outputLen);
        // 1600 = 5x5 matrix of 64bit.  1600 bits === 200 bytes
        if (0 >= this.blockLen || this.blockLen >= 200)
            throw new Error('Sha3 supports only keccak-f1600 function');
        this.state = new Uint8Array(200);
        this.state32 = (0, utils_js_1.u32)(this.state);
    }
    keccak() {
        keccakP(this.state32, this.rounds);
        this.posOut = 0;
        this.pos = 0;
    }
    update(data) {
        (0, _assert_js_1.exists)(this);
        const { blockLen, state } = this;
        data = (0, utils_js_1.toBytes)(data);
        const len = data.length;
        for (let pos = 0; pos < len;) {
            const take = Math.min(blockLen - this.pos, len - pos);
            for (let i = 0; i < take; i++)
                state[this.pos++] ^= data[pos++];
            if (this.pos === blockLen)
                this.keccak();
        }
        return this;
    }
    finish() {
        if (this.finished)
            return;
        this.finished = true;
        const { state, suffix, pos, blockLen } = this;
        // Do the padding
        state[pos] ^= suffix;
        if ((suffix & 0x80) !== 0 && pos === blockLen - 1)
            this.keccak();
        state[blockLen - 1] ^= 0x80;
        this.keccak();
    }
    writeInto(out) {
        (0, _assert_js_1.exists)(this, false);
        (0, _assert_js_1.bytes)(out);
        this.finish();
        const bufferOut = this.state;
        const { blockLen } = this;
        for (let pos = 0, len = out.length; pos < len;) {
            if (this.posOut >= blockLen)
                this.keccak();
            const take = Math.min(blockLen - this.posOut, len - pos);
            out.set(bufferOut.subarray(this.posOut, this.posOut + take), pos);
            this.posOut += take;
            pos += take;
        }
        return out;
    }
    xofInto(out) {
        // Sha3/Keccak usage with XOF is probably mistake, only SHAKE instances can do XOF
        if (!this.enableXOF)
            throw new Error('XOF is not possible for this instance');
        return this.writeInto(out);
    }
    xof(bytes) {
        (0, _assert_js_1.number)(bytes);
        return this.xofInto(new Uint8Array(bytes));
    }
    digestInto(out) {
        (0, _assert_js_1.output)(out, this);
        if (this.finished)
            throw new Error('digest() was already called');
        this.writeInto(out);
        this.destroy();
        return out;
    }
    digest() {
        return this.digestInto(new Uint8Array(this.outputLen));
    }
    destroy() {
        this.destroyed = true;
        this.state.fill(0);
    }
    _cloneInto(to) {
        const { blockLen, suffix, outputLen, rounds, enableXOF } = this;
        to || (to = new Keccak(blockLen, suffix, outputLen, enableXOF, rounds));
        to.state32.set(this.state32);
        to.pos = this.pos;
        to.posOut = this.posOut;
        to.finished = this.finished;
        to.rounds = rounds;
        // Suffix can change in cSHAKE
        to.suffix = suffix;
        to.outputLen = outputLen;
        to.enableXOF = enableXOF;
        to.destroyed = this.destroyed;
        return to;
    }
}
exports.Keccak = Keccak;
const gen = (suffix, blockLen, outputLen) => (0, utils_js_1.wrapConstructor)(() => new Keccak(blockLen, suffix, outputLen));
exports.sha3_224 = gen(0x06, 144, 224 / 8);
/**
 * SHA3-256 hash function
 * @param message - that would be hashed
 */
exports.sha3_256 = gen(0x06, 136, 256 / 8);
exports.sha3_384 = gen(0x06, 104, 384 / 8);
exports.sha3_512 = gen(0x06, 72, 512 / 8);
exports.keccak_224 = gen(0x01, 144, 224 / 8);
/**
 * keccak-256 hash function. Different from SHA3-256.
 * @param message - that would be hashed
 */
exports.keccak_256 = gen(0x01, 136, 256 / 8);
exports.keccak_384 = gen(0x01, 104, 384 / 8);
exports.keccak_512 = gen(0x01, 72, 512 / 8);
const genShake = (suffix, blockLen, outputLen) => (0, utils_js_1.wrapXOFConstructorWithOpts)((opts = {}) => new Keccak(blockLen, suffix, opts.dkLen === undefined ? outputLen : opts.dkLen, true));
exports.shake128 = genShake(0x1f, 168, 128 / 8);
exports.shake256 = genShake(0x1f, 136, 256 / 8);
//# sourceMappingURL=sha3.js.map

/***/ }),

/***/ 44214:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


/*! noble-hashes - MIT License (c) 2022 Paul Miller (paulmillr.com) */
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.randomBytes = exports.wrapXOFConstructorWithOpts = exports.wrapConstructorWithOpts = exports.wrapConstructor = exports.checkOpts = exports.Hash = exports.concatBytes = exports.toBytes = exports.utf8ToBytes = exports.asyncLoop = exports.nextTick = exports.hexToBytes = exports.bytesToHex = exports.isLE = exports.rotr = exports.createView = exports.u32 = exports.u8 = void 0;
// We use WebCrypto aka globalThis.crypto, which exists in browsers and node.js 16+.
// node.js versions earlier than v19 don't declare it in global scope.
// For node.js, package.json#exports field mapping rewrites import
// from `crypto` to `cryptoNode`, which imports native module.
// Makes the utils un-importable in browsers without a bundler.
// Once node.js 18 is deprecated, we can just drop the import.
const crypto_1 = __webpack_require__(71634);
const u8a = (a) => a instanceof Uint8Array;
// Cast array to different type
const u8 = (arr) => new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
exports.u8 = u8;
const u32 = (arr) => new Uint32Array(arr.buffer, arr.byteOffset, Math.floor(arr.byteLength / 4));
exports.u32 = u32;
// Cast array to view
const createView = (arr) => new DataView(arr.buffer, arr.byteOffset, arr.byteLength);
exports.createView = createView;
// The rotate right (circular right shift) operation for uint32
const rotr = (word, shift) => (word << (32 - shift)) | (word >>> shift);
exports.rotr = rotr;
// big-endian hardware is rare. Just in case someone still decides to run hashes:
// early-throw an error because we don't support BE yet.
exports.isLE = new Uint8Array(new Uint32Array([0x11223344]).buffer)[0] === 0x44;
if (!exports.isLE)
    throw new Error('Non little-endian hardware is not supported');
const hexes = /* @__PURE__ */ Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'));
/**
 * @example bytesToHex(Uint8Array.from([0xca, 0xfe, 0x01, 0x23])) // 'cafe0123'
 */
function bytesToHex(bytes) {
    if (!u8a(bytes))
        throw new Error('Uint8Array expected');
    // pre-caching improves the speed 6x
    let hex = '';
    for (let i = 0; i < bytes.length; i++) {
        hex += hexes[bytes[i]];
    }
    return hex;
}
exports.bytesToHex = bytesToHex;
/**
 * @example hexToBytes('cafe0123') // Uint8Array.from([0xca, 0xfe, 0x01, 0x23])
 */
function hexToBytes(hex) {
    if (typeof hex !== 'string')
        throw new Error('hex string expected, got ' + typeof hex);
    const len = hex.length;
    if (len % 2)
        throw new Error('padded hex string expected, got unpadded hex of length ' + len);
    const array = new Uint8Array(len / 2);
    for (let i = 0; i < array.length; i++) {
        const j = i * 2;
        const hexByte = hex.slice(j, j + 2);
        const byte = Number.parseInt(hexByte, 16);
        if (Number.isNaN(byte) || byte < 0)
            throw new Error('Invalid byte sequence');
        array[i] = byte;
    }
    return array;
}
exports.hexToBytes = hexToBytes;
// There is no setImmediate in browser and setTimeout is slow.
// call of async fn will return Promise, which will be fullfiled only on
// next scheduler queue processing step and this is exactly what we need.
const nextTick = async () => { };
exports.nextTick = nextTick;
// Returns control to thread each 'tick' ms to avoid blocking
async function asyncLoop(iters, tick, cb) {
    let ts = Date.now();
    for (let i = 0; i < iters; i++) {
        cb(i);
        // Date.now() is not monotonic, so in case if clock goes backwards we return return control too
        const diff = Date.now() - ts;
        if (diff >= 0 && diff < tick)
            continue;
        await (0, exports.nextTick)();
        ts += diff;
    }
}
exports.asyncLoop = asyncLoop;
/**
 * @example utf8ToBytes('abc') // new Uint8Array([97, 98, 99])
 */
function utf8ToBytes(str) {
    if (typeof str !== 'string')
        throw new Error(`utf8ToBytes expected string, got ${typeof str}`);
    return new Uint8Array(new TextEncoder().encode(str)); // https://bugzil.la/1681809
}
exports.utf8ToBytes = utf8ToBytes;
/**
 * Normalizes (non-hex) string or Uint8Array to Uint8Array.
 * Warning: when Uint8Array is passed, it would NOT get copied.
 * Keep in mind for future mutable operations.
 */
function toBytes(data) {
    if (typeof data === 'string')
        data = utf8ToBytes(data);
    if (!u8a(data))
        throw new Error(`expected Uint8Array, got ${typeof data}`);
    return data;
}
exports.toBytes = toBytes;
/**
 * Copies several Uint8Arrays into one.
 */
function concatBytes(...arrays) {
    const r = new Uint8Array(arrays.reduce((sum, a) => sum + a.length, 0));
    let pad = 0; // walk through each item, ensure they have proper type
    arrays.forEach((a) => {
        if (!u8a(a))
            throw new Error('Uint8Array expected');
        r.set(a, pad);
        pad += a.length;
    });
    return r;
}
exports.concatBytes = concatBytes;
// For runtime check if class implements interface
class Hash {
    // Safe version that clones internal state
    clone() {
        return this._cloneInto();
    }
}
exports.Hash = Hash;
const toStr = {}.toString;
function checkOpts(defaults, opts) {
    if (opts !== undefined && toStr.call(opts) !== '[object Object]')
        throw new Error('Options should be object or undefined');
    const merged = Object.assign(defaults, opts);
    return merged;
}
exports.checkOpts = checkOpts;
function wrapConstructor(hashCons) {
    const hashC = (msg) => hashCons().update(toBytes(msg)).digest();
    const tmp = hashCons();
    hashC.outputLen = tmp.outputLen;
    hashC.blockLen = tmp.blockLen;
    hashC.create = () => hashCons();
    return hashC;
}
exports.wrapConstructor = wrapConstructor;
function wrapConstructorWithOpts(hashCons) {
    const hashC = (msg, opts) => hashCons(opts).update(toBytes(msg)).digest();
    const tmp = hashCons({});
    hashC.outputLen = tmp.outputLen;
    hashC.blockLen = tmp.blockLen;
    hashC.create = (opts) => hashCons(opts);
    return hashC;
}
exports.wrapConstructorWithOpts = wrapConstructorWithOpts;
function wrapXOFConstructorWithOpts(hashCons) {
    const hashC = (msg, opts) => hashCons(opts).update(toBytes(msg)).digest();
    const tmp = hashCons({});
    hashC.outputLen = tmp.outputLen;
    hashC.blockLen = tmp.blockLen;
    hashC.create = (opts) => hashCons(opts);
    return hashC;
}
exports.wrapXOFConstructorWithOpts = wrapXOFConstructorWithOpts;
/**
 * Secure PRNG. Uses `crypto.getRandomValues`, which defers to OS.
 */
function randomBytes(bytesLength = 32) {
    if (crypto_1.crypto && typeof crypto_1.crypto.getRandomValues === 'function') {
        return crypto_1.crypto.getRandomValues(new Uint8Array(bytesLength));
    }
    throw new Error('crypto.getRandomValues must be defined');
}
exports.randomBytes = randomBytes;
//# sourceMappingURL=utils.js.map

/***/ }),

/***/ 16169:
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
const messageFormatter_1 = __webpack_require__(43938);
class PostMessageCommunicator {
    constructor(allowedOrigins = null, debugMode = false) {
        this.allowedOrigins = null;
        this.callbacks = new Map();
        this.debugMode = false;
        this.isServer = typeof window === 'undefined';
        this.isValidMessage = ({ origin, data, source }) => {
            const emptyOrMalformed = !data;
            const sentFromParentEl = !this.isServer && source === window.parent;
            const majorVersionNumber = typeof data.version !== 'undefined' && parseInt(data.version.split('.')[0]);
            const allowedSDKVersion = majorVersionNumber >= 1;
            let validOrigin = true;
            if (Array.isArray(this.allowedOrigins)) {
                validOrigin = this.allowedOrigins.find((regExp) => regExp.test(origin)) !== undefined;
            }
            return !emptyOrMalformed && sentFromParentEl && allowedSDKVersion && validOrigin;
        };
        this.logIncomingMessage = (msg) => {
            console.info(`Safe Apps SDK v1: A message was received from origin ${msg.origin}. `, msg.data);
        };
        this.onParentMessage = (msg) => {
            if (this.isValidMessage(msg)) {
                this.debugMode && this.logIncomingMessage(msg);
                this.handleIncomingMessage(msg.data);
            }
        };
        this.handleIncomingMessage = (payload) => {
            const { id } = payload;
            const cb = this.callbacks.get(id);
            if (cb) {
                cb(payload);
                this.callbacks.delete(id);
            }
        };
        this.send = (method, params) => {
            const request = messageFormatter_1.MessageFormatter.makeRequest(method, params);
            if (this.isServer) {
                throw new Error("Window doesn't exist");
            }
            window.parent.postMessage(request, '*');
            return new Promise((resolve, reject) => {
                this.callbacks.set(request.id, (response) => {
                    if (!response.success) {
                        reject(new Error(response.error));
                        return;
                    }
                    resolve(response);
                });
            });
        };
        this.allowedOrigins = allowedOrigins;
        this.debugMode = debugMode;
        if (!this.isServer) {
            window.addEventListener('message', this.onParentMessage);
        }
    }
}
exports["default"] = PostMessageCommunicator;
__exportStar(__webpack_require__(19955), exports);
//# sourceMappingURL=index.js.map

/***/ }),

/***/ 43938:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.MessageFormatter = void 0;
const utils_1 = __webpack_require__(18159);
const utils_2 = __webpack_require__(55268);
class MessageFormatter {
}
exports.MessageFormatter = MessageFormatter;
MessageFormatter.makeRequest = (method, params) => {
    const id = (0, utils_2.generateRequestId)();
    return {
        id,
        method,
        params,
        env: {
            sdkVersion: (0, utils_1.getSDKVersion)(),
        },
    };
};
MessageFormatter.makeResponse = (id, data, version) => ({
    id,
    success: true,
    version,
    data,
});
MessageFormatter.makeErrorResponse = (id, error, version) => ({
    id,
    success: false,
    error,
    version,
});
//# sourceMappingURL=messageFormatter.js.map

/***/ }),

/***/ 19955:
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.RestrictedMethods = exports.Methods = void 0;
var Methods;
(function (Methods) {
    Methods["sendTransactions"] = "sendTransactions";
    Methods["rpcCall"] = "rpcCall";
    Methods["getChainInfo"] = "getChainInfo";
    Methods["getSafeInfo"] = "getSafeInfo";
    Methods["getTxBySafeTxHash"] = "getTxBySafeTxHash";
    Methods["getSafeBalances"] = "getSafeBalances";
    Methods["signMessage"] = "signMessage";
    Methods["signTypedMessage"] = "signTypedMessage";
    Methods["getEnvironmentInfo"] = "getEnvironmentInfo";
    Methods["getOffChainSignature"] = "getOffChainSignature";
    Methods["requestAddressBook"] = "requestAddressBook";
    Methods["wallet_getPermissions"] = "wallet_getPermissions";
    Methods["wallet_requestPermissions"] = "wallet_requestPermissions";
})(Methods = exports.Methods || (exports.Methods = {}));
var RestrictedMethods;
(function (RestrictedMethods) {
    RestrictedMethods["requestAddressBook"] = "requestAddressBook";
})(RestrictedMethods = exports.RestrictedMethods || (exports.RestrictedMethods = {}));
//# sourceMappingURL=methods.js.map

/***/ }),

/***/ 55268:
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.generateRequestId = void 0;
// i.e. 0-255 -> '00'-'ff'
const dec2hex = (dec) => dec.toString(16).padStart(2, '0');
const generateId = (len) => {
    const arr = new Uint8Array((len || 40) / 2);
    window.crypto.getRandomValues(arr);
    return Array.from(arr, dec2hex).join('');
};
const generateRequestId = () => {
    if (typeof window !== 'undefined') {
        return generateId(10);
    }
    return new Date().getTime().toString(36);
};
exports.generateRequestId = generateRequestId;
//# sourceMappingURL=utils.js.map

/***/ }),

/***/ 57176:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
const wallet_1 = __webpack_require__(39094);
const permissions_1 = __webpack_require__(64980);
const hasPermission = (required, permissions) => permissions.some((permission) => permission.parentCapability === required);
const requirePermission = () => (_, propertyKey, descriptor) => {
    const originalMethod = descriptor.value;
    descriptor.value = async function () {
        // @ts-expect-error accessing private property from decorator. 'this' context is the class instance
        const wallet = new wallet_1.Wallet(this.communicator);
        let currentPermissions = await wallet.getPermissions();
        if (!hasPermission(propertyKey, currentPermissions)) {
            currentPermissions = await wallet.requestPermissions([{ [propertyKey]: {} }]);
        }
        if (!hasPermission(propertyKey, currentPermissions)) {
            throw new permissions_1.PermissionsError('Permissions rejected', permissions_1.PERMISSIONS_REQUEST_REJECTED);
        }
        return originalMethod.apply(this);
    };
    return descriptor;
};
exports["default"] = requirePermission;
//# sourceMappingURL=requirePermissions.js.map

/***/ }),

/***/ 18975:
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.RPC_CALLS = void 0;
exports.RPC_CALLS = {
    eth_call: 'eth_call',
    eth_gasPrice: 'eth_gasPrice',
    eth_getLogs: 'eth_getLogs',
    eth_getBalance: 'eth_getBalance',
    eth_getCode: 'eth_getCode',
    eth_getBlockByHash: 'eth_getBlockByHash',
    eth_getBlockByNumber: 'eth_getBlockByNumber',
    eth_getStorageAt: 'eth_getStorageAt',
    eth_getTransactionByHash: 'eth_getTransactionByHash',
    eth_getTransactionReceipt: 'eth_getTransactionReceipt',
    eth_getTransactionCount: 'eth_getTransactionCount',
    eth_estimateGas: 'eth_estimateGas',
    safe_setSettings: 'safe_setSettings',
};
//# sourceMappingURL=constants.js.map

/***/ }),

/***/ 50670:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.Eth = void 0;
const constants_1 = __webpack_require__(18975);
const methods_1 = __webpack_require__(19955);
const inputFormatters = {
    defaultBlockParam: (arg = 'latest') => arg,
    returnFullTxObjectParam: (arg = false) => arg,
    blockNumberToHex: (arg) => Number.isInteger(arg) ? `0x${arg.toString(16)}` : arg,
};
class Eth {
    constructor(communicator) {
        this.communicator = communicator;
        this.call = this.buildRequest({
            call: constants_1.RPC_CALLS.eth_call,
            formatters: [null, inputFormatters.defaultBlockParam],
        });
        this.getBalance = this.buildRequest({
            call: constants_1.RPC_CALLS.eth_getBalance,
            formatters: [null, inputFormatters.defaultBlockParam],
        });
        this.getCode = this.buildRequest({
            call: constants_1.RPC_CALLS.eth_getCode,
            formatters: [null, inputFormatters.defaultBlockParam],
        });
        this.getStorageAt = this.buildRequest({
            call: constants_1.RPC_CALLS.eth_getStorageAt,
            formatters: [null, inputFormatters.blockNumberToHex, inputFormatters.defaultBlockParam],
        });
        this.getPastLogs = this.buildRequest({
            call: constants_1.RPC_CALLS.eth_getLogs,
        });
        this.getBlockByHash = this.buildRequest({
            call: constants_1.RPC_CALLS.eth_getBlockByHash,
            formatters: [null, inputFormatters.returnFullTxObjectParam],
        });
        this.getBlockByNumber = this.buildRequest({
            call: constants_1.RPC_CALLS.eth_getBlockByNumber,
            formatters: [inputFormatters.blockNumberToHex, inputFormatters.returnFullTxObjectParam],
        });
        this.getTransactionByHash = this.buildRequest({
            call: constants_1.RPC_CALLS.eth_getTransactionByHash,
        });
        this.getTransactionReceipt = this.buildRequest({
            call: constants_1.RPC_CALLS.eth_getTransactionReceipt,
        });
        this.getTransactionCount = this.buildRequest({
            call: constants_1.RPC_CALLS.eth_getTransactionCount,
            formatters: [null, inputFormatters.defaultBlockParam],
        });
        this.getGasPrice = this.buildRequest({
            call: constants_1.RPC_CALLS.eth_gasPrice,
        });
        this.getEstimateGas = (transaction) => this.buildRequest({
            call: constants_1.RPC_CALLS.eth_estimateGas,
        })([transaction]);
        this.setSafeSettings = this.buildRequest({
            call: constants_1.RPC_CALLS.safe_setSettings,
        });
    }
    buildRequest(args) {
        const { call, formatters } = args;
        return async (params) => {
            if (formatters && Array.isArray(params)) {
                formatters.forEach((formatter, i) => {
                    if (formatter) {
                        params[i] = formatter(params[i]);
                    }
                });
            }
            const payload = {
                call,
                params: params || [],
            };
            const response = await this.communicator.send(methods_1.Methods.rpcCall, payload);
            return response.data;
        };
    }
}
exports.Eth = Eth;
//# sourceMappingURL=index.js.map

/***/ }),

/***/ 50686:
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getSDKVersion = void 0;
const sdk_1 = __importDefault(__webpack_require__(36130));
exports["default"] = sdk_1.default;
__exportStar(__webpack_require__(36130), exports);
__exportStar(__webpack_require__(604), exports);
__exportStar(__webpack_require__(19955), exports);
__exportStar(__webpack_require__(43938), exports);
var utils_1 = __webpack_require__(18159);
Object.defineProperty(exports, "getSDKVersion", ({ enumerable: true, get: function () { return utils_1.getSDKVersion; } }));
//# sourceMappingURL=index.js.map

/***/ }),

/***/ 58702:
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.Safe = void 0;
const viem_1 = __webpack_require__(26244);
const signatures_1 = __webpack_require__(19007);
const methods_1 = __webpack_require__(19955);
const constants_1 = __webpack_require__(18975);
const types_1 = __webpack_require__(604);
const requirePermissions_1 = __importDefault(__webpack_require__(57176));
class Safe {
    constructor(communicator) {
        this.communicator = communicator;
    }
    async getChainInfo() {
        const response = await this.communicator.send(methods_1.Methods.getChainInfo, undefined);
        return response.data;
    }
    async getInfo() {
        const response = await this.communicator.send(methods_1.Methods.getSafeInfo, undefined);
        return response.data;
    }
    // There is a possibility that this method will change because we may add pagination to the endpoint
    async experimental_getBalances({ currency = 'usd' } = {}) {
        const response = await this.communicator.send(methods_1.Methods.getSafeBalances, {
            currency,
        });
        return response.data;
    }
    async check1271Signature(messageHash, signature = '0x') {
        const safeInfo = await this.getInfo();
        const encodedIsValidSignatureCall = (0, viem_1.encodeFunctionData)({
            abi: [
                {
                    constant: false,
                    inputs: [
                        {
                            name: '_dataHash',
                            type: 'bytes32',
                        },
                        {
                            name: '_signature',
                            type: 'bytes',
                        },
                    ],
                    name: 'isValidSignature',
                    outputs: [
                        {
                            name: '',
                            type: 'bytes4',
                        },
                    ],
                    payable: false,
                    stateMutability: 'nonpayable',
                    type: 'function',
                },
            ],
            functionName: 'isValidSignature',
            args: [messageHash, signature],
        });
        const payload = {
            call: constants_1.RPC_CALLS.eth_call,
            params: [
                {
                    to: safeInfo.safeAddress,
                    data: encodedIsValidSignatureCall,
                },
                'latest',
            ],
        };
        try {
            const response = await this.communicator.send(methods_1.Methods.rpcCall, payload);
            return response.data.slice(0, 10).toLowerCase() === signatures_1.MAGIC_VALUE;
        }
        catch (err) {
            return false;
        }
    }
    async check1271SignatureBytes(messageHash, signature = '0x') {
        const safeInfo = await this.getInfo();
        const encodedIsValidSignatureCall = (0, viem_1.encodeFunctionData)({
            abi: [
                {
                    constant: false,
                    inputs: [
                        {
                            name: '_data',
                            type: 'bytes',
                        },
                        {
                            name: '_signature',
                            type: 'bytes',
                        },
                    ],
                    name: 'isValidSignature',
                    outputs: [
                        {
                            name: '',
                            type: 'bytes4',
                        },
                    ],
                    payable: false,
                    stateMutability: 'nonpayable',
                    type: 'function',
                },
            ],
            functionName: 'isValidSignature',
            args: [messageHash, signature],
        });
        const payload = {
            call: constants_1.RPC_CALLS.eth_call,
            params: [
                {
                    to: safeInfo.safeAddress,
                    data: encodedIsValidSignatureCall,
                },
                'latest',
            ],
        };
        try {
            const response = await this.communicator.send(methods_1.Methods.rpcCall, payload);
            return response.data.slice(0, 10).toLowerCase() === signatures_1.MAGIC_VALUE_BYTES;
        }
        catch (err) {
            return false;
        }
    }
    calculateMessageHash(message) {
        return (0, viem_1.hashMessage)(message);
    }
    calculateTypedMessageHash(typedMessage) {
        const chainId = typeof typedMessage.domain.chainId === 'object'
            ? typedMessage.domain.chainId.toNumber()
            : Number(typedMessage.domain.chainId);
        let primaryType = typedMessage.primaryType;
        if (!primaryType) {
            const fields = Object.values(typedMessage.types);
            // We try to infer primaryType (simplified ether's version)
            const primaryTypes = Object.keys(typedMessage.types).filter((typeName) => fields.every((dataTypes) => dataTypes.every(({ type }) => type.replace('[', '').replace(']', '') !== typeName)));
            if (primaryTypes.length === 0 || primaryTypes.length > 1)
                throw new Error('Please specify primaryType');
            primaryType = primaryTypes[0];
        }
        return (0, viem_1.hashTypedData)({
            message: typedMessage.message,
            domain: Object.assign(Object.assign({}, typedMessage.domain), { chainId, verifyingContract: typedMessage.domain.verifyingContract, salt: typedMessage.domain.salt }),
            types: typedMessage.types,
            primaryType,
        });
    }
    async getOffChainSignature(messageHash) {
        const response = await this.communicator.send(methods_1.Methods.getOffChainSignature, messageHash);
        return response.data;
    }
    async isMessageSigned(message, signature = '0x') {
        let check;
        if (typeof message === 'string') {
            check = async () => {
                const messageHash = this.calculateMessageHash(message);
                const messageHashSigned = await this.isMessageHashSigned(messageHash, signature);
                return messageHashSigned;
            };
        }
        if ((0, types_1.isObjectEIP712TypedData)(message)) {
            check = async () => {
                const messageHash = this.calculateTypedMessageHash(message);
                const messageHashSigned = await this.isMessageHashSigned(messageHash, signature);
                return messageHashSigned;
            };
        }
        if (check) {
            const isValid = await check();
            return isValid;
        }
        throw new Error('Invalid message type');
    }
    async isMessageHashSigned(messageHash, signature = '0x') {
        const checks = [this.check1271Signature.bind(this), this.check1271SignatureBytes.bind(this)];
        for (const check of checks) {
            const isValid = await check(messageHash, signature);
            if (isValid) {
                return true;
            }
        }
        return false;
    }
    async getEnvironmentInfo() {
        const response = await this.communicator.send(methods_1.Methods.getEnvironmentInfo, undefined);
        return response.data;
    }
    async requestAddressBook() {
        const response = await this.communicator.send(methods_1.Methods.requestAddressBook, undefined);
        return response.data;
    }
}
__decorate([
    (0, requirePermissions_1.default)()
], Safe.prototype, "requestAddressBook", null);
exports.Safe = Safe;
//# sourceMappingURL=index.js.map

/***/ }),

/***/ 19007:
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.MAGIC_VALUE_BYTES = exports.MAGIC_VALUE = void 0;
const MAGIC_VALUE = '0x1626ba7e';
exports.MAGIC_VALUE = MAGIC_VALUE;
const MAGIC_VALUE_BYTES = '0x20c13b0b';
exports.MAGIC_VALUE_BYTES = MAGIC_VALUE_BYTES;
//# sourceMappingURL=signatures.js.map

/***/ }),

/***/ 36130:
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
const communication_1 = __importDefault(__webpack_require__(16169));
const txs_1 = __webpack_require__(31992);
const eth_1 = __webpack_require__(50670);
const safe_1 = __webpack_require__(58702);
const wallet_1 = __webpack_require__(39094);
class SafeAppsSDK {
    constructor(opts = {}) {
        const { allowedDomains = null, debug = false } = opts;
        this.communicator = new communication_1.default(allowedDomains, debug);
        this.eth = new eth_1.Eth(this.communicator);
        this.txs = new txs_1.TXs(this.communicator);
        this.safe = new safe_1.Safe(this.communicator);
        this.wallet = new wallet_1.Wallet(this.communicator);
    }
}
exports["default"] = SafeAppsSDK;
//# sourceMappingURL=sdk.js.map

/***/ }),

/***/ 31992:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.TXs = void 0;
const methods_1 = __webpack_require__(19955);
const types_1 = __webpack_require__(604);
class TXs {
    constructor(communicator) {
        this.communicator = communicator;
    }
    async getBySafeTxHash(safeTxHash) {
        if (!safeTxHash) {
            throw new Error('Invalid safeTxHash');
        }
        const response = await this.communicator.send(methods_1.Methods.getTxBySafeTxHash, { safeTxHash });
        return response.data;
    }
    async signMessage(message) {
        const messagePayload = {
            message,
        };
        const response = await this.communicator.send(methods_1.Methods.signMessage, messagePayload);
        return response.data;
    }
    async signTypedMessage(typedData) {
        if (!(0, types_1.isObjectEIP712TypedData)(typedData)) {
            throw new Error('Invalid typed data');
        }
        const response = await this.communicator.send(methods_1.Methods.signTypedMessage, { typedData });
        return response.data;
    }
    async send({ txs, params }) {
        if (!txs || !txs.length) {
            throw new Error('No transactions were passed');
        }
        const messagePayload = {
            txs,
            params,
        };
        const response = await this.communicator.send(methods_1.Methods.sendTransactions, messagePayload);
        return response.data;
    }
}
exports.TXs = TXs;
//# sourceMappingURL=index.js.map

/***/ }),

/***/ 12270:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.TransferDirection = exports.TransactionStatus = exports.TokenType = exports.Operation = void 0;
var safe_gateway_typescript_sdk_1 = __webpack_require__(69229);
Object.defineProperty(exports, "Operation", ({ enumerable: true, get: function () { return safe_gateway_typescript_sdk_1.Operation; } }));
Object.defineProperty(exports, "TokenType", ({ enumerable: true, get: function () { return safe_gateway_typescript_sdk_1.TokenType; } }));
Object.defineProperty(exports, "TransactionStatus", ({ enumerable: true, get: function () { return safe_gateway_typescript_sdk_1.TransactionStatus; } }));
Object.defineProperty(exports, "TransferDirection", ({ enumerable: true, get: function () { return safe_gateway_typescript_sdk_1.TransferDirection; } }));
//# sourceMappingURL=gateway.js.map

/***/ }),

/***/ 604:
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
__exportStar(__webpack_require__(34572), exports);
__exportStar(__webpack_require__(74135), exports);
__exportStar(__webpack_require__(12270), exports);
__exportStar(__webpack_require__(50960), exports);
//# sourceMappingURL=index.js.map

/***/ }),

/***/ 50960:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
const methods_1 = __webpack_require__(19955);
//# sourceMappingURL=messaging.js.map

/***/ }),

/***/ 64980:
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.PermissionsError = exports.PERMISSIONS_REQUEST_REJECTED = void 0;
exports.PERMISSIONS_REQUEST_REJECTED = 4001;
class PermissionsError extends Error {
    constructor(message, code, data) {
        super(message);
        this.code = code;
        this.data = data;
        // Should adjust prototype manually because how TS handles the type extension compilation
        // https://github.com/Microsoft/TypeScript/wiki/Breaking-Changes#extending-built-ins-like-error-array-and-map-may-no-longer-work
        Object.setPrototypeOf(this, PermissionsError.prototype);
    }
}
exports.PermissionsError = PermissionsError;
//# sourceMappingURL=permissions.js.map

/***/ }),

/***/ 74135:
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
//# sourceMappingURL=rpc.js.map

/***/ }),

/***/ 34572:
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.isObjectEIP712TypedData = void 0;
const isObjectEIP712TypedData = (obj) => {
    return typeof obj === 'object' && obj != null && 'domain' in obj && 'types' in obj && 'message' in obj;
};
exports.isObjectEIP712TypedData = isObjectEIP712TypedData;
//# sourceMappingURL=sdk.js.map

/***/ }),

/***/ 18159:
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getSDKVersion = void 0;
const package_json_1 = __importDefault(__webpack_require__(27532));
const getSDKVersion = () => {
    // Strip out version tags like `beta.0` in `1.0.0-beta.0`
    return package_json_1.default.version.split('-')[0];
};
exports.getSDKVersion = getSDKVersion;
//# sourceMappingURL=utils.js.map

/***/ }),

/***/ 39094:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.Wallet = void 0;
const methods_1 = __webpack_require__(19955);
const permissions_1 = __webpack_require__(64980);
class Wallet {
    constructor(communicator) {
        this.communicator = communicator;
    }
    async getPermissions() {
        const response = await this.communicator.send(methods_1.Methods.wallet_getPermissions, undefined);
        return response.data;
    }
    async requestPermissions(permissions) {
        if (!this.isPermissionRequestValid(permissions)) {
            throw new permissions_1.PermissionsError('Permissions request is invalid', permissions_1.PERMISSIONS_REQUEST_REJECTED);
        }
        try {
            const response = await this.communicator.send(methods_1.Methods.wallet_requestPermissions, permissions);
            return response.data;
        }
        catch (_a) {
            throw new permissions_1.PermissionsError('Permissions rejected', permissions_1.PERMISSIONS_REQUEST_REJECTED);
        }
    }
    isPermissionRequestValid(permissions) {
        return permissions.every((pr) => {
            if (typeof pr === 'object') {
                return Object.keys(pr).every((method) => {
                    if (Object.values(methods_1.RestrictedMethods).includes(method)) {
                        return true;
                    }
                    return false;
                });
            }
            return false;
        });
    }
}
exports.Wallet = Wallet;
//# sourceMappingURL=index.js.map

/***/ }),

/***/ 63135:
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.DEFAULT_BASE_URL = void 0;
exports.DEFAULT_BASE_URL = 'https://safe-client.safe.global';
//# sourceMappingURL=config.js.map

/***/ }),

/***/ 82064:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getEndpoint = exports.deleteEndpoint = exports.putEndpoint = exports.postEndpoint = void 0;
const utils_1 = __webpack_require__(5720);
function makeUrl(baseUrl, path, pathParams, query) {
    const pathname = (0, utils_1.insertParams)(path, pathParams);
    const search = (0, utils_1.stringifyQuery)(query);
    return `${baseUrl}${pathname}${search}`;
}
function postEndpoint(baseUrl, path, params) {
    const url = makeUrl(baseUrl, path, params === null || params === void 0 ? void 0 : params.path, params === null || params === void 0 ? void 0 : params.query);
    return (0, utils_1.fetchData)(url, 'POST', params === null || params === void 0 ? void 0 : params.body, params === null || params === void 0 ? void 0 : params.headers);
}
exports.postEndpoint = postEndpoint;
function putEndpoint(baseUrl, path, params) {
    const url = makeUrl(baseUrl, path, params === null || params === void 0 ? void 0 : params.path, params === null || params === void 0 ? void 0 : params.query);
    return (0, utils_1.fetchData)(url, 'PUT', params === null || params === void 0 ? void 0 : params.body, params === null || params === void 0 ? void 0 : params.headers);
}
exports.putEndpoint = putEndpoint;
function deleteEndpoint(baseUrl, path, params) {
    const url = makeUrl(baseUrl, path, params === null || params === void 0 ? void 0 : params.path, params === null || params === void 0 ? void 0 : params.query);
    return (0, utils_1.fetchData)(url, 'DELETE', params === null || params === void 0 ? void 0 : params.body, params === null || params === void 0 ? void 0 : params.headers);
}
exports.deleteEndpoint = deleteEndpoint;
function getEndpoint(baseUrl, path, params, rawUrl) {
    if (rawUrl) {
        return (0, utils_1.getData)(rawUrl);
    }
    const url = makeUrl(baseUrl, path, params === null || params === void 0 ? void 0 : params.path, params === null || params === void 0 ? void 0 : params.query);
    return (0, utils_1.getData)(url, params === null || params === void 0 ? void 0 : params.headers);
}
exports.getEndpoint = getEndpoint;
//# sourceMappingURL=endpoint.js.map

/***/ }),

/***/ 69229:
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getContract = exports.getSafeOverviews = exports.unsubscribeAll = exports.unsubscribeSingle = exports.registerRecoveryModule = exports.deleteRegisteredEmail = exports.getRegisteredEmail = exports.verifyEmail = exports.resendEmailVerificationCode = exports.changeEmail = exports.registerEmail = exports.unregisterDevice = exports.unregisterSafe = exports.registerDevice = exports.getDelegates = exports.confirmSafeMessage = exports.proposeSafeMessage = exports.getSafeMessage = exports.getSafeMessages = exports.getDecodedData = exports.getMasterCopies = exports.getSafeApps = exports.getChainConfig = exports.getChainsConfig = exports.getConfirmationView = exports.proposeTransaction = exports.getNonces = exports.postSafeGasEstimation = exports.deleteTransaction = exports.getTransactionDetails = exports.getTransactionQueue = exports.getTransactionHistory = exports.getCollectiblesPage = exports.getCollectibles = exports.getAllOwnedSafes = exports.getOwnedSafes = exports.getFiatCurrencies = exports.getBalances = exports.getMultisigTransactions = exports.getModuleTransactions = exports.getIncomingTransfers = exports.getSafeInfo = exports.getRelayCount = exports.relayTransaction = exports.setBaseUrl = void 0;
const endpoint_1 = __webpack_require__(82064);
const config_1 = __webpack_require__(63135);
__exportStar(__webpack_require__(57971), exports);
__exportStar(__webpack_require__(87999), exports);
__exportStar(__webpack_require__(92906), exports);
__exportStar(__webpack_require__(62905), exports);
__exportStar(__webpack_require__(31442), exports);
__exportStar(__webpack_require__(23235), exports);
__exportStar(__webpack_require__(86286), exports);
__exportStar(__webpack_require__(17035), exports);
__exportStar(__webpack_require__(89731), exports);
__exportStar(__webpack_require__(90114), exports);
// Can be set externally to a different CGW host
let baseUrl = config_1.DEFAULT_BASE_URL;
/**
 * Set the base CGW URL
 */
const setBaseUrl = (url) => {
    baseUrl = url;
};
exports.setBaseUrl = setBaseUrl;
/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
/**
 * Relay a transaction from a Safe
 */
function relayTransaction(chainId, body) {
    return (0, endpoint_1.postEndpoint)(baseUrl, '/v1/chains/{chainId}/relay', { path: { chainId }, body });
}
exports.relayTransaction = relayTransaction;
/**
 * Get the relay limit and number of remaining relays remaining
 */
function getRelayCount(chainId, address) {
    return (0, endpoint_1.getEndpoint)(baseUrl, '/v1/chains/{chainId}/relay/{address}', { path: { chainId, address } });
}
exports.getRelayCount = getRelayCount;
/**
 * Get basic information about a Safe. E.g. owners, modules, version etc
 */
function getSafeInfo(chainId, address) {
    return (0, endpoint_1.getEndpoint)(baseUrl, '/v1/chains/{chainId}/safes/{address}', { path: { chainId, address } });
}
exports.getSafeInfo = getSafeInfo;
/**
 * Get filterable list of incoming transactions
 */
function getIncomingTransfers(chainId, address, query, pageUrl) {
    return (0, endpoint_1.getEndpoint)(baseUrl, '/v1/chains/{chainId}/safes/{address}/incoming-transfers/', {
        path: { chainId, address },
        query,
    }, pageUrl);
}
exports.getIncomingTransfers = getIncomingTransfers;
/**
 * Get filterable list of module transactions
 */
function getModuleTransactions(chainId, address, query, pageUrl) {
    return (0, endpoint_1.getEndpoint)(baseUrl, '/v1/chains/{chainId}/safes/{address}/module-transactions/', {
        path: { chainId, address },
        query,
    }, pageUrl);
}
exports.getModuleTransactions = getModuleTransactions;
/**
 * Get filterable list of multisig transactions
 */
function getMultisigTransactions(chainId, address, query, pageUrl) {
    return (0, endpoint_1.getEndpoint)(baseUrl, '/v1/chains/{chainId}/safes/{address}/multisig-transactions/', {
        path: { chainId, address },
        query,
    }, pageUrl);
}
exports.getMultisigTransactions = getMultisigTransactions;
/**
 * Get the total balance and all assets stored in a Safe
 */
function getBalances(chainId, address, currency = 'usd', query = {}) {
    return (0, endpoint_1.getEndpoint)(baseUrl, '/v1/chains/{chainId}/safes/{address}/balances/{currency}', {
        path: { chainId, address, currency },
        query,
    });
}
exports.getBalances = getBalances;
/**
 * Get a list of supported fiat currencies (e.g. USD, EUR etc)
 */
function getFiatCurrencies() {
    return (0, endpoint_1.getEndpoint)(baseUrl, '/v1/balances/supported-fiat-codes');
}
exports.getFiatCurrencies = getFiatCurrencies;
/**
 * Get the addresses of all Safes belonging to an owner
 */
function getOwnedSafes(chainId, address) {
    return (0, endpoint_1.getEndpoint)(baseUrl, '/v1/chains/{chainId}/owners/{address}/safes', { path: { chainId, address } });
}
exports.getOwnedSafes = getOwnedSafes;
/**
 * Get the addresses of all Safes belonging to an owner on all chains
 */
function getAllOwnedSafes(address) {
    return (0, endpoint_1.getEndpoint)(baseUrl, '/v1/owners/{address}/safes', { path: { address } });
}
exports.getAllOwnedSafes = getAllOwnedSafes;
/**
 * Get NFTs stored in a Safe
 */
function getCollectibles(chainId, address, query = {}) {
    return (0, endpoint_1.getEndpoint)(baseUrl, '/v1/chains/{chainId}/safes/{address}/collectibles', {
        path: { chainId, address },
        query,
    });
}
exports.getCollectibles = getCollectibles;
/**
 * Get NFTs stored in a Safe
 */
function getCollectiblesPage(chainId, address, query = {}, pageUrl) {
    return (0, endpoint_1.getEndpoint)(baseUrl, '/v2/chains/{chainId}/safes/{address}/collectibles', { path: { chainId, address }, query }, pageUrl);
}
exports.getCollectiblesPage = getCollectiblesPage;
/**
 * Get a list of past Safe transactions
 */
function getTransactionHistory(chainId, address, query = {}, pageUrl) {
    return (0, endpoint_1.getEndpoint)(baseUrl, '/v1/chains/{chainId}/safes/{safe_address}/transactions/history', { path: { chainId, safe_address: address }, query }, pageUrl);
}
exports.getTransactionHistory = getTransactionHistory;
/**
 * Get the list of pending transactions
 */
function getTransactionQueue(chainId, address, query = {}, pageUrl) {
    return (0, endpoint_1.getEndpoint)(baseUrl, '/v1/chains/{chainId}/safes/{safe_address}/transactions/queued', { path: { chainId, safe_address: address }, query }, pageUrl);
}
exports.getTransactionQueue = getTransactionQueue;
/**
 * Get the details of an individual transaction by its id
 */
function getTransactionDetails(chainId, transactionId) {
    return (0, endpoint_1.getEndpoint)(baseUrl, '/v1/chains/{chainId}/transactions/{transactionId}', {
        path: { chainId, transactionId },
    });
}
exports.getTransactionDetails = getTransactionDetails;
/**
 * Delete a transaction by its safeTxHash
 */
function deleteTransaction(chainId, safeTxHash, signature) {
    return (0, endpoint_1.deleteEndpoint)(baseUrl, '/v1/chains/{chainId}/transactions/{safeTxHash}', {
        path: { chainId, safeTxHash },
        body: { signature },
    });
}
exports.deleteTransaction = deleteTransaction;
/**
 * Request a gas estimate & recommmended tx nonce for a created transaction
 */
function postSafeGasEstimation(chainId, address, body) {
    return (0, endpoint_1.postEndpoint)(baseUrl, '/v2/chains/{chainId}/safes/{safe_address}/multisig-transactions/estimations', {
        path: { chainId, safe_address: address },
        body,
    });
}
exports.postSafeGasEstimation = postSafeGasEstimation;
function getNonces(chainId, address) {
    return (0, endpoint_1.getEndpoint)(baseUrl, '/v1/chains/{chainId}/safes/{safe_address}/nonces', {
        path: { chainId, safe_address: address },
    });
}
exports.getNonces = getNonces;
/**
 * Propose a new transaction for other owners to sign/execute
 */
function proposeTransaction(chainId, address, body) {
    return (0, endpoint_1.postEndpoint)(baseUrl, '/v1/chains/{chainId}/transactions/{safe_address}/propose', {
        path: { chainId, safe_address: address },
        body,
    });
}
exports.proposeTransaction = proposeTransaction;
/**
 * Returns decoded data
 */
function getConfirmationView(chainId, safeAddress, encodedData, to) {
    return (0, endpoint_1.postEndpoint)(baseUrl, '/v1/chains/{chainId}/safes/{safe_address}/views/transaction-confirmation', {
        path: { chainId: chainId, safe_address: safeAddress },
        body: { data: encodedData, to },
    });
}
exports.getConfirmationView = getConfirmationView;
/**
 * Returns all defined chain configs
 */
function getChainsConfig(query) {
    return (0, endpoint_1.getEndpoint)(baseUrl, '/v1/chains', {
        query,
    });
}
exports.getChainsConfig = getChainsConfig;
/**
 * Returns a chain config
 */
function getChainConfig(chainId) {
    return (0, endpoint_1.getEndpoint)(baseUrl, '/v1/chains/{chainId}', {
        path: { chainId: chainId },
    });
}
exports.getChainConfig = getChainConfig;
/**
 * Returns Safe Apps List
 */
function getSafeApps(chainId, query = {}) {
    return (0, endpoint_1.getEndpoint)(baseUrl, '/v1/chains/{chainId}/safe-apps', {
        path: { chainId: chainId },
        query,
    });
}
exports.getSafeApps = getSafeApps;
/**
 * Returns list of Master Copies
 */
function getMasterCopies(chainId) {
    return (0, endpoint_1.getEndpoint)(baseUrl, '/v1/chains/{chainId}/about/master-copies', {
        path: { chainId: chainId },
    });
}
exports.getMasterCopies = getMasterCopies;
/**
 * Returns decoded data
 */
function getDecodedData(chainId, encodedData, to) {
    return (0, endpoint_1.postEndpoint)(baseUrl, '/v1/chains/{chainId}/data-decoder', {
        path: { chainId: chainId },
        body: { data: encodedData, to },
    });
}
exports.getDecodedData = getDecodedData;
/**
 * Returns list of `SafeMessage`s
 */
function getSafeMessages(chainId, address, pageUrl) {
    return (0, endpoint_1.getEndpoint)(baseUrl, '/v1/chains/{chainId}/safes/{safe_address}/messages', { path: { chainId, safe_address: address }, query: {} }, pageUrl);
}
exports.getSafeMessages = getSafeMessages;
/**
 * Returns a `SafeMessage`
 */
function getSafeMessage(chainId, messageHash) {
    return (0, endpoint_1.getEndpoint)(baseUrl, '/v1/chains/{chainId}/messages/{message_hash}', {
        path: { chainId, message_hash: messageHash },
    });
}
exports.getSafeMessage = getSafeMessage;
/**
 * Propose a new `SafeMessage` for other owners to sign
 */
function proposeSafeMessage(chainId, address, body) {
    return (0, endpoint_1.postEndpoint)(baseUrl, '/v1/chains/{chainId}/safes/{safe_address}/messages', {
        path: { chainId, safe_address: address },
        body,
    });
}
exports.proposeSafeMessage = proposeSafeMessage;
/**
 * Add a confirmation to a `SafeMessage`
 */
function confirmSafeMessage(chainId, messageHash, body) {
    return (0, endpoint_1.postEndpoint)(baseUrl, '/v1/chains/{chainId}/messages/{message_hash}/signatures', {
        path: { chainId, message_hash: messageHash },
        body,
    });
}
exports.confirmSafeMessage = confirmSafeMessage;
/**
 * Returns a list of delegates
 */
function getDelegates(chainId, query = {}) {
    return (0, endpoint_1.getEndpoint)(baseUrl, '/v1/chains/{chainId}/delegates', {
        path: { chainId },
        query,
    });
}
exports.getDelegates = getDelegates;
/**
 * Registers a device/Safe for notifications
 */
function registerDevice(body) {
    return (0, endpoint_1.postEndpoint)(baseUrl, '/v1/register/notifications', {
        body,
    });
}
exports.registerDevice = registerDevice;
/**
 * Unregisters a Safe from notifications
 */
function unregisterSafe(chainId, address, uuid) {
    return (0, endpoint_1.deleteEndpoint)(baseUrl, '/v1/chains/{chainId}/notifications/devices/{uuid}/safes/{safe_address}', {
        path: { chainId, safe_address: address, uuid },
    });
}
exports.unregisterSafe = unregisterSafe;
/**
 * Unregisters a device from notifications
 */
function unregisterDevice(chainId, uuid) {
    return (0, endpoint_1.deleteEndpoint)(baseUrl, '/v1/chains/{chainId}/notifications/devices/{uuid}', {
        path: { chainId, uuid },
    });
}
exports.unregisterDevice = unregisterDevice;
/**
 * Registers a email address for a safe signer.
 *
 * The signer wallet has to sign a message of format: `email-register-{chainId}-{safeAddress}-{emailAddress}-{signer}-{timestamp}`
 * The signature is valid for 5 minutes.
 *
 * @param chainId
 * @param safeAddress
 * @param body Signer address and email address
 * @param headers Signature and Signature timestamp
 * @returns 200 if signature matches the data
 */
function registerEmail(chainId, safeAddress, body, headers) {
    return (0, endpoint_1.postEndpoint)(baseUrl, '/v1/chains/{chainId}/safes/{safe_address}/emails', {
        path: { chainId, safe_address: safeAddress },
        body,
        headers,
    });
}
exports.registerEmail = registerEmail;
/**
 * Changes an already registered email address for a safe signer. The new email address still needs to be verified.
 *
 * The signer wallet has to sign a message of format: `email-edit-{chainId}-{safeAddress}-{emailAddress}-{signer}-{timestamp}`
 * The signature is valid for 5 minutes.
 *
 * @param chainId
 * @param safeAddress
 * @param signerAddress
 * @param body New email address
 * @param headers Signature and Signature timestamp
 * @returns 202 if signature matches the data
 */
function changeEmail(chainId, safeAddress, signerAddress, body, headers) {
    return (0, endpoint_1.putEndpoint)(baseUrl, '/v1/chains/{chainId}/safes/{safe_address}/emails/{signer}', {
        path: { chainId, safe_address: safeAddress, signer: signerAddress },
        body,
        headers,
    });
}
exports.changeEmail = changeEmail;
/**
 * Resends an email verification code.
 */
function resendEmailVerificationCode(chainId, safeAddress, signerAddress) {
    return (0, endpoint_1.postEndpoint)(baseUrl, '/v1/chains/{chainId}/safes/{safe_address}/emails/{signer}/verify-resend', {
        path: { chainId, safe_address: safeAddress, signer: signerAddress },
        body: '',
    });
}
exports.resendEmailVerificationCode = resendEmailVerificationCode;
/**
 * Verifies a pending email address registration.
 *
 * @param chainId
 * @param safeAddress
 * @param signerAddress address who signed the email registration
 * @param body Verification code
 */
function verifyEmail(chainId, safeAddress, signerAddress, body) {
    return (0, endpoint_1.putEndpoint)(baseUrl, '/v1/chains/{chainId}/safes/{safe_address}/emails/{signer}/verify', {
        path: { chainId, safe_address: safeAddress, signer: signerAddress },
        body,
    });
}
exports.verifyEmail = verifyEmail;
/**
 * Gets the registered email address of the signer
 *
 * The signer wallet will have to sign a message of format: `email-retrieval-{chainId}-{safe}-{signer}-{timestamp}`
 * The signature is valid for 5 minutes.
 *
 * @param chainId
 * @param safeAddress
 * @param signerAddress address of the owner of the Safe
 *
 * @returns email address and verified flag
 */
function getRegisteredEmail(chainId, safeAddress, signerAddress, headers) {
    return (0, endpoint_1.getEndpoint)(baseUrl, '/v1/chains/{chainId}/safes/{safe_address}/emails/{signer}', {
        path: { chainId, safe_address: safeAddress, signer: signerAddress },
        headers,
    });
}
exports.getRegisteredEmail = getRegisteredEmail;
/**
 * Delete a registered email address for the signer
 *
 * The signer wallet will have to sign a message of format: `email-delete-{chainId}-{safe}-{signer}-{timestamp}`
 * The signature is valid for 5 minutes.
 *
 * @param chainId
 * @param safeAddress
 * @param signerAddress
 * @param headers
 */
function deleteRegisteredEmail(chainId, safeAddress, signerAddress, headers) {
    return (0, endpoint_1.deleteEndpoint)(baseUrl, '/v1/chains/{chainId}/safes/{safe_address}/emails/{signer}', {
        path: { chainId, safe_address: safeAddress, signer: signerAddress },
        headers,
    });
}
exports.deleteRegisteredEmail = deleteRegisteredEmail;
/**
 * Register a recovery module for receiving alerts
 * @param chainId
 * @param safeAddress
 * @param body - { moduleAddress: string }
 */
function registerRecoveryModule(chainId, safeAddress, body) {
    return (0, endpoint_1.postEndpoint)(baseUrl, '/v1/chains/{chainId}/safes/{safe_address}/recovery', {
        path: { chainId, safe_address: safeAddress },
        body,
    });
}
exports.registerRecoveryModule = registerRecoveryModule;
/**
 * Delete email subscription for a single category
 * @param query
 */
function unsubscribeSingle(query) {
    return (0, endpoint_1.deleteEndpoint)(baseUrl, '/v1/subscriptions', { query });
}
exports.unsubscribeSingle = unsubscribeSingle;
/**
 * Delete email subscription for all categories
 * @param query
 */
function unsubscribeAll(query) {
    return (0, endpoint_1.deleteEndpoint)(baseUrl, '/v1/subscriptions/all', { query });
}
exports.unsubscribeAll = unsubscribeAll;
/**
 * Get Safe overviews per address
 */
function getSafeOverviews(safes, query) {
    return (0, endpoint_1.getEndpoint)(baseUrl, '/v1/safes', {
        query: Object.assign(Object.assign({}, query), { safes: safes.join(',') }),
    });
}
exports.getSafeOverviews = getSafeOverviews;
function getContract(chainId, contractAddress) {
    return (0, endpoint_1.getEndpoint)(baseUrl, '/v1/chains/{chainId}/contracts/{contractAddress}', {
        path: {
            chainId: chainId,
            contractAddress: contractAddress,
        },
    });
}
exports.getContract = getContract;
/* eslint-enable @typescript-eslint/explicit-module-boundary-types */
//# sourceMappingURL=index.js.map

/***/ }),

/***/ 62905:
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.FEATURES = exports.GAS_PRICE_TYPE = exports.RPC_AUTHENTICATION = void 0;
var RPC_AUTHENTICATION;
(function (RPC_AUTHENTICATION) {
    RPC_AUTHENTICATION["API_KEY_PATH"] = "API_KEY_PATH";
    RPC_AUTHENTICATION["NO_AUTHENTICATION"] = "NO_AUTHENTICATION";
    RPC_AUTHENTICATION["UNKNOWN"] = "UNKNOWN";
})(RPC_AUTHENTICATION = exports.RPC_AUTHENTICATION || (exports.RPC_AUTHENTICATION = {}));
var GAS_PRICE_TYPE;
(function (GAS_PRICE_TYPE) {
    GAS_PRICE_TYPE["ORACLE"] = "ORACLE";
    GAS_PRICE_TYPE["FIXED"] = "FIXED";
    GAS_PRICE_TYPE["FIXED_1559"] = "FIXED1559";
    GAS_PRICE_TYPE["UNKNOWN"] = "UNKNOWN";
})(GAS_PRICE_TYPE = exports.GAS_PRICE_TYPE || (exports.GAS_PRICE_TYPE = {}));
var FEATURES;
(function (FEATURES) {
    FEATURES["ERC721"] = "ERC721";
    FEATURES["SAFE_APPS"] = "SAFE_APPS";
    FEATURES["CONTRACT_INTERACTION"] = "CONTRACT_INTERACTION";
    FEATURES["DOMAIN_LOOKUP"] = "DOMAIN_LOOKUP";
    FEATURES["SPENDING_LIMIT"] = "SPENDING_LIMIT";
    FEATURES["EIP1559"] = "EIP1559";
    FEATURES["SAFE_TX_GAS_OPTIONAL"] = "SAFE_TX_GAS_OPTIONAL";
    FEATURES["TX_SIMULATION"] = "TX_SIMULATION";
    FEATURES["EIP1271"] = "EIP1271";
})(FEATURES = exports.FEATURES || (exports.FEATURES = {}));
//# sourceMappingURL=chains.js.map

/***/ }),

/***/ 31442:
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.TokenType = void 0;
var TokenType;
(function (TokenType) {
    TokenType["ERC20"] = "ERC20";
    TokenType["ERC721"] = "ERC721";
    TokenType["NATIVE_TOKEN"] = "NATIVE_TOKEN";
})(TokenType = exports.TokenType || (exports.TokenType = {}));
//# sourceMappingURL=common.js.map

/***/ }),

/***/ 86286:
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
//# sourceMappingURL=decoded-data.js.map

/***/ }),

/***/ 23235:
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
//# sourceMappingURL=master-copies.js.map

/***/ }),

/***/ 89731:
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.DeviceType = void 0;
var DeviceType;
(function (DeviceType) {
    DeviceType["ANDROID"] = "ANDROID";
    DeviceType["IOS"] = "IOS";
    DeviceType["WEB"] = "WEB";
})(DeviceType = exports.DeviceType || (exports.DeviceType = {}));
//# sourceMappingURL=notifications.js.map

/***/ }),

/***/ 90114:
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
//# sourceMappingURL=relay.js.map

/***/ }),

/***/ 87999:
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.SafeAppSocialPlatforms = exports.SafeAppFeatures = exports.SafeAppAccessPolicyTypes = void 0;
var SafeAppAccessPolicyTypes;
(function (SafeAppAccessPolicyTypes) {
    SafeAppAccessPolicyTypes["NoRestrictions"] = "NO_RESTRICTIONS";
    SafeAppAccessPolicyTypes["DomainAllowlist"] = "DOMAIN_ALLOWLIST";
})(SafeAppAccessPolicyTypes = exports.SafeAppAccessPolicyTypes || (exports.SafeAppAccessPolicyTypes = {}));
var SafeAppFeatures;
(function (SafeAppFeatures) {
    SafeAppFeatures["BATCHED_TRANSACTIONS"] = "BATCHED_TRANSACTIONS";
})(SafeAppFeatures = exports.SafeAppFeatures || (exports.SafeAppFeatures = {}));
var SafeAppSocialPlatforms;
(function (SafeAppSocialPlatforms) {
    SafeAppSocialPlatforms["TWITTER"] = "TWITTER";
    SafeAppSocialPlatforms["GITHUB"] = "GITHUB";
    SafeAppSocialPlatforms["DISCORD"] = "DISCORD";
})(SafeAppSocialPlatforms = exports.SafeAppSocialPlatforms || (exports.SafeAppSocialPlatforms = {}));
//# sourceMappingURL=safe-apps.js.map

/***/ }),

/***/ 57971:
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.ImplementationVersionState = void 0;
var ImplementationVersionState;
(function (ImplementationVersionState) {
    ImplementationVersionState["UP_TO_DATE"] = "UP_TO_DATE";
    ImplementationVersionState["OUTDATED"] = "OUTDATED";
    ImplementationVersionState["UNKNOWN"] = "UNKNOWN";
})(ImplementationVersionState = exports.ImplementationVersionState || (exports.ImplementationVersionState = {}));
//# sourceMappingURL=safe-info.js.map

/***/ }),

/***/ 17035:
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.SafeMessageStatus = exports.SafeMessageListItemType = void 0;
var SafeMessageListItemType;
(function (SafeMessageListItemType) {
    SafeMessageListItemType["DATE_LABEL"] = "DATE_LABEL";
    SafeMessageListItemType["MESSAGE"] = "MESSAGE";
})(SafeMessageListItemType = exports.SafeMessageListItemType || (exports.SafeMessageListItemType = {}));
var SafeMessageStatus;
(function (SafeMessageStatus) {
    SafeMessageStatus["NEEDS_CONFIRMATION"] = "NEEDS_CONFIRMATION";
    SafeMessageStatus["CONFIRMED"] = "CONFIRMED";
})(SafeMessageStatus = exports.SafeMessageStatus || (exports.SafeMessageStatus = {}));
//# sourceMappingURL=safe-messages.js.map

/***/ }),

/***/ 92906:
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.LabelValue = exports.DetailedExecutionInfoType = exports.TransactionListItemType = exports.ConflictType = exports.TransactionInfoType = exports.SettingsInfoType = exports.TransactionTokenType = exports.TransferDirection = exports.TransactionStatus = exports.Operation = void 0;
var Operation;
(function (Operation) {
    Operation[Operation["CALL"] = 0] = "CALL";
    Operation[Operation["DELEGATE"] = 1] = "DELEGATE";
})(Operation = exports.Operation || (exports.Operation = {}));
var TransactionStatus;
(function (TransactionStatus) {
    TransactionStatus["AWAITING_CONFIRMATIONS"] = "AWAITING_CONFIRMATIONS";
    TransactionStatus["AWAITING_EXECUTION"] = "AWAITING_EXECUTION";
    TransactionStatus["CANCELLED"] = "CANCELLED";
    TransactionStatus["FAILED"] = "FAILED";
    TransactionStatus["SUCCESS"] = "SUCCESS";
})(TransactionStatus = exports.TransactionStatus || (exports.TransactionStatus = {}));
var TransferDirection;
(function (TransferDirection) {
    TransferDirection["INCOMING"] = "INCOMING";
    TransferDirection["OUTGOING"] = "OUTGOING";
    TransferDirection["UNKNOWN"] = "UNKNOWN";
})(TransferDirection = exports.TransferDirection || (exports.TransferDirection = {}));
var TransactionTokenType;
(function (TransactionTokenType) {
    TransactionTokenType["ERC20"] = "ERC20";
    TransactionTokenType["ERC721"] = "ERC721";
    TransactionTokenType["NATIVE_COIN"] = "NATIVE_COIN";
})(TransactionTokenType = exports.TransactionTokenType || (exports.TransactionTokenType = {}));
var SettingsInfoType;
(function (SettingsInfoType) {
    SettingsInfoType["SET_FALLBACK_HANDLER"] = "SET_FALLBACK_HANDLER";
    SettingsInfoType["ADD_OWNER"] = "ADD_OWNER";
    SettingsInfoType["REMOVE_OWNER"] = "REMOVE_OWNER";
    SettingsInfoType["SWAP_OWNER"] = "SWAP_OWNER";
    SettingsInfoType["CHANGE_THRESHOLD"] = "CHANGE_THRESHOLD";
    SettingsInfoType["CHANGE_IMPLEMENTATION"] = "CHANGE_IMPLEMENTATION";
    SettingsInfoType["ENABLE_MODULE"] = "ENABLE_MODULE";
    SettingsInfoType["DISABLE_MODULE"] = "DISABLE_MODULE";
    SettingsInfoType["SET_GUARD"] = "SET_GUARD";
    SettingsInfoType["DELETE_GUARD"] = "DELETE_GUARD";
})(SettingsInfoType = exports.SettingsInfoType || (exports.SettingsInfoType = {}));
var TransactionInfoType;
(function (TransactionInfoType) {
    TransactionInfoType["TRANSFER"] = "Transfer";
    TransactionInfoType["SETTINGS_CHANGE"] = "SettingsChange";
    TransactionInfoType["CUSTOM"] = "Custom";
    TransactionInfoType["CREATION"] = "Creation";
    TransactionInfoType["SWAP_ORDER"] = "SwapOrder";
})(TransactionInfoType = exports.TransactionInfoType || (exports.TransactionInfoType = {}));
var ConflictType;
(function (ConflictType) {
    ConflictType["NONE"] = "None";
    ConflictType["HAS_NEXT"] = "HasNext";
    ConflictType["END"] = "End";
})(ConflictType = exports.ConflictType || (exports.ConflictType = {}));
var TransactionListItemType;
(function (TransactionListItemType) {
    TransactionListItemType["TRANSACTION"] = "TRANSACTION";
    TransactionListItemType["LABEL"] = "LABEL";
    TransactionListItemType["CONFLICT_HEADER"] = "CONFLICT_HEADER";
    TransactionListItemType["DATE_LABEL"] = "DATE_LABEL";
})(TransactionListItemType = exports.TransactionListItemType || (exports.TransactionListItemType = {}));
var DetailedExecutionInfoType;
(function (DetailedExecutionInfoType) {
    DetailedExecutionInfoType["MULTISIG"] = "MULTISIG";
    DetailedExecutionInfoType["MODULE"] = "MODULE";
})(DetailedExecutionInfoType = exports.DetailedExecutionInfoType || (exports.DetailedExecutionInfoType = {}));
var LabelValue;
(function (LabelValue) {
    LabelValue["Queued"] = "Queued";
    LabelValue["Next"] = "Next";
})(LabelValue = exports.LabelValue || (exports.LabelValue = {}));
//# sourceMappingURL=transactions.js.map

/***/ }),

/***/ 5720:
/***/ (function(__unused_webpack_module, exports) {


var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getData = exports.fetchData = exports.stringifyQuery = exports.insertParams = void 0;
const isErrorResponse = (data) => {
    const isObject = typeof data === 'object' && data !== null;
    return isObject && 'code' in data && 'message' in data;
};
function replaceParam(str, key, value) {
    return str.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
}
function insertParams(template, params) {
    return params
        ? Object.keys(params).reduce((result, key) => {
            return replaceParam(result, key, String(params[key]));
        }, template)
        : template;
}
exports.insertParams = insertParams;
function stringifyQuery(query) {
    if (!query) {
        return '';
    }
    const searchParams = new URLSearchParams();
    Object.keys(query).forEach((key) => {
        if (query[key] != null) {
            searchParams.append(key, String(query[key]));
        }
    });
    const searchString = searchParams.toString();
    return searchString ? `?${searchString}` : '';
}
exports.stringifyQuery = stringifyQuery;
function parseResponse(resp) {
    return __awaiter(this, void 0, void 0, function* () {
        let json;
        try {
            // An HTTP 204 - No Content response doesn't contain a body so trying to call .json() on it would throw
            json = resp.status === 204 ? {} : yield resp.json();
        }
        catch (_a) {
            if (resp.headers && resp.headers.get('content-length') !== '0') {
                throw new Error(`Invalid response content: ${resp.statusText}`);
            }
        }
        if (!resp.ok) {
            const errTxt = isErrorResponse(json) ? `${json.code}: ${json.message}` : resp.statusText;
            throw new Error(errTxt);
        }
        return json;
    });
}
function fetchData(url, method, body, headers) {
    return __awaiter(this, void 0, void 0, function* () {
        const requestHeaders = Object.assign({ 'Content-Type': 'application/json' }, headers);
        const options = {
            method: method !== null && method !== void 0 ? method : 'POST',
            headers: requestHeaders,
        };
        if (body != null) {
            options.body = typeof body === 'string' ? body : JSON.stringify(body);
        }
        const resp = yield fetch(url, options);
        return parseResponse(resp);
    });
}
exports.fetchData = fetchData;
function getData(url, headers) {
    return __awaiter(this, void 0, void 0, function* () {
        const options = {
            method: 'GET',
        };
        if (headers) {
            options['headers'] = Object.assign(Object.assign({}, headers), { 'Content-Type': 'application/json' });
        }
        const resp = yield fetch(url, options);
        return parseResponse(resp);
    });
}
exports.getData = getData;
//# sourceMappingURL=utils.js.map

/***/ }),

/***/ 11678:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.BaseError = void 0;
const version_js_1 = __webpack_require__(81113);
class BaseError extends Error {
    constructor(shortMessage, args = {}) {
        const details = args.cause instanceof BaseError
            ? args.cause.details
            : args.cause?.message
                ? args.cause.message
                : args.details;
        const docsPath = args.cause instanceof BaseError
            ? args.cause.docsPath || args.docsPath
            : args.docsPath;
        const message = [
            shortMessage || 'An error occurred.',
            '',
            ...(args.metaMessages ? [...args.metaMessages, ''] : []),
            ...(docsPath ? [`Docs: https://abitype.dev${docsPath}`] : []),
            ...(details ? [`Details: ${details}`] : []),
            `Version: abitype@${version_js_1.version}`,
        ].join('\n');
        super(message);
        Object.defineProperty(this, "details", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "docsPath", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "metaMessages", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "shortMessage", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'AbiTypeError'
        });
        if (args.cause)
            this.cause = args.cause;
        this.details = details;
        this.docsPath = docsPath;
        this.metaMessages = args.metaMessages;
        this.shortMessage = shortMessage;
    }
}
exports.BaseError = BaseError;
//# sourceMappingURL=errors.js.map

/***/ }),

/***/ 77445:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.UnknownSolidityTypeError = exports.UnknownTypeError = exports.InvalidAbiItemError = void 0;
const errors_js_1 = __webpack_require__(11678);
class InvalidAbiItemError extends errors_js_1.BaseError {
    constructor({ signature }) {
        super('Failed to parse ABI item.', {
            details: `parseAbiItem(${JSON.stringify(signature, null, 2)})`,
            docsPath: '/api/human.html#parseabiitem-1',
        });
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'InvalidAbiItemError'
        });
    }
}
exports.InvalidAbiItemError = InvalidAbiItemError;
class UnknownTypeError extends errors_js_1.BaseError {
    constructor({ type }) {
        super('Unknown type.', {
            metaMessages: [
                `Type "${type}" is not a valid ABI type. Perhaps you forgot to include a struct signature?`,
            ],
        });
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'UnknownTypeError'
        });
    }
}
exports.UnknownTypeError = UnknownTypeError;
class UnknownSolidityTypeError extends errors_js_1.BaseError {
    constructor({ type }) {
        super('Unknown type.', {
            metaMessages: [`Type "${type}" is not a valid ABI type.`],
        });
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'UnknownSolidityTypeError'
        });
    }
}
exports.UnknownSolidityTypeError = UnknownSolidityTypeError;
//# sourceMappingURL=abiItem.js.map

/***/ }),

/***/ 5555:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.InvalidAbiTypeParameterError = exports.InvalidFunctionModifierError = exports.InvalidModifierError = exports.SolidityProtectedKeywordError = exports.InvalidParameterError = exports.InvalidAbiParametersError = exports.InvalidAbiParameterError = void 0;
const errors_js_1 = __webpack_require__(11678);
class InvalidAbiParameterError extends errors_js_1.BaseError {
    constructor({ param }) {
        super('Failed to parse ABI parameter.', {
            details: `parseAbiParameter(${JSON.stringify(param, null, 2)})`,
            docsPath: '/api/human.html#parseabiparameter-1',
        });
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'InvalidAbiParameterError'
        });
    }
}
exports.InvalidAbiParameterError = InvalidAbiParameterError;
class InvalidAbiParametersError extends errors_js_1.BaseError {
    constructor({ params }) {
        super('Failed to parse ABI parameters.', {
            details: `parseAbiParameters(${JSON.stringify(params, null, 2)})`,
            docsPath: '/api/human.html#parseabiparameters-1',
        });
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'InvalidAbiParametersError'
        });
    }
}
exports.InvalidAbiParametersError = InvalidAbiParametersError;
class InvalidParameterError extends errors_js_1.BaseError {
    constructor({ param }) {
        super('Invalid ABI parameter.', {
            details: param,
        });
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'InvalidParameterError'
        });
    }
}
exports.InvalidParameterError = InvalidParameterError;
class SolidityProtectedKeywordError extends errors_js_1.BaseError {
    constructor({ param, name }) {
        super('Invalid ABI parameter.', {
            details: param,
            metaMessages: [
                `"${name}" is a protected Solidity keyword. More info: https://docs.soliditylang.org/en/latest/cheatsheet.html`,
            ],
        });
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'SolidityProtectedKeywordError'
        });
    }
}
exports.SolidityProtectedKeywordError = SolidityProtectedKeywordError;
class InvalidModifierError extends errors_js_1.BaseError {
    constructor({ param, type, modifier, }) {
        super('Invalid ABI parameter.', {
            details: param,
            metaMessages: [
                `Modifier "${modifier}" not allowed${type ? ` in "${type}" type` : ''}.`,
            ],
        });
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'InvalidModifierError'
        });
    }
}
exports.InvalidModifierError = InvalidModifierError;
class InvalidFunctionModifierError extends errors_js_1.BaseError {
    constructor({ param, type, modifier, }) {
        super('Invalid ABI parameter.', {
            details: param,
            metaMessages: [
                `Modifier "${modifier}" not allowed${type ? ` in "${type}" type` : ''}.`,
                `Data location can only be specified for array, struct, or mapping types, but "${modifier}" was given.`,
            ],
        });
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'InvalidFunctionModifierError'
        });
    }
}
exports.InvalidFunctionModifierError = InvalidFunctionModifierError;
class InvalidAbiTypeParameterError extends errors_js_1.BaseError {
    constructor({ abiParameter, }) {
        super('Invalid ABI parameter.', {
            details: JSON.stringify(abiParameter, null, 2),
            metaMessages: ['ABI parameter type is invalid.'],
        });
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'InvalidAbiTypeParameterError'
        });
    }
}
exports.InvalidAbiTypeParameterError = InvalidAbiTypeParameterError;
//# sourceMappingURL=abiParameter.js.map

/***/ }),

/***/ 2494:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.InvalidStructSignatureError = exports.UnknownSignatureError = exports.InvalidSignatureError = void 0;
const errors_js_1 = __webpack_require__(11678);
class InvalidSignatureError extends errors_js_1.BaseError {
    constructor({ signature, type, }) {
        super(`Invalid ${type} signature.`, {
            details: signature,
        });
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'InvalidSignatureError'
        });
    }
}
exports.InvalidSignatureError = InvalidSignatureError;
class UnknownSignatureError extends errors_js_1.BaseError {
    constructor({ signature }) {
        super('Unknown signature.', {
            details: signature,
        });
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'UnknownSignatureError'
        });
    }
}
exports.UnknownSignatureError = UnknownSignatureError;
class InvalidStructSignatureError extends errors_js_1.BaseError {
    constructor({ signature }) {
        super('Invalid struct signature.', {
            details: signature,
            metaMessages: ['No properties exist.'],
        });
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'InvalidStructSignatureError'
        });
    }
}
exports.InvalidStructSignatureError = InvalidStructSignatureError;
//# sourceMappingURL=signature.js.map

/***/ }),

/***/ 41448:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.InvalidParenthesisError = void 0;
const errors_js_1 = __webpack_require__(11678);
class InvalidParenthesisError extends errors_js_1.BaseError {
    constructor({ current, depth }) {
        super('Unbalanced parentheses.', {
            metaMessages: [
                `"${current.trim()}" has too many ${depth > 0 ? 'opening' : 'closing'} parentheses.`,
            ],
            details: `Depth "${depth}"`,
        });
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'InvalidParenthesisError'
        });
    }
}
exports.InvalidParenthesisError = InvalidParenthesisError;
//# sourceMappingURL=splitParameters.js.map

/***/ }),

/***/ 68167:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.CircularReferenceError = void 0;
const errors_js_1 = __webpack_require__(11678);
class CircularReferenceError extends errors_js_1.BaseError {
    constructor({ type }) {
        super('Circular reference detected.', {
            metaMessages: [`Struct "${type}" is a circular reference.`],
        });
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'CircularReferenceError'
        });
    }
}
exports.CircularReferenceError = CircularReferenceError;
//# sourceMappingURL=struct.js.map

/***/ }),

/***/ 8557:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.formatAbi = void 0;
const formatAbiItem_js_1 = __webpack_require__(21698);
function formatAbi(abi) {
    const signatures = [];
    const length = abi.length;
    for (let i = 0; i < length; i++) {
        const abiItem = abi[i];
        const signature = (0, formatAbiItem_js_1.formatAbiItem)(abiItem);
        signatures.push(signature);
    }
    return signatures;
}
exports.formatAbi = formatAbi;
//# sourceMappingURL=formatAbi.js.map

/***/ }),

/***/ 21698:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.formatAbiItem = void 0;
const formatAbiParameters_js_1 = __webpack_require__(17117);
function formatAbiItem(abiItem) {
    if (abiItem.type === 'function')
        return `function ${abiItem.name}(${(0, formatAbiParameters_js_1.formatAbiParameters)(abiItem.inputs)})${abiItem.stateMutability && abiItem.stateMutability !== 'nonpayable'
            ? ` ${abiItem.stateMutability}`
            : ''}${abiItem.outputs.length
            ? ` returns (${(0, formatAbiParameters_js_1.formatAbiParameters)(abiItem.outputs)})`
            : ''}`;
    else if (abiItem.type === 'event')
        return `event ${abiItem.name}(${(0, formatAbiParameters_js_1.formatAbiParameters)(abiItem.inputs)})`;
    else if (abiItem.type === 'error')
        return `error ${abiItem.name}(${(0, formatAbiParameters_js_1.formatAbiParameters)(abiItem.inputs)})`;
    else if (abiItem.type === 'constructor')
        return `constructor(${(0, formatAbiParameters_js_1.formatAbiParameters)(abiItem.inputs)})${abiItem.stateMutability === 'payable' ? ' payable' : ''}`;
    else if (abiItem.type === 'fallback')
        return 'fallback()';
    return 'receive() external payable';
}
exports.formatAbiItem = formatAbiItem;
//# sourceMappingURL=formatAbiItem.js.map

/***/ }),

/***/ 78102:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.formatAbiParameter = void 0;
const regex_js_1 = __webpack_require__(16390);
const tupleRegex = /^tuple(?<array>(\[(\d*)\])*)$/;
function formatAbiParameter(abiParameter) {
    let type = abiParameter.type;
    if (tupleRegex.test(abiParameter.type) && 'components' in abiParameter) {
        type = '(';
        const length = abiParameter.components.length;
        for (let i = 0; i < length; i++) {
            const component = abiParameter.components[i];
            type += formatAbiParameter(component);
            if (i < length - 1)
                type += ', ';
        }
        const result = (0, regex_js_1.execTyped)(tupleRegex, abiParameter.type);
        type += `)${result?.array ?? ''}`;
        return formatAbiParameter({
            ...abiParameter,
            type,
        });
    }
    if ('indexed' in abiParameter && abiParameter.indexed)
        type = `${type} indexed`;
    if (abiParameter.name)
        return `${type} ${abiParameter.name}`;
    return type;
}
exports.formatAbiParameter = formatAbiParameter;
//# sourceMappingURL=formatAbiParameter.js.map

/***/ }),

/***/ 17117:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.formatAbiParameters = void 0;
const formatAbiParameter_js_1 = __webpack_require__(78102);
function formatAbiParameters(abiParameters) {
    let params = '';
    const length = abiParameters.length;
    for (let i = 0; i < length; i++) {
        const abiParameter = abiParameters[i];
        params += (0, formatAbiParameter_js_1.formatAbiParameter)(abiParameter);
        if (i !== length - 1)
            params += ', ';
    }
    return params;
}
exports.formatAbiParameters = formatAbiParameters;
//# sourceMappingURL=formatAbiParameters.js.map

/***/ }),

/***/ 34051:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.parseAbi = void 0;
const signatures_js_1 = __webpack_require__(44110);
const structs_js_1 = __webpack_require__(12551);
const utils_js_1 = __webpack_require__(50096);
function parseAbi(signatures) {
    const structs = (0, structs_js_1.parseStructs)(signatures);
    const abi = [];
    const length = signatures.length;
    for (let i = 0; i < length; i++) {
        const signature = signatures[i];
        if ((0, signatures_js_1.isStructSignature)(signature))
            continue;
        abi.push((0, utils_js_1.parseSignature)(signature, structs));
    }
    return abi;
}
exports.parseAbi = parseAbi;
//# sourceMappingURL=parseAbi.js.map

/***/ }),

/***/ 65504:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.parseAbiItem = void 0;
const index_js_1 = __webpack_require__(77561);
const signatures_js_1 = __webpack_require__(44110);
const structs_js_1 = __webpack_require__(12551);
const utils_js_1 = __webpack_require__(50096);
function parseAbiItem(signature) {
    let abiItem;
    if (typeof signature === 'string')
        abiItem = (0, utils_js_1.parseSignature)(signature);
    else {
        const structs = (0, structs_js_1.parseStructs)(signature);
        const length = signature.length;
        for (let i = 0; i < length; i++) {
            const signature_ = signature[i];
            if ((0, signatures_js_1.isStructSignature)(signature_))
                continue;
            abiItem = (0, utils_js_1.parseSignature)(signature_, structs);
            break;
        }
    }
    if (!abiItem)
        throw new index_js_1.InvalidAbiItemError({ signature });
    return abiItem;
}
exports.parseAbiItem = parseAbiItem;
//# sourceMappingURL=parseAbiItem.js.map

/***/ }),

/***/ 54912:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.parseAbiParameter = void 0;
const index_js_1 = __webpack_require__(77561);
const signatures_js_1 = __webpack_require__(44110);
const structs_js_1 = __webpack_require__(12551);
const utils_js_1 = __webpack_require__(50096);
function parseAbiParameter(param) {
    let abiParameter;
    if (typeof param === 'string')
        abiParameter = (0, utils_js_1.parseAbiParameter)(param, {
            modifiers: signatures_js_1.modifiers,
        });
    else {
        const structs = (0, structs_js_1.parseStructs)(param);
        const length = param.length;
        for (let i = 0; i < length; i++) {
            const signature = param[i];
            if ((0, signatures_js_1.isStructSignature)(signature))
                continue;
            abiParameter = (0, utils_js_1.parseAbiParameter)(signature, { modifiers: signatures_js_1.modifiers, structs });
            break;
        }
    }
    if (!abiParameter)
        throw new index_js_1.InvalidAbiParameterError({ param });
    return abiParameter;
}
exports.parseAbiParameter = parseAbiParameter;
//# sourceMappingURL=parseAbiParameter.js.map

/***/ }),

/***/ 69695:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.parseAbiParameters = void 0;
const index_js_1 = __webpack_require__(77561);
const signatures_js_1 = __webpack_require__(44110);
const structs_js_1 = __webpack_require__(12551);
const utils_js_1 = __webpack_require__(50096);
const utils_js_2 = __webpack_require__(50096);
function parseAbiParameters(params) {
    const abiParameters = [];
    if (typeof params === 'string') {
        const parameters = (0, utils_js_1.splitParameters)(params);
        const length = parameters.length;
        for (let i = 0; i < length; i++) {
            abiParameters.push((0, utils_js_2.parseAbiParameter)(parameters[i], { modifiers: signatures_js_1.modifiers }));
        }
    }
    else {
        const structs = (0, structs_js_1.parseStructs)(params);
        const length = params.length;
        for (let i = 0; i < length; i++) {
            const signature = params[i];
            if ((0, signatures_js_1.isStructSignature)(signature))
                continue;
            const parameters = (0, utils_js_1.splitParameters)(signature);
            const length = parameters.length;
            for (let k = 0; k < length; k++) {
                abiParameters.push((0, utils_js_2.parseAbiParameter)(parameters[k], { modifiers: signatures_js_1.modifiers, structs }));
            }
        }
    }
    if (abiParameters.length === 0)
        throw new index_js_1.InvalidAbiParametersError({ params });
    return abiParameters;
}
exports.parseAbiParameters = parseAbiParameters;
//# sourceMappingURL=parseAbiParameters.js.map

/***/ }),

/***/ 97315:
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.parameterCache = exports.getParameterCacheKey = void 0;
function getParameterCacheKey(param, type) {
    if (type)
        return `${type}:${param}`;
    return param;
}
exports.getParameterCacheKey = getParameterCacheKey;
exports.parameterCache = new Map([
    ['address', { type: 'address' }],
    ['bool', { type: 'bool' }],
    ['bytes', { type: 'bytes' }],
    ['bytes32', { type: 'bytes32' }],
    ['int', { type: 'int256' }],
    ['int256', { type: 'int256' }],
    ['string', { type: 'string' }],
    ['uint', { type: 'uint256' }],
    ['uint8', { type: 'uint8' }],
    ['uint16', { type: 'uint16' }],
    ['uint24', { type: 'uint24' }],
    ['uint32', { type: 'uint32' }],
    ['uint64', { type: 'uint64' }],
    ['uint96', { type: 'uint96' }],
    ['uint112', { type: 'uint112' }],
    ['uint160', { type: 'uint160' }],
    ['uint192', { type: 'uint192' }],
    ['uint256', { type: 'uint256' }],
    ['address owner', { type: 'address', name: 'owner' }],
    ['address to', { type: 'address', name: 'to' }],
    ['bool approved', { type: 'bool', name: 'approved' }],
    ['bytes _data', { type: 'bytes', name: '_data' }],
    ['bytes data', { type: 'bytes', name: 'data' }],
    ['bytes signature', { type: 'bytes', name: 'signature' }],
    ['bytes32 hash', { type: 'bytes32', name: 'hash' }],
    ['bytes32 r', { type: 'bytes32', name: 'r' }],
    ['bytes32 root', { type: 'bytes32', name: 'root' }],
    ['bytes32 s', { type: 'bytes32', name: 's' }],
    ['string name', { type: 'string', name: 'name' }],
    ['string symbol', { type: 'string', name: 'symbol' }],
    ['string tokenURI', { type: 'string', name: 'tokenURI' }],
    ['uint tokenId', { type: 'uint256', name: 'tokenId' }],
    ['uint8 v', { type: 'uint8', name: 'v' }],
    ['uint256 balance', { type: 'uint256', name: 'balance' }],
    ['uint256 tokenId', { type: 'uint256', name: 'tokenId' }],
    ['uint256 value', { type: 'uint256', name: 'value' }],
    [
        'event:address indexed from',
        { type: 'address', name: 'from', indexed: true },
    ],
    ['event:address indexed to', { type: 'address', name: 'to', indexed: true }],
    [
        'event:uint indexed tokenId',
        { type: 'uint256', name: 'tokenId', indexed: true },
    ],
    [
        'event:uint256 indexed tokenId',
        { type: 'uint256', name: 'tokenId', indexed: true },
    ],
]);
//# sourceMappingURL=cache.js.map

/***/ }),

/***/ 44110:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.functionModifiers = exports.eventModifiers = exports.modifiers = exports.isReceiveSignature = exports.isFallbackSignature = exports.execConstructorSignature = exports.isConstructorSignature = exports.execStructSignature = exports.isStructSignature = exports.execFunctionSignature = exports.isFunctionSignature = exports.execEventSignature = exports.isEventSignature = exports.execErrorSignature = exports.isErrorSignature = void 0;
const regex_js_1 = __webpack_require__(16390);
const errorSignatureRegex = /^error (?<name>[a-zA-Z$_][a-zA-Z0-9$_]*)\((?<parameters>.*?)\)$/;
function isErrorSignature(signature) {
    return errorSignatureRegex.test(signature);
}
exports.isErrorSignature = isErrorSignature;
function execErrorSignature(signature) {
    return (0, regex_js_1.execTyped)(errorSignatureRegex, signature);
}
exports.execErrorSignature = execErrorSignature;
const eventSignatureRegex = /^event (?<name>[a-zA-Z$_][a-zA-Z0-9$_]*)\((?<parameters>.*?)\)$/;
function isEventSignature(signature) {
    return eventSignatureRegex.test(signature);
}
exports.isEventSignature = isEventSignature;
function execEventSignature(signature) {
    return (0, regex_js_1.execTyped)(eventSignatureRegex, signature);
}
exports.execEventSignature = execEventSignature;
const functionSignatureRegex = /^function (?<name>[a-zA-Z$_][a-zA-Z0-9$_]*)\((?<parameters>.*?)\)(?: (?<scope>external|public{1}))?(?: (?<stateMutability>pure|view|nonpayable|payable{1}))?(?: returns\s?\((?<returns>.*?)\))?$/;
function isFunctionSignature(signature) {
    return functionSignatureRegex.test(signature);
}
exports.isFunctionSignature = isFunctionSignature;
function execFunctionSignature(signature) {
    return (0, regex_js_1.execTyped)(functionSignatureRegex, signature);
}
exports.execFunctionSignature = execFunctionSignature;
const structSignatureRegex = /^struct (?<name>[a-zA-Z$_][a-zA-Z0-9$_]*) \{(?<properties>.*?)\}$/;
function isStructSignature(signature) {
    return structSignatureRegex.test(signature);
}
exports.isStructSignature = isStructSignature;
function execStructSignature(signature) {
    return (0, regex_js_1.execTyped)(structSignatureRegex, signature);
}
exports.execStructSignature = execStructSignature;
const constructorSignatureRegex = /^constructor\((?<parameters>.*?)\)(?:\s(?<stateMutability>payable{1}))?$/;
function isConstructorSignature(signature) {
    return constructorSignatureRegex.test(signature);
}
exports.isConstructorSignature = isConstructorSignature;
function execConstructorSignature(signature) {
    return (0, regex_js_1.execTyped)(constructorSignatureRegex, signature);
}
exports.execConstructorSignature = execConstructorSignature;
const fallbackSignatureRegex = /^fallback\(\)$/;
function isFallbackSignature(signature) {
    return fallbackSignatureRegex.test(signature);
}
exports.isFallbackSignature = isFallbackSignature;
const receiveSignatureRegex = /^receive\(\) external payable$/;
function isReceiveSignature(signature) {
    return receiveSignatureRegex.test(signature);
}
exports.isReceiveSignature = isReceiveSignature;
exports.modifiers = new Set([
    'memory',
    'indexed',
    'storage',
    'calldata',
]);
exports.eventModifiers = new Set(['indexed']);
exports.functionModifiers = new Set([
    'calldata',
    'memory',
    'storage',
]);
//# sourceMappingURL=signatures.js.map

/***/ }),

/***/ 12551:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.parseStructs = void 0;
const regex_js_1 = __webpack_require__(16390);
const abiItem_js_1 = __webpack_require__(77445);
const abiParameter_js_1 = __webpack_require__(5555);
const signature_js_1 = __webpack_require__(2494);
const struct_js_1 = __webpack_require__(68167);
const signatures_js_1 = __webpack_require__(44110);
const utils_js_1 = __webpack_require__(50096);
function parseStructs(signatures) {
    const shallowStructs = {};
    const signaturesLength = signatures.length;
    for (let i = 0; i < signaturesLength; i++) {
        const signature = signatures[i];
        if (!(0, signatures_js_1.isStructSignature)(signature))
            continue;
        const match = (0, signatures_js_1.execStructSignature)(signature);
        if (!match)
            throw new signature_js_1.InvalidSignatureError({ signature, type: 'struct' });
        const properties = match.properties.split(';');
        const components = [];
        const propertiesLength = properties.length;
        for (let k = 0; k < propertiesLength; k++) {
            const property = properties[k];
            const trimmed = property.trim();
            if (!trimmed)
                continue;
            const abiParameter = (0, utils_js_1.parseAbiParameter)(trimmed, {
                type: 'struct',
            });
            components.push(abiParameter);
        }
        if (!components.length)
            throw new signature_js_1.InvalidStructSignatureError({ signature });
        shallowStructs[match.name] = components;
    }
    const resolvedStructs = {};
    const entries = Object.entries(shallowStructs);
    const entriesLength = entries.length;
    for (let i = 0; i < entriesLength; i++) {
        const [name, parameters] = entries[i];
        resolvedStructs[name] = resolveStructs(parameters, shallowStructs);
    }
    return resolvedStructs;
}
exports.parseStructs = parseStructs;
const typeWithoutTupleRegex = /^(?<type>[a-zA-Z$_][a-zA-Z0-9$_]*)(?<array>(?:\[\d*?\])+?)?$/;
function resolveStructs(abiParameters, structs, ancestors = new Set()) {
    const components = [];
    const length = abiParameters.length;
    for (let i = 0; i < length; i++) {
        const abiParameter = abiParameters[i];
        const isTuple = regex_js_1.isTupleRegex.test(abiParameter.type);
        if (isTuple)
            components.push(abiParameter);
        else {
            const match = (0, regex_js_1.execTyped)(typeWithoutTupleRegex, abiParameter.type);
            if (!match?.type)
                throw new abiParameter_js_1.InvalidAbiTypeParameterError({ abiParameter });
            const { array, type } = match;
            if (type in structs) {
                if (ancestors.has(type))
                    throw new struct_js_1.CircularReferenceError({ type });
                components.push({
                    ...abiParameter,
                    type: `tuple${array ?? ''}`,
                    components: resolveStructs(structs[type] ?? [], structs, new Set([...ancestors, type])),
                });
            }
            else {
                if ((0, utils_js_1.isSolidityType)(type))
                    components.push(abiParameter);
                else
                    throw new abiItem_js_1.UnknownTypeError({ type });
            }
        }
    }
    return components;
}
//# sourceMappingURL=structs.js.map

/***/ }),

/***/ 50096:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.isValidDataLocation = exports.isSolidityKeyword = exports.isSolidityType = exports.splitParameters = exports.parseAbiParameter = exports.parseSignature = void 0;
const regex_js_1 = __webpack_require__(16390);
const abiItem_js_1 = __webpack_require__(77445);
const abiParameter_js_1 = __webpack_require__(5555);
const signature_js_1 = __webpack_require__(2494);
const splitParameters_js_1 = __webpack_require__(41448);
const cache_js_1 = __webpack_require__(97315);
const signatures_js_1 = __webpack_require__(44110);
function parseSignature(signature, structs = {}) {
    if ((0, signatures_js_1.isFunctionSignature)(signature)) {
        const match = (0, signatures_js_1.execFunctionSignature)(signature);
        if (!match)
            throw new signature_js_1.InvalidSignatureError({ signature, type: 'function' });
        const inputParams = splitParameters(match.parameters);
        const inputs = [];
        const inputLength = inputParams.length;
        for (let i = 0; i < inputLength; i++) {
            inputs.push(parseAbiParameter(inputParams[i], {
                modifiers: signatures_js_1.functionModifiers,
                structs,
                type: 'function',
            }));
        }
        const outputs = [];
        if (match.returns) {
            const outputParams = splitParameters(match.returns);
            const outputLength = outputParams.length;
            for (let i = 0; i < outputLength; i++) {
                outputs.push(parseAbiParameter(outputParams[i], {
                    modifiers: signatures_js_1.functionModifiers,
                    structs,
                    type: 'function',
                }));
            }
        }
        return {
            name: match.name,
            type: 'function',
            stateMutability: match.stateMutability ?? 'nonpayable',
            inputs,
            outputs,
        };
    }
    if ((0, signatures_js_1.isEventSignature)(signature)) {
        const match = (0, signatures_js_1.execEventSignature)(signature);
        if (!match)
            throw new signature_js_1.InvalidSignatureError({ signature, type: 'event' });
        const params = splitParameters(match.parameters);
        const abiParameters = [];
        const length = params.length;
        for (let i = 0; i < length; i++) {
            abiParameters.push(parseAbiParameter(params[i], {
                modifiers: signatures_js_1.eventModifiers,
                structs,
                type: 'event',
            }));
        }
        return { name: match.name, type: 'event', inputs: abiParameters };
    }
    if ((0, signatures_js_1.isErrorSignature)(signature)) {
        const match = (0, signatures_js_1.execErrorSignature)(signature);
        if (!match)
            throw new signature_js_1.InvalidSignatureError({ signature, type: 'error' });
        const params = splitParameters(match.parameters);
        const abiParameters = [];
        const length = params.length;
        for (let i = 0; i < length; i++) {
            abiParameters.push(parseAbiParameter(params[i], { structs, type: 'error' }));
        }
        return { name: match.name, type: 'error', inputs: abiParameters };
    }
    if ((0, signatures_js_1.isConstructorSignature)(signature)) {
        const match = (0, signatures_js_1.execConstructorSignature)(signature);
        if (!match)
            throw new signature_js_1.InvalidSignatureError({ signature, type: 'constructor' });
        const params = splitParameters(match.parameters);
        const abiParameters = [];
        const length = params.length;
        for (let i = 0; i < length; i++) {
            abiParameters.push(parseAbiParameter(params[i], { structs, type: 'constructor' }));
        }
        return {
            type: 'constructor',
            stateMutability: match.stateMutability ?? 'nonpayable',
            inputs: abiParameters,
        };
    }
    if ((0, signatures_js_1.isFallbackSignature)(signature))
        return { type: 'fallback' };
    if ((0, signatures_js_1.isReceiveSignature)(signature))
        return {
            type: 'receive',
            stateMutability: 'payable',
        };
    throw new signature_js_1.UnknownSignatureError({ signature });
}
exports.parseSignature = parseSignature;
const abiParameterWithoutTupleRegex = /^(?<type>[a-zA-Z$_][a-zA-Z0-9$_]*)(?<array>(?:\[\d*?\])+?)?(?:\s(?<modifier>calldata|indexed|memory|storage{1}))?(?:\s(?<name>[a-zA-Z$_][a-zA-Z0-9$_]*))?$/;
const abiParameterWithTupleRegex = /^\((?<type>.+?)\)(?<array>(?:\[\d*?\])+?)?(?:\s(?<modifier>calldata|indexed|memory|storage{1}))?(?:\s(?<name>[a-zA-Z$_][a-zA-Z0-9$_]*))?$/;
const dynamicIntegerRegex = /^u?int$/;
function parseAbiParameter(param, options) {
    const parameterCacheKey = (0, cache_js_1.getParameterCacheKey)(param, options?.type);
    if (cache_js_1.parameterCache.has(parameterCacheKey))
        return cache_js_1.parameterCache.get(parameterCacheKey);
    const isTuple = regex_js_1.isTupleRegex.test(param);
    const match = (0, regex_js_1.execTyped)(isTuple ? abiParameterWithTupleRegex : abiParameterWithoutTupleRegex, param);
    if (!match)
        throw new abiParameter_js_1.InvalidParameterError({ param });
    if (match.name && isSolidityKeyword(match.name))
        throw new abiParameter_js_1.SolidityProtectedKeywordError({ param, name: match.name });
    const name = match.name ? { name: match.name } : {};
    const indexed = match.modifier === 'indexed' ? { indexed: true } : {};
    const structs = options?.structs ?? {};
    let type;
    let components = {};
    if (isTuple) {
        type = 'tuple';
        const params = splitParameters(match.type);
        const components_ = [];
        const length = params.length;
        for (let i = 0; i < length; i++) {
            components_.push(parseAbiParameter(params[i], { structs }));
        }
        components = { components: components_ };
    }
    else if (match.type in structs) {
        type = 'tuple';
        components = { components: structs[match.type] };
    }
    else if (dynamicIntegerRegex.test(match.type)) {
        type = `${match.type}256`;
    }
    else {
        type = match.type;
        if (!(options?.type === 'struct') && !isSolidityType(type))
            throw new abiItem_js_1.UnknownSolidityTypeError({ type });
    }
    if (match.modifier) {
        if (!options?.modifiers?.has?.(match.modifier))
            throw new abiParameter_js_1.InvalidModifierError({
                param,
                type: options?.type,
                modifier: match.modifier,
            });
        if (signatures_js_1.functionModifiers.has(match.modifier) &&
            !isValidDataLocation(type, !!match.array))
            throw new abiParameter_js_1.InvalidFunctionModifierError({
                param,
                type: options?.type,
                modifier: match.modifier,
            });
    }
    const abiParameter = {
        type: `${type}${match.array ?? ''}`,
        ...name,
        ...indexed,
        ...components,
    };
    cache_js_1.parameterCache.set(parameterCacheKey, abiParameter);
    return abiParameter;
}
exports.parseAbiParameter = parseAbiParameter;
function splitParameters(params, result = [], current = '', depth = 0) {
    if (params === '') {
        if (current === '')
            return result;
        if (depth !== 0)
            throw new splitParameters_js_1.InvalidParenthesisError({ current, depth });
        result.push(current.trim());
        return result;
    }
    const length = params.length;
    for (let i = 0; i < length; i++) {
        const char = params[i];
        const tail = params.slice(i + 1);
        switch (char) {
            case ',':
                return depth === 0
                    ? splitParameters(tail, [...result, current.trim()])
                    : splitParameters(tail, result, `${current}${char}`, depth);
            case '(':
                return splitParameters(tail, result, `${current}${char}`, depth + 1);
            case ')':
                return splitParameters(tail, result, `${current}${char}`, depth - 1);
            default:
                return splitParameters(tail, result, `${current}${char}`, depth);
        }
    }
    return [];
}
exports.splitParameters = splitParameters;
function isSolidityType(type) {
    return (type === 'address' ||
        type === 'bool' ||
        type === 'function' ||
        type === 'string' ||
        regex_js_1.bytesRegex.test(type) ||
        regex_js_1.integerRegex.test(type));
}
exports.isSolidityType = isSolidityType;
const protectedKeywordsRegex = /^(?:after|alias|anonymous|apply|auto|byte|calldata|case|catch|constant|copyof|default|defined|error|event|external|false|final|function|immutable|implements|in|indexed|inline|internal|let|mapping|match|memory|mutable|null|of|override|partial|private|promise|public|pure|reference|relocatable|return|returns|sizeof|static|storage|struct|super|supports|switch|this|true|try|typedef|typeof|var|view|virtual)$/;
function isSolidityKeyword(name) {
    return (name === 'address' ||
        name === 'bool' ||
        name === 'function' ||
        name === 'string' ||
        name === 'tuple' ||
        regex_js_1.bytesRegex.test(name) ||
        regex_js_1.integerRegex.test(name) ||
        protectedKeywordsRegex.test(name));
}
exports.isSolidityKeyword = isSolidityKeyword;
function isValidDataLocation(type, isArray) {
    return isArray || type === 'bytes' || type === 'string' || type === 'tuple';
}
exports.isValidDataLocation = isValidDataLocation;
//# sourceMappingURL=utils.js.map

/***/ }),

/***/ 77561:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.CircularReferenceError = exports.InvalidParenthesisError = exports.UnknownSignatureError = exports.InvalidSignatureError = exports.InvalidStructSignatureError = exports.InvalidAbiParameterError = exports.InvalidAbiParametersError = exports.InvalidParameterError = exports.SolidityProtectedKeywordError = exports.InvalidModifierError = exports.InvalidFunctionModifierError = exports.InvalidAbiTypeParameterError = exports.UnknownSolidityTypeError = exports.InvalidAbiItemError = exports.UnknownTypeError = exports.parseAbiParameters = exports.parseAbiParameter = exports.parseAbiItem = exports.parseAbi = exports.formatAbiParameters = exports.formatAbiParameter = exports.formatAbiItem = exports.formatAbi = exports.narrow = exports.BaseError = void 0;
var errors_js_1 = __webpack_require__(11678);
Object.defineProperty(exports, "BaseError", ({ enumerable: true, get: function () { return errors_js_1.BaseError; } }));
var narrow_js_1 = __webpack_require__(72054);
Object.defineProperty(exports, "narrow", ({ enumerable: true, get: function () { return narrow_js_1.narrow; } }));
var formatAbi_js_1 = __webpack_require__(8557);
Object.defineProperty(exports, "formatAbi", ({ enumerable: true, get: function () { return formatAbi_js_1.formatAbi; } }));
var formatAbiItem_js_1 = __webpack_require__(21698);
Object.defineProperty(exports, "formatAbiItem", ({ enumerable: true, get: function () { return formatAbiItem_js_1.formatAbiItem; } }));
var formatAbiParameter_js_1 = __webpack_require__(78102);
Object.defineProperty(exports, "formatAbiParameter", ({ enumerable: true, get: function () { return formatAbiParameter_js_1.formatAbiParameter; } }));
var formatAbiParameters_js_1 = __webpack_require__(17117);
Object.defineProperty(exports, "formatAbiParameters", ({ enumerable: true, get: function () { return formatAbiParameters_js_1.formatAbiParameters; } }));
var parseAbi_js_1 = __webpack_require__(34051);
Object.defineProperty(exports, "parseAbi", ({ enumerable: true, get: function () { return parseAbi_js_1.parseAbi; } }));
var parseAbiItem_js_1 = __webpack_require__(65504);
Object.defineProperty(exports, "parseAbiItem", ({ enumerable: true, get: function () { return parseAbiItem_js_1.parseAbiItem; } }));
var parseAbiParameter_js_1 = __webpack_require__(54912);
Object.defineProperty(exports, "parseAbiParameter", ({ enumerable: true, get: function () { return parseAbiParameter_js_1.parseAbiParameter; } }));
var parseAbiParameters_js_1 = __webpack_require__(69695);
Object.defineProperty(exports, "parseAbiParameters", ({ enumerable: true, get: function () { return parseAbiParameters_js_1.parseAbiParameters; } }));
var abiItem_js_1 = __webpack_require__(77445);
Object.defineProperty(exports, "UnknownTypeError", ({ enumerable: true, get: function () { return abiItem_js_1.UnknownTypeError; } }));
Object.defineProperty(exports, "InvalidAbiItemError", ({ enumerable: true, get: function () { return abiItem_js_1.InvalidAbiItemError; } }));
Object.defineProperty(exports, "UnknownSolidityTypeError", ({ enumerable: true, get: function () { return abiItem_js_1.UnknownSolidityTypeError; } }));
var abiParameter_js_1 = __webpack_require__(5555);
Object.defineProperty(exports, "InvalidAbiTypeParameterError", ({ enumerable: true, get: function () { return abiParameter_js_1.InvalidAbiTypeParameterError; } }));
Object.defineProperty(exports, "InvalidFunctionModifierError", ({ enumerable: true, get: function () { return abiParameter_js_1.InvalidFunctionModifierError; } }));
Object.defineProperty(exports, "InvalidModifierError", ({ enumerable: true, get: function () { return abiParameter_js_1.InvalidModifierError; } }));
Object.defineProperty(exports, "SolidityProtectedKeywordError", ({ enumerable: true, get: function () { return abiParameter_js_1.SolidityProtectedKeywordError; } }));
Object.defineProperty(exports, "InvalidParameterError", ({ enumerable: true, get: function () { return abiParameter_js_1.InvalidParameterError; } }));
Object.defineProperty(exports, "InvalidAbiParametersError", ({ enumerable: true, get: function () { return abiParameter_js_1.InvalidAbiParametersError; } }));
Object.defineProperty(exports, "InvalidAbiParameterError", ({ enumerable: true, get: function () { return abiParameter_js_1.InvalidAbiParameterError; } }));
var signature_js_1 = __webpack_require__(2494);
Object.defineProperty(exports, "InvalidStructSignatureError", ({ enumerable: true, get: function () { return signature_js_1.InvalidStructSignatureError; } }));
Object.defineProperty(exports, "InvalidSignatureError", ({ enumerable: true, get: function () { return signature_js_1.InvalidSignatureError; } }));
Object.defineProperty(exports, "UnknownSignatureError", ({ enumerable: true, get: function () { return signature_js_1.UnknownSignatureError; } }));
var splitParameters_js_1 = __webpack_require__(41448);
Object.defineProperty(exports, "InvalidParenthesisError", ({ enumerable: true, get: function () { return splitParameters_js_1.InvalidParenthesisError; } }));
var struct_js_1 = __webpack_require__(68167);
Object.defineProperty(exports, "CircularReferenceError", ({ enumerable: true, get: function () { return struct_js_1.CircularReferenceError; } }));
//# sourceMappingURL=index.js.map

/***/ }),

/***/ 72054:
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.narrow = void 0;
function narrow(value) {
    return value;
}
exports.narrow = narrow;
//# sourceMappingURL=narrow.js.map

/***/ }),

/***/ 16390:
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.isTupleRegex = exports.integerRegex = exports.bytesRegex = exports.execTyped = void 0;
function execTyped(regex, string) {
    const match = regex.exec(string);
    return match?.groups;
}
exports.execTyped = execTyped;
exports.bytesRegex = /^bytes([1-9]|1[0-9]|2[0-9]|3[0-2])?$/;
exports.integerRegex = /^u?int(8|16|24|32|40|48|56|64|72|80|88|96|104|112|120|128|136|144|152|160|168|176|184|192|200|208|216|224|232|240|248|256)?$/;
exports.isTupleRegex = /^\(.+?\).*?$/;
//# sourceMappingURL=regex.js.map

/***/ }),

/***/ 81113:
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.version = void 0;
exports.version = '0.9.8';
//# sourceMappingURL=version.js.map

/***/ }),

/***/ 79429:
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.parseAccount = void 0;
function parseAccount(account) {
    if (typeof account === 'string')
        return { address: account, type: 'json-rpc' };
    return account;
}
exports.parseAccount = parseAccount;
//# sourceMappingURL=parseAccount.js.map

/***/ }),

/***/ 13740:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.publicKeyToAddress = void 0;
const getAddress_js_1 = __webpack_require__(18717);
const keccak256_js_1 = __webpack_require__(43708);
function publicKeyToAddress(publicKey) {
    const address = (0, keccak256_js_1.keccak256)(`0x${publicKey.substring(4)}`).substring(26);
    return (0, getAddress_js_1.checksumAddress)(`0x${address}`);
}
exports.publicKeyToAddress = publicKeyToAddress;
//# sourceMappingURL=publicKeyToAddress.js.map

/***/ }),

/***/ 93455:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getEnsAddress = void 0;
const abis_js_1 = __webpack_require__(22187);
const decodeFunctionResult_js_1 = __webpack_require__(22080);
const encodeFunctionData_js_1 = __webpack_require__(99117);
const getChainContractAddress_js_1 = __webpack_require__(30245);
const trim_js_1 = __webpack_require__(45611);
const toHex_js_1 = __webpack_require__(86340);
const errors_js_1 = __webpack_require__(9806);
const namehash_js_1 = __webpack_require__(76230);
const packetToBytes_js_1 = __webpack_require__(91725);
const getAction_js_1 = __webpack_require__(46840);
const readContract_js_1 = __webpack_require__(83000);
async function getEnsAddress(client, { blockNumber, blockTag, coinType, name, universalResolverAddress: universalResolverAddress_, }) {
    let universalResolverAddress = universalResolverAddress_;
    if (!universalResolverAddress) {
        if (!client.chain)
            throw new Error('client chain not configured. universalResolverAddress is required.');
        universalResolverAddress = (0, getChainContractAddress_js_1.getChainContractAddress)({
            blockNumber,
            chain: client.chain,
            contract: 'ensUniversalResolver',
        });
    }
    try {
        const functionData = (0, encodeFunctionData_js_1.encodeFunctionData)({
            abi: abis_js_1.addressResolverAbi,
            functionName: 'addr',
            ...(coinType != null
                ? { args: [(0, namehash_js_1.namehash)(name), BigInt(coinType)] }
                : { args: [(0, namehash_js_1.namehash)(name)] }),
        });
        const res = await (0, getAction_js_1.getAction)(client, readContract_js_1.readContract, 'readContract')({
            address: universalResolverAddress,
            abi: abis_js_1.universalResolverResolveAbi,
            functionName: 'resolve',
            args: [(0, toHex_js_1.toHex)((0, packetToBytes_js_1.packetToBytes)(name)), functionData],
            blockNumber,
            blockTag,
        });
        if (res[0] === '0x')
            return null;
        const address = (0, decodeFunctionResult_js_1.decodeFunctionResult)({
            abi: abis_js_1.addressResolverAbi,
            args: coinType != null ? [(0, namehash_js_1.namehash)(name), BigInt(coinType)] : undefined,
            functionName: 'addr',
            data: res[0],
        });
        if (address === '0x')
            return null;
        if ((0, trim_js_1.trim)(address) === '0x00')
            return null;
        return address;
    }
    catch (err) {
        if ((0, errors_js_1.isNullUniversalResolverError)(err, 'resolve'))
            return null;
        throw err;
    }
}
exports.getEnsAddress = getEnsAddress;
//# sourceMappingURL=getEnsAddress.js.map

/***/ }),

/***/ 28994:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getEnsAvatar = void 0;
const parseAvatarRecord_js_1 = __webpack_require__(59340);
const getAction_js_1 = __webpack_require__(46840);
const getEnsText_js_1 = __webpack_require__(2348);
async function getEnsAvatar(client, { blockNumber, blockTag, gatewayUrls, name, universalResolverAddress, }) {
    const record = await (0, getAction_js_1.getAction)(client, getEnsText_js_1.getEnsText, 'getEnsText')({
        blockNumber,
        blockTag,
        key: 'avatar',
        name,
        universalResolverAddress,
    });
    if (!record)
        return null;
    try {
        return await (0, parseAvatarRecord_js_1.parseAvatarRecord)(client, { record, gatewayUrls });
    }
    catch {
        return null;
    }
}
exports.getEnsAvatar = getEnsAvatar;
//# sourceMappingURL=getEnsAvatar.js.map

/***/ }),

/***/ 38576:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getEnsName = void 0;
const abis_js_1 = __webpack_require__(22187);
const getChainContractAddress_js_1 = __webpack_require__(30245);
const toHex_js_1 = __webpack_require__(86340);
const errors_js_1 = __webpack_require__(9806);
const packetToBytes_js_1 = __webpack_require__(91725);
const getAction_js_1 = __webpack_require__(46840);
const readContract_js_1 = __webpack_require__(83000);
async function getEnsName(client, { address, blockNumber, blockTag, universalResolverAddress: universalResolverAddress_, }) {
    let universalResolverAddress = universalResolverAddress_;
    if (!universalResolverAddress) {
        if (!client.chain)
            throw new Error('client chain not configured. universalResolverAddress is required.');
        universalResolverAddress = (0, getChainContractAddress_js_1.getChainContractAddress)({
            blockNumber,
            chain: client.chain,
            contract: 'ensUniversalResolver',
        });
    }
    const reverseNode = `${address.toLowerCase().substring(2)}.addr.reverse`;
    try {
        const [name, resolvedAddress] = await (0, getAction_js_1.getAction)(client, readContract_js_1.readContract, 'readContract')({
            address: universalResolverAddress,
            abi: abis_js_1.universalResolverReverseAbi,
            functionName: 'reverse',
            args: [(0, toHex_js_1.toHex)((0, packetToBytes_js_1.packetToBytes)(reverseNode))],
            blockNumber,
            blockTag,
        });
        if (address.toLowerCase() !== resolvedAddress.toLowerCase())
            return null;
        return name;
    }
    catch (err) {
        if ((0, errors_js_1.isNullUniversalResolverError)(err, 'reverse'))
            return null;
        throw err;
    }
}
exports.getEnsName = getEnsName;
//# sourceMappingURL=getEnsName.js.map

/***/ }),

/***/ 8645:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getEnsResolver = void 0;
const getChainContractAddress_js_1 = __webpack_require__(30245);
const toHex_js_1 = __webpack_require__(86340);
const packetToBytes_js_1 = __webpack_require__(91725);
const getAction_js_1 = __webpack_require__(46840);
const readContract_js_1 = __webpack_require__(83000);
async function getEnsResolver(client, { blockNumber, blockTag, name, universalResolverAddress: universalResolverAddress_, }) {
    let universalResolverAddress = universalResolverAddress_;
    if (!universalResolverAddress) {
        if (!client.chain)
            throw new Error('client chain not configured. universalResolverAddress is required.');
        universalResolverAddress = (0, getChainContractAddress_js_1.getChainContractAddress)({
            blockNumber,
            chain: client.chain,
            contract: 'ensUniversalResolver',
        });
    }
    const [resolverAddress] = await (0, getAction_js_1.getAction)(client, readContract_js_1.readContract, 'readContract')({
        address: universalResolverAddress,
        abi: [
            {
                inputs: [{ type: 'bytes' }],
                name: 'findResolver',
                outputs: [{ type: 'address' }, { type: 'bytes32' }],
                stateMutability: 'view',
                type: 'function',
            },
        ],
        functionName: 'findResolver',
        args: [(0, toHex_js_1.toHex)((0, packetToBytes_js_1.packetToBytes)(name))],
        blockNumber,
        blockTag,
    });
    return resolverAddress;
}
exports.getEnsResolver = getEnsResolver;
//# sourceMappingURL=getEnsResolver.js.map

/***/ }),

/***/ 2348:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getEnsText = void 0;
const abis_js_1 = __webpack_require__(22187);
const decodeFunctionResult_js_1 = __webpack_require__(22080);
const encodeFunctionData_js_1 = __webpack_require__(99117);
const getChainContractAddress_js_1 = __webpack_require__(30245);
const toHex_js_1 = __webpack_require__(86340);
const errors_js_1 = __webpack_require__(9806);
const namehash_js_1 = __webpack_require__(76230);
const packetToBytes_js_1 = __webpack_require__(91725);
const getAction_js_1 = __webpack_require__(46840);
const readContract_js_1 = __webpack_require__(83000);
async function getEnsText(client, { blockNumber, blockTag, name, key, universalResolverAddress: universalResolverAddress_, }) {
    let universalResolverAddress = universalResolverAddress_;
    if (!universalResolverAddress) {
        if (!client.chain)
            throw new Error('client chain not configured. universalResolverAddress is required.');
        universalResolverAddress = (0, getChainContractAddress_js_1.getChainContractAddress)({
            blockNumber,
            chain: client.chain,
            contract: 'ensUniversalResolver',
        });
    }
    try {
        const res = await (0, getAction_js_1.getAction)(client, readContract_js_1.readContract, 'readContract')({
            address: universalResolverAddress,
            abi: abis_js_1.universalResolverResolveAbi,
            functionName: 'resolve',
            args: [
                (0, toHex_js_1.toHex)((0, packetToBytes_js_1.packetToBytes)(name)),
                (0, encodeFunctionData_js_1.encodeFunctionData)({
                    abi: abis_js_1.textResolverAbi,
                    functionName: 'text',
                    args: [(0, namehash_js_1.namehash)(name), key],
                }),
            ],
            blockNumber,
            blockTag,
        });
        if (res[0] === '0x')
            return null;
        const record = (0, decodeFunctionResult_js_1.decodeFunctionResult)({
            abi: abis_js_1.textResolverAbi,
            functionName: 'text',
            data: res[0],
        });
        return record === '' ? null : record;
    }
    catch (err) {
        if ((0, errors_js_1.isNullUniversalResolverError)(err, 'resolve'))
            return null;
        throw err;
    }
}
exports.getEnsText = getEnsText;
//# sourceMappingURL=getEnsText.js.map

/***/ }),

/***/ 69506:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getEventParameters = exports.getFunctionParameters = exports.getContract = void 0;
const getAction_js_1 = __webpack_require__(46840);
const createContractEventFilter_js_1 = __webpack_require__(36568);
const estimateContractGas_js_1 = __webpack_require__(72577);
const getContractEvents_js_1 = __webpack_require__(7599);
const readContract_js_1 = __webpack_require__(83000);
const simulateContract_js_1 = __webpack_require__(17802);
const watchContractEvent_js_1 = __webpack_require__(94169);
const writeContract_js_1 = __webpack_require__(41125);
function getContract({ abi, address, publicClient, walletClient, }) {
    const hasPublicClient = publicClient !== undefined && publicClient !== null;
    const hasWalletClient = walletClient !== undefined && walletClient !== null;
    const contract = {};
    let hasReadFunction = false;
    let hasWriteFunction = false;
    let hasEvent = false;
    for (const item of abi) {
        if (item.type === 'function')
            if (item.stateMutability === 'view' || item.stateMutability === 'pure')
                hasReadFunction = true;
            else
                hasWriteFunction = true;
        else if (item.type === 'event')
            hasEvent = true;
        if (hasReadFunction && hasWriteFunction && hasEvent)
            break;
    }
    if (hasPublicClient) {
        if (hasReadFunction)
            contract.read = new Proxy({}, {
                get(_, functionName) {
                    return (...parameters) => {
                        const { args, options } = getFunctionParameters(parameters);
                        return (0, getAction_js_1.getAction)(publicClient, readContract_js_1.readContract, 'readContract')({
                            abi,
                            address,
                            functionName,
                            args,
                            ...options,
                        });
                    };
                },
            });
        if (hasWriteFunction)
            contract.simulate = new Proxy({}, {
                get(_, functionName) {
                    return (...parameters) => {
                        const { args, options } = getFunctionParameters(parameters);
                        return (0, getAction_js_1.getAction)(publicClient, simulateContract_js_1.simulateContract, 'simulateContract')({
                            abi,
                            address,
                            functionName,
                            args,
                            ...options,
                        });
                    };
                },
            });
        if (hasEvent) {
            contract.createEventFilter = new Proxy({}, {
                get(_, eventName) {
                    return (...parameters) => {
                        const abiEvent = abi.find((x) => x.type === 'event' && x.name === eventName);
                        const { args, options } = getEventParameters(parameters, abiEvent);
                        return (0, getAction_js_1.getAction)(publicClient, createContractEventFilter_js_1.createContractEventFilter, 'createContractEventFilter')({
                            abi,
                            address,
                            eventName,
                            args,
                            ...options,
                        });
                    };
                },
            });
            contract.getEvents = new Proxy({}, {
                get(_, eventName) {
                    return (...parameters) => {
                        const abiEvent = abi.find((x) => x.type === 'event' && x.name === eventName);
                        const { args, options } = getEventParameters(parameters, abiEvent);
                        return (0, getAction_js_1.getAction)(publicClient, getContractEvents_js_1.getContractEvents, 'getContractEvents')({
                            abi,
                            address,
                            eventName,
                            args,
                            ...options,
                        });
                    };
                },
            });
            contract.watchEvent = new Proxy({}, {
                get(_, eventName) {
                    return (...parameters) => {
                        const abiEvent = abi.find((x) => x.type === 'event' && x.name === eventName);
                        const { args, options } = getEventParameters(parameters, abiEvent);
                        return (0, getAction_js_1.getAction)(publicClient, watchContractEvent_js_1.watchContractEvent, 'watchContractEvent')({
                            abi,
                            address,
                            eventName,
                            args,
                            ...options,
                        });
                    };
                },
            });
        }
    }
    if (hasWalletClient) {
        if (hasWriteFunction)
            contract.write = new Proxy({}, {
                get(_, functionName) {
                    return (...parameters) => {
                        const { args, options } = getFunctionParameters(parameters);
                        return (0, getAction_js_1.getAction)(walletClient, writeContract_js_1.writeContract, 'writeContract')({
                            abi,
                            address,
                            functionName,
                            args,
                            ...options,
                        });
                    };
                },
            });
    }
    if (hasPublicClient || hasWalletClient)
        if (hasWriteFunction)
            contract.estimateGas = new Proxy({}, {
                get(_, functionName) {
                    return (...parameters) => {
                        const { args, options } = getFunctionParameters(parameters);
                        const client = (publicClient ?? walletClient);
                        return (0, getAction_js_1.getAction)(client, estimateContractGas_js_1.estimateContractGas, 'estimateContractGas')({
                            abi,
                            address,
                            functionName,
                            args,
                            ...options,
                            account: options.account ??
                                walletClient.account,
                        });
                    };
                },
            });
    contract.address = address;
    contract.abi = abi;
    return contract;
}
exports.getContract = getContract;
function getFunctionParameters(values) {
    const hasArgs = values.length && Array.isArray(values[0]);
    const args = hasArgs ? values[0] : [];
    const options = (hasArgs ? values[1] : values[0]) ?? {};
    return { args, options };
}
exports.getFunctionParameters = getFunctionParameters;
function getEventParameters(values, abiEvent) {
    let hasArgs = false;
    if (Array.isArray(values[0]))
        hasArgs = true;
    else if (values.length === 1) {
        hasArgs = abiEvent.inputs.some((x) => x.indexed);
    }
    else if (values.length === 2) {
        hasArgs = true;
    }
    const args = hasArgs ? values[0] : undefined;
    const options = (hasArgs ? values[1] : values[0]) ?? {};
    return { args, options };
}
exports.getEventParameters = getEventParameters;
//# sourceMappingURL=getContract.js.map

/***/ }),

/***/ 6882:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getRevertErrorData = exports.call = void 0;
const parseAccount_js_1 = __webpack_require__(79429);
const abis_js_1 = __webpack_require__(22187);
const contract_js_1 = __webpack_require__(32302);
const base_js_1 = __webpack_require__(24437);
const chain_js_1 = __webpack_require__(73587);
const contract_js_2 = __webpack_require__(30474);
const decodeFunctionResult_js_1 = __webpack_require__(22080);
const encodeFunctionData_js_1 = __webpack_require__(99117);
const getChainContractAddress_js_1 = __webpack_require__(30245);
const toHex_js_1 = __webpack_require__(86340);
const getCallError_js_1 = __webpack_require__(96600);
const extract_js_1 = __webpack_require__(65457);
const transactionRequest_js_1 = __webpack_require__(23459);
const createBatchScheduler_js_1 = __webpack_require__(3315);
const assertRequest_js_1 = __webpack_require__(12546);
async function call(client, args) {
    const { account: account_ = client.account, batch = Boolean(client.batch?.multicall), blockNumber, blockTag = 'latest', accessList, data, gas, gasPrice, maxFeePerGas, maxPriorityFeePerGas, nonce, to, value, ...rest } = args;
    const account = account_ ? (0, parseAccount_js_1.parseAccount)(account_) : undefined;
    try {
        (0, assertRequest_js_1.assertRequest)(args);
        const blockNumberHex = blockNumber ? (0, toHex_js_1.numberToHex)(blockNumber) : undefined;
        const block = blockNumberHex || blockTag;
        const chainFormat = client.chain?.formatters?.transactionRequest?.format;
        const format = chainFormat || transactionRequest_js_1.formatTransactionRequest;
        const request = format({
            ...(0, extract_js_1.extract)(rest, { format: chainFormat }),
            from: account?.address,
            accessList,
            data,
            gas,
            gasPrice,
            maxFeePerGas,
            maxPriorityFeePerGas,
            nonce,
            to,
            value,
        });
        if (batch && shouldPerformMulticall({ request })) {
            try {
                return await scheduleMulticall(client, {
                    ...request,
                    blockNumber,
                    blockTag,
                });
            }
            catch (err) {
                if (!(err instanceof chain_js_1.ClientChainNotConfiguredError) &&
                    !(err instanceof chain_js_1.ChainDoesNotSupportContract))
                    throw err;
            }
        }
        const response = await client.request({
            method: 'eth_call',
            params: block
                ? [request, block]
                : [request],
        });
        if (response === '0x')
            return { data: undefined };
        return { data: response };
    }
    catch (err) {
        const data = getRevertErrorData(err);
        const { offchainLookup, offchainLookupSignature } = await Promise.resolve().then(() => __webpack_require__(61091));
        if (data?.slice(0, 10) === offchainLookupSignature && to) {
            return { data: await offchainLookup(client, { data, to }) };
        }
        throw (0, getCallError_js_1.getCallError)(err, {
            ...args,
            account,
            chain: client.chain,
        });
    }
}
exports.call = call;
function shouldPerformMulticall({ request }) {
    const { data, to, ...request_ } = request;
    if (!data)
        return false;
    if (data.startsWith(contract_js_1.aggregate3Signature))
        return false;
    if (!to)
        return false;
    if (Object.values(request_).filter((x) => typeof x !== 'undefined').length > 0)
        return false;
    return true;
}
async function scheduleMulticall(client, args) {
    const { batchSize = 1024, wait = 0 } = typeof client.batch?.multicall === 'object' ? client.batch.multicall : {};
    const { blockNumber, blockTag = 'latest', data, multicallAddress: multicallAddress_, to, } = args;
    let multicallAddress = multicallAddress_;
    if (!multicallAddress) {
        if (!client.chain)
            throw new chain_js_1.ClientChainNotConfiguredError();
        multicallAddress = (0, getChainContractAddress_js_1.getChainContractAddress)({
            blockNumber,
            chain: client.chain,
            contract: 'multicall3',
        });
    }
    const blockNumberHex = blockNumber ? (0, toHex_js_1.numberToHex)(blockNumber) : undefined;
    const block = blockNumberHex || blockTag;
    const { schedule } = (0, createBatchScheduler_js_1.createBatchScheduler)({
        id: `${client.uid}.${block}`,
        wait,
        shouldSplitBatch(args) {
            const size = args.reduce((size, { data }) => size + (data.length - 2), 0);
            return size > batchSize * 2;
        },
        fn: async (requests) => {
            const calls = requests.map((request) => ({
                allowFailure: true,
                callData: request.data,
                target: request.to,
            }));
            const calldata = (0, encodeFunctionData_js_1.encodeFunctionData)({
                abi: abis_js_1.multicall3Abi,
                args: [calls],
                functionName: 'aggregate3',
            });
            const data = await client.request({
                method: 'eth_call',
                params: [
                    {
                        data: calldata,
                        to: multicallAddress,
                    },
                    block,
                ],
            });
            return (0, decodeFunctionResult_js_1.decodeFunctionResult)({
                abi: abis_js_1.multicall3Abi,
                args: [calls],
                functionName: 'aggregate3',
                data: data || '0x',
            });
        },
    });
    const [{ returnData, success }] = await schedule({ data, to });
    if (!success)
        throw new contract_js_2.RawContractError({ data: returnData });
    if (returnData === '0x')
        return { data: undefined };
    return { data: returnData };
}
function getRevertErrorData(err) {
    if (!(err instanceof base_js_1.BaseError))
        return undefined;
    const error = err.walk();
    return typeof error.data === 'object' ? error.data.data : error.data;
}
exports.getRevertErrorData = getRevertErrorData;
//# sourceMappingURL=call.js.map

/***/ }),

/***/ 93003:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.createBlockFilter = void 0;
const createFilterRequestScope_js_1 = __webpack_require__(57353);
async function createBlockFilter(client) {
    const getRequest = (0, createFilterRequestScope_js_1.createFilterRequestScope)(client, {
        method: 'eth_newBlockFilter',
    });
    const id = await client.request({
        method: 'eth_newBlockFilter',
    });
    return { id, request: getRequest(id), type: 'block' };
}
exports.createBlockFilter = createBlockFilter;
//# sourceMappingURL=createBlockFilter.js.map

/***/ }),

/***/ 36568:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.createContractEventFilter = void 0;
const encodeEventTopics_js_1 = __webpack_require__(38805);
const toHex_js_1 = __webpack_require__(86340);
const createFilterRequestScope_js_1 = __webpack_require__(57353);
async function createContractEventFilter(client, { address, abi, args, eventName, fromBlock, strict, toBlock, }) {
    const getRequest = (0, createFilterRequestScope_js_1.createFilterRequestScope)(client, {
        method: 'eth_newFilter',
    });
    const topics = eventName
        ? (0, encodeEventTopics_js_1.encodeEventTopics)({
            abi,
            args,
            eventName,
        })
        : undefined;
    const id = await client.request({
        method: 'eth_newFilter',
        params: [
            {
                address,
                fromBlock: typeof fromBlock === 'bigint' ? (0, toHex_js_1.numberToHex)(fromBlock) : fromBlock,
                toBlock: typeof toBlock === 'bigint' ? (0, toHex_js_1.numberToHex)(toBlock) : toBlock,
                topics,
            },
        ],
    });
    return {
        abi,
        args,
        eventName,
        id,
        request: getRequest(id),
        strict,
        type: 'event',
    };
}
exports.createContractEventFilter = createContractEventFilter;
//# sourceMappingURL=createContractEventFilter.js.map

/***/ }),

/***/ 80786:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.createEventFilter = void 0;
const encodeEventTopics_js_1 = __webpack_require__(38805);
const toHex_js_1 = __webpack_require__(86340);
const createFilterRequestScope_js_1 = __webpack_require__(57353);
async function createEventFilter(client, { address, args, event, events: events_, fromBlock, strict, toBlock, } = {}) {
    const events = events_ ?? (event ? [event] : undefined);
    const getRequest = (0, createFilterRequestScope_js_1.createFilterRequestScope)(client, {
        method: 'eth_newFilter',
    });
    let topics = [];
    if (events) {
        topics = [
            events.flatMap((event) => (0, encodeEventTopics_js_1.encodeEventTopics)({
                abi: [event],
                eventName: event.name,
                args,
            })),
        ];
        if (event)
            topics = topics[0];
    }
    const id = await client.request({
        method: 'eth_newFilter',
        params: [
            {
                address,
                fromBlock: typeof fromBlock === 'bigint' ? (0, toHex_js_1.numberToHex)(fromBlock) : fromBlock,
                toBlock: typeof toBlock === 'bigint' ? (0, toHex_js_1.numberToHex)(toBlock) : toBlock,
                ...(topics.length ? { topics } : {}),
            },
        ],
    });
    return {
        abi: events,
        args,
        eventName: event ? event.name : undefined,
        fromBlock,
        id,
        request: getRequest(id),
        strict,
        toBlock,
        type: 'event',
    };
}
exports.createEventFilter = createEventFilter;
//# sourceMappingURL=createEventFilter.js.map

/***/ }),

/***/ 34977:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.createPendingTransactionFilter = void 0;
const createFilterRequestScope_js_1 = __webpack_require__(57353);
async function createPendingTransactionFilter(client) {
    const getRequest = (0, createFilterRequestScope_js_1.createFilterRequestScope)(client, {
        method: 'eth_newPendingTransactionFilter',
    });
    const id = await client.request({
        method: 'eth_newPendingTransactionFilter',
    });
    return { id, request: getRequest(id), type: 'transaction' };
}
exports.createPendingTransactionFilter = createPendingTransactionFilter;
//# sourceMappingURL=createPendingTransactionFilter.js.map

/***/ }),

/***/ 72577:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.estimateContractGas = void 0;
const parseAccount_js_1 = __webpack_require__(79429);
const encodeFunctionData_js_1 = __webpack_require__(99117);
const getContractError_js_1 = __webpack_require__(92154);
const getAction_js_1 = __webpack_require__(46840);
const estimateGas_js_1 = __webpack_require__(55191);
async function estimateContractGas(client, { abi, address, args, functionName, ...request }) {
    const data = (0, encodeFunctionData_js_1.encodeFunctionData)({
        abi,
        args,
        functionName,
    });
    try {
        const gas = await (0, getAction_js_1.getAction)(client, estimateGas_js_1.estimateGas, 'estimateGas')({
            data,
            to: address,
            ...request,
        });
        return gas;
    }
    catch (err) {
        const account = request.account ? (0, parseAccount_js_1.parseAccount)(request.account) : undefined;
        throw (0, getContractError_js_1.getContractError)(err, {
            abi: abi,
            address,
            args,
            docsPath: '/docs/contract/estimateContractGas',
            functionName,
            sender: account?.address,
        });
    }
}
exports.estimateContractGas = estimateContractGas;
//# sourceMappingURL=estimateContractGas.js.map

/***/ }),

/***/ 56201:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.internal_estimateFeesPerGas = exports.estimateFeesPerGas = void 0;
const fee_js_1 = __webpack_require__(16422);
const getAction_js_1 = __webpack_require__(46840);
const estimateMaxPriorityFeePerGas_js_1 = __webpack_require__(35778);
const getBlock_js_1 = __webpack_require__(10543);
const getGasPrice_js_1 = __webpack_require__(53598);
async function estimateFeesPerGas(client, args) {
    return internal_estimateFeesPerGas(client, args);
}
exports.estimateFeesPerGas = estimateFeesPerGas;
async function internal_estimateFeesPerGas(client, args) {
    const { block: block_, chain = client.chain, request, type = 'eip1559', } = args || {};
    const baseFeeMultiplier = await (async () => {
        if (typeof chain?.fees?.baseFeeMultiplier === 'function')
            return chain.fees.baseFeeMultiplier({
                block: block_,
                client,
                request,
            });
        return chain?.fees?.baseFeeMultiplier ?? 1.2;
    })();
    if (baseFeeMultiplier < 1)
        throw new fee_js_1.BaseFeeScalarError();
    const decimals = baseFeeMultiplier.toString().split('.')[1]?.length ?? 0;
    const denominator = 10 ** decimals;
    const multiply = (base) => (base * BigInt(Math.ceil(baseFeeMultiplier * denominator))) /
        BigInt(denominator);
    const block = block_
        ? block_
        : await (0, getAction_js_1.getAction)(client, getBlock_js_1.getBlock, 'getBlock')({});
    if (typeof chain?.fees?.estimateFeesPerGas === 'function')
        return chain.fees.estimateFeesPerGas({
            block: block_,
            client,
            multiply,
            request,
            type,
        });
    if (type === 'eip1559') {
        if (typeof block.baseFeePerGas !== 'bigint')
            throw new fee_js_1.Eip1559FeesNotSupportedError();
        const maxPriorityFeePerGas = request?.maxPriorityFeePerGas
            ? request.maxPriorityFeePerGas
            : await (0, estimateMaxPriorityFeePerGas_js_1.internal_estimateMaxPriorityFeePerGas)(client, {
                block,
                chain,
                request,
            });
        const baseFeePerGas = multiply(block.baseFeePerGas);
        const maxFeePerGas = request?.maxFeePerGas ?? baseFeePerGas + maxPriorityFeePerGas;
        return {
            maxFeePerGas,
            maxPriorityFeePerGas,
        };
    }
    const gasPrice = request?.gasPrice ??
        multiply(await (0, getAction_js_1.getAction)(client, getGasPrice_js_1.getGasPrice, 'getGasPrice')({}));
    return {
        gasPrice,
    };
}
exports.internal_estimateFeesPerGas = internal_estimateFeesPerGas;
//# sourceMappingURL=estimateFeesPerGas.js.map

/***/ }),

/***/ 55191:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.estimateGas = void 0;
const parseAccount_js_1 = __webpack_require__(79429);
const account_js_1 = __webpack_require__(31885);
const toHex_js_1 = __webpack_require__(86340);
const getEstimateGasError_js_1 = __webpack_require__(29351);
const extract_js_1 = __webpack_require__(65457);
const transactionRequest_js_1 = __webpack_require__(23459);
const assertRequest_js_1 = __webpack_require__(12546);
const prepareTransactionRequest_js_1 = __webpack_require__(42170);
async function estimateGas(client, args) {
    const account_ = args.account ?? client.account;
    if (!account_)
        throw new account_js_1.AccountNotFoundError({
            docsPath: '/docs/actions/public/estimateGas',
        });
    const account = (0, parseAccount_js_1.parseAccount)(account_);
    try {
        const { accessList, blockNumber, blockTag, data, gas, gasPrice, maxFeePerGas, maxPriorityFeePerGas, nonce, to, value, ...rest } = account.type === 'local'
            ? (await (0, prepareTransactionRequest_js_1.prepareTransactionRequest)(client, args))
            : args;
        const blockNumberHex = blockNumber ? (0, toHex_js_1.numberToHex)(blockNumber) : undefined;
        const block = blockNumberHex || blockTag;
        (0, assertRequest_js_1.assertRequest)(args);
        const chainFormat = client.chain?.formatters?.transactionRequest?.format;
        const format = chainFormat || transactionRequest_js_1.formatTransactionRequest;
        const request = format({
            ...(0, extract_js_1.extract)(rest, { format: chainFormat }),
            from: account.address,
            accessList,
            data,
            gas,
            gasPrice,
            maxFeePerGas,
            maxPriorityFeePerGas,
            nonce,
            to,
            value,
        });
        const balance = await client.request({
            method: 'eth_estimateGas',
            params: block ? [request, block] : [request],
        });
        return BigInt(balance);
    }
    catch (err) {
        throw (0, getEstimateGasError_js_1.getEstimateGasError)(err, {
            ...args,
            account,
            chain: client.chain,
        });
    }
}
exports.estimateGas = estimateGas;
//# sourceMappingURL=estimateGas.js.map

/***/ }),

/***/ 35778:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.internal_estimateMaxPriorityFeePerGas = exports.estimateMaxPriorityFeePerGas = void 0;
const fee_js_1 = __webpack_require__(16422);
const fromHex_js_1 = __webpack_require__(50159);
const getAction_js_1 = __webpack_require__(46840);
const getBlock_js_1 = __webpack_require__(10543);
const getGasPrice_js_1 = __webpack_require__(53598);
async function estimateMaxPriorityFeePerGas(client, args) {
    return internal_estimateMaxPriorityFeePerGas(client, args);
}
exports.estimateMaxPriorityFeePerGas = estimateMaxPriorityFeePerGas;
async function internal_estimateMaxPriorityFeePerGas(client, args) {
    const { block: block_, chain = client.chain, request } = args || {};
    if (typeof chain?.fees?.defaultPriorityFee === 'function') {
        const block = block_ || (await (0, getAction_js_1.getAction)(client, getBlock_js_1.getBlock, 'getBlock')({}));
        return chain.fees.defaultPriorityFee({
            block,
            client,
            request,
        });
    }
    if (typeof chain?.fees?.defaultPriorityFee !== 'undefined')
        return chain?.fees?.defaultPriorityFee;
    try {
        const maxPriorityFeePerGasHex = await client.request({
            method: 'eth_maxPriorityFeePerGas',
        });
        return (0, fromHex_js_1.hexToBigInt)(maxPriorityFeePerGasHex);
    }
    catch {
        const [block, gasPrice] = await Promise.all([
            block_
                ? Promise.resolve(block_)
                : (0, getAction_js_1.getAction)(client, getBlock_js_1.getBlock, 'getBlock')({}),
            (0, getAction_js_1.getAction)(client, getGasPrice_js_1.getGasPrice, 'getGasPrice')({}),
        ]);
        if (typeof block.baseFeePerGas !== 'bigint')
            throw new fee_js_1.Eip1559FeesNotSupportedError();
        const maxPriorityFeePerGas = gasPrice - block.baseFeePerGas;
        if (maxPriorityFeePerGas < 0n)
            return 0n;
        return maxPriorityFeePerGas;
    }
}
exports.internal_estimateMaxPriorityFeePerGas = internal_estimateMaxPriorityFeePerGas;
//# sourceMappingURL=estimateMaxPriorityFeePerGas.js.map

/***/ }),

/***/ 45798:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getBalance = void 0;
const toHex_js_1 = __webpack_require__(86340);
async function getBalance(client, { address, blockNumber, blockTag = 'latest' }) {
    const blockNumberHex = blockNumber ? (0, toHex_js_1.numberToHex)(blockNumber) : undefined;
    const balance = await client.request({
        method: 'eth_getBalance',
        params: [address, blockNumberHex || blockTag],
    });
    return BigInt(balance);
}
exports.getBalance = getBalance;
//# sourceMappingURL=getBalance.js.map

/***/ }),

/***/ 10543:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getBlock = void 0;
const block_js_1 = __webpack_require__(57343);
const toHex_js_1 = __webpack_require__(86340);
const block_js_2 = __webpack_require__(12885);
async function getBlock(client, { blockHash, blockNumber, blockTag: blockTag_, includeTransactions: includeTransactions_, } = {}) {
    const blockTag = blockTag_ ?? 'latest';
    const includeTransactions = includeTransactions_ ?? false;
    const blockNumberHex = blockNumber !== undefined ? (0, toHex_js_1.numberToHex)(blockNumber) : undefined;
    let block = null;
    if (blockHash) {
        block = await client.request({
            method: 'eth_getBlockByHash',
            params: [blockHash, includeTransactions],
        });
    }
    else {
        block = await client.request({
            method: 'eth_getBlockByNumber',
            params: [blockNumberHex || blockTag, includeTransactions],
        });
    }
    if (!block)
        throw new block_js_1.BlockNotFoundError({ blockHash, blockNumber });
    const format = client.chain?.formatters?.block?.format || block_js_2.formatBlock;
    return format(block);
}
exports.getBlock = getBlock;
//# sourceMappingURL=getBlock.js.map

/***/ }),

/***/ 95546:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getBlockNumber = exports.getBlockNumberCache = void 0;
const withCache_js_1 = __webpack_require__(35102);
const cacheKey = (id) => `blockNumber.${id}`;
function getBlockNumberCache(id) {
    return (0, withCache_js_1.getCache)(cacheKey(id));
}
exports.getBlockNumberCache = getBlockNumberCache;
async function getBlockNumber(client, { cacheTime = client.cacheTime, maxAge } = {}) {
    const blockNumberHex = await (0, withCache_js_1.withCache)(() => client.request({
        method: 'eth_blockNumber',
    }), { cacheKey: cacheKey(client.uid), cacheTime: maxAge ?? cacheTime });
    return BigInt(blockNumberHex);
}
exports.getBlockNumber = getBlockNumber;
//# sourceMappingURL=getBlockNumber.js.map

/***/ }),

/***/ 6476:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getBlockTransactionCount = void 0;
const fromHex_js_1 = __webpack_require__(50159);
const toHex_js_1 = __webpack_require__(86340);
async function getBlockTransactionCount(client, { blockHash, blockNumber, blockTag = 'latest', } = {}) {
    const blockNumberHex = blockNumber !== undefined ? (0, toHex_js_1.numberToHex)(blockNumber) : undefined;
    let count;
    if (blockHash) {
        count = await client.request({
            method: 'eth_getBlockTransactionCountByHash',
            params: [blockHash],
        });
    }
    else {
        count = await client.request({
            method: 'eth_getBlockTransactionCountByNumber',
            params: [blockNumberHex || blockTag],
        });
    }
    return (0, fromHex_js_1.hexToNumber)(count);
}
exports.getBlockTransactionCount = getBlockTransactionCount;
//# sourceMappingURL=getBlockTransactionCount.js.map

/***/ }),

/***/ 98083:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getBytecode = void 0;
const toHex_js_1 = __webpack_require__(86340);
async function getBytecode(client, { address, blockNumber, blockTag = 'latest' }) {
    const blockNumberHex = blockNumber !== undefined ? (0, toHex_js_1.numberToHex)(blockNumber) : undefined;
    const hex = await client.request({
        method: 'eth_getCode',
        params: [address, blockNumberHex || blockTag],
    });
    if (hex === '0x')
        return undefined;
    return hex;
}
exports.getBytecode = getBytecode;
//# sourceMappingURL=getBytecode.js.map

/***/ }),

/***/ 6466:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getChainId = void 0;
const fromHex_js_1 = __webpack_require__(50159);
async function getChainId(client) {
    const chainIdHex = await client.request({
        method: 'eth_chainId',
    });
    return (0, fromHex_js_1.hexToNumber)(chainIdHex);
}
exports.getChainId = getChainId;
//# sourceMappingURL=getChainId.js.map

/***/ }),

/***/ 7599:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getContractEvents = void 0;
const getAbiItem_js_1 = __webpack_require__(79606);
const getAction_js_1 = __webpack_require__(46840);
const getLogs_js_1 = __webpack_require__(65739);
async function getContractEvents(client, { abi, address, args, blockHash, eventName, fromBlock, toBlock, strict, }) {
    const event = eventName
        ? (0, getAbiItem_js_1.getAbiItem)({ abi, name: eventName })
        : undefined;
    const events = !event
        ? abi.filter((x) => x.type === 'event')
        : undefined;
    return (0, getAction_js_1.getAction)(client, getLogs_js_1.getLogs, 'getLogs')({
        address,
        args,
        blockHash,
        event,
        events,
        fromBlock,
        toBlock,
        strict,
    });
}
exports.getContractEvents = getContractEvents;
//# sourceMappingURL=getContractEvents.js.map

/***/ }),

/***/ 15316:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getFeeHistory = void 0;
const toHex_js_1 = __webpack_require__(86340);
const feeHistory_js_1 = __webpack_require__(61678);
async function getFeeHistory(client, { blockCount, blockNumber, blockTag = 'latest', rewardPercentiles, }) {
    const blockNumberHex = blockNumber ? (0, toHex_js_1.numberToHex)(blockNumber) : undefined;
    const feeHistory = await client.request({
        method: 'eth_feeHistory',
        params: [
            (0, toHex_js_1.numberToHex)(blockCount),
            blockNumberHex || blockTag,
            rewardPercentiles,
        ],
    });
    return (0, feeHistory_js_1.formatFeeHistory)(feeHistory);
}
exports.getFeeHistory = getFeeHistory;
//# sourceMappingURL=getFeeHistory.js.map

/***/ }),

/***/ 80337:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getFilterChanges = void 0;
const abi_js_1 = __webpack_require__(5432);
const decodeEventLog_js_1 = __webpack_require__(83327);
const log_js_1 = __webpack_require__(55266);
async function getFilterChanges(_client, { filter, }) {
    const strict = 'strict' in filter && filter.strict;
    const logs = await filter.request({
        method: 'eth_getFilterChanges',
        params: [filter.id],
    });
    return logs
        .map((log) => {
        if (typeof log === 'string')
            return log;
        try {
            const { eventName, args } = 'abi' in filter && filter.abi
                ? (0, decodeEventLog_js_1.decodeEventLog)({
                    abi: filter.abi,
                    data: log.data,
                    topics: log.topics,
                    strict,
                })
                : { eventName: undefined, args: undefined };
            return (0, log_js_1.formatLog)(log, { args, eventName });
        }
        catch (err) {
            let eventName;
            let isUnnamed;
            if (err instanceof abi_js_1.DecodeLogDataMismatch ||
                err instanceof abi_js_1.DecodeLogTopicsMismatch) {
                if ('strict' in filter && filter.strict)
                    return;
                eventName = err.abiItem.name;
                isUnnamed = err.abiItem.inputs?.some((x) => !('name' in x && x.name));
            }
            return (0, log_js_1.formatLog)(log, { args: isUnnamed ? [] : {}, eventName });
        }
    })
        .filter(Boolean);
}
exports.getFilterChanges = getFilterChanges;
//# sourceMappingURL=getFilterChanges.js.map

/***/ }),

/***/ 27045:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getFilterLogs = void 0;
const abi_js_1 = __webpack_require__(5432);
const decodeEventLog_js_1 = __webpack_require__(83327);
const log_js_1 = __webpack_require__(55266);
async function getFilterLogs(_client, { filter, }) {
    const strict = filter.strict ?? false;
    const logs = await filter.request({
        method: 'eth_getFilterLogs',
        params: [filter.id],
    });
    return logs
        .map((log) => {
        try {
            const { eventName, args } = 'abi' in filter && filter.abi
                ? (0, decodeEventLog_js_1.decodeEventLog)({
                    abi: filter.abi,
                    data: log.data,
                    topics: log.topics,
                    strict,
                })
                : { eventName: undefined, args: undefined };
            return (0, log_js_1.formatLog)(log, { args, eventName });
        }
        catch (err) {
            let eventName;
            let isUnnamed;
            if (err instanceof abi_js_1.DecodeLogDataMismatch ||
                err instanceof abi_js_1.DecodeLogTopicsMismatch) {
                if ('strict' in filter && filter.strict)
                    return;
                eventName = err.abiItem.name;
                isUnnamed = err.abiItem.inputs?.some((x) => !('name' in x && x.name));
            }
            return (0, log_js_1.formatLog)(log, { args: isUnnamed ? [] : {}, eventName });
        }
    })
        .filter(Boolean);
}
exports.getFilterLogs = getFilterLogs;
//# sourceMappingURL=getFilterLogs.js.map

/***/ }),

/***/ 53598:
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getGasPrice = void 0;
async function getGasPrice(client) {
    const gasPrice = await client.request({
        method: 'eth_gasPrice',
    });
    return BigInt(gasPrice);
}
exports.getGasPrice = getGasPrice;
//# sourceMappingURL=getGasPrice.js.map

/***/ }),

/***/ 65739:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getLogs = void 0;
const abi_js_1 = __webpack_require__(5432);
const decodeEventLog_js_1 = __webpack_require__(83327);
const encodeEventTopics_js_1 = __webpack_require__(38805);
const toHex_js_1 = __webpack_require__(86340);
const log_js_1 = __webpack_require__(55266);
async function getLogs(client, { address, blockHash, fromBlock, toBlock, event, events: events_, args, strict: strict_, } = {}) {
    const strict = strict_ ?? false;
    const events = events_ ?? (event ? [event] : undefined);
    let topics = [];
    if (events) {
        topics = [
            events.flatMap((event) => (0, encodeEventTopics_js_1.encodeEventTopics)({
                abi: [event],
                eventName: event.name,
                args,
            })),
        ];
        if (event)
            topics = topics[0];
    }
    let logs;
    if (blockHash) {
        logs = await client.request({
            method: 'eth_getLogs',
            params: [{ address, topics, blockHash }],
        });
    }
    else {
        logs = await client.request({
            method: 'eth_getLogs',
            params: [
                {
                    address,
                    topics,
                    fromBlock: typeof fromBlock === 'bigint' ? (0, toHex_js_1.numberToHex)(fromBlock) : fromBlock,
                    toBlock: typeof toBlock === 'bigint' ? (0, toHex_js_1.numberToHex)(toBlock) : toBlock,
                },
            ],
        });
    }
    return logs
        .map((log) => {
        try {
            const { eventName, args } = events
                ? (0, decodeEventLog_js_1.decodeEventLog)({
                    abi: events,
                    data: log.data,
                    topics: log.topics,
                    strict,
                })
                : { eventName: undefined, args: undefined };
            return (0, log_js_1.formatLog)(log, { args, eventName: eventName });
        }
        catch (err) {
            let eventName;
            let isUnnamed;
            if (err instanceof abi_js_1.DecodeLogDataMismatch ||
                err instanceof abi_js_1.DecodeLogTopicsMismatch) {
                if (strict)
                    return;
                eventName = err.abiItem.name;
                isUnnamed = err.abiItem.inputs?.some((x) => !('name' in x && x.name));
            }
            return (0, log_js_1.formatLog)(log, { args: isUnnamed ? [] : {}, eventName });
        }
    })
        .filter(Boolean);
}
exports.getLogs = getLogs;
//# sourceMappingURL=getLogs.js.map

/***/ }),

/***/ 55484:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getProof = void 0;
const toHex_js_1 = __webpack_require__(86340);
const proof_js_1 = __webpack_require__(88250);
async function getProof(client, { address, blockNumber, blockTag: blockTag_, storageKeys, }) {
    const blockTag = blockTag_ ?? 'latest';
    const blockNumberHex = blockNumber !== undefined ? (0, toHex_js_1.numberToHex)(blockNumber) : undefined;
    const proof = await client.request({
        method: 'eth_getProof',
        params: [address, storageKeys, blockNumberHex || blockTag],
    });
    return (0, proof_js_1.formatProof)(proof);
}
exports.getProof = getProof;
//# sourceMappingURL=getProof.js.map

/***/ }),

/***/ 1922:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getStorageAt = void 0;
const toHex_js_1 = __webpack_require__(86340);
async function getStorageAt(client, { address, blockNumber, blockTag = 'latest', slot }) {
    const blockNumberHex = blockNumber !== undefined ? (0, toHex_js_1.numberToHex)(blockNumber) : undefined;
    const data = await client.request({
        method: 'eth_getStorageAt',
        params: [address, slot, blockNumberHex || blockTag],
    });
    return data;
}
exports.getStorageAt = getStorageAt;
//# sourceMappingURL=getStorageAt.js.map

/***/ }),

/***/ 48034:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getTransaction = void 0;
const transaction_js_1 = __webpack_require__(83474);
const toHex_js_1 = __webpack_require__(86340);
const transaction_js_2 = __webpack_require__(11040);
async function getTransaction(client, { blockHash, blockNumber, blockTag: blockTag_, hash, index, }) {
    const blockTag = blockTag_ || 'latest';
    const blockNumberHex = blockNumber !== undefined ? (0, toHex_js_1.numberToHex)(blockNumber) : undefined;
    let transaction = null;
    if (hash) {
        transaction = await client.request({
            method: 'eth_getTransactionByHash',
            params: [hash],
        });
    }
    else if (blockHash) {
        transaction = await client.request({
            method: 'eth_getTransactionByBlockHashAndIndex',
            params: [blockHash, (0, toHex_js_1.numberToHex)(index)],
        });
    }
    else if (blockNumberHex || blockTag) {
        transaction = await client.request({
            method: 'eth_getTransactionByBlockNumberAndIndex',
            params: [blockNumberHex || blockTag, (0, toHex_js_1.numberToHex)(index)],
        });
    }
    if (!transaction)
        throw new transaction_js_1.TransactionNotFoundError({
            blockHash,
            blockNumber,
            blockTag,
            hash,
            index,
        });
    const format = client.chain?.formatters?.transaction?.format || transaction_js_2.formatTransaction;
    return format(transaction);
}
exports.getTransaction = getTransaction;
//# sourceMappingURL=getTransaction.js.map

/***/ }),

/***/ 55298:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getTransactionConfirmations = void 0;
const getAction_js_1 = __webpack_require__(46840);
const getBlockNumber_js_1 = __webpack_require__(95546);
const getTransaction_js_1 = __webpack_require__(48034);
async function getTransactionConfirmations(client, { hash, transactionReceipt }) {
    const [blockNumber, transaction] = await Promise.all([
        (0, getAction_js_1.getAction)(client, getBlockNumber_js_1.getBlockNumber, 'getBlockNumber')({}),
        hash
            ? (0, getAction_js_1.getAction)(client, getTransaction_js_1.getTransaction, 'getBlockNumber')({ hash })
            : undefined,
    ]);
    const transactionBlockNumber = transactionReceipt?.blockNumber || transaction?.blockNumber;
    if (!transactionBlockNumber)
        return 0n;
    return blockNumber - transactionBlockNumber + 1n;
}
exports.getTransactionConfirmations = getTransactionConfirmations;
//# sourceMappingURL=getTransactionConfirmations.js.map

/***/ }),

/***/ 99799:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getTransactionCount = void 0;
const fromHex_js_1 = __webpack_require__(50159);
const toHex_js_1 = __webpack_require__(86340);
async function getTransactionCount(client, { address, blockTag = 'latest', blockNumber }) {
    const count = await client.request({
        method: 'eth_getTransactionCount',
        params: [address, blockNumber ? (0, toHex_js_1.numberToHex)(blockNumber) : blockTag],
    });
    return (0, fromHex_js_1.hexToNumber)(count);
}
exports.getTransactionCount = getTransactionCount;
//# sourceMappingURL=getTransactionCount.js.map

/***/ }),

/***/ 41460:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getTransactionReceipt = void 0;
const transaction_js_1 = __webpack_require__(83474);
const transactionReceipt_js_1 = __webpack_require__(47342);
async function getTransactionReceipt(client, { hash }) {
    const receipt = await client.request({
        method: 'eth_getTransactionReceipt',
        params: [hash],
    });
    if (!receipt)
        throw new transaction_js_1.TransactionReceiptNotFoundError({ hash });
    const format = client.chain?.formatters?.transactionReceipt?.format ||
        transactionReceipt_js_1.formatTransactionReceipt;
    return format(receipt);
}
exports.getTransactionReceipt = getTransactionReceipt;
//# sourceMappingURL=getTransactionReceipt.js.map

/***/ }),

/***/ 45353:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.multicall = void 0;
const abis_js_1 = __webpack_require__(22187);
const abi_js_1 = __webpack_require__(5432);
const base_js_1 = __webpack_require__(24437);
const contract_js_1 = __webpack_require__(30474);
const decodeFunctionResult_js_1 = __webpack_require__(22080);
const encodeFunctionData_js_1 = __webpack_require__(99117);
const getChainContractAddress_js_1 = __webpack_require__(30245);
const getContractError_js_1 = __webpack_require__(92154);
const getAction_js_1 = __webpack_require__(46840);
const readContract_js_1 = __webpack_require__(83000);
async function multicall(client, args) {
    const { allowFailure = true, batchSize: batchSize_, blockNumber, blockTag, contracts, multicallAddress: multicallAddress_, } = args;
    const batchSize = batchSize_ ??
        ((typeof client.batch?.multicall === 'object' &&
            client.batch.multicall.batchSize) ||
            1024);
    let multicallAddress = multicallAddress_;
    if (!multicallAddress) {
        if (!client.chain)
            throw new Error('client chain not configured. multicallAddress is required.');
        multicallAddress = (0, getChainContractAddress_js_1.getChainContractAddress)({
            blockNumber,
            chain: client.chain,
            contract: 'multicall3',
        });
    }
    const chunkedCalls = [[]];
    let currentChunk = 0;
    let currentChunkSize = 0;
    for (let i = 0; i < contracts.length; i++) {
        const { abi, address, args, functionName } = contracts[i];
        try {
            const callData = (0, encodeFunctionData_js_1.encodeFunctionData)({
                abi,
                args,
                functionName,
            });
            currentChunkSize += (callData.length - 2) / 2;
            if (batchSize > 0 &&
                currentChunkSize > batchSize &&
                chunkedCalls[currentChunk].length > 0) {
                currentChunk++;
                currentChunkSize = (callData.length - 2) / 2;
                chunkedCalls[currentChunk] = [];
            }
            chunkedCalls[currentChunk] = [
                ...chunkedCalls[currentChunk],
                {
                    allowFailure: true,
                    callData,
                    target: address,
                },
            ];
        }
        catch (err) {
            const error = (0, getContractError_js_1.getContractError)(err, {
                abi,
                address,
                args,
                docsPath: '/docs/contract/multicall',
                functionName,
            });
            if (!allowFailure)
                throw error;
            chunkedCalls[currentChunk] = [
                ...chunkedCalls[currentChunk],
                {
                    allowFailure: true,
                    callData: '0x',
                    target: address,
                },
            ];
        }
    }
    const aggregate3Results = await Promise.allSettled(chunkedCalls.map((calls) => (0, getAction_js_1.getAction)(client, readContract_js_1.readContract, 'readContract')({
        abi: abis_js_1.multicall3Abi,
        address: multicallAddress,
        args: [calls],
        blockNumber,
        blockTag,
        functionName: 'aggregate3',
    })));
    const results = [];
    for (let i = 0; i < aggregate3Results.length; i++) {
        const result = aggregate3Results[i];
        if (result.status === 'rejected') {
            if (!allowFailure)
                throw result.reason;
            for (let j = 0; j < chunkedCalls[i].length; j++) {
                results.push({
                    status: 'failure',
                    error: result.reason,
                    result: undefined,
                });
            }
            continue;
        }
        const aggregate3Result = result.value;
        for (let j = 0; j < aggregate3Result.length; j++) {
            const { returnData, success } = aggregate3Result[j];
            const { callData } = chunkedCalls[i][j];
            const { abi, address, functionName, args } = contracts[results.length];
            try {
                if (callData === '0x')
                    throw new abi_js_1.AbiDecodingZeroDataError();
                if (!success)
                    throw new contract_js_1.RawContractError({ data: returnData });
                const result = (0, decodeFunctionResult_js_1.decodeFunctionResult)({
                    abi,
                    args,
                    data: returnData,
                    functionName,
                });
                results.push(allowFailure ? { result, status: 'success' } : result);
            }
            catch (err) {
                const error = (0, getContractError_js_1.getContractError)(err, {
                    abi,
                    address,
                    args,
                    docsPath: '/docs/contract/multicall',
                    functionName,
                });
                if (!allowFailure)
                    throw error;
                results.push({ error, result: undefined, status: 'failure' });
            }
        }
    }
    if (results.length !== contracts.length)
        throw new base_js_1.BaseError('multicall results mismatch');
    return results;
}
exports.multicall = multicall;
//# sourceMappingURL=multicall.js.map

/***/ }),

/***/ 83000:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.readContract = void 0;
const decodeFunctionResult_js_1 = __webpack_require__(22080);
const encodeFunctionData_js_1 = __webpack_require__(99117);
const getContractError_js_1 = __webpack_require__(92154);
const getAction_js_1 = __webpack_require__(46840);
const call_js_1 = __webpack_require__(6882);
async function readContract(client, { abi, address, args, functionName, ...callRequest }) {
    const calldata = (0, encodeFunctionData_js_1.encodeFunctionData)({
        abi,
        args,
        functionName,
    });
    try {
        const { data } = await (0, getAction_js_1.getAction)(client, call_js_1.call, 'call')({
            data: calldata,
            to: address,
            ...callRequest,
        });
        return (0, decodeFunctionResult_js_1.decodeFunctionResult)({
            abi,
            args,
            functionName,
            data: data || '0x',
        });
    }
    catch (err) {
        throw (0, getContractError_js_1.getContractError)(err, {
            abi: abi,
            address,
            args,
            docsPath: '/docs/contract/readContract',
            functionName,
        });
    }
}
exports.readContract = readContract;
//# sourceMappingURL=readContract.js.map

/***/ }),

/***/ 17802:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.simulateContract = void 0;
const parseAccount_js_1 = __webpack_require__(79429);
const decodeFunctionResult_js_1 = __webpack_require__(22080);
const encodeFunctionData_js_1 = __webpack_require__(99117);
const getContractError_js_1 = __webpack_require__(92154);
const getAction_js_1 = __webpack_require__(46840);
const call_js_1 = __webpack_require__(6882);
async function simulateContract(client, { abi, address, args, dataSuffix, functionName, ...callRequest }) {
    const account = callRequest.account
        ? (0, parseAccount_js_1.parseAccount)(callRequest.account)
        : undefined;
    const calldata = (0, encodeFunctionData_js_1.encodeFunctionData)({
        abi,
        args,
        functionName,
    });
    try {
        const { data } = await (0, getAction_js_1.getAction)(client, call_js_1.call, 'call')({
            batch: false,
            data: `${calldata}${dataSuffix ? dataSuffix.replace('0x', '') : ''}`,
            to: address,
            ...callRequest,
        });
        const result = (0, decodeFunctionResult_js_1.decodeFunctionResult)({
            abi,
            args,
            functionName,
            data: data || '0x',
        });
        return {
            result,
            request: {
                abi,
                address,
                args,
                dataSuffix,
                functionName,
                ...callRequest,
            },
        };
    }
    catch (err) {
        throw (0, getContractError_js_1.getContractError)(err, {
            abi: abi,
            address,
            args,
            docsPath: '/docs/contract/simulateContract',
            functionName,
            sender: account?.address,
        });
    }
}
exports.simulateContract = simulateContract;
//# sourceMappingURL=simulateContract.js.map

/***/ }),

/***/ 93848:
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.uninstallFilter = void 0;
async function uninstallFilter(_client, { filter }) {
    return filter.request({
        method: 'eth_uninstallFilter',
        params: [filter.id],
    });
}
exports.uninstallFilter = uninstallFilter;
//# sourceMappingURL=uninstallFilter.js.map

/***/ }),

/***/ 11043:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.verifyHash = void 0;
const abis_js_1 = __webpack_require__(22187);
const contracts_js_1 = __webpack_require__(62373);
const contract_js_1 = __webpack_require__(30474);
const isBytesEqual_js_1 = __webpack_require__(25890);
const getAction_js_1 = __webpack_require__(46840);
const index_js_1 = __webpack_require__(2166);
const call_js_1 = __webpack_require__(6882);
async function verifyHash(client, { address, hash, signature, ...callRequest }) {
    const signatureHex = (0, index_js_1.isHex)(signature) ? signature : (0, index_js_1.toHex)(signature);
    try {
        const { data } = await (0, getAction_js_1.getAction)(client, call_js_1.call, 'call')({
            data: (0, index_js_1.encodeDeployData)({
                abi: abis_js_1.universalSignatureValidatorAbi,
                args: [address, hash, signatureHex],
                bytecode: contracts_js_1.universalSignatureValidatorByteCode,
            }),
            ...callRequest,
        });
        return (0, isBytesEqual_js_1.isBytesEqual)(data ?? '0x0', '0x1');
    }
    catch (error) {
        if (error instanceof contract_js_1.CallExecutionError) {
            return false;
        }
        throw error;
    }
}
exports.verifyHash = verifyHash;
//# sourceMappingURL=verifyHash.js.map

/***/ }),

/***/ 69944:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.verifyMessage = void 0;
const index_js_1 = __webpack_require__(2166);
const verifyHash_js_1 = __webpack_require__(11043);
async function verifyMessage(client, { address, message, signature, ...callRequest }) {
    const hash = (0, index_js_1.hashMessage)(message);
    return (0, verifyHash_js_1.verifyHash)(client, {
        address,
        hash,
        signature,
        ...callRequest,
    });
}
exports.verifyMessage = verifyMessage;
//# sourceMappingURL=verifyMessage.js.map

/***/ }),

/***/ 82135:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.verifyTypedData = void 0;
const hashTypedData_js_1 = __webpack_require__(32911);
const verifyHash_js_1 = __webpack_require__(11043);
async function verifyTypedData(client, { address, signature, message, primaryType, types, domain, ...callRequest }) {
    const hash = (0, hashTypedData_js_1.hashTypedData)({ message, primaryType, types, domain });
    return (0, verifyHash_js_1.verifyHash)(client, {
        address,
        hash,
        signature,
        ...callRequest,
    });
}
exports.verifyTypedData = verifyTypedData;
//# sourceMappingURL=verifyTypedData.js.map

/***/ }),

/***/ 67652:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.waitForTransactionReceipt = void 0;
const block_js_1 = __webpack_require__(57343);
const transaction_js_1 = __webpack_require__(83474);
const getAction_js_1 = __webpack_require__(46840);
const observe_js_1 = __webpack_require__(14714);
const withRetry_js_1 = __webpack_require__(36962);
const stringify_js_1 = __webpack_require__(68395);
const getBlock_js_1 = __webpack_require__(10543);
const getTransaction_js_1 = __webpack_require__(48034);
const getTransactionReceipt_js_1 = __webpack_require__(41460);
const watchBlockNumber_js_1 = __webpack_require__(34779);
async function waitForTransactionReceipt(client, { confirmations = 1, hash, onReplaced, pollingInterval = client.pollingInterval, timeout, }) {
    const observerId = (0, stringify_js_1.stringify)(['waitForTransactionReceipt', client.uid, hash]);
    let transaction;
    let replacedTransaction;
    let receipt;
    let retrying = false;
    return new Promise((resolve, reject) => {
        if (timeout)
            setTimeout(() => reject(new transaction_js_1.WaitForTransactionReceiptTimeoutError({ hash })), timeout);
        const _unobserve = (0, observe_js_1.observe)(observerId, { onReplaced, resolve, reject }, (emit) => {
            const _unwatch = (0, getAction_js_1.getAction)(client, watchBlockNumber_js_1.watchBlockNumber, 'watchBlockNumber')({
                emitMissed: true,
                emitOnBegin: true,
                poll: true,
                pollingInterval,
                async onBlockNumber(blockNumber_) {
                    if (retrying)
                        return;
                    let blockNumber = blockNumber_;
                    const done = (fn) => {
                        _unwatch();
                        fn();
                        _unobserve();
                    };
                    try {
                        if (receipt) {
                            if (confirmations > 1 &&
                                (!receipt.blockNumber ||
                                    blockNumber - receipt.blockNumber + 1n < confirmations))
                                return;
                            done(() => emit.resolve(receipt));
                            return;
                        }
                        if (!transaction) {
                            retrying = true;
                            await (0, withRetry_js_1.withRetry)(async () => {
                                transaction = (await (0, getAction_js_1.getAction)(client, getTransaction_js_1.getTransaction, 'getTransaction')({ hash }));
                                if (transaction.blockNumber)
                                    blockNumber = transaction.blockNumber;
                            }, {
                                delay: ({ count }) => ~~(1 << count) * 200,
                                retryCount: 6,
                            });
                            retrying = false;
                        }
                        receipt = await (0, getAction_js_1.getAction)(client, getTransactionReceipt_js_1.getTransactionReceipt, 'getTransactionReceipt')({ hash });
                        if (confirmations > 1 &&
                            (!receipt.blockNumber ||
                                blockNumber - receipt.blockNumber + 1n < confirmations))
                            return;
                        done(() => emit.resolve(receipt));
                    }
                    catch (err) {
                        if (transaction &&
                            (err instanceof transaction_js_1.TransactionNotFoundError ||
                                err instanceof transaction_js_1.TransactionReceiptNotFoundError)) {
                            try {
                                replacedTransaction = transaction;
                                retrying = true;
                                const block = await (0, withRetry_js_1.withRetry)(() => (0, getAction_js_1.getAction)(client, getBlock_js_1.getBlock, 'getBlock')({
                                    blockNumber,
                                    includeTransactions: true,
                                }), {
                                    delay: ({ count }) => ~~(1 << count) * 200,
                                    retryCount: 6,
                                    shouldRetry: ({ error }) => error instanceof block_js_1.BlockNotFoundError,
                                });
                                retrying = false;
                                const replacementTransaction = block.transactions.find(({ from, nonce }) => from === replacedTransaction.from &&
                                    nonce === replacedTransaction.nonce);
                                if (!replacementTransaction)
                                    return;
                                receipt = await (0, getAction_js_1.getAction)(client, getTransactionReceipt_js_1.getTransactionReceipt, 'getTransactionReceipt')({
                                    hash: replacementTransaction.hash,
                                });
                                if (confirmations > 1 &&
                                    (!receipt.blockNumber ||
                                        blockNumber - receipt.blockNumber + 1n < confirmations))
                                    return;
                                let reason = 'replaced';
                                if (replacementTransaction.to === replacedTransaction.to &&
                                    replacementTransaction.value === replacedTransaction.value) {
                                    reason = 'repriced';
                                }
                                else if (replacementTransaction.from === replacementTransaction.to &&
                                    replacementTransaction.value === 0n) {
                                    reason = 'cancelled';
                                }
                                done(() => {
                                    emit.onReplaced?.({
                                        reason,
                                        replacedTransaction: replacedTransaction,
                                        transaction: replacementTransaction,
                                        transactionReceipt: receipt,
                                    });
                                    emit.resolve(receipt);
                                });
                            }
                            catch (err_) {
                                done(() => emit.reject(err_));
                            }
                        }
                        else {
                            done(() => emit.reject(err));
                        }
                    }
                },
            });
        });
    });
}
exports.waitForTransactionReceipt = waitForTransactionReceipt;
//# sourceMappingURL=waitForTransactionReceipt.js.map

/***/ }),

/***/ 34779:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.watchBlockNumber = void 0;
const fromHex_js_1 = __webpack_require__(50159);
const getAction_js_1 = __webpack_require__(46840);
const observe_js_1 = __webpack_require__(14714);
const poll_js_1 = __webpack_require__(63097);
const stringify_js_1 = __webpack_require__(68395);
const getBlockNumber_js_1 = __webpack_require__(95546);
function watchBlockNumber(client, { emitOnBegin = false, emitMissed = false, onBlockNumber, onError, poll: poll_, pollingInterval = client.pollingInterval, }) {
    const enablePolling = typeof poll_ !== 'undefined' ? poll_ : client.transport.type !== 'webSocket';
    let prevBlockNumber;
    const pollBlockNumber = () => {
        const observerId = (0, stringify_js_1.stringify)([
            'watchBlockNumber',
            client.uid,
            emitOnBegin,
            emitMissed,
            pollingInterval,
        ]);
        return (0, observe_js_1.observe)(observerId, { onBlockNumber, onError }, (emit) => (0, poll_js_1.poll)(async () => {
            try {
                const blockNumber = await (0, getAction_js_1.getAction)(client, getBlockNumber_js_1.getBlockNumber, 'getBlockNumber')({ cacheTime: 0 });
                if (prevBlockNumber) {
                    if (blockNumber === prevBlockNumber)
                        return;
                    if (blockNumber - prevBlockNumber > 1 && emitMissed) {
                        for (let i = prevBlockNumber + 1n; i < blockNumber; i++) {
                            emit.onBlockNumber(i, prevBlockNumber);
                            prevBlockNumber = i;
                        }
                    }
                }
                if (!prevBlockNumber || blockNumber > prevBlockNumber) {
                    emit.onBlockNumber(blockNumber, prevBlockNumber);
                    prevBlockNumber = blockNumber;
                }
            }
            catch (err) {
                emit.onError?.(err);
            }
        }, {
            emitOnBegin,
            interval: pollingInterval,
        }));
    };
    const subscribeBlockNumber = () => {
        let active = true;
        let unsubscribe = () => (active = false);
        (async () => {
            try {
                const { unsubscribe: unsubscribe_ } = await client.transport.subscribe({
                    params: ['newHeads'],
                    onData(data) {
                        if (!active)
                            return;
                        const blockNumber = (0, fromHex_js_1.hexToBigInt)(data.result?.number);
                        onBlockNumber(blockNumber, prevBlockNumber);
                        prevBlockNumber = blockNumber;
                    },
                    onError(error) {
                        onError?.(error);
                    },
                });
                unsubscribe = unsubscribe_;
                if (!active)
                    unsubscribe();
            }
            catch (err) {
                onError?.(err);
            }
        })();
        return unsubscribe;
    };
    return enablePolling ? pollBlockNumber() : subscribeBlockNumber();
}
exports.watchBlockNumber = watchBlockNumber;
//# sourceMappingURL=watchBlockNumber.js.map

/***/ }),

/***/ 91121:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.watchBlocks = void 0;
const block_js_1 = __webpack_require__(12885);
const getAction_js_1 = __webpack_require__(46840);
const observe_js_1 = __webpack_require__(14714);
const poll_js_1 = __webpack_require__(63097);
const stringify_js_1 = __webpack_require__(68395);
const getBlock_js_1 = __webpack_require__(10543);
function watchBlocks(client, { blockTag = 'latest', emitMissed = false, emitOnBegin = false, onBlock, onError, includeTransactions: includeTransactions_, poll: poll_, pollingInterval = client.pollingInterval, }) {
    const enablePolling = typeof poll_ !== 'undefined' ? poll_ : client.transport.type !== 'webSocket';
    const includeTransactions = includeTransactions_ ?? false;
    let prevBlock;
    const pollBlocks = () => {
        const observerId = (0, stringify_js_1.stringify)([
            'watchBlocks',
            client.uid,
            emitMissed,
            emitOnBegin,
            includeTransactions,
            pollingInterval,
        ]);
        return (0, observe_js_1.observe)(observerId, { onBlock, onError }, (emit) => (0, poll_js_1.poll)(async () => {
            try {
                const block = await (0, getAction_js_1.getAction)(client, getBlock_js_1.getBlock, 'getBlock')({
                    blockTag,
                    includeTransactions,
                });
                if (block.number && prevBlock?.number) {
                    if (block.number === prevBlock.number)
                        return;
                    if (block.number - prevBlock.number > 1 && emitMissed) {
                        for (let i = prevBlock?.number + 1n; i < block.number; i++) {
                            const block = (await (0, getAction_js_1.getAction)(client, getBlock_js_1.getBlock, 'getBlock')({
                                blockNumber: i,
                                includeTransactions,
                            }));
                            emit.onBlock(block, prevBlock);
                            prevBlock = block;
                        }
                    }
                }
                if (!prevBlock?.number ||
                    (blockTag === 'pending' && !block?.number) ||
                    (block.number && block.number > prevBlock.number)) {
                    emit.onBlock(block, prevBlock);
                    prevBlock = block;
                }
            }
            catch (err) {
                emit.onError?.(err);
            }
        }, {
            emitOnBegin,
            interval: pollingInterval,
        }));
    };
    const subscribeBlocks = () => {
        let active = true;
        let unsubscribe = () => (active = false);
        (async () => {
            try {
                const { unsubscribe: unsubscribe_ } = await client.transport.subscribe({
                    params: ['newHeads'],
                    onData(data) {
                        if (!active)
                            return;
                        const format = client.chain?.formatters?.block?.format || block_js_1.formatBlock;
                        const block = format(data.result);
                        onBlock(block, prevBlock);
                        prevBlock = block;
                    },
                    onError(error) {
                        onError?.(error);
                    },
                });
                unsubscribe = unsubscribe_;
                if (!active)
                    unsubscribe();
            }
            catch (err) {
                onError?.(err);
            }
        })();
        return unsubscribe;
    };
    return enablePolling ? pollBlocks() : subscribeBlocks();
}
exports.watchBlocks = watchBlocks;
//# sourceMappingURL=watchBlocks.js.map

/***/ }),

/***/ 94169:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.watchContractEvent = void 0;
const observe_js_1 = __webpack_require__(14714);
const poll_js_1 = __webpack_require__(63097);
const stringify_js_1 = __webpack_require__(68395);
const abi_js_1 = __webpack_require__(5432);
const rpc_js_1 = __webpack_require__(36549);
const decodeEventLog_js_1 = __webpack_require__(83327);
const encodeEventTopics_js_1 = __webpack_require__(38805);
const log_js_1 = __webpack_require__(55266);
const getAction_js_1 = __webpack_require__(46840);
const createContractEventFilter_js_1 = __webpack_require__(36568);
const getBlockNumber_js_1 = __webpack_require__(95546);
const getContractEvents_js_1 = __webpack_require__(7599);
const getFilterChanges_js_1 = __webpack_require__(80337);
const uninstallFilter_js_1 = __webpack_require__(93848);
function watchContractEvent(client, { abi, address, args, batch = true, eventName, onError, onLogs, poll: poll_, pollingInterval = client.pollingInterval, strict: strict_, }) {
    const enablePolling = typeof poll_ !== 'undefined' ? poll_ : client.transport.type !== 'webSocket';
    const pollContractEvent = () => {
        const observerId = (0, stringify_js_1.stringify)([
            'watchContractEvent',
            address,
            args,
            batch,
            client.uid,
            eventName,
            pollingInterval,
        ]);
        const strict = strict_ ?? false;
        return (0, observe_js_1.observe)(observerId, { onLogs, onError }, (emit) => {
            let previousBlockNumber;
            let filter;
            let initialized = false;
            const unwatch = (0, poll_js_1.poll)(async () => {
                if (!initialized) {
                    try {
                        filter = (await (0, getAction_js_1.getAction)(client, createContractEventFilter_js_1.createContractEventFilter, 'createContractEventFilter')({
                            abi,
                            address,
                            args,
                            eventName,
                            strict,
                        }));
                    }
                    catch { }
                    initialized = true;
                    return;
                }
                try {
                    let logs;
                    if (filter) {
                        logs = await (0, getAction_js_1.getAction)(client, getFilterChanges_js_1.getFilterChanges, 'getFilterChanges')({ filter });
                    }
                    else {
                        const blockNumber = await (0, getAction_js_1.getAction)(client, getBlockNumber_js_1.getBlockNumber, 'getBlockNumber')({});
                        if (previousBlockNumber && previousBlockNumber !== blockNumber) {
                            logs = await (0, getAction_js_1.getAction)(client, getContractEvents_js_1.getContractEvents, 'getContractEvents')({
                                abi,
                                address,
                                args,
                                eventName,
                                fromBlock: previousBlockNumber + 1n,
                                toBlock: blockNumber,
                                strict,
                            });
                        }
                        else {
                            logs = [];
                        }
                        previousBlockNumber = blockNumber;
                    }
                    if (logs.length === 0)
                        return;
                    if (batch)
                        emit.onLogs(logs);
                    else
                        for (const log of logs)
                            emit.onLogs([log]);
                }
                catch (err) {
                    if (filter && err instanceof rpc_js_1.InvalidInputRpcError)
                        initialized = false;
                    emit.onError?.(err);
                }
            }, {
                emitOnBegin: true,
                interval: pollingInterval,
            });
            return async () => {
                if (filter)
                    await (0, getAction_js_1.getAction)(client, uninstallFilter_js_1.uninstallFilter, 'uninstallFilter')({ filter });
                unwatch();
            };
        });
    };
    const subscribeContractEvent = () => {
        let active = true;
        let unsubscribe = () => (active = false);
        (async () => {
            try {
                const topics = eventName
                    ? (0, encodeEventTopics_js_1.encodeEventTopics)({
                        abi: abi,
                        eventName: eventName,
                        args,
                    })
                    : [];
                const { unsubscribe: unsubscribe_ } = await client.transport.subscribe({
                    params: ['logs', { address, topics }],
                    onData(data) {
                        if (!active)
                            return;
                        const log = data.result;
                        try {
                            const { eventName, args } = (0, decodeEventLog_js_1.decodeEventLog)({
                                abi: abi,
                                data: log.data,
                                topics: log.topics,
                                strict: strict_,
                            });
                            const formatted = (0, log_js_1.formatLog)(log, {
                                args,
                                eventName: eventName,
                            });
                            onLogs([formatted]);
                        }
                        catch (err) {
                            let eventName;
                            let isUnnamed;
                            if (err instanceof abi_js_1.DecodeLogDataMismatch ||
                                err instanceof abi_js_1.DecodeLogTopicsMismatch) {
                                if (strict_)
                                    return;
                                eventName = err.abiItem.name;
                                isUnnamed = err.abiItem.inputs?.some((x) => !('name' in x && x.name));
                            }
                            const formatted = (0, log_js_1.formatLog)(log, {
                                args: isUnnamed ? [] : {},
                                eventName,
                            });
                            onLogs([formatted]);
                        }
                    },
                    onError(error) {
                        onError?.(error);
                    },
                });
                unsubscribe = unsubscribe_;
                if (!active)
                    unsubscribe();
            }
            catch (err) {
                onError?.(err);
            }
        })();
        return unsubscribe;
    };
    return enablePolling ? pollContractEvent() : subscribeContractEvent();
}
exports.watchContractEvent = watchContractEvent;
//# sourceMappingURL=watchContractEvent.js.map

/***/ }),

/***/ 44055:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.watchEvent = void 0;
const observe_js_1 = __webpack_require__(14714);
const poll_js_1 = __webpack_require__(63097);
const stringify_js_1 = __webpack_require__(68395);
const abi_js_1 = __webpack_require__(5432);
const rpc_js_1 = __webpack_require__(36549);
const getAction_js_1 = __webpack_require__(46840);
const index_js_1 = __webpack_require__(2166);
const createEventFilter_js_1 = __webpack_require__(80786);
const getBlockNumber_js_1 = __webpack_require__(95546);
const getFilterChanges_js_1 = __webpack_require__(80337);
const getLogs_js_1 = __webpack_require__(65739);
const uninstallFilter_js_1 = __webpack_require__(93848);
function watchEvent(client, { address, args, batch = true, event, events, onError, onLogs, poll: poll_, pollingInterval = client.pollingInterval, strict: strict_, }) {
    const enablePolling = typeof poll_ !== 'undefined' ? poll_ : client.transport.type !== 'webSocket';
    const strict = strict_ ?? false;
    const pollEvent = () => {
        const observerId = (0, stringify_js_1.stringify)([
            'watchEvent',
            address,
            args,
            batch,
            client.uid,
            event,
            pollingInterval,
        ]);
        return (0, observe_js_1.observe)(observerId, { onLogs, onError }, (emit) => {
            let previousBlockNumber;
            let filter;
            let initialized = false;
            const unwatch = (0, poll_js_1.poll)(async () => {
                if (!initialized) {
                    try {
                        filter = (await (0, getAction_js_1.getAction)(client, createEventFilter_js_1.createEventFilter, 'createEventFilter')({
                            address,
                            args,
                            event: event,
                            events,
                            strict,
                        }));
                    }
                    catch { }
                    initialized = true;
                    return;
                }
                try {
                    let logs;
                    if (filter) {
                        logs = await (0, getAction_js_1.getAction)(client, getFilterChanges_js_1.getFilterChanges, 'getFilterChanges')({ filter });
                    }
                    else {
                        const blockNumber = await (0, getAction_js_1.getAction)(client, getBlockNumber_js_1.getBlockNumber, 'getBlockNumber')({});
                        if (previousBlockNumber && previousBlockNumber !== blockNumber) {
                            logs = await (0, getAction_js_1.getAction)(client, getLogs_js_1.getLogs, 'getLogs')({
                                address,
                                args,
                                event: event,
                                events,
                                fromBlock: previousBlockNumber + 1n,
                                toBlock: blockNumber,
                            });
                        }
                        else {
                            logs = [];
                        }
                        previousBlockNumber = blockNumber;
                    }
                    if (logs.length === 0)
                        return;
                    if (batch)
                        emit.onLogs(logs);
                    else
                        for (const log of logs)
                            emit.onLogs([log]);
                }
                catch (err) {
                    if (filter && err instanceof rpc_js_1.InvalidInputRpcError)
                        initialized = false;
                    emit.onError?.(err);
                }
            }, {
                emitOnBegin: true,
                interval: pollingInterval,
            });
            return async () => {
                if (filter)
                    await (0, getAction_js_1.getAction)(client, uninstallFilter_js_1.uninstallFilter, 'uninstallFilter')({ filter });
                unwatch();
            };
        });
    };
    const subscribeEvent = () => {
        let active = true;
        let unsubscribe = () => (active = false);
        (async () => {
            try {
                const events_ = events ?? (event ? [event] : undefined);
                let topics = [];
                if (events_) {
                    topics = [
                        events_.flatMap((event) => (0, index_js_1.encodeEventTopics)({
                            abi: [event],
                            eventName: event.name,
                            args,
                        })),
                    ];
                    if (event)
                        topics = topics[0];
                }
                const { unsubscribe: unsubscribe_ } = await client.transport.subscribe({
                    params: ['logs', { address, topics }],
                    onData(data) {
                        if (!active)
                            return;
                        const log = data.result;
                        try {
                            const { eventName, args } = (0, index_js_1.decodeEventLog)({
                                abi: events_,
                                data: log.data,
                                topics: log.topics,
                                strict,
                            });
                            const formatted = (0, index_js_1.formatLog)(log, {
                                args,
                                eventName: eventName,
                            });
                            onLogs([formatted]);
                        }
                        catch (err) {
                            let eventName;
                            let isUnnamed;
                            if (err instanceof abi_js_1.DecodeLogDataMismatch ||
                                err instanceof abi_js_1.DecodeLogTopicsMismatch) {
                                if (strict_)
                                    return;
                                eventName = err.abiItem.name;
                                isUnnamed = err.abiItem.inputs?.some((x) => !('name' in x && x.name));
                            }
                            const formatted = (0, index_js_1.formatLog)(log, {
                                args: isUnnamed ? [] : {},
                                eventName,
                            });
                            onLogs([formatted]);
                        }
                    },
                    onError(error) {
                        onError?.(error);
                    },
                });
                unsubscribe = unsubscribe_;
                if (!active)
                    unsubscribe();
            }
            catch (err) {
                onError?.(err);
            }
        })();
        return unsubscribe;
    };
    return enablePolling ? pollEvent() : subscribeEvent();
}
exports.watchEvent = watchEvent;
//# sourceMappingURL=watchEvent.js.map

/***/ }),

/***/ 13541:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.watchPendingTransactions = void 0;
const getAction_js_1 = __webpack_require__(46840);
const observe_js_1 = __webpack_require__(14714);
const poll_js_1 = __webpack_require__(63097);
const stringify_js_1 = __webpack_require__(68395);
const createPendingTransactionFilter_js_1 = __webpack_require__(34977);
const getFilterChanges_js_1 = __webpack_require__(80337);
const uninstallFilter_js_1 = __webpack_require__(93848);
function watchPendingTransactions(client, { batch = true, onError, onTransactions, poll: poll_, pollingInterval = client.pollingInterval, }) {
    const enablePolling = typeof poll_ !== 'undefined' ? poll_ : client.transport.type !== 'webSocket';
    const pollPendingTransactions = () => {
        const observerId = (0, stringify_js_1.stringify)([
            'watchPendingTransactions',
            client.uid,
            batch,
            pollingInterval,
        ]);
        return (0, observe_js_1.observe)(observerId, { onTransactions, onError }, (emit) => {
            let filter;
            const unwatch = (0, poll_js_1.poll)(async () => {
                try {
                    if (!filter) {
                        try {
                            filter = await (0, getAction_js_1.getAction)(client, createPendingTransactionFilter_js_1.createPendingTransactionFilter, 'createPendingTransactionFilter')({});
                            return;
                        }
                        catch (err) {
                            unwatch();
                            throw err;
                        }
                    }
                    const hashes = await (0, getAction_js_1.getAction)(client, getFilterChanges_js_1.getFilterChanges, 'getFilterChanges')({ filter });
                    if (hashes.length === 0)
                        return;
                    if (batch)
                        emit.onTransactions(hashes);
                    else
                        for (const hash of hashes)
                            emit.onTransactions([hash]);
                }
                catch (err) {
                    emit.onError?.(err);
                }
            }, {
                emitOnBegin: true,
                interval: pollingInterval,
            });
            return async () => {
                if (filter)
                    await (0, getAction_js_1.getAction)(client, uninstallFilter_js_1.uninstallFilter, 'uninstallFilter')({ filter });
                unwatch();
            };
        });
    };
    const subscribePendingTransactions = () => {
        let active = true;
        let unsubscribe = () => (active = false);
        (async () => {
            try {
                const { unsubscribe: unsubscribe_ } = await client.transport.subscribe({
                    params: ['newPendingTransactions'],
                    onData(data) {
                        if (!active)
                            return;
                        const transaction = data.result;
                        onTransactions([transaction]);
                    },
                    onError(error) {
                        onError?.(error);
                    },
                });
                unsubscribe = unsubscribe_;
                if (!active)
                    unsubscribe();
            }
            catch (err) {
                onError?.(err);
            }
        })();
        return unsubscribe;
    };
    return enablePolling
        ? pollPendingTransactions()
        : subscribePendingTransactions();
}
exports.watchPendingTransactions = watchPendingTransactions;
//# sourceMappingURL=watchPendingTransactions.js.map

/***/ }),

/***/ 77942:
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.dropTransaction = void 0;
async function dropTransaction(client, { hash }) {
    await client.request({
        method: `${client.mode}_dropTransaction`,
        params: [hash],
    });
}
exports.dropTransaction = dropTransaction;
//# sourceMappingURL=dropTransaction.js.map

/***/ }),

/***/ 28370:
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.dumpState = void 0;
async function dumpState(client) {
    return client.request({
        method: `${client.mode}_dumpState`,
    });
}
exports.dumpState = dumpState;
//# sourceMappingURL=dumpState.js.map

/***/ }),

/***/ 59953:
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getAutomine = void 0;
async function getAutomine(client) {
    if (client.mode === 'ganache')
        return await client.request({
            method: 'eth_mining',
        });
    return await client.request({
        method: `${client.mode}_getAutomine`,
    });
}
exports.getAutomine = getAutomine;
//# sourceMappingURL=getAutomine.js.map

/***/ }),

/***/ 45594:
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getTxpoolContent = void 0;
async function getTxpoolContent(client) {
    return await client.request({
        method: 'txpool_content',
    });
}
exports.getTxpoolContent = getTxpoolContent;
//# sourceMappingURL=getTxpoolContent.js.map

/***/ }),

/***/ 70553:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getTxpoolStatus = void 0;
const fromHex_js_1 = __webpack_require__(50159);
async function getTxpoolStatus(client) {
    const { pending, queued } = await client.request({
        method: 'txpool_status',
    });
    return {
        pending: (0, fromHex_js_1.hexToNumber)(pending),
        queued: (0, fromHex_js_1.hexToNumber)(queued),
    };
}
exports.getTxpoolStatus = getTxpoolStatus;
//# sourceMappingURL=getTxpoolStatus.js.map

/***/ }),

/***/ 58253:
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.impersonateAccount = void 0;
async function impersonateAccount(client, { address }) {
    await client.request({
        method: `${client.mode}_impersonateAccount`,
        params: [address],
    });
}
exports.impersonateAccount = impersonateAccount;
//# sourceMappingURL=impersonateAccount.js.map

/***/ }),

/***/ 42716:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.increaseTime = void 0;
const toHex_js_1 = __webpack_require__(86340);
async function increaseTime(client, { seconds }) {
    return await client.request({
        method: 'evm_increaseTime',
        params: [(0, toHex_js_1.numberToHex)(seconds)],
    });
}
exports.increaseTime = increaseTime;
//# sourceMappingURL=increaseTime.js.map

/***/ }),

/***/ 63979:
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.inspectTxpool = void 0;
async function inspectTxpool(client) {
    return await client.request({
        method: 'txpool_inspect',
    });
}
exports.inspectTxpool = inspectTxpool;
//# sourceMappingURL=inspectTxpool.js.map

/***/ }),

/***/ 3856:
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.loadState = void 0;
async function loadState(client, { state }) {
    await client.request({
        method: `${client.mode}_loadState`,
        params: [state],
    });
}
exports.loadState = loadState;
//# sourceMappingURL=loadState.js.map

/***/ }),

/***/ 94310:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.mine = void 0;
const toHex_js_1 = __webpack_require__(86340);
async function mine(client, { blocks, interval }) {
    if (client.mode === 'ganache')
        await client.request({
            method: 'evm_mine',
            params: [{ blocks: (0, toHex_js_1.numberToHex)(blocks) }],
        });
    else
        await client.request({
            method: `${client.mode}_mine`,
            params: [(0, toHex_js_1.numberToHex)(blocks), (0, toHex_js_1.numberToHex)(interval || 0)],
        });
}
exports.mine = mine;
//# sourceMappingURL=mine.js.map

/***/ }),

/***/ 97687:
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.removeBlockTimestampInterval = void 0;
async function removeBlockTimestampInterval(client) {
    await client.request({
        method: `${client.mode}_removeBlockTimestampInterval`,
    });
}
exports.removeBlockTimestampInterval = removeBlockTimestampInterval;
//# sourceMappingURL=removeBlockTimestampInterval.js.map

/***/ }),

/***/ 45978:
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.reset = void 0;
async function reset(client, { blockNumber, jsonRpcUrl } = {}) {
    await client.request({
        method: `${client.mode}_reset`,
        params: [{ forking: { blockNumber: Number(blockNumber), jsonRpcUrl } }],
    });
}
exports.reset = reset;
//# sourceMappingURL=reset.js.map

/***/ }),

/***/ 48767:
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.revert = void 0;
async function revert(client, { id }) {
    await client.request({
        method: 'evm_revert',
        params: [id],
    });
}
exports.revert = revert;
//# sourceMappingURL=revert.js.map

/***/ }),

/***/ 44558:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.sendUnsignedTransaction = void 0;
const extract_js_1 = __webpack_require__(65457);
const transactionRequest_js_1 = __webpack_require__(23459);
async function sendUnsignedTransaction(client, args) {
    const { accessList, data, from, gas, gasPrice, maxFeePerGas, maxPriorityFeePerGas, nonce, to, value, ...rest } = args;
    const chainFormat = client.chain?.formatters?.transactionRequest?.format;
    const format = chainFormat || transactionRequest_js_1.formatTransactionRequest;
    const request = format({
        ...(0, extract_js_1.extract)(rest, { format: chainFormat }),
        accessList,
        data,
        from,
        gas,
        gasPrice,
        maxFeePerGas,
        maxPriorityFeePerGas,
        nonce,
        to,
        value,
    });
    const hash = await client.request({
        method: 'eth_sendUnsignedTransaction',
        params: [request],
    });
    return hash;
}
exports.sendUnsignedTransaction = sendUnsignedTransaction;
//# sourceMappingURL=sendUnsignedTransaction.js.map

/***/ }),

/***/ 74445:
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.setAutomine = void 0;
async function setAutomine(client, enabled) {
    if (client.mode === 'ganache') {
        if (enabled)
            await client.request({ method: 'miner_start' });
        else
            await client.request({ method: 'miner_stop' });
    }
    else
        await client.request({
            method: 'evm_setAutomine',
            params: [enabled],
        });
}
exports.setAutomine = setAutomine;
//# sourceMappingURL=setAutomine.js.map

/***/ }),

/***/ 53653:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.setBalance = void 0;
const toHex_js_1 = __webpack_require__(86340);
async function setBalance(client, { address, value }) {
    if (client.mode === 'ganache')
        await client.request({
            method: 'evm_setAccountBalance',
            params: [address, (0, toHex_js_1.numberToHex)(value)],
        });
    else
        await client.request({
            method: `${client.mode}_setBalance`,
            params: [address, (0, toHex_js_1.numberToHex)(value)],
        });
}
exports.setBalance = setBalance;
//# sourceMappingURL=setBalance.js.map

/***/ }),

/***/ 53292:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.setBlockGasLimit = void 0;
const toHex_js_1 = __webpack_require__(86340);
async function setBlockGasLimit(client, { gasLimit }) {
    await client.request({
        method: 'evm_setBlockGasLimit',
        params: [(0, toHex_js_1.numberToHex)(gasLimit)],
    });
}
exports.setBlockGasLimit = setBlockGasLimit;
//# sourceMappingURL=setBlockGasLimit.js.map

/***/ }),

/***/ 22171:
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.setBlockTimestampInterval = void 0;
async function setBlockTimestampInterval(client, { interval }) {
    const interval_ = (() => {
        if (client.mode === 'hardhat')
            return interval * 1000;
        return interval;
    })();
    await client.request({
        method: `${client.mode}_setBlockTimestampInterval`,
        params: [interval_],
    });
}
exports.setBlockTimestampInterval = setBlockTimestampInterval;
//# sourceMappingURL=setBlockTimestampInterval.js.map

/***/ }),

/***/ 8496:
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.setCode = void 0;
async function setCode(client, { address, bytecode }) {
    await client.request({
        method: `${client.mode}_setCode`,
        params: [address, bytecode],
    });
}
exports.setCode = setCode;
//# sourceMappingURL=setCode.js.map

/***/ }),

/***/ 66789:
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.setCoinbase = void 0;
async function setCoinbase(client, { address }) {
    await client.request({
        method: `${client.mode}_setCoinbase`,
        params: [address],
    });
}
exports.setCoinbase = setCoinbase;
//# sourceMappingURL=setCoinbase.js.map

/***/ }),

/***/ 18384:
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.setIntervalMining = void 0;
async function setIntervalMining(client, { interval }) {
    const interval_ = (() => {
        if (client.mode === 'hardhat')
            return interval * 1000;
        return interval;
    })();
    await client.request({
        method: 'evm_setIntervalMining',
        params: [interval_],
    });
}
exports.setIntervalMining = setIntervalMining;
//# sourceMappingURL=setIntervalMining.js.map

/***/ }),

/***/ 30011:
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.setLoggingEnabled = void 0;
async function setLoggingEnabled(client, enabled) {
    await client.request({
        method: `${client.mode}_setLoggingEnabled`,
        params: [enabled],
    });
}
exports.setLoggingEnabled = setLoggingEnabled;
//# sourceMappingURL=setLoggingEnabled.js.map

/***/ }),

/***/ 34907:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.setMinGasPrice = void 0;
const toHex_js_1 = __webpack_require__(86340);
async function setMinGasPrice(client, { gasPrice }) {
    await client.request({
        method: `${client.mode}_setMinGasPrice`,
        params: [(0, toHex_js_1.numberToHex)(gasPrice)],
    });
}
exports.setMinGasPrice = setMinGasPrice;
//# sourceMappingURL=setMinGasPrice.js.map

/***/ }),

/***/ 47316:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.setNextBlockBaseFeePerGas = void 0;
const toHex_js_1 = __webpack_require__(86340);
async function setNextBlockBaseFeePerGas(client, { baseFeePerGas }) {
    await client.request({
        method: `${client.mode}_setNextBlockBaseFeePerGas`,
        params: [(0, toHex_js_1.numberToHex)(baseFeePerGas)],
    });
}
exports.setNextBlockBaseFeePerGas = setNextBlockBaseFeePerGas;
//# sourceMappingURL=setNextBlockBaseFeePerGas.js.map

/***/ }),

/***/ 22499:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.setNextBlockTimestamp = void 0;
const toHex_js_1 = __webpack_require__(86340);
async function setNextBlockTimestamp(client, { timestamp }) {
    await client.request({
        method: 'evm_setNextBlockTimestamp',
        params: [(0, toHex_js_1.numberToHex)(timestamp)],
    });
}
exports.setNextBlockTimestamp = setNextBlockTimestamp;
//# sourceMappingURL=setNextBlockTimestamp.js.map

/***/ }),

/***/ 30578:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.setNonce = void 0;
const toHex_js_1 = __webpack_require__(86340);
async function setNonce(client, { address, nonce }) {
    await client.request({
        method: `${client.mode}_setNonce`,
        params: [address, (0, toHex_js_1.numberToHex)(nonce)],
    });
}
exports.setNonce = setNonce;
//# sourceMappingURL=setNonce.js.map

/***/ }),

/***/ 25777:
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.setRpcUrl = void 0;
async function setRpcUrl(client, jsonRpcUrl) {
    await client.request({
        method: `${client.mode}_setRpcUrl`,
        params: [jsonRpcUrl],
    });
}
exports.setRpcUrl = setRpcUrl;
//# sourceMappingURL=setRpcUrl.js.map

/***/ }),

/***/ 47401:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.setStorageAt = void 0;
const toHex_js_1 = __webpack_require__(86340);
async function setStorageAt(client, { address, index, value }) {
    await client.request({
        method: `${client.mode}_setStorageAt`,
        params: [
            address,
            typeof index === 'number' ? (0, toHex_js_1.numberToHex)(index) : index,
            value,
        ],
    });
}
exports.setStorageAt = setStorageAt;
//# sourceMappingURL=setStorageAt.js.map

/***/ }),

/***/ 10909:
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.snapshot = void 0;
async function snapshot(client) {
    return await client.request({
        method: 'evm_snapshot',
    });
}
exports.snapshot = snapshot;
//# sourceMappingURL=snapshot.js.map

/***/ }),

/***/ 11620:
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.stopImpersonatingAccount = void 0;
async function stopImpersonatingAccount(client, { address }) {
    await client.request({
        method: `${client.mode}_stopImpersonatingAccount`,
        params: [address],
    });
}
exports.stopImpersonatingAccount = stopImpersonatingAccount;
//# sourceMappingURL=stopImpersonatingAccount.js.map

/***/ }),

/***/ 4618:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.addChain = void 0;
const toHex_js_1 = __webpack_require__(86340);
async function addChain(client, { chain }) {
    const { id, name, nativeCurrency, rpcUrls, blockExplorers } = chain;
    await client.request({
        method: 'wallet_addEthereumChain',
        params: [
            {
                chainId: (0, toHex_js_1.numberToHex)(id),
                chainName: name,
                nativeCurrency,
                rpcUrls: rpcUrls.default.http,
                blockExplorerUrls: blockExplorers
                    ? Object.values(blockExplorers).map(({ url }) => url)
                    : undefined,
            },
        ],
    });
}
exports.addChain = addChain;
//# sourceMappingURL=addChain.js.map

/***/ }),

/***/ 57583:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.deployContract = void 0;
const encodeDeployData_js_1 = __webpack_require__(76006);
const sendTransaction_js_1 = __webpack_require__(17238);
function deployContract(walletClient, { abi, args, bytecode, ...request }) {
    const calldata = (0, encodeDeployData_js_1.encodeDeployData)({
        abi,
        args,
        bytecode,
    });
    return (0, sendTransaction_js_1.sendTransaction)(walletClient, {
        ...request,
        data: calldata,
    });
}
exports.deployContract = deployContract;
//# sourceMappingURL=deployContract.js.map

/***/ }),

/***/ 90286:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getAddresses = void 0;
const getAddress_js_1 = __webpack_require__(18717);
async function getAddresses(client) {
    if (client.account?.type === 'local')
        return [client.account.address];
    const addresses = await client.request({ method: 'eth_accounts' });
    return addresses.map((address) => (0, getAddress_js_1.checksumAddress)(address));
}
exports.getAddresses = getAddresses;
//# sourceMappingURL=getAddresses.js.map

/***/ }),

/***/ 72454:
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getPermissions = void 0;
async function getPermissions(client) {
    const permissions = await client.request({ method: 'wallet_getPermissions' });
    return permissions;
}
exports.getPermissions = getPermissions;
//# sourceMappingURL=getPermissions.js.map

/***/ }),

/***/ 42170:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.prepareTransactionRequest = void 0;
const parseAccount_js_1 = __webpack_require__(79429);
const estimateFeesPerGas_js_1 = __webpack_require__(56201);
const estimateGas_js_1 = __webpack_require__(55191);
const getBlock_js_1 = __webpack_require__(10543);
const getTransactionCount_js_1 = __webpack_require__(99799);
const account_js_1 = __webpack_require__(31885);
const fee_js_1 = __webpack_require__(16422);
const getAction_js_1 = __webpack_require__(46840);
const assertRequest_js_1 = __webpack_require__(12546);
const getTransactionType_js_1 = __webpack_require__(22277);
async function prepareTransactionRequest(client, args) {
    const { account: account_ = client.account, chain, gas, nonce, type } = args;
    if (!account_)
        throw new account_js_1.AccountNotFoundError();
    const account = (0, parseAccount_js_1.parseAccount)(account_);
    const block = await (0, getAction_js_1.getAction)(client, getBlock_js_1.getBlock, 'getBlock')({ blockTag: 'latest' });
    const request = { ...args, from: account.address };
    if (typeof nonce === 'undefined')
        request.nonce = await (0, getAction_js_1.getAction)(client, getTransactionCount_js_1.getTransactionCount, 'getTransactionCount')({
            address: account.address,
            blockTag: 'pending',
        });
    if (typeof type === 'undefined') {
        try {
            request.type = (0, getTransactionType_js_1.getTransactionType)(request);
        }
        catch {
            request.type =
                typeof block.baseFeePerGas === 'bigint' ? 'eip1559' : 'legacy';
        }
    }
    if (request.type === 'eip1559') {
        const { maxFeePerGas, maxPriorityFeePerGas } = await (0, estimateFeesPerGas_js_1.internal_estimateFeesPerGas)(client, {
            block,
            chain,
            request: request,
        });
        if (typeof args.maxPriorityFeePerGas === 'undefined' &&
            args.maxFeePerGas &&
            args.maxFeePerGas < maxPriorityFeePerGas)
            throw new fee_js_1.MaxFeePerGasTooLowError({
                maxPriorityFeePerGas,
            });
        request.maxPriorityFeePerGas = maxPriorityFeePerGas;
        request.maxFeePerGas = maxFeePerGas;
    }
    else {
        if (typeof args.maxFeePerGas !== 'undefined' ||
            typeof args.maxPriorityFeePerGas !== 'undefined')
            throw new fee_js_1.Eip1559FeesNotSupportedError();
        const { gasPrice: gasPrice_ } = await (0, estimateFeesPerGas_js_1.internal_estimateFeesPerGas)(client, {
            block,
            chain,
            request: request,
            type: 'legacy',
        });
        request.gasPrice = gasPrice_;
    }
    if (typeof gas === 'undefined')
        request.gas = await (0, getAction_js_1.getAction)(client, estimateGas_js_1.estimateGas, 'estimateGas')({
            ...request,
            account: { address: account.address, type: 'json-rpc' },
        });
    (0, assertRequest_js_1.assertRequest)(request);
    return request;
}
exports.prepareTransactionRequest = prepareTransactionRequest;
//# sourceMappingURL=prepareTransactionRequest.js.map

/***/ }),

/***/ 45993:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.requestAddresses = void 0;
const getAddress_js_1 = __webpack_require__(18717);
async function requestAddresses(client) {
    const addresses = await client.request({ method: 'eth_requestAccounts' });
    return addresses.map((address) => (0, getAddress_js_1.getAddress)(address));
}
exports.requestAddresses = requestAddresses;
//# sourceMappingURL=requestAddresses.js.map

/***/ }),

/***/ 94705:
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.requestPermissions = void 0;
async function requestPermissions(client, permissions) {
    return client.request({
        method: 'wallet_requestPermissions',
        params: [permissions],
    });
}
exports.requestPermissions = requestPermissions;
//# sourceMappingURL=requestPermissions.js.map

/***/ }),

/***/ 39718:
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.sendRawTransaction = void 0;
async function sendRawTransaction(client, { serializedTransaction }) {
    return client.request({
        method: 'eth_sendRawTransaction',
        params: [serializedTransaction],
    });
}
exports.sendRawTransaction = sendRawTransaction;
//# sourceMappingURL=sendRawTransaction.js.map

/***/ }),

/***/ 17238:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.sendTransaction = void 0;
const parseAccount_js_1 = __webpack_require__(79429);
const account_js_1 = __webpack_require__(31885);
const assertCurrentChain_js_1 = __webpack_require__(63602);
const getTransactionError_js_1 = __webpack_require__(49122);
const extract_js_1 = __webpack_require__(65457);
const transactionRequest_js_1 = __webpack_require__(23459);
const getAction_js_1 = __webpack_require__(46840);
const assertRequest_js_1 = __webpack_require__(12546);
const getChainId_js_1 = __webpack_require__(6466);
const prepareTransactionRequest_js_1 = __webpack_require__(42170);
const sendRawTransaction_js_1 = __webpack_require__(39718);
async function sendTransaction(client, args) {
    const { account: account_ = client.account, chain = client.chain, accessList, data, gas, gasPrice, maxFeePerGas, maxPriorityFeePerGas, nonce, to, value, ...rest } = args;
    if (!account_)
        throw new account_js_1.AccountNotFoundError({
            docsPath: '/docs/actions/wallet/sendTransaction',
        });
    const account = (0, parseAccount_js_1.parseAccount)(account_);
    try {
        (0, assertRequest_js_1.assertRequest)(args);
        let chainId;
        if (chain !== null) {
            chainId = await (0, getAction_js_1.getAction)(client, getChainId_js_1.getChainId, 'getChainId')({});
            (0, assertCurrentChain_js_1.assertCurrentChain)({
                currentChainId: chainId,
                chain,
            });
        }
        if (account.type === 'local') {
            const request = await (0, getAction_js_1.getAction)(client, prepareTransactionRequest_js_1.prepareTransactionRequest, 'prepareTransactionRequest')({
                account,
                accessList,
                chain,
                data,
                gas,
                gasPrice,
                maxFeePerGas,
                maxPriorityFeePerGas,
                nonce,
                to,
                value,
                ...rest,
            });
            if (!chainId)
                chainId = await (0, getAction_js_1.getAction)(client, getChainId_js_1.getChainId, 'getChainId')({});
            const serializer = chain?.serializers?.transaction;
            const serializedTransaction = (await account.signTransaction({
                ...request,
                chainId,
            }, { serializer }));
            return await (0, getAction_js_1.getAction)(client, sendRawTransaction_js_1.sendRawTransaction, 'sendRawTransaction')({
                serializedTransaction,
            });
        }
        const chainFormat = client.chain?.formatters?.transactionRequest?.format;
        const format = chainFormat || transactionRequest_js_1.formatTransactionRequest;
        const request = format({
            ...(0, extract_js_1.extract)(rest, { format: chainFormat }),
            accessList,
            data,
            from: account.address,
            gas,
            gasPrice,
            maxFeePerGas,
            maxPriorityFeePerGas,
            nonce,
            to,
            value,
        });
        return await client.request({
            method: 'eth_sendTransaction',
            params: [request],
        });
    }
    catch (err) {
        throw (0, getTransactionError_js_1.getTransactionError)(err, {
            ...args,
            account,
            chain: args.chain || undefined,
        });
    }
}
exports.sendTransaction = sendTransaction;
//# sourceMappingURL=sendTransaction.js.map

/***/ }),

/***/ 17636:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.signMessage = void 0;
const parseAccount_js_1 = __webpack_require__(79429);
const account_js_1 = __webpack_require__(31885);
const toHex_js_1 = __webpack_require__(86340);
async function signMessage(client, { account: account_ = client.account, message, }) {
    if (!account_)
        throw new account_js_1.AccountNotFoundError({
            docsPath: '/docs/actions/wallet/signMessage',
        });
    const account = (0, parseAccount_js_1.parseAccount)(account_);
    if (account.type === 'local')
        return account.signMessage({ message });
    const message_ = (() => {
        if (typeof message === 'string')
            return (0, toHex_js_1.stringToHex)(message);
        if (message.raw instanceof Uint8Array)
            return (0, toHex_js_1.toHex)(message.raw);
        return message.raw;
    })();
    return client.request({
        method: 'personal_sign',
        params: [message_, account.address],
    });
}
exports.signMessage = signMessage;
//# sourceMappingURL=signMessage.js.map

/***/ }),

/***/ 19999:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.signTransaction = void 0;
const parseAccount_js_1 = __webpack_require__(79429);
const account_js_1 = __webpack_require__(31885);
const assertCurrentChain_js_1 = __webpack_require__(63602);
const transactionRequest_js_1 = __webpack_require__(23459);
const getAction_js_1 = __webpack_require__(46840);
const index_js_1 = __webpack_require__(2166);
const assertRequest_js_1 = __webpack_require__(12546);
const getChainId_js_1 = __webpack_require__(6466);
async function signTransaction(client, args) {
    const { account: account_ = client.account, chain = client.chain, ...transaction } = args;
    if (!account_)
        throw new account_js_1.AccountNotFoundError({
            docsPath: '/docs/actions/wallet/signTransaction',
        });
    const account = (0, parseAccount_js_1.parseAccount)(account_);
    (0, assertRequest_js_1.assertRequest)({
        account,
        ...args,
    });
    const chainId = await (0, getAction_js_1.getAction)(client, getChainId_js_1.getChainId, 'getChainId')({});
    if (chain !== null)
        (0, assertCurrentChain_js_1.assertCurrentChain)({
            currentChainId: chainId,
            chain,
        });
    const formatters = chain?.formatters || client.chain?.formatters;
    const format = formatters?.transactionRequest?.format || transactionRequest_js_1.formatTransactionRequest;
    if (account.type === 'local')
        return account.signTransaction({
            ...transaction,
            chainId,
        }, { serializer: client.chain?.serializers?.transaction });
    return await client.request({
        method: 'eth_signTransaction',
        params: [
            {
                ...format(transaction),
                chainId: (0, index_js_1.numberToHex)(chainId),
                from: account.address,
            },
        ],
    });
}
exports.signTransaction = signTransaction;
//# sourceMappingURL=signTransaction.js.map

/***/ }),

/***/ 88251:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.signTypedData = void 0;
const parseAccount_js_1 = __webpack_require__(79429);
const account_js_1 = __webpack_require__(31885);
const isHex_js_1 = __webpack_require__(88846);
const stringify_js_1 = __webpack_require__(68395);
const typedData_js_1 = __webpack_require__(25330);
async function signTypedData(client, { account: account_ = client.account, domain, message, primaryType, types: types_, }) {
    if (!account_)
        throw new account_js_1.AccountNotFoundError({
            docsPath: '/docs/actions/wallet/signTypedData',
        });
    const account = (0, parseAccount_js_1.parseAccount)(account_);
    const types = {
        EIP712Domain: (0, typedData_js_1.getTypesForEIP712Domain)({ domain }),
        ...types_,
    };
    (0, typedData_js_1.validateTypedData)({
        domain,
        message,
        primaryType,
        types,
    });
    if (account.type === 'local')
        return account.signTypedData({
            domain,
            primaryType,
            types,
            message,
        });
    const typedData = (0, stringify_js_1.stringify)({ domain: domain ?? {}, primaryType, types, message }, (_, value) => ((0, isHex_js_1.isHex)(value) ? value.toLowerCase() : value));
    return client.request({
        method: 'eth_signTypedData_v4',
        params: [account.address, typedData],
    });
}
exports.signTypedData = signTypedData;
//# sourceMappingURL=signTypedData.js.map

/***/ }),

/***/ 2609:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.switchChain = void 0;
const toHex_js_1 = __webpack_require__(86340);
async function switchChain(client, { id }) {
    await client.request({
        method: 'wallet_switchEthereumChain',
        params: [
            {
                chainId: (0, toHex_js_1.numberToHex)(id),
            },
        ],
    });
}
exports.switchChain = switchChain;
//# sourceMappingURL=switchChain.js.map

/***/ }),

/***/ 88227:
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.watchAsset = void 0;
async function watchAsset(client, params) {
    const added = await client.request({
        method: 'wallet_watchAsset',
        params,
    });
    return added;
}
exports.watchAsset = watchAsset;
//# sourceMappingURL=watchAsset.js.map

/***/ }),

/***/ 41125:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.writeContract = void 0;
const encodeFunctionData_js_1 = __webpack_require__(99117);
const getAction_js_1 = __webpack_require__(46840);
const sendTransaction_js_1 = __webpack_require__(17238);
async function writeContract(client, { abi, address, args, dataSuffix, functionName, ...request }) {
    const data = (0, encodeFunctionData_js_1.encodeFunctionData)({
        abi,
        args,
        functionName,
    });
    const hash = await (0, getAction_js_1.getAction)(client, sendTransaction_js_1.sendTransaction, 'sendTransaction')({
        data: `${data}${dataSuffix ? dataSuffix.replace('0x', '') : ''}`,
        to: address,
        ...request,
    });
    return hash;
}
exports.writeContract = writeContract;
//# sourceMappingURL=writeContract.js.map

/***/ }),

/***/ 61076:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.createClient = void 0;
const accounts_js_1 = __webpack_require__(59120);
const uid_js_1 = __webpack_require__(81488);
function createClient(parameters) {
    const { batch, cacheTime = parameters.pollingInterval ?? 4000, key = 'base', name = 'Base Client', pollingInterval = 4000, type = 'base', } = parameters;
    const chain = parameters.chain;
    const account = parameters.account
        ? (0, accounts_js_1.parseAccount)(parameters.account)
        : undefined;
    const { config, request, value } = parameters.transport({
        chain,
        pollingInterval,
    });
    const transport = { ...config, ...value };
    const client = {
        account,
        batch,
        cacheTime,
        chain,
        key,
        name,
        pollingInterval,
        request,
        transport,
        type,
        uid: (0, uid_js_1.uid)(),
    };
    function extend(base) {
        return (extendFn) => {
            const extended = extendFn(base);
            for (const key in client)
                delete extended[key];
            const combined = { ...base, ...extended };
            return Object.assign(combined, { extend: extend(combined) });
        };
    }
    return Object.assign(client, { extend: extend(client) });
}
exports.createClient = createClient;
//# sourceMappingURL=createClient.js.map

/***/ }),

/***/ 18069:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.createPublicClient = void 0;
const createClient_js_1 = __webpack_require__(61076);
const public_js_1 = __webpack_require__(47390);
function createPublicClient(parameters) {
    const { key = 'public', name = 'Public Client' } = parameters;
    const client = (0, createClient_js_1.createClient)({
        ...parameters,
        key,
        name,
        type: 'publicClient',
    });
    return client.extend(public_js_1.publicActions);
}
exports.createPublicClient = createPublicClient;
//# sourceMappingURL=createPublicClient.js.map

/***/ }),

/***/ 47288:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.createTestClient = void 0;
const createClient_js_1 = __webpack_require__(61076);
const test_js_1 = __webpack_require__(63668);
function createTestClient(parameters) {
    const { key = 'test', name = 'Test Client', mode } = parameters;
    const client = (0, createClient_js_1.createClient)({
        ...parameters,
        key,
        name,
        type: 'testClient',
    });
    return client.extend((config) => ({
        mode,
        ...(0, test_js_1.testActions)({ mode })(config),
    }));
}
exports.createTestClient = createTestClient;
//# sourceMappingURL=createTestClient.js.map

/***/ }),

/***/ 8441:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.createWalletClient = void 0;
const createClient_js_1 = __webpack_require__(61076);
const wallet_js_1 = __webpack_require__(68449);
function createWalletClient(parameters) {
    const { key = 'wallet', name = 'Wallet Client', transport } = parameters;
    const client = (0, createClient_js_1.createClient)({
        ...parameters,
        key,
        name,
        transport: (opts) => transport({ ...opts, retryCount: 0 }),
        type: 'walletClient',
    });
    return client.extend(wallet_js_1.walletActions);
}
exports.createWalletClient = createWalletClient;
//# sourceMappingURL=createWalletClient.js.map

/***/ }),

/***/ 47390:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.publicActions = void 0;
const getEnsAddress_js_1 = __webpack_require__(93455);
const getEnsAvatar_js_1 = __webpack_require__(28994);
const getEnsName_js_1 = __webpack_require__(38576);
const getEnsResolver_js_1 = __webpack_require__(8645);
const getEnsText_js_1 = __webpack_require__(2348);
const call_js_1 = __webpack_require__(6882);
const createBlockFilter_js_1 = __webpack_require__(93003);
const createContractEventFilter_js_1 = __webpack_require__(36568);
const createEventFilter_js_1 = __webpack_require__(80786);
const createPendingTransactionFilter_js_1 = __webpack_require__(34977);
const estimateContractGas_js_1 = __webpack_require__(72577);
const estimateFeesPerGas_js_1 = __webpack_require__(56201);
const estimateGas_js_1 = __webpack_require__(55191);
const estimateMaxPriorityFeePerGas_js_1 = __webpack_require__(35778);
const getBalance_js_1 = __webpack_require__(45798);
const getBlock_js_1 = __webpack_require__(10543);
const getBlockNumber_js_1 = __webpack_require__(95546);
const getBlockTransactionCount_js_1 = __webpack_require__(6476);
const getBytecode_js_1 = __webpack_require__(98083);
const getChainId_js_1 = __webpack_require__(6466);
const getContractEvents_js_1 = __webpack_require__(7599);
const getFeeHistory_js_1 = __webpack_require__(15316);
const getFilterChanges_js_1 = __webpack_require__(80337);
const getFilterLogs_js_1 = __webpack_require__(27045);
const getGasPrice_js_1 = __webpack_require__(53598);
const getLogs_js_1 = __webpack_require__(65739);
const getProof_js_1 = __webpack_require__(55484);
const getStorageAt_js_1 = __webpack_require__(1922);
const getTransaction_js_1 = __webpack_require__(48034);
const getTransactionConfirmations_js_1 = __webpack_require__(55298);
const getTransactionCount_js_1 = __webpack_require__(99799);
const getTransactionReceipt_js_1 = __webpack_require__(41460);
const multicall_js_1 = __webpack_require__(45353);
const readContract_js_1 = __webpack_require__(83000);
const simulateContract_js_1 = __webpack_require__(17802);
const uninstallFilter_js_1 = __webpack_require__(93848);
const verifyMessage_js_1 = __webpack_require__(69944);
const verifyTypedData_js_1 = __webpack_require__(82135);
const waitForTransactionReceipt_js_1 = __webpack_require__(67652);
const watchBlockNumber_js_1 = __webpack_require__(34779);
const watchBlocks_js_1 = __webpack_require__(91121);
const watchContractEvent_js_1 = __webpack_require__(94169);
const watchEvent_js_1 = __webpack_require__(44055);
const watchPendingTransactions_js_1 = __webpack_require__(13541);
const prepareTransactionRequest_js_1 = __webpack_require__(42170);
const sendRawTransaction_js_1 = __webpack_require__(39718);
function publicActions(client) {
    return {
        call: (args) => (0, call_js_1.call)(client, args),
        createBlockFilter: () => (0, createBlockFilter_js_1.createBlockFilter)(client),
        createContractEventFilter: (args) => (0, createContractEventFilter_js_1.createContractEventFilter)(client, args),
        createEventFilter: (args) => (0, createEventFilter_js_1.createEventFilter)(client, args),
        createPendingTransactionFilter: () => (0, createPendingTransactionFilter_js_1.createPendingTransactionFilter)(client),
        estimateContractGas: (args) => (0, estimateContractGas_js_1.estimateContractGas)(client, args),
        estimateGas: (args) => (0, estimateGas_js_1.estimateGas)(client, args),
        getBalance: (args) => (0, getBalance_js_1.getBalance)(client, args),
        getBlock: (args) => (0, getBlock_js_1.getBlock)(client, args),
        getBlockNumber: (args) => (0, getBlockNumber_js_1.getBlockNumber)(client, args),
        getBlockTransactionCount: (args) => (0, getBlockTransactionCount_js_1.getBlockTransactionCount)(client, args),
        getBytecode: (args) => (0, getBytecode_js_1.getBytecode)(client, args),
        getChainId: () => (0, getChainId_js_1.getChainId)(client),
        getContractEvents: (args) => (0, getContractEvents_js_1.getContractEvents)(client, args),
        getEnsAddress: (args) => (0, getEnsAddress_js_1.getEnsAddress)(client, args),
        getEnsAvatar: (args) => (0, getEnsAvatar_js_1.getEnsAvatar)(client, args),
        getEnsName: (args) => (0, getEnsName_js_1.getEnsName)(client, args),
        getEnsResolver: (args) => (0, getEnsResolver_js_1.getEnsResolver)(client, args),
        getEnsText: (args) => (0, getEnsText_js_1.getEnsText)(client, args),
        getFeeHistory: (args) => (0, getFeeHistory_js_1.getFeeHistory)(client, args),
        estimateFeesPerGas: (args) => (0, estimateFeesPerGas_js_1.estimateFeesPerGas)(client, args),
        getFilterChanges: (args) => (0, getFilterChanges_js_1.getFilterChanges)(client, args),
        getFilterLogs: (args) => (0, getFilterLogs_js_1.getFilterLogs)(client, args),
        getGasPrice: () => (0, getGasPrice_js_1.getGasPrice)(client),
        getLogs: (args) => (0, getLogs_js_1.getLogs)(client, args),
        getProof: (args) => (0, getProof_js_1.getProof)(client, args),
        estimateMaxPriorityFeePerGas: (args) => (0, estimateMaxPriorityFeePerGas_js_1.estimateMaxPriorityFeePerGas)(client, args),
        getStorageAt: (args) => (0, getStorageAt_js_1.getStorageAt)(client, args),
        getTransaction: (args) => (0, getTransaction_js_1.getTransaction)(client, args),
        getTransactionConfirmations: (args) => (0, getTransactionConfirmations_js_1.getTransactionConfirmations)(client, args),
        getTransactionCount: (args) => (0, getTransactionCount_js_1.getTransactionCount)(client, args),
        getTransactionReceipt: (args) => (0, getTransactionReceipt_js_1.getTransactionReceipt)(client, args),
        multicall: (args) => (0, multicall_js_1.multicall)(client, args),
        prepareTransactionRequest: (args) => (0, prepareTransactionRequest_js_1.prepareTransactionRequest)(client, args),
        readContract: (args) => (0, readContract_js_1.readContract)(client, args),
        sendRawTransaction: (args) => (0, sendRawTransaction_js_1.sendRawTransaction)(client, args),
        simulateContract: (args) => (0, simulateContract_js_1.simulateContract)(client, args),
        verifyMessage: (args) => (0, verifyMessage_js_1.verifyMessage)(client, args),
        verifyTypedData: (args) => (0, verifyTypedData_js_1.verifyTypedData)(client, args),
        uninstallFilter: (args) => (0, uninstallFilter_js_1.uninstallFilter)(client, args),
        waitForTransactionReceipt: (args) => (0, waitForTransactionReceipt_js_1.waitForTransactionReceipt)(client, args),
        watchBlocks: (args) => (0, watchBlocks_js_1.watchBlocks)(client, args),
        watchBlockNumber: (args) => (0, watchBlockNumber_js_1.watchBlockNumber)(client, args),
        watchContractEvent: (args) => (0, watchContractEvent_js_1.watchContractEvent)(client, args),
        watchEvent: (args) => (0, watchEvent_js_1.watchEvent)(client, args),
        watchPendingTransactions: (args) => (0, watchPendingTransactions_js_1.watchPendingTransactions)(client, args),
    };
}
exports.publicActions = publicActions;
//# sourceMappingURL=public.js.map

/***/ }),

/***/ 63668:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.testActions = void 0;
const dropTransaction_js_1 = __webpack_require__(77942);
const dumpState_js_1 = __webpack_require__(28370);
const getAutomine_js_1 = __webpack_require__(59953);
const getTxpoolContent_js_1 = __webpack_require__(45594);
const getTxpoolStatus_js_1 = __webpack_require__(70553);
const impersonateAccount_js_1 = __webpack_require__(58253);
const increaseTime_js_1 = __webpack_require__(42716);
const inspectTxpool_js_1 = __webpack_require__(63979);
const loadState_js_1 = __webpack_require__(3856);
const mine_js_1 = __webpack_require__(94310);
const removeBlockTimestampInterval_js_1 = __webpack_require__(97687);
const reset_js_1 = __webpack_require__(45978);
const revert_js_1 = __webpack_require__(48767);
const sendUnsignedTransaction_js_1 = __webpack_require__(44558);
const setAutomine_js_1 = __webpack_require__(74445);
const setBalance_js_1 = __webpack_require__(53653);
const setBlockGasLimit_js_1 = __webpack_require__(53292);
const setBlockTimestampInterval_js_1 = __webpack_require__(22171);
const setCode_js_1 = __webpack_require__(8496);
const setCoinbase_js_1 = __webpack_require__(66789);
const setIntervalMining_js_1 = __webpack_require__(18384);
const setLoggingEnabled_js_1 = __webpack_require__(30011);
const setMinGasPrice_js_1 = __webpack_require__(34907);
const setNextBlockBaseFeePerGas_js_1 = __webpack_require__(47316);
const setNextBlockTimestamp_js_1 = __webpack_require__(22499);
const setNonce_js_1 = __webpack_require__(30578);
const setRpcUrl_js_1 = __webpack_require__(25777);
const setStorageAt_js_1 = __webpack_require__(47401);
const snapshot_js_1 = __webpack_require__(10909);
const stopImpersonatingAccount_js_1 = __webpack_require__(11620);
function testActions({ mode, }) {
    return (client_) => {
        const client = client_.extend(() => ({
            mode,
        }));
        return {
            dropTransaction: (args) => (0, dropTransaction_js_1.dropTransaction)(client, args),
            dumpState: () => (0, dumpState_js_1.dumpState)(client),
            getAutomine: () => (0, getAutomine_js_1.getAutomine)(client),
            getTxpoolContent: () => (0, getTxpoolContent_js_1.getTxpoolContent)(client),
            getTxpoolStatus: () => (0, getTxpoolStatus_js_1.getTxpoolStatus)(client),
            impersonateAccount: (args) => (0, impersonateAccount_js_1.impersonateAccount)(client, args),
            increaseTime: (args) => (0, increaseTime_js_1.increaseTime)(client, args),
            inspectTxpool: () => (0, inspectTxpool_js_1.inspectTxpool)(client),
            loadState: (args) => (0, loadState_js_1.loadState)(client, args),
            mine: (args) => (0, mine_js_1.mine)(client, args),
            removeBlockTimestampInterval: () => (0, removeBlockTimestampInterval_js_1.removeBlockTimestampInterval)(client),
            reset: (args) => (0, reset_js_1.reset)(client, args),
            revert: (args) => (0, revert_js_1.revert)(client, args),
            sendUnsignedTransaction: (args) => (0, sendUnsignedTransaction_js_1.sendUnsignedTransaction)(client, args),
            setAutomine: (args) => (0, setAutomine_js_1.setAutomine)(client, args),
            setBalance: (args) => (0, setBalance_js_1.setBalance)(client, args),
            setBlockGasLimit: (args) => (0, setBlockGasLimit_js_1.setBlockGasLimit)(client, args),
            setBlockTimestampInterval: (args) => (0, setBlockTimestampInterval_js_1.setBlockTimestampInterval)(client, args),
            setCode: (args) => (0, setCode_js_1.setCode)(client, args),
            setCoinbase: (args) => (0, setCoinbase_js_1.setCoinbase)(client, args),
            setIntervalMining: (args) => (0, setIntervalMining_js_1.setIntervalMining)(client, args),
            setLoggingEnabled: (args) => (0, setLoggingEnabled_js_1.setLoggingEnabled)(client, args),
            setMinGasPrice: (args) => (0, setMinGasPrice_js_1.setMinGasPrice)(client, args),
            setNextBlockBaseFeePerGas: (args) => (0, setNextBlockBaseFeePerGas_js_1.setNextBlockBaseFeePerGas)(client, args),
            setNextBlockTimestamp: (args) => (0, setNextBlockTimestamp_js_1.setNextBlockTimestamp)(client, args),
            setNonce: (args) => (0, setNonce_js_1.setNonce)(client, args),
            setRpcUrl: (args) => (0, setRpcUrl_js_1.setRpcUrl)(client, args),
            setStorageAt: (args) => (0, setStorageAt_js_1.setStorageAt)(client, args),
            snapshot: () => (0, snapshot_js_1.snapshot)(client),
            stopImpersonatingAccount: (args) => (0, stopImpersonatingAccount_js_1.stopImpersonatingAccount)(client, args),
        };
    };
}
exports.testActions = testActions;
//# sourceMappingURL=test.js.map

/***/ }),

/***/ 68449:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.walletActions = void 0;
const getChainId_js_1 = __webpack_require__(6466);
const addChain_js_1 = __webpack_require__(4618);
const deployContract_js_1 = __webpack_require__(57583);
const getAddresses_js_1 = __webpack_require__(90286);
const getPermissions_js_1 = __webpack_require__(72454);
const prepareTransactionRequest_js_1 = __webpack_require__(42170);
const requestAddresses_js_1 = __webpack_require__(45993);
const requestPermissions_js_1 = __webpack_require__(94705);
const sendRawTransaction_js_1 = __webpack_require__(39718);
const sendTransaction_js_1 = __webpack_require__(17238);
const signMessage_js_1 = __webpack_require__(17636);
const signTransaction_js_1 = __webpack_require__(19999);
const signTypedData_js_1 = __webpack_require__(88251);
const switchChain_js_1 = __webpack_require__(2609);
const watchAsset_js_1 = __webpack_require__(88227);
const writeContract_js_1 = __webpack_require__(41125);
function walletActions(client) {
    return {
        addChain: (args) => (0, addChain_js_1.addChain)(client, args),
        deployContract: (args) => (0, deployContract_js_1.deployContract)(client, args),
        getAddresses: () => (0, getAddresses_js_1.getAddresses)(client),
        getChainId: () => (0, getChainId_js_1.getChainId)(client),
        getPermissions: () => (0, getPermissions_js_1.getPermissions)(client),
        prepareTransactionRequest: (args) => (0, prepareTransactionRequest_js_1.prepareTransactionRequest)(client, args),
        requestAddresses: () => (0, requestAddresses_js_1.requestAddresses)(client),
        requestPermissions: (args) => (0, requestPermissions_js_1.requestPermissions)(client, args),
        sendRawTransaction: (args) => (0, sendRawTransaction_js_1.sendRawTransaction)(client, args),
        sendTransaction: (args) => (0, sendTransaction_js_1.sendTransaction)(client, args),
        signMessage: (args) => (0, signMessage_js_1.signMessage)(client, args),
        signTransaction: (args) => (0, signTransaction_js_1.signTransaction)(client, args),
        signTypedData: (args) => (0, signTypedData_js_1.signTypedData)(client, args),
        switchChain: (args) => (0, switchChain_js_1.switchChain)(client, args),
        watchAsset: (args) => (0, watchAsset_js_1.watchAsset)(client, args),
        writeContract: (args) => (0, writeContract_js_1.writeContract)(client, args),
    };
}
exports.walletActions = walletActions;
//# sourceMappingURL=wallet.js.map

/***/ }),

/***/ 78447:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.createTransport = void 0;
const buildRequest_js_1 = __webpack_require__(48701);
function createTransport({ key, name, request, retryCount = 3, retryDelay = 150, timeout, type, }, value) {
    return {
        config: { key, name, request, retryCount, retryDelay, timeout, type },
        request: (0, buildRequest_js_1.buildRequest)(request, { retryCount, retryDelay }),
        value,
    };
}
exports.createTransport = createTransport;
//# sourceMappingURL=createTransport.js.map

/***/ }),

/***/ 44103:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.custom = void 0;
const createTransport_js_1 = __webpack_require__(78447);
function custom(provider, config = {}) {
    const { key = 'custom', name = 'Custom Provider', retryDelay } = config;
    return ({ retryCount: defaultRetryCount }) => (0, createTransport_js_1.createTransport)({
        key,
        name,
        request: provider.request.bind(provider),
        retryCount: config.retryCount ?? defaultRetryCount,
        retryDelay,
        type: 'custom',
    });
}
exports.custom = custom;
//# sourceMappingURL=custom.js.map

/***/ }),

/***/ 1506:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.rankTransports = exports.fallback = void 0;
const buildRequest_js_1 = __webpack_require__(48701);
const wait_js_1 = __webpack_require__(80433);
const createTransport_js_1 = __webpack_require__(78447);
function fallback(transports_, config = {}) {
    const { key = 'fallback', name = 'Fallback', rank = false, retryCount, retryDelay, } = config;
    return ({ chain, pollingInterval = 4000, timeout }) => {
        let transports = transports_;
        let onResponse = () => { };
        const transport = (0, createTransport_js_1.createTransport)({
            key,
            name,
            async request({ method, params }) {
                const fetch = async (i = 0) => {
                    const transport = transports[i]({ chain, retryCount: 0, timeout });
                    try {
                        const response = await transport.request({
                            method,
                            params,
                        });
                        onResponse({
                            method,
                            params: params,
                            response,
                            transport,
                            status: 'success',
                        });
                        return response;
                    }
                    catch (err) {
                        onResponse({
                            error: err,
                            method,
                            params: params,
                            transport,
                            status: 'error',
                        });
                        if ((0, buildRequest_js_1.isDeterministicError)(err))
                            throw err;
                        if (i === transports.length - 1)
                            throw err;
                        return fetch(i + 1);
                    }
                };
                return fetch();
            },
            retryCount,
            retryDelay,
            type: 'fallback',
        }, {
            onResponse: (fn) => (onResponse = fn),
            transports: transports.map((fn) => fn({ chain, retryCount: 0 })),
        });
        if (rank) {
            const rankOptions = (typeof rank === 'object' ? rank : {});
            rankTransports({
                chain,
                interval: rankOptions.interval ?? pollingInterval,
                onTransports: (transports_) => (transports = transports_),
                sampleCount: rankOptions.sampleCount,
                timeout: rankOptions.timeout,
                transports,
                weights: rankOptions.weights,
            });
        }
        return transport;
    };
}
exports.fallback = fallback;
function rankTransports({ chain, interval = 4000, onTransports, sampleCount = 10, timeout = 1000, transports, weights = {}, }) {
    const { stability: stabilityWeight = 0.7, latency: latencyWeight = 0.3 } = weights;
    const samples = [];
    const rankTransports_ = async () => {
        const sample = await Promise.all(transports.map(async (transport) => {
            const transport_ = transport({ chain, retryCount: 0, timeout });
            const start = Date.now();
            let end;
            let success;
            try {
                await transport_.request({ method: 'net_listening' });
                success = 1;
            }
            catch {
                success = 0;
            }
            finally {
                end = Date.now();
            }
            const latency = end - start;
            return { latency, success };
        }));
        samples.push(sample);
        if (samples.length > sampleCount)
            samples.shift();
        const maxLatency = Math.max(...samples.map((sample) => Math.max(...sample.map(({ latency }) => latency))));
        const scores = transports
            .map((_, i) => {
            const latencies = samples.map((sample) => sample[i].latency);
            const meanLatency = latencies.reduce((acc, latency) => acc + latency, 0) /
                latencies.length;
            const latencyScore = 1 - meanLatency / maxLatency;
            const successes = samples.map((sample) => sample[i].success);
            const stabilityScore = successes.reduce((acc, success) => acc + success, 0) /
                successes.length;
            if (stabilityScore === 0)
                return [0, i];
            return [
                latencyWeight * latencyScore + stabilityWeight * stabilityScore,
                i,
            ];
        })
            .sort((a, b) => b[0] - a[0]);
        onTransports(scores.map(([, i]) => transports[i]));
        await (0, wait_js_1.wait)(interval);
        rankTransports_();
    };
    rankTransports_();
}
exports.rankTransports = rankTransports;
//# sourceMappingURL=fallback.js.map

/***/ }),

/***/ 28720:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.http = void 0;
const request_js_1 = __webpack_require__(80767);
const transport_js_1 = __webpack_require__(2659);
const createBatchScheduler_js_1 = __webpack_require__(3315);
const rpc_js_1 = __webpack_require__(50205);
const createTransport_js_1 = __webpack_require__(78447);
function http(url, config = {}) {
    const { batch, fetchOptions, key = 'http', name = 'HTTP JSON-RPC', retryDelay, } = config;
    return ({ chain, retryCount: retryCount_, timeout: timeout_ }) => {
        const { batchSize = 1000, wait = 0 } = typeof batch === 'object' ? batch : {};
        const retryCount = config.retryCount ?? retryCount_;
        const timeout = timeout_ ?? config.timeout ?? 10000;
        const url_ = url || chain?.rpcUrls.default.http[0];
        if (!url_)
            throw new transport_js_1.UrlRequiredError();
        return (0, createTransport_js_1.createTransport)({
            key,
            name,
            async request({ method, params }) {
                const body = { method, params };
                const { schedule } = (0, createBatchScheduler_js_1.createBatchScheduler)({
                    id: `${url}`,
                    wait,
                    shouldSplitBatch(requests) {
                        return requests.length > batchSize;
                    },
                    fn: (body) => rpc_js_1.rpc.http(url_, {
                        body,
                        fetchOptions,
                        timeout,
                    }),
                    sort: (a, b) => a.id - b.id,
                });
                const fn = async (body) => batch
                    ? schedule(body)
                    : [await rpc_js_1.rpc.http(url_, { body, fetchOptions, timeout })];
                const [{ error, result }] = await fn(body);
                if (error)
                    throw new request_js_1.RpcRequestError({
                        body,
                        error,
                        url: url_,
                    });
                return result;
            },
            retryCount,
            retryDelay,
            timeout,
            type: 'http',
        }, {
            fetchOptions,
            url,
        });
    };
}
exports.http = http;
//# sourceMappingURL=http.js.map

/***/ }),

/***/ 75493:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.webSocket = void 0;
const request_js_1 = __webpack_require__(80767);
const transport_js_1 = __webpack_require__(2659);
const rpc_js_1 = __webpack_require__(50205);
const createTransport_js_1 = __webpack_require__(78447);
function webSocket(url, config = {}) {
    const { key = 'webSocket', name = 'WebSocket JSON-RPC', retryDelay } = config;
    return ({ chain, retryCount: retryCount_, timeout: timeout_ }) => {
        const retryCount = config.retryCount ?? retryCount_;
        const timeout = timeout_ ?? config.timeout ?? 10000;
        const url_ = url || chain?.rpcUrls.default.webSocket?.[0];
        if (!url_)
            throw new transport_js_1.UrlRequiredError();
        return (0, createTransport_js_1.createTransport)({
            key,
            name,
            async request({ method, params }) {
                const body = { method, params };
                const socket = await (0, rpc_js_1.getSocket)(url_);
                const { error, result } = await rpc_js_1.rpc.webSocketAsync(socket, {
                    body,
                    timeout,
                });
                if (error)
                    throw new request_js_1.RpcRequestError({
                        body,
                        error,
                        url: url_,
                    });
                return result;
            },
            retryCount,
            retryDelay,
            timeout,
            type: 'webSocket',
        }, {
            getSocket() {
                return (0, rpc_js_1.getSocket)(url_);
            },
            async subscribe({ params, onData, onError }) {
                const socket = await (0, rpc_js_1.getSocket)(url_);
                const { result: subscriptionId } = await new Promise((resolve, reject) => rpc_js_1.rpc.webSocket(socket, {
                    body: {
                        method: 'eth_subscribe',
                        params,
                    },
                    onResponse(response) {
                        if (response.error) {
                            reject(response.error);
                            onError?.(response.error);
                            return;
                        }
                        if (typeof response.id === 'number') {
                            resolve(response);
                            return;
                        }
                        if (response.method !== 'eth_subscription')
                            return;
                        onData(response.params);
                    },
                }));
                return {
                    subscriptionId,
                    async unsubscribe() {
                        return new Promise((resolve) => rpc_js_1.rpc.webSocket(socket, {
                            body: {
                                method: 'eth_unsubscribe',
                                params: [subscriptionId],
                            },
                            onResponse: resolve,
                        }));
                    },
                };
            },
        });
    };
}
exports.webSocket = webSocket;
//# sourceMappingURL=webSocket.js.map

/***/ }),

/***/ 22187:
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.universalSignatureValidatorAbi = exports.smartAccountAbi = exports.addressResolverAbi = exports.textResolverAbi = exports.universalResolverReverseAbi = exports.universalResolverResolveAbi = exports.multicall3Abi = void 0;
exports.multicall3Abi = [
    {
        inputs: [
            {
                components: [
                    {
                        name: 'target',
                        type: 'address',
                    },
                    {
                        name: 'allowFailure',
                        type: 'bool',
                    },
                    {
                        name: 'callData',
                        type: 'bytes',
                    },
                ],
                name: 'calls',
                type: 'tuple[]',
            },
        ],
        name: 'aggregate3',
        outputs: [
            {
                components: [
                    {
                        name: 'success',
                        type: 'bool',
                    },
                    {
                        name: 'returnData',
                        type: 'bytes',
                    },
                ],
                name: 'returnData',
                type: 'tuple[]',
            },
        ],
        stateMutability: 'view',
        type: 'function',
    },
];
const universalResolverErrors = [
    {
        inputs: [],
        name: 'ResolverNotFound',
        type: 'error',
    },
    {
        inputs: [],
        name: 'ResolverWildcardNotSupported',
        type: 'error',
    },
];
exports.universalResolverResolveAbi = [
    ...universalResolverErrors,
    {
        name: 'resolve',
        type: 'function',
        stateMutability: 'view',
        inputs: [
            { name: 'name', type: 'bytes' },
            { name: 'data', type: 'bytes' },
        ],
        outputs: [
            { name: '', type: 'bytes' },
            { name: 'address', type: 'address' },
        ],
    },
];
exports.universalResolverReverseAbi = [
    ...universalResolverErrors,
    {
        name: 'reverse',
        type: 'function',
        stateMutability: 'view',
        inputs: [{ type: 'bytes', name: 'reverseName' }],
        outputs: [
            { type: 'string', name: 'resolvedName' },
            { type: 'address', name: 'resolvedAddress' },
            { type: 'address', name: 'reverseResolver' },
            { type: 'address', name: 'resolver' },
        ],
    },
];
exports.textResolverAbi = [
    {
        name: 'text',
        type: 'function',
        stateMutability: 'view',
        inputs: [
            { name: 'name', type: 'bytes32' },
            { name: 'key', type: 'string' },
        ],
        outputs: [{ name: '', type: 'string' }],
    },
];
exports.addressResolverAbi = [
    {
        name: 'addr',
        type: 'function',
        stateMutability: 'view',
        inputs: [{ name: 'name', type: 'bytes32' }],
        outputs: [{ name: '', type: 'address' }],
    },
    {
        name: 'addr',
        type: 'function',
        stateMutability: 'view',
        inputs: [
            { name: 'name', type: 'bytes32' },
            { name: 'coinType', type: 'uint256' },
        ],
        outputs: [{ name: '', type: 'bytes' }],
    },
];
exports.smartAccountAbi = [
    {
        name: 'isValidSignature',
        type: 'function',
        stateMutability: 'view',
        inputs: [
            { name: 'hash', type: 'bytes32' },
            { name: 'signature', type: 'bytes' },
        ],
        outputs: [{ name: '', type: 'bytes4' }],
    },
];
exports.universalSignatureValidatorAbi = [
    {
        inputs: [
            {
                internalType: 'address',
                name: '_signer',
                type: 'address',
            },
            {
                internalType: 'bytes32',
                name: '_hash',
                type: 'bytes32',
            },
            {
                internalType: 'bytes',
                name: '_signature',
                type: 'bytes',
            },
        ],
        stateMutability: 'nonpayable',
        type: 'constructor',
    },
];
//# sourceMappingURL=abis.js.map

/***/ }),

/***/ 95898:
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.zeroAddress = void 0;
exports.zeroAddress = '0x0000000000000000000000000000000000000000';
//# sourceMappingURL=address.js.map

/***/ }),

/***/ 49065:
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.zeroHash = void 0;
exports.zeroHash = '0x0000000000000000000000000000000000000000000000000000000000000000';
//# sourceMappingURL=bytes.js.map

/***/ }),

/***/ 32302:
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.aggregate3Signature = void 0;
exports.aggregate3Signature = '0x82ad56cb';
//# sourceMappingURL=contract.js.map

/***/ }),

/***/ 62373:
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.universalSignatureValidatorByteCode = void 0;
exports.universalSignatureValidatorByteCode = '0x60806040523480156200001157600080fd5b50604051620007003803806200070083398101604081905262000034916200056f565b6000620000438484846200004f565b9050806000526001601ff35b600080846001600160a01b0316803b806020016040519081016040528181526000908060200190933c90507f6492649264926492649264926492649264926492649264926492649264926492620000a68462000451565b036200021f57600060608085806020019051810190620000c79190620005ce565b8651929550909350915060000362000192576000836001600160a01b031683604051620000f5919062000643565b6000604051808303816000865af19150503d806000811462000134576040519150601f19603f3d011682016040523d82523d6000602084013e62000139565b606091505b5050905080620001905760405162461bcd60e51b815260206004820152601e60248201527f5369676e617475726556616c696461746f723a206465706c6f796d656e74000060448201526064015b60405180910390fd5b505b604051630b135d3f60e11b808252906001600160a01b038a1690631626ba7e90620001c4908b90869060040162000661565b602060405180830381865afa158015620001e2573d6000803e3d6000fd5b505050506040513d601f19601f820116820180604052508101906200020891906200069d565b6001600160e01b031916149450505050506200044a565b805115620002b157604051630b135d3f60e11b808252906001600160a01b03871690631626ba7e9062000259908890889060040162000661565b602060405180830381865afa15801562000277573d6000803e3d6000fd5b505050506040513d601f19601f820116820180604052508101906200029d91906200069d565b6001600160e01b031916149150506200044a565b8251604114620003195760405162461bcd60e51b815260206004820152603a6024820152600080516020620006e083398151915260448201527f3a20696e76616c6964207369676e6174757265206c656e677468000000000000606482015260840162000187565b620003236200046b565b506020830151604080850151855186939260009185919081106200034b576200034b620006c9565b016020015160f81c9050601b81148015906200036b57508060ff16601c14155b15620003cf5760405162461bcd60e51b815260206004820152603b6024820152600080516020620006e083398151915260448201527f3a20696e76616c6964207369676e617475726520762076616c75650000000000606482015260840162000187565b6040805160008152602081018083528a905260ff83169181019190915260608101849052608081018390526001600160a01b038a169060019060a0016020604051602081039080840390855afa1580156200042e573d6000803e3d6000fd5b505050602060405103516001600160a01b031614955050505050505b9392505050565b60006020825110156200046357600080fd5b508051015190565b60405180606001604052806003906020820280368337509192915050565b6001600160a01b03811681146200049f57600080fd5b50565b634e487b7160e01b600052604160045260246000fd5b60005b83811015620004d5578181015183820152602001620004bb565b50506000910152565b600082601f830112620004f057600080fd5b81516001600160401b03808211156200050d576200050d620004a2565b604051601f8301601f19908116603f01168101908282118183101715620005385762000538620004a2565b816040528381528660208588010111156200055257600080fd5b62000565846020830160208901620004b8565b9695505050505050565b6000806000606084860312156200058557600080fd5b8351620005928162000489565b6020850151604086015191945092506001600160401b03811115620005b657600080fd5b620005c486828701620004de565b9150509250925092565b600080600060608486031215620005e457600080fd5b8351620005f18162000489565b60208501519093506001600160401b03808211156200060f57600080fd5b6200061d87838801620004de565b935060408601519150808211156200063457600080fd5b50620005c486828701620004de565b6000825162000657818460208701620004b8565b9190910192915050565b828152604060208201526000825180604084015262000688816060850160208701620004b8565b601f01601f1916919091016060019392505050565b600060208284031215620006b057600080fd5b81516001600160e01b0319811681146200044a57600080fd5b634e487b7160e01b600052603260045260246000fdfe5369676e617475726556616c696461746f72237265636f7665725369676e6572';
//# sourceMappingURL=contracts.js.map

/***/ }),

/***/ 61637:
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.minInt144 = exports.minInt136 = exports.minInt128 = exports.minInt120 = exports.minInt112 = exports.minInt104 = exports.minInt96 = exports.minInt88 = exports.minInt80 = exports.minInt72 = exports.minInt64 = exports.minInt56 = exports.minInt48 = exports.minInt40 = exports.minInt32 = exports.minInt24 = exports.minInt16 = exports.minInt8 = exports.maxInt256 = exports.maxInt248 = exports.maxInt240 = exports.maxInt232 = exports.maxInt224 = exports.maxInt216 = exports.maxInt208 = exports.maxInt200 = exports.maxInt192 = exports.maxInt184 = exports.maxInt176 = exports.maxInt168 = exports.maxInt160 = exports.maxInt152 = exports.maxInt144 = exports.maxInt136 = exports.maxInt128 = exports.maxInt120 = exports.maxInt112 = exports.maxInt104 = exports.maxInt96 = exports.maxInt88 = exports.maxInt80 = exports.maxInt72 = exports.maxInt64 = exports.maxInt56 = exports.maxInt48 = exports.maxInt40 = exports.maxInt32 = exports.maxInt24 = exports.maxInt16 = exports.maxInt8 = void 0;
exports.maxUint256 = exports.maxUint248 = exports.maxUint240 = exports.maxUint232 = exports.maxUint224 = exports.maxUint216 = exports.maxUint208 = exports.maxUint200 = exports.maxUint192 = exports.maxUint184 = exports.maxUint176 = exports.maxUint168 = exports.maxUint160 = exports.maxUint152 = exports.maxUint144 = exports.maxUint136 = exports.maxUint128 = exports.maxUint120 = exports.maxUint112 = exports.maxUint104 = exports.maxUint96 = exports.maxUint88 = exports.maxUint80 = exports.maxUint72 = exports.maxUint64 = exports.maxUint56 = exports.maxUint48 = exports.maxUint40 = exports.maxUint32 = exports.maxUint24 = exports.maxUint16 = exports.maxUint8 = exports.minInt256 = exports.minInt248 = exports.minInt240 = exports.minInt232 = exports.minInt224 = exports.minInt216 = exports.minInt208 = exports.minInt200 = exports.minInt192 = exports.minInt184 = exports.minInt176 = exports.minInt168 = exports.minInt160 = exports.minInt152 = void 0;
exports.maxInt8 = 2n ** (8n - 1n) - 1n;
exports.maxInt16 = 2n ** (16n - 1n) - 1n;
exports.maxInt24 = 2n ** (24n - 1n) - 1n;
exports.maxInt32 = 2n ** (32n - 1n) - 1n;
exports.maxInt40 = 2n ** (40n - 1n) - 1n;
exports.maxInt48 = 2n ** (48n - 1n) - 1n;
exports.maxInt56 = 2n ** (56n - 1n) - 1n;
exports.maxInt64 = 2n ** (64n - 1n) - 1n;
exports.maxInt72 = 2n ** (72n - 1n) - 1n;
exports.maxInt80 = 2n ** (80n - 1n) - 1n;
exports.maxInt88 = 2n ** (88n - 1n) - 1n;
exports.maxInt96 = 2n ** (96n - 1n) - 1n;
exports.maxInt104 = 2n ** (104n - 1n) - 1n;
exports.maxInt112 = 2n ** (112n - 1n) - 1n;
exports.maxInt120 = 2n ** (120n - 1n) - 1n;
exports.maxInt128 = 2n ** (128n - 1n) - 1n;
exports.maxInt136 = 2n ** (136n - 1n) - 1n;
exports.maxInt144 = 2n ** (144n - 1n) - 1n;
exports.maxInt152 = 2n ** (152n - 1n) - 1n;
exports.maxInt160 = 2n ** (160n - 1n) - 1n;
exports.maxInt168 = 2n ** (168n - 1n) - 1n;
exports.maxInt176 = 2n ** (176n - 1n) - 1n;
exports.maxInt184 = 2n ** (184n - 1n) - 1n;
exports.maxInt192 = 2n ** (192n - 1n) - 1n;
exports.maxInt200 = 2n ** (200n - 1n) - 1n;
exports.maxInt208 = 2n ** (208n - 1n) - 1n;
exports.maxInt216 = 2n ** (216n - 1n) - 1n;
exports.maxInt224 = 2n ** (224n - 1n) - 1n;
exports.maxInt232 = 2n ** (232n - 1n) - 1n;
exports.maxInt240 = 2n ** (240n - 1n) - 1n;
exports.maxInt248 = 2n ** (248n - 1n) - 1n;
exports.maxInt256 = 2n ** (256n - 1n) - 1n;
exports.minInt8 = -(2n ** (8n - 1n));
exports.minInt16 = -(2n ** (16n - 1n));
exports.minInt24 = -(2n ** (24n - 1n));
exports.minInt32 = -(2n ** (32n - 1n));
exports.minInt40 = -(2n ** (40n - 1n));
exports.minInt48 = -(2n ** (48n - 1n));
exports.minInt56 = -(2n ** (56n - 1n));
exports.minInt64 = -(2n ** (64n - 1n));
exports.minInt72 = -(2n ** (72n - 1n));
exports.minInt80 = -(2n ** (80n - 1n));
exports.minInt88 = -(2n ** (88n - 1n));
exports.minInt96 = -(2n ** (96n - 1n));
exports.minInt104 = -(2n ** (104n - 1n));
exports.minInt112 = -(2n ** (112n - 1n));
exports.minInt120 = -(2n ** (120n - 1n));
exports.minInt128 = -(2n ** (128n - 1n));
exports.minInt136 = -(2n ** (136n - 1n));
exports.minInt144 = -(2n ** (144n - 1n));
exports.minInt152 = -(2n ** (152n - 1n));
exports.minInt160 = -(2n ** (160n - 1n));
exports.minInt168 = -(2n ** (168n - 1n));
exports.minInt176 = -(2n ** (176n - 1n));
exports.minInt184 = -(2n ** (184n - 1n));
exports.minInt192 = -(2n ** (192n - 1n));
exports.minInt200 = -(2n ** (200n - 1n));
exports.minInt208 = -(2n ** (208n - 1n));
exports.minInt216 = -(2n ** (216n - 1n));
exports.minInt224 = -(2n ** (224n - 1n));
exports.minInt232 = -(2n ** (232n - 1n));
exports.minInt240 = -(2n ** (240n - 1n));
exports.minInt248 = -(2n ** (248n - 1n));
exports.minInt256 = -(2n ** (256n - 1n));
exports.maxUint8 = 2n ** 8n - 1n;
exports.maxUint16 = 2n ** 16n - 1n;
exports.maxUint24 = 2n ** 24n - 1n;
exports.maxUint32 = 2n ** 32n - 1n;
exports.maxUint40 = 2n ** 40n - 1n;
exports.maxUint48 = 2n ** 48n - 1n;
exports.maxUint56 = 2n ** 56n - 1n;
exports.maxUint64 = 2n ** 64n - 1n;
exports.maxUint72 = 2n ** 72n - 1n;
exports.maxUint80 = 2n ** 80n - 1n;
exports.maxUint88 = 2n ** 88n - 1n;
exports.maxUint96 = 2n ** 96n - 1n;
exports.maxUint104 = 2n ** 104n - 1n;
exports.maxUint112 = 2n ** 112n - 1n;
exports.maxUint120 = 2n ** 120n - 1n;
exports.maxUint128 = 2n ** 128n - 1n;
exports.maxUint136 = 2n ** 136n - 1n;
exports.maxUint144 = 2n ** 144n - 1n;
exports.maxUint152 = 2n ** 152n - 1n;
exports.maxUint160 = 2n ** 160n - 1n;
exports.maxUint168 = 2n ** 168n - 1n;
exports.maxUint176 = 2n ** 176n - 1n;
exports.maxUint184 = 2n ** 184n - 1n;
exports.maxUint192 = 2n ** 192n - 1n;
exports.maxUint200 = 2n ** 200n - 1n;
exports.maxUint208 = 2n ** 208n - 1n;
exports.maxUint216 = 2n ** 216n - 1n;
exports.maxUint224 = 2n ** 224n - 1n;
exports.maxUint232 = 2n ** 232n - 1n;
exports.maxUint240 = 2n ** 240n - 1n;
exports.maxUint248 = 2n ** 248n - 1n;
exports.maxUint256 = 2n ** 256n - 1n;
//# sourceMappingURL=number.js.map

/***/ }),

/***/ 83305:
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.solidityPanic = exports.solidityError = exports.panicReasons = void 0;
exports.panicReasons = {
    1: 'An `assert` condition failed.',
    17: 'Arithmic operation resulted in underflow or overflow.',
    18: 'Division or modulo by zero (e.g. `5 / 0` or `23 % 0`).',
    33: 'Attempted to convert to an invalid type.',
    34: 'Attempted to access a storage byte array that is incorrectly encoded.',
    49: 'Performed `.pop()` on an empty array',
    50: 'Array index is out of bounds.',
    65: 'Allocated too much memory or created an array which is too large.',
    81: 'Attempted to call a zero-initialized variable of internal function type.',
};
exports.solidityError = {
    inputs: [
        {
            name: 'message',
            type: 'string',
        },
    ],
    name: 'Error',
    type: 'error',
};
exports.solidityPanic = {
    inputs: [
        {
            name: 'reason',
            type: 'uint256',
        },
    ],
    name: 'Panic',
    type: 'error',
};
//# sourceMappingURL=solidity.js.map

/***/ }),

/***/ 72460:
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.presignMessagePrefix = void 0;
exports.presignMessagePrefix = '\x19Ethereum Signed Message:\n';
//# sourceMappingURL=strings.js.map

/***/ }),

/***/ 23098:
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.weiUnits = exports.gweiUnits = exports.etherUnits = void 0;
exports.etherUnits = {
    gwei: 9,
    wei: 18,
};
exports.gweiUnits = {
    ether: -9,
    wei: 9,
};
exports.weiUnits = {
    ether: -18,
    gwei: -9,
};
//# sourceMappingURL=unit.js.map

/***/ }),

/***/ 5432:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.UnsupportedPackedAbiType = exports.InvalidDefinitionTypeError = exports.InvalidArrayError = exports.InvalidAbiDecodingTypeError = exports.InvalidAbiEncodingTypeError = exports.DecodeLogTopicsMismatch = exports.DecodeLogDataMismatch = exports.BytesSizeMismatchError = exports.AbiItemAmbiguityError = exports.AbiFunctionSignatureNotFoundError = exports.AbiFunctionOutputsNotFoundError = exports.AbiFunctionNotFoundError = exports.AbiEventNotFoundError = exports.AbiEventSignatureNotFoundError = exports.AbiEventSignatureEmptyTopicsError = exports.AbiErrorSignatureNotFoundError = exports.AbiErrorNotFoundError = exports.AbiErrorInputsNotFoundError = exports.AbiEncodingLengthMismatchError = exports.AbiEncodingBytesSizeMismatchError = exports.AbiEncodingArrayLengthMismatchError = exports.AbiDecodingZeroDataError = exports.AbiDecodingDataSizeTooSmallError = exports.AbiDecodingDataSizeInvalidError = exports.AbiConstructorParamsNotFoundError = exports.AbiConstructorNotFoundError = void 0;
const formatAbiItem_js_1 = __webpack_require__(36859);
const size_js_1 = __webpack_require__(82026);
const base_js_1 = __webpack_require__(24437);
class AbiConstructorNotFoundError extends base_js_1.BaseError {
    constructor({ docsPath }) {
        super([
            'A constructor was not found on the ABI.',
            'Make sure you are using the correct ABI and that the constructor exists on it.',
        ].join('\n'), {
            docsPath,
        });
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'AbiConstructorNotFoundError'
        });
    }
}
exports.AbiConstructorNotFoundError = AbiConstructorNotFoundError;
class AbiConstructorParamsNotFoundError extends base_js_1.BaseError {
    constructor({ docsPath }) {
        super([
            'Constructor arguments were provided (`args`), but a constructor parameters (`inputs`) were not found on the ABI.',
            'Make sure you are using the correct ABI, and that the `inputs` attribute on the constructor exists.',
        ].join('\n'), {
            docsPath,
        });
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'AbiConstructorParamsNotFoundError'
        });
    }
}
exports.AbiConstructorParamsNotFoundError = AbiConstructorParamsNotFoundError;
class AbiDecodingDataSizeInvalidError extends base_js_1.BaseError {
    constructor({ data, size }) {
        super([
            `Data size of ${size} bytes is invalid.`,
            'Size must be in increments of 32 bytes (size % 32 === 0).',
        ].join('\n'), { metaMessages: [`Data: ${data} (${size} bytes)`] });
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'AbiDecodingDataSizeInvalidError'
        });
    }
}
exports.AbiDecodingDataSizeInvalidError = AbiDecodingDataSizeInvalidError;
class AbiDecodingDataSizeTooSmallError extends base_js_1.BaseError {
    constructor({ data, params, size, }) {
        super([`Data size of ${size} bytes is too small for given parameters.`].join('\n'), {
            metaMessages: [
                `Params: (${(0, formatAbiItem_js_1.formatAbiParams)(params, { includeName: true })})`,
                `Data:   ${data} (${size} bytes)`,
            ],
        });
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'AbiDecodingDataSizeTooSmallError'
        });
        Object.defineProperty(this, "data", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "params", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "size", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        this.data = data;
        this.params = params;
        this.size = size;
    }
}
exports.AbiDecodingDataSizeTooSmallError = AbiDecodingDataSizeTooSmallError;
class AbiDecodingZeroDataError extends base_js_1.BaseError {
    constructor() {
        super('Cannot decode zero data ("0x") with ABI parameters.');
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'AbiDecodingZeroDataError'
        });
    }
}
exports.AbiDecodingZeroDataError = AbiDecodingZeroDataError;
class AbiEncodingArrayLengthMismatchError extends base_js_1.BaseError {
    constructor({ expectedLength, givenLength, type, }) {
        super([
            `ABI encoding array length mismatch for type ${type}.`,
            `Expected length: ${expectedLength}`,
            `Given length: ${givenLength}`,
        ].join('\n'));
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'AbiEncodingArrayLengthMismatchError'
        });
    }
}
exports.AbiEncodingArrayLengthMismatchError = AbiEncodingArrayLengthMismatchError;
class AbiEncodingBytesSizeMismatchError extends base_js_1.BaseError {
    constructor({ expectedSize, value }) {
        super(`Size of bytes "${value}" (bytes${(0, size_js_1.size)(value)}) does not match expected size (bytes${expectedSize}).`);
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'AbiEncodingBytesSizeMismatchError'
        });
    }
}
exports.AbiEncodingBytesSizeMismatchError = AbiEncodingBytesSizeMismatchError;
class AbiEncodingLengthMismatchError extends base_js_1.BaseError {
    constructor({ expectedLength, givenLength, }) {
        super([
            'ABI encoding params/values length mismatch.',
            `Expected length (params): ${expectedLength}`,
            `Given length (values): ${givenLength}`,
        ].join('\n'));
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'AbiEncodingLengthMismatchError'
        });
    }
}
exports.AbiEncodingLengthMismatchError = AbiEncodingLengthMismatchError;
class AbiErrorInputsNotFoundError extends base_js_1.BaseError {
    constructor(errorName, { docsPath }) {
        super([
            `Arguments (\`args\`) were provided to "${errorName}", but "${errorName}" on the ABI does not contain any parameters (\`inputs\`).`,
            'Cannot encode error result without knowing what the parameter types are.',
            'Make sure you are using the correct ABI and that the inputs exist on it.',
        ].join('\n'), {
            docsPath,
        });
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'AbiErrorInputsNotFoundError'
        });
    }
}
exports.AbiErrorInputsNotFoundError = AbiErrorInputsNotFoundError;
class AbiErrorNotFoundError extends base_js_1.BaseError {
    constructor(errorName, { docsPath } = {}) {
        super([
            `Error ${errorName ? `"${errorName}" ` : ''}not found on ABI.`,
            'Make sure you are using the correct ABI and that the error exists on it.',
        ].join('\n'), {
            docsPath,
        });
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'AbiErrorNotFoundError'
        });
    }
}
exports.AbiErrorNotFoundError = AbiErrorNotFoundError;
class AbiErrorSignatureNotFoundError extends base_js_1.BaseError {
    constructor(signature, { docsPath }) {
        super([
            `Encoded error signature "${signature}" not found on ABI.`,
            'Make sure you are using the correct ABI and that the error exists on it.',
            `You can look up the decoded signature here: https://openchain.xyz/signatures?query=${signature}.`,
        ].join('\n'), {
            docsPath,
        });
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'AbiErrorSignatureNotFoundError'
        });
        Object.defineProperty(this, "signature", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        this.signature = signature;
    }
}
exports.AbiErrorSignatureNotFoundError = AbiErrorSignatureNotFoundError;
class AbiEventSignatureEmptyTopicsError extends base_js_1.BaseError {
    constructor({ docsPath }) {
        super('Cannot extract event signature from empty topics.', {
            docsPath,
        });
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'AbiEventSignatureEmptyTopicsError'
        });
    }
}
exports.AbiEventSignatureEmptyTopicsError = AbiEventSignatureEmptyTopicsError;
class AbiEventSignatureNotFoundError extends base_js_1.BaseError {
    constructor(signature, { docsPath }) {
        super([
            `Encoded event signature "${signature}" not found on ABI.`,
            'Make sure you are using the correct ABI and that the event exists on it.',
            `You can look up the signature here: https://openchain.xyz/signatures?query=${signature}.`,
        ].join('\n'), {
            docsPath,
        });
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'AbiEventSignatureNotFoundError'
        });
    }
}
exports.AbiEventSignatureNotFoundError = AbiEventSignatureNotFoundError;
class AbiEventNotFoundError extends base_js_1.BaseError {
    constructor(eventName, { docsPath } = {}) {
        super([
            `Event ${eventName ? `"${eventName}" ` : ''}not found on ABI.`,
            'Make sure you are using the correct ABI and that the event exists on it.',
        ].join('\n'), {
            docsPath,
        });
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'AbiEventNotFoundError'
        });
    }
}
exports.AbiEventNotFoundError = AbiEventNotFoundError;
class AbiFunctionNotFoundError extends base_js_1.BaseError {
    constructor(functionName, { docsPath } = {}) {
        super([
            `Function ${functionName ? `"${functionName}" ` : ''}not found on ABI.`,
            'Make sure you are using the correct ABI and that the function exists on it.',
        ].join('\n'), {
            docsPath,
        });
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'AbiFunctionNotFoundError'
        });
    }
}
exports.AbiFunctionNotFoundError = AbiFunctionNotFoundError;
class AbiFunctionOutputsNotFoundError extends base_js_1.BaseError {
    constructor(functionName, { docsPath }) {
        super([
            `Function "${functionName}" does not contain any \`outputs\` on ABI.`,
            'Cannot decode function result without knowing what the parameter types are.',
            'Make sure you are using the correct ABI and that the function exists on it.',
        ].join('\n'), {
            docsPath,
        });
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'AbiFunctionOutputsNotFoundError'
        });
    }
}
exports.AbiFunctionOutputsNotFoundError = AbiFunctionOutputsNotFoundError;
class AbiFunctionSignatureNotFoundError extends base_js_1.BaseError {
    constructor(signature, { docsPath }) {
        super([
            `Encoded function signature "${signature}" not found on ABI.`,
            'Make sure you are using the correct ABI and that the function exists on it.',
            `You can look up the signature here: https://openchain.xyz/signatures?query=${signature}.`,
        ].join('\n'), {
            docsPath,
        });
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'AbiFunctionSignatureNotFoundError'
        });
    }
}
exports.AbiFunctionSignatureNotFoundError = AbiFunctionSignatureNotFoundError;
class AbiItemAmbiguityError extends base_js_1.BaseError {
    constructor(x, y) {
        super('Found ambiguous types in overloaded ABI items.', {
            metaMessages: [
                `\`${x.type}\` in \`${(0, formatAbiItem_js_1.formatAbiItem)(x.abiItem)}\`, and`,
                `\`${y.type}\` in \`${(0, formatAbiItem_js_1.formatAbiItem)(y.abiItem)}\``,
                '',
                'These types encode differently and cannot be distinguished at runtime.',
                'Remove one of the ambiguous items in the ABI.',
            ],
        });
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'AbiItemAmbiguityError'
        });
    }
}
exports.AbiItemAmbiguityError = AbiItemAmbiguityError;
class BytesSizeMismatchError extends base_js_1.BaseError {
    constructor({ expectedSize, givenSize, }) {
        super(`Expected bytes${expectedSize}, got bytes${givenSize}.`);
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'BytesSizeMismatchError'
        });
    }
}
exports.BytesSizeMismatchError = BytesSizeMismatchError;
class DecodeLogDataMismatch extends base_js_1.BaseError {
    constructor({ abiItem, data, params, size, }) {
        super([
            `Data size of ${size} bytes is too small for non-indexed event parameters.`,
        ].join('\n'), {
            metaMessages: [
                `Params: (${(0, formatAbiItem_js_1.formatAbiParams)(params, { includeName: true })})`,
                `Data:   ${data} (${size} bytes)`,
            ],
        });
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'DecodeLogDataMismatch'
        });
        Object.defineProperty(this, "abiItem", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "data", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "params", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "size", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        this.abiItem = abiItem;
        this.data = data;
        this.params = params;
        this.size = size;
    }
}
exports.DecodeLogDataMismatch = DecodeLogDataMismatch;
class DecodeLogTopicsMismatch extends base_js_1.BaseError {
    constructor({ abiItem, param, }) {
        super([
            `Expected a topic for indexed event parameter${param.name ? ` "${param.name}"` : ''} on event "${(0, formatAbiItem_js_1.formatAbiItem)(abiItem, { includeName: true })}".`,
        ].join('\n'));
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'DecodeLogTopicsMismatch'
        });
        Object.defineProperty(this, "abiItem", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        this.abiItem = abiItem;
    }
}
exports.DecodeLogTopicsMismatch = DecodeLogTopicsMismatch;
class InvalidAbiEncodingTypeError extends base_js_1.BaseError {
    constructor(type, { docsPath }) {
        super([
            `Type "${type}" is not a valid encoding type.`,
            'Please provide a valid ABI type.',
        ].join('\n'), { docsPath });
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'InvalidAbiEncodingType'
        });
    }
}
exports.InvalidAbiEncodingTypeError = InvalidAbiEncodingTypeError;
class InvalidAbiDecodingTypeError extends base_js_1.BaseError {
    constructor(type, { docsPath }) {
        super([
            `Type "${type}" is not a valid decoding type.`,
            'Please provide a valid ABI type.',
        ].join('\n'), { docsPath });
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'InvalidAbiDecodingType'
        });
    }
}
exports.InvalidAbiDecodingTypeError = InvalidAbiDecodingTypeError;
class InvalidArrayError extends base_js_1.BaseError {
    constructor(value) {
        super([`Value "${value}" is not a valid array.`].join('\n'));
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'InvalidArrayError'
        });
    }
}
exports.InvalidArrayError = InvalidArrayError;
class InvalidDefinitionTypeError extends base_js_1.BaseError {
    constructor(type) {
        super([
            `"${type}" is not a valid definition type.`,
            'Valid types: "function", "event", "error"',
        ].join('\n'));
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'InvalidDefinitionTypeError'
        });
    }
}
exports.InvalidDefinitionTypeError = InvalidDefinitionTypeError;
class UnsupportedPackedAbiType extends base_js_1.BaseError {
    constructor(type) {
        super(`Type "${type}" is not supported for packed encoding.`);
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'UnsupportedPackedAbiType'
        });
    }
}
exports.UnsupportedPackedAbiType = UnsupportedPackedAbiType;
//# sourceMappingURL=abi.js.map

/***/ }),

/***/ 31885:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.AccountNotFoundError = void 0;
const base_js_1 = __webpack_require__(24437);
class AccountNotFoundError extends base_js_1.BaseError {
    constructor({ docsPath } = {}) {
        super([
            'Could not find an Account to execute with this Action.',
            'Please provide an Account with the `account` argument on the Action, or by supplying an `account` to the WalletClient.',
        ].join('\n'), {
            docsPath,
            docsSlug: 'account',
        });
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'AccountNotFoundError'
        });
    }
}
exports.AccountNotFoundError = AccountNotFoundError;
//# sourceMappingURL=account.js.map

/***/ }),

/***/ 64422:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.InvalidAddressError = void 0;
const base_js_1 = __webpack_require__(24437);
class InvalidAddressError extends base_js_1.BaseError {
    constructor({ address }) {
        super(`Address "${address}" is invalid.`);
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'InvalidAddressError'
        });
    }
}
exports.InvalidAddressError = InvalidAddressError;
//# sourceMappingURL=address.js.map

/***/ }),

/***/ 24437:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.BaseError = void 0;
const utils_js_1 = __webpack_require__(61503);
class BaseError extends Error {
    constructor(shortMessage, args = {}) {
        super();
        Object.defineProperty(this, "details", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "docsPath", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "metaMessages", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "shortMessage", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'ViemError'
        });
        Object.defineProperty(this, "version", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: (0, utils_js_1.getVersion)()
        });
        const details = args.cause instanceof BaseError
            ? args.cause.details
            : args.cause?.message
                ? args.cause.message
                : args.details;
        const docsPath = args.cause instanceof BaseError
            ? args.cause.docsPath || args.docsPath
            : args.docsPath;
        this.message = [
            shortMessage || 'An error occurred.',
            '',
            ...(args.metaMessages ? [...args.metaMessages, ''] : []),
            ...(docsPath
                ? [
                    `Docs: https://viem.sh${docsPath}.html${args.docsSlug ? `#${args.docsSlug}` : ''}`,
                ]
                : []),
            ...(details ? [`Details: ${details}`] : []),
            `Version: ${this.version}`,
        ].join('\n');
        if (args.cause)
            this.cause = args.cause;
        this.details = details;
        this.docsPath = docsPath;
        this.metaMessages = args.metaMessages;
        this.shortMessage = shortMessage;
    }
    walk(fn) {
        return walk(this, fn);
    }
}
exports.BaseError = BaseError;
function walk(err, fn) {
    if (fn?.(err))
        return err;
    if (err && typeof err === 'object' && 'cause' in err)
        return walk(err.cause, fn);
    return fn ? null : err;
}
//# sourceMappingURL=base.js.map

/***/ }),

/***/ 57343:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.BlockNotFoundError = void 0;
const base_js_1 = __webpack_require__(24437);
class BlockNotFoundError extends base_js_1.BaseError {
    constructor({ blockHash, blockNumber, }) {
        let identifier = 'Block';
        if (blockHash)
            identifier = `Block at hash "${blockHash}"`;
        if (blockNumber)
            identifier = `Block at number "${blockNumber}"`;
        super(`${identifier} could not be found.`);
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'BlockNotFoundError'
        });
    }
}
exports.BlockNotFoundError = BlockNotFoundError;
//# sourceMappingURL=block.js.map

/***/ }),

/***/ 6859:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.OffchainLookupSenderMismatchError = exports.OffchainLookupResponseMalformedError = exports.OffchainLookupError = void 0;
const stringify_js_1 = __webpack_require__(68395);
const base_js_1 = __webpack_require__(24437);
const utils_js_1 = __webpack_require__(61503);
class OffchainLookupError extends base_js_1.BaseError {
    constructor({ callbackSelector, cause, data, extraData, sender, urls, }) {
        super(cause.shortMessage ||
            'An error occurred while fetching for an offchain result.', {
            cause,
            metaMessages: [
                ...(cause.metaMessages || []),
                cause.metaMessages?.length ? '' : [],
                'Offchain Gateway Call:',
                urls && [
                    '  Gateway URL(s):',
                    ...urls.map((url) => `    ${(0, utils_js_1.getUrl)(url)}`),
                ],
                `  Sender: ${sender}`,
                `  Data: ${data}`,
                `  Callback selector: ${callbackSelector}`,
                `  Extra data: ${extraData}`,
            ].flat(),
        });
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'OffchainLookupError'
        });
    }
}
exports.OffchainLookupError = OffchainLookupError;
class OffchainLookupResponseMalformedError extends base_js_1.BaseError {
    constructor({ result, url }) {
        super('Offchain gateway response is malformed. Response data must be a hex value.', {
            metaMessages: [
                `Gateway URL: ${(0, utils_js_1.getUrl)(url)}`,
                `Response: ${(0, stringify_js_1.stringify)(result)}`,
            ],
        });
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'OffchainLookupResponseMalformedError'
        });
    }
}
exports.OffchainLookupResponseMalformedError = OffchainLookupResponseMalformedError;
class OffchainLookupSenderMismatchError extends base_js_1.BaseError {
    constructor({ sender, to }) {
        super('Reverted sender address does not match target contract address (`to`).', {
            metaMessages: [
                `Contract address: ${to}`,
                `OffchainLookup sender address: ${sender}`,
            ],
        });
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'OffchainLookupSenderMismatchError'
        });
    }
}
exports.OffchainLookupSenderMismatchError = OffchainLookupSenderMismatchError;
//# sourceMappingURL=ccip.js.map

/***/ }),

/***/ 73587:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.InvalidChainIdError = exports.ClientChainNotConfiguredError = exports.ChainNotFoundError = exports.ChainMismatchError = exports.ChainDoesNotSupportContract = void 0;
const base_js_1 = __webpack_require__(24437);
class ChainDoesNotSupportContract extends base_js_1.BaseError {
    constructor({ blockNumber, chain, contract, }) {
        super(`Chain "${chain.name}" does not support contract "${contract.name}".`, {
            metaMessages: [
                'This could be due to any of the following:',
                ...(blockNumber &&
                    contract.blockCreated &&
                    contract.blockCreated > blockNumber
                    ? [
                        `- The contract "${contract.name}" was not deployed until block ${contract.blockCreated} (current block ${blockNumber}).`,
                    ]
                    : [
                        `- The chain does not have the contract "${contract.name}" configured.`,
                    ]),
            ],
        });
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'ChainDoesNotSupportContract'
        });
    }
}
exports.ChainDoesNotSupportContract = ChainDoesNotSupportContract;
class ChainMismatchError extends base_js_1.BaseError {
    constructor({ chain, currentChainId, }) {
        super(`The current chain of the wallet (id: ${currentChainId}) does not match the target chain for the transaction (id: ${chain.id} – ${chain.name}).`, {
            metaMessages: [
                `Current Chain ID:  ${currentChainId}`,
                `Expected Chain ID: ${chain.id} – ${chain.name}`,
            ],
        });
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'ChainMismatchError'
        });
    }
}
exports.ChainMismatchError = ChainMismatchError;
class ChainNotFoundError extends base_js_1.BaseError {
    constructor() {
        super([
            'No chain was provided to the request.',
            'Please provide a chain with the `chain` argument on the Action, or by supplying a `chain` to WalletClient.',
        ].join('\n'));
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'ChainNotFoundError'
        });
    }
}
exports.ChainNotFoundError = ChainNotFoundError;
class ClientChainNotConfiguredError extends base_js_1.BaseError {
    constructor() {
        super('No chain was provided to the Client.');
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'ClientChainNotConfiguredError'
        });
    }
}
exports.ClientChainNotConfiguredError = ClientChainNotConfiguredError;
class InvalidChainIdError extends base_js_1.BaseError {
    constructor({ chainId }) {
        super(`Chain ID "${chainId}" is invalid.`);
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'InvalidChainIdError'
        });
    }
}
exports.InvalidChainIdError = InvalidChainIdError;
//# sourceMappingURL=chain.js.map

/***/ }),

/***/ 30474:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.RawContractError = exports.ContractFunctionZeroDataError = exports.ContractFunctionRevertedError = exports.ContractFunctionExecutionError = exports.CallExecutionError = void 0;
const parseAccount_js_1 = __webpack_require__(79429);
const solidity_js_1 = __webpack_require__(83305);
const decodeErrorResult_js_1 = __webpack_require__(33058);
const formatAbiItem_js_1 = __webpack_require__(36859);
const formatAbiItemWithArgs_js_1 = __webpack_require__(75586);
const getAbiItem_js_1 = __webpack_require__(79606);
const formatEther_js_1 = __webpack_require__(83032);
const formatGwei_js_1 = __webpack_require__(89978);
const abi_js_1 = __webpack_require__(5432);
const base_js_1 = __webpack_require__(24437);
const transaction_js_1 = __webpack_require__(83474);
const utils_js_1 = __webpack_require__(61503);
class CallExecutionError extends base_js_1.BaseError {
    constructor(cause, { account: account_, docsPath, chain, data, gas, gasPrice, maxFeePerGas, maxPriorityFeePerGas, nonce, to, value, }) {
        const account = account_ ? (0, parseAccount_js_1.parseAccount)(account_) : undefined;
        const prettyArgs = (0, transaction_js_1.prettyPrint)({
            from: account?.address,
            to,
            value: typeof value !== 'undefined' &&
                `${(0, formatEther_js_1.formatEther)(value)} ${chain?.nativeCurrency?.symbol || 'ETH'}`,
            data,
            gas,
            gasPrice: typeof gasPrice !== 'undefined' && `${(0, formatGwei_js_1.formatGwei)(gasPrice)} gwei`,
            maxFeePerGas: typeof maxFeePerGas !== 'undefined' &&
                `${(0, formatGwei_js_1.formatGwei)(maxFeePerGas)} gwei`,
            maxPriorityFeePerGas: typeof maxPriorityFeePerGas !== 'undefined' &&
                `${(0, formatGwei_js_1.formatGwei)(maxPriorityFeePerGas)} gwei`,
            nonce,
        });
        super(cause.shortMessage, {
            cause,
            docsPath,
            metaMessages: [
                ...(cause.metaMessages ? [...cause.metaMessages, ' '] : []),
                'Raw Call Arguments:',
                prettyArgs,
            ].filter(Boolean),
        });
        Object.defineProperty(this, "cause", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'CallExecutionError'
        });
        this.cause = cause;
    }
}
exports.CallExecutionError = CallExecutionError;
class ContractFunctionExecutionError extends base_js_1.BaseError {
    constructor(cause, { abi, args, contractAddress, docsPath, functionName, sender, }) {
        const abiItem = (0, getAbiItem_js_1.getAbiItem)({ abi, args, name: functionName });
        const formattedArgs = abiItem
            ? (0, formatAbiItemWithArgs_js_1.formatAbiItemWithArgs)({
                abiItem,
                args,
                includeFunctionName: false,
                includeName: false,
            })
            : undefined;
        const functionWithParams = abiItem
            ? (0, formatAbiItem_js_1.formatAbiItem)(abiItem, { includeName: true })
            : undefined;
        const prettyArgs = (0, transaction_js_1.prettyPrint)({
            address: contractAddress && (0, utils_js_1.getContractAddress)(contractAddress),
            function: functionWithParams,
            args: formattedArgs &&
                formattedArgs !== '()' &&
                `${[...Array(functionName?.length ?? 0).keys()]
                    .map(() => ' ')
                    .join('')}${formattedArgs}`,
            sender,
        });
        super(cause.shortMessage ||
            `An unknown error occurred while executing the contract function "${functionName}".`, {
            cause,
            docsPath,
            metaMessages: [
                ...(cause.metaMessages ? [...cause.metaMessages, ' '] : []),
                'Contract Call:',
                prettyArgs,
            ].filter(Boolean),
        });
        Object.defineProperty(this, "abi", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "args", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "cause", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "contractAddress", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "formattedArgs", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "functionName", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "sender", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'ContractFunctionExecutionError'
        });
        this.abi = abi;
        this.args = args;
        this.cause = cause;
        this.contractAddress = contractAddress;
        this.functionName = functionName;
        this.sender = sender;
    }
}
exports.ContractFunctionExecutionError = ContractFunctionExecutionError;
class ContractFunctionRevertedError extends base_js_1.BaseError {
    constructor({ abi, data, functionName, message, }) {
        let cause;
        let decodedData = undefined;
        let metaMessages;
        let reason;
        if (data && data !== '0x') {
            try {
                decodedData = (0, decodeErrorResult_js_1.decodeErrorResult)({ abi, data });
                const { abiItem, errorName, args: errorArgs } = decodedData;
                if (errorName === 'Error') {
                    reason = errorArgs[0];
                }
                else if (errorName === 'Panic') {
                    const [firstArg] = errorArgs;
                    reason = solidity_js_1.panicReasons[firstArg];
                }
                else {
                    const errorWithParams = abiItem
                        ? (0, formatAbiItem_js_1.formatAbiItem)(abiItem, { includeName: true })
                        : undefined;
                    const formattedArgs = abiItem && errorArgs
                        ? (0, formatAbiItemWithArgs_js_1.formatAbiItemWithArgs)({
                            abiItem,
                            args: errorArgs,
                            includeFunctionName: false,
                            includeName: false,
                        })
                        : undefined;
                    metaMessages = [
                        errorWithParams ? `Error: ${errorWithParams}` : '',
                        formattedArgs && formattedArgs !== '()'
                            ? `       ${[...Array(errorName?.length ?? 0).keys()]
                                .map(() => ' ')
                                .join('')}${formattedArgs}`
                            : '',
                    ];
                }
            }
            catch (err) {
                cause = err;
            }
        }
        else if (message)
            reason = message;
        let signature;
        if (cause instanceof abi_js_1.AbiErrorSignatureNotFoundError) {
            signature = cause.signature;
            metaMessages = [
                `Unable to decode signature "${signature}" as it was not found on the provided ABI.`,
                'Make sure you are using the correct ABI and that the error exists on it.',
                `You can look up the decoded signature here: https://openchain.xyz/signatures?query=${signature}.`,
            ];
        }
        super((reason && reason !== 'execution reverted') || signature
            ? [
                `The contract function "${functionName}" reverted with the following ${signature ? 'signature' : 'reason'}:`,
                reason || signature,
            ].join('\n')
            : `The contract function "${functionName}" reverted.`, {
            cause,
            metaMessages,
        });
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'ContractFunctionRevertedError'
        });
        Object.defineProperty(this, "data", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "reason", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "signature", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        this.data = decodedData;
        this.reason = reason;
        this.signature = signature;
    }
}
exports.ContractFunctionRevertedError = ContractFunctionRevertedError;
class ContractFunctionZeroDataError extends base_js_1.BaseError {
    constructor({ functionName }) {
        super(`The contract function "${functionName}" returned no data ("0x").`, {
            metaMessages: [
                'This could be due to any of the following:',
                `  - The contract does not have the function "${functionName}",`,
                '  - The parameters passed to the contract function may be invalid, or',
                '  - The address is not a contract.',
            ],
        });
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'ContractFunctionZeroDataError'
        });
    }
}
exports.ContractFunctionZeroDataError = ContractFunctionZeroDataError;
class RawContractError extends base_js_1.BaseError {
    constructor({ data, message, }) {
        super(message || '');
        Object.defineProperty(this, "code", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 3
        });
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'RawContractError'
        });
        Object.defineProperty(this, "data", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        this.data = data;
    }
}
exports.RawContractError = RawContractError;
//# sourceMappingURL=contract.js.map

/***/ }),

/***/ 97174:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.PositionOutOfBoundsError = exports.NegativeOffsetError = void 0;
const base_js_1 = __webpack_require__(24437);
class NegativeOffsetError extends base_js_1.BaseError {
    constructor({ offset }) {
        super(`Offset \`${offset}\` cannot be negative.`);
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'NegativeOffsetError'
        });
    }
}
exports.NegativeOffsetError = NegativeOffsetError;
class PositionOutOfBoundsError extends base_js_1.BaseError {
    constructor({ length, position }) {
        super(`Position \`${position}\` is out of bounds (\`0 < position < ${length}\`).`);
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'PositionOutOfBoundsError'
        });
    }
}
exports.PositionOutOfBoundsError = PositionOutOfBoundsError;
//# sourceMappingURL=cursor.js.map

/***/ }),

/***/ 34204:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.SizeExceedsPaddingSizeError = exports.SliceOffsetOutOfBoundsError = void 0;
const base_js_1 = __webpack_require__(24437);
class SliceOffsetOutOfBoundsError extends base_js_1.BaseError {
    constructor({ offset, position, size, }) {
        super(`Slice ${position === 'start' ? 'starting' : 'ending'} at offset "${offset}" is out-of-bounds (size: ${size}).`);
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'SliceOffsetOutOfBoundsError'
        });
    }
}
exports.SliceOffsetOutOfBoundsError = SliceOffsetOutOfBoundsError;
class SizeExceedsPaddingSizeError extends base_js_1.BaseError {
    constructor({ size, targetSize, type, }) {
        super(`${type.charAt(0).toUpperCase()}${type
            .slice(1)
            .toLowerCase()} size (${size}) exceeds padding size (${targetSize}).`);
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'SizeExceedsPaddingSizeError'
        });
    }
}
exports.SizeExceedsPaddingSizeError = SizeExceedsPaddingSizeError;
//# sourceMappingURL=data.js.map

/***/ }),

/***/ 21329:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.SizeOverflowError = exports.OffsetOutOfBoundsError = exports.InvalidHexValueError = exports.InvalidHexBooleanError = exports.InvalidBytesBooleanError = exports.IntegerOutOfRangeError = exports.DataLengthTooShortError = exports.DataLengthTooLongError = void 0;
const base_js_1 = __webpack_require__(24437);
class DataLengthTooLongError extends base_js_1.BaseError {
    constructor({ consumed, length }) {
        super(`Consumed bytes (${consumed}) is shorter than data length (${length - 1}).`);
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'DataLengthTooLongError'
        });
    }
}
exports.DataLengthTooLongError = DataLengthTooLongError;
class DataLengthTooShortError extends base_js_1.BaseError {
    constructor({ length, dataLength }) {
        super(`Data length (${dataLength - 1}) is shorter than consumed bytes length (${length - 1}).`);
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'DataLengthTooShortError'
        });
    }
}
exports.DataLengthTooShortError = DataLengthTooShortError;
class IntegerOutOfRangeError extends base_js_1.BaseError {
    constructor({ max, min, signed, size, value, }) {
        super(`Number "${value}" is not in safe ${size ? `${size * 8}-bit ${signed ? 'signed' : 'unsigned'} ` : ''}integer range ${max ? `(${min} to ${max})` : `(above ${min})`}`);
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'IntegerOutOfRangeError'
        });
    }
}
exports.IntegerOutOfRangeError = IntegerOutOfRangeError;
class InvalidBytesBooleanError extends base_js_1.BaseError {
    constructor(bytes) {
        super(`Bytes value "${bytes}" is not a valid boolean. The bytes array must contain a single byte of either a 0 or 1 value.`);
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'InvalidBytesBooleanError'
        });
    }
}
exports.InvalidBytesBooleanError = InvalidBytesBooleanError;
class InvalidHexBooleanError extends base_js_1.BaseError {
    constructor(hex) {
        super(`Hex value "${hex}" is not a valid boolean. The hex value must be "0x0" (false) or "0x1" (true).`);
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'InvalidHexBooleanError'
        });
    }
}
exports.InvalidHexBooleanError = InvalidHexBooleanError;
class InvalidHexValueError extends base_js_1.BaseError {
    constructor(value) {
        super(`Hex value "${value}" is an odd length (${value.length}). It must be an even length.`);
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'InvalidHexValueError'
        });
    }
}
exports.InvalidHexValueError = InvalidHexValueError;
class OffsetOutOfBoundsError extends base_js_1.BaseError {
    constructor({ nextOffset, offset }) {
        super(`Next offset (${nextOffset}) is greater than previous offset + consumed bytes (${offset})`);
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'OffsetOutOfBoundsError'
        });
    }
}
exports.OffsetOutOfBoundsError = OffsetOutOfBoundsError;
class SizeOverflowError extends base_js_1.BaseError {
    constructor({ givenSize, maxSize }) {
        super(`Size cannot exceed ${maxSize} bytes. Given size: ${givenSize} bytes.`);
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'SizeOverflowError'
        });
    }
}
exports.SizeOverflowError = SizeOverflowError;
//# sourceMappingURL=encoding.js.map

/***/ }),

/***/ 44770:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.EnsAvatarUnsupportedNamespaceError = exports.EnsAvatarUriResolutionError = exports.EnsAvatarInvalidNftUriError = exports.EnsAvatarInvalidMetadataError = void 0;
const base_js_1 = __webpack_require__(24437);
class EnsAvatarInvalidMetadataError extends base_js_1.BaseError {
    constructor({ data }) {
        super('Unable to extract image from metadata. The metadata may be malformed or invalid.', {
            metaMessages: [
                '- Metadata must be a JSON object with at least an `image`, `image_url` or `image_data` property.',
                '',
                `Provided data: ${JSON.stringify(data)}`,
            ],
        });
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'EnsAvatarInvalidMetadataError'
        });
    }
}
exports.EnsAvatarInvalidMetadataError = EnsAvatarInvalidMetadataError;
class EnsAvatarInvalidNftUriError extends base_js_1.BaseError {
    constructor({ reason }) {
        super(`ENS NFT avatar URI is invalid. ${reason}`);
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'EnsAvatarInvalidNftUriError'
        });
    }
}
exports.EnsAvatarInvalidNftUriError = EnsAvatarInvalidNftUriError;
class EnsAvatarUriResolutionError extends base_js_1.BaseError {
    constructor({ uri }) {
        super(`Unable to resolve ENS avatar URI "${uri}". The URI may be malformed, invalid, or does not respond with a valid image.`);
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'EnsAvatarUriResolutionError'
        });
    }
}
exports.EnsAvatarUriResolutionError = EnsAvatarUriResolutionError;
class EnsAvatarUnsupportedNamespaceError extends base_js_1.BaseError {
    constructor({ namespace }) {
        super(`ENS NFT avatar namespace "${namespace}" is not supported. Must be "erc721" or "erc1155".`);
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'EnsAvatarUnsupportedNamespaceError'
        });
    }
}
exports.EnsAvatarUnsupportedNamespaceError = EnsAvatarUnsupportedNamespaceError;
//# sourceMappingURL=ens.js.map

/***/ }),

/***/ 7029:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.EstimateGasExecutionError = void 0;
const formatEther_js_1 = __webpack_require__(83032);
const formatGwei_js_1 = __webpack_require__(89978);
const base_js_1 = __webpack_require__(24437);
const transaction_js_1 = __webpack_require__(83474);
class EstimateGasExecutionError extends base_js_1.BaseError {
    constructor(cause, { account, docsPath, chain, data, gas, gasPrice, maxFeePerGas, maxPriorityFeePerGas, nonce, to, value, }) {
        const prettyArgs = (0, transaction_js_1.prettyPrint)({
            from: account?.address,
            to,
            value: typeof value !== 'undefined' &&
                `${(0, formatEther_js_1.formatEther)(value)} ${chain?.nativeCurrency?.symbol || 'ETH'}`,
            data,
            gas,
            gasPrice: typeof gasPrice !== 'undefined' && `${(0, formatGwei_js_1.formatGwei)(gasPrice)} gwei`,
            maxFeePerGas: typeof maxFeePerGas !== 'undefined' &&
                `${(0, formatGwei_js_1.formatGwei)(maxFeePerGas)} gwei`,
            maxPriorityFeePerGas: typeof maxPriorityFeePerGas !== 'undefined' &&
                `${(0, formatGwei_js_1.formatGwei)(maxPriorityFeePerGas)} gwei`,
            nonce,
        });
        super(cause.shortMessage, {
            cause,
            docsPath,
            metaMessages: [
                ...(cause.metaMessages ? [...cause.metaMessages, ' '] : []),
                'Estimate Gas Arguments:',
                prettyArgs,
            ].filter(Boolean),
        });
        Object.defineProperty(this, "cause", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'EstimateGasExecutionError'
        });
        this.cause = cause;
    }
}
exports.EstimateGasExecutionError = EstimateGasExecutionError;
//# sourceMappingURL=estimateGas.js.map

/***/ }),

/***/ 16422:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.MaxFeePerGasTooLowError = exports.Eip1559FeesNotSupportedError = exports.BaseFeeScalarError = void 0;
const formatGwei_js_1 = __webpack_require__(89978);
const base_js_1 = __webpack_require__(24437);
class BaseFeeScalarError extends base_js_1.BaseError {
    constructor() {
        super('`baseFeeMultiplier` must be greater than 1.');
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'BaseFeeScalarError'
        });
    }
}
exports.BaseFeeScalarError = BaseFeeScalarError;
class Eip1559FeesNotSupportedError extends base_js_1.BaseError {
    constructor() {
        super('Chain does not support EIP-1559 fees.');
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'Eip1559FeesNotSupportedError'
        });
    }
}
exports.Eip1559FeesNotSupportedError = Eip1559FeesNotSupportedError;
class MaxFeePerGasTooLowError extends base_js_1.BaseError {
    constructor({ maxPriorityFeePerGas }) {
        super(`\`maxFeePerGas\` cannot be less than the \`maxPriorityFeePerGas\` (${(0, formatGwei_js_1.formatGwei)(maxPriorityFeePerGas)} gwei).`);
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'MaxFeePerGasTooLowError'
        });
    }
}
exports.MaxFeePerGasTooLowError = MaxFeePerGasTooLowError;
//# sourceMappingURL=fee.js.map

/***/ }),

/***/ 9780:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.FilterTypeNotSupportedError = void 0;
const base_js_1 = __webpack_require__(24437);
class FilterTypeNotSupportedError extends base_js_1.BaseError {
    constructor(type) {
        super(`Filter type "${type}" is not supported.`);
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'FilterTypeNotSupportedError'
        });
    }
}
exports.FilterTypeNotSupportedError = FilterTypeNotSupportedError;
//# sourceMappingURL=log.js.map

/***/ }),

/***/ 20420:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.UnknownNodeError = exports.TipAboveFeeCapError = exports.TransactionTypeNotSupportedError = exports.IntrinsicGasTooLowError = exports.IntrinsicGasTooHighError = exports.InsufficientFundsError = exports.NonceMaxValueError = exports.NonceTooLowError = exports.NonceTooHighError = exports.FeeCapTooLowError = exports.FeeCapTooHighError = exports.ExecutionRevertedError = void 0;
const formatGwei_js_1 = __webpack_require__(89978);
const base_js_1 = __webpack_require__(24437);
class ExecutionRevertedError extends base_js_1.BaseError {
    constructor({ cause, message, } = {}) {
        const reason = message
            ?.replace('execution reverted: ', '')
            ?.replace('execution reverted', '');
        super(`Execution reverted ${reason ? `with reason: ${reason}` : 'for an unknown reason'}.`, {
            cause,
        });
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'ExecutionRevertedError'
        });
    }
}
Object.defineProperty(ExecutionRevertedError, "code", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: 3
});
Object.defineProperty(ExecutionRevertedError, "nodeMessage", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: /execution reverted/
});
exports.ExecutionRevertedError = ExecutionRevertedError;
class FeeCapTooHighError extends base_js_1.BaseError {
    constructor({ cause, maxFeePerGas, } = {}) {
        super(`The fee cap (\`maxFeePerGas\`${maxFeePerGas ? ` = ${(0, formatGwei_js_1.formatGwei)(maxFeePerGas)} gwei` : ''}) cannot be higher than the maximum allowed value (2^256-1).`, {
            cause,
        });
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'FeeCapTooHigh'
        });
    }
}
Object.defineProperty(FeeCapTooHighError, "nodeMessage", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: /max fee per gas higher than 2\^256-1|fee cap higher than 2\^256-1/
});
exports.FeeCapTooHighError = FeeCapTooHighError;
class FeeCapTooLowError extends base_js_1.BaseError {
    constructor({ cause, maxFeePerGas, } = {}) {
        super(`The fee cap (\`maxFeePerGas\`${maxFeePerGas ? ` = ${(0, formatGwei_js_1.formatGwei)(maxFeePerGas)}` : ''} gwei) cannot be lower than the block base fee.`, {
            cause,
        });
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'FeeCapTooLow'
        });
    }
}
Object.defineProperty(FeeCapTooLowError, "nodeMessage", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: /max fee per gas less than block base fee|fee cap less than block base fee|transaction is outdated/
});
exports.FeeCapTooLowError = FeeCapTooLowError;
class NonceTooHighError extends base_js_1.BaseError {
    constructor({ cause, nonce } = {}) {
        super(`Nonce provided for the transaction ${nonce ? `(${nonce}) ` : ''}is higher than the next one expected.`, { cause });
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'NonceTooHighError'
        });
    }
}
Object.defineProperty(NonceTooHighError, "nodeMessage", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: /nonce too high/
});
exports.NonceTooHighError = NonceTooHighError;
class NonceTooLowError extends base_js_1.BaseError {
    constructor({ cause, nonce } = {}) {
        super([
            `Nonce provided for the transaction ${nonce ? `(${nonce}) ` : ''}is lower than the current nonce of the account.`,
            'Try increasing the nonce or find the latest nonce with `getTransactionCount`.',
        ].join('\n'), { cause });
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'NonceTooLowError'
        });
    }
}
Object.defineProperty(NonceTooLowError, "nodeMessage", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: /nonce too low|transaction already imported|already known/
});
exports.NonceTooLowError = NonceTooLowError;
class NonceMaxValueError extends base_js_1.BaseError {
    constructor({ cause, nonce } = {}) {
        super(`Nonce provided for the transaction ${nonce ? `(${nonce}) ` : ''}exceeds the maximum allowed nonce.`, { cause });
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'NonceMaxValueError'
        });
    }
}
Object.defineProperty(NonceMaxValueError, "nodeMessage", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: /nonce has max value/
});
exports.NonceMaxValueError = NonceMaxValueError;
class InsufficientFundsError extends base_js_1.BaseError {
    constructor({ cause } = {}) {
        super([
            'The total cost (gas * gas fee + value) of executing this transaction exceeds the balance of the account.',
        ].join('\n'), {
            cause,
            metaMessages: [
                'This error could arise when the account does not have enough funds to:',
                ' - pay for the total gas fee,',
                ' - pay for the value to send.',
                ' ',
                'The cost of the transaction is calculated as `gas * gas fee + value`, where:',
                ' - `gas` is the amount of gas needed for transaction to execute,',
                ' - `gas fee` is the gas fee,',
                ' - `value` is the amount of ether to send to the recipient.',
            ],
        });
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'InsufficientFundsError'
        });
    }
}
Object.defineProperty(InsufficientFundsError, "nodeMessage", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: /insufficient funds/
});
exports.InsufficientFundsError = InsufficientFundsError;
class IntrinsicGasTooHighError extends base_js_1.BaseError {
    constructor({ cause, gas } = {}) {
        super(`The amount of gas ${gas ? `(${gas}) ` : ''}provided for the transaction exceeds the limit allowed for the block.`, {
            cause,
        });
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'IntrinsicGasTooHighError'
        });
    }
}
Object.defineProperty(IntrinsicGasTooHighError, "nodeMessage", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: /intrinsic gas too high|gas limit reached/
});
exports.IntrinsicGasTooHighError = IntrinsicGasTooHighError;
class IntrinsicGasTooLowError extends base_js_1.BaseError {
    constructor({ cause, gas } = {}) {
        super(`The amount of gas ${gas ? `(${gas}) ` : ''}provided for the transaction is too low.`, {
            cause,
        });
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'IntrinsicGasTooLowError'
        });
    }
}
Object.defineProperty(IntrinsicGasTooLowError, "nodeMessage", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: /intrinsic gas too low/
});
exports.IntrinsicGasTooLowError = IntrinsicGasTooLowError;
class TransactionTypeNotSupportedError extends base_js_1.BaseError {
    constructor({ cause }) {
        super('The transaction type is not supported for this chain.', {
            cause,
        });
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'TransactionTypeNotSupportedError'
        });
    }
}
Object.defineProperty(TransactionTypeNotSupportedError, "nodeMessage", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: /transaction type not valid/
});
exports.TransactionTypeNotSupportedError = TransactionTypeNotSupportedError;
class TipAboveFeeCapError extends base_js_1.BaseError {
    constructor({ cause, maxPriorityFeePerGas, maxFeePerGas, } = {}) {
        super([
            `The provided tip (\`maxPriorityFeePerGas\`${maxPriorityFeePerGas
                ? ` = ${(0, formatGwei_js_1.formatGwei)(maxPriorityFeePerGas)} gwei`
                : ''}) cannot be higher than the fee cap (\`maxFeePerGas\`${maxFeePerGas ? ` = ${(0, formatGwei_js_1.formatGwei)(maxFeePerGas)} gwei` : ''}).`,
        ].join('\n'), {
            cause,
        });
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'TipAboveFeeCapError'
        });
    }
}
Object.defineProperty(TipAboveFeeCapError, "nodeMessage", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: /max priority fee per gas higher than max fee per gas|tip higher than fee cap/
});
exports.TipAboveFeeCapError = TipAboveFeeCapError;
class UnknownNodeError extends base_js_1.BaseError {
    constructor({ cause }) {
        super(`An error occurred while executing: ${cause?.shortMessage}`, {
            cause,
        });
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'UnknownNodeError'
        });
    }
}
exports.UnknownNodeError = UnknownNodeError;
//# sourceMappingURL=node.js.map

/***/ }),

/***/ 80767:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.TimeoutError = exports.RpcRequestError = exports.WebSocketRequestError = exports.HttpRequestError = void 0;
const stringify_js_1 = __webpack_require__(68395);
const base_js_1 = __webpack_require__(24437);
const utils_js_1 = __webpack_require__(61503);
class HttpRequestError extends base_js_1.BaseError {
    constructor({ body, details, headers, status, url, }) {
        super('HTTP request failed.', {
            details,
            metaMessages: [
                status && `Status: ${status}`,
                `URL: ${(0, utils_js_1.getUrl)(url)}`,
                body && `Request body: ${(0, stringify_js_1.stringify)(body)}`,
            ].filter(Boolean),
        });
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'HttpRequestError'
        });
        Object.defineProperty(this, "body", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "headers", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "status", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "url", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        this.body = body;
        this.headers = headers;
        this.status = status;
        this.url = url;
    }
}
exports.HttpRequestError = HttpRequestError;
class WebSocketRequestError extends base_js_1.BaseError {
    constructor({ body, details, url, }) {
        super('WebSocket request failed.', {
            details,
            metaMessages: [`URL: ${(0, utils_js_1.getUrl)(url)}`, `Request body: ${(0, stringify_js_1.stringify)(body)}`],
        });
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'WebSocketRequestError'
        });
    }
}
exports.WebSocketRequestError = WebSocketRequestError;
class RpcRequestError extends base_js_1.BaseError {
    constructor({ body, error, url, }) {
        super('RPC Request failed.', {
            cause: error,
            details: error.message,
            metaMessages: [`URL: ${(0, utils_js_1.getUrl)(url)}`, `Request body: ${(0, stringify_js_1.stringify)(body)}`],
        });
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'RpcRequestError'
        });
        Object.defineProperty(this, "code", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        this.code = error.code;
    }
}
exports.RpcRequestError = RpcRequestError;
class TimeoutError extends base_js_1.BaseError {
    constructor({ body, url, }) {
        super('The request took too long to respond.', {
            details: 'The request timed out.',
            metaMessages: [`URL: ${(0, utils_js_1.getUrl)(url)}`, `Request body: ${(0, stringify_js_1.stringify)(body)}`],
        });
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'TimeoutError'
        });
    }
}
exports.TimeoutError = TimeoutError;
//# sourceMappingURL=request.js.map

/***/ }),

/***/ 36549:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.UnknownRpcError = exports.SwitchChainError = exports.ChainDisconnectedError = exports.ProviderDisconnectedError = exports.UnsupportedProviderMethodError = exports.UnauthorizedProviderError = exports.UserRejectedRequestError = exports.JsonRpcVersionUnsupportedError = exports.LimitExceededRpcError = exports.MethodNotSupportedRpcError = exports.TransactionRejectedRpcError = exports.ResourceUnavailableRpcError = exports.ResourceNotFoundRpcError = exports.InvalidInputRpcError = exports.InternalRpcError = exports.InvalidParamsRpcError = exports.MethodNotFoundRpcError = exports.InvalidRequestRpcError = exports.ParseRpcError = exports.ProviderRpcError = exports.RpcError = void 0;
const base_js_1 = __webpack_require__(24437);
const request_js_1 = __webpack_require__(80767);
const unknownErrorCode = -1;
class RpcError extends base_js_1.BaseError {
    constructor(cause, { code, docsPath, metaMessages, shortMessage }) {
        super(shortMessage, {
            cause,
            docsPath,
            metaMessages: metaMessages || cause?.metaMessages,
        });
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'RpcError'
        });
        Object.defineProperty(this, "code", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        this.name = cause.name;
        this.code = (cause instanceof request_js_1.RpcRequestError ? cause.code : code ?? unknownErrorCode);
    }
}
exports.RpcError = RpcError;
class ProviderRpcError extends RpcError {
    constructor(cause, options) {
        super(cause, options);
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'ProviderRpcError'
        });
        Object.defineProperty(this, "data", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        this.data = options.data;
    }
}
exports.ProviderRpcError = ProviderRpcError;
class ParseRpcError extends RpcError {
    constructor(cause) {
        super(cause, {
            code: ParseRpcError.code,
            shortMessage: 'Invalid JSON was received by the server. An error occurred on the server while parsing the JSON text.',
        });
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'ParseRpcError'
        });
    }
}
Object.defineProperty(ParseRpcError, "code", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: -32700
});
exports.ParseRpcError = ParseRpcError;
class InvalidRequestRpcError extends RpcError {
    constructor(cause) {
        super(cause, {
            code: InvalidRequestRpcError.code,
            shortMessage: 'JSON is not a valid request object.',
        });
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'InvalidRequestRpcError'
        });
    }
}
Object.defineProperty(InvalidRequestRpcError, "code", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: -32600
});
exports.InvalidRequestRpcError = InvalidRequestRpcError;
class MethodNotFoundRpcError extends RpcError {
    constructor(cause) {
        super(cause, {
            code: MethodNotFoundRpcError.code,
            shortMessage: 'The method does not exist / is not available.',
        });
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'MethodNotFoundRpcError'
        });
    }
}
Object.defineProperty(MethodNotFoundRpcError, "code", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: -32601
});
exports.MethodNotFoundRpcError = MethodNotFoundRpcError;
class InvalidParamsRpcError extends RpcError {
    constructor(cause) {
        super(cause, {
            code: InvalidParamsRpcError.code,
            shortMessage: [
                'Invalid parameters were provided to the RPC method.',
                'Double check you have provided the correct parameters.',
            ].join('\n'),
        });
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'InvalidParamsRpcError'
        });
    }
}
Object.defineProperty(InvalidParamsRpcError, "code", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: -32602
});
exports.InvalidParamsRpcError = InvalidParamsRpcError;
class InternalRpcError extends RpcError {
    constructor(cause) {
        super(cause, {
            code: InternalRpcError.code,
            shortMessage: 'An internal error was received.',
        });
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'InternalRpcError'
        });
    }
}
Object.defineProperty(InternalRpcError, "code", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: -32603
});
exports.InternalRpcError = InternalRpcError;
class InvalidInputRpcError extends RpcError {
    constructor(cause) {
        super(cause, {
            code: InvalidInputRpcError.code,
            shortMessage: [
                'Missing or invalid parameters.',
                'Double check you have provided the correct parameters.',
            ].join('\n'),
        });
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'InvalidInputRpcError'
        });
    }
}
Object.defineProperty(InvalidInputRpcError, "code", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: -32000
});
exports.InvalidInputRpcError = InvalidInputRpcError;
class ResourceNotFoundRpcError extends RpcError {
    constructor(cause) {
        super(cause, {
            code: ResourceNotFoundRpcError.code,
            shortMessage: 'Requested resource not found.',
        });
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'ResourceNotFoundRpcError'
        });
    }
}
Object.defineProperty(ResourceNotFoundRpcError, "code", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: -32001
});
exports.ResourceNotFoundRpcError = ResourceNotFoundRpcError;
class ResourceUnavailableRpcError extends RpcError {
    constructor(cause) {
        super(cause, {
            code: ResourceUnavailableRpcError.code,
            shortMessage: 'Requested resource not available.',
        });
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'ResourceUnavailableRpcError'
        });
    }
}
Object.defineProperty(ResourceUnavailableRpcError, "code", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: -32002
});
exports.ResourceUnavailableRpcError = ResourceUnavailableRpcError;
class TransactionRejectedRpcError extends RpcError {
    constructor(cause) {
        super(cause, {
            code: TransactionRejectedRpcError.code,
            shortMessage: 'Transaction creation failed.',
        });
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'TransactionRejectedRpcError'
        });
    }
}
Object.defineProperty(TransactionRejectedRpcError, "code", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: -32003
});
exports.TransactionRejectedRpcError = TransactionRejectedRpcError;
class MethodNotSupportedRpcError extends RpcError {
    constructor(cause) {
        super(cause, {
            code: MethodNotSupportedRpcError.code,
            shortMessage: 'Method is not implemented.',
        });
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'MethodNotSupportedRpcError'
        });
    }
}
Object.defineProperty(MethodNotSupportedRpcError, "code", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: -32004
});
exports.MethodNotSupportedRpcError = MethodNotSupportedRpcError;
class LimitExceededRpcError extends RpcError {
    constructor(cause) {
        super(cause, {
            code: LimitExceededRpcError.code,
            shortMessage: 'Request exceeds defined limit.',
        });
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'LimitExceededRpcError'
        });
    }
}
Object.defineProperty(LimitExceededRpcError, "code", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: -32005
});
exports.LimitExceededRpcError = LimitExceededRpcError;
class JsonRpcVersionUnsupportedError extends RpcError {
    constructor(cause) {
        super(cause, {
            code: JsonRpcVersionUnsupportedError.code,
            shortMessage: 'Version of JSON-RPC protocol is not supported.',
        });
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'JsonRpcVersionUnsupportedError'
        });
    }
}
Object.defineProperty(JsonRpcVersionUnsupportedError, "code", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: -32006
});
exports.JsonRpcVersionUnsupportedError = JsonRpcVersionUnsupportedError;
class UserRejectedRequestError extends ProviderRpcError {
    constructor(cause) {
        super(cause, {
            code: UserRejectedRequestError.code,
            shortMessage: 'User rejected the request.',
        });
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'UserRejectedRequestError'
        });
    }
}
Object.defineProperty(UserRejectedRequestError, "code", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: 4001
});
exports.UserRejectedRequestError = UserRejectedRequestError;
class UnauthorizedProviderError extends ProviderRpcError {
    constructor(cause) {
        super(cause, {
            code: UnauthorizedProviderError.code,
            shortMessage: 'The requested method and/or account has not been authorized by the user.',
        });
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'UnauthorizedProviderError'
        });
    }
}
Object.defineProperty(UnauthorizedProviderError, "code", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: 4100
});
exports.UnauthorizedProviderError = UnauthorizedProviderError;
class UnsupportedProviderMethodError extends ProviderRpcError {
    constructor(cause) {
        super(cause, {
            code: UnsupportedProviderMethodError.code,
            shortMessage: 'The Provider does not support the requested method.',
        });
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'UnsupportedProviderMethodError'
        });
    }
}
Object.defineProperty(UnsupportedProviderMethodError, "code", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: 4200
});
exports.UnsupportedProviderMethodError = UnsupportedProviderMethodError;
class ProviderDisconnectedError extends ProviderRpcError {
    constructor(cause) {
        super(cause, {
            code: ProviderDisconnectedError.code,
            shortMessage: 'The Provider is disconnected from all chains.',
        });
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'ProviderDisconnectedError'
        });
    }
}
Object.defineProperty(ProviderDisconnectedError, "code", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: 4900
});
exports.ProviderDisconnectedError = ProviderDisconnectedError;
class ChainDisconnectedError extends ProviderRpcError {
    constructor(cause) {
        super(cause, {
            code: ChainDisconnectedError.code,
            shortMessage: 'The Provider is not connected to the requested chain.',
        });
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'ChainDisconnectedError'
        });
    }
}
Object.defineProperty(ChainDisconnectedError, "code", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: 4901
});
exports.ChainDisconnectedError = ChainDisconnectedError;
class SwitchChainError extends ProviderRpcError {
    constructor(cause) {
        super(cause, {
            code: SwitchChainError.code,
            shortMessage: 'An error occurred when attempting to switch chain.',
        });
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'SwitchChainError'
        });
    }
}
Object.defineProperty(SwitchChainError, "code", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: 4902
});
exports.SwitchChainError = SwitchChainError;
class UnknownRpcError extends RpcError {
    constructor(cause) {
        super(cause, {
            shortMessage: 'An unknown RPC error occurred.',
        });
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'UnknownRpcError'
        });
    }
}
exports.UnknownRpcError = UnknownRpcError;
//# sourceMappingURL=rpc.js.map

/***/ }),

/***/ 83474:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.WaitForTransactionReceiptTimeoutError = exports.TransactionReceiptNotFoundError = exports.TransactionNotFoundError = exports.TransactionExecutionError = exports.InvalidStorageKeySizeError = exports.InvalidSerializedTransactionError = exports.InvalidSerializedTransactionTypeError = exports.InvalidSerializableTransactionError = exports.InvalidLegacyVError = exports.FeeConflictError = exports.prettyPrint = void 0;
const formatEther_js_1 = __webpack_require__(83032);
const formatGwei_js_1 = __webpack_require__(89978);
const base_js_1 = __webpack_require__(24437);
function prettyPrint(args) {
    const entries = Object.entries(args)
        .map(([key, value]) => {
        if (value === undefined || value === false)
            return null;
        return [key, value];
    })
        .filter(Boolean);
    const maxLength = entries.reduce((acc, [key]) => Math.max(acc, key.length), 0);
    return entries
        .map(([key, value]) => `  ${`${key}:`.padEnd(maxLength + 1)}  ${value}`)
        .join('\n');
}
exports.prettyPrint = prettyPrint;
class FeeConflictError extends base_js_1.BaseError {
    constructor() {
        super([
            'Cannot specify both a `gasPrice` and a `maxFeePerGas`/`maxPriorityFeePerGas`.',
            'Use `maxFeePerGas`/`maxPriorityFeePerGas` for EIP-1559 compatible networks, and `gasPrice` for others.',
        ].join('\n'));
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'FeeConflictError'
        });
    }
}
exports.FeeConflictError = FeeConflictError;
class InvalidLegacyVError extends base_js_1.BaseError {
    constructor({ v }) {
        super(`Invalid \`v\` value "${v}". Expected 27 or 28.`);
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'InvalidLegacyVError'
        });
    }
}
exports.InvalidLegacyVError = InvalidLegacyVError;
class InvalidSerializableTransactionError extends base_js_1.BaseError {
    constructor({ transaction }) {
        super('Cannot infer a transaction type from provided transaction.', {
            metaMessages: [
                'Provided Transaction:',
                '{',
                prettyPrint(transaction),
                '}',
                '',
                'To infer the type, either provide:',
                '- a `type` to the Transaction, or',
                '- an EIP-1559 Transaction with `maxFeePerGas`, or',
                '- an EIP-2930 Transaction with `gasPrice` & `accessList`, or',
                '- a Legacy Transaction with `gasPrice`',
            ],
        });
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'InvalidSerializableTransactionError'
        });
    }
}
exports.InvalidSerializableTransactionError = InvalidSerializableTransactionError;
class InvalidSerializedTransactionTypeError extends base_js_1.BaseError {
    constructor({ serializedType }) {
        super(`Serialized transaction type "${serializedType}" is invalid.`);
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'InvalidSerializedTransactionType'
        });
        Object.defineProperty(this, "serializedType", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        this.serializedType = serializedType;
    }
}
exports.InvalidSerializedTransactionTypeError = InvalidSerializedTransactionTypeError;
class InvalidSerializedTransactionError extends base_js_1.BaseError {
    constructor({ attributes, serializedTransaction, type, }) {
        const missing = Object.entries(attributes)
            .map(([key, value]) => (typeof value === 'undefined' ? key : undefined))
            .filter(Boolean);
        super(`Invalid serialized transaction of type "${type}" was provided.`, {
            metaMessages: [
                `Serialized Transaction: "${serializedTransaction}"`,
                missing.length > 0 ? `Missing Attributes: ${missing.join(', ')}` : '',
            ].filter(Boolean),
        });
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'InvalidSerializedTransactionError'
        });
        Object.defineProperty(this, "serializedTransaction", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "type", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        this.serializedTransaction = serializedTransaction;
        this.type = type;
    }
}
exports.InvalidSerializedTransactionError = InvalidSerializedTransactionError;
class InvalidStorageKeySizeError extends base_js_1.BaseError {
    constructor({ storageKey }) {
        super(`Size for storage key "${storageKey}" is invalid. Expected 32 bytes. Got ${Math.floor((storageKey.length - 2) / 2)} bytes.`);
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'InvalidStorageKeySizeError'
        });
    }
}
exports.InvalidStorageKeySizeError = InvalidStorageKeySizeError;
class TransactionExecutionError extends base_js_1.BaseError {
    constructor(cause, { account, docsPath, chain, data, gas, gasPrice, maxFeePerGas, maxPriorityFeePerGas, nonce, to, value, }) {
        const prettyArgs = prettyPrint({
            chain: chain && `${chain?.name} (id: ${chain?.id})`,
            from: account?.address,
            to,
            value: typeof value !== 'undefined' &&
                `${(0, formatEther_js_1.formatEther)(value)} ${chain?.nativeCurrency?.symbol || 'ETH'}`,
            data,
            gas,
            gasPrice: typeof gasPrice !== 'undefined' && `${(0, formatGwei_js_1.formatGwei)(gasPrice)} gwei`,
            maxFeePerGas: typeof maxFeePerGas !== 'undefined' &&
                `${(0, formatGwei_js_1.formatGwei)(maxFeePerGas)} gwei`,
            maxPriorityFeePerGas: typeof maxPriorityFeePerGas !== 'undefined' &&
                `${(0, formatGwei_js_1.formatGwei)(maxPriorityFeePerGas)} gwei`,
            nonce,
        });
        super(cause.shortMessage, {
            cause,
            docsPath,
            metaMessages: [
                ...(cause.metaMessages ? [...cause.metaMessages, ' '] : []),
                'Request Arguments:',
                prettyArgs,
            ].filter(Boolean),
        });
        Object.defineProperty(this, "cause", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'TransactionExecutionError'
        });
        this.cause = cause;
    }
}
exports.TransactionExecutionError = TransactionExecutionError;
class TransactionNotFoundError extends base_js_1.BaseError {
    constructor({ blockHash, blockNumber, blockTag, hash, index, }) {
        let identifier = 'Transaction';
        if (blockTag && index !== undefined)
            identifier = `Transaction at block time "${blockTag}" at index "${index}"`;
        if (blockHash && index !== undefined)
            identifier = `Transaction at block hash "${blockHash}" at index "${index}"`;
        if (blockNumber && index !== undefined)
            identifier = `Transaction at block number "${blockNumber}" at index "${index}"`;
        if (hash)
            identifier = `Transaction with hash "${hash}"`;
        super(`${identifier} could not be found.`);
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'TransactionNotFoundError'
        });
    }
}
exports.TransactionNotFoundError = TransactionNotFoundError;
class TransactionReceiptNotFoundError extends base_js_1.BaseError {
    constructor({ hash }) {
        super(`Transaction receipt with hash "${hash}" could not be found. The Transaction may not be processed on a block yet.`);
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'TransactionReceiptNotFoundError'
        });
    }
}
exports.TransactionReceiptNotFoundError = TransactionReceiptNotFoundError;
class WaitForTransactionReceiptTimeoutError extends base_js_1.BaseError {
    constructor({ hash }) {
        super(`Timed out while waiting for transaction with hash "${hash}" to be confirmed.`);
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'WaitForTransactionReceiptTimeoutError'
        });
    }
}
exports.WaitForTransactionReceiptTimeoutError = WaitForTransactionReceiptTimeoutError;
//# sourceMappingURL=transaction.js.map

/***/ }),

/***/ 2659:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.UrlRequiredError = void 0;
const base_js_1 = __webpack_require__(24437);
class UrlRequiredError extends base_js_1.BaseError {
    constructor() {
        super('No URL was provided to the Transport. Please provide a valid RPC URL to the Transport.', {
            docsPath: '/docs/clients/intro',
        });
    }
}
exports.UrlRequiredError = UrlRequiredError;
//# sourceMappingURL=transport.js.map

/***/ }),

/***/ 61503:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getVersion = exports.getUrl = exports.getContractAddress = void 0;
const version_js_1 = __webpack_require__(47130);
const getContractAddress = (address) => address;
exports.getContractAddress = getContractAddress;
const getUrl = (url) => url;
exports.getUrl = getUrl;
const getVersion = () => `viem@${version_js_1.version}`;
exports.getVersion = getVersion;
//# sourceMappingURL=utils.js.map

/***/ }),

/***/ 47130:
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.version = void 0;
exports.version = '1.21.3';
//# sourceMappingURL=version.js.map

/***/ }),

/***/ 26244:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.maxInt112 = exports.maxInt104 = exports.maxInt96 = exports.maxInt88 = exports.maxInt80 = exports.maxInt72 = exports.maxInt64 = exports.maxInt56 = exports.maxInt48 = exports.maxInt40 = exports.maxInt32 = exports.maxInt24 = exports.maxInt16 = exports.maxInt8 = exports.weiUnits = exports.gweiUnits = exports.etherUnits = exports.zeroAddress = exports.multicall3Abi = exports.webSocket = exports.createWalletClient = exports.createTransport = exports.walletActions = exports.testActions = exports.publicActions = exports.createTestClient = exports.createPublicClient = exports.http = exports.fallback = exports.custom = exports.createClient = exports.getContract = exports.parseAbiParameters = exports.parseAbiParameter = exports.parseAbiItem = exports.parseAbi = exports.UnknownSignatureError = exports.UnknownTypeError = exports.SolidityProtectedKeywordError = exports.InvalidStructSignatureError = exports.InvalidSignatureError = exports.InvalidParenthesisError = exports.InvalidParameterError = exports.InvalidModifierError = exports.InvalidFunctionModifierError = exports.InvalidAbiTypeParameterError = exports.InvalidAbiItemError = exports.InvalidAbiParametersError = exports.InvalidAbiParameterError = exports.CircularReferenceError = void 0;
exports.maxUint256 = exports.maxUint248 = exports.maxUint240 = exports.maxUint232 = exports.maxUint224 = exports.maxUint216 = exports.maxUint208 = exports.maxUint200 = exports.maxUint192 = exports.maxUint184 = exports.maxUint176 = exports.maxUint168 = exports.maxUint160 = exports.maxUint152 = exports.maxUint144 = exports.maxUint136 = exports.maxUint128 = exports.maxUint120 = exports.maxUint112 = exports.maxUint104 = exports.maxUint96 = exports.maxUint88 = exports.maxUint80 = exports.maxUint72 = exports.maxUint64 = exports.maxUint56 = exports.maxUint48 = exports.maxUint40 = exports.maxUint32 = exports.maxUint24 = exports.maxUint16 = exports.maxUint8 = exports.maxInt256 = exports.maxInt248 = exports.maxInt240 = exports.maxInt232 = exports.maxInt224 = exports.maxInt216 = exports.maxInt208 = exports.maxInt200 = exports.maxInt192 = exports.maxInt184 = exports.maxInt176 = exports.maxInt168 = exports.maxInt160 = exports.maxInt152 = exports.maxInt144 = exports.maxInt136 = exports.maxInt128 = exports.maxInt120 = void 0;
exports.AbiFunctionOutputsNotFoundError = exports.AbiFunctionNotFoundError = exports.AbiEventSignatureNotFoundError = exports.AbiEventSignatureEmptyTopicsError = exports.AbiEventNotFoundError = exports.AbiErrorSignatureNotFoundError = exports.AbiErrorNotFoundError = exports.AbiErrorInputsNotFoundError = exports.AbiEncodingBytesSizeMismatchError = exports.AbiEncodingLengthMismatchError = exports.AbiEncodingArrayLengthMismatchError = exports.AbiDecodingZeroDataError = exports.AbiDecodingDataSizeTooSmallError = exports.AbiDecodingDataSizeInvalidError = exports.AbiConstructorParamsNotFoundError = exports.AbiConstructorNotFoundError = exports.presignMessagePrefix = exports.zeroHash = exports.minInt256 = exports.minInt248 = exports.minInt240 = exports.minInt232 = exports.minInt224 = exports.minInt216 = exports.minInt208 = exports.minInt200 = exports.minInt192 = exports.minInt184 = exports.minInt176 = exports.minInt168 = exports.minInt160 = exports.minInt152 = exports.minInt144 = exports.minInt136 = exports.minInt128 = exports.minInt120 = exports.minInt112 = exports.minInt104 = exports.minInt96 = exports.minInt88 = exports.minInt80 = exports.minInt72 = exports.minInt64 = exports.minInt56 = exports.minInt48 = exports.minInt40 = exports.minInt32 = exports.minInt24 = exports.minInt16 = exports.minInt8 = void 0;
exports.InvalidHexBooleanError = exports.IntegerOutOfRangeError = exports.InvalidBytesBooleanError = exports.DataLengthTooShortError = exports.DataLengthTooLongError = exports.InvalidChainIdError = exports.ClientChainNotConfiguredError = exports.ChainNotFoundError = exports.ChainMismatchError = exports.ChainDoesNotSupportContract = exports.UserRejectedRequestError = exports.UnsupportedProviderMethodError = exports.UnknownRpcError = exports.UnauthorizedProviderError = exports.TransactionRejectedRpcError = exports.SwitchChainError = exports.RpcError = exports.ResourceUnavailableRpcError = exports.ResourceNotFoundRpcError = exports.ProviderRpcError = exports.ProviderDisconnectedError = exports.ParseRpcError = exports.MethodNotSupportedRpcError = exports.MethodNotFoundRpcError = exports.LimitExceededRpcError = exports.JsonRpcVersionUnsupportedError = exports.InvalidRequestRpcError = exports.InvalidParamsRpcError = exports.InvalidInputRpcError = exports.InternalRpcError = exports.ChainDisconnectedError = exports.MaxFeePerGasTooLowError = exports.Eip1559FeesNotSupportedError = exports.BaseFeeScalarError = exports.RawContractError = exports.ContractFunctionZeroDataError = exports.ContractFunctionRevertedError = exports.ContractFunctionExecutionError = exports.CallExecutionError = exports.BlockNotFoundError = exports.BaseError = exports.UnsupportedPackedAbiType = exports.InvalidDefinitionTypeError = exports.InvalidArrayError = exports.InvalidAbiEncodingTypeError = exports.InvalidAbiDecodingTypeError = exports.DecodeLogTopicsMismatch = exports.DecodeLogDataMismatch = exports.BytesSizeMismatchError = exports.AbiFunctionSignatureNotFoundError = void 0;
exports.encodeAbiParameters = exports.decodeFunctionResult = exports.decodeFunctionData = exports.decodeEventLog = exports.decodeErrorResult = exports.decodeDeployData = exports.decodeAbiParameters = exports.formatLog = exports.formatBlock = exports.defineBlock = exports.namehash = exports.labelhash = exports.UrlRequiredError = exports.SliceOffsetOutOfBoundsError = exports.SizeExceedsPaddingSizeError = exports.WaitForTransactionReceiptTimeoutError = exports.TransactionReceiptNotFoundError = exports.TransactionNotFoundError = exports.TransactionExecutionError = exports.InvalidStorageKeySizeError = exports.InvalidSerializedTransactionTypeError = exports.InvalidSerializedTransactionError = exports.InvalidSerializableTransactionError = exports.InvalidLegacyVError = exports.FeeConflictError = exports.InvalidAddressError = exports.WebSocketRequestError = exports.TimeoutError = exports.RpcRequestError = exports.HttpRequestError = exports.FilterTypeNotSupportedError = exports.UnknownNodeError = exports.TransactionTypeNotSupportedError = exports.TipAboveFeeCapError = exports.NonceTooLowError = exports.NonceTooHighError = exports.NonceMaxValueError = exports.IntrinsicGasTooLowError = exports.IntrinsicGasTooHighError = exports.InsufficientFundsError = exports.FeeCapTooLowError = exports.FeeCapTooHighError = exports.ExecutionRevertedError = exports.EstimateGasExecutionError = exports.EnsAvatarUnsupportedNamespaceError = exports.EnsAvatarInvalidNftUriError = exports.EnsAvatarUriResolutionError = exports.SizeOverflowError = exports.OffsetOutOfBoundsError = exports.InvalidHexValueError = void 0;
exports.toHex = exports.stringToHex = exports.numberToHex = exports.bytesToHex = exports.boolToHex = exports.toBytes = exports.stringToBytes = exports.numberToBytes = exports.hexToBytes = exports.boolToBytes = exports.assertTransactionLegacy = exports.assertTransactionEIP2930 = exports.assertTransactionEIP1559 = exports.assertRequest = exports.verifyTypedData = exports.verifyMessage = exports.toRlp = exports.hexToRlp = exports.bytesToRlp = exports.signatureToHex = exports.compactSignatureToHex = exports.signatureToCompactSignature = exports.recoverTypedDataAddress = exports.recoverPublicKey = exports.recoverMessageAddress = exports.recoverAddress = exports.hexToSignature = exports.hexToCompactSignature = exports.compactSignatureToSignature = exports.hashTypedData = exports.hashDomain = exports.getTransactionType = exports.getSerializedTransactionType = exports.getCreateAddress = exports.getCreate2Address = exports.getContractAddress = exports.getAbiItem = exports.rpcTransactionType = exports.formatTransactionRequest = exports.defineTransactionRequest = exports.formatTransactionReceipt = exports.defineTransactionReceipt = exports.transactionType = exports.formatTransaction = exports.defineTransaction = exports.encodeFunctionResult = exports.encodeFunctionData = exports.encodeEventTopics = exports.encodeErrorResult = exports.encodeDeployData = void 0;
exports.parseUnits = exports.parseTransaction = exports.parseGwei = exports.parseEther = exports.padHex = exports.padBytes = exports.pad = exports.ripemd160 = exports.sha256 = exports.keccak256 = exports.isHex = exports.isHash = exports.isBytes = exports.isAddressEqual = exports.isAddress = exports.hashMessage = exports.getFunctionSignature = exports.getFunctionSelector = exports.getEventSignature = exports.getEventSelector = exports.getContractError = exports.getAddress = exports.checksumAddress = exports.fromRlp = exports.hexToString = exports.hexToNumber = exports.hexToBool = exports.hexToBigInt = exports.fromHex = exports.formatUnits = exports.formatGwei = exports.formatEther = exports.encodePacked = exports.getChainContractAddress = exports.extractChain = exports.defineChain = exports.assertCurrentChain = exports.concatHex = exports.concatBytes = exports.concat = exports.offchainLookupSignature = exports.offchainLookupAbiItem = exports.offchainLookup = exports.ccipFetch = exports.fromBytes = exports.bytesToString = exports.bytesToNumber = exports.bytesToBool = exports.bytesToBigint = exports.bytesToBigInt = void 0;
exports.getTypesForEIP712Domain = exports.domainSeparator = exports.validateTypedData = exports.trim = exports.stringify = exports.sliceHex = exports.sliceBytes = exports.slice = exports.size = exports.serializeTransaction = exports.serializeAccessList = void 0;
var abitype_1 = __webpack_require__(77561);
Object.defineProperty(exports, "CircularReferenceError", ({ enumerable: true, get: function () { return abitype_1.CircularReferenceError; } }));
Object.defineProperty(exports, "InvalidAbiParameterError", ({ enumerable: true, get: function () { return abitype_1.InvalidAbiParameterError; } }));
Object.defineProperty(exports, "InvalidAbiParametersError", ({ enumerable: true, get: function () { return abitype_1.InvalidAbiParametersError; } }));
Object.defineProperty(exports, "InvalidAbiItemError", ({ enumerable: true, get: function () { return abitype_1.InvalidAbiItemError; } }));
Object.defineProperty(exports, "InvalidAbiTypeParameterError", ({ enumerable: true, get: function () { return abitype_1.InvalidAbiTypeParameterError; } }));
Object.defineProperty(exports, "InvalidFunctionModifierError", ({ enumerable: true, get: function () { return abitype_1.InvalidFunctionModifierError; } }));
Object.defineProperty(exports, "InvalidModifierError", ({ enumerable: true, get: function () { return abitype_1.InvalidModifierError; } }));
Object.defineProperty(exports, "InvalidParameterError", ({ enumerable: true, get: function () { return abitype_1.InvalidParameterError; } }));
Object.defineProperty(exports, "InvalidParenthesisError", ({ enumerable: true, get: function () { return abitype_1.InvalidParenthesisError; } }));
Object.defineProperty(exports, "InvalidSignatureError", ({ enumerable: true, get: function () { return abitype_1.InvalidSignatureError; } }));
Object.defineProperty(exports, "InvalidStructSignatureError", ({ enumerable: true, get: function () { return abitype_1.InvalidStructSignatureError; } }));
Object.defineProperty(exports, "SolidityProtectedKeywordError", ({ enumerable: true, get: function () { return abitype_1.SolidityProtectedKeywordError; } }));
Object.defineProperty(exports, "UnknownTypeError", ({ enumerable: true, get: function () { return abitype_1.UnknownTypeError; } }));
Object.defineProperty(exports, "UnknownSignatureError", ({ enumerable: true, get: function () { return abitype_1.UnknownSignatureError; } }));
Object.defineProperty(exports, "parseAbi", ({ enumerable: true, get: function () { return abitype_1.parseAbi; } }));
Object.defineProperty(exports, "parseAbiItem", ({ enumerable: true, get: function () { return abitype_1.parseAbiItem; } }));
Object.defineProperty(exports, "parseAbiParameter", ({ enumerable: true, get: function () { return abitype_1.parseAbiParameter; } }));
Object.defineProperty(exports, "parseAbiParameters", ({ enumerable: true, get: function () { return abitype_1.parseAbiParameters; } }));
var getContract_js_1 = __webpack_require__(69506);
Object.defineProperty(exports, "getContract", ({ enumerable: true, get: function () { return getContract_js_1.getContract; } }));
var createClient_js_1 = __webpack_require__(61076);
Object.defineProperty(exports, "createClient", ({ enumerable: true, get: function () { return createClient_js_1.createClient; } }));
var custom_js_1 = __webpack_require__(44103);
Object.defineProperty(exports, "custom", ({ enumerable: true, get: function () { return custom_js_1.custom; } }));
var fallback_js_1 = __webpack_require__(1506);
Object.defineProperty(exports, "fallback", ({ enumerable: true, get: function () { return fallback_js_1.fallback; } }));
var http_js_1 = __webpack_require__(28720);
Object.defineProperty(exports, "http", ({ enumerable: true, get: function () { return http_js_1.http; } }));
var createPublicClient_js_1 = __webpack_require__(18069);
Object.defineProperty(exports, "createPublicClient", ({ enumerable: true, get: function () { return createPublicClient_js_1.createPublicClient; } }));
var createTestClient_js_1 = __webpack_require__(47288);
Object.defineProperty(exports, "createTestClient", ({ enumerable: true, get: function () { return createTestClient_js_1.createTestClient; } }));
var public_js_1 = __webpack_require__(47390);
Object.defineProperty(exports, "publicActions", ({ enumerable: true, get: function () { return public_js_1.publicActions; } }));
var test_js_1 = __webpack_require__(63668);
Object.defineProperty(exports, "testActions", ({ enumerable: true, get: function () { return test_js_1.testActions; } }));
var wallet_js_1 = __webpack_require__(68449);
Object.defineProperty(exports, "walletActions", ({ enumerable: true, get: function () { return wallet_js_1.walletActions; } }));
var createTransport_js_1 = __webpack_require__(78447);
Object.defineProperty(exports, "createTransport", ({ enumerable: true, get: function () { return createTransport_js_1.createTransport; } }));
var createWalletClient_js_1 = __webpack_require__(8441);
Object.defineProperty(exports, "createWalletClient", ({ enumerable: true, get: function () { return createWalletClient_js_1.createWalletClient; } }));
var webSocket_js_1 = __webpack_require__(75493);
Object.defineProperty(exports, "webSocket", ({ enumerable: true, get: function () { return webSocket_js_1.webSocket; } }));
var abis_js_1 = __webpack_require__(22187);
Object.defineProperty(exports, "multicall3Abi", ({ enumerable: true, get: function () { return abis_js_1.multicall3Abi; } }));
var address_js_1 = __webpack_require__(95898);
Object.defineProperty(exports, "zeroAddress", ({ enumerable: true, get: function () { return address_js_1.zeroAddress; } }));
var unit_js_1 = __webpack_require__(23098);
Object.defineProperty(exports, "etherUnits", ({ enumerable: true, get: function () { return unit_js_1.etherUnits; } }));
Object.defineProperty(exports, "gweiUnits", ({ enumerable: true, get: function () { return unit_js_1.gweiUnits; } }));
Object.defineProperty(exports, "weiUnits", ({ enumerable: true, get: function () { return unit_js_1.weiUnits; } }));
var number_js_1 = __webpack_require__(61637);
Object.defineProperty(exports, "maxInt8", ({ enumerable: true, get: function () { return number_js_1.maxInt8; } }));
Object.defineProperty(exports, "maxInt16", ({ enumerable: true, get: function () { return number_js_1.maxInt16; } }));
Object.defineProperty(exports, "maxInt24", ({ enumerable: true, get: function () { return number_js_1.maxInt24; } }));
Object.defineProperty(exports, "maxInt32", ({ enumerable: true, get: function () { return number_js_1.maxInt32; } }));
Object.defineProperty(exports, "maxInt40", ({ enumerable: true, get: function () { return number_js_1.maxInt40; } }));
Object.defineProperty(exports, "maxInt48", ({ enumerable: true, get: function () { return number_js_1.maxInt48; } }));
Object.defineProperty(exports, "maxInt56", ({ enumerable: true, get: function () { return number_js_1.maxInt56; } }));
Object.defineProperty(exports, "maxInt64", ({ enumerable: true, get: function () { return number_js_1.maxInt64; } }));
Object.defineProperty(exports, "maxInt72", ({ enumerable: true, get: function () { return number_js_1.maxInt72; } }));
Object.defineProperty(exports, "maxInt80", ({ enumerable: true, get: function () { return number_js_1.maxInt80; } }));
Object.defineProperty(exports, "maxInt88", ({ enumerable: true, get: function () { return number_js_1.maxInt88; } }));
Object.defineProperty(exports, "maxInt96", ({ enumerable: true, get: function () { return number_js_1.maxInt96; } }));
Object.defineProperty(exports, "maxInt104", ({ enumerable: true, get: function () { return number_js_1.maxInt104; } }));
Object.defineProperty(exports, "maxInt112", ({ enumerable: true, get: function () { return number_js_1.maxInt112; } }));
Object.defineProperty(exports, "maxInt120", ({ enumerable: true, get: function () { return number_js_1.maxInt120; } }));
Object.defineProperty(exports, "maxInt128", ({ enumerable: true, get: function () { return number_js_1.maxInt128; } }));
Object.defineProperty(exports, "maxInt136", ({ enumerable: true, get: function () { return number_js_1.maxInt136; } }));
Object.defineProperty(exports, "maxInt144", ({ enumerable: true, get: function () { return number_js_1.maxInt144; } }));
Object.defineProperty(exports, "maxInt152", ({ enumerable: true, get: function () { return number_js_1.maxInt152; } }));
Object.defineProperty(exports, "maxInt160", ({ enumerable: true, get: function () { return number_js_1.maxInt160; } }));
Object.defineProperty(exports, "maxInt168", ({ enumerable: true, get: function () { return number_js_1.maxInt168; } }));
Object.defineProperty(exports, "maxInt176", ({ enumerable: true, get: function () { return number_js_1.maxInt176; } }));
Object.defineProperty(exports, "maxInt184", ({ enumerable: true, get: function () { return number_js_1.maxInt184; } }));
Object.defineProperty(exports, "maxInt192", ({ enumerable: true, get: function () { return number_js_1.maxInt192; } }));
Object.defineProperty(exports, "maxInt200", ({ enumerable: true, get: function () { return number_js_1.maxInt200; } }));
Object.defineProperty(exports, "maxInt208", ({ enumerable: true, get: function () { return number_js_1.maxInt208; } }));
Object.defineProperty(exports, "maxInt216", ({ enumerable: true, get: function () { return number_js_1.maxInt216; } }));
Object.defineProperty(exports, "maxInt224", ({ enumerable: true, get: function () { return number_js_1.maxInt224; } }));
Object.defineProperty(exports, "maxInt232", ({ enumerable: true, get: function () { return number_js_1.maxInt232; } }));
Object.defineProperty(exports, "maxInt240", ({ enumerable: true, get: function () { return number_js_1.maxInt240; } }));
Object.defineProperty(exports, "maxInt248", ({ enumerable: true, get: function () { return number_js_1.maxInt248; } }));
Object.defineProperty(exports, "maxInt256", ({ enumerable: true, get: function () { return number_js_1.maxInt256; } }));
Object.defineProperty(exports, "maxUint8", ({ enumerable: true, get: function () { return number_js_1.maxUint8; } }));
Object.defineProperty(exports, "maxUint16", ({ enumerable: true, get: function () { return number_js_1.maxUint16; } }));
Object.defineProperty(exports, "maxUint24", ({ enumerable: true, get: function () { return number_js_1.maxUint24; } }));
Object.defineProperty(exports, "maxUint32", ({ enumerable: true, get: function () { return number_js_1.maxUint32; } }));
Object.defineProperty(exports, "maxUint40", ({ enumerable: true, get: function () { return number_js_1.maxUint40; } }));
Object.defineProperty(exports, "maxUint48", ({ enumerable: true, get: function () { return number_js_1.maxUint48; } }));
Object.defineProperty(exports, "maxUint56", ({ enumerable: true, get: function () { return number_js_1.maxUint56; } }));
Object.defineProperty(exports, "maxUint64", ({ enumerable: true, get: function () { return number_js_1.maxUint64; } }));
Object.defineProperty(exports, "maxUint72", ({ enumerable: true, get: function () { return number_js_1.maxUint72; } }));
Object.defineProperty(exports, "maxUint80", ({ enumerable: true, get: function () { return number_js_1.maxUint80; } }));
Object.defineProperty(exports, "maxUint88", ({ enumerable: true, get: function () { return number_js_1.maxUint88; } }));
Object.defineProperty(exports, "maxUint96", ({ enumerable: true, get: function () { return number_js_1.maxUint96; } }));
Object.defineProperty(exports, "maxUint104", ({ enumerable: true, get: function () { return number_js_1.maxUint104; } }));
Object.defineProperty(exports, "maxUint112", ({ enumerable: true, get: function () { return number_js_1.maxUint112; } }));
Object.defineProperty(exports, "maxUint120", ({ enumerable: true, get: function () { return number_js_1.maxUint120; } }));
Object.defineProperty(exports, "maxUint128", ({ enumerable: true, get: function () { return number_js_1.maxUint128; } }));
Object.defineProperty(exports, "maxUint136", ({ enumerable: true, get: function () { return number_js_1.maxUint136; } }));
Object.defineProperty(exports, "maxUint144", ({ enumerable: true, get: function () { return number_js_1.maxUint144; } }));
Object.defineProperty(exports, "maxUint152", ({ enumerable: true, get: function () { return number_js_1.maxUint152; } }));
Object.defineProperty(exports, "maxUint160", ({ enumerable: true, get: function () { return number_js_1.maxUint160; } }));
Object.defineProperty(exports, "maxUint168", ({ enumerable: true, get: function () { return number_js_1.maxUint168; } }));
Object.defineProperty(exports, "maxUint176", ({ enumerable: true, get: function () { return number_js_1.maxUint176; } }));
Object.defineProperty(exports, "maxUint184", ({ enumerable: true, get: function () { return number_js_1.maxUint184; } }));
Object.defineProperty(exports, "maxUint192", ({ enumerable: true, get: function () { return number_js_1.maxUint192; } }));
Object.defineProperty(exports, "maxUint200", ({ enumerable: true, get: function () { return number_js_1.maxUint200; } }));
Object.defineProperty(exports, "maxUint208", ({ enumerable: true, get: function () { return number_js_1.maxUint208; } }));
Object.defineProperty(exports, "maxUint216", ({ enumerable: true, get: function () { return number_js_1.maxUint216; } }));
Object.defineProperty(exports, "maxUint224", ({ enumerable: true, get: function () { return number_js_1.maxUint224; } }));
Object.defineProperty(exports, "maxUint232", ({ enumerable: true, get: function () { return number_js_1.maxUint232; } }));
Object.defineProperty(exports, "maxUint240", ({ enumerable: true, get: function () { return number_js_1.maxUint240; } }));
Object.defineProperty(exports, "maxUint248", ({ enumerable: true, get: function () { return number_js_1.maxUint248; } }));
Object.defineProperty(exports, "maxUint256", ({ enumerable: true, get: function () { return number_js_1.maxUint256; } }));
Object.defineProperty(exports, "minInt8", ({ enumerable: true, get: function () { return number_js_1.minInt8; } }));
Object.defineProperty(exports, "minInt16", ({ enumerable: true, get: function () { return number_js_1.minInt16; } }));
Object.defineProperty(exports, "minInt24", ({ enumerable: true, get: function () { return number_js_1.minInt24; } }));
Object.defineProperty(exports, "minInt32", ({ enumerable: true, get: function () { return number_js_1.minInt32; } }));
Object.defineProperty(exports, "minInt40", ({ enumerable: true, get: function () { return number_js_1.minInt40; } }));
Object.defineProperty(exports, "minInt48", ({ enumerable: true, get: function () { return number_js_1.minInt48; } }));
Object.defineProperty(exports, "minInt56", ({ enumerable: true, get: function () { return number_js_1.minInt56; } }));
Object.defineProperty(exports, "minInt64", ({ enumerable: true, get: function () { return number_js_1.minInt64; } }));
Object.defineProperty(exports, "minInt72", ({ enumerable: true, get: function () { return number_js_1.minInt72; } }));
Object.defineProperty(exports, "minInt80", ({ enumerable: true, get: function () { return number_js_1.minInt80; } }));
Object.defineProperty(exports, "minInt88", ({ enumerable: true, get: function () { return number_js_1.minInt88; } }));
Object.defineProperty(exports, "minInt96", ({ enumerable: true, get: function () { return number_js_1.minInt96; } }));
Object.defineProperty(exports, "minInt104", ({ enumerable: true, get: function () { return number_js_1.minInt104; } }));
Object.defineProperty(exports, "minInt112", ({ enumerable: true, get: function () { return number_js_1.minInt112; } }));
Object.defineProperty(exports, "minInt120", ({ enumerable: true, get: function () { return number_js_1.minInt120; } }));
Object.defineProperty(exports, "minInt128", ({ enumerable: true, get: function () { return number_js_1.minInt128; } }));
Object.defineProperty(exports, "minInt136", ({ enumerable: true, get: function () { return number_js_1.minInt136; } }));
Object.defineProperty(exports, "minInt144", ({ enumerable: true, get: function () { return number_js_1.minInt144; } }));
Object.defineProperty(exports, "minInt152", ({ enumerable: true, get: function () { return number_js_1.minInt152; } }));
Object.defineProperty(exports, "minInt160", ({ enumerable: true, get: function () { return number_js_1.minInt160; } }));
Object.defineProperty(exports, "minInt168", ({ enumerable: true, get: function () { return number_js_1.minInt168; } }));
Object.defineProperty(exports, "minInt176", ({ enumerable: true, get: function () { return number_js_1.minInt176; } }));
Object.defineProperty(exports, "minInt184", ({ enumerable: true, get: function () { return number_js_1.minInt184; } }));
Object.defineProperty(exports, "minInt192", ({ enumerable: true, get: function () { return number_js_1.minInt192; } }));
Object.defineProperty(exports, "minInt200", ({ enumerable: true, get: function () { return number_js_1.minInt200; } }));
Object.defineProperty(exports, "minInt208", ({ enumerable: true, get: function () { return number_js_1.minInt208; } }));
Object.defineProperty(exports, "minInt216", ({ enumerable: true, get: function () { return number_js_1.minInt216; } }));
Object.defineProperty(exports, "minInt224", ({ enumerable: true, get: function () { return number_js_1.minInt224; } }));
Object.defineProperty(exports, "minInt232", ({ enumerable: true, get: function () { return number_js_1.minInt232; } }));
Object.defineProperty(exports, "minInt240", ({ enumerable: true, get: function () { return number_js_1.minInt240; } }));
Object.defineProperty(exports, "minInt248", ({ enumerable: true, get: function () { return number_js_1.minInt248; } }));
Object.defineProperty(exports, "minInt256", ({ enumerable: true, get: function () { return number_js_1.minInt256; } }));
var bytes_js_1 = __webpack_require__(49065);
Object.defineProperty(exports, "zeroHash", ({ enumerable: true, get: function () { return bytes_js_1.zeroHash; } }));
var strings_js_1 = __webpack_require__(72460);
Object.defineProperty(exports, "presignMessagePrefix", ({ enumerable: true, get: function () { return strings_js_1.presignMessagePrefix; } }));
var abi_js_1 = __webpack_require__(5432);
Object.defineProperty(exports, "AbiConstructorNotFoundError", ({ enumerable: true, get: function () { return abi_js_1.AbiConstructorNotFoundError; } }));
Object.defineProperty(exports, "AbiConstructorParamsNotFoundError", ({ enumerable: true, get: function () { return abi_js_1.AbiConstructorParamsNotFoundError; } }));
Object.defineProperty(exports, "AbiDecodingDataSizeInvalidError", ({ enumerable: true, get: function () { return abi_js_1.AbiDecodingDataSizeInvalidError; } }));
Object.defineProperty(exports, "AbiDecodingDataSizeTooSmallError", ({ enumerable: true, get: function () { return abi_js_1.AbiDecodingDataSizeTooSmallError; } }));
Object.defineProperty(exports, "AbiDecodingZeroDataError", ({ enumerable: true, get: function () { return abi_js_1.AbiDecodingZeroDataError; } }));
Object.defineProperty(exports, "AbiEncodingArrayLengthMismatchError", ({ enumerable: true, get: function () { return abi_js_1.AbiEncodingArrayLengthMismatchError; } }));
Object.defineProperty(exports, "AbiEncodingLengthMismatchError", ({ enumerable: true, get: function () { return abi_js_1.AbiEncodingLengthMismatchError; } }));
Object.defineProperty(exports, "AbiEncodingBytesSizeMismatchError", ({ enumerable: true, get: function () { return abi_js_1.AbiEncodingBytesSizeMismatchError; } }));
Object.defineProperty(exports, "AbiErrorInputsNotFoundError", ({ enumerable: true, get: function () { return abi_js_1.AbiErrorInputsNotFoundError; } }));
Object.defineProperty(exports, "AbiErrorNotFoundError", ({ enumerable: true, get: function () { return abi_js_1.AbiErrorNotFoundError; } }));
Object.defineProperty(exports, "AbiErrorSignatureNotFoundError", ({ enumerable: true, get: function () { return abi_js_1.AbiErrorSignatureNotFoundError; } }));
Object.defineProperty(exports, "AbiEventNotFoundError", ({ enumerable: true, get: function () { return abi_js_1.AbiEventNotFoundError; } }));
Object.defineProperty(exports, "AbiEventSignatureEmptyTopicsError", ({ enumerable: true, get: function () { return abi_js_1.AbiEventSignatureEmptyTopicsError; } }));
Object.defineProperty(exports, "AbiEventSignatureNotFoundError", ({ enumerable: true, get: function () { return abi_js_1.AbiEventSignatureNotFoundError; } }));
Object.defineProperty(exports, "AbiFunctionNotFoundError", ({ enumerable: true, get: function () { return abi_js_1.AbiFunctionNotFoundError; } }));
Object.defineProperty(exports, "AbiFunctionOutputsNotFoundError", ({ enumerable: true, get: function () { return abi_js_1.AbiFunctionOutputsNotFoundError; } }));
Object.defineProperty(exports, "AbiFunctionSignatureNotFoundError", ({ enumerable: true, get: function () { return abi_js_1.AbiFunctionSignatureNotFoundError; } }));
Object.defineProperty(exports, "BytesSizeMismatchError", ({ enumerable: true, get: function () { return abi_js_1.BytesSizeMismatchError; } }));
Object.defineProperty(exports, "DecodeLogDataMismatch", ({ enumerable: true, get: function () { return abi_js_1.DecodeLogDataMismatch; } }));
Object.defineProperty(exports, "DecodeLogTopicsMismatch", ({ enumerable: true, get: function () { return abi_js_1.DecodeLogTopicsMismatch; } }));
Object.defineProperty(exports, "InvalidAbiDecodingTypeError", ({ enumerable: true, get: function () { return abi_js_1.InvalidAbiDecodingTypeError; } }));
Object.defineProperty(exports, "InvalidAbiEncodingTypeError", ({ enumerable: true, get: function () { return abi_js_1.InvalidAbiEncodingTypeError; } }));
Object.defineProperty(exports, "InvalidArrayError", ({ enumerable: true, get: function () { return abi_js_1.InvalidArrayError; } }));
Object.defineProperty(exports, "InvalidDefinitionTypeError", ({ enumerable: true, get: function () { return abi_js_1.InvalidDefinitionTypeError; } }));
Object.defineProperty(exports, "UnsupportedPackedAbiType", ({ enumerable: true, get: function () { return abi_js_1.UnsupportedPackedAbiType; } }));
var base_js_1 = __webpack_require__(24437);
Object.defineProperty(exports, "BaseError", ({ enumerable: true, get: function () { return base_js_1.BaseError; } }));
var block_js_1 = __webpack_require__(57343);
Object.defineProperty(exports, "BlockNotFoundError", ({ enumerable: true, get: function () { return block_js_1.BlockNotFoundError; } }));
var contract_js_1 = __webpack_require__(30474);
Object.defineProperty(exports, "CallExecutionError", ({ enumerable: true, get: function () { return contract_js_1.CallExecutionError; } }));
Object.defineProperty(exports, "ContractFunctionExecutionError", ({ enumerable: true, get: function () { return contract_js_1.ContractFunctionExecutionError; } }));
Object.defineProperty(exports, "ContractFunctionRevertedError", ({ enumerable: true, get: function () { return contract_js_1.ContractFunctionRevertedError; } }));
Object.defineProperty(exports, "ContractFunctionZeroDataError", ({ enumerable: true, get: function () { return contract_js_1.ContractFunctionZeroDataError; } }));
Object.defineProperty(exports, "RawContractError", ({ enumerable: true, get: function () { return contract_js_1.RawContractError; } }));
var fee_js_1 = __webpack_require__(16422);
Object.defineProperty(exports, "BaseFeeScalarError", ({ enumerable: true, get: function () { return fee_js_1.BaseFeeScalarError; } }));
Object.defineProperty(exports, "Eip1559FeesNotSupportedError", ({ enumerable: true, get: function () { return fee_js_1.Eip1559FeesNotSupportedError; } }));
Object.defineProperty(exports, "MaxFeePerGasTooLowError", ({ enumerable: true, get: function () { return fee_js_1.MaxFeePerGasTooLowError; } }));
var rpc_js_1 = __webpack_require__(36549);
Object.defineProperty(exports, "ChainDisconnectedError", ({ enumerable: true, get: function () { return rpc_js_1.ChainDisconnectedError; } }));
Object.defineProperty(exports, "InternalRpcError", ({ enumerable: true, get: function () { return rpc_js_1.InternalRpcError; } }));
Object.defineProperty(exports, "InvalidInputRpcError", ({ enumerable: true, get: function () { return rpc_js_1.InvalidInputRpcError; } }));
Object.defineProperty(exports, "InvalidParamsRpcError", ({ enumerable: true, get: function () { return rpc_js_1.InvalidParamsRpcError; } }));
Object.defineProperty(exports, "InvalidRequestRpcError", ({ enumerable: true, get: function () { return rpc_js_1.InvalidRequestRpcError; } }));
Object.defineProperty(exports, "JsonRpcVersionUnsupportedError", ({ enumerable: true, get: function () { return rpc_js_1.JsonRpcVersionUnsupportedError; } }));
Object.defineProperty(exports, "LimitExceededRpcError", ({ enumerable: true, get: function () { return rpc_js_1.LimitExceededRpcError; } }));
Object.defineProperty(exports, "MethodNotFoundRpcError", ({ enumerable: true, get: function () { return rpc_js_1.MethodNotFoundRpcError; } }));
Object.defineProperty(exports, "MethodNotSupportedRpcError", ({ enumerable: true, get: function () { return rpc_js_1.MethodNotSupportedRpcError; } }));
Object.defineProperty(exports, "ParseRpcError", ({ enumerable: true, get: function () { return rpc_js_1.ParseRpcError; } }));
Object.defineProperty(exports, "ProviderDisconnectedError", ({ enumerable: true, get: function () { return rpc_js_1.ProviderDisconnectedError; } }));
Object.defineProperty(exports, "ProviderRpcError", ({ enumerable: true, get: function () { return rpc_js_1.ProviderRpcError; } }));
Object.defineProperty(exports, "ResourceNotFoundRpcError", ({ enumerable: true, get: function () { return rpc_js_1.ResourceNotFoundRpcError; } }));
Object.defineProperty(exports, "ResourceUnavailableRpcError", ({ enumerable: true, get: function () { return rpc_js_1.ResourceUnavailableRpcError; } }));
Object.defineProperty(exports, "RpcError", ({ enumerable: true, get: function () { return rpc_js_1.RpcError; } }));
Object.defineProperty(exports, "SwitchChainError", ({ enumerable: true, get: function () { return rpc_js_1.SwitchChainError; } }));
Object.defineProperty(exports, "TransactionRejectedRpcError", ({ enumerable: true, get: function () { return rpc_js_1.TransactionRejectedRpcError; } }));
Object.defineProperty(exports, "UnauthorizedProviderError", ({ enumerable: true, get: function () { return rpc_js_1.UnauthorizedProviderError; } }));
Object.defineProperty(exports, "UnknownRpcError", ({ enumerable: true, get: function () { return rpc_js_1.UnknownRpcError; } }));
Object.defineProperty(exports, "UnsupportedProviderMethodError", ({ enumerable: true, get: function () { return rpc_js_1.UnsupportedProviderMethodError; } }));
Object.defineProperty(exports, "UserRejectedRequestError", ({ enumerable: true, get: function () { return rpc_js_1.UserRejectedRequestError; } }));
var chain_js_1 = __webpack_require__(73587);
Object.defineProperty(exports, "ChainDoesNotSupportContract", ({ enumerable: true, get: function () { return chain_js_1.ChainDoesNotSupportContract; } }));
Object.defineProperty(exports, "ChainMismatchError", ({ enumerable: true, get: function () { return chain_js_1.ChainMismatchError; } }));
Object.defineProperty(exports, "ChainNotFoundError", ({ enumerable: true, get: function () { return chain_js_1.ChainNotFoundError; } }));
Object.defineProperty(exports, "ClientChainNotConfiguredError", ({ enumerable: true, get: function () { return chain_js_1.ClientChainNotConfiguredError; } }));
Object.defineProperty(exports, "InvalidChainIdError", ({ enumerable: true, get: function () { return chain_js_1.InvalidChainIdError; } }));
var encoding_js_1 = __webpack_require__(21329);
Object.defineProperty(exports, "DataLengthTooLongError", ({ enumerable: true, get: function () { return encoding_js_1.DataLengthTooLongError; } }));
Object.defineProperty(exports, "DataLengthTooShortError", ({ enumerable: true, get: function () { return encoding_js_1.DataLengthTooShortError; } }));
Object.defineProperty(exports, "InvalidBytesBooleanError", ({ enumerable: true, get: function () { return encoding_js_1.InvalidBytesBooleanError; } }));
Object.defineProperty(exports, "IntegerOutOfRangeError", ({ enumerable: true, get: function () { return encoding_js_1.IntegerOutOfRangeError; } }));
Object.defineProperty(exports, "InvalidHexBooleanError", ({ enumerable: true, get: function () { return encoding_js_1.InvalidHexBooleanError; } }));
Object.defineProperty(exports, "InvalidHexValueError", ({ enumerable: true, get: function () { return encoding_js_1.InvalidHexValueError; } }));
Object.defineProperty(exports, "OffsetOutOfBoundsError", ({ enumerable: true, get: function () { return encoding_js_1.OffsetOutOfBoundsError; } }));
Object.defineProperty(exports, "SizeOverflowError", ({ enumerable: true, get: function () { return encoding_js_1.SizeOverflowError; } }));
var ens_js_1 = __webpack_require__(44770);
Object.defineProperty(exports, "EnsAvatarUriResolutionError", ({ enumerable: true, get: function () { return ens_js_1.EnsAvatarUriResolutionError; } }));
Object.defineProperty(exports, "EnsAvatarInvalidNftUriError", ({ enumerable: true, get: function () { return ens_js_1.EnsAvatarInvalidNftUriError; } }));
Object.defineProperty(exports, "EnsAvatarUnsupportedNamespaceError", ({ enumerable: true, get: function () { return ens_js_1.EnsAvatarUnsupportedNamespaceError; } }));
var estimateGas_js_1 = __webpack_require__(7029);
Object.defineProperty(exports, "EstimateGasExecutionError", ({ enumerable: true, get: function () { return estimateGas_js_1.EstimateGasExecutionError; } }));
var node_js_1 = __webpack_require__(20420);
Object.defineProperty(exports, "ExecutionRevertedError", ({ enumerable: true, get: function () { return node_js_1.ExecutionRevertedError; } }));
Object.defineProperty(exports, "FeeCapTooHighError", ({ enumerable: true, get: function () { return node_js_1.FeeCapTooHighError; } }));
Object.defineProperty(exports, "FeeCapTooLowError", ({ enumerable: true, get: function () { return node_js_1.FeeCapTooLowError; } }));
Object.defineProperty(exports, "InsufficientFundsError", ({ enumerable: true, get: function () { return node_js_1.InsufficientFundsError; } }));
Object.defineProperty(exports, "IntrinsicGasTooHighError", ({ enumerable: true, get: function () { return node_js_1.IntrinsicGasTooHighError; } }));
Object.defineProperty(exports, "IntrinsicGasTooLowError", ({ enumerable: true, get: function () { return node_js_1.IntrinsicGasTooLowError; } }));
Object.defineProperty(exports, "NonceMaxValueError", ({ enumerable: true, get: function () { return node_js_1.NonceMaxValueError; } }));
Object.defineProperty(exports, "NonceTooHighError", ({ enumerable: true, get: function () { return node_js_1.NonceTooHighError; } }));
Object.defineProperty(exports, "NonceTooLowError", ({ enumerable: true, get: function () { return node_js_1.NonceTooLowError; } }));
Object.defineProperty(exports, "TipAboveFeeCapError", ({ enumerable: true, get: function () { return node_js_1.TipAboveFeeCapError; } }));
Object.defineProperty(exports, "TransactionTypeNotSupportedError", ({ enumerable: true, get: function () { return node_js_1.TransactionTypeNotSupportedError; } }));
Object.defineProperty(exports, "UnknownNodeError", ({ enumerable: true, get: function () { return node_js_1.UnknownNodeError; } }));
var log_js_1 = __webpack_require__(9780);
Object.defineProperty(exports, "FilterTypeNotSupportedError", ({ enumerable: true, get: function () { return log_js_1.FilterTypeNotSupportedError; } }));
var request_js_1 = __webpack_require__(80767);
Object.defineProperty(exports, "HttpRequestError", ({ enumerable: true, get: function () { return request_js_1.HttpRequestError; } }));
Object.defineProperty(exports, "RpcRequestError", ({ enumerable: true, get: function () { return request_js_1.RpcRequestError; } }));
Object.defineProperty(exports, "TimeoutError", ({ enumerable: true, get: function () { return request_js_1.TimeoutError; } }));
Object.defineProperty(exports, "WebSocketRequestError", ({ enumerable: true, get: function () { return request_js_1.WebSocketRequestError; } }));
var address_js_2 = __webpack_require__(64422);
Object.defineProperty(exports, "InvalidAddressError", ({ enumerable: true, get: function () { return address_js_2.InvalidAddressError; } }));
var transaction_js_1 = __webpack_require__(83474);
Object.defineProperty(exports, "FeeConflictError", ({ enumerable: true, get: function () { return transaction_js_1.FeeConflictError; } }));
Object.defineProperty(exports, "InvalidLegacyVError", ({ enumerable: true, get: function () { return transaction_js_1.InvalidLegacyVError; } }));
Object.defineProperty(exports, "InvalidSerializableTransactionError", ({ enumerable: true, get: function () { return transaction_js_1.InvalidSerializableTransactionError; } }));
Object.defineProperty(exports, "InvalidSerializedTransactionError", ({ enumerable: true, get: function () { return transaction_js_1.InvalidSerializedTransactionError; } }));
Object.defineProperty(exports, "InvalidSerializedTransactionTypeError", ({ enumerable: true, get: function () { return transaction_js_1.InvalidSerializedTransactionTypeError; } }));
Object.defineProperty(exports, "InvalidStorageKeySizeError", ({ enumerable: true, get: function () { return transaction_js_1.InvalidStorageKeySizeError; } }));
Object.defineProperty(exports, "TransactionExecutionError", ({ enumerable: true, get: function () { return transaction_js_1.TransactionExecutionError; } }));
Object.defineProperty(exports, "TransactionNotFoundError", ({ enumerable: true, get: function () { return transaction_js_1.TransactionNotFoundError; } }));
Object.defineProperty(exports, "TransactionReceiptNotFoundError", ({ enumerable: true, get: function () { return transaction_js_1.TransactionReceiptNotFoundError; } }));
Object.defineProperty(exports, "WaitForTransactionReceiptTimeoutError", ({ enumerable: true, get: function () { return transaction_js_1.WaitForTransactionReceiptTimeoutError; } }));
var data_js_1 = __webpack_require__(34204);
Object.defineProperty(exports, "SizeExceedsPaddingSizeError", ({ enumerable: true, get: function () { return data_js_1.SizeExceedsPaddingSizeError; } }));
Object.defineProperty(exports, "SliceOffsetOutOfBoundsError", ({ enumerable: true, get: function () { return data_js_1.SliceOffsetOutOfBoundsError; } }));
var transport_js_1 = __webpack_require__(2659);
Object.defineProperty(exports, "UrlRequiredError", ({ enumerable: true, get: function () { return transport_js_1.UrlRequiredError; } }));
var labelhash_js_1 = __webpack_require__(13647);
Object.defineProperty(exports, "labelhash", ({ enumerable: true, get: function () { return labelhash_js_1.labelhash; } }));
var namehash_js_1 = __webpack_require__(76230);
Object.defineProperty(exports, "namehash", ({ enumerable: true, get: function () { return namehash_js_1.namehash; } }));
var block_js_2 = __webpack_require__(12885);
Object.defineProperty(exports, "defineBlock", ({ enumerable: true, get: function () { return block_js_2.defineBlock; } }));
Object.defineProperty(exports, "formatBlock", ({ enumerable: true, get: function () { return block_js_2.formatBlock; } }));
var log_js_2 = __webpack_require__(55266);
Object.defineProperty(exports, "formatLog", ({ enumerable: true, get: function () { return log_js_2.formatLog; } }));
var decodeAbiParameters_js_1 = __webpack_require__(16615);
Object.defineProperty(exports, "decodeAbiParameters", ({ enumerable: true, get: function () { return decodeAbiParameters_js_1.decodeAbiParameters; } }));
var decodeDeployData_js_1 = __webpack_require__(38878);
Object.defineProperty(exports, "decodeDeployData", ({ enumerable: true, get: function () { return decodeDeployData_js_1.decodeDeployData; } }));
var decodeErrorResult_js_1 = __webpack_require__(33058);
Object.defineProperty(exports, "decodeErrorResult", ({ enumerable: true, get: function () { return decodeErrorResult_js_1.decodeErrorResult; } }));
var decodeEventLog_js_1 = __webpack_require__(83327);
Object.defineProperty(exports, "decodeEventLog", ({ enumerable: true, get: function () { return decodeEventLog_js_1.decodeEventLog; } }));
var decodeFunctionData_js_1 = __webpack_require__(81973);
Object.defineProperty(exports, "decodeFunctionData", ({ enumerable: true, get: function () { return decodeFunctionData_js_1.decodeFunctionData; } }));
var decodeFunctionResult_js_1 = __webpack_require__(22080);
Object.defineProperty(exports, "decodeFunctionResult", ({ enumerable: true, get: function () { return decodeFunctionResult_js_1.decodeFunctionResult; } }));
var encodeAbiParameters_js_1 = __webpack_require__(82671);
Object.defineProperty(exports, "encodeAbiParameters", ({ enumerable: true, get: function () { return encodeAbiParameters_js_1.encodeAbiParameters; } }));
var encodeDeployData_js_1 = __webpack_require__(76006);
Object.defineProperty(exports, "encodeDeployData", ({ enumerable: true, get: function () { return encodeDeployData_js_1.encodeDeployData; } }));
var encodeErrorResult_js_1 = __webpack_require__(32778);
Object.defineProperty(exports, "encodeErrorResult", ({ enumerable: true, get: function () { return encodeErrorResult_js_1.encodeErrorResult; } }));
var encodeEventTopics_js_1 = __webpack_require__(38805);
Object.defineProperty(exports, "encodeEventTopics", ({ enumerable: true, get: function () { return encodeEventTopics_js_1.encodeEventTopics; } }));
var encodeFunctionData_js_1 = __webpack_require__(99117);
Object.defineProperty(exports, "encodeFunctionData", ({ enumerable: true, get: function () { return encodeFunctionData_js_1.encodeFunctionData; } }));
var encodeFunctionResult_js_1 = __webpack_require__(52616);
Object.defineProperty(exports, "encodeFunctionResult", ({ enumerable: true, get: function () { return encodeFunctionResult_js_1.encodeFunctionResult; } }));
var transaction_js_2 = __webpack_require__(11040);
Object.defineProperty(exports, "defineTransaction", ({ enumerable: true, get: function () { return transaction_js_2.defineTransaction; } }));
Object.defineProperty(exports, "formatTransaction", ({ enumerable: true, get: function () { return transaction_js_2.formatTransaction; } }));
Object.defineProperty(exports, "transactionType", ({ enumerable: true, get: function () { return transaction_js_2.transactionType; } }));
var transactionReceipt_js_1 = __webpack_require__(47342);
Object.defineProperty(exports, "defineTransactionReceipt", ({ enumerable: true, get: function () { return transactionReceipt_js_1.defineTransactionReceipt; } }));
Object.defineProperty(exports, "formatTransactionReceipt", ({ enumerable: true, get: function () { return transactionReceipt_js_1.formatTransactionReceipt; } }));
var transactionRequest_js_1 = __webpack_require__(23459);
Object.defineProperty(exports, "defineTransactionRequest", ({ enumerable: true, get: function () { return transactionRequest_js_1.defineTransactionRequest; } }));
Object.defineProperty(exports, "formatTransactionRequest", ({ enumerable: true, get: function () { return transactionRequest_js_1.formatTransactionRequest; } }));
Object.defineProperty(exports, "rpcTransactionType", ({ enumerable: true, get: function () { return transactionRequest_js_1.rpcTransactionType; } }));
var getAbiItem_js_1 = __webpack_require__(79606);
Object.defineProperty(exports, "getAbiItem", ({ enumerable: true, get: function () { return getAbiItem_js_1.getAbiItem; } }));
var getContractAddress_js_1 = __webpack_require__(78831);
Object.defineProperty(exports, "getContractAddress", ({ enumerable: true, get: function () { return getContractAddress_js_1.getContractAddress; } }));
Object.defineProperty(exports, "getCreate2Address", ({ enumerable: true, get: function () { return getContractAddress_js_1.getCreate2Address; } }));
Object.defineProperty(exports, "getCreateAddress", ({ enumerable: true, get: function () { return getContractAddress_js_1.getCreateAddress; } }));
var getSerializedTransactionType_js_1 = __webpack_require__(40735);
Object.defineProperty(exports, "getSerializedTransactionType", ({ enumerable: true, get: function () { return getSerializedTransactionType_js_1.getSerializedTransactionType; } }));
var getTransactionType_js_1 = __webpack_require__(22277);
Object.defineProperty(exports, "getTransactionType", ({ enumerable: true, get: function () { return getTransactionType_js_1.getTransactionType; } }));
var hashTypedData_js_1 = __webpack_require__(32911);
Object.defineProperty(exports, "hashDomain", ({ enumerable: true, get: function () { return hashTypedData_js_1.hashDomain; } }));
Object.defineProperty(exports, "hashTypedData", ({ enumerable: true, get: function () { return hashTypedData_js_1.hashTypedData; } }));
var compactSignatureToSignature_js_1 = __webpack_require__(72573);
Object.defineProperty(exports, "compactSignatureToSignature", ({ enumerable: true, get: function () { return compactSignatureToSignature_js_1.compactSignatureToSignature; } }));
var hexToCompactSignature_js_1 = __webpack_require__(56238);
Object.defineProperty(exports, "hexToCompactSignature", ({ enumerable: true, get: function () { return hexToCompactSignature_js_1.hexToCompactSignature; } }));
var hexToSignature_js_1 = __webpack_require__(52605);
Object.defineProperty(exports, "hexToSignature", ({ enumerable: true, get: function () { return hexToSignature_js_1.hexToSignature; } }));
var recoverAddress_js_1 = __webpack_require__(42679);
Object.defineProperty(exports, "recoverAddress", ({ enumerable: true, get: function () { return recoverAddress_js_1.recoverAddress; } }));
var recoverMessageAddress_js_1 = __webpack_require__(26550);
Object.defineProperty(exports, "recoverMessageAddress", ({ enumerable: true, get: function () { return recoverMessageAddress_js_1.recoverMessageAddress; } }));
var recoverPublicKey_js_1 = __webpack_require__(41247);
Object.defineProperty(exports, "recoverPublicKey", ({ enumerable: true, get: function () { return recoverPublicKey_js_1.recoverPublicKey; } }));
var recoverTypedDataAddress_js_1 = __webpack_require__(37147);
Object.defineProperty(exports, "recoverTypedDataAddress", ({ enumerable: true, get: function () { return recoverTypedDataAddress_js_1.recoverTypedDataAddress; } }));
var signatureToCompactSignature_js_1 = __webpack_require__(40705);
Object.defineProperty(exports, "signatureToCompactSignature", ({ enumerable: true, get: function () { return signatureToCompactSignature_js_1.signatureToCompactSignature; } }));
var compactSignatureToHex_js_1 = __webpack_require__(82494);
Object.defineProperty(exports, "compactSignatureToHex", ({ enumerable: true, get: function () { return compactSignatureToHex_js_1.compactSignatureToHex; } }));
var signatureToHex_js_1 = __webpack_require__(1251);
Object.defineProperty(exports, "signatureToHex", ({ enumerable: true, get: function () { return signatureToHex_js_1.signatureToHex; } }));
var toRlp_js_1 = __webpack_require__(25943);
Object.defineProperty(exports, "bytesToRlp", ({ enumerable: true, get: function () { return toRlp_js_1.bytesToRlp; } }));
Object.defineProperty(exports, "hexToRlp", ({ enumerable: true, get: function () { return toRlp_js_1.hexToRlp; } }));
Object.defineProperty(exports, "toRlp", ({ enumerable: true, get: function () { return toRlp_js_1.toRlp; } }));
var verifyMessage_js_1 = __webpack_require__(20111);
Object.defineProperty(exports, "verifyMessage", ({ enumerable: true, get: function () { return verifyMessage_js_1.verifyMessage; } }));
var verifyTypedData_js_1 = __webpack_require__(48204);
Object.defineProperty(exports, "verifyTypedData", ({ enumerable: true, get: function () { return verifyTypedData_js_1.verifyTypedData; } }));
var assertRequest_js_1 = __webpack_require__(12546);
Object.defineProperty(exports, "assertRequest", ({ enumerable: true, get: function () { return assertRequest_js_1.assertRequest; } }));
var assertTransaction_js_1 = __webpack_require__(99959);
Object.defineProperty(exports, "assertTransactionEIP1559", ({ enumerable: true, get: function () { return assertTransaction_js_1.assertTransactionEIP1559; } }));
Object.defineProperty(exports, "assertTransactionEIP2930", ({ enumerable: true, get: function () { return assertTransaction_js_1.assertTransactionEIP2930; } }));
Object.defineProperty(exports, "assertTransactionLegacy", ({ enumerable: true, get: function () { return assertTransaction_js_1.assertTransactionLegacy; } }));
var toBytes_js_1 = __webpack_require__(82750);
Object.defineProperty(exports, "boolToBytes", ({ enumerable: true, get: function () { return toBytes_js_1.boolToBytes; } }));
Object.defineProperty(exports, "hexToBytes", ({ enumerable: true, get: function () { return toBytes_js_1.hexToBytes; } }));
Object.defineProperty(exports, "numberToBytes", ({ enumerable: true, get: function () { return toBytes_js_1.numberToBytes; } }));
Object.defineProperty(exports, "stringToBytes", ({ enumerable: true, get: function () { return toBytes_js_1.stringToBytes; } }));
Object.defineProperty(exports, "toBytes", ({ enumerable: true, get: function () { return toBytes_js_1.toBytes; } }));
var toHex_js_1 = __webpack_require__(86340);
Object.defineProperty(exports, "boolToHex", ({ enumerable: true, get: function () { return toHex_js_1.boolToHex; } }));
Object.defineProperty(exports, "bytesToHex", ({ enumerable: true, get: function () { return toHex_js_1.bytesToHex; } }));
Object.defineProperty(exports, "numberToHex", ({ enumerable: true, get: function () { return toHex_js_1.numberToHex; } }));
Object.defineProperty(exports, "stringToHex", ({ enumerable: true, get: function () { return toHex_js_1.stringToHex; } }));
Object.defineProperty(exports, "toHex", ({ enumerable: true, get: function () { return toHex_js_1.toHex; } }));
var fromBytes_js_1 = __webpack_require__(55293);
Object.defineProperty(exports, "bytesToBigInt", ({ enumerable: true, get: function () { return fromBytes_js_1.bytesToBigInt; } }));
Object.defineProperty(exports, "bytesToBigint", ({ enumerable: true, get: function () { return fromBytes_js_1.bytesToBigInt; } }));
Object.defineProperty(exports, "bytesToBool", ({ enumerable: true, get: function () { return fromBytes_js_1.bytesToBool; } }));
Object.defineProperty(exports, "bytesToNumber", ({ enumerable: true, get: function () { return fromBytes_js_1.bytesToNumber; } }));
Object.defineProperty(exports, "bytesToString", ({ enumerable: true, get: function () { return fromBytes_js_1.bytesToString; } }));
Object.defineProperty(exports, "fromBytes", ({ enumerable: true, get: function () { return fromBytes_js_1.fromBytes; } }));
var ccip_js_1 = __webpack_require__(61091);
Object.defineProperty(exports, "ccipFetch", ({ enumerable: true, get: function () { return ccip_js_1.ccipFetch; } }));
Object.defineProperty(exports, "offchainLookup", ({ enumerable: true, get: function () { return ccip_js_1.offchainLookup; } }));
Object.defineProperty(exports, "offchainLookupAbiItem", ({ enumerable: true, get: function () { return ccip_js_1.offchainLookupAbiItem; } }));
Object.defineProperty(exports, "offchainLookupSignature", ({ enumerable: true, get: function () { return ccip_js_1.offchainLookupSignature; } }));
var concat_js_1 = __webpack_require__(15991);
Object.defineProperty(exports, "concat", ({ enumerable: true, get: function () { return concat_js_1.concat; } }));
Object.defineProperty(exports, "concatBytes", ({ enumerable: true, get: function () { return concat_js_1.concatBytes; } }));
Object.defineProperty(exports, "concatHex", ({ enumerable: true, get: function () { return concat_js_1.concatHex; } }));
var assertCurrentChain_js_1 = __webpack_require__(63602);
Object.defineProperty(exports, "assertCurrentChain", ({ enumerable: true, get: function () { return assertCurrentChain_js_1.assertCurrentChain; } }));
var defineChain_js_1 = __webpack_require__(54416);
Object.defineProperty(exports, "defineChain", ({ enumerable: true, get: function () { return defineChain_js_1.defineChain; } }));
var extractChain_js_1 = __webpack_require__(7479);
Object.defineProperty(exports, "extractChain", ({ enumerable: true, get: function () { return extractChain_js_1.extractChain; } }));
var getChainContractAddress_js_1 = __webpack_require__(30245);
Object.defineProperty(exports, "getChainContractAddress", ({ enumerable: true, get: function () { return getChainContractAddress_js_1.getChainContractAddress; } }));
var encodePacked_js_1 = __webpack_require__(63865);
Object.defineProperty(exports, "encodePacked", ({ enumerable: true, get: function () { return encodePacked_js_1.encodePacked; } }));
var formatEther_js_1 = __webpack_require__(83032);
Object.defineProperty(exports, "formatEther", ({ enumerable: true, get: function () { return formatEther_js_1.formatEther; } }));
var formatGwei_js_1 = __webpack_require__(89978);
Object.defineProperty(exports, "formatGwei", ({ enumerable: true, get: function () { return formatGwei_js_1.formatGwei; } }));
var formatUnits_js_1 = __webpack_require__(29339);
Object.defineProperty(exports, "formatUnits", ({ enumerable: true, get: function () { return formatUnits_js_1.formatUnits; } }));
var fromHex_js_1 = __webpack_require__(50159);
Object.defineProperty(exports, "fromHex", ({ enumerable: true, get: function () { return fromHex_js_1.fromHex; } }));
Object.defineProperty(exports, "hexToBigInt", ({ enumerable: true, get: function () { return fromHex_js_1.hexToBigInt; } }));
Object.defineProperty(exports, "hexToBool", ({ enumerable: true, get: function () { return fromHex_js_1.hexToBool; } }));
Object.defineProperty(exports, "hexToNumber", ({ enumerable: true, get: function () { return fromHex_js_1.hexToNumber; } }));
Object.defineProperty(exports, "hexToString", ({ enumerable: true, get: function () { return fromHex_js_1.hexToString; } }));
var fromRlp_js_1 = __webpack_require__(25744);
Object.defineProperty(exports, "fromRlp", ({ enumerable: true, get: function () { return fromRlp_js_1.fromRlp; } }));
var getAddress_js_1 = __webpack_require__(18717);
Object.defineProperty(exports, "checksumAddress", ({ enumerable: true, get: function () { return getAddress_js_1.checksumAddress; } }));
Object.defineProperty(exports, "getAddress", ({ enumerable: true, get: function () { return getAddress_js_1.getAddress; } }));
var getContractError_js_1 = __webpack_require__(92154);
Object.defineProperty(exports, "getContractError", ({ enumerable: true, get: function () { return getContractError_js_1.getContractError; } }));
var getEventSelector_js_1 = __webpack_require__(33938);
Object.defineProperty(exports, "getEventSelector", ({ enumerable: true, get: function () { return getEventSelector_js_1.getEventSelector; } }));
var getEventSignature_js_1 = __webpack_require__(63593);
Object.defineProperty(exports, "getEventSignature", ({ enumerable: true, get: function () { return getEventSignature_js_1.getEventSignature; } }));
var getFunctionSelector_js_1 = __webpack_require__(44402);
Object.defineProperty(exports, "getFunctionSelector", ({ enumerable: true, get: function () { return getFunctionSelector_js_1.getFunctionSelector; } }));
var getFunctionSignature_js_1 = __webpack_require__(92393);
Object.defineProperty(exports, "getFunctionSignature", ({ enumerable: true, get: function () { return getFunctionSignature_js_1.getFunctionSignature; } }));
var hashMessage_js_1 = __webpack_require__(10416);
Object.defineProperty(exports, "hashMessage", ({ enumerable: true, get: function () { return hashMessage_js_1.hashMessage; } }));
var isAddress_js_1 = __webpack_require__(81061);
Object.defineProperty(exports, "isAddress", ({ enumerable: true, get: function () { return isAddress_js_1.isAddress; } }));
var isAddressEqual_js_1 = __webpack_require__(47681);
Object.defineProperty(exports, "isAddressEqual", ({ enumerable: true, get: function () { return isAddressEqual_js_1.isAddressEqual; } }));
var isBytes_js_1 = __webpack_require__(62968);
Object.defineProperty(exports, "isBytes", ({ enumerable: true, get: function () { return isBytes_js_1.isBytes; } }));
var isHash_js_1 = __webpack_require__(12903);
Object.defineProperty(exports, "isHash", ({ enumerable: true, get: function () { return isHash_js_1.isHash; } }));
var isHex_js_1 = __webpack_require__(88846);
Object.defineProperty(exports, "isHex", ({ enumerable: true, get: function () { return isHex_js_1.isHex; } }));
var keccak256_js_1 = __webpack_require__(43708);
Object.defineProperty(exports, "keccak256", ({ enumerable: true, get: function () { return keccak256_js_1.keccak256; } }));
var sha256_js_1 = __webpack_require__(61764);
Object.defineProperty(exports, "sha256", ({ enumerable: true, get: function () { return sha256_js_1.sha256; } }));
var ripemd160_js_1 = __webpack_require__(17883);
Object.defineProperty(exports, "ripemd160", ({ enumerable: true, get: function () { return ripemd160_js_1.ripemd160; } }));
var pad_js_1 = __webpack_require__(18046);
Object.defineProperty(exports, "pad", ({ enumerable: true, get: function () { return pad_js_1.pad; } }));
Object.defineProperty(exports, "padBytes", ({ enumerable: true, get: function () { return pad_js_1.padBytes; } }));
Object.defineProperty(exports, "padHex", ({ enumerable: true, get: function () { return pad_js_1.padHex; } }));
var parseEther_js_1 = __webpack_require__(8180);
Object.defineProperty(exports, "parseEther", ({ enumerable: true, get: function () { return parseEther_js_1.parseEther; } }));
var parseGwei_js_1 = __webpack_require__(10526);
Object.defineProperty(exports, "parseGwei", ({ enumerable: true, get: function () { return parseGwei_js_1.parseGwei; } }));
var parseTransaction_js_1 = __webpack_require__(92000);
Object.defineProperty(exports, "parseTransaction", ({ enumerable: true, get: function () { return parseTransaction_js_1.parseTransaction; } }));
var parseUnits_js_1 = __webpack_require__(70503);
Object.defineProperty(exports, "parseUnits", ({ enumerable: true, get: function () { return parseUnits_js_1.parseUnits; } }));
var serializeAccessList_js_1 = __webpack_require__(22297);
Object.defineProperty(exports, "serializeAccessList", ({ enumerable: true, get: function () { return serializeAccessList_js_1.serializeAccessList; } }));
var serializeTransaction_js_1 = __webpack_require__(14847);
Object.defineProperty(exports, "serializeTransaction", ({ enumerable: true, get: function () { return serializeTransaction_js_1.serializeTransaction; } }));
var size_js_1 = __webpack_require__(82026);
Object.defineProperty(exports, "size", ({ enumerable: true, get: function () { return size_js_1.size; } }));
var slice_js_1 = __webpack_require__(61909);
Object.defineProperty(exports, "slice", ({ enumerable: true, get: function () { return slice_js_1.slice; } }));
Object.defineProperty(exports, "sliceBytes", ({ enumerable: true, get: function () { return slice_js_1.sliceBytes; } }));
Object.defineProperty(exports, "sliceHex", ({ enumerable: true, get: function () { return slice_js_1.sliceHex; } }));
var stringify_js_1 = __webpack_require__(68395);
Object.defineProperty(exports, "stringify", ({ enumerable: true, get: function () { return stringify_js_1.stringify; } }));
var trim_js_1 = __webpack_require__(45611);
Object.defineProperty(exports, "trim", ({ enumerable: true, get: function () { return trim_js_1.trim; } }));
var typedData_js_1 = __webpack_require__(25330);
Object.defineProperty(exports, "validateTypedData", ({ enumerable: true, get: function () { return typedData_js_1.validateTypedData; } }));
Object.defineProperty(exports, "domainSeparator", ({ enumerable: true, get: function () { return typedData_js_1.domainSeparator; } }));
Object.defineProperty(exports, "getTypesForEIP712Domain", ({ enumerable: true, get: function () { return typedData_js_1.getTypesForEIP712Domain; } }));
//# sourceMappingURL=index.js.map

/***/ }),

/***/ 16615:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.decodeAbiParameters = void 0;
const abi_js_1 = __webpack_require__(5432);
const getAddress_js_1 = __webpack_require__(18717);
const size_js_1 = __webpack_require__(82026);
const slice_js_1 = __webpack_require__(61909);
const trim_js_1 = __webpack_require__(45611);
const fromHex_js_1 = __webpack_require__(50159);
const encodeAbiParameters_js_1 = __webpack_require__(82671);
function decodeAbiParameters(params, data) {
    if (data === '0x' && params.length > 0)
        throw new abi_js_1.AbiDecodingZeroDataError();
    if ((0, size_js_1.size)(data) && (0, size_js_1.size)(data) < 32)
        throw new abi_js_1.AbiDecodingDataSizeTooSmallError({
            data,
            params: params,
            size: (0, size_js_1.size)(data),
        });
    return decodeParams({
        data,
        params: params,
    });
}
exports.decodeAbiParameters = decodeAbiParameters;
function decodeParams({ data, params, }) {
    const decodedValues = [];
    let position = 0;
    for (let i = 0; i < params.length; i++) {
        if (position >= (0, size_js_1.size)(data))
            throw new abi_js_1.AbiDecodingDataSizeTooSmallError({
                data,
                params,
                size: (0, size_js_1.size)(data),
            });
        const param = params[i];
        const { consumed, value } = decodeParam({ data, param, position });
        decodedValues.push(value);
        position += consumed;
    }
    return decodedValues;
}
function decodeParam({ data, param, position, }) {
    const arrayComponents = (0, encodeAbiParameters_js_1.getArrayComponents)(param.type);
    if (arrayComponents) {
        const [length, type] = arrayComponents;
        return decodeArray(data, {
            length,
            param: { ...param, type: type },
            position,
        });
    }
    if (param.type === 'tuple') {
        return decodeTuple(data, { param: param, position });
    }
    if (param.type === 'string') {
        return decodeString(data, { position });
    }
    if (param.type.startsWith('bytes')) {
        return decodeBytes(data, { param, position });
    }
    const value = (0, slice_js_1.slice)(data, position, position + 32, { strict: true });
    if (param.type.startsWith('uint') || param.type.startsWith('int')) {
        return decodeNumber(value, { param });
    }
    if (param.type === 'address') {
        return decodeAddress(value);
    }
    if (param.type === 'bool') {
        return decodeBool(value);
    }
    throw new abi_js_1.InvalidAbiDecodingTypeError(param.type, {
        docsPath: '/docs/contract/decodeAbiParameters',
    });
}
function decodeAddress(value) {
    return { consumed: 32, value: (0, getAddress_js_1.checksumAddress)((0, slice_js_1.slice)(value, -20)) };
}
function decodeArray(data, { param, length, position, }) {
    if (!length) {
        const offset = (0, fromHex_js_1.hexToNumber)((0, slice_js_1.slice)(data, position, position + 32, { strict: true }));
        const length = (0, fromHex_js_1.hexToNumber)((0, slice_js_1.slice)(data, offset, offset + 32, { strict: true }));
        let consumed = 0;
        const value = [];
        for (let i = 0; i < length; ++i) {
            const decodedChild = decodeParam({
                data: (0, slice_js_1.slice)(data, offset + 32),
                param,
                position: consumed,
            });
            consumed += decodedChild.consumed;
            value.push(decodedChild.value);
        }
        return { value, consumed: 32 };
    }
    if (hasDynamicChild(param)) {
        const arrayComponents = (0, encodeAbiParameters_js_1.getArrayComponents)(param.type);
        const dynamicChild = !arrayComponents?.[0];
        let consumed = 0;
        const value = [];
        for (let i = 0; i < length; ++i) {
            const offset = (0, fromHex_js_1.hexToNumber)((0, slice_js_1.slice)(data, position, position + 32, { strict: true }));
            const decodedChild = decodeParam({
                data: (0, slice_js_1.slice)(data, offset),
                param,
                position: dynamicChild ? consumed : i * 32,
            });
            consumed += decodedChild.consumed;
            value.push(decodedChild.value);
        }
        return { value, consumed: 32 };
    }
    let consumed = 0;
    const value = [];
    for (let i = 0; i < length; ++i) {
        const decodedChild = decodeParam({
            data,
            param,
            position: position + consumed,
        });
        consumed += decodedChild.consumed;
        value.push(decodedChild.value);
    }
    return { value, consumed };
}
function decodeBool(value) {
    return { consumed: 32, value: (0, fromHex_js_1.hexToBool)(value) };
}
function decodeBytes(data, { param, position }) {
    const [_, size] = param.type.split('bytes');
    if (!size) {
        const offset = (0, fromHex_js_1.hexToNumber)((0, slice_js_1.slice)(data, position, position + 32, { strict: true }));
        const length = (0, fromHex_js_1.hexToNumber)((0, slice_js_1.slice)(data, offset, offset + 32, { strict: true }));
        if (length === 0)
            return { consumed: 32, value: '0x' };
        const value = (0, slice_js_1.slice)(data, offset + 32, offset + 32 + length, {
            strict: true,
        });
        return { consumed: 32, value };
    }
    const value = (0, slice_js_1.slice)(data, position, position + parseInt(size), {
        strict: true,
    });
    return { consumed: 32, value };
}
function decodeNumber(value, { param }) {
    const signed = param.type.startsWith('int');
    const size = parseInt(param.type.split('int')[1] || '256');
    return {
        consumed: 32,
        value: size > 48
            ? (0, fromHex_js_1.hexToBigInt)(value, { signed })
            : (0, fromHex_js_1.hexToNumber)(value, { signed }),
    };
}
function decodeString(data, { position }) {
    const offset = (0, fromHex_js_1.hexToNumber)((0, slice_js_1.slice)(data, position, position + 32, { strict: true }));
    const length = (0, fromHex_js_1.hexToNumber)((0, slice_js_1.slice)(data, offset, offset + 32, { strict: true }));
    if (length === 0)
        return { consumed: 32, value: '' };
    const value = (0, fromHex_js_1.hexToString)((0, trim_js_1.trim)((0, slice_js_1.slice)(data, offset + 32, offset + 32 + length, { strict: true })));
    return { consumed: 32, value };
}
function decodeTuple(data, { param, position }) {
    const hasUnnamedChild = param.components.length === 0 || param.components.some(({ name }) => !name);
    const value = hasUnnamedChild ? [] : {};
    let consumed = 0;
    if (hasDynamicChild(param)) {
        const offset = (0, fromHex_js_1.hexToNumber)((0, slice_js_1.slice)(data, position, position + 32, { strict: true }));
        for (let i = 0; i < param.components.length; ++i) {
            const component = param.components[i];
            const decodedChild = decodeParam({
                data: (0, slice_js_1.slice)(data, offset),
                param: component,
                position: consumed,
            });
            consumed += decodedChild.consumed;
            value[hasUnnamedChild ? i : component?.name] = decodedChild.value;
        }
        return { consumed: 32, value };
    }
    for (let i = 0; i < param.components.length; ++i) {
        const component = param.components[i];
        const decodedChild = decodeParam({
            data,
            param: component,
            position: position + consumed,
        });
        consumed += decodedChild.consumed;
        value[hasUnnamedChild ? i : component?.name] = decodedChild.value;
    }
    return { consumed, value };
}
function hasDynamicChild(param) {
    const { type } = param;
    if (type === 'string')
        return true;
    if (type === 'bytes')
        return true;
    if (type.endsWith('[]'))
        return true;
    if (type === 'tuple')
        return param.components?.some(hasDynamicChild);
    const arrayComponents = (0, encodeAbiParameters_js_1.getArrayComponents)(param.type);
    if (arrayComponents &&
        hasDynamicChild({ ...param, type: arrayComponents[1] }))
        return true;
    return false;
}
//# sourceMappingURL=decodeAbiParameters.js.map

/***/ }),

/***/ 38878:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.decodeDeployData = void 0;
const abi_js_1 = __webpack_require__(5432);
const decodeAbiParameters_js_1 = __webpack_require__(16615);
const docsPath = '/docs/contract/decodeDeployData';
function decodeDeployData({ abi, bytecode, data, }) {
    if (data === bytecode)
        return { bytecode };
    const description = abi.find((x) => 'type' in x && x.type === 'constructor');
    if (!description)
        throw new abi_js_1.AbiConstructorNotFoundError({ docsPath });
    if (!('inputs' in description))
        throw new abi_js_1.AbiConstructorParamsNotFoundError({ docsPath });
    if (!description.inputs || description.inputs.length === 0)
        throw new abi_js_1.AbiConstructorParamsNotFoundError({ docsPath });
    const args = (0, decodeAbiParameters_js_1.decodeAbiParameters)(description.inputs, `0x${data.replace(bytecode, '')}`);
    return { args, bytecode };
}
exports.decodeDeployData = decodeDeployData;
//# sourceMappingURL=decodeDeployData.js.map

/***/ }),

/***/ 33058:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.decodeErrorResult = void 0;
const solidity_js_1 = __webpack_require__(83305);
const abi_js_1 = __webpack_require__(5432);
const slice_js_1 = __webpack_require__(61909);
const getFunctionSelector_js_1 = __webpack_require__(44402);
const decodeAbiParameters_js_1 = __webpack_require__(16615);
const formatAbiItem_js_1 = __webpack_require__(36859);
function decodeErrorResult({ abi, data, }) {
    const signature = (0, slice_js_1.slice)(data, 0, 4);
    if (signature === '0x')
        throw new abi_js_1.AbiDecodingZeroDataError();
    const abi_ = [...(abi || []), solidity_js_1.solidityError, solidity_js_1.solidityPanic];
    const abiItem = abi_.find((x) => x.type === 'error' && signature === (0, getFunctionSelector_js_1.getFunctionSelector)((0, formatAbiItem_js_1.formatAbiItem)(x)));
    if (!abiItem)
        throw new abi_js_1.AbiErrorSignatureNotFoundError(signature, {
            docsPath: '/docs/contract/decodeErrorResult',
        });
    return {
        abiItem,
        args: ('inputs' in abiItem && abiItem.inputs && abiItem.inputs.length > 0
            ? (0, decodeAbiParameters_js_1.decodeAbiParameters)(abiItem.inputs, (0, slice_js_1.slice)(data, 4))
            : undefined),
        errorName: abiItem.name,
    };
}
exports.decodeErrorResult = decodeErrorResult;
//# sourceMappingURL=decodeErrorResult.js.map

/***/ }),

/***/ 83327:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.decodeEventLog = void 0;
const abi_js_1 = __webpack_require__(5432);
const getEventSelector_js_1 = __webpack_require__(33938);
const decodeAbiParameters_js_1 = __webpack_require__(16615);
const formatAbiItem_js_1 = __webpack_require__(36859);
const docsPath = '/docs/contract/decodeEventLog';
function decodeEventLog({ abi, data, strict: strict_, topics, }) {
    const strict = strict_ ?? true;
    const [signature, ...argTopics] = topics;
    if (!signature)
        throw new abi_js_1.AbiEventSignatureEmptyTopicsError({
            docsPath,
        });
    const abiItem = abi.find((x) => x.type === 'event' &&
        signature === (0, getEventSelector_js_1.getEventSelector)((0, formatAbiItem_js_1.formatAbiItem)(x)));
    if (!(abiItem && 'name' in abiItem) || abiItem.type !== 'event')
        throw new abi_js_1.AbiEventSignatureNotFoundError(signature, {
            docsPath,
        });
    const { name, inputs } = abiItem;
    const isUnnamed = inputs?.some((x) => !('name' in x && x.name));
    let args = isUnnamed ? [] : {};
    const indexedInputs = inputs.filter((x) => 'indexed' in x && x.indexed);
    for (let i = 0; i < indexedInputs.length; i++) {
        const param = indexedInputs[i];
        const topic = argTopics[i];
        if (!topic)
            throw new abi_js_1.DecodeLogTopicsMismatch({
                abiItem,
                param: param,
            });
        args[param.name || i] = decodeTopic({ param, value: topic });
    }
    const nonIndexedInputs = inputs.filter((x) => !('indexed' in x && x.indexed));
    if (nonIndexedInputs.length > 0) {
        if (data && data !== '0x') {
            try {
                const decodedData = (0, decodeAbiParameters_js_1.decodeAbiParameters)(nonIndexedInputs, data);
                if (decodedData) {
                    if (isUnnamed)
                        args = [...args, ...decodedData];
                    else {
                        for (let i = 0; i < nonIndexedInputs.length; i++) {
                            args[nonIndexedInputs[i].name] = decodedData[i];
                        }
                    }
                }
            }
            catch (err) {
                if (strict) {
                    if (err instanceof abi_js_1.AbiDecodingDataSizeTooSmallError)
                        throw new abi_js_1.DecodeLogDataMismatch({
                            abiItem,
                            data: err.data,
                            params: err.params,
                            size: err.size,
                        });
                    throw err;
                }
            }
        }
        else if (strict) {
            throw new abi_js_1.DecodeLogDataMismatch({
                abiItem,
                data: '0x',
                params: nonIndexedInputs,
                size: 0,
            });
        }
    }
    return {
        eventName: name,
        args: Object.values(args).length > 0 ? args : undefined,
    };
}
exports.decodeEventLog = decodeEventLog;
function decodeTopic({ param, value }) {
    if (param.type === 'string' ||
        param.type === 'bytes' ||
        param.type === 'tuple' ||
        param.type.match(/^(.*)\[(\d+)?\]$/))
        return value;
    const decodedArg = (0, decodeAbiParameters_js_1.decodeAbiParameters)([param], value) || [];
    return decodedArg[0];
}
//# sourceMappingURL=decodeEventLog.js.map

/***/ }),

/***/ 81973:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.decodeFunctionData = void 0;
const abi_js_1 = __webpack_require__(5432);
const slice_js_1 = __webpack_require__(61909);
const getFunctionSelector_js_1 = __webpack_require__(44402);
const decodeAbiParameters_js_1 = __webpack_require__(16615);
const formatAbiItem_js_1 = __webpack_require__(36859);
function decodeFunctionData({ abi, data, }) {
    const signature = (0, slice_js_1.slice)(data, 0, 4);
    const description = abi.find((x) => x.type === 'function' &&
        signature === (0, getFunctionSelector_js_1.getFunctionSelector)((0, formatAbiItem_js_1.formatAbiItem)(x)));
    if (!description)
        throw new abi_js_1.AbiFunctionSignatureNotFoundError(signature, {
            docsPath: '/docs/contract/decodeFunctionData',
        });
    return {
        functionName: description.name,
        args: ('inputs' in description &&
            description.inputs &&
            description.inputs.length > 0
            ? (0, decodeAbiParameters_js_1.decodeAbiParameters)(description.inputs, (0, slice_js_1.slice)(data, 4))
            : undefined),
    };
}
exports.decodeFunctionData = decodeFunctionData;
//# sourceMappingURL=decodeFunctionData.js.map

/***/ }),

/***/ 22080:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.decodeFunctionResult = void 0;
const abi_js_1 = __webpack_require__(5432);
const decodeAbiParameters_js_1 = __webpack_require__(16615);
const getAbiItem_js_1 = __webpack_require__(79606);
const docsPath = '/docs/contract/decodeFunctionResult';
function decodeFunctionResult({ abi, args, functionName, data, }) {
    let abiItem = abi[0];
    if (functionName) {
        abiItem = (0, getAbiItem_js_1.getAbiItem)({
            abi,
            args,
            name: functionName,
        });
        if (!abiItem)
            throw new abi_js_1.AbiFunctionNotFoundError(functionName, { docsPath });
    }
    if (abiItem.type !== 'function')
        throw new abi_js_1.AbiFunctionNotFoundError(undefined, { docsPath });
    if (!abiItem.outputs)
        throw new abi_js_1.AbiFunctionOutputsNotFoundError(abiItem.name, { docsPath });
    const values = (0, decodeAbiParameters_js_1.decodeAbiParameters)(abiItem.outputs, data);
    if (values && values.length > 1)
        return values;
    if (values && values.length === 1)
        return values[0];
    return undefined;
}
exports.decodeFunctionResult = decodeFunctionResult;
//# sourceMappingURL=decodeFunctionResult.js.map

/***/ }),

/***/ 82671:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getArrayComponents = exports.encodeAbiParameters = void 0;
const abi_js_1 = __webpack_require__(5432);
const address_js_1 = __webpack_require__(64422);
const isAddress_js_1 = __webpack_require__(81061);
const concat_js_1 = __webpack_require__(15991);
const pad_js_1 = __webpack_require__(18046);
const size_js_1 = __webpack_require__(82026);
const slice_js_1 = __webpack_require__(61909);
const toHex_js_1 = __webpack_require__(86340);
function encodeAbiParameters(params, values) {
    if (params.length !== values.length)
        throw new abi_js_1.AbiEncodingLengthMismatchError({
            expectedLength: params.length,
            givenLength: values.length,
        });
    const preparedParams = prepareParams({
        params: params,
        values,
    });
    const data = encodeParams(preparedParams);
    if (data.length === 0)
        return '0x';
    return data;
}
exports.encodeAbiParameters = encodeAbiParameters;
function prepareParams({ params, values, }) {
    const preparedParams = [];
    for (let i = 0; i < params.length; i++) {
        preparedParams.push(prepareParam({ param: params[i], value: values[i] }));
    }
    return preparedParams;
}
function prepareParam({ param, value, }) {
    const arrayComponents = getArrayComponents(param.type);
    if (arrayComponents) {
        const [length, type] = arrayComponents;
        return encodeArray(value, { length, param: { ...param, type } });
    }
    if (param.type === 'tuple') {
        return encodeTuple(value, {
            param: param,
        });
    }
    if (param.type === 'address') {
        return encodeAddress(value);
    }
    if (param.type === 'bool') {
        return encodeBool(value);
    }
    if (param.type.startsWith('uint') || param.type.startsWith('int')) {
        const signed = param.type.startsWith('int');
        return encodeNumber(value, { signed });
    }
    if (param.type.startsWith('bytes')) {
        return encodeBytes(value, { param });
    }
    if (param.type === 'string') {
        return encodeString(value);
    }
    throw new abi_js_1.InvalidAbiEncodingTypeError(param.type, {
        docsPath: '/docs/contract/encodeAbiParameters',
    });
}
function encodeParams(preparedParams) {
    let staticSize = 0;
    for (let i = 0; i < preparedParams.length; i++) {
        const { dynamic, encoded } = preparedParams[i];
        if (dynamic)
            staticSize += 32;
        else
            staticSize += (0, size_js_1.size)(encoded);
    }
    const staticParams = [];
    const dynamicParams = [];
    let dynamicSize = 0;
    for (let i = 0; i < preparedParams.length; i++) {
        const { dynamic, encoded } = preparedParams[i];
        if (dynamic) {
            staticParams.push((0, toHex_js_1.numberToHex)(staticSize + dynamicSize, { size: 32 }));
            dynamicParams.push(encoded);
            dynamicSize += (0, size_js_1.size)(encoded);
        }
        else {
            staticParams.push(encoded);
        }
    }
    return (0, concat_js_1.concat)([...staticParams, ...dynamicParams]);
}
function encodeAddress(value) {
    if (!(0, isAddress_js_1.isAddress)(value))
        throw new address_js_1.InvalidAddressError({ address: value });
    return { dynamic: false, encoded: (0, pad_js_1.padHex)(value.toLowerCase()) };
}
function encodeArray(value, { length, param, }) {
    const dynamic = length === null;
    if (!Array.isArray(value))
        throw new abi_js_1.InvalidArrayError(value);
    if (!dynamic && value.length !== length)
        throw new abi_js_1.AbiEncodingArrayLengthMismatchError({
            expectedLength: length,
            givenLength: value.length,
            type: `${param.type}[${length}]`,
        });
    let dynamicChild = false;
    const preparedParams = [];
    for (let i = 0; i < value.length; i++) {
        const preparedParam = prepareParam({ param, value: value[i] });
        if (preparedParam.dynamic)
            dynamicChild = true;
        preparedParams.push(preparedParam);
    }
    if (dynamic || dynamicChild) {
        const data = encodeParams(preparedParams);
        if (dynamic) {
            const length = (0, toHex_js_1.numberToHex)(preparedParams.length, { size: 32 });
            return {
                dynamic: true,
                encoded: preparedParams.length > 0 ? (0, concat_js_1.concat)([length, data]) : length,
            };
        }
        if (dynamicChild)
            return { dynamic: true, encoded: data };
    }
    return {
        dynamic: false,
        encoded: (0, concat_js_1.concat)(preparedParams.map(({ encoded }) => encoded)),
    };
}
function encodeBytes(value, { param }) {
    const [, paramSize] = param.type.split('bytes');
    const bytesSize = (0, size_js_1.size)(value);
    if (!paramSize) {
        let value_ = value;
        if (bytesSize % 32 !== 0)
            value_ = (0, pad_js_1.padHex)(value_, {
                dir: 'right',
                size: Math.ceil((value.length - 2) / 2 / 32) * 32,
            });
        return {
            dynamic: true,
            encoded: (0, concat_js_1.concat)([(0, pad_js_1.padHex)((0, toHex_js_1.numberToHex)(bytesSize, { size: 32 })), value_]),
        };
    }
    if (bytesSize !== parseInt(paramSize))
        throw new abi_js_1.AbiEncodingBytesSizeMismatchError({
            expectedSize: parseInt(paramSize),
            value,
        });
    return { dynamic: false, encoded: (0, pad_js_1.padHex)(value, { dir: 'right' }) };
}
function encodeBool(value) {
    return { dynamic: false, encoded: (0, pad_js_1.padHex)((0, toHex_js_1.boolToHex)(value)) };
}
function encodeNumber(value, { signed }) {
    return {
        dynamic: false,
        encoded: (0, toHex_js_1.numberToHex)(value, {
            size: 32,
            signed,
        }),
    };
}
function encodeString(value) {
    const hexValue = (0, toHex_js_1.stringToHex)(value);
    const partsLength = Math.ceil((0, size_js_1.size)(hexValue) / 32);
    const parts = [];
    for (let i = 0; i < partsLength; i++) {
        parts.push((0, pad_js_1.padHex)((0, slice_js_1.slice)(hexValue, i * 32, (i + 1) * 32), {
            dir: 'right',
        }));
    }
    return {
        dynamic: true,
        encoded: (0, concat_js_1.concat)([
            (0, pad_js_1.padHex)((0, toHex_js_1.numberToHex)((0, size_js_1.size)(hexValue), { size: 32 })),
            ...parts,
        ]),
    };
}
function encodeTuple(value, { param }) {
    let dynamic = false;
    const preparedParams = [];
    for (let i = 0; i < param.components.length; i++) {
        const param_ = param.components[i];
        const index = Array.isArray(value) ? i : param_.name;
        const preparedParam = prepareParam({
            param: param_,
            value: value[index],
        });
        preparedParams.push(preparedParam);
        if (preparedParam.dynamic)
            dynamic = true;
    }
    return {
        dynamic,
        encoded: dynamic
            ? encodeParams(preparedParams)
            : (0, concat_js_1.concat)(preparedParams.map(({ encoded }) => encoded)),
    };
}
function getArrayComponents(type) {
    const matches = type.match(/^(.*)\[(\d+)?\]$/);
    return matches
        ?
            [matches[2] ? Number(matches[2]) : null, matches[1]]
        : undefined;
}
exports.getArrayComponents = getArrayComponents;
//# sourceMappingURL=encodeAbiParameters.js.map

/***/ }),

/***/ 76006:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.encodeDeployData = void 0;
const abi_js_1 = __webpack_require__(5432);
const concat_js_1 = __webpack_require__(15991);
const encodeAbiParameters_js_1 = __webpack_require__(82671);
const docsPath = '/docs/contract/encodeDeployData';
function encodeDeployData({ abi, args, bytecode, }) {
    if (!args || args.length === 0)
        return bytecode;
    const description = abi.find((x) => 'type' in x && x.type === 'constructor');
    if (!description)
        throw new abi_js_1.AbiConstructorNotFoundError({ docsPath });
    if (!('inputs' in description))
        throw new abi_js_1.AbiConstructorParamsNotFoundError({ docsPath });
    if (!description.inputs || description.inputs.length === 0)
        throw new abi_js_1.AbiConstructorParamsNotFoundError({ docsPath });
    const data = (0, encodeAbiParameters_js_1.encodeAbiParameters)(description.inputs, args);
    return (0, concat_js_1.concatHex)([bytecode, data]);
}
exports.encodeDeployData = encodeDeployData;
//# sourceMappingURL=encodeDeployData.js.map

/***/ }),

/***/ 32778:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.encodeErrorResult = void 0;
const abi_js_1 = __webpack_require__(5432);
const concat_js_1 = __webpack_require__(15991);
const getFunctionSelector_js_1 = __webpack_require__(44402);
const encodeAbiParameters_js_1 = __webpack_require__(82671);
const formatAbiItem_js_1 = __webpack_require__(36859);
const getAbiItem_js_1 = __webpack_require__(79606);
const docsPath = '/docs/contract/encodeErrorResult';
function encodeErrorResult({ abi, errorName, args }) {
    let abiItem = abi[0];
    if (errorName) {
        abiItem = (0, getAbiItem_js_1.getAbiItem)({
            abi,
            args,
            name: errorName,
        });
        if (!abiItem)
            throw new abi_js_1.AbiErrorNotFoundError(errorName, { docsPath });
    }
    if (abiItem.type !== 'error')
        throw new abi_js_1.AbiErrorNotFoundError(undefined, { docsPath });
    const definition = (0, formatAbiItem_js_1.formatAbiItem)(abiItem);
    const signature = (0, getFunctionSelector_js_1.getFunctionSelector)(definition);
    let data = '0x';
    if (args && args.length > 0) {
        if (!abiItem.inputs)
            throw new abi_js_1.AbiErrorInputsNotFoundError(abiItem.name, { docsPath });
        data = (0, encodeAbiParameters_js_1.encodeAbiParameters)(abiItem.inputs, args);
    }
    return (0, concat_js_1.concatHex)([signature, data]);
}
exports.encodeErrorResult = encodeErrorResult;
//# sourceMappingURL=encodeErrorResult.js.map

/***/ }),

/***/ 38805:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.encodeEventTopics = void 0;
const abi_js_1 = __webpack_require__(5432);
const log_js_1 = __webpack_require__(9780);
const toBytes_js_1 = __webpack_require__(82750);
const getEventSelector_js_1 = __webpack_require__(33938);
const keccak256_js_1 = __webpack_require__(43708);
const encodeAbiParameters_js_1 = __webpack_require__(82671);
const formatAbiItem_js_1 = __webpack_require__(36859);
const getAbiItem_js_1 = __webpack_require__(79606);
function encodeEventTopics({ abi, eventName, args }) {
    let abiItem = abi[0];
    if (eventName) {
        abiItem = (0, getAbiItem_js_1.getAbiItem)({
            abi,
            args,
            name: eventName,
        });
        if (!abiItem)
            throw new abi_js_1.AbiEventNotFoundError(eventName, {
                docsPath: '/docs/contract/encodeEventTopics',
            });
    }
    if (abiItem.type !== 'event')
        throw new abi_js_1.AbiEventNotFoundError(undefined, {
            docsPath: '/docs/contract/encodeEventTopics',
        });
    const definition = (0, formatAbiItem_js_1.formatAbiItem)(abiItem);
    const signature = (0, getEventSelector_js_1.getEventSelector)(definition);
    let topics = [];
    if (args && 'inputs' in abiItem) {
        const indexedInputs = abiItem.inputs?.filter((param) => 'indexed' in param && param.indexed);
        const args_ = Array.isArray(args)
            ? args
            : Object.values(args).length > 0
                ? indexedInputs?.map((x) => args[x.name]) ?? []
                : [];
        if (args_.length > 0) {
            topics =
                indexedInputs?.map((param, i) => Array.isArray(args_[i])
                    ? args_[i].map((_, j) => encodeArg({ param, value: args_[i][j] }))
                    : args_[i]
                        ? encodeArg({ param, value: args_[i] })
                        : null) ?? [];
        }
    }
    return [signature, ...topics];
}
exports.encodeEventTopics = encodeEventTopics;
function encodeArg({ param, value, }) {
    if (param.type === 'string' || param.type === 'bytes')
        return (0, keccak256_js_1.keccak256)((0, toBytes_js_1.toBytes)(value));
    if (param.type === 'tuple' || param.type.match(/^(.*)\[(\d+)?\]$/))
        throw new log_js_1.FilterTypeNotSupportedError(param.type);
    return (0, encodeAbiParameters_js_1.encodeAbiParameters)([param], [value]);
}
//# sourceMappingURL=encodeEventTopics.js.map

/***/ }),

/***/ 99117:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.encodeFunctionData = void 0;
const abi_js_1 = __webpack_require__(5432);
const concat_js_1 = __webpack_require__(15991);
const getFunctionSelector_js_1 = __webpack_require__(44402);
const encodeAbiParameters_js_1 = __webpack_require__(82671);
const formatAbiItem_js_1 = __webpack_require__(36859);
const getAbiItem_js_1 = __webpack_require__(79606);
function encodeFunctionData({ abi, args, functionName, }) {
    let abiItem = abi[0];
    if (functionName) {
        abiItem = (0, getAbiItem_js_1.getAbiItem)({
            abi,
            args,
            name: functionName,
        });
        if (!abiItem)
            throw new abi_js_1.AbiFunctionNotFoundError(functionName, {
                docsPath: '/docs/contract/encodeFunctionData',
            });
    }
    if (abiItem.type !== 'function')
        throw new abi_js_1.AbiFunctionNotFoundError(undefined, {
            docsPath: '/docs/contract/encodeFunctionData',
        });
    const definition = (0, formatAbiItem_js_1.formatAbiItem)(abiItem);
    const signature = (0, getFunctionSelector_js_1.getFunctionSelector)(definition);
    const data = 'inputs' in abiItem && abiItem.inputs
        ? (0, encodeAbiParameters_js_1.encodeAbiParameters)(abiItem.inputs, (args ?? []))
        : undefined;
    return (0, concat_js_1.concatHex)([signature, data ?? '0x']);
}
exports.encodeFunctionData = encodeFunctionData;
//# sourceMappingURL=encodeFunctionData.js.map

/***/ }),

/***/ 52616:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.encodeFunctionResult = void 0;
const abi_js_1 = __webpack_require__(5432);
const encodeAbiParameters_js_1 = __webpack_require__(82671);
const getAbiItem_js_1 = __webpack_require__(79606);
const docsPath = '/docs/contract/encodeFunctionResult';
function encodeFunctionResult({ abi, functionName, result, }) {
    let abiItem = abi[0];
    if (functionName) {
        abiItem = (0, getAbiItem_js_1.getAbiItem)({
            abi,
            name: functionName,
        });
        if (!abiItem)
            throw new abi_js_1.AbiFunctionNotFoundError(functionName, {
                docsPath: '/docs/contract/encodeFunctionResult',
            });
    }
    if (abiItem.type !== 'function')
        throw new abi_js_1.AbiFunctionNotFoundError(undefined, {
            docsPath: '/docs/contract/encodeFunctionResult',
        });
    if (!abiItem.outputs)
        throw new abi_js_1.AbiFunctionOutputsNotFoundError(abiItem.name, { docsPath });
    let values = Array.isArray(result) ? result : [result];
    if (abiItem.outputs.length === 0 && !values[0])
        values = [];
    return (0, encodeAbiParameters_js_1.encodeAbiParameters)(abiItem.outputs, values);
}
exports.encodeFunctionResult = encodeFunctionResult;
//# sourceMappingURL=encodeFunctionResult.js.map

/***/ }),

/***/ 63865:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.encodePacked = void 0;
const abi_js_1 = __webpack_require__(5432);
const address_js_1 = __webpack_require__(64422);
const isAddress_js_1 = __webpack_require__(81061);
const concat_js_1 = __webpack_require__(15991);
const pad_js_1 = __webpack_require__(18046);
const toHex_js_1 = __webpack_require__(86340);
const regex_js_1 = __webpack_require__(44857);
function encodePacked(types, values) {
    if (types.length !== values.length)
        throw new abi_js_1.AbiEncodingLengthMismatchError({
            expectedLength: types.length,
            givenLength: values.length,
        });
    const data = [];
    for (let i = 0; i < types.length; i++) {
        const type = types[i];
        const value = values[i];
        data.push(encode(type, value));
    }
    return (0, concat_js_1.concatHex)(data);
}
exports.encodePacked = encodePacked;
function encode(type, value, isArray = false) {
    if (type === 'address') {
        const address = value;
        if (!(0, isAddress_js_1.isAddress)(address))
            throw new address_js_1.InvalidAddressError({ address });
        return (0, pad_js_1.pad)(address.toLowerCase(), {
            size: isArray ? 32 : null,
        });
    }
    if (type === 'string')
        return (0, toHex_js_1.stringToHex)(value);
    if (type === 'bytes')
        return value;
    if (type === 'bool')
        return (0, pad_js_1.pad)((0, toHex_js_1.boolToHex)(value), { size: isArray ? 32 : 1 });
    const intMatch = type.match(regex_js_1.integerRegex);
    if (intMatch) {
        const [_type, baseType, bits = '256'] = intMatch;
        const size = parseInt(bits) / 8;
        return (0, toHex_js_1.numberToHex)(value, {
            size: isArray ? 32 : size,
            signed: baseType === 'int',
        });
    }
    const bytesMatch = type.match(regex_js_1.bytesRegex);
    if (bytesMatch) {
        const [_type, size] = bytesMatch;
        if (parseInt(size) !== (value.length - 2) / 2)
            throw new abi_js_1.BytesSizeMismatchError({
                expectedSize: parseInt(size),
                givenSize: (value.length - 2) / 2,
            });
        return (0, pad_js_1.pad)(value, { dir: 'right', size: isArray ? 32 : null });
    }
    const arrayMatch = type.match(regex_js_1.arrayRegex);
    if (arrayMatch && Array.isArray(value)) {
        const [_type, childType] = arrayMatch;
        const data = [];
        for (let i = 0; i < value.length; i++) {
            data.push(encode(childType, value[i], true));
        }
        if (data.length === 0)
            return '0x';
        return (0, concat_js_1.concatHex)(data);
    }
    throw new abi_js_1.UnsupportedPackedAbiType(type);
}
//# sourceMappingURL=encodePacked.js.map

/***/ }),

/***/ 36859:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.formatAbiParams = exports.formatAbiItem = void 0;
const abi_js_1 = __webpack_require__(5432);
function formatAbiItem(abiItem, { includeName = false } = {}) {
    if (abiItem.type !== 'function' &&
        abiItem.type !== 'event' &&
        abiItem.type !== 'error')
        throw new abi_js_1.InvalidDefinitionTypeError(abiItem.type);
    return `${abiItem.name}(${formatAbiParams(abiItem.inputs, { includeName })})`;
}
exports.formatAbiItem = formatAbiItem;
function formatAbiParams(params, { includeName = false } = {}) {
    if (!params)
        return '';
    return params
        .map((param) => formatAbiParam(param, { includeName }))
        .join(includeName ? ', ' : ',');
}
exports.formatAbiParams = formatAbiParams;
function formatAbiParam(param, { includeName }) {
    if (param.type.startsWith('tuple')) {
        return `(${formatAbiParams(param.components, { includeName })})${param.type.slice('tuple'.length)}`;
    }
    return param.type + (includeName && param.name ? ` ${param.name}` : '');
}
//# sourceMappingURL=formatAbiItem.js.map

/***/ }),

/***/ 75586:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.formatAbiItemWithArgs = void 0;
const stringify_js_1 = __webpack_require__(68395);
function formatAbiItemWithArgs({ abiItem, args, includeFunctionName = true, includeName = false, }) {
    if (!('name' in abiItem))
        return;
    if (!('inputs' in abiItem))
        return;
    if (!abiItem.inputs)
        return;
    return `${includeFunctionName ? abiItem.name : ''}(${abiItem.inputs
        .map((input, i) => `${includeName && input.name ? `${input.name}: ` : ''}${typeof args[i] === 'object' ? (0, stringify_js_1.stringify)(args[i]) : args[i]}`)
        .join(', ')})`;
}
exports.formatAbiItemWithArgs = formatAbiItemWithArgs;
//# sourceMappingURL=formatAbiItemWithArgs.js.map

/***/ }),

/***/ 79606:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getAmbiguousTypes = exports.isArgOfType = exports.getAbiItem = void 0;
const abi_js_1 = __webpack_require__(5432);
const isHex_js_1 = __webpack_require__(88846);
const getEventSelector_js_1 = __webpack_require__(33938);
const getFunctionSelector_js_1 = __webpack_require__(44402);
const isAddress_js_1 = __webpack_require__(81061);
function getAbiItem({ abi, args = [], name, }) {
    const isSelector = (0, isHex_js_1.isHex)(name, { strict: false });
    const abiItems = abi.filter((abiItem) => {
        if (isSelector) {
            if (abiItem.type === 'function')
                return (0, getFunctionSelector_js_1.getFunctionSelector)(abiItem) === name;
            if (abiItem.type === 'event')
                return (0, getEventSelector_js_1.getEventSelector)(abiItem) === name;
            return false;
        }
        return 'name' in abiItem && abiItem.name === name;
    });
    if (abiItems.length === 0)
        return undefined;
    if (abiItems.length === 1)
        return abiItems[0];
    let matchedAbiItem = undefined;
    for (const abiItem of abiItems) {
        if (!('inputs' in abiItem))
            continue;
        if (!args || args.length === 0) {
            if (!abiItem.inputs || abiItem.inputs.length === 0)
                return abiItem;
            continue;
        }
        if (!abiItem.inputs)
            continue;
        if (abiItem.inputs.length === 0)
            continue;
        if (abiItem.inputs.length !== args.length)
            continue;
        const matched = args.every((arg, index) => {
            const abiParameter = 'inputs' in abiItem && abiItem.inputs[index];
            if (!abiParameter)
                return false;
            return isArgOfType(arg, abiParameter);
        });
        if (matched) {
            if (matchedAbiItem &&
                'inputs' in matchedAbiItem &&
                matchedAbiItem.inputs) {
                const ambiguousTypes = getAmbiguousTypes(abiItem.inputs, matchedAbiItem.inputs, args);
                if (ambiguousTypes)
                    throw new abi_js_1.AbiItemAmbiguityError({
                        abiItem,
                        type: ambiguousTypes[0],
                    }, {
                        abiItem: matchedAbiItem,
                        type: ambiguousTypes[1],
                    });
            }
            matchedAbiItem = abiItem;
        }
    }
    if (matchedAbiItem)
        return matchedAbiItem;
    return abiItems[0];
}
exports.getAbiItem = getAbiItem;
function isArgOfType(arg, abiParameter) {
    const argType = typeof arg;
    const abiParameterType = abiParameter.type;
    switch (abiParameterType) {
        case 'address':
            return (0, isAddress_js_1.isAddress)(arg);
        case 'bool':
            return argType === 'boolean';
        case 'function':
            return argType === 'string';
        case 'string':
            return argType === 'string';
        default: {
            if (abiParameterType === 'tuple' && 'components' in abiParameter)
                return Object.values(abiParameter.components).every((component, index) => {
                    return isArgOfType(Object.values(arg)[index], component);
                });
            if (/^u?int(8|16|24|32|40|48|56|64|72|80|88|96|104|112|120|128|136|144|152|160|168|176|184|192|200|208|216|224|232|240|248|256)?$/.test(abiParameterType))
                return argType === 'number' || argType === 'bigint';
            if (/^bytes([1-9]|1[0-9]|2[0-9]|3[0-2])?$/.test(abiParameterType))
                return argType === 'string' || arg instanceof Uint8Array;
            if (/[a-z]+[1-9]{0,3}(\[[0-9]{0,}\])+$/.test(abiParameterType)) {
                return (Array.isArray(arg) &&
                    arg.every((x) => isArgOfType(x, {
                        ...abiParameter,
                        type: abiParameterType.replace(/(\[[0-9]{0,}\])$/, ''),
                    })));
            }
            return false;
        }
    }
}
exports.isArgOfType = isArgOfType;
function getAmbiguousTypes(sourceParameters, targetParameters, args) {
    for (const parameterIndex in sourceParameters) {
        const sourceParameter = sourceParameters[parameterIndex];
        const targetParameter = targetParameters[parameterIndex];
        if (sourceParameter.type === 'tuple' &&
            targetParameter.type === 'tuple' &&
            'components' in sourceParameter &&
            'components' in targetParameter)
            return getAmbiguousTypes(sourceParameter.components, targetParameter.components, args[parameterIndex]);
        const types = [sourceParameter.type, targetParameter.type];
        const ambiguous = (() => {
            if (types.includes('address') && types.includes('bytes20'))
                return true;
            if (types.includes('address') && types.includes('string'))
                return (0, isAddress_js_1.isAddress)(args[parameterIndex]);
            if (types.includes('address') && types.includes('bytes'))
                return (0, isAddress_js_1.isAddress)(args[parameterIndex]);
            return false;
        })();
        if (ambiguous)
            return types;
    }
    return;
}
exports.getAmbiguousTypes = getAmbiguousTypes;
//# sourceMappingURL=getAbiItem.js.map

/***/ }),

/***/ 59120:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.publicKeyToAddress = exports.parseAccount = void 0;
var parseAccount_js_1 = __webpack_require__(79429);
Object.defineProperty(exports, "parseAccount", ({ enumerable: true, get: function () { return parseAccount_js_1.parseAccount; } }));
var publicKeyToAddress_js_1 = __webpack_require__(13740);
Object.defineProperty(exports, "publicKeyToAddress", ({ enumerable: true, get: function () { return publicKeyToAddress_js_1.publicKeyToAddress; } }));
//# sourceMappingURL=accounts.js.map

/***/ }),

/***/ 18717:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getAddress = exports.checksumAddress = void 0;
const address_js_1 = __webpack_require__(64422);
const toBytes_js_1 = __webpack_require__(82750);
const keccak256_js_1 = __webpack_require__(43708);
const isAddress_js_1 = __webpack_require__(81061);
function checksumAddress(address_, chainId) {
    const hexAddress = chainId
        ? `${chainId}${address_.toLowerCase()}`
        : address_.substring(2).toLowerCase();
    const hash = (0, keccak256_js_1.keccak256)((0, toBytes_js_1.stringToBytes)(hexAddress), 'bytes');
    const address = (chainId ? hexAddress.substring(`${chainId}0x`.length) : hexAddress).split('');
    for (let i = 0; i < 40; i += 2) {
        if (hash[i >> 1] >> 4 >= 8 && address[i]) {
            address[i] = address[i].toUpperCase();
        }
        if ((hash[i >> 1] & 0x0f) >= 8 && address[i + 1]) {
            address[i + 1] = address[i + 1].toUpperCase();
        }
    }
    return `0x${address.join('')}`;
}
exports.checksumAddress = checksumAddress;
function getAddress(address, chainId) {
    if (!(0, isAddress_js_1.isAddress)(address))
        throw new address_js_1.InvalidAddressError({ address });
    return checksumAddress(address, chainId);
}
exports.getAddress = getAddress;
//# sourceMappingURL=getAddress.js.map

/***/ }),

/***/ 78831:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getCreate2Address = exports.getCreateAddress = exports.getContractAddress = void 0;
const concat_js_1 = __webpack_require__(15991);
const isBytes_js_1 = __webpack_require__(62968);
const pad_js_1 = __webpack_require__(18046);
const slice_js_1 = __webpack_require__(61909);
const toBytes_js_1 = __webpack_require__(82750);
const toRlp_js_1 = __webpack_require__(25943);
const keccak256_js_1 = __webpack_require__(43708);
const getAddress_js_1 = __webpack_require__(18717);
function getContractAddress(opts) {
    if (opts.opcode === 'CREATE2')
        return getCreate2Address(opts);
    return getCreateAddress(opts);
}
exports.getContractAddress = getContractAddress;
function getCreateAddress(opts) {
    const from = (0, toBytes_js_1.toBytes)((0, getAddress_js_1.getAddress)(opts.from));
    let nonce = (0, toBytes_js_1.toBytes)(opts.nonce);
    if (nonce[0] === 0)
        nonce = new Uint8Array([]);
    return (0, getAddress_js_1.getAddress)(`0x${(0, keccak256_js_1.keccak256)((0, toRlp_js_1.toRlp)([from, nonce], 'bytes')).slice(26)}`);
}
exports.getCreateAddress = getCreateAddress;
function getCreate2Address(opts) {
    const from = (0, toBytes_js_1.toBytes)((0, getAddress_js_1.getAddress)(opts.from));
    const salt = (0, pad_js_1.pad)((0, isBytes_js_1.isBytes)(opts.salt) ? opts.salt : (0, toBytes_js_1.toBytes)(opts.salt), {
        size: 32,
    });
    const bytecodeHash = (() => {
        if ('bytecodeHash' in opts) {
            if ((0, isBytes_js_1.isBytes)(opts.bytecodeHash))
                return opts.bytecodeHash;
            return (0, toBytes_js_1.toBytes)(opts.bytecodeHash);
        }
        return (0, keccak256_js_1.keccak256)(opts.bytecode, 'bytes');
    })();
    return (0, getAddress_js_1.getAddress)((0, slice_js_1.slice)((0, keccak256_js_1.keccak256)((0, concat_js_1.concat)([(0, toBytes_js_1.toBytes)('0xff'), from, salt, bytecodeHash])), 12));
}
exports.getCreate2Address = getCreate2Address;
//# sourceMappingURL=getContractAddress.js.map

/***/ }),

/***/ 81061:
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.isAddress = void 0;
const addressRegex = /^0x[a-fA-F0-9]{40}$/;
function isAddress(address) {
    return addressRegex.test(address);
}
exports.isAddress = isAddress;
//# sourceMappingURL=isAddress.js.map

/***/ }),

/***/ 47681:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.isAddressEqual = void 0;
const address_js_1 = __webpack_require__(64422);
const isAddress_js_1 = __webpack_require__(81061);
function isAddressEqual(a, b) {
    if (!(0, isAddress_js_1.isAddress)(a))
        throw new address_js_1.InvalidAddressError({ address: a });
    if (!(0, isAddress_js_1.isAddress)(b))
        throw new address_js_1.InvalidAddressError({ address: b });
    return a.toLowerCase() === b.toLowerCase();
}
exports.isAddressEqual = isAddressEqual;
//# sourceMappingURL=isAddressEqual.js.map

/***/ }),

/***/ 48701:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.buildRequest = exports.isDeterministicError = void 0;
const base_js_1 = __webpack_require__(24437);
const request_js_1 = __webpack_require__(80767);
const rpc_js_1 = __webpack_require__(36549);
const withRetry_js_1 = __webpack_require__(36962);
const isDeterministicError = (error) => {
    if ('code' in error)
        return (error.code !== -1 &&
            error.code !== -32004 &&
            error.code !== -32005 &&
            error.code !== -32042 &&
            error.code !== -32603);
    if (error instanceof request_js_1.HttpRequestError && error.status)
        return (error.status !== 403 &&
            error.status !== 408 &&
            error.status !== 413 &&
            error.status !== 429 &&
            error.status !== 500 &&
            error.status !== 502 &&
            error.status !== 503 &&
            error.status !== 504);
    return false;
};
exports.isDeterministicError = isDeterministicError;
function buildRequest(request, { retryDelay = 150, retryCount = 3, } = {}) {
    return (async (args) => (0, withRetry_js_1.withRetry)(async () => {
        try {
            return await request(args);
        }
        catch (err_) {
            const err = err_;
            switch (err.code) {
                case rpc_js_1.ParseRpcError.code:
                    throw new rpc_js_1.ParseRpcError(err);
                case rpc_js_1.InvalidRequestRpcError.code:
                    throw new rpc_js_1.InvalidRequestRpcError(err);
                case rpc_js_1.MethodNotFoundRpcError.code:
                    throw new rpc_js_1.MethodNotFoundRpcError(err);
                case rpc_js_1.InvalidParamsRpcError.code:
                    throw new rpc_js_1.InvalidParamsRpcError(err);
                case rpc_js_1.InternalRpcError.code:
                    throw new rpc_js_1.InternalRpcError(err);
                case rpc_js_1.InvalidInputRpcError.code:
                    throw new rpc_js_1.InvalidInputRpcError(err);
                case rpc_js_1.ResourceNotFoundRpcError.code:
                    throw new rpc_js_1.ResourceNotFoundRpcError(err);
                case rpc_js_1.ResourceUnavailableRpcError.code:
                    throw new rpc_js_1.ResourceUnavailableRpcError(err);
                case rpc_js_1.TransactionRejectedRpcError.code:
                    throw new rpc_js_1.TransactionRejectedRpcError(err);
                case rpc_js_1.MethodNotSupportedRpcError.code:
                    throw new rpc_js_1.MethodNotSupportedRpcError(err);
                case rpc_js_1.LimitExceededRpcError.code:
                    throw new rpc_js_1.LimitExceededRpcError(err);
                case rpc_js_1.JsonRpcVersionUnsupportedError.code:
                    throw new rpc_js_1.JsonRpcVersionUnsupportedError(err);
                case rpc_js_1.UserRejectedRequestError.code:
                    throw new rpc_js_1.UserRejectedRequestError(err);
                case rpc_js_1.UnauthorizedProviderError.code:
                    throw new rpc_js_1.UnauthorizedProviderError(err);
                case rpc_js_1.UnsupportedProviderMethodError.code:
                    throw new rpc_js_1.UnsupportedProviderMethodError(err);
                case rpc_js_1.ProviderDisconnectedError.code:
                    throw new rpc_js_1.ProviderDisconnectedError(err);
                case rpc_js_1.ChainDisconnectedError.code:
                    throw new rpc_js_1.ChainDisconnectedError(err);
                case rpc_js_1.SwitchChainError.code:
                    throw new rpc_js_1.SwitchChainError(err);
                case 5000:
                    throw new rpc_js_1.UserRejectedRequestError(err);
                default:
                    if (err_ instanceof base_js_1.BaseError)
                        throw err_;
                    throw new rpc_js_1.UnknownRpcError(err);
            }
        }
    }, {
        delay: ({ count, error }) => {
            if (error && error instanceof request_js_1.HttpRequestError) {
                const retryAfter = error?.headers?.get('Retry-After');
                if (retryAfter?.match(/\d/))
                    return parseInt(retryAfter) * 1000;
            }
            return ~~(1 << count) * retryDelay;
        },
        retryCount,
        shouldRetry: ({ error }) => !(0, exports.isDeterministicError)(error),
    }));
}
exports.buildRequest = buildRequest;
//# sourceMappingURL=buildRequest.js.map

/***/ }),

/***/ 61091:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.ccipFetch = exports.offchainLookup = exports.offchainLookupAbiItem = exports.offchainLookupSignature = void 0;
const call_js_1 = __webpack_require__(6882);
const ccip_js_1 = __webpack_require__(6859);
const request_js_1 = __webpack_require__(80767);
const decodeErrorResult_js_1 = __webpack_require__(33058);
const encodeAbiParameters_js_1 = __webpack_require__(82671);
const isAddressEqual_js_1 = __webpack_require__(47681);
const concat_js_1 = __webpack_require__(15991);
const isHex_js_1 = __webpack_require__(88846);
const stringify_js_1 = __webpack_require__(68395);
exports.offchainLookupSignature = '0x556f1830';
exports.offchainLookupAbiItem = {
    name: 'OffchainLookup',
    type: 'error',
    inputs: [
        {
            name: 'sender',
            type: 'address',
        },
        {
            name: 'urls',
            type: 'string[]',
        },
        {
            name: 'callData',
            type: 'bytes',
        },
        {
            name: 'callbackFunction',
            type: 'bytes4',
        },
        {
            name: 'extraData',
            type: 'bytes',
        },
    ],
};
async function offchainLookup(client, { blockNumber, blockTag, data, to, }) {
    const { args } = (0, decodeErrorResult_js_1.decodeErrorResult)({
        data,
        abi: [exports.offchainLookupAbiItem],
    });
    const [sender, urls, callData, callbackSelector, extraData] = args;
    try {
        if (!(0, isAddressEqual_js_1.isAddressEqual)(to, sender))
            throw new ccip_js_1.OffchainLookupSenderMismatchError({ sender, to });
        const result = await ccipFetch({ data: callData, sender, urls });
        const { data: data_ } = await (0, call_js_1.call)(client, {
            blockNumber,
            blockTag,
            data: (0, concat_js_1.concat)([
                callbackSelector,
                (0, encodeAbiParameters_js_1.encodeAbiParameters)([{ type: 'bytes' }, { type: 'bytes' }], [result, extraData]),
            ]),
            to,
        });
        return data_;
    }
    catch (err) {
        throw new ccip_js_1.OffchainLookupError({
            callbackSelector,
            cause: err,
            data,
            extraData,
            sender,
            urls,
        });
    }
}
exports.offchainLookup = offchainLookup;
async function ccipFetch({ data, sender, urls, }) {
    let error = new Error('An unknown error occurred.');
    for (let i = 0; i < urls.length; i++) {
        const url = urls[i];
        const method = url.includes('{data}') ? 'GET' : 'POST';
        const body = method === 'POST' ? { data, sender } : undefined;
        try {
            const response = await fetch(url.replace('{sender}', sender).replace('{data}', data), {
                body: JSON.stringify(body),
                method,
            });
            let result;
            if (response.headers.get('Content-Type')?.startsWith('application/json')) {
                result = (await response.json()).data;
            }
            else {
                result = (await response.text());
            }
            if (!response.ok) {
                error = new request_js_1.HttpRequestError({
                    body,
                    details: result?.error
                        ? (0, stringify_js_1.stringify)(result.error)
                        : response.statusText,
                    headers: response.headers,
                    status: response.status,
                    url,
                });
                continue;
            }
            if (!(0, isHex_js_1.isHex)(result)) {
                error = new ccip_js_1.OffchainLookupResponseMalformedError({
                    result,
                    url,
                });
                continue;
            }
            return result;
        }
        catch (err) {
            error = new request_js_1.HttpRequestError({
                body,
                details: err.message,
                url,
            });
        }
    }
    throw error;
}
exports.ccipFetch = ccipFetch;
//# sourceMappingURL=ccip.js.map

/***/ }),

/***/ 63602:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.assertCurrentChain = void 0;
const chain_js_1 = __webpack_require__(73587);
function assertCurrentChain({ chain, currentChainId, }) {
    if (!chain)
        throw new chain_js_1.ChainNotFoundError();
    if (currentChainId !== chain.id)
        throw new chain_js_1.ChainMismatchError({ chain, currentChainId });
}
exports.assertCurrentChain = assertCurrentChain;
//# sourceMappingURL=assertCurrentChain.js.map

/***/ }),

/***/ 54416:
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.defineChain = void 0;
function defineChain(chain, config = {}) {
    const { fees = chain.fees, formatters = chain.formatters, serializers = chain.serializers, } = config;
    return {
        ...chain,
        fees,
        formatters,
        serializers,
    };
}
exports.defineChain = defineChain;
//# sourceMappingURL=defineChain.js.map

/***/ }),

/***/ 7479:
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.extractChain = void 0;
function extractChain({ chains, id, }) {
    return chains.find((chain) => chain.id === id);
}
exports.extractChain = extractChain;
//# sourceMappingURL=extractChain.js.map

/***/ }),

/***/ 30245:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getChainContractAddress = void 0;
const chain_js_1 = __webpack_require__(73587);
function getChainContractAddress({ blockNumber, chain, contract: name, }) {
    const contract = chain?.contracts?.[name];
    if (!contract)
        throw new chain_js_1.ChainDoesNotSupportContract({
            chain,
            contract: { name },
        });
    if (blockNumber &&
        contract.blockCreated &&
        contract.blockCreated > blockNumber)
        throw new chain_js_1.ChainDoesNotSupportContract({
            blockNumber,
            chain,
            contract: {
                name,
                blockCreated: contract.blockCreated,
            },
        });
    return contract.address;
}
exports.getChainContractAddress = getChainContractAddress;
//# sourceMappingURL=getChainContractAddress.js.map

/***/ }),

/***/ 2032:
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.extractFunctionType = exports.extractFunctionParams = exports.extractFunctionName = exports.extractFunctionParts = void 0;
const paramsRegex = /((function|event)\s)?(.*)(\((.*)\))/;
function extractFunctionParts(def) {
    const parts = def.match(paramsRegex);
    const type = parts?.[2] || undefined;
    const name = parts?.[3];
    const params = parts?.[5] || undefined;
    return { type, name, params };
}
exports.extractFunctionParts = extractFunctionParts;
function extractFunctionName(def) {
    return extractFunctionParts(def).name;
}
exports.extractFunctionName = extractFunctionName;
function extractFunctionParams(def) {
    const params = extractFunctionParts(def).params;
    const splitParams = params?.split(',').map((x) => x.trim().split(' '));
    return splitParams?.map((param) => ({
        type: param[0],
        name: param[1] === 'indexed' ? param[2] : param[1],
        ...(param[1] === 'indexed' ? { indexed: true } : {}),
    }));
}
exports.extractFunctionParams = extractFunctionParams;
function extractFunctionType(def) {
    return extractFunctionParts(def).type;
}
exports.extractFunctionType = extractFunctionType;
//# sourceMappingURL=extractFunctionParts.js.map

/***/ }),

/***/ 19982:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.createCursor = void 0;
const cursor_js_1 = __webpack_require__(97174);
const staticCursor = {
    bytes: new Uint8Array(),
    dataView: new DataView(new ArrayBuffer(0)),
    position: 0,
    assertPosition(position) {
        if (position < 0 || position > this.bytes.length - 1)
            throw new cursor_js_1.PositionOutOfBoundsError({
                length: this.bytes.length,
                position,
            });
    },
    decrementPosition(offset) {
        if (offset < 0)
            throw new cursor_js_1.NegativeOffsetError({ offset });
        const position = this.position - offset;
        this.assertPosition(position);
        this.position = position;
    },
    incrementPosition(offset) {
        if (offset < 0)
            throw new cursor_js_1.NegativeOffsetError({ offset });
        const position = this.position + offset;
        this.assertPosition(position);
        this.position = position;
    },
    inspectByte(position_) {
        const position = position_ ?? this.position;
        this.assertPosition(position);
        return this.bytes[position];
    },
    inspectBytes(length, position_) {
        const position = position_ ?? this.position;
        this.assertPosition(position + length - 1);
        return this.bytes.subarray(position, position + length);
    },
    inspectUint8(position_) {
        const position = position_ ?? this.position;
        this.assertPosition(position);
        return this.bytes[position];
    },
    inspectUint16(position_) {
        const position = position_ ?? this.position;
        this.assertPosition(position + 1);
        return this.dataView.getUint16(position);
    },
    inspectUint24(position_) {
        const position = position_ ?? this.position;
        this.assertPosition(position + 2);
        return ((this.dataView.getUint16(position) << 8) +
            this.dataView.getUint8(position + 2));
    },
    inspectUint32(position_) {
        const position = position_ ?? this.position;
        this.assertPosition(position + 3);
        return this.dataView.getUint32(position);
    },
    pushByte(byte) {
        this.assertPosition(this.position);
        this.bytes[this.position] = byte;
        this.position++;
    },
    pushBytes(bytes) {
        this.assertPosition(this.position + bytes.length - 1);
        this.bytes.set(bytes, this.position);
        this.position += bytes.length;
    },
    pushUint8(value) {
        this.assertPosition(this.position);
        this.bytes[this.position] = value;
        this.position++;
    },
    pushUint16(value) {
        this.assertPosition(this.position + 1);
        this.dataView.setUint16(this.position, value);
        this.position += 2;
    },
    pushUint24(value) {
        this.assertPosition(this.position + 2);
        this.dataView.setUint16(this.position, value >> 8);
        this.dataView.setUint8(this.position + 2, value & ~4294967040);
        this.position += 3;
    },
    pushUint32(value) {
        this.assertPosition(this.position + 3);
        this.dataView.setUint32(this.position, value);
        this.position += 4;
    },
    readByte() {
        const value = this.inspectByte();
        this.position++;
        return value;
    },
    readBytes(length) {
        const value = this.inspectBytes(length);
        this.position += length;
        return value;
    },
    readUint8() {
        const value = this.inspectUint8();
        this.position += 1;
        return value;
    },
    readUint16() {
        const value = this.inspectUint16();
        this.position += 2;
        return value;
    },
    readUint24() {
        const value = this.inspectUint24();
        this.position += 3;
        return value;
    },
    readUint32() {
        const value = this.inspectUint32();
        this.position += 4;
        return value;
    },
    setPosition(position) {
        this.assertPosition(position);
        this.position = position;
    },
};
function createCursor(bytes) {
    const cursor = Object.create(staticCursor);
    cursor.bytes = bytes;
    cursor.dataView = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return cursor;
}
exports.createCursor = createCursor;
//# sourceMappingURL=cursor.js.map

/***/ }),

/***/ 15991:
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.concatHex = exports.concatBytes = exports.concat = void 0;
function concat(values) {
    if (typeof values[0] === 'string')
        return concatHex(values);
    return concatBytes(values);
}
exports.concat = concat;
function concatBytes(values) {
    let length = 0;
    for (const arr of values) {
        length += arr.length;
    }
    const result = new Uint8Array(length);
    let offset = 0;
    for (const arr of values) {
        result.set(arr, offset);
        offset += arr.length;
    }
    return result;
}
exports.concatBytes = concatBytes;
function concatHex(values) {
    return `0x${values.reduce((acc, x) => acc + x.replace('0x', ''), '')}`;
}
exports.concatHex = concatHex;
//# sourceMappingURL=concat.js.map

/***/ }),

/***/ 62968:
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.isBytes = void 0;
function isBytes(value) {
    if (!value)
        return false;
    if (typeof value !== 'object')
        return false;
    if (!('BYTES_PER_ELEMENT' in value))
        return false;
    return (value.BYTES_PER_ELEMENT === 1 && value.constructor.name === 'Uint8Array');
}
exports.isBytes = isBytes;
//# sourceMappingURL=isBytes.js.map

/***/ }),

/***/ 25890:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.isBytesEqual = void 0;
const utils_1 = __webpack_require__(92258);
const toBytes_js_1 = __webpack_require__(82750);
const isHex_js_1 = __webpack_require__(88846);
function isBytesEqual(a_, b_) {
    const a = (0, isHex_js_1.isHex)(a_) ? (0, toBytes_js_1.toBytes)(a_) : a_;
    const b = (0, isHex_js_1.isHex)(b_) ? (0, toBytes_js_1.toBytes)(b_) : b_;
    return (0, utils_1.equalBytes)(a, b);
}
exports.isBytesEqual = isBytesEqual;
//# sourceMappingURL=isBytesEqual.js.map

/***/ }),

/***/ 88846:
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.isHex = void 0;
function isHex(value, { strict = true } = {}) {
    if (!value)
        return false;
    if (typeof value !== 'string')
        return false;
    return strict ? /^0x[0-9a-fA-F]*$/.test(value) : value.startsWith('0x');
}
exports.isHex = isHex;
//# sourceMappingURL=isHex.js.map

/***/ }),

/***/ 18046:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.padBytes = exports.padHex = exports.pad = void 0;
const data_js_1 = __webpack_require__(34204);
function pad(hexOrBytes, { dir, size = 32 } = {}) {
    if (typeof hexOrBytes === 'string')
        return padHex(hexOrBytes, { dir, size });
    return padBytes(hexOrBytes, { dir, size });
}
exports.pad = pad;
function padHex(hex_, { dir, size = 32 } = {}) {
    if (size === null)
        return hex_;
    const hex = hex_.replace('0x', '');
    if (hex.length > size * 2)
        throw new data_js_1.SizeExceedsPaddingSizeError({
            size: Math.ceil(hex.length / 2),
            targetSize: size,
            type: 'hex',
        });
    return `0x${hex[dir === 'right' ? 'padEnd' : 'padStart'](size * 2, '0')}`;
}
exports.padHex = padHex;
function padBytes(bytes, { dir, size = 32 } = {}) {
    if (size === null)
        return bytes;
    if (bytes.length > size)
        throw new data_js_1.SizeExceedsPaddingSizeError({
            size: bytes.length,
            targetSize: size,
            type: 'bytes',
        });
    const paddedBytes = new Uint8Array(size);
    for (let i = 0; i < size; i++) {
        const padEnd = dir === 'right';
        paddedBytes[padEnd ? i : size - i - 1] =
            bytes[padEnd ? i : bytes.length - i - 1];
    }
    return paddedBytes;
}
exports.padBytes = padBytes;
//# sourceMappingURL=pad.js.map

/***/ }),

/***/ 82026:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.size = void 0;
const isHex_js_1 = __webpack_require__(88846);
function size(value) {
    if ((0, isHex_js_1.isHex)(value, { strict: false }))
        return Math.ceil((value.length - 2) / 2);
    return value.length;
}
exports.size = size;
//# sourceMappingURL=size.js.map

/***/ }),

/***/ 61909:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.sliceHex = exports.sliceBytes = exports.slice = void 0;
const data_js_1 = __webpack_require__(34204);
const isHex_js_1 = __webpack_require__(88846);
const size_js_1 = __webpack_require__(82026);
function slice(value, start, end, { strict } = {}) {
    if ((0, isHex_js_1.isHex)(value, { strict: false }))
        return sliceHex(value, start, end, {
            strict,
        });
    return sliceBytes(value, start, end, {
        strict,
    });
}
exports.slice = slice;
function assertStartOffset(value, start) {
    if (typeof start === 'number' && start > 0 && start > (0, size_js_1.size)(value) - 1)
        throw new data_js_1.SliceOffsetOutOfBoundsError({
            offset: start,
            position: 'start',
            size: (0, size_js_1.size)(value),
        });
}
function assertEndOffset(value, start, end) {
    if (typeof start === 'number' &&
        typeof end === 'number' &&
        (0, size_js_1.size)(value) !== end - start) {
        throw new data_js_1.SliceOffsetOutOfBoundsError({
            offset: end,
            position: 'end',
            size: (0, size_js_1.size)(value),
        });
    }
}
function sliceBytes(value_, start, end, { strict } = {}) {
    assertStartOffset(value_, start);
    const value = value_.slice(start, end);
    if (strict)
        assertEndOffset(value, start, end);
    return value;
}
exports.sliceBytes = sliceBytes;
function sliceHex(value_, start, end, { strict } = {}) {
    assertStartOffset(value_, start);
    const value = `0x${value_
        .replace('0x', '')
        .slice((start ?? 0) * 2, (end ?? value_.length) * 2)}`;
    if (strict)
        assertEndOffset(value, start, end);
    return value;
}
exports.sliceHex = sliceHex;
//# sourceMappingURL=slice.js.map

/***/ }),

/***/ 45611:
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.trim = void 0;
function trim(hexOrBytes, { dir = 'left' } = {}) {
    let data = typeof hexOrBytes === 'string' ? hexOrBytes.replace('0x', '') : hexOrBytes;
    let sliceLength = 0;
    for (let i = 0; i < data.length - 1; i++) {
        if (data[dir === 'left' ? i : data.length - i - 1].toString() === '0')
            sliceLength++;
        else
            break;
    }
    data =
        dir === 'left'
            ? data.slice(sliceLength)
            : data.slice(0, data.length - sliceLength);
    if (typeof hexOrBytes === 'string') {
        if (data.length === 1 && dir === 'right')
            data = `${data}0`;
        return `0x${data.length % 2 === 1 ? `0${data}` : data}`;
    }
    return data;
}
exports.trim = trim;
//# sourceMappingURL=trim.js.map

/***/ }),

/***/ 55293:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.bytesToString = exports.bytesToNumber = exports.bytesToBool = exports.bytesToBigInt = exports.fromBytes = void 0;
const encoding_js_1 = __webpack_require__(21329);
const trim_js_1 = __webpack_require__(45611);
const fromHex_js_1 = __webpack_require__(50159);
const toHex_js_1 = __webpack_require__(86340);
function fromBytes(bytes, toOrOpts) {
    const opts = typeof toOrOpts === 'string' ? { to: toOrOpts } : toOrOpts;
    const to = opts.to;
    if (to === 'number')
        return bytesToNumber(bytes, opts);
    if (to === 'bigint')
        return bytesToBigInt(bytes, opts);
    if (to === 'boolean')
        return bytesToBool(bytes, opts);
    if (to === 'string')
        return bytesToString(bytes, opts);
    return (0, toHex_js_1.bytesToHex)(bytes, opts);
}
exports.fromBytes = fromBytes;
function bytesToBigInt(bytes, opts = {}) {
    if (typeof opts.size !== 'undefined')
        (0, fromHex_js_1.assertSize)(bytes, { size: opts.size });
    const hex = (0, toHex_js_1.bytesToHex)(bytes, opts);
    return (0, fromHex_js_1.hexToBigInt)(hex);
}
exports.bytesToBigInt = bytesToBigInt;
function bytesToBool(bytes_, opts = {}) {
    let bytes = bytes_;
    if (typeof opts.size !== 'undefined') {
        (0, fromHex_js_1.assertSize)(bytes, { size: opts.size });
        bytes = (0, trim_js_1.trim)(bytes);
    }
    if (bytes.length > 1 || bytes[0] > 1)
        throw new encoding_js_1.InvalidBytesBooleanError(bytes);
    return Boolean(bytes[0]);
}
exports.bytesToBool = bytesToBool;
function bytesToNumber(bytes, opts = {}) {
    if (typeof opts.size !== 'undefined')
        (0, fromHex_js_1.assertSize)(bytes, { size: opts.size });
    const hex = (0, toHex_js_1.bytesToHex)(bytes, opts);
    return (0, fromHex_js_1.hexToNumber)(hex);
}
exports.bytesToNumber = bytesToNumber;
function bytesToString(bytes_, opts = {}) {
    let bytes = bytes_;
    if (typeof opts.size !== 'undefined') {
        (0, fromHex_js_1.assertSize)(bytes, { size: opts.size });
        bytes = (0, trim_js_1.trim)(bytes, { dir: 'right' });
    }
    return new TextDecoder().decode(bytes);
}
exports.bytesToString = bytesToString;
//# sourceMappingURL=fromBytes.js.map

/***/ }),

/***/ 50159:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.hexToString = exports.hexToNumber = exports.hexToBool = exports.hexToBigInt = exports.fromHex = exports.assertSize = void 0;
const encoding_js_1 = __webpack_require__(21329);
const size_js_1 = __webpack_require__(82026);
const trim_js_1 = __webpack_require__(45611);
const toBytes_js_1 = __webpack_require__(82750);
function assertSize(hexOrBytes, { size }) {
    if ((0, size_js_1.size)(hexOrBytes) > size)
        throw new encoding_js_1.SizeOverflowError({
            givenSize: (0, size_js_1.size)(hexOrBytes),
            maxSize: size,
        });
}
exports.assertSize = assertSize;
function fromHex(hex, toOrOpts) {
    const opts = typeof toOrOpts === 'string' ? { to: toOrOpts } : toOrOpts;
    const to = opts.to;
    if (to === 'number')
        return hexToNumber(hex, opts);
    if (to === 'bigint')
        return hexToBigInt(hex, opts);
    if (to === 'string')
        return hexToString(hex, opts);
    if (to === 'boolean')
        return hexToBool(hex, opts);
    return (0, toBytes_js_1.hexToBytes)(hex, opts);
}
exports.fromHex = fromHex;
function hexToBigInt(hex, opts = {}) {
    const { signed } = opts;
    if (opts.size)
        assertSize(hex, { size: opts.size });
    const value = BigInt(hex);
    if (!signed)
        return value;
    const size = (hex.length - 2) / 2;
    const max = (1n << (BigInt(size) * 8n - 1n)) - 1n;
    if (value <= max)
        return value;
    return value - BigInt(`0x${'f'.padStart(size * 2, 'f')}`) - 1n;
}
exports.hexToBigInt = hexToBigInt;
function hexToBool(hex_, opts = {}) {
    let hex = hex_;
    if (opts.size) {
        assertSize(hex, { size: opts.size });
        hex = (0, trim_js_1.trim)(hex);
    }
    if ((0, trim_js_1.trim)(hex) === '0x00')
        return false;
    if ((0, trim_js_1.trim)(hex) === '0x01')
        return true;
    throw new encoding_js_1.InvalidHexBooleanError(hex);
}
exports.hexToBool = hexToBool;
function hexToNumber(hex, opts = {}) {
    return Number(hexToBigInt(hex, opts));
}
exports.hexToNumber = hexToNumber;
function hexToString(hex, opts = {}) {
    let bytes = (0, toBytes_js_1.hexToBytes)(hex);
    if (opts.size) {
        assertSize(bytes, { size: opts.size });
        bytes = (0, trim_js_1.trim)(bytes, { dir: 'right' });
    }
    return new TextDecoder().decode(bytes);
}
exports.hexToString = hexToString;
//# sourceMappingURL=fromHex.js.map

/***/ }),

/***/ 25744:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.rlpToHex = exports.rlpToBytes = exports.fromRlp = void 0;
const base_js_1 = __webpack_require__(24437);
const encoding_js_1 = __webpack_require__(21329);
const cursor_js_1 = __webpack_require__(19982);
const toBytes_js_1 = __webpack_require__(82750);
const toHex_js_1 = __webpack_require__(86340);
function fromRlp(value, to = 'hex') {
    const bytes = (() => {
        if (typeof value === 'string') {
            if (value.length > 3 && value.length % 2 !== 0)
                throw new encoding_js_1.InvalidHexValueError(value);
            return (0, toBytes_js_1.hexToBytes)(value);
        }
        return value;
    })();
    const cursor = (0, cursor_js_1.createCursor)(bytes);
    const result = fromRlpCursor(cursor, to);
    return result;
}
exports.fromRlp = fromRlp;
function rlpToBytes(bytes, to = 'bytes') {
    return fromRlp(bytes, to);
}
exports.rlpToBytes = rlpToBytes;
function rlpToHex(hex, to = 'hex') {
    return fromRlp(hex, to);
}
exports.rlpToHex = rlpToHex;
function fromRlpCursor(cursor, to = 'hex') {
    if (cursor.bytes.length === 0)
        return (to === 'hex' ? (0, toHex_js_1.bytesToHex)(cursor.bytes) : cursor.bytes);
    const prefix = cursor.readByte();
    if (prefix < 0x80)
        cursor.decrementPosition(1);
    if (prefix < 0xc0) {
        const length = readLength(cursor, prefix, 0x80);
        const bytes = cursor.readBytes(length);
        return (to === 'hex' ? (0, toHex_js_1.bytesToHex)(bytes) : bytes);
    }
    const length = readLength(cursor, prefix, 0xc0);
    return readList(cursor, length, to);
}
function readLength(cursor, prefix, offset) {
    if (offset === 0x80 && prefix < 0x80)
        return 1;
    if (prefix <= offset + 55)
        return prefix - offset;
    if (prefix === offset + 55 + 1)
        return cursor.readUint8();
    if (prefix === offset + 55 + 2)
        return cursor.readUint16();
    if (prefix === offset + 55 + 3)
        return cursor.readUint24();
    if (prefix === offset + 55 + 4)
        return cursor.readUint32();
    throw new base_js_1.BaseError('Invalid RLP prefix');
}
function readList(cursor, length, to) {
    const position = cursor.position;
    const value = [];
    while (cursor.position - position < length)
        value.push(fromRlpCursor(cursor, to));
    return value;
}
//# sourceMappingURL=fromRlp.js.map

/***/ }),

/***/ 82750:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.stringToBytes = exports.numberToBytes = exports.hexToBytes = exports.boolToBytes = exports.toBytes = void 0;
const base_js_1 = __webpack_require__(24437);
const isHex_js_1 = __webpack_require__(88846);
const pad_js_1 = __webpack_require__(18046);
const fromHex_js_1 = __webpack_require__(50159);
const toHex_js_1 = __webpack_require__(86340);
const encoder = new TextEncoder();
function toBytes(value, opts = {}) {
    if (typeof value === 'number' || typeof value === 'bigint')
        return numberToBytes(value, opts);
    if (typeof value === 'boolean')
        return boolToBytes(value, opts);
    if ((0, isHex_js_1.isHex)(value))
        return hexToBytes(value, opts);
    return stringToBytes(value, opts);
}
exports.toBytes = toBytes;
function boolToBytes(value, opts = {}) {
    const bytes = new Uint8Array(1);
    bytes[0] = Number(value);
    if (typeof opts.size === 'number') {
        (0, fromHex_js_1.assertSize)(bytes, { size: opts.size });
        return (0, pad_js_1.pad)(bytes, { size: opts.size });
    }
    return bytes;
}
exports.boolToBytes = boolToBytes;
const charCodeMap = {
    zero: 48,
    nine: 57,
    A: 65,
    F: 70,
    a: 97,
    f: 102,
};
function charCodeToBase16(char) {
    if (char >= charCodeMap.zero && char <= charCodeMap.nine)
        return char - charCodeMap.zero;
    if (char >= charCodeMap.A && char <= charCodeMap.F)
        return char - (charCodeMap.A - 10);
    if (char >= charCodeMap.a && char <= charCodeMap.f)
        return char - (charCodeMap.a - 10);
    return undefined;
}
function hexToBytes(hex_, opts = {}) {
    let hex = hex_;
    if (opts.size) {
        (0, fromHex_js_1.assertSize)(hex, { size: opts.size });
        hex = (0, pad_js_1.pad)(hex, { dir: 'right', size: opts.size });
    }
    let hexString = hex.slice(2);
    if (hexString.length % 2)
        hexString = `0${hexString}`;
    const length = hexString.length / 2;
    const bytes = new Uint8Array(length);
    for (let index = 0, j = 0; index < length; index++) {
        const nibbleLeft = charCodeToBase16(hexString.charCodeAt(j++));
        const nibbleRight = charCodeToBase16(hexString.charCodeAt(j++));
        if (nibbleLeft === undefined || nibbleRight === undefined) {
            throw new base_js_1.BaseError(`Invalid byte sequence ("${hexString[j - 2]}${hexString[j - 1]}" in "${hexString}").`);
        }
        bytes[index] = nibbleLeft * 16 + nibbleRight;
    }
    return bytes;
}
exports.hexToBytes = hexToBytes;
function numberToBytes(value, opts) {
    const hex = (0, toHex_js_1.numberToHex)(value, opts);
    return hexToBytes(hex);
}
exports.numberToBytes = numberToBytes;
function stringToBytes(value, opts = {}) {
    const bytes = encoder.encode(value);
    if (typeof opts.size === 'number') {
        (0, fromHex_js_1.assertSize)(bytes, { size: opts.size });
        return (0, pad_js_1.pad)(bytes, { dir: 'right', size: opts.size });
    }
    return bytes;
}
exports.stringToBytes = stringToBytes;
//# sourceMappingURL=toBytes.js.map

/***/ }),

/***/ 86340:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.stringToHex = exports.numberToHex = exports.bytesToHex = exports.boolToHex = exports.toHex = void 0;
const encoding_js_1 = __webpack_require__(21329);
const pad_js_1 = __webpack_require__(18046);
const fromHex_js_1 = __webpack_require__(50159);
const hexes = Array.from({ length: 256 }, (_v, i) => i.toString(16).padStart(2, '0'));
function toHex(value, opts = {}) {
    if (typeof value === 'number' || typeof value === 'bigint')
        return numberToHex(value, opts);
    if (typeof value === 'string') {
        return stringToHex(value, opts);
    }
    if (typeof value === 'boolean')
        return boolToHex(value, opts);
    return bytesToHex(value, opts);
}
exports.toHex = toHex;
function boolToHex(value, opts = {}) {
    const hex = `0x${Number(value)}`;
    if (typeof opts.size === 'number') {
        (0, fromHex_js_1.assertSize)(hex, { size: opts.size });
        return (0, pad_js_1.pad)(hex, { size: opts.size });
    }
    return hex;
}
exports.boolToHex = boolToHex;
function bytesToHex(value, opts = {}) {
    let string = '';
    for (let i = 0; i < value.length; i++) {
        string += hexes[value[i]];
    }
    const hex = `0x${string}`;
    if (typeof opts.size === 'number') {
        (0, fromHex_js_1.assertSize)(hex, { size: opts.size });
        return (0, pad_js_1.pad)(hex, { dir: 'right', size: opts.size });
    }
    return hex;
}
exports.bytesToHex = bytesToHex;
function numberToHex(value_, opts = {}) {
    const { signed, size } = opts;
    const value = BigInt(value_);
    let maxValue;
    if (size) {
        if (signed)
            maxValue = (1n << (BigInt(size) * 8n - 1n)) - 1n;
        else
            maxValue = 2n ** (BigInt(size) * 8n) - 1n;
    }
    else if (typeof value_ === 'number') {
        maxValue = BigInt(Number.MAX_SAFE_INTEGER);
    }
    const minValue = typeof maxValue === 'bigint' && signed ? -maxValue - 1n : 0;
    if ((maxValue && value > maxValue) || value < minValue) {
        const suffix = typeof value_ === 'bigint' ? 'n' : '';
        throw new encoding_js_1.IntegerOutOfRangeError({
            max: maxValue ? `${maxValue}${suffix}` : undefined,
            min: `${minValue}${suffix}`,
            signed,
            size,
            value: `${value_}${suffix}`,
        });
    }
    const hex = `0x${(signed && value < 0
        ? (1n << BigInt(size * 8)) + BigInt(value)
        : value).toString(16)}`;
    if (size)
        return (0, pad_js_1.pad)(hex, { size });
    return hex;
}
exports.numberToHex = numberToHex;
const encoder = new TextEncoder();
function stringToHex(value_, opts = {}) {
    const value = encoder.encode(value_);
    return bytesToHex(value, opts);
}
exports.stringToHex = stringToHex;
//# sourceMappingURL=toHex.js.map

/***/ }),

/***/ 25943:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.hexToRlp = exports.bytesToRlp = exports.toRlp = void 0;
const index_js_1 = __webpack_require__(26244);
const cursor_js_1 = __webpack_require__(19982);
const toBytes_js_1 = __webpack_require__(82750);
const toHex_js_1 = __webpack_require__(86340);
function toRlp(bytes, to = 'hex') {
    const encodable = getEncodable(bytes);
    const cursor = (0, cursor_js_1.createCursor)(new Uint8Array(encodable.length));
    encodable.encode(cursor);
    if (to === 'hex')
        return (0, toHex_js_1.bytesToHex)(cursor.bytes);
    return cursor.bytes;
}
exports.toRlp = toRlp;
function bytesToRlp(bytes, to = 'bytes') {
    return toRlp(bytes, to);
}
exports.bytesToRlp = bytesToRlp;
function hexToRlp(hex, to = 'hex') {
    return toRlp(hex, to);
}
exports.hexToRlp = hexToRlp;
function getEncodable(bytes) {
    if (Array.isArray(bytes))
        return getEncodableList(bytes.map((x) => getEncodable(x)));
    return getEncodableBytes(bytes);
}
function getEncodableList(list) {
    const bodyLength = list.reduce((acc, x) => acc + x.length, 0);
    const sizeOfBodyLength = getSizeOfLength(bodyLength);
    const length = (() => {
        if (bodyLength <= 55)
            return 1 + bodyLength;
        return 1 + sizeOfBodyLength + bodyLength;
    })();
    return {
        length,
        encode(cursor) {
            if (bodyLength <= 55) {
                cursor.pushByte(0xc0 + bodyLength);
            }
            else {
                cursor.pushByte(0xc0 + 55 + sizeOfBodyLength);
                if (sizeOfBodyLength === 1)
                    cursor.pushUint8(bodyLength);
                else if (sizeOfBodyLength === 2)
                    cursor.pushUint16(bodyLength);
                else if (sizeOfBodyLength === 3)
                    cursor.pushUint24(bodyLength);
                else
                    cursor.pushUint32(bodyLength);
            }
            for (const { encode } of list) {
                encode(cursor);
            }
        },
    };
}
function getEncodableBytes(bytesOrHex) {
    const bytes = typeof bytesOrHex === 'string' ? (0, toBytes_js_1.hexToBytes)(bytesOrHex) : bytesOrHex;
    const sizeOfBytesLength = getSizeOfLength(bytes.length);
    const length = (() => {
        if (bytes.length === 1 && bytes[0] < 0x80)
            return 1;
        if (bytes.length <= 55)
            return 1 + bytes.length;
        return 1 + sizeOfBytesLength + bytes.length;
    })();
    return {
        length,
        encode(cursor) {
            if (bytes.length === 1 && bytes[0] < 0x80) {
                cursor.pushBytes(bytes);
            }
            else if (bytes.length <= 55) {
                cursor.pushByte(0x80 + bytes.length);
                cursor.pushBytes(bytes);
            }
            else {
                cursor.pushByte(0x80 + 55 + sizeOfBytesLength);
                if (sizeOfBytesLength === 1)
                    cursor.pushUint8(bytes.length);
                else if (sizeOfBytesLength === 2)
                    cursor.pushUint16(bytes.length);
                else if (sizeOfBytesLength === 3)
                    cursor.pushUint24(bytes.length);
                else
                    cursor.pushUint32(bytes.length);
                cursor.pushBytes(bytes);
            }
        },
    };
}
function getSizeOfLength(length) {
    if (length < 2 ** 8)
        return 1;
    if (length < 2 ** 16)
        return 2;
    if (length < 2 ** 24)
        return 3;
    if (length < 2 ** 32)
        return 4;
    throw new index_js_1.BaseError('Length is too large.');
}
//# sourceMappingURL=toRlp.js.map

/***/ }),

/***/ 59340:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.parseAvatarRecord = void 0;
const utils_js_1 = __webpack_require__(54450);
async function parseAvatarRecord(client, { gatewayUrls, record, }) {
    if (/eip155:/i.test(record))
        return parseNftAvatarUri(client, { gatewayUrls, record });
    return (0, utils_js_1.parseAvatarUri)({ uri: record, gatewayUrls });
}
exports.parseAvatarRecord = parseAvatarRecord;
async function parseNftAvatarUri(client, { gatewayUrls, record, }) {
    const nft = (0, utils_js_1.parseNftUri)(record);
    const nftUri = await (0, utils_js_1.getNftTokenUri)(client, { nft });
    const { uri: resolvedNftUri, isOnChain, isEncoded, } = (0, utils_js_1.resolveAvatarUri)({ uri: nftUri, gatewayUrls });
    if (isOnChain &&
        (resolvedNftUri.includes('data:application/json;base64,') ||
            resolvedNftUri.startsWith('{'))) {
        const encodedJson = isEncoded
            ?
                atob(resolvedNftUri.replace('data:application/json;base64,', ''))
            :
                resolvedNftUri;
        const decoded = JSON.parse(encodedJson);
        return (0, utils_js_1.parseAvatarUri)({ uri: (0, utils_js_1.getJsonImage)(decoded), gatewayUrls });
    }
    let uriTokenId = nft.tokenID;
    if (nft.namespace === 'erc1155')
        uriTokenId = uriTokenId.replace('0x', '').padStart(64, '0');
    return (0, utils_js_1.getMetadataAvatarUri)({
        gatewayUrls,
        uri: resolvedNftUri.replace(/(?:0x)?{id}/, uriTokenId),
    });
}
//# sourceMappingURL=parseAvatarRecord.js.map

/***/ }),

/***/ 54450:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getNftTokenUri = exports.parseNftUri = exports.parseAvatarUri = exports.getMetadataAvatarUri = exports.getJsonImage = exports.resolveAvatarUri = exports.getGateway = exports.isImageUri = void 0;
const readContract_js_1 = __webpack_require__(83000);
const ens_js_1 = __webpack_require__(44770);
const networkRegex = /(?<protocol>https?:\/\/[^\/]*|ipfs:\/|ipns:\/|ar:\/)?(?<root>\/)?(?<subpath>ipfs\/|ipns\/)?(?<target>[\w\-.]+)(?<subtarget>\/.*)?/;
const ipfsHashRegex = /^(Qm[1-9A-HJ-NP-Za-km-z]{44,}|b[A-Za-z2-7]{58,}|B[A-Z2-7]{58,}|z[1-9A-HJ-NP-Za-km-z]{48,}|F[0-9A-F]{50,})(\/(?<target>[\w\-.]+))?(?<subtarget>\/.*)?$/;
const base64Regex = /^data:([a-zA-Z\-/+]*);base64,([^"].*)/;
const dataURIRegex = /^data:([a-zA-Z\-/+]*)?(;[a-zA-Z0-9].*?)?(,)/;
async function isImageUri(uri) {
    try {
        const res = await fetch(uri, { method: 'HEAD' });
        if (res.status === 200) {
            const contentType = res.headers.get('content-type');
            return contentType?.startsWith('image/');
        }
        return false;
    }
    catch (error) {
        if (typeof error === 'object' && typeof error.response !== 'undefined') {
            return false;
        }
        if (!globalThis.hasOwnProperty('Image'))
            return false;
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                resolve(true);
            };
            img.onerror = () => {
                resolve(false);
            };
            img.src = uri;
        });
    }
}
exports.isImageUri = isImageUri;
function getGateway(custom, defaultGateway) {
    if (!custom)
        return defaultGateway;
    if (custom.endsWith('/'))
        return custom.slice(0, -1);
    return custom;
}
exports.getGateway = getGateway;
function resolveAvatarUri({ uri, gatewayUrls, }) {
    const isEncoded = base64Regex.test(uri);
    if (isEncoded)
        return { uri, isOnChain: true, isEncoded };
    const ipfsGateway = getGateway(gatewayUrls?.ipfs, 'https://ipfs.io');
    const arweaveGateway = getGateway(gatewayUrls?.arweave, 'https://arweave.net');
    const networkRegexMatch = uri.match(networkRegex);
    const { protocol, subpath, target, subtarget = '', } = networkRegexMatch?.groups || {};
    const isIPNS = protocol === 'ipns:/' || subpath === 'ipns/';
    const isIPFS = protocol === 'ipfs:/' || subpath === 'ipfs/' || ipfsHashRegex.test(uri);
    if (uri.startsWith('http') && !isIPNS && !isIPFS) {
        let replacedUri = uri;
        if (gatewayUrls?.arweave)
            replacedUri = uri.replace(/https:\/\/arweave.net/g, gatewayUrls?.arweave);
        return { uri: replacedUri, isOnChain: false, isEncoded: false };
    }
    if ((isIPNS || isIPFS) && target) {
        return {
            uri: `${ipfsGateway}/${isIPNS ? 'ipns' : 'ipfs'}/${target}${subtarget}`,
            isOnChain: false,
            isEncoded: false,
        };
    }
    if (protocol === 'ar:/' && target) {
        return {
            uri: `${arweaveGateway}/${target}${subtarget || ''}`,
            isOnChain: false,
            isEncoded: false,
        };
    }
    let parsedUri = uri.replace(dataURIRegex, '');
    if (parsedUri.startsWith('<svg')) {
        parsedUri = `data:image/svg+xml;base64,${btoa(parsedUri)}`;
    }
    if (parsedUri.startsWith('data:') || parsedUri.startsWith('{')) {
        return {
            uri: parsedUri,
            isOnChain: true,
            isEncoded: false,
        };
    }
    throw new ens_js_1.EnsAvatarUriResolutionError({ uri });
}
exports.resolveAvatarUri = resolveAvatarUri;
function getJsonImage(data) {
    if (typeof data !== 'object' ||
        (!('image' in data) && !('image_url' in data) && !('image_data' in data))) {
        throw new ens_js_1.EnsAvatarInvalidMetadataError({ data });
    }
    return data.image || data.image_url || data.image_data;
}
exports.getJsonImage = getJsonImage;
async function getMetadataAvatarUri({ gatewayUrls, uri, }) {
    try {
        const res = await fetch(uri).then((res) => res.json());
        const image = await parseAvatarUri({
            gatewayUrls,
            uri: getJsonImage(res),
        });
        return image;
    }
    catch {
        throw new ens_js_1.EnsAvatarUriResolutionError({ uri });
    }
}
exports.getMetadataAvatarUri = getMetadataAvatarUri;
async function parseAvatarUri({ gatewayUrls, uri, }) {
    const { uri: resolvedURI, isOnChain } = resolveAvatarUri({ uri, gatewayUrls });
    if (isOnChain)
        return resolvedURI;
    const isImage = await isImageUri(resolvedURI);
    if (isImage)
        return resolvedURI;
    throw new ens_js_1.EnsAvatarUriResolutionError({ uri });
}
exports.parseAvatarUri = parseAvatarUri;
function parseNftUri(uri_) {
    let uri = uri_;
    if (uri.startsWith('did:nft:')) {
        uri = uri.replace('did:nft:', '').replace(/_/g, '/');
    }
    const [reference, asset_namespace, tokenID] = uri.split('/');
    const [eip_namespace, chainID] = reference.split(':');
    const [erc_namespace, contractAddress] = asset_namespace.split(':');
    if (!eip_namespace || eip_namespace.toLowerCase() !== 'eip155')
        throw new ens_js_1.EnsAvatarInvalidNftUriError({ reason: 'Only EIP-155 supported' });
    if (!chainID)
        throw new ens_js_1.EnsAvatarInvalidNftUriError({ reason: 'Chain ID not found' });
    if (!contractAddress)
        throw new ens_js_1.EnsAvatarInvalidNftUriError({
            reason: 'Contract address not found',
        });
    if (!tokenID)
        throw new ens_js_1.EnsAvatarInvalidNftUriError({ reason: 'Token ID not found' });
    if (!erc_namespace)
        throw new ens_js_1.EnsAvatarInvalidNftUriError({ reason: 'ERC namespace not found' });
    return {
        chainID: parseInt(chainID),
        namespace: erc_namespace.toLowerCase(),
        contractAddress: contractAddress,
        tokenID,
    };
}
exports.parseNftUri = parseNftUri;
async function getNftTokenUri(client, { nft }) {
    if (nft.namespace === 'erc721') {
        return (0, readContract_js_1.readContract)(client, {
            address: nft.contractAddress,
            abi: [
                {
                    name: 'tokenURI',
                    type: 'function',
                    stateMutability: 'view',
                    inputs: [{ name: 'tokenId', type: 'uint256' }],
                    outputs: [{ name: '', type: 'string' }],
                },
            ],
            functionName: 'tokenURI',
            args: [BigInt(nft.tokenID)],
        });
    }
    if (nft.namespace === 'erc1155') {
        return (0, readContract_js_1.readContract)(client, {
            address: nft.contractAddress,
            abi: [
                {
                    name: 'uri',
                    type: 'function',
                    stateMutability: 'view',
                    inputs: [{ name: '_id', type: 'uint256' }],
                    outputs: [{ name: '', type: 'string' }],
                },
            ],
            functionName: 'uri',
            args: [BigInt(nft.tokenID)],
        });
    }
    throw new ens_js_1.EnsAvatarUnsupportedNamespaceError({ namespace: nft.namespace });
}
exports.getNftTokenUri = getNftTokenUri;
//# sourceMappingURL=utils.js.map

/***/ }),

/***/ 95933:
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.encodeLabelhash = void 0;
function encodeLabelhash(hash) {
    return `[${hash.slice(2)}]`;
}
exports.encodeLabelhash = encodeLabelhash;
//# sourceMappingURL=encodeLabelhash.js.map

/***/ }),

/***/ 88636:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.encodedLabelToLabelhash = void 0;
const isHex_js_1 = __webpack_require__(88846);
function encodedLabelToLabelhash(label) {
    if (label.length !== 66)
        return null;
    if (label.indexOf('[') !== 0)
        return null;
    if (label.indexOf(']') !== 65)
        return null;
    const hash = `0x${label.slice(1, 65)}`;
    if (!(0, isHex_js_1.isHex)(hash))
        return null;
    return hash;
}
exports.encodedLabelToLabelhash = encodedLabelToLabelhash;
//# sourceMappingURL=encodedLabelToLabelhash.js.map

/***/ }),

/***/ 9806:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.isNullUniversalResolverError = void 0;
const solidity_js_1 = __webpack_require__(83305);
const base_js_1 = __webpack_require__(24437);
const contract_js_1 = __webpack_require__(30474);
function isNullUniversalResolverError(err, callType) {
    if (!(err instanceof base_js_1.BaseError))
        return false;
    const cause = err.walk((e) => e instanceof contract_js_1.ContractFunctionRevertedError);
    if (!(cause instanceof contract_js_1.ContractFunctionRevertedError))
        return false;
    if (cause.data?.errorName === 'ResolverNotFound')
        return true;
    if (cause.data?.errorName === 'ResolverWildcardNotSupported')
        return true;
    if (cause.reason?.includes('Wildcard on non-extended resolvers is not supported'))
        return true;
    if (callType === 'reverse' && cause.reason === solidity_js_1.panicReasons[50])
        return true;
    return false;
}
exports.isNullUniversalResolverError = isNullUniversalResolverError;
//# sourceMappingURL=errors.js.map

/***/ }),

/***/ 13647:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.labelhash = void 0;
const toBytes_js_1 = __webpack_require__(82750);
const toHex_js_1 = __webpack_require__(86340);
const keccak256_js_1 = __webpack_require__(43708);
const encodedLabelToLabelhash_js_1 = __webpack_require__(88636);
function labelhash(label) {
    const result = new Uint8Array(32).fill(0);
    if (!label)
        return (0, toHex_js_1.bytesToHex)(result);
    return (0, encodedLabelToLabelhash_js_1.encodedLabelToLabelhash)(label) || (0, keccak256_js_1.keccak256)((0, toBytes_js_1.stringToBytes)(label));
}
exports.labelhash = labelhash;
//# sourceMappingURL=labelhash.js.map

/***/ }),

/***/ 76230:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.namehash = void 0;
const concat_js_1 = __webpack_require__(15991);
const toBytes_js_1 = __webpack_require__(82750);
const toHex_js_1 = __webpack_require__(86340);
const keccak256_js_1 = __webpack_require__(43708);
const encodedLabelToLabelhash_js_1 = __webpack_require__(88636);
function namehash(name) {
    let result = new Uint8Array(32).fill(0);
    if (!name)
        return (0, toHex_js_1.bytesToHex)(result);
    const labels = name.split('.');
    for (let i = labels.length - 1; i >= 0; i -= 1) {
        const hashFromEncodedLabel = (0, encodedLabelToLabelhash_js_1.encodedLabelToLabelhash)(labels[i]);
        const hashed = hashFromEncodedLabel
            ? (0, toBytes_js_1.toBytes)(hashFromEncodedLabel)
            : (0, keccak256_js_1.keccak256)((0, toBytes_js_1.stringToBytes)(labels[i]), 'bytes');
        result = (0, keccak256_js_1.keccak256)((0, concat_js_1.concat)([result, hashed]), 'bytes');
    }
    return (0, toHex_js_1.bytesToHex)(result);
}
exports.namehash = namehash;
//# sourceMappingURL=namehash.js.map

/***/ }),

/***/ 91725:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.packetToBytes = void 0;
const toBytes_js_1 = __webpack_require__(82750);
const encodeLabelhash_js_1 = __webpack_require__(95933);
const labelhash_js_1 = __webpack_require__(13647);
function packetToBytes(packet) {
    const value = packet.replace(/^\.|\.$/gm, '');
    if (value.length === 0)
        return new Uint8Array(1);
    const bytes = new Uint8Array((0, toBytes_js_1.stringToBytes)(value).byteLength + 2);
    let offset = 0;
    const list = value.split('.');
    for (let i = 0; i < list.length; i++) {
        let encoded = (0, toBytes_js_1.stringToBytes)(list[i]);
        if (encoded.byteLength > 255)
            encoded = (0, toBytes_js_1.stringToBytes)((0, encodeLabelhash_js_1.encodeLabelhash)((0, labelhash_js_1.labelhash)(list[i])));
        bytes[offset] = encoded.length;
        bytes.set(encoded, offset + 1);
        offset += encoded.length + 1;
    }
    if (bytes.byteLength !== offset + 1)
        return bytes.slice(0, offset + 1);
    return bytes;
}
exports.packetToBytes = packetToBytes;
//# sourceMappingURL=packetToBytes.js.map

/***/ }),

/***/ 96600:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getCallError = void 0;
const contract_js_1 = __webpack_require__(30474);
const node_js_1 = __webpack_require__(20420);
const getNodeError_js_1 = __webpack_require__(86792);
function getCallError(err, { docsPath, ...args }) {
    const cause = (() => {
        const cause = (0, getNodeError_js_1.getNodeError)(err, args);
        if (cause instanceof node_js_1.UnknownNodeError)
            return err;
        return cause;
    })();
    return new contract_js_1.CallExecutionError(cause, {
        docsPath,
        ...args,
    });
}
exports.getCallError = getCallError;
//# sourceMappingURL=getCallError.js.map

/***/ }),

/***/ 92154:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getContractError = void 0;
const abi_js_1 = __webpack_require__(5432);
const base_js_1 = __webpack_require__(24437);
const contract_js_1 = __webpack_require__(30474);
const rpc_js_1 = __webpack_require__(36549);
const EXECUTION_REVERTED_ERROR_CODE = 3;
function getContractError(err, { abi, address, args, docsPath, functionName, sender, }) {
    const { code, data, message, shortMessage } = (err instanceof contract_js_1.RawContractError
        ? err
        : err instanceof base_js_1.BaseError
            ? err.walk((err) => 'data' in err) || err.walk()
            : {});
    const cause = (() => {
        if (err instanceof abi_js_1.AbiDecodingZeroDataError)
            return new contract_js_1.ContractFunctionZeroDataError({ functionName });
        if ([EXECUTION_REVERTED_ERROR_CODE, rpc_js_1.InternalRpcError.code].includes(code) &&
            (data || message || shortMessage)) {
            return new contract_js_1.ContractFunctionRevertedError({
                abi,
                data: typeof data === 'object' ? data.data : data,
                functionName,
                message: shortMessage ?? message,
            });
        }
        return err;
    })();
    return new contract_js_1.ContractFunctionExecutionError(cause, {
        abi,
        args,
        contractAddress: address,
        docsPath,
        functionName,
        sender,
    });
}
exports.getContractError = getContractError;
//# sourceMappingURL=getContractError.js.map

/***/ }),

/***/ 29351:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getEstimateGasError = void 0;
const estimateGas_js_1 = __webpack_require__(7029);
const node_js_1 = __webpack_require__(20420);
const getNodeError_js_1 = __webpack_require__(86792);
function getEstimateGasError(err, { docsPath, ...args }) {
    const cause = (() => {
        const cause = (0, getNodeError_js_1.getNodeError)(err, args);
        if (cause instanceof node_js_1.UnknownNodeError)
            return err;
        return cause;
    })();
    return new estimateGas_js_1.EstimateGasExecutionError(cause, {
        docsPath,
        ...args,
    });
}
exports.getEstimateGasError = getEstimateGasError;
//# sourceMappingURL=getEstimateGasError.js.map

/***/ }),

/***/ 86792:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getNodeError = exports.containsNodeError = void 0;
const base_js_1 = __webpack_require__(24437);
const node_js_1 = __webpack_require__(20420);
const request_js_1 = __webpack_require__(80767);
const rpc_js_1 = __webpack_require__(36549);
function containsNodeError(err) {
    return (err instanceof rpc_js_1.TransactionRejectedRpcError ||
        err instanceof rpc_js_1.InvalidInputRpcError ||
        (err instanceof request_js_1.RpcRequestError && err.code === node_js_1.ExecutionRevertedError.code));
}
exports.containsNodeError = containsNodeError;
function getNodeError(err, args) {
    const message = (err.details || '').toLowerCase();
    const executionRevertedError = err.walk((e) => e.code === node_js_1.ExecutionRevertedError.code);
    if (executionRevertedError instanceof base_js_1.BaseError) {
        return new node_js_1.ExecutionRevertedError({
            cause: err,
            message: executionRevertedError.details,
        });
    }
    if (node_js_1.ExecutionRevertedError.nodeMessage.test(message))
        return new node_js_1.ExecutionRevertedError({
            cause: err,
            message: err.details,
        });
    if (node_js_1.FeeCapTooHighError.nodeMessage.test(message))
        return new node_js_1.FeeCapTooHighError({
            cause: err,
            maxFeePerGas: args?.maxFeePerGas,
        });
    if (node_js_1.FeeCapTooLowError.nodeMessage.test(message))
        return new node_js_1.FeeCapTooLowError({
            cause: err,
            maxFeePerGas: args?.maxFeePerGas,
        });
    if (node_js_1.NonceTooHighError.nodeMessage.test(message))
        return new node_js_1.NonceTooHighError({ cause: err, nonce: args?.nonce });
    if (node_js_1.NonceTooLowError.nodeMessage.test(message))
        return new node_js_1.NonceTooLowError({ cause: err, nonce: args?.nonce });
    if (node_js_1.NonceMaxValueError.nodeMessage.test(message))
        return new node_js_1.NonceMaxValueError({ cause: err, nonce: args?.nonce });
    if (node_js_1.InsufficientFundsError.nodeMessage.test(message))
        return new node_js_1.InsufficientFundsError({ cause: err });
    if (node_js_1.IntrinsicGasTooHighError.nodeMessage.test(message))
        return new node_js_1.IntrinsicGasTooHighError({ cause: err, gas: args?.gas });
    if (node_js_1.IntrinsicGasTooLowError.nodeMessage.test(message))
        return new node_js_1.IntrinsicGasTooLowError({ cause: err, gas: args?.gas });
    if (node_js_1.TransactionTypeNotSupportedError.nodeMessage.test(message))
        return new node_js_1.TransactionTypeNotSupportedError({ cause: err });
    if (node_js_1.TipAboveFeeCapError.nodeMessage.test(message))
        return new node_js_1.TipAboveFeeCapError({
            cause: err,
            maxFeePerGas: args?.maxFeePerGas,
            maxPriorityFeePerGas: args?.maxPriorityFeePerGas,
        });
    return new node_js_1.UnknownNodeError({
        cause: err,
    });
}
exports.getNodeError = getNodeError;
//# sourceMappingURL=getNodeError.js.map

/***/ }),

/***/ 49122:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getTransactionError = void 0;
const node_js_1 = __webpack_require__(20420);
const transaction_js_1 = __webpack_require__(83474);
const getNodeError_js_1 = __webpack_require__(86792);
function getTransactionError(err, { docsPath, ...args }) {
    const cause = (() => {
        const cause = (0, getNodeError_js_1.getNodeError)(err, args);
        if (cause instanceof node_js_1.UnknownNodeError)
            return err;
        return cause;
    })();
    return new transaction_js_1.TransactionExecutionError(cause, {
        docsPath,
        ...args,
    });
}
exports.getTransactionError = getTransactionError;
//# sourceMappingURL=getTransactionError.js.map

/***/ }),

/***/ 57353:
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.createFilterRequestScope = void 0;
function createFilterRequestScope(client, { method }) {
    const requestMap = {};
    if (client.transport.type === 'fallback')
        client.transport.onResponse?.(({ method: method_, response: id, status, transport, }) => {
            if (status === 'success' && method === method_)
                requestMap[id] = transport.request;
        });
    return ((id) => requestMap[id] || client.request);
}
exports.createFilterRequestScope = createFilterRequestScope;
//# sourceMappingURL=createFilterRequestScope.js.map

/***/ }),

/***/ 12885:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.defineBlock = exports.formatBlock = void 0;
const formatter_js_1 = __webpack_require__(52966);
const transaction_js_1 = __webpack_require__(11040);
function formatBlock(block) {
    const transactions = block.transactions?.map((transaction) => {
        if (typeof transaction === 'string')
            return transaction;
        return (0, transaction_js_1.formatTransaction)(transaction);
    });
    return {
        ...block,
        baseFeePerGas: block.baseFeePerGas ? BigInt(block.baseFeePerGas) : null,
        difficulty: block.difficulty ? BigInt(block.difficulty) : undefined,
        gasLimit: block.gasLimit ? BigInt(block.gasLimit) : undefined,
        gasUsed: block.gasUsed ? BigInt(block.gasUsed) : undefined,
        hash: block.hash ? block.hash : null,
        logsBloom: block.logsBloom ? block.logsBloom : null,
        nonce: block.nonce ? block.nonce : null,
        number: block.number ? BigInt(block.number) : null,
        size: block.size ? BigInt(block.size) : undefined,
        timestamp: block.timestamp ? BigInt(block.timestamp) : undefined,
        transactions,
        totalDifficulty: block.totalDifficulty
            ? BigInt(block.totalDifficulty)
            : null,
    };
}
exports.formatBlock = formatBlock;
exports.defineBlock = (0, formatter_js_1.defineFormatter)('block', formatBlock);
//# sourceMappingURL=block.js.map

/***/ }),

/***/ 65457:
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.extract = void 0;
function extract(value_, { format }) {
    if (!format)
        return {};
    const value = {};
    function extract_(formatted) {
        const keys = Object.keys(formatted);
        for (const key of keys) {
            if (key in value_)
                value[key] = value_[key];
            if (formatted[key] &&
                typeof formatted[key] === 'object' &&
                !Array.isArray(formatted[key]))
                extract_(formatted[key]);
        }
    }
    const formatted = format(value_ || {});
    extract_(formatted);
    return value;
}
exports.extract = extract;
//# sourceMappingURL=extract.js.map

/***/ }),

/***/ 61678:
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.formatFeeHistory = void 0;
function formatFeeHistory(feeHistory) {
    return {
        baseFeePerGas: feeHistory.baseFeePerGas.map((value) => BigInt(value)),
        gasUsedRatio: feeHistory.gasUsedRatio,
        oldestBlock: BigInt(feeHistory.oldestBlock),
        reward: feeHistory.reward?.map((reward) => reward.map((value) => BigInt(value))),
    };
}
exports.formatFeeHistory = formatFeeHistory;
//# sourceMappingURL=feeHistory.js.map

/***/ }),

/***/ 52966:
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.defineFormatter = void 0;
function defineFormatter(type, format) {
    return ({ exclude, format: overrides, }) => {
        return {
            exclude,
            format: (args) => {
                const formatted = format(args);
                if (exclude) {
                    for (const key of exclude) {
                        delete formatted[key];
                    }
                }
                return {
                    ...formatted,
                    ...overrides(args),
                };
            },
            type,
        };
    };
}
exports.defineFormatter = defineFormatter;
//# sourceMappingURL=formatter.js.map

/***/ }),

/***/ 55266:
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.formatLog = void 0;
function formatLog(log, { args, eventName } = {}) {
    return {
        ...log,
        blockHash: log.blockHash ? log.blockHash : null,
        blockNumber: log.blockNumber ? BigInt(log.blockNumber) : null,
        logIndex: log.logIndex ? Number(log.logIndex) : null,
        transactionHash: log.transactionHash ? log.transactionHash : null,
        transactionIndex: log.transactionIndex
            ? Number(log.transactionIndex)
            : null,
        ...(eventName ? { args, eventName } : {}),
    };
}
exports.formatLog = formatLog;
//# sourceMappingURL=log.js.map

/***/ }),

/***/ 88250:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.formatProof = void 0;
const index_js_1 = __webpack_require__(2166);
function formatStorageProof(storageProof) {
    return storageProof.map((proof) => ({
        ...proof,
        value: BigInt(proof.value),
    }));
}
function formatProof(proof) {
    return {
        ...proof,
        balance: proof.balance ? BigInt(proof.balance) : undefined,
        nonce: proof.nonce ? (0, index_js_1.hexToNumber)(proof.nonce) : undefined,
        storageProof: proof.storageProof
            ? formatStorageProof(proof.storageProof)
            : undefined,
    };
}
exports.formatProof = formatProof;
//# sourceMappingURL=proof.js.map

/***/ }),

/***/ 11040:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.defineTransaction = exports.formatTransaction = exports.transactionType = void 0;
const fromHex_js_1 = __webpack_require__(50159);
const formatter_js_1 = __webpack_require__(52966);
exports.transactionType = {
    '0x0': 'legacy',
    '0x1': 'eip2930',
    '0x2': 'eip1559',
};
function formatTransaction(transaction) {
    const transaction_ = {
        ...transaction,
        blockHash: transaction.blockHash ? transaction.blockHash : null,
        blockNumber: transaction.blockNumber
            ? BigInt(transaction.blockNumber)
            : null,
        chainId: transaction.chainId ? (0, fromHex_js_1.hexToNumber)(transaction.chainId) : undefined,
        gas: transaction.gas ? BigInt(transaction.gas) : undefined,
        gasPrice: transaction.gasPrice ? BigInt(transaction.gasPrice) : undefined,
        maxFeePerGas: transaction.maxFeePerGas
            ? BigInt(transaction.maxFeePerGas)
            : undefined,
        maxPriorityFeePerGas: transaction.maxPriorityFeePerGas
            ? BigInt(transaction.maxPriorityFeePerGas)
            : undefined,
        nonce: transaction.nonce ? (0, fromHex_js_1.hexToNumber)(transaction.nonce) : undefined,
        to: transaction.to ? transaction.to : null,
        transactionIndex: transaction.transactionIndex
            ? Number(transaction.transactionIndex)
            : null,
        type: transaction.type ? exports.transactionType[transaction.type] : undefined,
        typeHex: transaction.type ? transaction.type : undefined,
        value: transaction.value ? BigInt(transaction.value) : undefined,
        v: transaction.v ? BigInt(transaction.v) : undefined,
    };
    transaction_.yParity = (() => {
        if (transaction.yParity)
            return Number(transaction.yParity);
        if (typeof transaction_.v === 'bigint') {
            if (transaction_.v === 0n || transaction_.v === 27n)
                return 0;
            if (transaction_.v === 1n || transaction_.v === 28n)
                return 1;
            if (transaction_.v >= 35n)
                return transaction_.v % 2n === 0n ? 1 : 0;
        }
        return undefined;
    })();
    if (transaction_.type === 'legacy') {
        delete transaction_.accessList;
        delete transaction_.maxFeePerGas;
        delete transaction_.maxPriorityFeePerGas;
        delete transaction_.yParity;
    }
    if (transaction_.type === 'eip2930') {
        delete transaction_.maxFeePerGas;
        delete transaction_.maxPriorityFeePerGas;
    }
    return transaction_;
}
exports.formatTransaction = formatTransaction;
exports.defineTransaction = (0, formatter_js_1.defineFormatter)('transaction', formatTransaction);
//# sourceMappingURL=transaction.js.map

/***/ }),

/***/ 47342:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.defineTransactionReceipt = exports.formatTransactionReceipt = void 0;
const fromHex_js_1 = __webpack_require__(50159);
const formatter_js_1 = __webpack_require__(52966);
const log_js_1 = __webpack_require__(55266);
const transaction_js_1 = __webpack_require__(11040);
const statuses = {
    '0x0': 'reverted',
    '0x1': 'success',
};
function formatTransactionReceipt(transactionReceipt) {
    return {
        ...transactionReceipt,
        blockNumber: transactionReceipt.blockNumber
            ? BigInt(transactionReceipt.blockNumber)
            : null,
        contractAddress: transactionReceipt.contractAddress
            ? transactionReceipt.contractAddress
            : null,
        cumulativeGasUsed: transactionReceipt.cumulativeGasUsed
            ? BigInt(transactionReceipt.cumulativeGasUsed)
            : null,
        effectiveGasPrice: transactionReceipt.effectiveGasPrice
            ? BigInt(transactionReceipt.effectiveGasPrice)
            : null,
        gasUsed: transactionReceipt.gasUsed
            ? BigInt(transactionReceipt.gasUsed)
            : null,
        logs: transactionReceipt.logs
            ? transactionReceipt.logs.map((log) => (0, log_js_1.formatLog)(log))
            : null,
        to: transactionReceipt.to ? transactionReceipt.to : null,
        transactionIndex: transactionReceipt.transactionIndex
            ? (0, fromHex_js_1.hexToNumber)(transactionReceipt.transactionIndex)
            : null,
        status: transactionReceipt.status
            ? statuses[transactionReceipt.status]
            : null,
        type: transactionReceipt.type
            ? transaction_js_1.transactionType[transactionReceipt.type] || transactionReceipt.type
            : null,
    };
}
exports.formatTransactionReceipt = formatTransactionReceipt;
exports.defineTransactionReceipt = (0, formatter_js_1.defineFormatter)('transactionReceipt', formatTransactionReceipt);
//# sourceMappingURL=transactionReceipt.js.map

/***/ }),

/***/ 23459:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.defineTransactionRequest = exports.formatTransactionRequest = exports.rpcTransactionType = void 0;
const toHex_js_1 = __webpack_require__(86340);
const formatter_js_1 = __webpack_require__(52966);
exports.rpcTransactionType = {
    legacy: '0x0',
    eip2930: '0x1',
    eip1559: '0x2',
};
function formatTransactionRequest(transactionRequest) {
    return {
        ...transactionRequest,
        gas: typeof transactionRequest.gas !== 'undefined'
            ? (0, toHex_js_1.numberToHex)(transactionRequest.gas)
            : undefined,
        gasPrice: typeof transactionRequest.gasPrice !== 'undefined'
            ? (0, toHex_js_1.numberToHex)(transactionRequest.gasPrice)
            : undefined,
        maxFeePerGas: typeof transactionRequest.maxFeePerGas !== 'undefined'
            ? (0, toHex_js_1.numberToHex)(transactionRequest.maxFeePerGas)
            : undefined,
        maxPriorityFeePerGas: typeof transactionRequest.maxPriorityFeePerGas !== 'undefined'
            ? (0, toHex_js_1.numberToHex)(transactionRequest.maxPriorityFeePerGas)
            : undefined,
        nonce: typeof transactionRequest.nonce !== 'undefined'
            ? (0, toHex_js_1.numberToHex)(transactionRequest.nonce)
            : undefined,
        type: typeof transactionRequest.type !== 'undefined'
            ? exports.rpcTransactionType[transactionRequest.type]
            : undefined,
        value: typeof transactionRequest.value !== 'undefined'
            ? (0, toHex_js_1.numberToHex)(transactionRequest.value)
            : undefined,
    };
}
exports.formatTransactionRequest = formatTransactionRequest;
exports.defineTransactionRequest = (0, formatter_js_1.defineFormatter)('transactionRequest', formatTransactionRequest);
//# sourceMappingURL=transactionRequest.js.map

/***/ }),

/***/ 46840:
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getAction = void 0;
function getAction(client, action, name) {
    return (params) => client[action.name || name]?.(params) ?? action(client, params);
}
exports.getAction = getAction;
//# sourceMappingURL=getAction.js.map

/***/ }),

/***/ 33938:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getEventSelector = void 0;
const toBytes_js_1 = __webpack_require__(82750);
const getEventSignature_js_1 = __webpack_require__(63593);
const keccak256_js_1 = __webpack_require__(43708);
const hash = (value) => (0, keccak256_js_1.keccak256)((0, toBytes_js_1.toBytes)(value));
const getEventSelector = (fn) => hash((0, getEventSignature_js_1.getEventSignature)(fn));
exports.getEventSelector = getEventSelector;
//# sourceMappingURL=getEventSelector.js.map

/***/ }),

/***/ 63593:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getEventSignature = void 0;
const getFunctionSignature_js_1 = __webpack_require__(92393);
const getEventSignature = (fn) => {
    return (0, getFunctionSignature_js_1.getFunctionSignature)(fn);
};
exports.getEventSignature = getEventSignature;
//# sourceMappingURL=getEventSignature.js.map

/***/ }),

/***/ 44402:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getFunctionSelector = void 0;
const slice_js_1 = __webpack_require__(61909);
const toBytes_js_1 = __webpack_require__(82750);
const getFunctionSignature_js_1 = __webpack_require__(92393);
const keccak256_js_1 = __webpack_require__(43708);
const hash = (value) => (0, keccak256_js_1.keccak256)((0, toBytes_js_1.toBytes)(value));
const getFunctionSelector = (fn) => (0, slice_js_1.slice)(hash((0, getFunctionSignature_js_1.getFunctionSignature)(fn)), 0, 4);
exports.getFunctionSelector = getFunctionSelector;
//# sourceMappingURL=getFunctionSelector.js.map

/***/ }),

/***/ 92393:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getFunctionSignature = void 0;
const abitype_1 = __webpack_require__(77561);
const normalizeSignature_js_1 = __webpack_require__(84236);
const getFunctionSignature = (fn_) => {
    const fn = (() => {
        if (typeof fn_ === 'string')
            return fn_;
        return (0, abitype_1.formatAbiItem)(fn_);
    })();
    return (0, normalizeSignature_js_1.normalizeSignature)(fn);
};
exports.getFunctionSignature = getFunctionSignature;
//# sourceMappingURL=getFunctionSignature.js.map

/***/ }),

/***/ 12903:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.isHash = void 0;
const isHex_js_1 = __webpack_require__(88846);
const size_js_1 = __webpack_require__(82026);
function isHash(hash) {
    return (0, isHex_js_1.isHex)(hash) && (0, size_js_1.size)(hash) === 32;
}
exports.isHash = isHash;
//# sourceMappingURL=isHash.js.map

/***/ }),

/***/ 43708:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.keccak256 = void 0;
const sha3_1 = __webpack_require__(2724);
const isHex_js_1 = __webpack_require__(88846);
const toBytes_js_1 = __webpack_require__(82750);
const toHex_js_1 = __webpack_require__(86340);
function keccak256(value, to_) {
    const to = to_ || 'hex';
    const bytes = (0, sha3_1.keccak_256)((0, isHex_js_1.isHex)(value, { strict: false }) ? (0, toBytes_js_1.toBytes)(value) : value);
    if (to === 'bytes')
        return bytes;
    return (0, toHex_js_1.toHex)(bytes);
}
exports.keccak256 = keccak256;
//# sourceMappingURL=keccak256.js.map

/***/ }),

/***/ 84236:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.normalizeSignature = void 0;
const base_js_1 = __webpack_require__(24437);
function normalizeSignature(signature) {
    let active = true;
    let current = '';
    let level = 0;
    let result = '';
    let valid = false;
    for (let i = 0; i < signature.length; i++) {
        const char = signature[i];
        if (['(', ')', ','].includes(char))
            active = true;
        if (char === '(')
            level++;
        if (char === ')')
            level--;
        if (!active)
            continue;
        if (level === 0) {
            if (char === ' ' && ['event', 'function', ''].includes(result))
                result = '';
            else {
                result += char;
                if (char === ')') {
                    valid = true;
                    break;
                }
            }
            continue;
        }
        if (char === ' ') {
            if (signature[i - 1] !== ',' && current !== ',' && current !== ',(') {
                current = '';
                active = false;
            }
            continue;
        }
        result += char;
        current += char;
    }
    if (!valid)
        throw new base_js_1.BaseError('Unable to normalize signature.');
    return result;
}
exports.normalizeSignature = normalizeSignature;
//# sourceMappingURL=normalizeSignature.js.map

/***/ }),

/***/ 17883:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.ripemd160 = void 0;
const ripemd160_1 = __webpack_require__(64003);
const isHex_js_1 = __webpack_require__(88846);
const toBytes_js_1 = __webpack_require__(82750);
const toHex_js_1 = __webpack_require__(86340);
function ripemd160(value, to_) {
    const to = to_ || 'hex';
    const bytes = (0, ripemd160_1.ripemd160)((0, isHex_js_1.isHex)(value, { strict: false }) ? (0, toBytes_js_1.toBytes)(value) : value);
    if (to === 'bytes')
        return bytes;
    return (0, toHex_js_1.toHex)(bytes);
}
exports.ripemd160 = ripemd160;
//# sourceMappingURL=ripemd160.js.map

/***/ }),

/***/ 61764:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.sha256 = void 0;
const sha256_1 = __webpack_require__(64524);
const isHex_js_1 = __webpack_require__(88846);
const toBytes_js_1 = __webpack_require__(82750);
const toHex_js_1 = __webpack_require__(86340);
function sha256(value, to_) {
    const to = to_ || 'hex';
    const bytes = (0, sha256_1.sha256)((0, isHex_js_1.isHex)(value, { strict: false }) ? (0, toBytes_js_1.toBytes)(value) : value);
    if (to === 'bytes')
        return bytes;
    return (0, toHex_js_1.toHex)(bytes);
}
exports.sha256 = sha256;
//# sourceMappingURL=sha256.js.map

/***/ }),

/***/ 2166:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.concat = exports.extractFunctionParts = exports.extractFunctionType = exports.extractFunctionParams = exports.extractFunctionName = exports.isAddressEqual = exports.isAddress = exports.getAddress = exports.getCreate2Address = exports.getCreateAddress = exports.getContractAddress = exports.publicKeyToAddress = exports.parseAccount = exports.formatAbiParams = exports.formatAbiItem = exports.formatAbiItemWithArgs = exports.encodePacked = exports.parseAbiParameters = exports.parseAbiParameter = exports.parseAbiItem = exports.parseAbi = exports.getAbiItem = exports.encodeFunctionResult = exports.encodeFunctionData = exports.encodeEventTopics = exports.encodeErrorResult = exports.encodeDeployData = exports.encodeAbiParameters = exports.decodeFunctionResult = exports.decodeFunctionData = exports.decodeEventLog = exports.decodeErrorResult = exports.decodeAbiParameters = exports.validateTypedData = exports.stringify = exports.rpc = exports.getSocket = exports.integerRegex = exports.bytesRegex = exports.arrayRegex = exports.getChainContractAddress = exports.extractChain = exports.defineChain = exports.assertCurrentChain = exports.offchainLookupSignature = exports.offchainLookupAbiItem = exports.offchainLookup = exports.ccipFetch = exports.buildRequest = exports.isDeterministicError = void 0;
exports.getEstimateGasError = exports.getContractError = exports.getCallError = exports.getNodeError = exports.containsNodeError = exports.fromRlp = exports.hexToString = exports.hexToNumber = exports.hexToBigInt = exports.hexToBool = exports.fromHex = exports.fromBytes = exports.bytesToString = exports.bytesToNumber = exports.bytesToBool = exports.bytesToBigint = exports.bytesToBigInt = exports.stringToHex = exports.numberToHex = exports.toHex = exports.bytesToHex = exports.boolToHex = exports.stringToBytes = exports.numberToBytes = exports.hexToBytes = exports.toBytes = exports.boolToBytes = exports.toRlp = exports.extract = exports.formatTransactionRequest = exports.defineTransactionRequest = exports.defineTransactionReceipt = exports.formatLog = exports.transactionType = exports.formatTransaction = exports.defineTransaction = exports.formatBlock = exports.defineBlock = exports.trim = exports.sliceHex = exports.sliceBytes = exports.slice = exports.size = exports.padHex = exports.padBytes = exports.pad = exports.isHex = exports.isBytes = exports.concatHex = exports.concatBytes = void 0;
exports.parseGwei = exports.parseEther = exports.parseUnits = exports.formatUnits = exports.formatGwei = exports.formatEther = exports.serializeAccessList = exports.serializeTransaction = exports.prepareTransactionRequest = exports.parseTransaction = exports.assertTransactionLegacy = exports.assertTransactionEIP2930 = exports.assertTransactionEIP1559 = exports.assertRequest = exports.getTransactionType = exports.getSerializedTransactionType = exports.hashMessage = exports.verifyTypedData = exports.verifyMessage = exports.recoverTypedDataAddress = exports.recoverPublicKey = exports.recoverMessageAddress = exports.recoverAddress = exports.hashTypedData = exports.ripemd160 = exports.sha256 = exports.keccak256 = exports.isHash = exports.getFunctionSelector = exports.getEventSelector = exports.defineFormatter = exports.getTransactionError = void 0;
var buildRequest_js_1 = __webpack_require__(48701);
Object.defineProperty(exports, "isDeterministicError", ({ enumerable: true, get: function () { return buildRequest_js_1.isDeterministicError; } }));
Object.defineProperty(exports, "buildRequest", ({ enumerable: true, get: function () { return buildRequest_js_1.buildRequest; } }));
var ccip_js_1 = __webpack_require__(61091);
Object.defineProperty(exports, "ccipFetch", ({ enumerable: true, get: function () { return ccip_js_1.ccipFetch; } }));
Object.defineProperty(exports, "offchainLookup", ({ enumerable: true, get: function () { return ccip_js_1.offchainLookup; } }));
Object.defineProperty(exports, "offchainLookupAbiItem", ({ enumerable: true, get: function () { return ccip_js_1.offchainLookupAbiItem; } }));
Object.defineProperty(exports, "offchainLookupSignature", ({ enumerable: true, get: function () { return ccip_js_1.offchainLookupSignature; } }));
var assertCurrentChain_js_1 = __webpack_require__(63602);
Object.defineProperty(exports, "assertCurrentChain", ({ enumerable: true, get: function () { return assertCurrentChain_js_1.assertCurrentChain; } }));
var defineChain_js_1 = __webpack_require__(54416);
Object.defineProperty(exports, "defineChain", ({ enumerable: true, get: function () { return defineChain_js_1.defineChain; } }));
var extractChain_js_1 = __webpack_require__(7479);
Object.defineProperty(exports, "extractChain", ({ enumerable: true, get: function () { return extractChain_js_1.extractChain; } }));
var getChainContractAddress_js_1 = __webpack_require__(30245);
Object.defineProperty(exports, "getChainContractAddress", ({ enumerable: true, get: function () { return getChainContractAddress_js_1.getChainContractAddress; } }));
var regex_js_1 = __webpack_require__(44857);
Object.defineProperty(exports, "arrayRegex", ({ enumerable: true, get: function () { return regex_js_1.arrayRegex; } }));
Object.defineProperty(exports, "bytesRegex", ({ enumerable: true, get: function () { return regex_js_1.bytesRegex; } }));
Object.defineProperty(exports, "integerRegex", ({ enumerable: true, get: function () { return regex_js_1.integerRegex; } }));
var rpc_js_1 = __webpack_require__(50205);
Object.defineProperty(exports, "getSocket", ({ enumerable: true, get: function () { return rpc_js_1.getSocket; } }));
Object.defineProperty(exports, "rpc", ({ enumerable: true, get: function () { return rpc_js_1.rpc; } }));
var stringify_js_1 = __webpack_require__(68395);
Object.defineProperty(exports, "stringify", ({ enumerable: true, get: function () { return stringify_js_1.stringify; } }));
var typedData_js_1 = __webpack_require__(25330);
Object.defineProperty(exports, "validateTypedData", ({ enumerable: true, get: function () { return typedData_js_1.validateTypedData; } }));
var decodeAbiParameters_js_1 = __webpack_require__(16615);
Object.defineProperty(exports, "decodeAbiParameters", ({ enumerable: true, get: function () { return decodeAbiParameters_js_1.decodeAbiParameters; } }));
var decodeErrorResult_js_1 = __webpack_require__(33058);
Object.defineProperty(exports, "decodeErrorResult", ({ enumerable: true, get: function () { return decodeErrorResult_js_1.decodeErrorResult; } }));
var decodeEventLog_js_1 = __webpack_require__(83327);
Object.defineProperty(exports, "decodeEventLog", ({ enumerable: true, get: function () { return decodeEventLog_js_1.decodeEventLog; } }));
var decodeFunctionData_js_1 = __webpack_require__(81973);
Object.defineProperty(exports, "decodeFunctionData", ({ enumerable: true, get: function () { return decodeFunctionData_js_1.decodeFunctionData; } }));
var decodeFunctionResult_js_1 = __webpack_require__(22080);
Object.defineProperty(exports, "decodeFunctionResult", ({ enumerable: true, get: function () { return decodeFunctionResult_js_1.decodeFunctionResult; } }));
var encodeAbiParameters_js_1 = __webpack_require__(82671);
Object.defineProperty(exports, "encodeAbiParameters", ({ enumerable: true, get: function () { return encodeAbiParameters_js_1.encodeAbiParameters; } }));
var encodeDeployData_js_1 = __webpack_require__(76006);
Object.defineProperty(exports, "encodeDeployData", ({ enumerable: true, get: function () { return encodeDeployData_js_1.encodeDeployData; } }));
var encodeErrorResult_js_1 = __webpack_require__(32778);
Object.defineProperty(exports, "encodeErrorResult", ({ enumerable: true, get: function () { return encodeErrorResult_js_1.encodeErrorResult; } }));
var encodeEventTopics_js_1 = __webpack_require__(38805);
Object.defineProperty(exports, "encodeEventTopics", ({ enumerable: true, get: function () { return encodeEventTopics_js_1.encodeEventTopics; } }));
var encodeFunctionData_js_1 = __webpack_require__(99117);
Object.defineProperty(exports, "encodeFunctionData", ({ enumerable: true, get: function () { return encodeFunctionData_js_1.encodeFunctionData; } }));
var encodeFunctionResult_js_1 = __webpack_require__(52616);
Object.defineProperty(exports, "encodeFunctionResult", ({ enumerable: true, get: function () { return encodeFunctionResult_js_1.encodeFunctionResult; } }));
var getAbiItem_js_1 = __webpack_require__(79606);
Object.defineProperty(exports, "getAbiItem", ({ enumerable: true, get: function () { return getAbiItem_js_1.getAbiItem; } }));
var abitype_1 = __webpack_require__(77561);
Object.defineProperty(exports, "parseAbi", ({ enumerable: true, get: function () { return abitype_1.parseAbi; } }));
Object.defineProperty(exports, "parseAbiItem", ({ enumerable: true, get: function () { return abitype_1.parseAbiItem; } }));
Object.defineProperty(exports, "parseAbiParameter", ({ enumerable: true, get: function () { return abitype_1.parseAbiParameter; } }));
Object.defineProperty(exports, "parseAbiParameters", ({ enumerable: true, get: function () { return abitype_1.parseAbiParameters; } }));
var encodePacked_js_1 = __webpack_require__(63865);
Object.defineProperty(exports, "encodePacked", ({ enumerable: true, get: function () { return encodePacked_js_1.encodePacked; } }));
var formatAbiItemWithArgs_js_1 = __webpack_require__(75586);
Object.defineProperty(exports, "formatAbiItemWithArgs", ({ enumerable: true, get: function () { return formatAbiItemWithArgs_js_1.formatAbiItemWithArgs; } }));
var formatAbiItem_js_1 = __webpack_require__(36859);
Object.defineProperty(exports, "formatAbiItem", ({ enumerable: true, get: function () { return formatAbiItem_js_1.formatAbiItem; } }));
Object.defineProperty(exports, "formatAbiParams", ({ enumerable: true, get: function () { return formatAbiItem_js_1.formatAbiParams; } }));
var parseAccount_js_1 = __webpack_require__(79429);
Object.defineProperty(exports, "parseAccount", ({ enumerable: true, get: function () { return parseAccount_js_1.parseAccount; } }));
var publicKeyToAddress_js_1 = __webpack_require__(13740);
Object.defineProperty(exports, "publicKeyToAddress", ({ enumerable: true, get: function () { return publicKeyToAddress_js_1.publicKeyToAddress; } }));
var getContractAddress_js_1 = __webpack_require__(78831);
Object.defineProperty(exports, "getContractAddress", ({ enumerable: true, get: function () { return getContractAddress_js_1.getContractAddress; } }));
Object.defineProperty(exports, "getCreateAddress", ({ enumerable: true, get: function () { return getContractAddress_js_1.getCreateAddress; } }));
Object.defineProperty(exports, "getCreate2Address", ({ enumerable: true, get: function () { return getContractAddress_js_1.getCreate2Address; } }));
var getAddress_js_1 = __webpack_require__(18717);
Object.defineProperty(exports, "getAddress", ({ enumerable: true, get: function () { return getAddress_js_1.getAddress; } }));
var isAddress_js_1 = __webpack_require__(81061);
Object.defineProperty(exports, "isAddress", ({ enumerable: true, get: function () { return isAddress_js_1.isAddress; } }));
var isAddressEqual_js_1 = __webpack_require__(47681);
Object.defineProperty(exports, "isAddressEqual", ({ enumerable: true, get: function () { return isAddressEqual_js_1.isAddressEqual; } }));
var extractFunctionParts_js_1 = __webpack_require__(2032);
Object.defineProperty(exports, "extractFunctionName", ({ enumerable: true, get: function () { return extractFunctionParts_js_1.extractFunctionName; } }));
Object.defineProperty(exports, "extractFunctionParams", ({ enumerable: true, get: function () { return extractFunctionParts_js_1.extractFunctionParams; } }));
Object.defineProperty(exports, "extractFunctionType", ({ enumerable: true, get: function () { return extractFunctionParts_js_1.extractFunctionType; } }));
Object.defineProperty(exports, "extractFunctionParts", ({ enumerable: true, get: function () { return extractFunctionParts_js_1.extractFunctionParts; } }));
var concat_js_1 = __webpack_require__(15991);
Object.defineProperty(exports, "concat", ({ enumerable: true, get: function () { return concat_js_1.concat; } }));
Object.defineProperty(exports, "concatBytes", ({ enumerable: true, get: function () { return concat_js_1.concatBytes; } }));
Object.defineProperty(exports, "concatHex", ({ enumerable: true, get: function () { return concat_js_1.concatHex; } }));
var isBytes_js_1 = __webpack_require__(62968);
Object.defineProperty(exports, "isBytes", ({ enumerable: true, get: function () { return isBytes_js_1.isBytes; } }));
var isHex_js_1 = __webpack_require__(88846);
Object.defineProperty(exports, "isHex", ({ enumerable: true, get: function () { return isHex_js_1.isHex; } }));
var pad_js_1 = __webpack_require__(18046);
Object.defineProperty(exports, "pad", ({ enumerable: true, get: function () { return pad_js_1.pad; } }));
Object.defineProperty(exports, "padBytes", ({ enumerable: true, get: function () { return pad_js_1.padBytes; } }));
Object.defineProperty(exports, "padHex", ({ enumerable: true, get: function () { return pad_js_1.padHex; } }));
var size_js_1 = __webpack_require__(82026);
Object.defineProperty(exports, "size", ({ enumerable: true, get: function () { return size_js_1.size; } }));
var slice_js_1 = __webpack_require__(61909);
Object.defineProperty(exports, "slice", ({ enumerable: true, get: function () { return slice_js_1.slice; } }));
Object.defineProperty(exports, "sliceBytes", ({ enumerable: true, get: function () { return slice_js_1.sliceBytes; } }));
Object.defineProperty(exports, "sliceHex", ({ enumerable: true, get: function () { return slice_js_1.sliceHex; } }));
var trim_js_1 = __webpack_require__(45611);
Object.defineProperty(exports, "trim", ({ enumerable: true, get: function () { return trim_js_1.trim; } }));
var block_js_1 = __webpack_require__(12885);
Object.defineProperty(exports, "defineBlock", ({ enumerable: true, get: function () { return block_js_1.defineBlock; } }));
Object.defineProperty(exports, "formatBlock", ({ enumerable: true, get: function () { return block_js_1.formatBlock; } }));
var transaction_js_1 = __webpack_require__(11040);
Object.defineProperty(exports, "defineTransaction", ({ enumerable: true, get: function () { return transaction_js_1.defineTransaction; } }));
Object.defineProperty(exports, "formatTransaction", ({ enumerable: true, get: function () { return transaction_js_1.formatTransaction; } }));
Object.defineProperty(exports, "transactionType", ({ enumerable: true, get: function () { return transaction_js_1.transactionType; } }));
var log_js_1 = __webpack_require__(55266);
Object.defineProperty(exports, "formatLog", ({ enumerable: true, get: function () { return log_js_1.formatLog; } }));
var transactionReceipt_js_1 = __webpack_require__(47342);
Object.defineProperty(exports, "defineTransactionReceipt", ({ enumerable: true, get: function () { return transactionReceipt_js_1.defineTransactionReceipt; } }));
var transactionRequest_js_1 = __webpack_require__(23459);
Object.defineProperty(exports, "defineTransactionRequest", ({ enumerable: true, get: function () { return transactionRequest_js_1.defineTransactionRequest; } }));
Object.defineProperty(exports, "formatTransactionRequest", ({ enumerable: true, get: function () { return transactionRequest_js_1.formatTransactionRequest; } }));
var extract_js_1 = __webpack_require__(65457);
Object.defineProperty(exports, "extract", ({ enumerable: true, get: function () { return extract_js_1.extract; } }));
var toRlp_js_1 = __webpack_require__(25943);
Object.defineProperty(exports, "toRlp", ({ enumerable: true, get: function () { return toRlp_js_1.toRlp; } }));
var toBytes_js_1 = __webpack_require__(82750);
Object.defineProperty(exports, "boolToBytes", ({ enumerable: true, get: function () { return toBytes_js_1.boolToBytes; } }));
Object.defineProperty(exports, "toBytes", ({ enumerable: true, get: function () { return toBytes_js_1.toBytes; } }));
Object.defineProperty(exports, "hexToBytes", ({ enumerable: true, get: function () { return toBytes_js_1.hexToBytes; } }));
Object.defineProperty(exports, "numberToBytes", ({ enumerable: true, get: function () { return toBytes_js_1.numberToBytes; } }));
Object.defineProperty(exports, "stringToBytes", ({ enumerable: true, get: function () { return toBytes_js_1.stringToBytes; } }));
var toHex_js_1 = __webpack_require__(86340);
Object.defineProperty(exports, "boolToHex", ({ enumerable: true, get: function () { return toHex_js_1.boolToHex; } }));
Object.defineProperty(exports, "bytesToHex", ({ enumerable: true, get: function () { return toHex_js_1.bytesToHex; } }));
Object.defineProperty(exports, "toHex", ({ enumerable: true, get: function () { return toHex_js_1.toHex; } }));
Object.defineProperty(exports, "numberToHex", ({ enumerable: true, get: function () { return toHex_js_1.numberToHex; } }));
Object.defineProperty(exports, "stringToHex", ({ enumerable: true, get: function () { return toHex_js_1.stringToHex; } }));
var fromBytes_js_1 = __webpack_require__(55293);
Object.defineProperty(exports, "bytesToBigInt", ({ enumerable: true, get: function () { return fromBytes_js_1.bytesToBigInt; } }));
Object.defineProperty(exports, "bytesToBigint", ({ enumerable: true, get: function () { return fromBytes_js_1.bytesToBigInt; } }));
Object.defineProperty(exports, "bytesToBool", ({ enumerable: true, get: function () { return fromBytes_js_1.bytesToBool; } }));
Object.defineProperty(exports, "bytesToNumber", ({ enumerable: true, get: function () { return fromBytes_js_1.bytesToNumber; } }));
Object.defineProperty(exports, "bytesToString", ({ enumerable: true, get: function () { return fromBytes_js_1.bytesToString; } }));
Object.defineProperty(exports, "fromBytes", ({ enumerable: true, get: function () { return fromBytes_js_1.fromBytes; } }));
var fromHex_js_1 = __webpack_require__(50159);
Object.defineProperty(exports, "fromHex", ({ enumerable: true, get: function () { return fromHex_js_1.fromHex; } }));
Object.defineProperty(exports, "hexToBool", ({ enumerable: true, get: function () { return fromHex_js_1.hexToBool; } }));
Object.defineProperty(exports, "hexToBigInt", ({ enumerable: true, get: function () { return fromHex_js_1.hexToBigInt; } }));
Object.defineProperty(exports, "hexToNumber", ({ enumerable: true, get: function () { return fromHex_js_1.hexToNumber; } }));
Object.defineProperty(exports, "hexToString", ({ enumerable: true, get: function () { return fromHex_js_1.hexToString; } }));
var fromRlp_js_1 = __webpack_require__(25744);
Object.defineProperty(exports, "fromRlp", ({ enumerable: true, get: function () { return fromRlp_js_1.fromRlp; } }));
var getNodeError_js_1 = __webpack_require__(86792);
Object.defineProperty(exports, "containsNodeError", ({ enumerable: true, get: function () { return getNodeError_js_1.containsNodeError; } }));
Object.defineProperty(exports, "getNodeError", ({ enumerable: true, get: function () { return getNodeError_js_1.getNodeError; } }));
var getCallError_js_1 = __webpack_require__(96600);
Object.defineProperty(exports, "getCallError", ({ enumerable: true, get: function () { return getCallError_js_1.getCallError; } }));
var getContractError_js_1 = __webpack_require__(92154);
Object.defineProperty(exports, "getContractError", ({ enumerable: true, get: function () { return getContractError_js_1.getContractError; } }));
var getEstimateGasError_js_1 = __webpack_require__(29351);
Object.defineProperty(exports, "getEstimateGasError", ({ enumerable: true, get: function () { return getEstimateGasError_js_1.getEstimateGasError; } }));
var getTransactionError_js_1 = __webpack_require__(49122);
Object.defineProperty(exports, "getTransactionError", ({ enumerable: true, get: function () { return getTransactionError_js_1.getTransactionError; } }));
var formatter_js_1 = __webpack_require__(52966);
Object.defineProperty(exports, "defineFormatter", ({ enumerable: true, get: function () { return formatter_js_1.defineFormatter; } }));
var getEventSelector_js_1 = __webpack_require__(33938);
Object.defineProperty(exports, "getEventSelector", ({ enumerable: true, get: function () { return getEventSelector_js_1.getEventSelector; } }));
var getFunctionSelector_js_1 = __webpack_require__(44402);
Object.defineProperty(exports, "getFunctionSelector", ({ enumerable: true, get: function () { return getFunctionSelector_js_1.getFunctionSelector; } }));
var isHash_js_1 = __webpack_require__(12903);
Object.defineProperty(exports, "isHash", ({ enumerable: true, get: function () { return isHash_js_1.isHash; } }));
var keccak256_js_1 = __webpack_require__(43708);
Object.defineProperty(exports, "keccak256", ({ enumerable: true, get: function () { return keccak256_js_1.keccak256; } }));
var sha256_js_1 = __webpack_require__(61764);
Object.defineProperty(exports, "sha256", ({ enumerable: true, get: function () { return sha256_js_1.sha256; } }));
var ripemd160_js_1 = __webpack_require__(17883);
Object.defineProperty(exports, "ripemd160", ({ enumerable: true, get: function () { return ripemd160_js_1.ripemd160; } }));
var hashTypedData_js_1 = __webpack_require__(32911);
Object.defineProperty(exports, "hashTypedData", ({ enumerable: true, get: function () { return hashTypedData_js_1.hashTypedData; } }));
var recoverAddress_js_1 = __webpack_require__(42679);
Object.defineProperty(exports, "recoverAddress", ({ enumerable: true, get: function () { return recoverAddress_js_1.recoverAddress; } }));
var recoverMessageAddress_js_1 = __webpack_require__(26550);
Object.defineProperty(exports, "recoverMessageAddress", ({ enumerable: true, get: function () { return recoverMessageAddress_js_1.recoverMessageAddress; } }));
var recoverPublicKey_js_1 = __webpack_require__(41247);
Object.defineProperty(exports, "recoverPublicKey", ({ enumerable: true, get: function () { return recoverPublicKey_js_1.recoverPublicKey; } }));
var recoverTypedDataAddress_js_1 = __webpack_require__(37147);
Object.defineProperty(exports, "recoverTypedDataAddress", ({ enumerable: true, get: function () { return recoverTypedDataAddress_js_1.recoverTypedDataAddress; } }));
var verifyMessage_js_1 = __webpack_require__(20111);
Object.defineProperty(exports, "verifyMessage", ({ enumerable: true, get: function () { return verifyMessage_js_1.verifyMessage; } }));
var verifyTypedData_js_1 = __webpack_require__(48204);
Object.defineProperty(exports, "verifyTypedData", ({ enumerable: true, get: function () { return verifyTypedData_js_1.verifyTypedData; } }));
var hashMessage_js_1 = __webpack_require__(10416);
Object.defineProperty(exports, "hashMessage", ({ enumerable: true, get: function () { return hashMessage_js_1.hashMessage; } }));
var getSerializedTransactionType_js_1 = __webpack_require__(40735);
Object.defineProperty(exports, "getSerializedTransactionType", ({ enumerable: true, get: function () { return getSerializedTransactionType_js_1.getSerializedTransactionType; } }));
var getTransactionType_js_1 = __webpack_require__(22277);
Object.defineProperty(exports, "getTransactionType", ({ enumerable: true, get: function () { return getTransactionType_js_1.getTransactionType; } }));
var assertRequest_js_1 = __webpack_require__(12546);
Object.defineProperty(exports, "assertRequest", ({ enumerable: true, get: function () { return assertRequest_js_1.assertRequest; } }));
var assertTransaction_js_1 = __webpack_require__(99959);
Object.defineProperty(exports, "assertTransactionEIP1559", ({ enumerable: true, get: function () { return assertTransaction_js_1.assertTransactionEIP1559; } }));
Object.defineProperty(exports, "assertTransactionEIP2930", ({ enumerable: true, get: function () { return assertTransaction_js_1.assertTransactionEIP2930; } }));
Object.defineProperty(exports, "assertTransactionLegacy", ({ enumerable: true, get: function () { return assertTransaction_js_1.assertTransactionLegacy; } }));
var parseTransaction_js_1 = __webpack_require__(92000);
Object.defineProperty(exports, "parseTransaction", ({ enumerable: true, get: function () { return parseTransaction_js_1.parseTransaction; } }));
var prepareTransactionRequest_js_1 = __webpack_require__(42170);
Object.defineProperty(exports, "prepareTransactionRequest", ({ enumerable: true, get: function () { return prepareTransactionRequest_js_1.prepareTransactionRequest; } }));
var serializeTransaction_js_1 = __webpack_require__(14847);
Object.defineProperty(exports, "serializeTransaction", ({ enumerable: true, get: function () { return serializeTransaction_js_1.serializeTransaction; } }));
var serializeAccessList_js_1 = __webpack_require__(22297);
Object.defineProperty(exports, "serializeAccessList", ({ enumerable: true, get: function () { return serializeAccessList_js_1.serializeAccessList; } }));
var formatEther_js_1 = __webpack_require__(83032);
Object.defineProperty(exports, "formatEther", ({ enumerable: true, get: function () { return formatEther_js_1.formatEther; } }));
var formatGwei_js_1 = __webpack_require__(89978);
Object.defineProperty(exports, "formatGwei", ({ enumerable: true, get: function () { return formatGwei_js_1.formatGwei; } }));
var formatUnits_js_1 = __webpack_require__(29339);
Object.defineProperty(exports, "formatUnits", ({ enumerable: true, get: function () { return formatUnits_js_1.formatUnits; } }));
var parseUnits_js_1 = __webpack_require__(70503);
Object.defineProperty(exports, "parseUnits", ({ enumerable: true, get: function () { return parseUnits_js_1.parseUnits; } }));
var parseEther_js_1 = __webpack_require__(8180);
Object.defineProperty(exports, "parseEther", ({ enumerable: true, get: function () { return parseEther_js_1.parseEther; } }));
var parseGwei_js_1 = __webpack_require__(10526);
Object.defineProperty(exports, "parseGwei", ({ enumerable: true, get: function () { return parseGwei_js_1.parseGwei; } }));
//# sourceMappingURL=index.js.map

/***/ }),

/***/ 14714:
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.observe = exports.cleanupCache = exports.listenersCache = void 0;
exports.listenersCache = new Map();
exports.cleanupCache = new Map();
let callbackCount = 0;
function observe(observerId, callbacks, fn) {
    const callbackId = ++callbackCount;
    const getListeners = () => exports.listenersCache.get(observerId) || [];
    const unsubscribe = () => {
        const listeners = getListeners();
        exports.listenersCache.set(observerId, listeners.filter((cb) => cb.id !== callbackId));
    };
    const unwatch = () => {
        const cleanup = exports.cleanupCache.get(observerId);
        if (getListeners().length === 1 && cleanup)
            cleanup();
        unsubscribe();
    };
    const listeners = getListeners();
    exports.listenersCache.set(observerId, [
        ...listeners,
        { id: callbackId, fns: callbacks },
    ]);
    if (listeners && listeners.length > 0)
        return unwatch;
    const emit = {};
    for (const key in callbacks) {
        emit[key] = ((...args) => {
            const listeners = getListeners();
            if (listeners.length === 0)
                return;
            for (const listener of listeners)
                listener.fns[key]?.(...args);
        });
    }
    const cleanup = fn(emit);
    if (typeof cleanup === 'function')
        exports.cleanupCache.set(observerId, cleanup);
    return unwatch;
}
exports.observe = observe;
//# sourceMappingURL=observe.js.map

/***/ }),

/***/ 63097:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.poll = void 0;
const wait_js_1 = __webpack_require__(80433);
function poll(fn, { emitOnBegin, initialWaitTime, interval }) {
    let active = true;
    const unwatch = () => (active = false);
    const watch = async () => {
        let data = undefined;
        if (emitOnBegin)
            data = await fn({ unpoll: unwatch });
        const initialWait = (await initialWaitTime?.(data)) ?? interval;
        await (0, wait_js_1.wait)(initialWait);
        const poll = async () => {
            if (!active)
                return;
            await fn({ unpoll: unwatch });
            await (0, wait_js_1.wait)(interval);
            poll();
        };
        poll();
    };
    watch();
    return unwatch;
}
exports.poll = poll;
//# sourceMappingURL=poll.js.map

/***/ }),

/***/ 3315:
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.createBatchScheduler = void 0;
const schedulerCache = new Map();
function createBatchScheduler({ fn, id, shouldSplitBatch, wait = 0, sort, }) {
    const exec = async () => {
        const scheduler = getScheduler();
        flush();
        const args = scheduler.map(({ args }) => args);
        if (args.length === 0)
            return;
        fn(args)
            .then((data) => {
            if (sort && Array.isArray(data))
                data.sort(sort);
            for (let i = 0; i < scheduler.length; i++) {
                const { pendingPromise } = scheduler[i];
                pendingPromise.resolve?.([data[i], data]);
            }
        })
            .catch((err) => {
            for (let i = 0; i < scheduler.length; i++) {
                const { pendingPromise } = scheduler[i];
                pendingPromise.reject?.(err);
            }
        });
    };
    const flush = () => schedulerCache.delete(id);
    const getBatchedArgs = () => getScheduler().map(({ args }) => args);
    const getScheduler = () => schedulerCache.get(id) || [];
    const setScheduler = (item) => schedulerCache.set(id, [...getScheduler(), item]);
    return {
        flush,
        async schedule(args) {
            const pendingPromise = {};
            const promise = new Promise((resolve, reject) => {
                pendingPromise.resolve = resolve;
                pendingPromise.reject = reject;
            });
            const split = shouldSplitBatch?.([...getBatchedArgs(), args]);
            if (split)
                exec();
            const hasActiveScheduler = getScheduler().length > 0;
            if (hasActiveScheduler) {
                setScheduler({ args, pendingPromise });
                return promise;
            }
            setScheduler({ args, pendingPromise });
            setTimeout(exec, wait);
            return promise;
        },
    };
}
exports.createBatchScheduler = createBatchScheduler;
//# sourceMappingURL=createBatchScheduler.js.map

/***/ }),

/***/ 35102:
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.withCache = exports.getCache = exports.responseCache = exports.promiseCache = void 0;
exports.promiseCache = new Map();
exports.responseCache = new Map();
function getCache(cacheKey) {
    const buildCache = (cacheKey, cache) => ({
        clear: () => cache.delete(cacheKey),
        get: () => cache.get(cacheKey),
        set: (data) => cache.set(cacheKey, data),
    });
    const promise = buildCache(cacheKey, exports.promiseCache);
    const response = buildCache(cacheKey, exports.responseCache);
    return {
        clear: () => {
            promise.clear();
            response.clear();
        },
        promise,
        response,
    };
}
exports.getCache = getCache;
async function withCache(fn, { cacheKey, cacheTime = Infinity }) {
    const cache = getCache(cacheKey);
    const response = cache.response.get();
    if (response && cacheTime > 0) {
        const age = new Date().getTime() - response.created.getTime();
        if (age < cacheTime)
            return response.data;
    }
    let promise = cache.promise.get();
    if (!promise) {
        promise = fn();
        cache.promise.set(promise);
    }
    try {
        const data = await promise;
        cache.response.set({ created: new Date(), data });
        return data;
    }
    finally {
        cache.promise.clear();
    }
}
exports.withCache = withCache;
//# sourceMappingURL=withCache.js.map

/***/ }),

/***/ 36962:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.withRetry = void 0;
const wait_js_1 = __webpack_require__(80433);
function withRetry(fn, { delay: delay_ = 100, retryCount = 2, shouldRetry = () => true, } = {}) {
    return new Promise((resolve, reject) => {
        const attemptRetry = async ({ count = 0 } = {}) => {
            const retry = async ({ error }) => {
                const delay = typeof delay_ === 'function' ? delay_({ count, error }) : delay_;
                if (delay)
                    await (0, wait_js_1.wait)(delay);
                attemptRetry({ count: count + 1 });
            };
            try {
                const data = await fn();
                resolve(data);
            }
            catch (err) {
                if (count < retryCount &&
                    (await shouldRetry({ count, error: err })))
                    return retry({ error: err });
                reject(err);
            }
        };
        attemptRetry();
    });
}
exports.withRetry = withRetry;
//# sourceMappingURL=withRetry.js.map

/***/ }),

/***/ 63703:
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.withTimeout = void 0;
function withTimeout(fn, { errorInstance = new Error('timed out'), timeout, signal, }) {
    return new Promise((resolve, reject) => {
        ;
        (async () => {
            let timeoutId;
            try {
                const controller = new AbortController();
                if (timeout > 0) {
                    timeoutId = setTimeout(() => {
                        if (signal) {
                            controller.abort();
                        }
                        else {
                            reject(errorInstance);
                        }
                    }, timeout);
                }
                resolve(await fn({ signal: controller?.signal }));
            }
            catch (err) {
                if (err.name === 'AbortError')
                    reject(errorInstance);
                reject(err);
            }
            finally {
                clearTimeout(timeoutId);
            }
        })();
    });
}
exports.withTimeout = withTimeout;
//# sourceMappingURL=withTimeout.js.map

/***/ }),

/***/ 44857:
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.integerRegex = exports.bytesRegex = exports.arrayRegex = void 0;
exports.arrayRegex = /^(.*)\[([0-9]*)\]$/;
exports.bytesRegex = /^bytes([1-9]|1[0-9]|2[0-9]|3[0-2])?$/;
exports.integerRegex = /^(u?int)(8|16|24|32|40|48|56|64|72|80|88|96|104|112|120|128|136|144|152|160|168|176|184|192|200|208|216|224|232|240|248|256)?$/;
//# sourceMappingURL=regex.js.map

/***/ }),

/***/ 50205:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.rpc = exports.getSocket = exports.socketsCache = void 0;
const isows_1 = __webpack_require__(37030);
const request_js_1 = __webpack_require__(80767);
const createBatchScheduler_js_1 = __webpack_require__(3315);
const withTimeout_js_1 = __webpack_require__(63703);
const stringify_js_1 = __webpack_require__(68395);
let id = 0;
async function http(url, { body, fetchOptions = {}, timeout = 10000 }) {
    const { headers, method, signal: signal_ } = fetchOptions;
    try {
        const response = await (0, withTimeout_js_1.withTimeout)(async ({ signal }) => {
            const response = await fetch(url, {
                ...fetchOptions,
                body: Array.isArray(body)
                    ? (0, stringify_js_1.stringify)(body.map((body) => ({
                        jsonrpc: '2.0',
                        id: body.id ?? id++,
                        ...body,
                    })))
                    : (0, stringify_js_1.stringify)({ jsonrpc: '2.0', id: body.id ?? id++, ...body }),
                headers: {
                    ...headers,
                    'Content-Type': 'application/json',
                },
                method: method || 'POST',
                signal: signal_ || (timeout > 0 ? signal : undefined),
            });
            return response;
        }, {
            errorInstance: new request_js_1.TimeoutError({ body, url }),
            timeout,
            signal: true,
        });
        let data;
        if (response.headers.get('Content-Type')?.startsWith('application/json')) {
            data = await response.json();
        }
        else {
            data = await response.text();
        }
        if (!response.ok) {
            throw new request_js_1.HttpRequestError({
                body,
                details: (0, stringify_js_1.stringify)(data.error) || response.statusText,
                headers: response.headers,
                status: response.status,
                url,
            });
        }
        return data;
    }
    catch (err) {
        if (err instanceof request_js_1.HttpRequestError)
            throw err;
        if (err instanceof request_js_1.TimeoutError)
            throw err;
        throw new request_js_1.HttpRequestError({
            body,
            details: err.message,
            url,
        });
    }
}
exports.socketsCache = new Map();
async function getSocket(url) {
    let socket = exports.socketsCache.get(url);
    if (socket)
        return socket;
    const { schedule } = (0, createBatchScheduler_js_1.createBatchScheduler)({
        id: url,
        fn: async () => {
            const webSocket = new isows_1.WebSocket(url);
            const requests = new Map();
            const subscriptions = new Map();
            const onMessage = ({ data }) => {
                const message = JSON.parse(data);
                const isSubscription = message.method === 'eth_subscription';
                const id = isSubscription ? message.params.subscription : message.id;
                const cache = isSubscription ? subscriptions : requests;
                const callback = cache.get(id);
                if (callback)
                    callback({ data });
                if (!isSubscription)
                    cache.delete(id);
            };
            const onClose = () => {
                exports.socketsCache.delete(url);
                webSocket.removeEventListener('close', onClose);
                webSocket.removeEventListener('message', onMessage);
            };
            webSocket.addEventListener('close', onClose);
            webSocket.addEventListener('message', onMessage);
            if (webSocket.readyState === isows_1.WebSocket.CONNECTING) {
                await new Promise((resolve, reject) => {
                    if (!webSocket)
                        return;
                    webSocket.onopen = resolve;
                    webSocket.onerror = reject;
                });
            }
            socket = Object.assign(webSocket, {
                requests,
                subscriptions,
            });
            exports.socketsCache.set(url, socket);
            return [socket];
        },
    });
    const [_, [socket_]] = await schedule();
    return socket_;
}
exports.getSocket = getSocket;
function webSocket(socket, { body, onResponse }) {
    if (socket.readyState === socket.CLOSED ||
        socket.readyState === socket.CLOSING)
        throw new request_js_1.WebSocketRequestError({
            body,
            url: socket.url,
            details: 'Socket is closed.',
        });
    const id_ = id++;
    const callback = ({ data }) => {
        const message = JSON.parse(data);
        if (typeof message.id === 'number' && id_ !== message.id)
            return;
        onResponse?.(message);
        if (body.method === 'eth_subscribe' && typeof message.result === 'string') {
            socket.subscriptions.set(message.result, callback);
        }
        if (body.method === 'eth_unsubscribe') {
            socket.subscriptions.delete(body.params?.[0]);
        }
    };
    socket.requests.set(id_, callback);
    socket.send(JSON.stringify({ jsonrpc: '2.0', ...body, id: id_ }));
    return socket;
}
async function webSocketAsync(socket, { body, timeout = 10000 }) {
    return (0, withTimeout_js_1.withTimeout)(() => new Promise((onResponse) => exports.rpc.webSocket(socket, {
        body,
        onResponse,
    })), {
        errorInstance: new request_js_1.TimeoutError({ body, url: socket.url }),
        timeout,
    });
}
exports.rpc = {
    http,
    webSocket,
    webSocketAsync,
};
//# sourceMappingURL=rpc.js.map

/***/ }),

/***/ 82494:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.compactSignatureToHex = void 0;
const secp256k1_1 = __webpack_require__(67540);
const fromHex_js_1 = __webpack_require__(50159);
function compactSignatureToHex({ r, yParityAndS, }) {
    return `0x${new secp256k1_1.secp256k1.Signature((0, fromHex_js_1.hexToBigInt)(r), (0, fromHex_js_1.hexToBigInt)(yParityAndS)).toCompactHex()}`;
}
exports.compactSignatureToHex = compactSignatureToHex;
//# sourceMappingURL=compactSignatureToHex.js.map

/***/ }),

/***/ 72573:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.compactSignatureToSignature = void 0;
const toBytes_js_1 = __webpack_require__(82750);
const toHex_js_1 = __webpack_require__(86340);
function compactSignatureToSignature({ r, yParityAndS, }) {
    const yParityAndS_bytes = (0, toBytes_js_1.hexToBytes)(yParityAndS);
    const v = yParityAndS_bytes[0] & 0x80 ? 28n : 27n;
    const s = yParityAndS_bytes;
    if (v === 28n)
        s[0] &= 0x7f;
    return { r, s: (0, toHex_js_1.bytesToHex)(s), v };
}
exports.compactSignatureToSignature = compactSignatureToSignature;
//# sourceMappingURL=compactSignatureToSignature.js.map

/***/ }),

/***/ 10416:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.hashMessage = void 0;
const strings_js_1 = __webpack_require__(72460);
const concat_js_1 = __webpack_require__(15991);
const toBytes_js_1 = __webpack_require__(82750);
const keccak256_js_1 = __webpack_require__(43708);
function hashMessage(message, to_) {
    const messageBytes = (() => {
        if (typeof message === 'string')
            return (0, toBytes_js_1.stringToBytes)(message);
        if (message.raw instanceof Uint8Array)
            return message.raw;
        return (0, toBytes_js_1.toBytes)(message.raw);
    })();
    const prefixBytes = (0, toBytes_js_1.stringToBytes)(`${strings_js_1.presignMessagePrefix}${messageBytes.length}`);
    return (0, keccak256_js_1.keccak256)((0, concat_js_1.concat)([prefixBytes, messageBytes]), to_);
}
exports.hashMessage = hashMessage;
//# sourceMappingURL=hashMessage.js.map

/***/ }),

/***/ 32911:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.hashDomain = exports.hashTypedData = void 0;
const encodeAbiParameters_js_1 = __webpack_require__(82671);
const concat_js_1 = __webpack_require__(15991);
const toHex_js_1 = __webpack_require__(86340);
const keccak256_js_1 = __webpack_require__(43708);
const typedData_js_1 = __webpack_require__(25330);
function hashTypedData({ domain: domain_, message, primaryType, types: types_, }) {
    const domain = typeof domain_ === 'undefined' ? {} : domain_;
    const types = {
        EIP712Domain: (0, typedData_js_1.getTypesForEIP712Domain)({ domain }),
        ...types_,
    };
    (0, typedData_js_1.validateTypedData)({
        domain,
        message,
        primaryType,
        types,
    });
    const parts = ['0x1901'];
    if (domain)
        parts.push(hashDomain({
            domain,
            types: types,
        }));
    if (primaryType !== 'EIP712Domain') {
        parts.push(hashStruct({
            data: message,
            primaryType: primaryType,
            types: types,
        }));
    }
    return (0, keccak256_js_1.keccak256)((0, concat_js_1.concat)(parts));
}
exports.hashTypedData = hashTypedData;
function hashDomain({ domain, types, }) {
    return hashStruct({
        data: domain,
        primaryType: 'EIP712Domain',
        types,
    });
}
exports.hashDomain = hashDomain;
function hashStruct({ data, primaryType, types, }) {
    const encoded = encodeData({
        data,
        primaryType,
        types,
    });
    return (0, keccak256_js_1.keccak256)(encoded);
}
function encodeData({ data, primaryType, types, }) {
    const encodedTypes = [{ type: 'bytes32' }];
    const encodedValues = [hashType({ primaryType, types })];
    for (const field of types[primaryType]) {
        const [type, value] = encodeField({
            types,
            name: field.name,
            type: field.type,
            value: data[field.name],
        });
        encodedTypes.push(type);
        encodedValues.push(value);
    }
    return (0, encodeAbiParameters_js_1.encodeAbiParameters)(encodedTypes, encodedValues);
}
function hashType({ primaryType, types, }) {
    const encodedHashType = (0, toHex_js_1.toHex)(encodeType({ primaryType, types }));
    return (0, keccak256_js_1.keccak256)(encodedHashType);
}
function encodeType({ primaryType, types, }) {
    let result = '';
    const unsortedDeps = findTypeDependencies({ primaryType, types });
    unsortedDeps.delete(primaryType);
    const deps = [primaryType, ...Array.from(unsortedDeps).sort()];
    for (const type of deps) {
        result += `${type}(${types[type]
            .map(({ name, type: t }) => `${t} ${name}`)
            .join(',')})`;
    }
    return result;
}
function findTypeDependencies({ primaryType: primaryType_, types, }, results = new Set()) {
    const match = primaryType_.match(/^\w*/u);
    const primaryType = match?.[0];
    if (results.has(primaryType) || types[primaryType] === undefined) {
        return results;
    }
    results.add(primaryType);
    for (const field of types[primaryType]) {
        findTypeDependencies({ primaryType: field.type, types }, results);
    }
    return results;
}
function encodeField({ types, name, type, value, }) {
    if (types[type] !== undefined) {
        return [
            { type: 'bytes32' },
            (0, keccak256_js_1.keccak256)(encodeData({ data: value, primaryType: type, types })),
        ];
    }
    if (type === 'bytes') {
        const prepend = value.length % 2 ? '0' : '';
        value = `0x${prepend + value.slice(2)}`;
        return [{ type: 'bytes32' }, (0, keccak256_js_1.keccak256)(value)];
    }
    if (type === 'string')
        return [{ type: 'bytes32' }, (0, keccak256_js_1.keccak256)((0, toHex_js_1.toHex)(value))];
    if (type.lastIndexOf(']') === type.length - 1) {
        const parsedType = type.slice(0, type.lastIndexOf('['));
        const typeValuePairs = value.map((item) => encodeField({
            name,
            type: parsedType,
            types,
            value: item,
        }));
        return [
            { type: 'bytes32' },
            (0, keccak256_js_1.keccak256)((0, encodeAbiParameters_js_1.encodeAbiParameters)(typeValuePairs.map(([t]) => t), typeValuePairs.map(([, v]) => v))),
        ];
    }
    return [{ type }, value];
}
//# sourceMappingURL=hashTypedData.js.map

/***/ }),

/***/ 56238:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.hexToCompactSignature = void 0;
const secp256k1_1 = __webpack_require__(67540);
const toHex_js_1 = __webpack_require__(86340);
function hexToCompactSignature(signatureHex) {
    const { r, s } = secp256k1_1.secp256k1.Signature.fromCompact(signatureHex.slice(2, 130));
    return {
        r: (0, toHex_js_1.numberToHex)(r, { size: 32 }),
        yParityAndS: (0, toHex_js_1.numberToHex)(s, { size: 32 }),
    };
}
exports.hexToCompactSignature = hexToCompactSignature;
//# sourceMappingURL=hexToCompactSignature.js.map

/***/ }),

/***/ 52605:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.hexToSignature = void 0;
const secp256k1_1 = __webpack_require__(67540);
const toHex_js_1 = __webpack_require__(86340);
function hexToSignature(signatureHex) {
    const { r, s } = secp256k1_1.secp256k1.Signature.fromCompact(signatureHex.slice(2, 130));
    const v = BigInt(`0x${signatureHex.slice(130)}`);
    return { r: (0, toHex_js_1.numberToHex)(r, { size: 32 }), s: (0, toHex_js_1.numberToHex)(s, { size: 32 }), v };
}
exports.hexToSignature = hexToSignature;
//# sourceMappingURL=hexToSignature.js.map

/***/ }),

/***/ 42679:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.recoverAddress = void 0;
const publicKeyToAddress_js_1 = __webpack_require__(13740);
const recoverPublicKey_js_1 = __webpack_require__(41247);
async function recoverAddress({ hash, signature, }) {
    return (0, publicKeyToAddress_js_1.publicKeyToAddress)(await (0, recoverPublicKey_js_1.recoverPublicKey)({ hash: hash, signature }));
}
exports.recoverAddress = recoverAddress;
//# sourceMappingURL=recoverAddress.js.map

/***/ }),

/***/ 26550:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.recoverMessageAddress = void 0;
const hashMessage_js_1 = __webpack_require__(10416);
const recoverAddress_js_1 = __webpack_require__(42679);
async function recoverMessageAddress({ message, signature, }) {
    return (0, recoverAddress_js_1.recoverAddress)({ hash: (0, hashMessage_js_1.hashMessage)(message), signature });
}
exports.recoverMessageAddress = recoverMessageAddress;
//# sourceMappingURL=recoverMessageAddress.js.map

/***/ }),

/***/ 41247:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.recoverPublicKey = void 0;
const isHex_js_1 = __webpack_require__(88846);
const fromHex_js_1 = __webpack_require__(50159);
const toHex_js_1 = __webpack_require__(86340);
async function recoverPublicKey({ hash, signature, }) {
    const signatureHex = (0, isHex_js_1.isHex)(signature) ? signature : (0, toHex_js_1.toHex)(signature);
    const hashHex = (0, isHex_js_1.isHex)(hash) ? hash : (0, toHex_js_1.toHex)(hash);
    let v = (0, fromHex_js_1.hexToNumber)(`0x${signatureHex.slice(130)}`);
    if (v === 0 || v === 1)
        v += 27;
    const { secp256k1 } = await Promise.resolve().then(() => __webpack_require__(67540));
    const publicKey = secp256k1.Signature.fromCompact(signatureHex.substring(2, 130))
        .addRecoveryBit(v - 27)
        .recoverPublicKey(hashHex.substring(2))
        .toHex(false);
    return `0x${publicKey}`;
}
exports.recoverPublicKey = recoverPublicKey;
//# sourceMappingURL=recoverPublicKey.js.map

/***/ }),

/***/ 37147:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.recoverTypedDataAddress = void 0;
const hashTypedData_js_1 = __webpack_require__(32911);
const recoverAddress_js_1 = __webpack_require__(42679);
async function recoverTypedDataAddress({ domain, message, primaryType, signature, types, }) {
    return (0, recoverAddress_js_1.recoverAddress)({
        hash: (0, hashTypedData_js_1.hashTypedData)({
            domain,
            message,
            primaryType,
            types,
        }),
        signature,
    });
}
exports.recoverTypedDataAddress = recoverTypedDataAddress;
//# sourceMappingURL=recoverTypedDataAddress.js.map

/***/ }),

/***/ 40705:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.signatureToCompactSignature = void 0;
const index_js_1 = __webpack_require__(2166);
function signatureToCompactSignature(signature) {
    const { r, s, v } = signature;
    const yParity = v - 27n;
    let yParityAndS = s;
    if (yParity === 1n) {
        const bytes = (0, index_js_1.hexToBytes)(s);
        bytes[0] |= 0x80;
        yParityAndS = (0, index_js_1.bytesToHex)(bytes);
    }
    return { r, yParityAndS };
}
exports.signatureToCompactSignature = signatureToCompactSignature;
//# sourceMappingURL=signatureToCompactSignature.js.map

/***/ }),

/***/ 1251:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.signatureToHex = void 0;
const secp256k1_1 = __webpack_require__(67540);
const fromHex_js_1 = __webpack_require__(50159);
const toHex_js_1 = __webpack_require__(86340);
function signatureToHex({ r, s, v }) {
    return `0x${new secp256k1_1.secp256k1.Signature((0, fromHex_js_1.hexToBigInt)(r), (0, fromHex_js_1.hexToBigInt)(s)).toCompactHex()}${(0, toHex_js_1.toHex)(v).slice(2)}`;
}
exports.signatureToHex = signatureToHex;
//# sourceMappingURL=signatureToHex.js.map

/***/ }),

/***/ 20111:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.verifyMessage = void 0;
const getAddress_js_1 = __webpack_require__(18717);
const isAddressEqual_js_1 = __webpack_require__(47681);
const recoverMessageAddress_js_1 = __webpack_require__(26550);
async function verifyMessage({ address, message, signature, }) {
    return (0, isAddressEqual_js_1.isAddressEqual)((0, getAddress_js_1.getAddress)(address), await (0, recoverMessageAddress_js_1.recoverMessageAddress)({ message, signature }));
}
exports.verifyMessage = verifyMessage;
//# sourceMappingURL=verifyMessage.js.map

/***/ }),

/***/ 48204:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.verifyTypedData = void 0;
const getAddress_js_1 = __webpack_require__(18717);
const isAddressEqual_js_1 = __webpack_require__(47681);
const recoverTypedDataAddress_js_1 = __webpack_require__(37147);
async function verifyTypedData({ address, domain, message, primaryType, signature, types, }) {
    return (0, isAddressEqual_js_1.isAddressEqual)((0, getAddress_js_1.getAddress)(address), await (0, recoverTypedDataAddress_js_1.recoverTypedDataAddress)({
        domain,
        message,
        primaryType,
        signature,
        types,
    }));
}
exports.verifyTypedData = verifyTypedData;
//# sourceMappingURL=verifyTypedData.js.map

/***/ }),

/***/ 68395:
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.stringify = void 0;
const stringify = (value, replacer, space) => JSON.stringify(value, (key, value_) => {
    const value = typeof value_ === 'bigint' ? value_.toString() : value_;
    return typeof replacer === 'function' ? replacer(key, value) : value;
}, space);
exports.stringify = stringify;
//# sourceMappingURL=stringify.js.map

/***/ }),

/***/ 12546:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.assertRequest = void 0;
const parseAccount_js_1 = __webpack_require__(79429);
const address_js_1 = __webpack_require__(64422);
const node_js_1 = __webpack_require__(20420);
const transaction_js_1 = __webpack_require__(83474);
const isAddress_js_1 = __webpack_require__(81061);
function assertRequest(args) {
    const { account: account_, gasPrice, maxFeePerGas, maxPriorityFeePerGas, to, } = args;
    const account = account_ ? (0, parseAccount_js_1.parseAccount)(account_) : undefined;
    if (account && !(0, isAddress_js_1.isAddress)(account.address))
        throw new address_js_1.InvalidAddressError({ address: account.address });
    if (to && !(0, isAddress_js_1.isAddress)(to))
        throw new address_js_1.InvalidAddressError({ address: to });
    if (typeof gasPrice !== 'undefined' &&
        (typeof maxFeePerGas !== 'undefined' ||
            typeof maxPriorityFeePerGas !== 'undefined'))
        throw new transaction_js_1.FeeConflictError();
    if (maxFeePerGas && maxFeePerGas > 2n ** 256n - 1n)
        throw new node_js_1.FeeCapTooHighError({ maxFeePerGas });
    if (maxPriorityFeePerGas &&
        maxFeePerGas &&
        maxPriorityFeePerGas > maxFeePerGas)
        throw new node_js_1.TipAboveFeeCapError({ maxFeePerGas, maxPriorityFeePerGas });
}
exports.assertRequest = assertRequest;
//# sourceMappingURL=assertRequest.js.map

/***/ }),

/***/ 99959:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.assertTransactionLegacy = exports.assertTransactionEIP2930 = exports.assertTransactionEIP1559 = void 0;
const address_js_1 = __webpack_require__(64422);
const base_js_1 = __webpack_require__(24437);
const chain_js_1 = __webpack_require__(73587);
const node_js_1 = __webpack_require__(20420);
const isAddress_js_1 = __webpack_require__(81061);
function assertTransactionEIP1559(transaction) {
    const { chainId, maxPriorityFeePerGas, gasPrice, maxFeePerGas, to } = transaction;
    if (chainId <= 0)
        throw new chain_js_1.InvalidChainIdError({ chainId });
    if (to && !(0, isAddress_js_1.isAddress)(to))
        throw new address_js_1.InvalidAddressError({ address: to });
    if (gasPrice)
        throw new base_js_1.BaseError('`gasPrice` is not a valid EIP-1559 Transaction attribute.');
    if (maxFeePerGas && maxFeePerGas > 2n ** 256n - 1n)
        throw new node_js_1.FeeCapTooHighError({ maxFeePerGas });
    if (maxPriorityFeePerGas &&
        maxFeePerGas &&
        maxPriorityFeePerGas > maxFeePerGas)
        throw new node_js_1.TipAboveFeeCapError({ maxFeePerGas, maxPriorityFeePerGas });
}
exports.assertTransactionEIP1559 = assertTransactionEIP1559;
function assertTransactionEIP2930(transaction) {
    const { chainId, maxPriorityFeePerGas, gasPrice, maxFeePerGas, to } = transaction;
    if (chainId <= 0)
        throw new chain_js_1.InvalidChainIdError({ chainId });
    if (to && !(0, isAddress_js_1.isAddress)(to))
        throw new address_js_1.InvalidAddressError({ address: to });
    if (maxPriorityFeePerGas || maxFeePerGas)
        throw new base_js_1.BaseError('`maxFeePerGas`/`maxPriorityFeePerGas` is not a valid EIP-2930 Transaction attribute.');
    if (gasPrice && gasPrice > 2n ** 256n - 1n)
        throw new node_js_1.FeeCapTooHighError({ maxFeePerGas: gasPrice });
}
exports.assertTransactionEIP2930 = assertTransactionEIP2930;
function assertTransactionLegacy(transaction) {
    const { chainId, maxPriorityFeePerGas, gasPrice, maxFeePerGas, to, accessList, } = transaction;
    if (to && !(0, isAddress_js_1.isAddress)(to))
        throw new address_js_1.InvalidAddressError({ address: to });
    if (typeof chainId !== 'undefined' && chainId <= 0)
        throw new chain_js_1.InvalidChainIdError({ chainId });
    if (maxPriorityFeePerGas || maxFeePerGas)
        throw new base_js_1.BaseError('`maxFeePerGas`/`maxPriorityFeePerGas` is not a valid Legacy Transaction attribute.');
    if (gasPrice && gasPrice > 2n ** 256n - 1n)
        throw new node_js_1.FeeCapTooHighError({ maxFeePerGas: gasPrice });
    if (accessList)
        throw new base_js_1.BaseError('`accessList` is not a valid Legacy Transaction attribute.');
}
exports.assertTransactionLegacy = assertTransactionLegacy;
//# sourceMappingURL=assertTransaction.js.map

/***/ }),

/***/ 40735:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getSerializedTransactionType = void 0;
const transaction_js_1 = __webpack_require__(83474);
const slice_js_1 = __webpack_require__(61909);
const fromHex_js_1 = __webpack_require__(50159);
function getSerializedTransactionType(serializedTransaction) {
    const serializedType = (0, slice_js_1.sliceHex)(serializedTransaction, 0, 1);
    if (serializedType === '0x02')
        return 'eip1559';
    if (serializedType === '0x01')
        return 'eip2930';
    if (serializedType !== '0x' && (0, fromHex_js_1.hexToNumber)(serializedType) >= 0xc0)
        return 'legacy';
    throw new transaction_js_1.InvalidSerializedTransactionTypeError({ serializedType });
}
exports.getSerializedTransactionType = getSerializedTransactionType;
//# sourceMappingURL=getSerializedTransactionType.js.map

/***/ }),

/***/ 22277:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getTransactionType = void 0;
const transaction_js_1 = __webpack_require__(83474);
function getTransactionType(transaction) {
    if (transaction.type)
        return transaction.type;
    if (typeof transaction.maxFeePerGas !== 'undefined' ||
        typeof transaction.maxPriorityFeePerGas !== 'undefined')
        return 'eip1559';
    if (typeof transaction.gasPrice !== 'undefined') {
        if (typeof transaction.accessList !== 'undefined')
            return 'eip2930';
        return 'legacy';
    }
    throw new transaction_js_1.InvalidSerializableTransactionError({ transaction });
}
exports.getTransactionType = getTransactionType;
//# sourceMappingURL=getTransactionType.js.map

/***/ }),

/***/ 92000:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.parseAccessList = exports.toTransactionArray = exports.parseTransaction = void 0;
const address_js_1 = __webpack_require__(64422);
const transaction_js_1 = __webpack_require__(83474);
const isAddress_js_1 = __webpack_require__(81061);
const isHex_js_1 = __webpack_require__(88846);
const pad_js_1 = __webpack_require__(18046);
const trim_js_1 = __webpack_require__(45611);
const fromHex_js_1 = __webpack_require__(50159);
const fromRlp_js_1 = __webpack_require__(25744);
const isHash_js_1 = __webpack_require__(12903);
const assertTransaction_js_1 = __webpack_require__(99959);
const getSerializedTransactionType_js_1 = __webpack_require__(40735);
function parseTransaction(serializedTransaction) {
    const type = (0, getSerializedTransactionType_js_1.getSerializedTransactionType)(serializedTransaction);
    if (type === 'eip1559')
        return parseTransactionEIP1559(serializedTransaction);
    if (type === 'eip2930')
        return parseTransactionEIP2930(serializedTransaction);
    return parseTransactionLegacy(serializedTransaction);
}
exports.parseTransaction = parseTransaction;
function parseTransactionEIP1559(serializedTransaction) {
    const transactionArray = toTransactionArray(serializedTransaction);
    const [chainId, nonce, maxPriorityFeePerGas, maxFeePerGas, gas, to, value, data, accessList, v, r, s,] = transactionArray;
    if (!(transactionArray.length === 9 || transactionArray.length === 12))
        throw new transaction_js_1.InvalidSerializedTransactionError({
            attributes: {
                chainId,
                nonce,
                maxPriorityFeePerGas,
                maxFeePerGas,
                gas,
                to,
                value,
                data,
                accessList,
                ...(transactionArray.length > 9
                    ? {
                        v,
                        r,
                        s,
                    }
                    : {}),
            },
            serializedTransaction,
            type: 'eip1559',
        });
    const transaction = {
        chainId: (0, fromHex_js_1.hexToNumber)(chainId),
        type: 'eip1559',
    };
    if ((0, isHex_js_1.isHex)(to) && to !== '0x')
        transaction.to = to;
    if ((0, isHex_js_1.isHex)(gas) && gas !== '0x')
        transaction.gas = (0, fromHex_js_1.hexToBigInt)(gas);
    if ((0, isHex_js_1.isHex)(data) && data !== '0x')
        transaction.data = data;
    if ((0, isHex_js_1.isHex)(nonce) && nonce !== '0x')
        transaction.nonce = (0, fromHex_js_1.hexToNumber)(nonce);
    if ((0, isHex_js_1.isHex)(value) && value !== '0x')
        transaction.value = (0, fromHex_js_1.hexToBigInt)(value);
    if ((0, isHex_js_1.isHex)(maxFeePerGas) && maxFeePerGas !== '0x')
        transaction.maxFeePerGas = (0, fromHex_js_1.hexToBigInt)(maxFeePerGas);
    if ((0, isHex_js_1.isHex)(maxPriorityFeePerGas) && maxPriorityFeePerGas !== '0x')
        transaction.maxPriorityFeePerGas = (0, fromHex_js_1.hexToBigInt)(maxPriorityFeePerGas);
    if (accessList.length !== 0 && accessList !== '0x')
        transaction.accessList = parseAccessList(accessList);
    (0, assertTransaction_js_1.assertTransactionEIP1559)(transaction);
    const signature = transactionArray.length === 12
        ? parseEIP155Signature(transactionArray)
        : undefined;
    return { ...signature, ...transaction };
}
function parseTransactionEIP2930(serializedTransaction) {
    const transactionArray = toTransactionArray(serializedTransaction);
    const [chainId, nonce, gasPrice, gas, to, value, data, accessList, v, r, s] = transactionArray;
    if (!(transactionArray.length === 8 || transactionArray.length === 11))
        throw new transaction_js_1.InvalidSerializedTransactionError({
            attributes: {
                chainId,
                nonce,
                gasPrice,
                gas,
                to,
                value,
                data,
                accessList,
                ...(transactionArray.length > 8
                    ? {
                        v,
                        r,
                        s,
                    }
                    : {}),
            },
            serializedTransaction,
            type: 'eip2930',
        });
    const transaction = {
        chainId: (0, fromHex_js_1.hexToNumber)(chainId),
        type: 'eip2930',
    };
    if ((0, isHex_js_1.isHex)(to) && to !== '0x')
        transaction.to = to;
    if ((0, isHex_js_1.isHex)(gas) && gas !== '0x')
        transaction.gas = (0, fromHex_js_1.hexToBigInt)(gas);
    if ((0, isHex_js_1.isHex)(data) && data !== '0x')
        transaction.data = data;
    if ((0, isHex_js_1.isHex)(nonce) && nonce !== '0x')
        transaction.nonce = (0, fromHex_js_1.hexToNumber)(nonce);
    if ((0, isHex_js_1.isHex)(value) && value !== '0x')
        transaction.value = (0, fromHex_js_1.hexToBigInt)(value);
    if ((0, isHex_js_1.isHex)(gasPrice) && gasPrice !== '0x')
        transaction.gasPrice = (0, fromHex_js_1.hexToBigInt)(gasPrice);
    if (accessList.length !== 0 && accessList !== '0x')
        transaction.accessList = parseAccessList(accessList);
    (0, assertTransaction_js_1.assertTransactionEIP2930)(transaction);
    const signature = transactionArray.length === 11
        ? parseEIP155Signature(transactionArray)
        : undefined;
    return { ...signature, ...transaction };
}
function parseTransactionLegacy(serializedTransaction) {
    const transactionArray = (0, fromRlp_js_1.fromRlp)(serializedTransaction, 'hex');
    const [nonce, gasPrice, gas, to, value, data, chainIdOrV_, r, s] = transactionArray;
    if (!(transactionArray.length === 6 || transactionArray.length === 9))
        throw new transaction_js_1.InvalidSerializedTransactionError({
            attributes: {
                nonce,
                gasPrice,
                gas,
                to,
                value,
                data,
                ...(transactionArray.length > 6
                    ? {
                        v: chainIdOrV_,
                        r,
                        s,
                    }
                    : {}),
            },
            serializedTransaction,
            type: 'legacy',
        });
    const transaction = {
        type: 'legacy',
    };
    if ((0, isHex_js_1.isHex)(to) && to !== '0x')
        transaction.to = to;
    if ((0, isHex_js_1.isHex)(gas) && gas !== '0x')
        transaction.gas = (0, fromHex_js_1.hexToBigInt)(gas);
    if ((0, isHex_js_1.isHex)(data) && data !== '0x')
        transaction.data = data;
    if ((0, isHex_js_1.isHex)(nonce) && nonce !== '0x')
        transaction.nonce = (0, fromHex_js_1.hexToNumber)(nonce);
    if ((0, isHex_js_1.isHex)(value) && value !== '0x')
        transaction.value = (0, fromHex_js_1.hexToBigInt)(value);
    if ((0, isHex_js_1.isHex)(gasPrice) && gasPrice !== '0x')
        transaction.gasPrice = (0, fromHex_js_1.hexToBigInt)(gasPrice);
    (0, assertTransaction_js_1.assertTransactionLegacy)(transaction);
    if (transactionArray.length === 6)
        return transaction;
    const chainIdOrV = (0, isHex_js_1.isHex)(chainIdOrV_) && chainIdOrV_ !== '0x'
        ? (0, fromHex_js_1.hexToBigInt)(chainIdOrV_)
        : 0n;
    if (s === '0x' && r === '0x') {
        if (chainIdOrV > 0)
            transaction.chainId = Number(chainIdOrV);
        return transaction;
    }
    const v = chainIdOrV;
    const chainId = Number((v - 35n) / 2n);
    if (chainId > 0)
        transaction.chainId = chainId;
    else if (v !== 27n && v !== 28n)
        throw new transaction_js_1.InvalidLegacyVError({ v });
    transaction.v = v;
    transaction.s = s;
    transaction.r = r;
    return transaction;
}
function toTransactionArray(serializedTransaction) {
    return (0, fromRlp_js_1.fromRlp)(`0x${serializedTransaction.slice(4)}`, 'hex');
}
exports.toTransactionArray = toTransactionArray;
function parseAccessList(accessList_) {
    const accessList = [];
    for (let i = 0; i < accessList_.length; i++) {
        const [address, storageKeys] = accessList_[i];
        if (!(0, isAddress_js_1.isAddress)(address))
            throw new address_js_1.InvalidAddressError({ address });
        accessList.push({
            address: address,
            storageKeys: storageKeys.map((key) => ((0, isHash_js_1.isHash)(key) ? key : (0, trim_js_1.trim)(key))),
        });
    }
    return accessList;
}
exports.parseAccessList = parseAccessList;
function parseEIP155Signature(transactionArray) {
    const signature = transactionArray.slice(-3);
    const v = signature[0] === '0x' || (0, fromHex_js_1.hexToBigInt)(signature[0]) === 0n ? 27n : 28n;
    return {
        r: (0, pad_js_1.padHex)(signature[1], { size: 32 }),
        s: (0, pad_js_1.padHex)(signature[2], { size: 32 }),
        v,
        yParity: v === 27n ? 0 : 1,
    };
}
//# sourceMappingURL=parseTransaction.js.map

/***/ }),

/***/ 22297:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.serializeAccessList = void 0;
const address_js_1 = __webpack_require__(64422);
const transaction_js_1 = __webpack_require__(83474);
const isAddress_js_1 = __webpack_require__(81061);
function serializeAccessList(accessList) {
    if (!accessList || accessList.length === 0)
        return [];
    const serializedAccessList = [];
    for (let i = 0; i < accessList.length; i++) {
        const { address, storageKeys } = accessList[i];
        for (let j = 0; j < storageKeys.length; j++) {
            if (storageKeys[j].length - 2 !== 64) {
                throw new transaction_js_1.InvalidStorageKeySizeError({ storageKey: storageKeys[j] });
            }
        }
        if (!(0, isAddress_js_1.isAddress)(address)) {
            throw new address_js_1.InvalidAddressError({ address });
        }
        serializedAccessList.push([address, storageKeys]);
    }
    return serializedAccessList;
}
exports.serializeAccessList = serializeAccessList;
//# sourceMappingURL=serializeAccessList.js.map

/***/ }),

/***/ 14847:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.serializeTransaction = void 0;
const transaction_js_1 = __webpack_require__(83474);
const concat_js_1 = __webpack_require__(15991);
const trim_js_1 = __webpack_require__(45611);
const toHex_js_1 = __webpack_require__(86340);
const toRlp_js_1 = __webpack_require__(25943);
const assertTransaction_js_1 = __webpack_require__(99959);
const getTransactionType_js_1 = __webpack_require__(22277);
const serializeAccessList_js_1 = __webpack_require__(22297);
function serializeTransaction(transaction, signature) {
    const type = (0, getTransactionType_js_1.getTransactionType)(transaction);
    if (type === 'eip1559')
        return serializeTransactionEIP1559(transaction, signature);
    if (type === 'eip2930')
        return serializeTransactionEIP2930(transaction, signature);
    return serializeTransactionLegacy(transaction, signature);
}
exports.serializeTransaction = serializeTransaction;
function serializeTransactionEIP1559(transaction, signature) {
    const { chainId, gas, nonce, to, value, maxFeePerGas, maxPriorityFeePerGas, accessList, data, } = transaction;
    (0, assertTransaction_js_1.assertTransactionEIP1559)(transaction);
    const serializedAccessList = (0, serializeAccessList_js_1.serializeAccessList)(accessList);
    const serializedTransaction = [
        (0, toHex_js_1.toHex)(chainId),
        nonce ? (0, toHex_js_1.toHex)(nonce) : '0x',
        maxPriorityFeePerGas ? (0, toHex_js_1.toHex)(maxPriorityFeePerGas) : '0x',
        maxFeePerGas ? (0, toHex_js_1.toHex)(maxFeePerGas) : '0x',
        gas ? (0, toHex_js_1.toHex)(gas) : '0x',
        to ?? '0x',
        value ? (0, toHex_js_1.toHex)(value) : '0x',
        data ?? '0x',
        serializedAccessList,
    ];
    if (signature) {
        const yParity = (() => {
            if (signature.v === 0n)
                return '0x';
            if (signature.v === 1n)
                return (0, toHex_js_1.toHex)(1);
            return signature.v === 27n ? '0x' : (0, toHex_js_1.toHex)(1);
        })();
        serializedTransaction.push(yParity, (0, trim_js_1.trim)(signature.r), (0, trim_js_1.trim)(signature.s));
    }
    return (0, concat_js_1.concatHex)([
        '0x02',
        (0, toRlp_js_1.toRlp)(serializedTransaction),
    ]);
}
function serializeTransactionEIP2930(transaction, signature) {
    const { chainId, gas, data, nonce, to, value, accessList, gasPrice } = transaction;
    (0, assertTransaction_js_1.assertTransactionEIP2930)(transaction);
    const serializedAccessList = (0, serializeAccessList_js_1.serializeAccessList)(accessList);
    const serializedTransaction = [
        (0, toHex_js_1.toHex)(chainId),
        nonce ? (0, toHex_js_1.toHex)(nonce) : '0x',
        gasPrice ? (0, toHex_js_1.toHex)(gasPrice) : '0x',
        gas ? (0, toHex_js_1.toHex)(gas) : '0x',
        to ?? '0x',
        value ? (0, toHex_js_1.toHex)(value) : '0x',
        data ?? '0x',
        serializedAccessList,
    ];
    if (signature) {
        const yParity = (() => {
            if (signature.v === 0n)
                return '0x';
            if (signature.v === 1n)
                return (0, toHex_js_1.toHex)(1);
            return signature.v === 27n ? '0x' : (0, toHex_js_1.toHex)(1);
        })();
        serializedTransaction.push(yParity, (0, trim_js_1.trim)(signature.r), (0, trim_js_1.trim)(signature.s));
    }
    return (0, concat_js_1.concatHex)([
        '0x01',
        (0, toRlp_js_1.toRlp)(serializedTransaction),
    ]);
}
function serializeTransactionLegacy(transaction, signature) {
    const { chainId = 0, gas, data, nonce, to, value, gasPrice } = transaction;
    (0, assertTransaction_js_1.assertTransactionLegacy)(transaction);
    let serializedTransaction = [
        nonce ? (0, toHex_js_1.toHex)(nonce) : '0x',
        gasPrice ? (0, toHex_js_1.toHex)(gasPrice) : '0x',
        gas ? (0, toHex_js_1.toHex)(gas) : '0x',
        to ?? '0x',
        value ? (0, toHex_js_1.toHex)(value) : '0x',
        data ?? '0x',
    ];
    if (signature) {
        const v = (() => {
            if (chainId > 0)
                return BigInt(chainId * 2) + BigInt(35n + signature.v - 27n);
            if (signature.v >= 35n) {
                const inferredChainId = (signature.v - 35n) / 2n;
                if (inferredChainId > 0)
                    return signature.v;
                return 27n + (signature.v === 35n ? 0n : 1n);
            }
            const v = 27n + (signature.v === 27n ? 0n : 1n);
            if (signature.v !== v)
                throw new transaction_js_1.InvalidLegacyVError({ v: signature.v });
            return v;
        })();
        serializedTransaction = [
            ...serializedTransaction,
            (0, toHex_js_1.toHex)(v),
            signature.r,
            signature.s,
        ];
    }
    else if (chainId > 0) {
        serializedTransaction = [
            ...serializedTransaction,
            (0, toHex_js_1.toHex)(chainId),
            '0x',
            '0x',
        ];
    }
    return (0, toRlp_js_1.toRlp)(serializedTransaction);
}
//# sourceMappingURL=serializeTransaction.js.map

/***/ }),

/***/ 25330:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.domainSeparator = exports.getTypesForEIP712Domain = exports.validateTypedData = void 0;
const abi_js_1 = __webpack_require__(5432);
const address_js_1 = __webpack_require__(64422);
const isAddress_js_1 = __webpack_require__(81061);
const size_js_1 = __webpack_require__(82026);
const toHex_js_1 = __webpack_require__(86340);
const regex_js_1 = __webpack_require__(44857);
const hashTypedData_js_1 = __webpack_require__(32911);
function validateTypedData({ domain, message, primaryType, types: types_, }) {
    const types = types_;
    const validateData = (struct, value_) => {
        for (const param of struct) {
            const { name, type: type_ } = param;
            const type = type_;
            const value = value_[name];
            const integerMatch = type.match(regex_js_1.integerRegex);
            if (integerMatch &&
                (typeof value === 'number' || typeof value === 'bigint')) {
                const [_type, base, size_] = integerMatch;
                (0, toHex_js_1.numberToHex)(value, {
                    signed: base === 'int',
                    size: parseInt(size_) / 8,
                });
            }
            if (type === 'address' && typeof value === 'string' && !(0, isAddress_js_1.isAddress)(value))
                throw new address_js_1.InvalidAddressError({ address: value });
            const bytesMatch = type.match(regex_js_1.bytesRegex);
            if (bytesMatch) {
                const [_type, size_] = bytesMatch;
                if (size_ && (0, size_js_1.size)(value) !== parseInt(size_))
                    throw new abi_js_1.BytesSizeMismatchError({
                        expectedSize: parseInt(size_),
                        givenSize: (0, size_js_1.size)(value),
                    });
            }
            const struct = types[type];
            if (struct)
                validateData(struct, value);
        }
    };
    if (types.EIP712Domain && domain)
        validateData(types.EIP712Domain, domain);
    if (primaryType !== 'EIP712Domain') {
        const type = types[primaryType];
        validateData(type, message);
    }
}
exports.validateTypedData = validateTypedData;
function getTypesForEIP712Domain({ domain, }) {
    return [
        typeof domain?.name === 'string' && { name: 'name', type: 'string' },
        domain?.version && { name: 'version', type: 'string' },
        typeof domain?.chainId === 'number' && {
            name: 'chainId',
            type: 'uint256',
        },
        domain?.verifyingContract && {
            name: 'verifyingContract',
            type: 'address',
        },
        domain?.salt && { name: 'salt', type: 'bytes32' },
    ].filter(Boolean);
}
exports.getTypesForEIP712Domain = getTypesForEIP712Domain;
function domainSeparator({ domain }) {
    return (0, hashTypedData_js_1.hashDomain)({
        domain,
        types: {
            EIP712Domain: getTypesForEIP712Domain({ domain }),
        },
    });
}
exports.domainSeparator = domainSeparator;
//# sourceMappingURL=typedData.js.map

/***/ }),

/***/ 81488:
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.uid = void 0;
const size = 256;
let index = size;
let buffer;
function uid(length = 11) {
    if (!buffer || index + length > size * 2) {
        buffer = '';
        index = 0;
        for (let i = 0; i < size; i++) {
            buffer += ((256 + Math.random() * 256) | 0).toString(16).substring(1);
        }
    }
    return buffer.substring(index, index++ + length);
}
exports.uid = uid;
//# sourceMappingURL=uid.js.map

/***/ }),

/***/ 83032:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.formatEther = void 0;
const unit_js_1 = __webpack_require__(23098);
const formatUnits_js_1 = __webpack_require__(29339);
function formatEther(wei, unit = 'wei') {
    return (0, formatUnits_js_1.formatUnits)(wei, unit_js_1.etherUnits[unit]);
}
exports.formatEther = formatEther;
//# sourceMappingURL=formatEther.js.map

/***/ }),

/***/ 89978:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.formatGwei = void 0;
const unit_js_1 = __webpack_require__(23098);
const formatUnits_js_1 = __webpack_require__(29339);
function formatGwei(wei, unit = 'wei') {
    return (0, formatUnits_js_1.formatUnits)(wei, unit_js_1.gweiUnits[unit]);
}
exports.formatGwei = formatGwei;
//# sourceMappingURL=formatGwei.js.map

/***/ }),

/***/ 29339:
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.formatUnits = void 0;
function formatUnits(value, decimals) {
    let display = value.toString();
    const negative = display.startsWith('-');
    if (negative)
        display = display.slice(1);
    display = display.padStart(decimals, '0');
    let [integer, fraction] = [
        display.slice(0, display.length - decimals),
        display.slice(display.length - decimals),
    ];
    fraction = fraction.replace(/(0+)$/, '');
    return `${negative ? '-' : ''}${integer || '0'}${fraction ? `.${fraction}` : ''}`;
}
exports.formatUnits = formatUnits;
//# sourceMappingURL=formatUnits.js.map

/***/ }),

/***/ 8180:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.parseEther = void 0;
const unit_js_1 = __webpack_require__(23098);
const parseUnits_js_1 = __webpack_require__(70503);
function parseEther(ether, unit = 'wei') {
    return (0, parseUnits_js_1.parseUnits)(ether, unit_js_1.etherUnits[unit]);
}
exports.parseEther = parseEther;
//# sourceMappingURL=parseEther.js.map

/***/ }),

/***/ 10526:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.parseGwei = void 0;
const unit_js_1 = __webpack_require__(23098);
const parseUnits_js_1 = __webpack_require__(70503);
function parseGwei(ether, unit = 'wei') {
    return (0, parseUnits_js_1.parseUnits)(ether, unit_js_1.gweiUnits[unit]);
}
exports.parseGwei = parseGwei;
//# sourceMappingURL=parseGwei.js.map

/***/ }),

/***/ 70503:
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.parseUnits = void 0;
function parseUnits(value, decimals) {
    let [integer, fraction = '0'] = value.split('.');
    const negative = integer.startsWith('-');
    if (negative)
        integer = integer.slice(1);
    fraction = fraction.replace(/(0+)$/, '');
    if (decimals === 0) {
        if (Math.round(Number(`.${fraction}`)) === 1)
            integer = `${BigInt(integer) + 1n}`;
        fraction = '';
    }
    else if (fraction.length > decimals) {
        const [left, unit, right] = [
            fraction.slice(0, decimals - 1),
            fraction.slice(decimals - 1, decimals),
            fraction.slice(decimals),
        ];
        const rounded = Math.round(Number(`${unit}.${right}`));
        if (rounded > 9)
            fraction = `${BigInt(left) + BigInt(1)}0`.padStart(left.length + 1, '0');
        else
            fraction = `${left}${rounded}`;
        if (fraction.length > decimals) {
            fraction = fraction.slice(1);
            integer = `${BigInt(integer) + 1n}`;
        }
        fraction = fraction.slice(0, decimals);
    }
    else {
        fraction = fraction.padEnd(decimals, '0');
    }
    return BigInt(`${negative ? '-' : ''}${integer}${fraction}`);
}
exports.parseUnits = parseUnits;
//# sourceMappingURL=parseUnits.js.map

/***/ }),

/***/ 80433:
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.wait = void 0;
async function wait(time) {
    return new Promise((res) => setTimeout(res, time));
}
exports.wait = wait;
//# sourceMappingURL=wait.js.map

/***/ }),

/***/ 37030:
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

// ESM COMPAT FLAG
__webpack_require__.r(__webpack_exports__);

// EXPORTS
__webpack_require__.d(__webpack_exports__, {
  WebSocket: () => (/* binding */ native_WebSocket)
});

;// CONCATENATED MODULE: ./node_modules/.pnpm/isows@1.0.3_ws@8.13.0/node_modules/isows/_esm/utils.js
function getNativeWebSocket() {
    if (typeof WebSocket !== "undefined")
        return WebSocket;
    if (typeof global.WebSocket !== "undefined")
        return global.WebSocket;
    if (typeof window.WebSocket !== "undefined")
        return window.WebSocket;
    if (typeof self.WebSocket !== "undefined")
        return self.WebSocket;
    throw new Error("`WebSocket` is not supported in this environment");
}
//# sourceMappingURL=utils.js.map
;// CONCATENATED MODULE: ./node_modules/.pnpm/isows@1.0.3_ws@8.13.0/node_modules/isows/_esm/native.js

const native_WebSocket = getNativeWebSocket();
//# sourceMappingURL=native.js.map

/***/ }),

/***/ 27532:
/***/ ((module) => {

module.exports = /*#__PURE__*/JSON.parse('{"name":"@safe-global/safe-apps-sdk","version":"8.1.0","description":"SDK developed to integrate third-party apps with Safe app.","main":"dist/src/index.js","typings":"dist/src/index.d.ts","_files":["dist/**/*","src/**/*","CHANGELOG.md","README.md"],"sideEffects":false,"keywords":["Safe","sdk","apps"],"scripts":{"test":"jest","format-dist":"sed -i \'\' \'s/\\"files\\":/\\"_files\\":/\' dist/package.json","build":"yarn rimraf dist && tsc && yarn format-dist"},"author":"Safe (https://safe.global)","license":"MIT","dependencies":{"@safe-global/safe-gateway-typescript-sdk":"^3.5.3","viem":"^1.0.0"},"repository":{"type":"git","url":"git+https://github.com/safe-global/safe-apps-sdk.git"},"bugs":{"url":"https://github.com/safe-global/safe-apps-sdk/issues"},"homepage":"https://github.com/safe-global/safe-apps-sdk#readme","publishConfig":{"access":"public"}}');

/***/ })

}]);