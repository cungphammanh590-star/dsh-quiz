import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import type { UserConfig } from 'tsdown'
import { transform } from 'lightningcss'

const host: UserConfig = {
  name: 'dsh-quiz', entry: ['src/index.ts'], outDir: 'lib', format: ['esm'],
  platform: 'node', target: 'es2022', fixedExtension: false, dts: false,
  clean: true, deps: { neverBundle: true },
}

const CSS_PREFIX = '\0dsh-quiz-css:'
const CSS_SUFFIX = '.mjs'
const client: UserConfig = {
  name: 'dsh-quiz/client', entry: { client: 'src/client/index.tsx' }, outDir: 'lib',
  format: 'cjs', fixedExtension: false, outExtensions: () => ({ js: '.js' }),
  platform: 'browser', target: 'es2022', dts: false, clean: false,
  deps: { neverBundle: [/^react(?:\/.*)?$/, /^react-dom(?:\/.*)?$/, /^@deepseek-ai\//] },
  plugins: [{
    name: 'dsh-quiz-css-modules',
    resolveId(source: string, importer: string | undefined) {
      if (!source.endsWith('.module.css')) return null
      return CSS_PREFIX + (importer === undefined ? source : resolve(dirname(importer), source)) + CSS_SUFFIX
    },
    async load(id: string) {
      if (!id.startsWith(CSS_PREFIX)) return null
      const filename = id.slice(CSS_PREFIX.length, -CSS_SUFFIX.length)
      this.addWatchFile(filename)
      const result = transform({ filename, code: await readFile(filename), cssModules: { pattern: 'dq_[hash]_[local]' }, minify: true })
      const classes = Object.fromEntries(Object.entries(result.exports ?? {}).map(([key, value]) => [key, value.name]))
      return [
        `const css=${JSON.stringify(result.code.toString())};`,
        'if(typeof document!=="undefined"&&!document.querySelector("style[data-plugin-css=dsh-quiz]")){',
        'const tag=document.createElement("style");tag.dataset.plugin="dsh-quiz";tag.dataset.pluginCss="dsh-quiz";tag.textContent=css;document.head.append(tag);}',
        `export default ${JSON.stringify(classes)};`,
      ].join('\n')
    },
  }],
  outputOptions: {
    banner: 'window.__ModuleLoader__.load({ id: "dsh-quiz", factory: (require) => {',
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
  },
}

export default [host, client]
