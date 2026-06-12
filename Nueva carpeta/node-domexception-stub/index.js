// Map directly to node's native DOMException
const nativeDOMException = globalThis.DOMException;

module.exports = nativeDOMException;
module.exports.default = nativeDOMException;
// Also add custom export if imported as a named import
module.exports.DOMException = nativeDOMException;
