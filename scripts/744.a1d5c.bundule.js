"use strict";
(self["webpackChunkart_interface_v1"] = self["webpackChunkart_interface_v1"] || []).push([[744],{

/***/ 32744:
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {


// EXPORTS
__webpack_require__.d(__webpack_exports__, {
  offchainLookup: () => (/* binding */ offchainLookup),
  offchainLookupSignature: () => (/* binding */ offchainLookupSignature)
});

// UNUSED EXPORTS: ccipRequest, offchainLookupAbiItem

// EXTERNAL MODULE: ./node_modules/.pnpm/viem@2.13.3_typescript@5.4.5/node_modules/viem/_esm/actions/public/call.js + 2 modules
var call = __webpack_require__(9754);
// EXTERNAL MODULE: ./node_modules/.pnpm/viem@2.13.3_typescript@5.4.5/node_modules/viem/_esm/utils/stringify.js
var stringify = __webpack_require__(34547);
// EXTERNAL MODULE: ./node_modules/.pnpm/viem@2.13.3_typescript@5.4.5/node_modules/viem/_esm/errors/base.js
var base = __webpack_require__(14765);
// EXTERNAL MODULE: ./node_modules/.pnpm/viem@2.13.3_typescript@5.4.5/node_modules/viem/_esm/errors/utils.js + 1 modules
var utils = __webpack_require__(68842);
;// CONCATENATED MODULE: ./node_modules/.pnpm/viem@2.13.3_typescript@5.4.5/node_modules/viem/_esm/errors/ccip.js



class OffchainLookupError extends base/* BaseError */.C {
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
                    ...urls.map((url) => `    ${(0,utils/* getUrl */.ID)(url)}`),
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
class OffchainLookupResponseMalformedError extends base/* BaseError */.C {
    constructor({ result, url }) {
        super('Offchain gateway response is malformed. Response data must be a hex value.', {
            metaMessages: [
                `Gateway URL: ${(0,utils/* getUrl */.ID)(url)}`,
                `Response: ${(0,stringify/* stringify */.A)(result)}`,
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
class OffchainLookupSenderMismatchError extends base/* BaseError */.C {
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
//# sourceMappingURL=ccip.js.map
// EXTERNAL MODULE: ./node_modules/.pnpm/viem@2.13.3_typescript@5.4.5/node_modules/viem/_esm/errors/request.js
var request = __webpack_require__(13927);
// EXTERNAL MODULE: ./node_modules/.pnpm/viem@2.13.3_typescript@5.4.5/node_modules/viem/_esm/utils/abi/decodeErrorResult.js
var decodeErrorResult = __webpack_require__(49658);
// EXTERNAL MODULE: ./node_modules/.pnpm/viem@2.13.3_typescript@5.4.5/node_modules/viem/_esm/utils/abi/encodeAbiParameters.js
var encodeAbiParameters = __webpack_require__(21591);
// EXTERNAL MODULE: ./node_modules/.pnpm/viem@2.13.3_typescript@5.4.5/node_modules/viem/_esm/errors/address.js
var address = __webpack_require__(56430);
// EXTERNAL MODULE: ./node_modules/.pnpm/viem@2.13.3_typescript@5.4.5/node_modules/viem/_esm/utils/address/isAddress.js
var isAddress = __webpack_require__(77229);
;// CONCATENATED MODULE: ./node_modules/.pnpm/viem@2.13.3_typescript@5.4.5/node_modules/viem/_esm/utils/address/isAddressEqual.js


function isAddressEqual(a, b) {
    if (!(0,isAddress/* isAddress */.P)(a, { strict: false }))
        throw new address/* InvalidAddressError */.M({ address: a });
    if (!(0,isAddress/* isAddress */.P)(b, { strict: false }))
        throw new address/* InvalidAddressError */.M({ address: b });
    return a.toLowerCase() === b.toLowerCase();
}
//# sourceMappingURL=isAddressEqual.js.map
// EXTERNAL MODULE: ./node_modules/.pnpm/viem@2.13.3_typescript@5.4.5/node_modules/viem/_esm/utils/data/concat.js
var concat = __webpack_require__(77551);
// EXTERNAL MODULE: ./node_modules/.pnpm/viem@2.13.3_typescript@5.4.5/node_modules/viem/_esm/utils/data/isHex.js
var isHex = __webpack_require__(24006);
;// CONCATENATED MODULE: ./node_modules/.pnpm/viem@2.13.3_typescript@5.4.5/node_modules/viem/_esm/utils/ccip.js









const offchainLookupSignature = '0x556f1830';
const offchainLookupAbiItem = {
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
    const { args } = (0,decodeErrorResult/* decodeErrorResult */.W)({
        data,
        abi: [offchainLookupAbiItem],
    });
    const [sender, urls, callData, callbackSelector, extraData] = args;
    const { ccipRead } = client;
    const ccipRequest_ = ccipRead && typeof ccipRead?.request === 'function'
        ? ccipRead.request
        : ccipRequest;
    try {
        if (!isAddressEqual(to, sender))
            throw new OffchainLookupSenderMismatchError({ sender, to });
        const result = await ccipRequest_({ data: callData, sender, urls });
        const { data: data_ } = await (0,call/* call */.T)(client, {
            blockNumber,
            blockTag,
            data: (0,concat/* concat */.xW)([
                callbackSelector,
                (0,encodeAbiParameters/* encodeAbiParameters */.h)([{ type: 'bytes' }, { type: 'bytes' }], [result, extraData]),
            ]),
            to,
        });
        return data_;
    }
    catch (err) {
        throw new OffchainLookupError({
            callbackSelector,
            cause: err,
            data,
            extraData,
            sender,
            urls,
        });
    }
}
async function ccipRequest({ data, sender, urls, }) {
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
                error = new request/* HttpRequestError */.Ci({
                    body,
                    details: result?.error
                        ? (0,stringify/* stringify */.A)(result.error)
                        : response.statusText,
                    headers: response.headers,
                    status: response.status,
                    url,
                });
                continue;
            }
            if (!(0,isHex/* isHex */.q)(result)) {
                error = new OffchainLookupResponseMalformedError({
                    result,
                    url,
                });
                continue;
            }
            return result;
        }
        catch (err) {
            error = new request/* HttpRequestError */.Ci({
                body,
                details: err.message,
                url,
            });
        }
    }
    throw error;
}
//# sourceMappingURL=ccip.js.map

/***/ })

}]);