function registerAll(deps) {
  require('./window.js').register(deps);
  require('./audio.js').register(deps);
  require('./files.js').register(deps);
  require('./tags.js').register();
  require('./library.js').register(deps);
  require('./stats.js').register();
  require('./playlist.js').register();
  require('../utils/sleep-timer.js').register(deps);
}

module.exports = { registerAll };
