const fs = require('fs');
const path = require('path');

const substProjectRoot = process.env.COMBIS_APK_SUBST_PROJECT_ROOT;

if (process.platform === 'win32' && substProjectRoot) {
  const normalizedRoot = path.resolve(substProjectRoot).toLowerCase();

  function shouldPreserve(target) {
    if (!target) {
      return false;
    }

    const resolved = path.resolve(String(target));
    if (!fs.existsSync(resolved)) {
      return false;
    }

    const normalized = resolved.toLowerCase();
    return normalized === normalizedRoot || normalized.startsWith(`${normalizedRoot}${path.sep}`);
  }

  function formatResult(target, options) {
    const result = path.resolve(String(target));
    const encoding = typeof options === 'string' ? options : options && options.encoding;
    return encoding === 'buffer' ? Buffer.from(result) : result;
  }

  const originalRealpath = fs.realpath.bind(fs);
  const originalRealpathSync = fs.realpathSync.bind(fs);
  const originalRealpathNative = fs.realpath.native && fs.realpath.native.bind(fs);
  const originalRealpathSyncNative = fs.realpathSync.native && fs.realpathSync.native.bind(fs);
  const originalPromisesRealpath = fs.promises.realpath.bind(fs.promises);

  fs.realpath = function patchedRealpath(target, options, callback) {
    const cb = typeof options === 'function' ? options : callback;
    const opts = typeof options === 'function' ? undefined : options;

    if (shouldPreserve(target)) {
      return cb ? process.nextTick(cb, null, formatResult(target, opts)) : formatResult(target, opts);
    }

    return cb ? originalRealpath(target, opts, cb) : originalRealpath(target, opts);
  };

  fs.realpathSync = function patchedRealpathSync(target, options) {
    return shouldPreserve(target)
      ? formatResult(target, options)
      : originalRealpathSync(target, options);
  };

  if (originalRealpathNative) {
    fs.realpath.native = function patchedRealpathNative(target, options, callback) {
      const cb = typeof options === 'function' ? options : callback;
      const opts = typeof options === 'function' ? undefined : options;

      if (shouldPreserve(target)) {
        return cb ? process.nextTick(cb, null, formatResult(target, opts)) : formatResult(target, opts);
      }

      return cb ? originalRealpathNative(target, opts, cb) : originalRealpathNative(target, opts);
    };
  }

  if (originalRealpathSyncNative) {
    fs.realpathSync.native = function patchedRealpathSyncNative(target, options) {
      return shouldPreserve(target)
        ? formatResult(target, options)
        : originalRealpathSyncNative(target, options);
    };
  }

  fs.promises.realpath = function patchedPromisesRealpath(target, options) {
    return shouldPreserve(target)
      ? Promise.resolve(formatResult(target, options))
      : originalPromisesRealpath(target, options);
  };
}
