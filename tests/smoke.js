// End-to-end smoke test: opens the real app (under Xvfb in CI) with a throwaway data folder, and drives the bridge.
//   xvfb-run -a node tests/smoke.js
const { _electron: electron } = require('playwright');
const fs = require('fs'), os = require('os'), path = require('path');

(async () => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'mb-smoke-')), out = path.join(data, 'out');
  fs.mkdirSync(out);
  // stand-ins for Claude Code and whisper.cpp, found where the real ones usually live (~/.local/bin)
  const bin = path.join(data, '.local/bin'); fs.mkdirSync(bin, { recursive: true });
  fs.writeFileSync(path.join(bin, 'claude'), `#!/bin/sh
if [ "$1" = mcp ]; then echo "claude.ai Mobbin: https://mobbin - ✓ Connected"; echo "claude.ai higgsfield: https://h - ! Needs authentication"; exit 0; fi
printf '%s' "$2" > "${data}/prompt.txt"; echo "$@" > "${data}/args.txt"
echo '{"type":"result","is_error":false,"result":"{\\"say\\": \\"hi from fake claude\\"}","usage":{"input_tokens":10,"cache_read_input_tokens":5,"output_tokens":3},"total_cost_usd":0.01}'
`, { mode: 0o755 });
  fs.writeFileSync(path.join(bin, 'whisper-cli'), `#!/bin/sh
for a; do case "$a" in *.wav) head -c 4 "$a" > "${data}/wav-magic.txt";; esac; done
echo " [BLANK_AUDIO] hello from whisper"
`, { mode: 0o755 });
  fs.writeFileSync(path.join(data, 'model.bin'), 'x');
  const app = await electron.launch({ args: [path.join(__dirname, '..'), '--no-sandbox'], env: { ...process.env, XDG_DATA_HOME: data, HOME: data, MB_WHISPER_MODEL: path.join(data, 'model.bin') } });
  // save dialogs answer themselves: everything lands in out/
  await app.evaluate(({ dialog }, out) => { dialog.showSaveDialog = async (w, o) => ({ canceled: false, filePath: out + '/' + o.defaultPath.split('/').pop() }); }, out);
  const page = await app.firstWindow(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => m.type() === 'error' && errors.push(m.text()));
  await page.waitForFunction(() => window.MB && document.querySelector('#side'));
  await page.waitForTimeout(2000);
  const r = await page.evaluate(async () => {
    const res = { native: MB.native, linux: document.documentElement.classList.contains('linux') };
    const board = { id: 'smoke1', name: 'Smoke', color: 'mint', cards: [{ id: 'c1', type: 'note', x: 0, y: 0, w: 220, h: 140, text: 'hi', bad: NaN }] };
    res.save = await MB.save(board);
    res.load = (await MB.load('smoke1')).cards[0].bad;
    res.list = (await MB.list()).some(b => b.id === 'smoke1');
    res.folders = await MB.saveFolders([{ id: 'f', name: 'F' }]) && (await MB.folders()).length;
    res.fonts = (await MB.fonts()).length;
    res.version = await MB.version();
    res.usage = typeof (await MB.usage()).today.asks;
    res.speech = await MB.speechAuth();
    res.unknown = await new Promise(r => { const id = 999999; const o = window.__mbReply; window.__mbReply = (i, ok, v) => { if (i === id) { window.__mbReply = o; r(v); } else o(i, ok, v); }; window.webkit.messageHandlers.mb.postMessage({ id, op: 'nope', args: {} }); });
    // a video goes in by chunks and comes back through mbmedia:// with byte ranges
    const blob = new Blob([new Uint8Array(5000).fill(7)], { type: 'video/mp4' });
    const src = await MB.saveMedia(blob); res.media = src;
    const part = await fetch(src, { headers: { Range: 'bytes=100-199' } }); res.range = [part.status, (await part.arrayBuffer()).byteLength];
    res.png = await MB.exportRect({ x: 0, y: 0, w: 300, h: 200, name: 'shot', pdf: false, scale: 2 });
    res.pdf = await MB.exportRect({ x: 0, y: 0, w: 300, h: 200, name: 'shot', pdf: true, scale: 2 });
    res.docx = await MB.saveFile(btoa('hello'), 'Doc', 'docx');
    res.docPDF = await MB.docPDF('<!doctype html><link rel="stylesheet" href="__WEB__/fonts.css"><h1 style="font-family:DM Sans">Hello</h1><p>' + 'words '.repeat(2000) + '</p>', 'Doc', 'a4');
    res.conn = await MB.connections();
    res.ask = await MB.ask('sort these', { cards: [], n: Infinity }, false, { mobbin: true, higgs: false });
    res.usage2 = (await MB.usage()).today;
    // a real webm voice memo, recorded from a tone, goes through the WAV conversion
    const ac = new AudioContext(), osc = ac.createOscillator(), dst = ac.createMediaStreamDestination(); osc.connect(dst); osc.start();
    const rec = new MediaRecorder(dst.stream), chunks = []; rec.ondataavailable = e => chunks.push(e.data);
    await new Promise(r => { rec.onstop = r; rec.start(); setTimeout(() => rec.stop(), 600); });
    const memo = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(new Blob(chunks, { type: rec.mimeType })); });
    res.memoType = rec.mimeType; res.speech2 = await MB.speechAuth(); res.transcribe = await MB.transcribe(memo);
    return res;
  });
  r.prompt = fs.readFileSync(path.join(data, 'prompt.txt'), 'utf8'); r.args = fs.readFileSync(path.join(data, 'args.txt'), 'utf8').slice(-120); r.wav = fs.readFileSync(path.join(data, 'wav-magic.txt'), 'utf8');
  await page.screenshot({ path: path.join(out, 'window.png') });
  const files = fs.readdirSync(out);
  const png = fs.readFileSync(path.join(out, 'shot.png'));
  r.pngSize = [png.readUInt32BE(16), png.readUInt32BE(20)];
  r.pdfPages = (fs.readFileSync(path.join(out, 'Doc.pdf'), 'latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
  r.files = files; r.errors = errors; r.boardOnDisk = fs.existsSync(path.join(data, 'mochiboard/boards/smoke1.json'));
  console.log(JSON.stringify({ ...r, prompt: r.prompt.slice(0, 120) + '…' }, null, 1));
  await app.close();
  const ok = r.native && r.linux && r.save && r.load === 0 && r.list && r.folders === 1 && r.fonts > 0 && r.unknown === 'unknown op nope' && r.range[0] === 206 && r.range[1] === 100
    && r.pngSize[0] === 600 && r.pdfPages >= 2 && files.includes('shot.pdf') && files.includes('Doc.docx') && r.boardOnDisk && !errors.length
    && r.conn.mobbin === true && r.conn.higgsfield === false && JSON.parse(r.ask).say === 'hi from fake claude' && r.usage2.asks === 1 && r.usage2.tokensIn === 15
    && r.prompt.includes('The person asked you: sort these') && r.prompt.includes('"n":0') && r.prompt.includes('Higgsfield is TURNED OFF') && r.args.includes('mcp__claude_ai_Mobbin__search_screens')
    && r.wav === 'RIFF' && r.transcribe === 'hello from whisper';
  if (process.env.KEEP) console.log('output in', out); else fs.rmSync(data, { recursive: true, force: true });
  console.log(ok ? 'SMOKE OK' : 'SMOKE FAILED'); process.exit(ok ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
