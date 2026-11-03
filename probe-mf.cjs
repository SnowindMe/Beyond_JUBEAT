const { Miniflare } = require('miniflare');
(async () => {
  try {
    const mf = new Miniflare({ workers: [{ name: 'a', modules: true, script: 'export default { fetch(){ return new Response("ok") } };', modulesRoot: '.' }] });
    await mf.ready;
    const r = await mf.dispatchFetch('http://x/');
    console.log('ok', r.status);
    await mf.dispose();
  } catch (e) { console.log('FAIL', String(e).slice(0,300).replace(/\n/g,' ')); }
})();