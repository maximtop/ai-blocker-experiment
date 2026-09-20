import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';

const args = process.argv.slice(2);
const unknown = args.filter((argument) => !['chrome', '--watch', '--release'].includes(argument));
if (unknown.length || args.filter((argument) => argument === 'chrome').length > 1) {
    throw new Error('Unsupported target or option. Usage: pnpm build|start|release [chrome]');
}
const watch = args.includes('--watch');
const release = args.includes('--release');
if (watch && release) {
    throw new Error('Release packaging does not support watch mode.');
}

// Clean generated output before bundling so deleted assets cannot enter a package.
rmSync('dist', { recursive: true, force: true });
const result = spawnSync('pnpm', ['exec', 'rollup', '-c', ...(watch ? ['--watch'] : [])], {
    stdio: 'inherit',
});
if (result.error) {
    throw result.error;
}
process.exitCode = result.status ?? 1;
if (result.status === 0 && release) {
    const archive = spawnSync('zip', ['-r', 'extension.zip', '.', '-x', '*.DS_Store'], {
        cwd: 'dist',
        stdio: 'inherit',
    });
    if (archive.error) {
        throw archive.error;
    }
    process.exitCode = archive.status ?? 1;
}
