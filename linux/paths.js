// Where Mochiboard keeps things, following the XDG base directories.
//   boards, folders, media, usage:  $XDG_DATA_HOME/mochiboard   (~/.local/share/mochiboard)
//   the speech model:               $XDG_DATA_HOME/mochiboard/whisper
// The folder layout inside is the same as the Mac app's (~/Library/Application Support/Mochiboard),
// so boards copied over from a Mac just work.
const os = require('os'), path = require('path');

const xdg = (v, fallback) => process.env[v] || path.join(os.homedir(), fallback);
const support = path.join(xdg('XDG_DATA_HOME', '.local/share'), 'mochiboard');

module.exports = {
  support,
  boardsDir: path.join(support, 'boards'),
  mediaDir: path.join(support, 'media'),
  usageFile: path.join(support, 'usage.json'),
  foldersFile: path.join(support, 'folders.json'),
  windowFile: path.join(support, 'window.json'),
  pendingDir: path.join(support, 'pending-update'),
  whisperDir: path.join(support, 'whisper'),
  updateLog: path.join(support, 'update.log'),
  web: path.join(__dirname, '..', 'web'),
};
