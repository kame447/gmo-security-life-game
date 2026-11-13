import { SaveStartupError } from './config.mjs';

/** Stop accepting first; Node close waits for active HTTP requests without cutting them. */
export async function listenSaveServer(server, config, { signals = process, dispose = async () => {} } = {}) {
  try {
    await new Promise((resolve, reject) => {
      const error = cause => {
        server.off('listening', ready);
        reject(new SaveStartupError(cause?.code === 'EADDRINUSE' ? 'ADDRESS_IN_USE' : 'LISTEN_FAILED'));
      };
      const ready = () => { server.off('error', error); resolve(); };
      // The listener registered here also catches synchronous listen failures below.
      server.once('error', error); server.once('listening', ready);
      try { server.listen(config.port, config.host); }
      catch { server.off('error', error); server.off('listening', ready); reject(new SaveStartupError('LISTEN_FAILED')); }
    });
  } catch (error) { throw error instanceof SaveStartupError ? error : new SaveStartupError('LISTEN_FAILED'); }
  const bound = server.address();
  let resolveClosed; let rejectClosed; let stopping;
  const closed = new Promise((resolve, reject) => { resolveClosed = resolve; rejectClosed = reject; });
  // Callers may explicitly await stop() later; never produce an unhandled rejection.
  void closed.catch(() => undefined);
  const signal = () => { void stop().catch(() => undefined); };
  const detach = () => { signals.off('SIGTERM', signal); signals.off('SIGINT', signal); };
  const stop = () => {
    if (stopping) return stopping;
    stopping = (async () => {
      try {
        await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
        await dispose();
        resolveClosed();
      } catch { const error = new SaveStartupError('STOP_FAILED'); rejectClosed(error); throw error; }
      finally { detach(); }
    })();
    return stopping;
  };
  signals.on('SIGTERM', signal); signals.on('SIGINT', signal);
  return { server, address: Object.freeze({ host: bound.address, port: bound.port }), closed, stop };
}
