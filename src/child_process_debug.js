export async function resolve(specifier, ctx, next) {
  if (specifier === 'child_process') {
    return {
      url: 'data:child_process_wrapped',
      shortCircuit: true,
    };
  }
  return next(specifier, ctx);
}

export async function load(url, ctx, next) {
  if (url === 'data:child_process_wrapped') {
    return {
      format: 'module',
      source: `
        import * as cp from 'node:child_process';

        function wrap(name) {
          const orig = cp[name];
          if (typeof orig !== 'function') return orig;
          return (...args) => {
            console.log('[child_process.' + name + ']', args);
            return orig(...args);
          };
        }

        export const spawn = wrap('spawn');
        export const spawnSync = wrap('spawnSync');
        export const exec = wrap('exec');
        export const execSync = wrap('execSync');
        export const execFile = wrap('execFile');
        export const execFileSync = wrap('execFileSync');
        export const fork = wrap('fork');

        export default {
          spawn,
          spawnSync,
          exec,
          execSync,
          execFile,
          execFileSync,
          fork,
        };
      `,
      shortCircuit: true,
    };
  }
  return next(url, ctx);
}
